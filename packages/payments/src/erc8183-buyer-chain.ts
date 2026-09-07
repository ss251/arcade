/** Buyer-specific Arc ports. No key lookup, deployment or activation on import.
 * Spending authority belongs to the durable driver, not these transport adapters. */
import { createPublicClient, custom, defineChain, erc20Abi, keccak256, recoverTransactionAddress, serializeTransaction,
  TransactionReceiptNotFoundError, type Hex, type TransactionSerializableEIP1559 } from "viem"
import { captureOriginalEscrowBuyerAction, captureOriginalEscrowBuyerIntent, type EscrowBuyerIntent,
  type PreparedEscrowBuyerAction } from "./erc8183-buyer-intent.ts"
import { assertEscrowBuyerSigned } from "./erc8183-buyer-evidence.ts"
import type { EscrowBuyerChain } from "./erc8183-buyer-driver.ts"
import { captureEscrowTransactionTerms, type EscrowTransactionTerms } from "./erc8183-evidence.ts"
import { createEscrowReader, type EscrowDeploymentSnapshot } from "./erc8183-reader.ts"
import { escrowAddress, escrowBytes32, escrowCheck, escrowRecord, escrowSeconds, escrowUint } from "./erc8183-codec.ts"
import { assertEscrowSnapshotFresh, type EscrowSnapshot } from "./erc8183-request.ts"
import { boundEscrowIO, createEscrowRpc, ESCROW_RPC_URL, type EscrowRpcOptions } from "./erc8183-rpc.ts"
export interface EscrowBuyerSigner {
  readonly address: Hex; readonly signTransaction: (transaction: TransactionSerializableEIP1559) => Promise<Hex>
}
export interface EscrowBuyerChainOptions extends EscrowRpcOptions {
  readonly intent: EscrowBuyerIntent; readonly kind: PreparedEscrowBuyerAction["kind"]; readonly nowSeconds: () => number
  readonly acquireSigner: (signal: AbortSignal) => Promise<EscrowBuyerSigner>
}
const chain = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ESCROW_RPC_URL] } } })
export function createEscrowBuyerChain(options: EscrowBuyerChainOptions): EscrowBuyerChain {
  const i = captureOriginalEscrowBuyerIntent(options.intent), id = i.identity, kind = options.kind,
    deadlineMs = options.deadlineMs, parent = options.signal, nowSeconds = options.nowSeconds, acquire = options.acquireSigner,
    rpc = createEscrowRpc(options)
  escrowCheck(["create", "approve", "fund"].includes(kind) && i.client !== i.call.evaluator)
  let termsStarted = false, signingStarted = false, broadcastStarted = false, signedRaw: Hex | undefined, signedHash: Hex | undefined,
    proposal: { action: PreparedEscrowBuyerAction; terms: EscrowTransactionTerms } | undefined, previous = 0
  const scoped = (signal: AbortSignal) => AbortSignal.any([parent, signal])
  const active = (signal: AbortSignal) => {
    const now = escrowSeconds(nowSeconds()); escrowCheck(!parent.aborted && !signal.aborted && performance.now() < deadlineMs && now >= previous)
    previous = now; return now
  }
  const guard = async <T>(signal: AbortSignal, work: () => Promise<T>) => {
    try { active(signal); const result = await work(); active(signal); return result } catch { throw Error("escrow_buyer_chain_refused") }
  }
  const sendingTime = (signal: AbortSignal) => { const now = active(signal); escrowCheck(now >= i.issuedAt && now <= i.fundBy) }
  const client = (signal: AbortSignal) => createPublicClient({ chain, cacheTime: 0, batch: { multicall: false },
    transport: custom({ request: ({ method, params }) => rpc.read(method, (params ?? []) as readonly unknown[], scoped(signal)) }, { retryCount: 0 }) })
  const reader = (signal: AbortSignal) => createEscrowReader(client(signal), id, { signal: scoped(signal), nowSeconds })
  const blockOf = (frame: EscrowSnapshot | EscrowDeploymentSnapshot) => {
    const own = (key: string): unknown => { const d = Object.getOwnPropertyDescriptor(frame, key); escrowCheck(d && "value" in d); return d.value }
    escrowCheck(own("chainId") === 5042002 && escrowAddress(own("escrow")) === id.escrow)
    const blockNumber = escrowUint(own("blockNumber")); escrowCheck(blockNumber > 0n)
    return Object.freeze({ blockNumber, blockHash: escrowBytes32(own("blockHash"), false), timestamp: escrowSeconds(own("timestamp")) })
  }
  const canonical = async (frame: ReturnType<typeof blockOf>, signal: AbortSignal, historical: boolean) => {
    const c = client(signal), block = await c.getBlock({ blockNumber: frame.blockNumber })
    escrowCheck(block.number === frame.blockNumber && block.hash === frame.blockHash && block.timestamp === BigInt(frame.timestamp))
    if (historical) {
      const head = await c.getBlock({ blockTag: "finalized" })
      escrowCheck(head.number !== null && head.hash !== null && head.number >= frame.blockNumber && head.timestamp >= block.timestamp)
      assertEscrowSnapshotFresh(Number(head.timestamp), active(signal))
    } else assertEscrowSnapshotFresh(frame.timestamp, active(signal))
    escrowCheck(await c.getChainId() === 5042002)
  }
  const ownIntent = (input: EscrowBuyerIntent) => escrowCheck(captureOriginalEscrowBuyerIntent(input).id === i.id)
  const allowance = (c: ReturnType<typeof client>, blockNumber: bigint) => c.readContract({ address: id.token, abi: erc20Abi,
    functionName: "allowance", args: [i.client, id.escrow], blockNumber })
  const pause = (signal: AbortSignal) => boundEscrowIO(s => new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); s.removeEventListener("abort", stop); reject(Error("stopped")) }
    const timer = setTimeout(() => { s.removeEventListener("abort", stop); resolve() }, 1000)
    s.addEventListener("abort", stop, { once: true }); if (s.aborted) stop()
  }), scoped(signal), deadlineMs, 1100)
  return Object.freeze<EscrowBuyerChain>({
    readDeployment: signal => guard(signal, () => reader(signal).readDeployment()),
    readJob: (jobId, signal) => guard(signal, () => reader(signal).readJob(jobId)),
    readJobAt: (jobId, block, signal) => guard(signal, () => reader(signal).readJobAt(jobId, block)),
    observe: (input, frame, signal) => guard(signal, async () => {
      ownIntent(input); const at = blockOf(frame), c = client(signal)
      const code = await c.getCode({ address: i.call.provider, blockNumber: at.blockNumber })
      escrowCheck(code === undefined || typeof code === "string" && /^0x(?:[0-9a-fA-F]{2}){0,24576}$/.test(code))
      const nativeBalanceWei = escrowUint(await c.getBalance({ address: i.client, blockNumber: at.blockNumber })),
        allowanceAtomic = escrowUint(await allowance(c, at.blockNumber))
      await canonical(at, signal, false)
      return Object.freeze({ providerCode: code ?? "0x", nativeBalanceWei, allowanceAtomic })
    }),
    allowanceAt: (input, frame, signal) => guard(signal, async () => {
      ownIntent(input); const at = blockOf(frame), value = escrowUint(await allowance(client(signal), at.blockNumber))
      await canonical(at, signal, true); return value
    }),
    nonceState: signal => guard(signal, async () => {
      const c = client(signal); escrowCheck(await c.getChainId() === 5042002)
      const latest = await c.getTransactionCount({ address: i.client, blockTag: "latest" }),
        pending = await c.getTransactionCount({ address: i.client, blockTag: "pending" })
      escrowCheck(Number.isSafeInteger(latest) && latest >= 0 && Number.isSafeInteger(pending) && pending >= latest && await c.getChainId() === 5042002)
      return Object.freeze({ latest, pending })
    }),
    transactionTerms: (input, remainingGasWei, signal) => guard(signal, async () => {
      sendingTime(signal)
      escrowCheck(!termsStarted); termsStarted = true
      const action = captureOriginalEscrowBuyerAction(input); ownIntent(action.intent)
      escrowCheck(action.kind === kind && action.sender === i.client)
      const gasCapWei = escrowUint(remainingGasWei); escrowCheck(gasCapWei > 0n && gasCapWei <= i.gasBudgetWei)
      const c = client(signal); escrowCheck(await c.getChainId() === 5042002)
      const gas = (await c.estimateGas({ account: i.client, to: action.to, data: action.data, value: 0n }) * 12n + 9n) / 10n,
        maxFeePerGas = await c.getGasPrice() * 2n, nonce = await c.getTransactionCount({ address: i.client, blockTag: "pending" }),
        terms = captureEscrowTransactionTerms({ nonce, gas, maxFeePerGas, maxPriorityFeePerGas: 0n, gasCapWei })
      escrowCheck(await c.getBalance({ address: i.client, blockTag: "latest" }) >= escrowUint(i.call.amount * 10n ** 12n + gasCapWei) &&
        await c.getChainId() === 5042002)
      proposal = { action, terms }; return terms
    }),
    signTransaction: (input, signal) => guard(signal, async () => {
      sendingTime(signal)
      escrowCheck(!signingStarted && proposal !== undefined); signingStarted = true
      const p = proposal, t = escrowRecord(input, ["type", "chainId", "to", "data", "value", "nonce", "gas", "maxFeePerGas", "maxPriorityFeePerGas"])
      escrowCheck(t.type === "eip1559" && t.chainId === 5042002 && t.to === p.action.to && t.data === p.action.data && t.value === 0n &&
        t.nonce === p.terms.nonce && t.gas === p.terms.gas && t.maxFeePerGas === p.terms.maxFeePerGas && t.maxPriorityFeePerGas === 0n)
      const transaction = Object.freeze({ ...t }) as TransactionSerializableEIP1559,
        signer = await boundEscrowIO(acquire, scoped(signal), deadlineMs)
      escrowCheck(escrowAddress(signer.address) === i.client)
      const raw = await boundEscrowIO(() => signer.signTransaction(transaction), scoped(signal), deadlineMs),
        signed = await assertEscrowBuyerSigned(p.action, raw, p.terms)
      active(signal); signedRaw = signed.serialized; signedHash = signed.hash; return signed.serialized
    }),
    broadcast: (raw, signal) => guard(signal, async () => {
      sendingTime(signal)
      escrowCheck(!broadcastStarted && signedRaw !== undefined && raw === signedRaw); broadcastStarted = true
      const hash = escrowBytes32(await rpc.send(raw, scoped(signal)), false); escrowCheck(hash === signedHash); return hash
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
        assertEscrowSnapshotFresh(Number(head.timestamp), active(signal))
        if (receipt.blockNumber > head.number) { await pause(signal); continue }
        const block = await c.getBlock({ blockNumber: receipt.blockNumber })
        escrowCheck(block.number === receipt.blockNumber && block.hash === receipt.blockHash && block.timestamp <= head.timestamp && await c.getChainId() === 5042002)
        return receipt
      }
      throw Error("stopped")
    }),
    readTransaction: (hash, signal) => guard(signal, async () => {
      const txHash = escrowBytes32(hash, false), c = client(signal), tx = await c.getTransaction({ hash: txHash })
      escrowCheck(tx.type === "eip1559" && tx.chainId === 5042002 && tx.hash === txHash && tx.value === 0n &&
        (tx.accessList === undefined || tx.accessList.length === 0) && tx.blockNumber !== null && tx.blockNumber > 0n &&
        tx.blockHash !== null && [i.client, id.evaluator].includes(escrowAddress(tx.from)) &&
        [id.escrow, id.token].includes(escrowAddress(tx.to)) && (tx.yParity === 0 || tx.yParity === 1))
      const transaction = Object.freeze({ hash: txHash, from: escrowAddress(tx.from), to: escrowAddress(tx.to), input: tx.input,
        value: tx.value, nonce: tx.nonce, chainId: tx.chainId, blockHash: escrowBytes32(tx.blockHash, false), blockNumber: tx.blockNumber }),
        raw = serializeTransaction({ type: "eip1559", chainId: 5042002, to: transaction.to, data: transaction.input, value: 0n,
          nonce: tx.nonce, gas: tx.gas, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas, accessList: [] },
        { r: escrowBytes32(tx.r, false), s: escrowBytes32(tx.s, false), yParity: tx.yParity })
      escrowCheck(keccak256(raw) === txHash && escrowAddress(await recoverTransactionAddress({ serializedTransaction: raw })) === transaction.from &&
        await c.getChainId() === 5042002)
      return Object.freeze({ transaction, raw })
    })
  })
}
