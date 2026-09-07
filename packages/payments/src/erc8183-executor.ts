/** Guarded action coordinator. Concrete bounded RPC and durable storage adapters are required;
 * injected fake adapters only prove ordering, not durability or live settlement. */
import type { Hex, TransactionReceipt, TransactionSerializableEIP1559 } from "viem"
import { escrowActionContext, escrowCompletionProjection, prepareEscrowAction, ESCROW_REJECTIONS,
  type EscrowActionContext, type PreparedEscrowAction } from "./erc8183-actions.ts"
import { assertEscrowActionReceipt, assertEscrowSignedAction, captureEscrowTransactionTerms,
  type EscrowMinedTransaction, type EscrowSignedAction, type EscrowTransactionTerms } from "./erc8183-evidence.ts"
import { escrowAddress, escrowBytes32, escrowCheck, escrowRecord, escrowSeconds } from "./erc8183-codec.ts"
import type { EscrowSnapshot } from "./erc8183-request.ts"
import { assertEscrowSnapshotFresh } from "./erc8183-request.ts"
export type EscrowOperation =
  | { readonly kind: "budget" }
  | { readonly kind: "submit"; readonly outputHash: Hex }
  | { readonly kind: "complete"; readonly receipt: unknown }
  | { readonly kind: "reject"; readonly reason: string }
export interface EscrowActionClaim { readonly id: string }
export interface EscrowActionJournal {
  readonly durability: "durable" | "volatile"
  /** Must atomically enforce job/action order, request context and once-only ownership. */
  readonly claim: (context: EscrowActionContext, operation: EscrowOperation) => Promise<EscrowActionClaim | undefined>
  readonly matchSubmission: (claim: EscrowActionClaim, outputHash: Hex, submittedAt: number) => Promise<boolean>
  readonly intent: (claim: EscrowActionClaim, action: PreparedEscrowAction) => Promise<void>
  readonly prepared: (claim: EscrowActionClaim, signed: EscrowSignedAction) => Promise<void>
  readonly attempt: (claim: EscrowActionClaim, txHash: Hex) => Promise<void>
  readonly confirmed: (claim: EscrowActionClaim, proof: ReturnType<typeof assertEscrowActionReceipt>) => Promise<void>
  readonly uncertain: (claim: EscrowActionClaim, txHash: Hex | undefined) => Promise<void>
}
export interface EscrowExecutorDependencies {
  readonly signal: AbortSignal
  /** Monotonic, per-operation deadline. At most five minutes; not payment validity. */
  readonly deadlineMs: number
  readonly nowSeconds: () => number
  readonly identity: { readonly escrow: Hex; readonly hook: Hex; readonly evaluator: Hex; readonly token: Hex; readonly treasury: Hex }
  readonly journal: EscrowActionJournal
  readonly readJob: (jobId: bigint, signal: AbortSignal) => Promise<EscrowSnapshot>
  readonly readJobAt: (jobId: bigint, block: { blockNumber: bigint; blockHash: Hex }, signal: AbortSignal) => Promise<EscrowSnapshot>
  readonly providerCode: (provider: Hex, block: EscrowSnapshot, signal: AbortSignal) => Promise<Hex | undefined>
  /** Same canonical block as the job snapshot, checked for reorg before returning. */
  readonly providerNonceUsed: (packedNonce: Hex, block: EscrowSnapshot, signal: AbortSignal) => Promise<boolean>
  readonly providerAuthorization: (context: EscrowActionContext, operation: EscrowOperation, signal: AbortSignal) => Promise<unknown>
  readonly nonceState: (sender: Hex, signal: AbortSignal) => Promise<{ latest: number; pending: number }>
  readonly transactionTerms: (action: PreparedEscrowAction, signal: AbortSignal) => Promise<EscrowTransactionTerms>
  /** Signing only, never broadcasting. Coordinator recovers and compares the result. */
  readonly signTransaction: (transaction: TransactionSerializableEIP1559, signal: AbortSignal) => Promise<Hex>
  readonly broadcast: (raw: Hex, signal: AbortSignal) => Promise<Hex>
  /** Bounded read-only receipt backoff, never waitForTransactionReceipt or a send retry. */
  readonly readReceipt: (hash: Hex, signal: AbortSignal) => Promise<TransactionReceipt>
  readonly readTransaction: (hash: Hex, signal: AbortSignal) => Promise<EscrowMinedTransaction>
}
export function captureEscrowOperation(context: EscrowActionContext, input: unknown): EscrowOperation {
  const kind: unknown = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "kind")?.value : undefined
  escrowCheck(kind === "budget" || kind === "submit" || kind === "complete" || kind === "reject")
  const r = escrowRecord(input, kind === "budget" ? ["kind"] : kind === "submit" ? ["kind", "outputHash"] :
    kind === "complete" ? ["kind", "receipt"] : ["kind", "reason"])
  if (kind === "budget") return Object.freeze({ kind })
  if (kind === "submit") return Object.freeze({ kind, outputHash: escrowBytes32(r.outputHash, false) })
  if (kind === "complete") {
    const fields = escrowRecord(r.receipt, ["hubJobId", "outputHash", "treeHash", "childCount", "childTotalAtomic"])
    const receipt = Object.freeze({ ...fields })
    escrowCompletionProjection(context, receipt)
    return Object.freeze({ kind, receipt })
  }
  escrowCheck(typeof r.reason === "string" && (ESCROW_REJECTIONS as readonly string[]).includes(r.reason))
  return Object.freeze({ kind, reason: r.reason })
}

/** One executor instance is one action attempt. Journal ownership survives this instance;
 * its concrete adapter, not this process-local latch, supplies cross-restart protection. */
export function createEscrowExecutor(input: EscrowExecutorDependencies) {
  let d: EscrowExecutorDependencies
  try {
    const identity = escrowRecord(input.identity, ["escrow", "hook", "evaluator", "token", "treasury"])
    for (const key of Object.keys(identity)) identity[key] = escrowAddress(identity[key])
    escrowCheck(identity.token === "0x3600000000000000000000000000000000000000" &&
      input.journal.durability === "durable" && Number.isFinite(input.deadlineMs) &&
      input.deadlineMs > performance.now() && input.deadlineMs <= performance.now() + 300000)
    d = Object.freeze({ ...input, identity: Object.freeze({ ...identity }) as EscrowExecutorDependencies["identity"],
      journal: Object.freeze({ ...input.journal }) })
  } catch { throw new Error("escrow_executor_unavailable") }
  let invoked = false
  return Object.freeze({ async execute(context: unknown, inputOperation: unknown) {
    if (invoked) throw new Error("escrow_execution_refused")
    invoked = true
    const controller = new AbortController(), signal = AbortSignal.any([d.signal, controller.signal])
    const timer = setTimeout(() => controller.abort(), Math.max(0, d.deadlineMs - performance.now()))
    let claim: EscrowActionClaim | undefined, txHash: Hex | undefined, claimStarted = false, claimReturned = false
    let previous = 0
    const now = () => {
      const n = escrowSeconds(d.nowSeconds())
      escrowCheck(!signal.aborted && performance.now() < d.deadlineMs && n >= previous)
      previous = n; return n
    }
    const checked = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      now()
      let stopped: (() => void) | undefined
      const aborted = new Promise<never>((_, reject) => {
        stopped = () => reject(new Error("escrow_action_stopped"))
        signal.addEventListener("abort", stopped, { once: true })
      })
      try { const value = await Promise.race([work(signal), aborted]); now(); return value }
      finally { if (stopped) signal.removeEventListener("abort", stopped) }
    }
    try {
      const c = escrowActionContext(context), operation = captureEscrowOperation(c, inputOperation)
      for (const key of ["escrow", "hook", "evaluator", "token"] as const) escrowCheck(c.call[key] === d.identity[key])
      escrowCheck(c.treasury === d.identity.treasury)
      claim = await checked(() => { claimStarted = true; return d.journal.claim(c, operation) }); claimReturned = true
      escrowCheck(claim !== undefined)
      const owned = claim
      const snapshot = await checked(s => d.readJob(c.jobId, s))
      escrowCheck(await checked(s => d.providerCode(c.call.provider, snapshot, s)) === "0x")
      const senderNonce = await checked(s => d.nonceState(c.call.evaluator, s))
      escrowCheck(Number.isSafeInteger(senderNonce.latest) && senderNonce.latest >= 0 && senderNonce.latest === senderNonce.pending)
      let actionInput: unknown = operation
      if (operation.kind === "budget" || operation.kind === "submit") {
        const response = escrowRecord(await checked(s => d.providerAuthorization(c, operation, s)), ["nonce", "deadline", "signature"])
        actionInput = Object.freeze({ ...operation, ...response })
      }
      const action = await checked(() => prepareEscrowAction(c, snapshot, actionInput, now()))
      if (action.providerNonce !== undefined) {
        escrowCheck(await checked(s => d.providerNonceUsed(action.providerNonce!, snapshot, s)) === false)
      }
      if (action.kind === "complete") {
        escrowCheck(await checked(() => d.journal.matchSubmission(owned, action.outputHash!, snapshot.job.submittedAt)) === true)
      }
      await checked(() => d.journal.intent(owned, action))
      const terms = captureEscrowTransactionTerms(await checked(s => d.transactionTerms(action, s)))
      escrowCheck(terms.nonce === senderNonce.pending)
      const raw = await checked(s => d.signTransaction({ type: "eip1559", chainId: 5042002,
        to: action.to, data: action.data, value: 0n, nonce: terms.nonce, gas: terms.gas,
        maxFeePerGas: terms.maxFeePerGas, maxPriorityFeePerGas: terms.maxPriorityFeePerGas }, s))
      const signed = await checked(() => assertEscrowSignedAction(action, raw, terms)); txHash = signed.hash
      await checked(() => d.journal.prepared(owned, signed))
      await checked(() => d.journal.attempt(owned, signed.hash))
      // All slow signing/storage is behind us. Recheck current state before the ONE send.
      const refreshed = await checked(s => d.readJob(c.jobId, s))
      escrowCheck(await checked(s => d.providerCode(c.call.provider, refreshed, s)) === "0x")
      const rebound = await checked(() => prepareEscrowAction(c, refreshed, actionInput, now()))
      escrowCheck(rebound.data === action.data)
      if (action.providerNonce !== undefined) {
        escrowCheck(await checked(s => d.providerNonceUsed(action.providerNonce!, refreshed, s)) === false)
      }
      if (action.kind === "complete") {
        escrowCheck(await checked(() => d.journal.matchSubmission(owned, action.outputHash!, refreshed.job.submittedAt)) === true)
      }
      const freshNonce = await checked(s => d.nonceState(action.sender, s))
      escrowCheck(freshNonce.latest === signed.nonce && freshNonce.pending === signed.nonce)
      const sendNow = now()
      assertEscrowSnapshotFresh(refreshed.timestamp, sendNow)
      escrowCheck(action.providerDeadline === undefined || action.providerDeadline > BigInt(sendNow))
      escrowCheck(action.kind !== "budget" || c.expiredAt - sendNow >= c.call.timeoutSeconds + 600)
      escrowCheck(action.kind !== "submit" || c.expiredAt > sendNow)
      escrowCheck(action.kind !== "complete" || sendNow < c.expiredAt + 3600)
      escrowCheck(escrowBytes32(await checked(s => d.broadcast(signed.serialized, s)), false) === signed.hash)
      const receipt = await checked(s => d.readReceipt(signed.hash, s))
      const tx = await checked(s => d.readTransaction(signed.hash, s))
      const after = await checked(s => d.readJobAt(c.jobId,
        { blockNumber: receipt.blockNumber, blockHash: escrowBytes32(receipt.blockHash, false) }, s))
      const proof = assertEscrowActionReceipt(action, signed, tx, receipt, after)
      await checked(() => d.journal.confirmed(owned, proof))
      return proof
    } catch {
      if (claim !== undefined) {
        // Failed cleanup cannot erase the earlier durable reservation/attempt fence.
        let cleanupTimer: ReturnType<typeof setTimeout> | undefined
        try { await Promise.race([d.journal.uncertain(claim, txHash), new Promise<void>(resolve => {
          cleanupTimer = setTimeout(resolve, 1000)
        })]) } catch { /* Existing durable state remains authoritative. */ }
        finally { if (cleanupTimer !== undefined) clearTimeout(cleanupTimer) }
      }
      throw new Error(claim !== undefined || claimStarted && !claimReturned ? "escrow_execution_uncertain" : "escrow_execution_refused")
    } finally { clearTimeout(timer); controller.abort() }
  } })
}
