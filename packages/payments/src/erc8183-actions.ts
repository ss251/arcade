/** Offline action/receipt contracts. Preparing calldata is NOT permission to broadcast. */
import { docBytes, hashJson } from "@arcade/core"
import { encodeFunctionData, toHex, type Hex } from "viem"
import { ERC8183_ABI } from "./erc8183-abi.ts"
import { encodeSetBudgetRelay, encodeSubmitRelay, packProviderNonce } from "./erc8183-auth.ts"
import { captureEscrowJob, encodeEscrowCommitment, escrowAddress, escrowBytes32, escrowCheck, escrowFeeQuote,
  escrowRecord, escrowSeconds, escrowUint, EscrowFactsRefused, ERC8183_ZERO, ERC8183_ZERO_HASH } from "./erc8183-codec.ts"
import { assertEscrowSnapshotFresh, captureEscrowCall, type EscrowSnapshot } from "./erc8183-request.ts"
export function escrowActionContext(input: unknown) {
  try {
    const c = escrowRecord(input, ["call", "jobId", "client", "expiredAt", "requestHash", "treasury"])
    const jobId = escrowUint(c.jobId); escrowCheck(jobId > 0n)
    return Object.freeze({ call: captureEscrowCall(c.call), jobId, client: escrowAddress(c.client),
      expiredAt: escrowSeconds(c.expiredAt), requestHash: escrowBytes32(c.requestHash, false), treasury: escrowAddress(c.treasury) })
  } catch { throw new EscrowFactsRefused() }
}
export type EscrowActionContext = ReturnType<typeof escrowActionContext>
/** Versioned pre-settlement receipt projection, NOT the hash of the eventual final receipt.
 * Exact bytes must be durably committed before sending complete. No transaction hash,
 * wall-clock terminal fields, capability, raw input/output or later attestation is included. */
export function escrowCompletionProjection(context: unknown, input: unknown) {
  try {
    const c = escrowActionContext(context), r = escrowRecord(input, ["hubJobId", "outputHash", "treeHash", "childCount", "childTotalAtomic"])
    escrowCheck(typeof r.hubJobId === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(r.hubJobId))
    const tree = Object.freeze({ treeHash: escrowBytes32(r.treeHash), childCount: r.childCount as number,
      childTotalAtomic: escrowUint(r.childTotalAtomic) })
    const outputHash = escrowBytes32(r.outputHash, false), fee = escrowFeeQuote(c.call.amount)
    const projection = { protocol: "arcade:erc8183:receipt:v1", decision: "validated-success",
      hubJobId: r.hubJobId, chainId: c.call.chainId, escrow: c.call.escrow, hook: c.call.hook,
      evaluator: c.call.evaluator, treasury: c.treasury, escrowJobId: c.jobId.toString(), requestHash: c.requestHash,
      skillId: c.call.skillId, skillVersion: c.call.skillVersion, buyer: c.client, seller: c.call.provider, token: c.call.token,
      priceAtomic: c.call.amount.toString(), sellerAtomic: fee.sellerAtomic.toString(), feeAtomic: fee.feeAtomic.toString(),
      feeBps: 500, outputHash, treeHash: tree.treeHash, childCount: tree.childCount, childTotalAtomic: tree.childTotalAtomic.toString() }
    const hash = hashJson(projection), bytes = docBytes(projection)
    // Validate coherent tree shape and the actual resulting receipt hash; no dummy hash.
    encodeEscrowCommitment({ ...tree, receiptHash: hash })
    return Object.freeze({ bytes, hash, outputHash, tree })
  } catch { throw new EscrowFactsRefused() }
}
export const ESCROW_COMPLETE_REASON = toHex("arcade-settled", { size: 32 })
const REJECTIONS = ["declined", "runner_lost", "timeout", "output_invalid", "execution_failed"] as const
export interface PreparedEscrowAction {
  readonly kind: "budget" | "submit" | "complete" | "reject"
  readonly context: EscrowActionContext
  readonly chainId: 5042002; readonly sender: Hex; readonly to: Hex; readonly value: 0n; readonly data: Hex
  readonly providerNonce: Hex | undefined; readonly providerDeadline: bigint | undefined
  readonly outputHash: Hex | undefined; readonly reason: Hex | undefined
  readonly receipt: ReturnType<typeof escrowCompletionProjection> | undefined
}
function baseJob(context: EscrowActionContext, snapshot: EscrowSnapshot, nowSeconds: number) {
  const c = context.call, job = captureEscrowJob(snapshot.job), now = escrowSeconds(nowSeconds)
  assertEscrowSnapshotFresh(snapshot.timestamp, now)
  escrowCheck(snapshot.chainId === c.chainId && escrowAddress(snapshot.escrow) === c.escrow &&
    escrowUint(snapshot.jobId) === context.jobId && escrowUint(snapshot.blockNumber) > 0n)
  escrowBytes32(snapshot.blockHash, false)
  escrowCheck(job.client === context.client && job.provider === c.provider && job.evaluator === c.evaluator &&
    job.hook === c.hook && job.providerAgentId === c.providerAgentId && job.expiredAt === context.expiredAt &&
    job.description === "arcade:erc8183:request:v1:" + context.requestHash &&
    job.client !== job.provider && job.evaluator !== job.provider && job.settledAmount === 0n &&
    escrowBytes32(snapshot.pendingClaimHash) === ERC8183_ZERO_HASH &&
    (job.payoutReceiver === ERC8183_ZERO || job.payoutReceiver === c.provider))
  return job
}
/** Trusted context must originate from verified capability + durable admission, not HTTP.
 * The executor must separately check unused provider nonce at this same canonical block,
 * deployment identity, EOA provider code, gas/sender nonce and durable action claims.
 * This helper has no RPC, signing callback, journal or send capability. */
export async function prepareEscrowAction(
  context: unknown, snapshot: EscrowSnapshot, input: unknown, nowSeconds: number
): Promise<PreparedEscrowAction> {
  try {
    const c = escrowActionContext(context), job = baseJob(c, snapshot, nowSeconds)
    const kind: unknown = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "kind")?.value : undefined
    escrowCheck(kind === "budget" || kind === "submit" || kind === "complete" || kind === "reject")
    const action = escrowRecord(input, kind === "budget" ? ["kind", "nonce", "deadline", "signature"] :
      kind === "submit" ? ["kind", "nonce", "deadline", "signature", "outputHash"] :
      kind === "complete" ? ["kind", "receipt"] : ["kind", "reason"])
    let data: Hex, providerNonce: Hex | undefined, providerDeadline: bigint | undefined, outputHash: Hex | undefined,
      reason: Hex | undefined, receipt: ReturnType<typeof escrowCompletionProjection> | undefined
    if (kind === "budget") {
      escrowCheck(job.status === 0 && job.budget === 0n && job.paymentToken === ERC8183_ZERO &&
        job.submittedAt === 0 && job.expiredAt - nowSeconds >= c.call.timeoutSeconds + 600)
    } else {
      escrowCheck(job.budget === c.call.amount && job.paymentToken === c.call.token &&
        (job.status === 1 ? job.submittedAt === 0 : job.status === 2 && job.submittedAt > 0 && job.submittedAt <= nowSeconds))
    }
    if (kind === "budget" || kind === "submit") {
      if (kind === "submit") escrowCheck(job.status === 1 && job.expiredAt > nowSeconds)
      const base = { chainId: c.call.chainId, escrow: c.call.escrow, signer: c.call.provider, jobId: c.jobId,
        nonce: escrowUint(action.nonce, 72), deadline: escrowUint(action.deadline) }
      providerNonce = packProviderNonce(base.signer, base.nonce); providerDeadline = base.deadline
      if (kind === "budget") data = await encodeSetBudgetRelay({ ...base, token: c.call.token, amount: c.call.amount },
        action.signature, nowSeconds)
      else {
        outputHash = escrowBytes32(action.outputHash, false)
        data = await encodeSubmitRelay({ ...base, deliverable: outputHash }, action.signature, nowSeconds)
      }
    } else if (kind === "complete") {
      // Upstream permits complete after expiry until refund wins. The new executor
      // refuses once permissionless Submitted refund is available; no upstream rule changes.
      escrowCheck(job.status === 2 && nowSeconds < job.expiredAt + 3600)
      receipt = escrowCompletionProjection(c, action.receipt); outputHash = receipt.outputHash
      reason = ESCROW_COMPLETE_REASON
      data = encodeFunctionData({ abi: ERC8183_ABI, functionName: "complete", args: [c.jobId, reason,
        encodeEscrowCommitment({ ...receipt.tree, receiptHash: receipt.hash })] })
    } else {
      escrowCheck(typeof action.reason === "string" && (REJECTIONS as readonly string[]).includes(action.reason))
      reason = toHex("arcade-" + action.reason, { size: 32 })
      data = encodeFunctionData({ abi: ERC8183_ABI, functionName: "reject", args: [c.jobId, reason, "0x"] })
    }
    return Object.freeze({ kind, context: c, chainId: c.call.chainId, sender: c.call.evaluator, to: c.call.escrow,
      value: 0n as const, data, providerNonce, providerDeadline, outputHash, reason, receipt })
  } catch { throw new EscrowFactsRefused() }
}
