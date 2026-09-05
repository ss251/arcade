import { Data, Effect, Schedule } from "effect"
import { createPublicClient, createWalletClient, formatUnits, http, isAddress, parseEventLogs, zeroAddress, type Log } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { IDENTITY_REGISTRY_ABI, loadChainConfig, RECEIPT_POLL_INTERVAL_MS, toViemChain } from "@arcade/core"

export class UnfundedSeller extends Data.TaggedError("UnfundedSeller")<{
  readonly address: string
  readonly balanceWei: bigint
}> {}

export class IdentityFailed extends Data.TaggedError("IdentityFailed")<{
  readonly op: string
  readonly reason: string
  /** Public recovery evidence only; never a key, RPC response, or raw signed transaction. */
  readonly txHash?: string
  readonly broadcast?: "not-sent" | "unknown" | "submitted"
  readonly phase?: "preflight" | "broadcast" | "journal" | "receipt" | "reverted" | "logs" | "ownership" | "uri"
}> {}

export interface IdentityClient {
  readonly address: string
  getBalance(a: { address: string }): Promise<bigint>
  writeContract(args: unknown): Promise<string>
  getTransactionReceipt(a: { hash: string }): Promise<{ status: string; logs: ReadonlyArray<unknown> }>
  readContract(args: unknown): Promise<unknown>
}

/** 0.05 native USDC, in 18-decimal gas units. This is a preflight threshold, not a gas guarantee. */
export const MIN_GAS_WEI = 50_000_000_000_000_000n

const addressOk = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && isAddress(value, { strict: false }) && value.toLowerCase() !== zeroAddress
const hashOk = (value: unknown): value is `0x${string}` => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

// Only diagnostics constructed here may cross a client boundary unchanged. An injected
// client/RPC can throw arbitrary error objects, including our exported error class.
const safeFailures = new WeakSet<IdentityFailed>()
const failed = (data: ConstructorParameters<typeof IdentityFailed>[0]): IdentityFailed => {
  const error = new IdentityFailed(data)
  safeFailures.add(error)
  return error
}
const preflightFailure = (op: string, reason: string) => failed({ op, reason, phase: "preflight", broadcast: "not-sent" })
const submittedFailure = (op: string, txHash: string, phase: IdentityFailed["phase"], reason: string) =>
  failed({ op, reason, txHash, broadcast: "submitted", ...(phase === undefined ? {} : { phase }) })

/** An unavailable/invalid balance is unknown, never evidence that this seller is funded. */
export const gasCheck = (client: IdentityClient, address: string): Effect.Effect<void, UnfundedSeller | IdentityFailed> =>
  Effect.gen(function* () {
    if (!addressOk(address)) return yield* preflightFailure("getBalance", "The seller address is invalid.")
    const balanceWei = yield* Effect.tryPromise({
      try: () => client.getBalance({ address }),
      catch: () => preflightFailure("getBalance", "Could not read the seller's native gas balance. Nothing was broadcast.")
    })
    if (typeof balanceWei !== "bigint" || balanceWei < 0n) {
      return yield* preflightFailure("getBalance", "The RPC returned an invalid native gas balance. Nothing was broadcast.")
    }
    if (balanceWei < MIN_GAS_WEI) return yield* new UnfundedSeller({ address, balanceWei })
  })

/**
 * Extract one unambiguous mint for this owner from this registry, never an ordinary
 * transfer or another contract's matching event. The optional third argument retains
 * the original two-argument API while registerAgent always supplies its exact registry.
 */
export const agentIdFromLogs = (logs: ReadonlyArray<unknown>, owner: string, registry?: string): string | undefined => {
  try {
    const emitter = registry ?? loadChainConfig().erc8004?.identity
    if (!addressOk(owner) || !addressOk(emitter) || !Array.isArray(logs)) return undefined
    const candidates = logs.filter((log): log is Log => {
      if (log === null || typeof log !== "object") return false
      const row = log as Record<string, unknown>
      return typeof row["address"] === "string" && sameAddress(row["address"], emitter) && row["removed"] !== true &&
        typeof row["data"] === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(row["data"]) &&
        Array.isArray(row["topics"]) && row["topics"].every((topic: unknown) => hashOk(topic))
    }).map((log) => ({ address: log.address, topics: log.topics, data: log.data }) as Log)
    // parseEventLogs preserves input fields, including an untrusted `args` decoration.
    // Give it bytes only, so a forged decoded owner/id cannot override ABI decoding.
    const ids = new Set<string>()
    for (const log of parseEventLogs({ abi: IDENTITY_REGISTRY_ABI, eventName: "Registered", logs: candidates, strict: true })) {
      if (sameAddress(log.args.owner, owner)) ids.add(String(log.args.agentId))
    }
    for (const log of parseEventLogs({ abi: IDENTITY_REGISTRY_ABI, eventName: "Transfer", logs: candidates, strict: true })) {
      if (sameAddress(log.args.from, zeroAddress) && sameAddress(log.args.to, owner)) ids.add(String(log.args.tokenId))
    }
    return ids.size === 1 ? ids.values().next().value : undefined
  } catch {
    // Opaque/malformed receipt data is not a mint proof and must not escape as a defect.
    return undefined
  }
}

const awaitReceipt = (client: IdentityClient, op: string, hash: string) =>
  Effect.tryPromise({
    try: () => client.getTransactionReceipt({ hash }),
    catch: () => submittedFailure(op, hash, "receipt", "Could not confirm this transaction. Resume its known hash; do not broadcast another registration.")
  }).pipe(
    // Five single reads at 0, 1.5, 4.5, 10.5, and 22.5 seconds (plus request time).
    // No nested transport retries and no unbounded public-RPC polling.
    Effect.retry({ schedule: Schedule.exponential(RECEIPT_POLL_INTERVAL_MS).pipe(Schedule.intersect(Schedule.recurs(4))) }),
    Effect.flatMap((receipt) => {
      if (receipt?.status === "reverted") return Effect.fail(submittedFailure(op, hash, "reverted", "The transaction was confirmed reverted."))
      if (receipt?.status !== "success" || !Array.isArray(receipt.logs)) {
        return Effect.fail(submittedFailure(op, hash, "receipt", "The receipt does not prove successful confirmation. Resume its known hash; do not broadcast again."))
      }
      return Effect.succeed(receipt)
    })
  )

const broadcast = (client: IdentityClient, op: string, args: unknown, onBroadcast?: (txHash: string) => void | Promise<void>) =>
  // Once sending begins, do not interrupt the public-hash journal handoff. Receipt polling
  // outside this boundary is interruptible. The real transport has a bounded timeout.
  Effect.uninterruptible(Effect.gen(function* () {
    const hash = yield* Effect.tryPromise({
      try: () => client.writeContract(args),
      catch: (error) => error instanceof IdentityFailed && safeFailures.has(error) ? error : failed({
        op, phase: "broadcast", broadcast: "unknown",
        reason: "The broadcast outcome is unknown. Do not automatically retry; reconcile this transaction before registering again."
      })
    })
    if (!hashOk(hash)) return yield* failed({ op, phase: "broadcast", broadcast: "unknown",
      reason: "The RPC did not return a valid transaction hash. Do not retry the broadcast automatically." })
    if (onBroadcast !== undefined) {
      yield* Effect.tryPromise({
        try: async () => { await onBroadcast(hash) },
        catch: () => submittedFailure(op, hash, "journal", "The transaction was broadcast but its local journal could not be saved. Preserve this hash and resume it; do not register again.")
      })
    }
    return hash
  }))

export const registerAgent = (a: {
  client: IdentityClient
  registry: string
  agentURI: string
  /** Called exactly once after a new broadcast, before polling. Must durably save the public hash. */
  onBroadcast?: (txHash: string) => void | Promise<void>
  /** Reconcile a journaled transaction without gas checks, another send, or another callback. */
  resumeTxHash?: string
}): Effect.Effect<{ agentId: string; txHash: string }, IdentityFailed | UnfundedSeller> =>
  Effect.gen(function* () {
    if (!addressOk(a.client.address) || !addressOk(a.registry) || typeof a.agentURI !== "string" || !a.agentURI.trim()) {
      return yield* preflightFailure("register", "Registration requires a valid seller, registry, and nonempty public agent URI.")
    }
    let txHash: string
    if (a.resumeTxHash !== undefined) {
      if (!hashOk(a.resumeTxHash)) return yield* preflightFailure("register", "The registration resume hash is invalid. Nothing was broadcast.")
      txHash = a.resumeTxHash
    } else {
      yield* gasCheck(a.client, a.client.address)
      txHash = yield* broadcast(a.client, "register", {
        address: a.registry, abi: IDENTITY_REGISTRY_ABI, functionName: "register", args: [a.agentURI]
      }, a.onBroadcast)
    }
    const receipt = yield* awaitReceipt(a.client, "register", txHash)
    const agentId = agentIdFromLogs(receipt.logs, a.client.address, a.registry)
    if (agentId === undefined) {
      return yield* submittedFailure("register", txHash, "logs", "The confirmed receipt has no unambiguous registry mint for this seller. Preserve the hash; do not register again.")
    }
    const owner = yield* Effect.tryPromise({
      try: () => a.client.readContract({ address: a.registry, abi: IDENTITY_REGISTRY_ABI, functionName: "ownerOf", args: [BigInt(agentId)] }),
      catch: () => submittedFailure("register", txHash, "ownership", "Could not verify the confirmed agent's current owner. Resume the known hash; do not register again.")
    })
    if (!addressOk(owner) || !sameAddress(owner, a.client.address)) {
      return yield* submittedFailure("register", txHash, "ownership", "The confirmed agent is not verified as owned by this seller. Nothing further was broadcast.")
    }
    const tokenURI = yield* Effect.tryPromise({
      try: () => a.client.readContract({ address: a.registry, abi: IDENTITY_REGISTRY_ABI, functionName: "tokenURI", args: [BigInt(agentId)] }),
      catch: () => submittedFailure("register", txHash, "uri", "Could not verify the confirmed agent's public URI. Resume the known hash; do not register again.")
    })
    if (tokenURI !== a.agentURI) {
      return yield* submittedFailure("register", txHash, "uri", "The confirmed agent's public URI does not match this registration. Do not adopt it for another skill.")
    }
    return { agentId, txHash }
  })

/**
 * ERC-721 approval grants transfer authority over ALL current and future identity NFTs
 * this seller owns in the registry. It is not restricted to ARCADE validation requests.
 * The CLI must explain that full scope before invoking this function.
 */
export const approveOperator = (a: { client: IdentityClient; registry: string; operator: string }):
  Effect.Effect<{ txHash: string; alreadyApproved: boolean }, IdentityFailed> =>
  Effect.gen(function* () {
    if (!addressOk(a.client.address) || !addressOk(a.registry) || !addressOk(a.operator) || sameAddress(a.operator, a.client.address)) {
      return yield* preflightFailure("setApprovalForAll", "Approval requires a valid registry and a nonzero operator distinct from this seller.")
    }
    const already = yield* Effect.tryPromise({
      try: () => a.client.readContract({ address: a.registry, abi: IDENTITY_REGISTRY_ABI, functionName: "isApprovedForAll", args: [a.client.address, a.operator] }),
      catch: () => preflightFailure("isApprovedForAll", "Could not read the operator approval. Nothing was broadcast.")
    })
    if (typeof already !== "boolean") return yield* preflightFailure("isApprovedForAll", "The RPC returned an invalid operator approval. Nothing was broadcast.")
    if (already) return { txHash: "", alreadyApproved: true }
    const txHash = yield* broadcast(a.client, "setApprovalForAll", {
      address: a.registry, abi: IDENTITY_REGISTRY_ABI, functionName: "setApprovalForAll", args: [a.operator, true]
    })
    yield* awaitReceipt(a.client, "setApprovalForAll", txHash)
    return { txHash, alreadyApproved: false }
  })

/** The seller's key remains inside the local account closure, never in configuration or errors. */
export const makeViemIdentityClient = (a: { privateKey: string; rpcUrl?: string }): IdentityClient => {
  let config: ReturnType<typeof loadChainConfig>
  try { config = loadChainConfig() }
  catch { throw preflightFailure("client", "The selected chain configuration is invalid.") }
  if (config.id !== "arc-testnet" || config.status !== "ready" || config.erc8004 === undefined || config.rpcHttp.length === 0) {
    throw preflightFailure("client", "Seller identity writes require a ready Arc testnet configuration. Mainnet identity writes are disabled.")
  }
  let account: ReturnType<typeof privateKeyToAccount>
  try {
    const key = a.privateKey.startsWith("0x") ? a.privateKey : `0x${a.privateKey}`
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error()
    account = privateKeyToAccount(key as `0x${string}`)
  } catch { throw preflightFailure("client", "The seller signing key is invalid.") }
  const chain = toViemChain(config)
  let rpcUrl: string
  try {
    const url = new URL(a.rpcUrl ?? config.rpcHttp[0]!)
    if (url.protocol !== "https:" || url.username || url.password) throw new Error()
    rpcUrl = url.href
  } catch { throw preflightFailure("client", "Identity RPC must use HTTPS without inline credentials.") }
  const transport = http(rpcUrl, { retryCount: 0, timeout: 10_000, fetchOptions: { redirect: "error" } })
  const pub = createPublicClient({ chain, transport })
  const wallet = createWalletClient({ account, chain, transport })
  const assertChain = async () => {
    let chainId: number
    try { chainId = await pub.getChainId() }
    catch { throw preflightFailure("chainId", "Could not verify the identity RPC network. Nothing was broadcast.") }
    if (chainId !== config.chainId) throw preflightFailure("chainId", "The identity RPC network does not match the selected Arc testnet configuration. Nothing was broadcast.")
  }
  return {
    address: account.address,
    getBalance: async ({ address }) => {
      await assertChain()
      try { return await pub.getBalance({ address: address as `0x${string}` }) }
      catch { throw preflightFailure("getBalance", "Could not read the seller's native gas balance. Nothing was broadcast.") }
    },
    writeContract: async (args) => {
      // Validate the network BEFORE wallet nonce/fee estimation or signing, on every write.
      await assertChain()
      try { return await wallet.writeContract({ ...(args as Parameters<typeof wallet.writeContract>[0]), account, chain }) }
      catch { throw failed({ op: "writeContract", phase: "broadcast", broadcast: "unknown",
        reason: "The broadcast outcome is unknown. Do not automatically retry; reconcile this transaction before registering again." }) }
    },
    getTransactionReceipt: async ({ hash }) => {
      if (!hashOk(hash)) throw preflightFailure("getTransactionReceipt", "The transaction hash is invalid.")
      let receipt: Awaited<ReturnType<typeof pub.getTransactionReceipt>>
      try { receipt = await pub.getTransactionReceipt({ hash }) }
      catch { throw submittedFailure("getTransactionReceipt", hash, "receipt", "Could not read the transaction receipt. Resume its known hash; do not broadcast again.") }
      if (!hashOk(receipt.transactionHash) || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
        throw submittedFailure("getTransactionReceipt", hash, "receipt", "The RPC returned a receipt for a different transaction. Do not treat it as confirmation.")
      }
      return { status: receipt.status, logs: receipt.logs }
    },
    readContract: async (args) => {
      await assertChain()
      try { return await pub.readContract(args as Parameters<typeof pub.readContract>[0]) }
      catch { throw preflightFailure("readContract", "Could not read the identity contract. No transaction was sent by this read.") }
    }
  }
}

export interface HubErc8004 {
  readonly armed: boolean
  readonly registries?: { identity: string; reputation: string; validation: string }
  readonly operator?: string
  readonly validator?: string
  readonly attester?: string
  readonly caip2?: string
}

/** Only own data fields from a JSON document count; prototype/getter claims do not. */
const ownValue = (value: object, name: string): unknown => Object.getOwnPropertyDescriptor(value, name)?.value

export const hubErc8004Refusal = (h: unknown, hubUrl: string): string | undefined => {
  let label = "The configured hub"
  try { label = new URL(hubUrl).origin } catch { /* Never echo an invalid URL or credentials. */ }
  try {
    if (h === null || typeof h !== "object" || Array.isArray(h) || typeof ownValue(h, "armed") !== "boolean") {
      return `${label} did not answer with an ERC-8004 document.`
    }
    if (ownValue(h, "armed") !== true) return `${label} reports ERC-8004 unarmed. Nothing has been registered or approved.`
    const roles = ["operator", "validator", "attester"] as const
    const addresses: string[] = []
    for (const role of roles) {
      const address = ownValue(h, role)
      if (!addressOk(address)) return `${label} named no valid nonzero ERC-8004 ${role} address.`
      addresses.push(address.toLowerCase())
    }
    if (new Set(addresses).size !== roles.length) return `${label} must use distinct operator, validator, and attester addresses.`
    const config = loadChainConfig()
    if (config.id !== "arc-testnet" || config.status !== "ready" || config.erc8004 === undefined) {
      return "ERC-8004 registration requires ready Arc testnet configuration; mainnet/pending networks are disabled."
    }
    if (ownValue(h, "caip2") !== config.caip2) return `${label} reported a different ERC-8004 chain/network.`
    if (Object.hasOwn(h, "chainId") && (!Number.isSafeInteger(ownValue(h, "chainId")) || ownValue(h, "chainId") !== config.chainId)) {
      return `${label} reported an invalid or contradictory numeric ERC-8004 chain id.`
    }
    const registries = ownValue(h, "registries")
    if (registries === null || typeof registries !== "object" || Array.isArray(registries)) return `${label} named no ERC-8004 registries.`
    for (const registry of ["identity", "reputation", "validation"] as const) {
      const address = ownValue(registries, registry)
      if (!addressOk(address) || !sameAddress(address, config.erc8004[registry])) {
        return `${label} does not use the pinned Arc testnet ${registry} registry.`
      }
    }
    return undefined
  } catch { return "Could not validate the hub's ERC-8004 document against the selected chain configuration." }
}

export const skillRefusal = (skillId: string, known: ReadonlyArray<string>): string | undefined =>
  known.includes(skillId) ? undefined :
    `No skill "${skillId.replace(/[\x00-\x1f\x7f]/g, "?").slice(0, 128)}" on this machine.\nAvailable: ${known.length ? known.join(", ") : "(none — check --skills)"}`

export const unfundedMessage = (e: UnfundedSeller, faucet: string): string =>
  `${e.address} is below the registration gas preflight threshold.\n` +
  `  balance    ${formatUnits(e.balanceWei, 18)} USDC\n` +
  `  threshold  ${formatUnits(MIN_GAS_WEI, 18)} USDC (a preflight threshold, not a guarantee of total transaction cost)\n` +
  `Gas on Arc is USDC, the same token as earnings, measured here in 18-decimal native units.\n` +
  `If needed, fund this seller with testnet USDC: ${faucet}\nNothing was broadcast by this attempt.`
