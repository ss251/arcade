import { Cause, Context, Data, Effect, Layer, Schema } from "effect"
import { createPublicClient, createWalletClient, http, type Abi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ARCADE_FEEDBACK_TAG1, ARCADE_VALIDATION_TAG, IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI, RECEIPT_POLL_INTERVAL_MS, loadChainConfig, toViemChain,
  AgentAnnouncement, MAX_AGENT_ANNOUNCEMENTS } from "@arcade/core"

/** No provider cause is carried here: it can contain credentials or private RPC URLs. */
export class Erc8004Failed extends Data.TaggedError("Erc8004Failed")<{
  readonly op: string
  readonly reason: string
  /** False after any possibly successful broadcast; a queue must not submit it again. */
  readonly retryable?: boolean
}> {}
export interface Erc8004Wallet { readonly address: string; writeContract(args: unknown): Promise<string> }
export interface Erc8004Reader { readContract(args: unknown): Promise<unknown> }
export interface AgentEvidence {
  readonly validationPasses: number
  /** Our tagged, answered requests among the most recent twenty unique requests. */
  readonly validationsRead: number
  readonly settlementFeedback: number
  readonly stale: boolean
}
type Registries = { readonly identity: string; readonly reputation: string; readonly validation: string }
type Addresses = { readonly operator: string; readonly validator: string; readonly attester: string }
export interface Erc8004 {
  readonly armed: boolean
  readonly addresses: Addresses
  readonly registries: Registries
  readonly ownerOf: (agentId: string) => Effect.Effect<string, Erc8004Failed>
  readonly requestValidation: (a: { agentId: string; requestURI: string; requestHash: string }) => Effect.Effect<string, Erc8004Failed>
  readonly respondValidation: (a: { requestHash: string; response: number; responseURI: string; responseHash: string }) => Effect.Effect<string, Erc8004Failed>
  readonly giveFeedback: (a: { agentId: string; skillId: string; endpoint: string; feedbackURI: string; feedbackHash: string }) => Effect.Effect<string, Erc8004Failed>
  readonly evidenceFor: (agentId: string) => Effect.Effect<AgentEvidence>
}
export class Erc8004Tag extends Context.Tag("@arcade/hub/Erc8004")<Erc8004Tag, Erc8004>() {}

const address = (a: unknown): a is `0x${string}` => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/i.test(a)
const hash = (a: unknown): a is `0x${string}` => typeof a === "string" && /^0x[0-9a-fA-F]{64}$/.test(a)
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
const idIsValid = (id: string): boolean => typeof id === "string" && /^(0|[1-9][0-9]{0,77})$/.test(id) && BigInt(id) < 2n ** 256n
const uri = (u: string): boolean => {
  try { const parsed = new URL(u); return u.length <= 4096 && ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password } catch { return false }
}
const failure = (op: string, reason: string, retryable = false) => new Erc8004Failed({ op, reason, retryable })
const stale = (): AgentEvidence => ({ validationPasses: 0, validationsRead: 0, settlementFeedback: 0, stale: true })
const log = (message: string): void => { try { console.warn(`[hub] ${message}`) } catch { /* Feature diagnostics cannot stop settlement. */ } }

export const keyRoleRefusal = (a: Addresses): string | undefined => {
  if (!Object.values(a).every(address)) return "ERC-8004 roles require valid nonzero addresses"
  if (same(a.attester, a.operator)) return "ERC-8004 attester must differ from operator"
  if (same(a.attester, a.validator)) return "ERC-8004 attester must differ from validator"
  if (same(a.operator, a.validator)) return "ERC-8004 operator must differ from validator"
  return undefined
}
export const noopErc8004 = (reason: string): Erc8004 => ({
  armed: false, addresses: { operator: "", validator: "", attester: "" }, registries: { identity: "", reputation: "", validation: "" },
  ownerOf: () => failure("ownerOf", reason), requestValidation: () => failure("validationRequest", reason),
  respondValidation: () => failure("validationResponse", reason), giveFeedback: () => failure("giveFeedback", reason),
  evidenceFor: () => Effect.succeed(stale())
})

/** Bound even injected clients; production HTTP also aborts its own transport at this limit. */
const bounded = <A>(action: () => Promise<A>, ms: number): Promise<A> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(failure("rpc", "RPC deadline exceeded")), ms)
  Promise.resolve().then(action).then(resolve, reject).finally(() => clearTimeout(timer))
})
export interface MakeErc8004 {
  readonly registries: Registries
  readonly chainId: number
  readonly reader: Erc8004Reader
  readonly operator: Erc8004Wallet
  readonly validator: Erc8004Wallet
  readonly attester: Erc8004Wallet
  readonly nowMs?: () => number
  readonly readTimeoutMs?: number
}

export const makeErc8004 = (cfg: MakeErc8004): Erc8004 => {
  const addresses = { operator: cfg.operator.address, validator: cfg.validator.address, attester: cfg.attester.address }
  const refusal = keyRoleRefusal(addresses)
  if (refusal || !Object.values(cfg.registries).every(address) || cfg.chainId !== loadChainConfig("arc-testnet").chainId) return noopErc8004(refusal ?? "ERC-8004 requires configured Arc testnet registries")
  const now = cfg.nowMs ?? Date.now
  const readTimeout = cfg.readTimeoutMs ?? 5000
  if (!Number.isSafeInteger(readTimeout) || readTimeout <= 0 || readTimeout > 30_000) return noopErc8004("invalid ERC-8004 read timeout")
  const read = (op: string, contract: string, abi: unknown, args: unknown[]) => Effect.tryPromise({
    try: () => bounded(() => cfg.reader.readContract({ address: contract, abi, functionName: op, args }), readTimeout),
    catch: () => failure(op, "registry could not be read")
  })
  const write = (op: string, wallet: Erc8004Wallet, contract: string, abi: unknown, args: unknown[]) => Effect.tryPromise({
    try: async () => {
      const tx = await wallet.writeContract({ address: contract, abi, functionName: op, args })
      if (!hash(tx)) throw failure(op, "registry returned an invalid transaction hash")
      return tx
    },
    // A thrown send can mean the RPC accepted it but lost the reply. Never automatically
    // repeat a write here, and tell the queue that this operation cannot safely be retried.
    catch: () => failure(op, "registry write did not confirm; inspect chain before retrying")
  })
  const evidenceRead = (agentId: string) => Effect.gen(function* () {
    const rawHashes = yield* read("getAgentValidations", cfg.registries.validation, VALIDATION_REGISTRY_ABI, [BigInt(agentId)])
    if (!Array.isArray(rawHashes) || rawHashes.length > 4096 || !rawHashes.every(hash)) return stale()
    const recent = [...new Set((rawHashes as string[]).map(h => h.toLowerCase()))].slice(-20)
    let validationPasses = 0, validationsRead = 0
    for (const request of recent) {
      const st = yield* read("getValidationStatus", cfg.registries.validation, VALIDATION_REGISTRY_ABI, [request])
      if (!Array.isArray(st) || st.length !== 6 || !address(st[0]) || typeof st[1] !== "bigint" ||
        !Number.isInteger(st[2]) || st[2] < 0 || st[2] > 100 || !hash(st[3]) || typeof st[4] !== "string" || typeof st[5] !== "bigint") return stale()
      if (same(st[0], cfg.validator.address) && st[1] === BigInt(agentId) && st[4] === ARCADE_VALIDATION_TAG && st[5] > 0n) {
        validationsRead++; if (st[2] === 100) validationPasses++
      }
    }
    const fb = yield* read("readAllFeedback", cfg.registries.reputation, REPUTATION_REGISTRY_ABI, [BigInt(agentId), [cfg.attester.address], ARCADE_FEEDBACK_TAG1, "", false])
    if (!Array.isArray(fb) || fb.length !== 7 || !fb.every(Array.isArray)) return stale()
    const [clients, feedbackIndexes, values, valueDecimals, tag1s, tag2s, revokedStatuses] = fb as [unknown[], unknown[], unknown[], unknown[], unknown[], unknown[], unknown[]]
    if (clients.length > 4096 || !fb.every(xs => xs.length === clients.length)) return stale()
    let settlementFeedback = 0
    const indexes = new Set<string>()
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i], index = feedbackIndexes[i], value = values[i], decimals = valueDecimals[i], tag1 = tag1s[i], tag2 = tag2s[i], revoked = revokedStatuses[i]
      if (!address(client) || typeof index !== "bigint" || index <= 0n || typeof value !== "bigint" || typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 18 || typeof tag1 !== "string" || typeof tag2 !== "string" || typeof revoked !== "boolean") return stale()
      const key = `${client.toLowerCase()}/${index}`
      if (!indexes.has(key) && same(client, cfg.attester.address) && value === 1n && decimals === 0 && tag1 === ARCADE_FEEDBACK_TAG1 && !revoked) settlementFeedback++
      indexes.add(key)
    }
    return { validationPasses, validationsRead, settlementFeedback, stale: false }
  }).pipe(Effect.timeoutFail({ duration: "15 seconds", onTimeout: () => failure("evidence", "registry evidence deadline exceeded") }), Effect.catchAll(() => Effect.succeed(stale())))

  // Bounded snapshots include unreadable results, preventing an outage from turning every
  // four-second page poll into another RPC burst. Concurrent callers share one read.
  const cache = new Map<string, { at: number; value: AgentEvidence }>()
  const pending = new Map<string, Promise<AgentEvidence>>()
  return {
    armed: true, addresses, registries: cfg.registries,
    ownerOf: agentId => Effect.suspend(() => !idIsValid(agentId) ? failure("ownerOf", "invalid agent id") :
      read("ownerOf", cfg.registries.identity, IDENTITY_REGISTRY_ABI, [BigInt(agentId)]).pipe(Effect.flatMap(owner => address(owner) ? Effect.succeed(owner) : failure("ownerOf", "invalid registry owner")))),
    requestValidation: a => Effect.suspend(() => !idIsValid(a.agentId) || !uri(a.requestURI) || !hash(a.requestHash) ? failure("validationRequest", "invalid validation request") :
      write("validationRequest", cfg.operator, cfg.registries.validation, VALIDATION_REGISTRY_ABI, [cfg.validator.address, BigInt(a.agentId), a.requestURI, a.requestHash])),
    respondValidation: a => Effect.suspend(() => ![0, 100].includes(a.response) || !hash(a.requestHash) || !hash(a.responseHash) || !uri(a.responseURI) ? failure("validationResponse", "invalid validation response") :
      write("validationResponse", cfg.validator, cfg.registries.validation, VALIDATION_REGISTRY_ABI, [a.requestHash, a.response, a.responseURI, a.responseHash, ARCADE_VALIDATION_TAG])),
    giveFeedback: a => Effect.suspend(() => !idIsValid(a.agentId) || !uri(a.endpoint) || !uri(a.feedbackURI) || !hash(a.feedbackHash) || !/^[a-z0-9-]{1,128}$/.test(a.skillId) ? failure("giveFeedback", "invalid settlement feedback") :
      write("giveFeedback", cfg.attester, cfg.registries.reputation, REPUTATION_REGISTRY_ABI, [BigInt(a.agentId), 1n, 0, ARCADE_FEEDBACK_TAG1, a.skillId, a.endpoint, a.feedbackURI, a.feedbackHash])),
    evidenceFor: agentId => Effect.promise(async () => {
      if (!idIsValid(agentId)) return stale()
      const hit = cache.get(agentId)
      if (hit && now() >= hit.at && now() - hit.at < 60_000) return { ...hit.value }
      const active = pending.get(agentId)
      if (active) return { ...await active }
      if (pending.size >= 4) return stale()
      const task = Effect.runPromise(evidenceRead(agentId)).catch(() => stale()).then(value => {
        if (cache.size >= 128) cache.delete(cache.keys().next().value!)
        cache.set(agentId, { at: now(), value }); return value
      }).finally(() => { pending.delete(agentId) })
      pending.set(agentId, task)
      return { ...await task }
    })
  }
}

/** Injection seam verifies the real wallet adapter without broadcasting during tests. */
export const makeConfirmedWallet = (cfg: {
  address: string; chainId: number; getChainId(): Promise<number>; send(args: unknown): Promise<string>
  receipt(hash: string): Promise<{ status: string; transactionHash: string }>
  pollMs?: number; attempts?: number
}): Erc8004Wallet => ({
  address: cfg.address,
  writeContract: async args => {
    let tx: string
    try {
      if (await bounded(cfg.getChainId, 5000) !== cfg.chainId) throw failure("write", "RPC chain mismatch")
      tx = await bounded(() => cfg.send(args), 10_000)
      if (!hash(tx)) throw failure("write", "invalid registry transaction hash")
    } catch { throw failure("write", "registry broadcast could not be confirmed; inspect chain before retrying") }
    const attempts = cfg.attempts ?? 40
    for (let n = 0; n < attempts; n++) {
      let result: { status: string; transactionHash: string } | undefined
      try { result = await bounded(() => cfg.receipt(tx), 5000) } catch { /* Read retry uses the SAME hash, never a new send. */ }
      if (result !== undefined) {
        if (result.status === "success" && same(result.transactionHash, tx)) return tx
        throw failure("receipt", "registry transaction did not succeed")
      }
      if (n + 1 < attempts) await new Promise(resolve => setTimeout(resolve, cfg.pollMs ?? RECEIPT_POLL_INTERVAL_MS))
    }
    throw failure("receipt", "registry transaction confirmation unavailable; inspect chain before retrying")
  }
})

/** Cap unpaginated registry replies before JSON parsing; the deployed ABI has no pagination. */
export const boundedRegistryResponse = async (response: Response): Promise<Response> => {
  if (response.body === null) return response
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > 1_048_576) throw failure("rpc", "registry response exceeds bounded read limit")
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const headers = new Headers(response.headers)
  headers.delete("content-encoding"); headers.delete("content-length")
  return new Response(bytes, { status: response.status, statusText: response.statusText, headers })
}

/** Feature-only refusal: missing/malformed/colliding keys cannot take payments offline. */
export const Erc8004FromEnv = (registries?: Registries): Layer.Layer<Erc8004Tag> => {
  const disabled = (reason: string) => { log(`ERC-8004 disabled — ${reason}`); return Layer.succeed(Erc8004Tag, noopErc8004(reason)) }
  const keys = [process.env["ARCADE_OPERATOR_KEY"], process.env["ARCADE_VALIDATOR_KEY"], process.env["ARCADE_ATTESTER_KEY"]]
  if (!registries || !keys.every(k => typeof k === "string" && /^0x[0-9a-fA-F]{64}$/.test(k))) return disabled("needs three valid role keys and registry addresses")
  try {
    const config = loadChainConfig()
    if (config.id !== "arc-testnet" || config.status !== "ready" || process.env["ARCADE_RAIL"] === "test") return disabled("requires the real ready Arc testnet network")
    if (!config.erc8004 || !(Object.keys(registries) as Array<keyof Registries>).every(role => same(registries[role], config.erc8004![role]))) return disabled("registry addresses differ from the selected chain manifest")
    const accounts = keys.map(k => privateKeyToAccount(k as `0x${string}`))
    const refusal = keyRoleRefusal({ operator: accounts[0]!.address, validator: accounts[1]!.address, attester: accounts[2]!.address })
    if (refusal) return disabled(refusal)
    const chain = toViemChain(config)
    const rpc = process.env["ARCADE_RPC_URL"] ?? config.rpcHttp[0]!
    if (!uri(rpc)) return disabled("requires a valid credential-free RPC URL")
    const transport = http(rpc, { timeout: 5000, retryCount: 0, fetchOptions: { redirect: "error" },
      fetchFn: async (input, init) => boundedRegistryResponse(await fetch(input, init)) })
    const pub = createPublicClient({ chain, transport })
    const wallets = accounts.map(account => {
      const wallet = createWalletClient({ account, chain, transport })
      return makeConfirmedWallet({ address: account.address, chainId: config.chainId,
        getChainId: () => pub.getChainId(), send: args => wallet.writeContract({ ...(args as { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] }), account, chain }),
        receipt: async tx => { const r = await pub.getTransactionReceipt({ hash: tx as `0x${string}` }); return { status: r.status, transactionHash: r.transactionHash } } })
    })
    return Layer.succeed(Erc8004Tag, makeErc8004({ registries, chainId: config.chainId, reader: { readContract: async args => {
      // A local hub may warn and continue on a payment-RPC mismatch. ERC ownership and
      // evidence may not borrow another chain's state, even when no write is attempted.
      if (await pub.getChainId() !== config.chainId) throw failure("read", "RPC chain mismatch")
      return pub.readContract(args as never)
    } },
      operator: wallets[0]!, validator: wallets[1]!, attester: wallets[2]! }))
  } catch { return disabled("invalid ERC-8004 configuration") }
}

/**
 * Read ownership, not self-reported reputation. Wrong owners are dropped; unavailable
 * reads remain explicitly unverified. registrationTx is an announcement, not a fact
 * checked by ownerOf. Callers filter to this Hello's actual listing IDs before invoking.
 */
export const verifyAgentClaims = (
  erc8004: Erc8004,
  seller: string,
  claims: ReadonlyArray<AgentAnnouncement>
): Effect.Effect<ReadonlyMap<string, { agentId: string; registrationTx: string; agentVerified: boolean }>> => Effect.gen(function* () {
  type Verified = { agentId: string; registrationTx: string; agentVerified: boolean }
  const out = new Map<string, Verified>()
  if (!erc8004.armed || !address(seller) || !Array.isArray(claims) || claims.length > MAX_AGENT_ANNOUNCEMENTS) return out
  const own = (value: unknown, key: string): unknown => {
    if (typeof value !== "object" || value === null) return undefined
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor !== undefined && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined
  }
  const decoded: AgentAnnouncement[] = []
  const seen = new Set<string>(), duplicates = new Set<string>()
  // Validate the full bounded batch first; never invoke getters on injected objects.
  for (let index = 0; index < claims.length; index++) {
    const value = own(claims, String(index))
    const parsed = Schema.decodeUnknownEither(AgentAnnouncement)({ skillId: own(value, "skillId"),
      agentId: own(value, "agentId"), registrationTx: own(value, "registrationTx") })
    if (parsed._tag === "Left") return out
    if (seen.has(parsed.right.skillId)) duplicates.add(parsed.right.skillId)
    seen.add(parsed.right.skillId)
    decoded.push(parsed.right)
  }
  const byAgent = new Map<string, AgentAnnouncement[]>()
  for (const claim of decoded) {
    if (duplicates.has(claim.skillId)) continue
    out.set(claim.skillId, { agentId: claim.agentId, registrationTx: claim.registrationTx, agentVerified: false })
    const group = byAgent.get(claim.agentId) ?? []
    group.push(claim); byAgent.set(claim.agentId, group)
  }
  const checks = Effect.gen(function* () {
    // Sequential reads, one per unique agent and at most sixteen; unqueried entries stay
    // unverified. Neither a large batch nor a stalled RPC may delay Hello for minutes.
    for (const [agentId, group] of [...byAgent].slice(0, 16)) {
      const owner = yield* Effect.suspend(() => erc8004.ownerOf(agentId)).pipe(
        Effect.timeoutFail({ duration: 1000, onTimeout: () => failure("ownerOf", "claim read deadline exceeded") }),
        Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt : Effect.succeed(undefined))
      )
      if (!address(owner)) continue
      for (const claim of group) {
        if (!same(owner, seller)) out.delete(claim.skillId)
        else out.set(claim.skillId, { agentId: claim.agentId, registrationTx: claim.registrationTx, agentVerified: true })
      }
    }
  })
  yield* checks.pipe(Effect.timeoutOption(5000))
  return out
}).pipe(Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt : Effect.succeed(new Map())))
