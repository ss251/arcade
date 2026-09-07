/** Concrete Arc-only ports for the guarded executor. No key lookup, deployment or activation
 * on import. Ports are not standalone spending authority; use with the durable executor. */
import { createPublicClient, custom, defineChain, TransactionReceiptNotFoundError, type Hex,
  type TransactionSerializableEIP1559 } from "viem"
import { ERC8183_ABI } from "./erc8183-abi.ts"
import { escrowActionContext, type PreparedEscrowAction } from "./erc8183-actions.ts"
import { assertEscrowSignedAction, captureEscrowTransactionTerms, type EscrowTransactionTerms } from "./erc8183-evidence.ts"
import type { EscrowExecutorDependencies } from "./erc8183-executor.ts"
import { captureEscrowIdentity, createEscrowReader } from "./erc8183-reader.ts"
import { escrowAddress, escrowBytes32, escrowCheck, escrowRecord, escrowSeconds, escrowUint } from "./erc8183-codec.ts"
import { assertEscrowSnapshotFresh, type EscrowSnapshot } from "./erc8183-request.ts"
import { boundEscrowIO, createEscrowRpc, ESCROW_RPC_URL, type EscrowRpcOptions } from "./erc8183-rpc.ts"
interface EscrowSigner {
  readonly address: Hex
  readonly signTransaction: (transaction: TransactionSerializableEIP1559) => Promise<Hex>
}
export interface EscrowChainOptions extends EscrowRpcOptions {
  readonly identity: unknown; readonly nowSeconds: () => number; readonly gasCapWei: bigint
  readonly acquireSigner: (signal: AbortSignal) => Promise<EscrowSigner>
}
type Ports = Pick<EscrowExecutorDependencies, "readJob" | "readJobAt" | "providerCode" | "providerNonceUsed" |
  "nonceState" | "transactionTerms" | "signTransaction" | "broadcast" | "readReceipt" | "readTransaction">
const chain = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ESCROW_RPC_URL] } } })
export function createEscrowChain(options: EscrowChainOptions): Ports {
  const id = captureEscrowIdentity(options.identity), gasCapWei = escrowUint(options.gasCapWei),
    deadlineMs = options.deadlineMs, nowSeconds = options.nowSeconds, acquire = options.acquireSigner, parent = options.signal
  escrowCheck(gasCapWei > 0n)
  const rpc = createEscrowRpc(options)
  let termsStarted = false, signingStarted = false, broadcastStarted = false, signedRaw: Hex | undefined, signedHash: Hex | undefined
  let proposal: { action: PreparedEscrowAction; terms: EscrowTransactionTerms } | undefined
  const scoped = (signal: AbortSignal) => AbortSignal.any([parent, signal])
  const active = (signal: AbortSignal) => escrowCheck(!parent.aborted && !signal.aborted && performance.now() < deadlineMs)
  const guard = async <T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => {
    try { active(signal); const value = await work(); active(signal); return value } catch { throw Error("escrow_chain_refused") }
  }
  const client = (signal: AbortSignal) => createPublicClient({ chain, cacheTime: 0, batch: { multicall: false },
    transport: custom({ request: ({ method, params }) => rpc.read(method, (params ?? []) as readonly unknown[], scoped(signal)) }, { retryCount: 0 }) })
  const reader = (signal: AbortSignal) => createEscrowReader(client(signal), id, { signal: scoped(signal), nowSeconds })
  const captureBlock = (snapshot: EscrowSnapshot) => {
    escrowCheck(snapshot.chainId === 5042002 && snapshot.escrow === id.escrow && escrowUint(snapshot.blockNumber) > 0n)
    return Object.freeze({ chainId: 5042002, escrow: id.escrow, blockNumber: snapshot.blockNumber,
      blockHash: escrowBytes32(snapshot.blockHash, false), timestamp: escrowSeconds(snapshot.timestamp) })
  }
  const canonical = async (snapshot: ReturnType<typeof captureBlock>, signal: AbortSignal) => {
    const c = client(signal), block = await c.getBlock({ blockNumber: snapshot.blockNumber })
    escrowCheck(block.number === snapshot.blockNumber && block.hash === escrowBytes32(snapshot.blockHash, false) &&
      block.timestamp === BigInt(escrowSeconds(snapshot.timestamp)) && await c.getChainId() === 5042002)
    assertEscrowSnapshotFresh(snapshot.timestamp, escrowSeconds(nowSeconds()))
  }
  const pause = (signal: AbortSignal) => boundEscrowIO(activeSignal => new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); activeSignal.removeEventListener("abort", stop); reject(Error("escrow_chain_refused")) }
    const timer = setTimeout(() => { activeSignal.removeEventListener("abort", stop); resolve() }, 1000)
    activeSignal.addEventListener("abort", stop, { once: true }); if (activeSignal.aborted) stop()
  }), scoped(signal), deadlineMs, 1100)
  return Object.freeze<Ports>({
    readJob: (jobId, signal) => guard(signal, () => reader(signal).readJob(jobId)),
    readJobAt: (jobId, block, signal) => guard(signal, () => reader(signal).readJobAt(jobId, block)),
    providerCode: (provider, snapshot, signal) => guard(signal, async () => {
      const block = captureBlock(snapshot)
      const code = await client(signal).getCode({ address: escrowAddress(provider), blockNumber: block.blockNumber })
      escrowCheck(code === undefined || typeof code === "string" && /^0x(?:[0-9a-fA-F]{2}){0,24576}$/.test(code))
      await canonical(block, signal); return code === undefined ? "0x" : code
    }),
    providerNonceUsed: (nonce, snapshot, signal) => guard(signal, async () => {
      const block = captureBlock(snapshot)
      const used = await client(signal).readContract({ address: id.escrow, abi: ERC8183_ABI, functionName: "authorizationNonceUsed",
        args: [escrowBytes32(nonce, false)], blockNumber: block.blockNumber })
      escrowCheck(typeof used === "boolean"); await canonical(block, signal); return used
    }),
    nonceState: (sender, signal) => guard(signal, async () => {
      escrowCheck(escrowAddress(sender) === id.evaluator)
      const c = client(signal); escrowCheck(await c.getChainId() === 5042002)
      const latest = await c.getTransactionCount({ address: id.evaluator, blockTag: "latest" })
      const pending = await c.getTransactionCount({ address: id.evaluator, blockTag: "pending" })
      escrowCheck(Number.isSafeInteger(latest) && latest >= 0 && Number.isSafeInteger(pending) && pending >= latest && await c.getChainId() === 5042002)
      return Object.freeze({ latest, pending })
    }),
    transactionTerms: (input, signal) => guard(signal, async () => {
      escrowCheck(!termsStarted); termsStarted = true
      const context = escrowActionContext(input.context), action = Object.freeze({ ...input, context })
      escrowCheck(action.chainId === 5042002 && action.sender === id.evaluator && action.to === id.escrow && action.value === 0n &&
        ["budget", "submit", "complete", "reject"].includes(action.kind) && /^0x(?:[0-9a-f]{2}){1,65500}$/.test(action.data))
      const c = client(signal); escrowCheck(await c.getChainId() === 5042002)
      const gas = (await c.estimateGas({ account: id.evaluator, to: id.escrow, data: action.data, value: 0n }) * 12n + 9n) / 10n
      const maxFeePerGas = await c.getGasPrice() * 2n
      const nonce = await c.getTransactionCount({ address: id.evaluator, blockTag: "pending" })
      const terms = captureEscrowTransactionTerms({ nonce, gas, maxFeePerGas, maxPriorityFeePerGas: 0n, gasCapWei })
      escrowCheck(await c.getBalance({ address: id.evaluator, blockTag: "latest" }) >= gas * maxFeePerGas && await c.getChainId() === 5042002)
      proposal = { action, terms }; return terms
    }),
    signTransaction: (input, signal) => guard(signal, async () => {
      escrowCheck(!signingStarted && proposal !== undefined); signingStarted = true
      const p = proposal, t = escrowRecord(input, ["type", "chainId", "to", "data", "value", "nonce", "gas", "maxFeePerGas", "maxPriorityFeePerGas"])
      escrowCheck(t.type === "eip1559" && t.chainId === 5042002 && t.to === p.action.to && t.data === p.action.data && t.value === 0n &&
        t.nonce === p.terms.nonce && t.gas === p.terms.gas && t.maxFeePerGas === p.terms.maxFeePerGas && t.maxPriorityFeePerGas === 0n)
      const transaction = Object.freeze({ ...t }) as TransactionSerializableEIP1559
      const signer = await boundEscrowIO(acquire, scoped(signal), deadlineMs)
      escrowCheck(escrowAddress(signer.address) === id.evaluator)
      const raw = await boundEscrowIO(() => signer.signTransaction(transaction), scoped(signal), deadlineMs)
      const signed = await assertEscrowSignedAction(p.action, raw, p.terms)
      active(signal); signedRaw = signed.serialized; signedHash = signed.hash; return signed.serialized
    }),
    broadcast: (raw, signal) => guard(signal, async () => {
      escrowCheck(!broadcastStarted && signedRaw !== undefined && raw === signedRaw); broadcastStarted = true
      const hash = escrowBytes32(await rpc.send(raw, scoped(signal)), false)
      escrowCheck(hash === signedHash); return hash
    }),
    readReceipt: (hash, signal) => guard(signal, async () => {
      const txHash = escrowBytes32(hash, false), c = client(signal)
      for (let n = 0; n < 60; n++) {
        let receipt
        try { receipt = await c.getTransactionReceipt({ hash: txHash }) }
        catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; await pause(signal); continue }
        escrowCheck(receipt.transactionHash === txHash && receipt.blockNumber > 0n && receipt.blockHash !== null)
        const head = await c.getBlock({ blockTag: "finalized" })
        escrowCheck(head.number !== null && head.number > 0n && head.hash !== null)
        assertEscrowSnapshotFresh(Number(head.timestamp), escrowSeconds(nowSeconds()))
        if (receipt.blockNumber > head.number) { await pause(signal); continue }
        const block = await c.getBlock({ blockNumber: receipt.blockNumber })
        escrowCheck(block.number === receipt.blockNumber && block.hash === receipt.blockHash && block.timestamp <= head.timestamp && await c.getChainId() === 5042002)
        return receipt
      }
      throw Error("escrow_chain_refused")
    }),
    readTransaction: (hash, signal) => guard(signal, async () => {
      const c = client(signal), tx = await c.getTransaction({ hash: escrowBytes32(hash, false) })
      escrowCheck(tx.chainId === 5042002 && tx.type === "eip1559" && await c.getChainId() === 5042002)
      return { hash: tx.hash, from: tx.from, to: tx.to, input: tx.input, value: tx.value, nonce: tx.nonce,
        chainId: tx.chainId, blockHash: tx.blockHash, blockNumber: tx.blockNumber }
    })
  })
}
