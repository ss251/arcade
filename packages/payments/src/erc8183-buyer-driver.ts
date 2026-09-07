/** Once-only buyer coordinator. Concrete independently pinned chain ports and durable
 * private storage are mandatory. Importing this module acquires no key or authority. */
import { docBytes, hashJson } from "@arcade/core"
import type { Hex, TransactionReceipt, TransactionSerializableEIP1559 } from "viem"
import { assertEscrowBuyerBudgetReceipt, assertEscrowBuyerReceipt, assertEscrowBuyerSigned, escrowBuyerCreatedJobId } from "./erc8183-buyer-evidence.ts"
import { assertEscrowBuyerReserve, createEscrowBuyerIntent, prepareEscrowBuyerAction,
  type EscrowBuyerIntent, type PreparedEscrowBuyerAction } from "./erc8183-buyer-intent.ts"
import { createEscrowBuyerHttp, escrowBuyerUrl } from "./erc8183-buyer-http.ts"
import type { EscrowBuyerClaim, openEscrowBuyerJournal } from "./erc8183-buyer-journal.ts"
import { captureEscrowJob, escrowBytes32, escrowCheck, escrowRecord, escrowSeconds, escrowUint } from "./erc8183-codec.ts"
import { captureEscrowTransactionTerms, type EscrowMinedTransaction, type EscrowTransactionTerms } from "./erc8183-evidence.ts"
import { captureEscrowIdentity, type EscrowDeploymentSnapshot } from "./erc8183-reader.ts"
import type { EscrowSnapshot } from "./erc8183-request.ts"
import { boundEscrowIO } from "./erc8183-rpc.ts"
type Kind = PreparedEscrowBuyerAction["kind"]
type Frame = EscrowDeploymentSnapshot | EscrowSnapshot
export interface EscrowBuyerChain {
  readonly readDeployment: (signal: AbortSignal) => Promise<EscrowDeploymentSnapshot>
  readonly readJob: (jobId: bigint, signal: AbortSignal) => Promise<EscrowSnapshot>
  readonly readJobAt: (jobId: bigint, block: { blockNumber: bigint; blockHash: Hex }, signal: AbortSignal) => Promise<EscrowSnapshot>
  /** All observations at the supplied canonical block, with a closing check. */
  readonly observe: (intent: EscrowBuyerIntent, frame: Frame, signal: AbortSignal) => Promise<{
    providerCode: Hex; nativeBalanceWei: bigint; allowanceAtomic: bigint
  }>
  readonly allowanceAt: (intent: EscrowBuyerIntent, frame: EscrowSnapshot, signal: AbortSignal) => Promise<bigint>
  readonly nonceState: (signal: AbortSignal) => Promise<{ latest: number; pending: number }>
  readonly transactionTerms: (action: PreparedEscrowBuyerAction, remainingGasWei: bigint, signal: AbortSignal) => Promise<EscrowTransactionTerms>
  readonly signTransaction: (transaction: TransactionSerializableEIP1559, signal: AbortSignal) => Promise<Hex>
  readonly broadcast: (raw: Hex, signal: AbortSignal) => Promise<Hex>
  readonly readReceipt: (hash: Hex, signal: AbortSignal) => Promise<TransactionReceipt>
  /** raw must be reconstructed from the independently fetched mined transaction. */
  readonly readTransaction: (hash: Hex, signal: AbortSignal) => Promise<{ transaction: EscrowMinedTransaction; raw: Hex }>
}
export interface EscrowBuyerDriverOptions {
  readonly signal: AbortSignal; readonly deadlineMs: number; readonly nowSeconds: () => number
  readonly journal: ReturnType<typeof openEscrowBuyerJournal>["journal"]
  /** Three separate one-broadcast ports, each pinned to the exact same local identity/buyer. */
  readonly chain: (kind: Kind, intent: EscrowBuyerIntent) => EscrowBuyerChain
  readonly fetch?: typeof globalThis.fetch
  /** Existing ENS/request authority check, before any gas and again before each signature/send. */
  readonly beforeSign: (intent: EscrowBuyerIntent) => null | string
}
function captureFrame(input: Frame): Frame {
  const deployment = Object.hasOwn(input, "identity"), r = escrowRecord(input, deployment ?
    ["identity", "chainId", "escrow", "blockNumber", "blockHash", "timestamp"] :
    ["chainId", "escrow", "blockNumber", "blockHash", "timestamp", "jobId", "pendingClaimHash", "job"])
  const common = { chainId: r.chainId, escrow: r.escrow, blockNumber: escrowUint(r.blockNumber),
    blockHash: escrowBytes32(r.blockHash, false), timestamp: escrowSeconds(r.timestamp) }
  return Object.freeze(deployment ? { ...common, identity: captureEscrowIdentity(r.identity) } :
    { ...common, jobId: escrowUint(r.jobId), pendingClaimHash: escrowBytes32(r.pendingClaimHash), job: captureEscrowJob(r.job) }) as Frame
}
export function createEscrowBuyerDriver(options: EscrowBuyerDriverOptions) {
  const d = Object.freeze({ ...options, journal: Object.freeze({ ...options.journal }) })
  escrowCheck(d.journal.durability === "durable" && Number.isFinite(d.deadlineMs) &&
    d.deadlineMs > performance.now() && d.deadlineMs <= performance.now() + 300000)
  let invoked = false
  return Object.freeze({ async execute(input: unknown, body: string) {
    if (invoked) throw Error("escrow_buyer_refused")
    invoked = true
    const controller = new AbortController(), signal = AbortSignal.any([d.signal, controller.signal]),
      timer = setTimeout(() => controller.abort(), Math.max(0, d.deadlineMs - performance.now()))
    let claim: EscrowBuyerClaim | undefined, claiming = false, claimReturned = false, previous = 0,
      spent = 0n, jobId: bigint | undefined, nextNonce: number | undefined
    let accepted: Awaited<ReturnType<ReturnType<typeof createEscrowBuyerHttp>["root"]>> | undefined
    const now = () => {
      const n = escrowSeconds(d.nowSeconds())
      escrowCheck(!signal.aborted && performance.now() < d.deadlineMs && n >= previous); previous = n; return n
    }
    const checked = async <T>(work: (s: AbortSignal) => Promise<T>, maximumMs = 5000) => {
      now(); const value = await boundEscrowIO(work, signal, d.deadlineMs, maximumMs); now(); return value
    }
    try {
      const i = createEscrowBuyerIntent(input), r = escrowRecord(input, ["identity", "call", "requirements", "client", "issuedAt",
        "expiresInSeconds", "capability", "maxAmountAtomic", "gasBudgetWei"]), capability = escrowBytes32(r.capability, false)
      escrowBuyerUrl(i.call.resource)
      escrowCheck(i.client !== i.call.evaluator && typeof body === "string" && Buffer.byteLength(body) <= 131072)
      const parsed: unknown = JSON.parse(body)
      escrowCheck(docBytes(parsed) === body && hashJson(parsed) === i.call.inputHash)
      const source = Object.freeze({ identity: i.identity, call: i.call, requirements: i.requirements, client: i.client,
        issuedAt: i.issuedAt, expiresInSeconds: i.expiredAt - i.issuedAt, capability,
        maxAmountAtomic: i.maxAmountAtomic, gasBudgetWei: i.gasBudgetWei })
      escrowCheck(createEscrowBuyerIntent(source).id === i.id)
      const authority = () => { escrowCheck(now() >= i.issuedAt && now() <= i.fundBy && d.beforeSign(i) === null); now() }
      authority()
      claim = await checked(async () => { claiming = true; const c = await d.journal.claim(source, body); claim = c; claimReturned = true; return c })
      escrowCheck(claim !== undefined); const owned = claim
      const http = createEscrowBuyerHttp({ signal, deadlineMs: d.deadlineMs, fetch: d.fetch ?? globalThis.fetch })
      await checked(s => http.health(i, s))
      const proofs: ReturnType<typeof assertEscrowBuyerReceipt>[] = []
      const nonce = async (port: EscrowBuyerChain) => {
        const n = escrowRecord(await checked(s => port.nonceState(s)), ["latest", "pending"])
        escrowCheck(typeof n.latest === "number" && Number.isSafeInteger(n.latest) && n.latest >= 0 && n.latest === n.pending &&
          (nextNonce === undefined || n.latest === nextNonce)); return n.latest
      }
      const transaction = async (kind: Kind) => {
        const p = Object.freeze({ ...d.chain(kind, i) })
        const preflight = async () => {
          const frame = captureFrame(await checked<Frame>(s => kind === "create" ? p.readDeployment(s) : p.readJob(jobId!, s)))
          const observed = escrowRecord(await checked(s => p.observe(i, frame, s)), ["providerCode", "nativeBalanceWei", "allowanceAtomic"])
          escrowCheck(observed.providerCode === "0x")
          const reserve = assertEscrowBuyerReserve(i, escrowUint(observed.nativeBalanceWei), spent), allowance = escrowUint(observed.allowanceAtomic)
          escrowCheck(allowance === (kind === "fund" ? i.call.amount : 0n))
          const preparedAt = now(), action = prepareEscrowBuyerAction(i, frame,
            kind === "create" ? { kind } : { kind, jobId: jobId!, allowanceAtomic: allowance }, preparedAt)
          return { frame, allowance, reserve, preparedAt, action }
        }
        authority(); const pre = await preflight(), n = await nonce(p)
        await checked(() => d.journal.intent(owned, pre.action, pre.frame, pre.preparedAt, kind === "create" ? undefined : pre.allowance))
        const terms = captureEscrowTransactionTerms(await checked(s => p.transactionTerms(pre.action, pre.reserve.remainingGasWei, s)))
        escrowCheck(terms.nonce === n && terms.gasCapWei <= pre.reserve.remainingGasWei)
        authority()
        const raw = await checked(s => p.signTransaction({ type: "eip1559", chainId: 5042002, to: pre.action.to,
          data: pre.action.data, value: 0n, nonce: terms.nonce, gas: terms.gas,
          maxFeePerGas: terms.maxFeePerGas, maxPriorityFeePerGas: terms.maxPriorityFeePerGas }, s)),
          signed = await checked(() => assertEscrowBuyerSigned(pre.action, raw, terms))
        await checked(() => d.journal.prepared(owned, signed)); await checked(() => d.journal.attempt(owned, signed.hash))
        const fresh = await preflight(); escrowCheck(fresh.action.data === pre.action.data && await nonce(p) === signed.nonce)
        authority()
        escrowCheck(escrowBytes32(await checked(s => p.broadcast(signed.serialized, s)), false) === signed.hash)
        // Receipt backoff is read-only and independently bounded by the concrete port.
        const receipt = await checked(s => p.readReceipt(signed.hash, s), 65000), mined = await checked(s => p.readTransaction(signed.hash, s))
        const id = kind === "create" ? escrowBuyerCreatedJobId(pre.action, signed, receipt) : jobId!
        const after = captureFrame(await checked(s => p.readJobAt(id,
          { blockNumber: receipt.blockNumber, blockHash: escrowBytes32(receipt.blockHash, false) }, s))) as EscrowSnapshot
        const allowance = kind === "create" ? undefined : await checked(s => p.allowanceAt(i, after, s))
        const proof = assertEscrowBuyerReceipt(pre.action, signed, mined.transaction, receipt, after, allowance)
        await checked(() => d.journal.confirmed(owned, proof))
        spent += proof.gasWei; escrowCheck(spent <= i.gasBudgetWei); nextNonce = signed.nonce + 1; jobId = id; proofs.push(proof)
        return p
      }
      const create = await transaction("create")
      authority(); await checked(() => d.journal.httpAttempt(owned, "budget"))
      const budget = await checked(s => http.budget(i, jobId!, capability, body, s)),
        receipt = await checked(s => create.readReceipt(budget.budgetTx, s), 65000),
        mined = await checked(s => create.readTransaction(budget.budgetTx, s)),
        after = captureFrame(await checked(s => create.readJobAt(jobId!,
          { blockNumber: receipt.blockNumber, blockHash: escrowBytes32(receipt.blockHash, false) }, s))) as EscrowSnapshot,
        budgetProof = await checked(() => assertEscrowBuyerBudgetReceipt(i, jobId!, mined.raw, mined.transaction, receipt, after))
      escrowCheck(budgetProof.txHash === budget.budgetTx)
      await checked(() => d.journal.budgetConfirmed(owned, budgetProof)); proofs.push(budgetProof)
      await transaction("approve"); await transaction("fund")
      authority(); await checked(() => d.journal.httpAttempt(owned, "root"))
      await checked(async s => { accepted = await http.root(i, jobId!, capability, body, s); return accepted })
      await checked(() => d.journal.accepted(owned, accepted!.accepted))
      return Object.freeze({ response: accepted!.response(), evidence: Object.freeze({ rail: "erc8183" as const,
        state: "funded_and_queued" as const, intentId: i.id, jobId: jobId!, fundedAtomic: i.call.amount,
        buyerGasWei: spent, proofs: Object.freeze(proofs) }) })
    } catch {
      if (claim !== undefined) {
        // A captured valid result capability remains recoverable even if cancellation
        // lands just after its response. No cleanup path signs or dispatches a payment.
        const cleanup = new AbortController()
        try { await boundEscrowIO(async () => {
          if (accepted) { try { await d.journal.accepted(claim!, accepted.accepted) } catch { /* May already be accepted. */ } }
          await d.journal.uncertain(claim!)
        }, cleanup.signal, performance.now() + 1000, 1000) } catch { /* Earlier durable fence remains. */ }
        finally { cleanup.abort() }
      }
      throw Error(claim !== undefined || claiming && !claimReturned ? "escrow_buyer_uncertain" : "escrow_buyer_refused")
    } finally { clearTimeout(timer); controller.abort() }
  } })
}
