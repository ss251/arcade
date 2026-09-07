/** Bun/owned-CLI runtime. No keys, IO or SDK instances on import. */
import { Effect } from "effect"
import { ViemAdapter } from "@circle-fin/adapter-viem-v2"
import { resolveChainIdentifier } from "@circle-fin/unified-balance-kit"
import { createPublicClient, createWalletClient, custom, keccak256, parseAbi, parseTransaction,
  recoverTransactionAddress, TransactionReceiptNotFoundError, type Chain, type Hex, type PublicClient,
  type TransactionReceipt, type TransactionSerializableEIP1559, type WalletClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { boundedFundingJson } from "./gateway-funding-runtime.ts"
import { fundingRecord, fundingUint, parseFundingAmount } from "./gateway-funding.ts"
import { openUnifiedFundingJournal, type OwnedUnifiedFundingJournal } from "./gateway-funding-journal.ts"
import { createUnifiedFundingKit, unifiedKitBindings } from "./unified-balance-kit.ts"
import { createUnifiedGatewayBoundary, withOwnedUnifiedGatewayFetch } from "./unified-balance-network.ts"
import { createUnifiedSigningBoundary } from "./unified-balance-signing.ts"
import { assertUnifiedMint, unifiedCoordinates, type UnifiedBurnLimits } from "./unified-balance-guards.ts"
import { captureCanonicalUnifiedPlan, spendFromOwner, type UnifiedFundingPlan } from "./unified-balance-funding.ts"
import type { UnifiedCliRuntime, UnifiedFundingCommand } from "./unified-balance-cli.ts"

const fail = (): never => { throw Error("unified_runtime_refused") }
type Account = ReturnType<typeof privateKeyToAccount>
export interface UnifiedRuntimeOptions {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly signal: AbortSignal
  readonly deadlineMs: number
  readonly fetch?: typeof fetch
  /** Trusted offline-test/owner-command seam; no account is acquired on import. */
  readonly acquireAccount?: () => Promise<Account>
}
const walletAbi = parseAbi(["function domain() view returns(uint32)", "function paused() view returns(bool)",
  "function isTokenSupported(address token) view returns(bool)", "function withdrawalDelay() view returns(uint256)",
  "function isAuthorizedForBalance(address token,address depositor,address addr) view returns(bool)"])
const methods = new Set(["eth_chainId", "eth_call", "eth_getCode", "eth_blockNumber", "eth_getBlockByNumber", "eth_getBalance",
  "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice", "eth_getTransactionReceipt"])
const evmChain = (source: "Arc_Testnet" | "Base_Sepolia") => {
  const chain = resolveChainIdentifier(source)
  if (chain.type !== "evm") return fail()
  return chain
}
const value = (input: unknown, key: string): unknown => {
  if (!input || typeof input !== "object") return fail()
  const d = Object.getOwnPropertyDescriptor(input, key)
  if (!d || !d.enumerable || !("value" in d)) return fail()
  return d.value
}
const accountAddress = (input: unknown): string => {
  const address = value(input, "address")
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) return fail()
  return address.toLowerCase()
}
const hash = (input: unknown): Hex => {
  if (typeof input !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(input) || /^0x0{64}$/.test(input)) return fail()
  return input.toLowerCase() as Hex
}
export const createUnifiedRuntime = (options: UnifiedRuntimeOptions): UnifiedCliRuntime => {
  const originalFetch = options.fetch ?? globalThis.fetch, { signal, deadlineMs, env } = options
  const acquireAccount = options.acquireAccount
  if (env["ARCADE_NETWORK"] !== undefined && env["ARCADE_NETWORK"] !== "arc-testnet" ||
    !Number.isFinite(deadlineMs) || deadlineMs <= performance.now() || deadlineMs > performance.now() + 330000) return fail()
  const active = () => { if (signal.aborted || performance.now() >= deadlineMs) return fail() }
  let accountPromise: Promise<Account> | undefined, operationClaimed = false, id = 0, calls = 0, sent = false
  const account = () => {
    active()
    return accountPromise ??= (async () => {
      if (acquireAccount) return acquireAccount()
      const key = env["ARCADE_BUYER_KEY"]
      if (typeof key !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(key)) return fail()
      return privateKeyToAccount(key as Hex)
    })()
  }
  const rpc = async (chainId: number, method: string, params: readonly unknown[], send = false): Promise<unknown> => {
    active()
    const source = chainId === 5042002 ? "Arc_Testnet" : chainId === 84532 ? "Base_Sepolia" : fail()
    if (++calls > 400 || (send ? chainId !== 5042002 || method !== "eth_sendRawTransaction" || sent : !methods.has(method))) return fail()
    if (send) sent = true
    const requestId = ++id
    const raw = await boundedFundingJson(originalFetch, unifiedCoordinates(source).rpc, "POST",
      JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), signal, deadlineMs)
    active()
    const reply = value(raw, "result")
    if (value(raw, "jsonrpc") !== "2.0" || value(raw, "id") !== requestId || Object.hasOwn(raw as object, "error")) return fail()
    return reply
  }
  const clients = new Map<number, PublicClient>()
  const publicClient = (chain: Chain): PublicClient => {
    if (chain.id !== 5042002 && chain.id !== 84532) return fail()
    let client = clients.get(chain.id)
    if (!client) {
      client = createPublicClient({ chain, cacheTime: 0, batch: { multicall: false }, transport: custom({
        request: ({ method, params }) => rpc(chain.id, method, (params ?? []) as readonly unknown[])
      }, { retryCount: 0 }) })
      clients.set(chain.id, client)
    }
    return client
  }
  const identityPins = new Map<string, Hex>()
  const pinCode = async (client: PublicClient, chainId: number, address: Hex) => {
    const code = await client.getCode({ address }); active()
    if (!code || code === "0x") return fail()
    const key = chainId + ":" + address.toLowerCase(), pin = keccak256(code)
    if (identityPins.has(key) && identityPins.get(key) !== pin) return fail()
    identityPins.set(key, pin)
  }
  const readChain = async (client: PublicClient, expected: number) => {
    if (await client.getChainId() !== expected) return fail()
    active()
  }
  const adapter = (address: Hex, callbacks?: {
    sign: (input: unknown) => Promise<Hex>; mint: (input: unknown, client: PublicClient) => Promise<Hex>;
    receipt: (txHash: Hex, client: PublicClient) => Promise<TransactionReceipt>
  }): ViemAdapter => {
    const result = new ViemAdapter({
      getPublicClient: ({ chain }) => publicClient(chain),
      getWalletClient: ({ chain }) => {
        const client = publicClient(chain)
        const watch = createWalletClient({ account: address, chain, transport: custom({
          request: ({ method, params }) => rpc(chain.id, method, (params ?? []) as readonly unknown[])
        }, { retryCount: 0 }) })
        return { ...watch,
          signTypedData: async (input: unknown) => {
            if (!callbacks || accountAddress(value(input, "account")) !== address) return fail()
            return callbacks.sign({ domain: value(input, "domain"), types: value(input, "types"),
              primaryType: value(input, "primaryType"), message: value(input, "message") })
          },
          sendTransaction: async (input: unknown) => {
            if (!callbacks || chain.id !== 5042002 || accountAddress(value(input, "account")) !== address) return fail()
            return callbacks.mint({ to: value(input, "to"), data: value(input, "data"),
              value: Object.hasOwn(input as object, "value") ? value(input, "value") : 0n }, client)
          }
        } as WalletClient
      }
    }, { addressContext: "user-controlled", supportedChains: [resolveChainIdentifier("Arc_Testnet"), resolveChainIdentifier("Base_Sepolia")] })
    result.waitForTransaction = async (txHash, _config, chain) => {
      if (!callbacks || chain?.chainId !== 5042002) return fail()
      const receipt = await callbacks.receipt(hash(txHash), await result.getPublicClient(chain))
      return { txHash: receipt.transactionHash, status: receipt.status, cumulativeGasUsed: receipt.cumulativeGasUsed,
        gasUsed: receipt.gasUsed, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
        transactionIndex: receipt.transactionIndex, effectiveGasPrice: receipt.effectiveGasPrice }
    }
    return result
  }
  const gatewayBoundary = (beforeTransfer: (body: string) => Promise<void>) =>
    createUnifiedGatewayBoundary({ request: originalFetch, signal, deadlineMs, beforeTransfer })

  return Object.freeze({
    async resolveDelegate() { return (await account()).address.toLowerCase() },
    async status(input: UnifiedFundingPlan) {
      const plan = captureCanonicalUnifiedPlan(input), owner = adapter(plan.owner)
      await readChain(await owner.getPublicClient(evmChain(plan.sourceChain)), unifiedCoordinates(plan.sourceChain).chainId)
      const kit = createUnifiedFundingKit(), boundary = gatewayBoundary(async () => fail())
      return withOwnedUnifiedGatewayFetch(boundary, () => unifiedKitBindings(kit, owner, owner)
        .delegateStatus({ owner: plan.owner, delegate: plan.recipient, sourceChain: plan.sourceChain }))
    },
    async execute(input: UnifiedFundingPlan, command: UnifiedFundingCommand) {
      active()
      if (operationClaimed) return fail()
      operationClaimed = true
      const plan = captureCanonicalUnifiedPlan(input), c = unifiedCoordinates(plan.sourceChain), arc = unifiedCoordinates("Arc_Testnet")
      if (command.owner !== plan.owner || command.sourceChain !== plan.sourceChain || command.amount !== plan.amount ||
        command.delegate !== undefined && command.delegate !== plan.recipient || command.dryRun || !command.journalPath ||
        command.maxBurnBlockDelta === undefined) return fail()
      const journalPath = command.journalPath
      const feeCap = fundingUint(command.feeCapAtomic), gasCap = fundingUint(command.gasCapWei, true)
      const delta = fundingUint(command.maxBurnBlockDelta, true), amount = parseFundingAmount(plan.amount)
      let journal: OwnedUnifiedFundingJournal | undefined
      let signing: ReturnType<typeof createUnifiedSigningBoundary> | undefined, preparedHash: Hex | undefined, mintClaimed = false
      const boundary = gatewayBoundary(body => signing ? signing.beforeTransfer(body) : Promise.reject(Error("unified_runtime_refused")))
      const owner = adapter(plan.owner)
      const sourceClient = await owner.getPublicClient(evmChain(plan.sourceChain))
      const destinationClient = await owner.getPublicClient(evmChain("Arc_Testnet"))
      const destinationReady = async () => {
        await readChain(destinationClient, arc.chainId)
        await pinCode(destinationClient, arc.chainId, arc.minter); await pinCode(destinationClient, arc.chainId, arc.token)
        if (Number(await destinationClient.readContract({ address: arc.minter, abi: walletAbi, functionName: "domain" })) !== 26 ||
          await destinationClient.readContract({ address: arc.minter, abi: walletAbi, functionName: "paused" }) ||
          !await destinationClient.readContract({ address: arc.minter, abi: walletAbi, functionName: "isTokenSupported", args: [arc.token] }) ||
          await destinationClient.getBalance({ address: plan.recipient }) < gasCap) return fail()
        active()
      }
      const limits = async (): Promise<UnifiedBurnLimits> => {
        active(); await readChain(sourceClient, c.chainId)
        // A self-signed Arc mint needs pre-existing native gas; do not consume
        // an owner's burn before checking the destination can pay its gas cap.
        await destinationReady()
        await pinCode(sourceClient, c.chainId, c.wallet); await pinCode(sourceClient, c.chainId, c.token)
        if (Number(await sourceClient.readContract({ address: c.wallet, abi: walletAbi, functionName: "domain" })) !== c.domain ||
          await sourceClient.readContract({ address: c.wallet, abi: walletAbi, functionName: "paused" }) ||
          !await sourceClient.readContract({ address: c.wallet, abi: walletAbi, functionName: "isTokenSupported", args: [c.token] }) ||
          !await sourceClient.readContract({ address: c.wallet, abi: walletAbi, functionName: "isAuthorizedForBalance", args: [c.token, plan.owner, plan.recipient] })) return fail()
        const balances = await (await boundary.fetch("https://gateway-api-testnet.circle.com/v1/balances", {
          method: "POST", body: JSON.stringify({ token: "USDC", sources: [{ domain: c.domain, depositor: plan.owner }] })
        })).json() as { token?: unknown; balances?: unknown }
        if (balances.token !== "USDC" || !Array.isArray(balances.balances) || balances.balances.length !== 1) return fail()
        const balance = fundingRecord(balances.balances[0], ["domain", "depositor", "balance"])
        if (balance.domain !== c.domain || typeof balance.depositor !== "string" || balance.depositor.toLowerCase() !== plan.owner ||
          parseFundingAmount(balance.balance) < amount + feeCap) return fail()
        const sourceBlock = await sourceClient.getBlockNumber({ cacheTime: 0 })
        const withdrawalDelay = await sourceClient.readContract({ address: c.wallet, abi: walletAbi, functionName: "withdrawalDelay" })
        active()
        return { maxFeeAtomic: feeCap, sourceBlock, withdrawalDelay, maxBurnBlockDelta: delta }
      }
      const delegate = adapter(plan.recipient, {
        sign: input => signing ? signing.sign(input) : Promise.reject(Error("unified_runtime_refused")),
        async mint(input, client) {
          active()
          if (mintClaimed || !signing || !journal) return fail()
          mintClaimed = true
          await readChain(client, arc.chainId)
          await pinCode(client, arc.chainId, arc.minter); await pinCode(client, arc.chainId, arc.token)
          if (Number(await client.readContract({ address: arc.minter, abi: walletAbi, functionName: "domain" })) !== 26 ||
            await client.readContract({ address: arc.minter, abi: walletAbi, functionName: "paused" }) ||
            !await client.readContract({ address: arc.minter, abi: walletAbi, functionName: "isTokenSupported", args: [arc.token] })) return fail()
          const mint = assertUnifiedMint(input, signing.burn(), await client.getBlockNumber({ cacheTime: 0 }))
          const gas = (await client.estimateGas({ account: plan.recipient, to: mint.to, data: mint.data, value: 0n }) * 12n + 9n) / 10n
          const gasPrice = await client.getGasPrice(), maxFeePerGas = gasPrice * 2n
          if (gas <= 0n || gasPrice <= 0n || gas * maxFeePerGas > gasCap || await client.getBalance({ address: plan.recipient }) < gas * maxFeePerGas) return fail()
          const nonce = await client.getTransactionCount({ address: plan.recipient, blockTag: "pending" })
          const tx: TransactionSerializableEIP1559 = { type: "eip1559", chainId: 5042002, to: mint.to, data: mint.data, value: 0n,
            nonce, gas, maxFeePerGas, maxPriorityFeePerGas: 0n }
          const signer = await account(); active()
          if (signer.address.toLowerCase() !== plan.recipient) return fail()
          assertUnifiedMint(input, signing.burn(), await client.getBlockNumber({ cacheTime: 0 }))
          const raw = await signer.signTransaction(tx); active()
          if (!raw.startsWith("0x02")) return fail()
          const decoded = parseTransaction(raw)
          if (decoded.type !== tx.type || decoded.chainId !== tx.chainId || decoded.to?.toLowerCase() !== tx.to ||
            decoded.data !== tx.data || (decoded.value ?? 0n) !== 0n || decoded.nonce !== nonce || decoded.gas !== gas ||
            decoded.maxFeePerGas !== maxFeePerGas || (decoded.maxPriorityFeePerGas ?? 0n) !== 0n ||
            decoded.accessList?.length || (await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })).toLowerCase() !== plan.recipient) return fail()
          preparedHash = keccak256(raw)
          await journal.append({ stage: "mint_prepared", plan, txHash: preparedHash }); active()
          if (hash(await rpc(5042002, "eth_sendRawTransaction", [raw], true)) !== preparedHash) return fail()
          return preparedHash
        },
        async receipt(txHash, client) {
          if (!preparedHash || txHash !== preparedHash) return fail()
          for (let attempt = 0; attempt < 60; attempt++) {
            active()
            try {
              const receipt = await client.getTransactionReceipt({ hash: txHash }); active()
              if (receipt.transactionHash.toLowerCase() !== txHash || receipt.status !== "success" ||
                receipt.from.toLowerCase() !== plan.recipient || receipt.to?.toLowerCase() !== arc.minter ||
                receipt.gasUsed * receipt.effectiveGasPrice > gasCap) return fail()
              return receipt
            } catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error }
            // One receipt request per tick; no viem waiter/replacement search.
            await new Promise<void>((resolve, reject) => {
              const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(Error("unified_runtime_refused")) }
              const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, 1000)
              signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort()
            })
          }
          return fail()
        }
      })
      const kit = createUnifiedFundingKit(), bindings = unifiedKitBindings(kit, owner, delegate)
      try {
        journal = await openUnifiedFundingJournal(journalPath, plan)
        const owned = journal
        return await withOwnedUnifiedGatewayFetch(boundary, () => Effect.runPromise(spendFromOwner({
          owner: plan.owner, recipient: plan.recipient, amount: plan.amount, sourceChain: plan.sourceChain
        }, { journal: owned, delegateStatus: bindings.delegateStatus, spend: async p => {
          signing = createUnifiedSigningBoundary(p, { active, limits, acquireSigner: account })
          return bindings.spend(p)
        } })))
      } finally { boundary.close(); if (journal) await journal.close() }
    }
  })
}
