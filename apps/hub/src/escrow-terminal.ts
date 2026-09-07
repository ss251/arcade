/** Closed durable evidence codec. Trusted pipeline input only; never an RPC verifier. */
import { Schema } from "effect"
import { docBytes, hashJson, Job, JobOutcome, Receipt, ReceiptChild, EscrowReceiptEvidence, shouldSettle, treeHashOf, assertOutputSize } from "@arcade/core"
import { escrowActionContext, escrowBytes32, escrowCheck, escrowCompletionProjection, escrowFeeQuote, escrowRecord,
  escrowSeconds, escrowUint, ERC8183_ZERO_HASH, type EscrowActionContext, type EscrowActionProof } from "@arcade/payments"
type Completion = ReturnType<typeof escrowCompletionProjection>
interface Submission { readonly proof: EscrowActionProof; readonly outputHash: `0x${string}` }
export interface EscrowTerminal {
  readonly job: Job; readonly receipt: Receipt; readonly proof: EscrowActionProof | null
  readonly submission: Submission | null; readonly completion: Completion | null
}
const BIG_RECEIPT = ["priceAtomic", "sellerAtomic", "feeAtomic", "treeCeilingAtomic", "treeCommittedAtomic"]
const BIG_PROOF = ["blockNumber", "gasWei", "feeAtomic", "sellerAtomic", "refundAtomic"]
export const escrowEvidenceBytes = (value: unknown) => {
  const encoded = docBytes(value); escrowCheck(Buffer.byteLength(encoded) <= 1048576); return encoded
}
/** Convert ONLY declared metadata bigints. Unknown buyer input/output stays exact JSON. */
function fields(input: unknown, model: { prototype: object; fields: Record<string, unknown> }, big: string[] = []) {
  escrowCheck(input && typeof input === "object" && [Object.prototype, model.prototype].includes(Object.getPrototypeOf(input)))
  const result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(input)) {
    escrowCheck(typeof key === "string" && Object.hasOwn(model.fields, key))
    const d = Object.getOwnPropertyDescriptor(input, key); escrowCheck(d && d.enumerable && "value" in d)
    if (d.value !== undefined) result[key] = big.includes(key) ? String(escrowUint(d.value)) : d.value
  }
  return result
}
const revive = (input: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) if (input[key] !== undefined) {
    escrowCheck(typeof input[key] === "string" && /^(0|[1-9][0-9]{0,77})$/.test(input[key] as string))
    input[key] = escrowUint(BigInt(input[key] as string))
  }
  return input
}
export function escrowJobWire(job: Job): string {
  const wire = fields(job, Job, ["priceAtomic"])
  if (wire.outcome !== undefined) wire.outcome = fields(wire.outcome, JobOutcome)
  return escrowEvidenceBytes(wire)
}
export function decodeEscrowJob(encoded: string): Job {
  escrowCheck(Buffer.byteLength(encoded) <= 1048576)
  const value = JSON.parse(encoded)
  escrowCheck(value && typeof value === "object" && !Array.isArray(value) && typeof value.priceAtomic === "string")
  const job = Schema.decodeUnknownSync(Job, { onExcessProperty: "error" })(revive(value, ["priceAtomic"]))
  escrowCheck(escrowJobWire(job) === encoded); return job
}
export function escrowReceiptWire(receipt: Receipt): string {
  const wire = fields(receipt, Receipt, BIG_RECEIPT)
  if (wire.children !== undefined) {
    escrowCheck(Array.isArray(wire.children) && Object.getPrototypeOf(wire.children) === Array.prototype && wire.children.length <= 1000)
    // Inspect array descriptors before mapping; no sparse/accessor/extra fields.
    escrowCheck(Reflect.ownKeys(wire.children).length === wire.children.length + 1)
    const children = []
    for (let i = 0; i < wire.children.length; i++) {
      const d = Object.getOwnPropertyDescriptor(wire.children, String(i)); escrowCheck(d && d.enumerable && "value" in d)
      children.push(fields(d.value, ReceiptChild, ["priceAtomic"]))
    }
    wire.children = children
  }
  return escrowEvidenceBytes(wire)
}
export function decodeEscrowReceipt(encoded: string): Receipt {
  escrowCheck(Buffer.byteLength(encoded) <= 1048576)
  const value = JSON.parse(encoded); escrowCheck(value && typeof value === "object" && !Array.isArray(value))
  revive(value, BIG_RECEIPT)
  if (Array.isArray(value.children)) value.children = value.children.map((c: Record<string, unknown>) => revive(c, ["priceAtomic"]))
  const receipt = Schema.decodeUnknownSync(Receipt, { onExcessProperty: "error" })(value)
  escrowCheck(escrowReceiptWire(receipt) === encoded); return receipt
}
const proofKeys = ["kind", "txHash", "blockHash", "blockNumber", "blockTimestamp", "submittedAt", "gasWei", "feeAtomic", "sellerAtomic", "refundAtomic"]
function captureProof(raw: unknown): EscrowActionProof {
  const p = escrowRecord(raw, proofKeys)
  escrowCheck(["submit", "complete", "reject"].includes(p.kind as string))
  const result = { kind: p.kind as EscrowActionProof["kind"], txHash: escrowBytes32(p.txHash, false), blockHash: escrowBytes32(p.blockHash, false),
    blockNumber: escrowUint(p.blockNumber), blockTimestamp: escrowSeconds(p.blockTimestamp), submittedAt: escrowSeconds(p.submittedAt),
    gasWei: escrowUint(p.gasWei), feeAtomic: escrowUint(p.feeAtomic), sellerAtomic: escrowUint(p.sellerAtomic), refundAtomic: escrowUint(p.refundAtomic) }
  escrowCheck(result.blockNumber > 0n && result.blockTimestamp > 0 && result.submittedAt <= result.blockTimestamp)
  return result
}
const proofWire = (p: EscrowActionProof | null) => p === null ? null : Object.fromEntries(Object.entries(p).map(([k, v]) => [k, BIG_PROOF.includes(k) ? String(v) : v]))
export function escrowTerminalEvidence(raw: unknown, rawProof: unknown): EscrowReceiptEvidence {
  const c = escrowActionContext(raw), proof = rawProof === null ? null : captureProof(rawProof)
  const base = { protocol: "arcade:erc8183:terminal:v1", chainId: 5042002, escrow: c.call.escrow,
    jobId: String(c.jobId), requestHash: c.requestHash, amountAtomic: String(c.call.amount) }
  if (proof === null) return Schema.decodeUnknownSync(EscrowReceiptEvidence)({ ...base, state: "uncertain" })
  escrowCheck(proof.kind === "complete" || proof.kind === "reject")
  const { kind, ...evidence } = proofWire(proof)!
  return Schema.decodeUnknownSync(EscrowReceiptEvidence)({ ...base, state: kind === "complete" ? "settled" : "refunded", ...evidence })
}
/** All proof facts must come from guarded rail results. Shape validation cannot establish provenance. */
export function captureEscrowTerminal(rawContext: unknown, raw: unknown): EscrowTerminal {
  const c = escrowActionContext(rawContext), v = escrowRecord(raw, ["job", "receipt", "proof", "submission", "completion"])
  const job = decodeEscrowJob(escrowJobWire(v.job as Job)), receipt = decodeEscrowReceipt(escrowReceiptWire(v.receipt as Receipt))
  const proof = v.proof === null ? null : captureProof(v.proof)
  const submitted = v.submission === null ? null : escrowRecord(v.submission, ["proof", "outputHash"])
  const submission = submitted === null ? null : { proof: captureProof(submitted.proof), outputHash: escrowBytes32(submitted.outputHash, false) }
  const evidence = escrowTerminalEvidence(c, proof), fee = escrowFeeQuote(c.call.amount), outcome = job.outcome
  const millis = (n: number) => Number.isSafeInteger(n) && n >= 0
  escrowCheck(job.status !== "queued" && job.status !== "running" && job.rootJobId === job.id && job.parentJobId === undefined && job.hop === 0 &&
    job.ancestors?.length === 0 && job.skillId === c.call.skillId && job.seller === c.call.provider && job.buyer === c.client &&
    job.priceAtomic === c.call.amount && hashJson(job.input) === c.call.inputHash && millis(job.createdAtMs) &&
    outcome !== undefined && outcome.status === job.status && millis(outcome.startedAtMs) && millis(outcome.finishedAtMs) &&
    outcome.startedAtMs >= job.createdAtMs && outcome.finishedAtMs >= outcome.startedAtMs)
  escrowCheck(receipt.jobId === job.id && receipt.skillId === job.skillId && receipt.skillVersion === c.call.skillVersion &&
    receipt.buyer === job.buyer && receipt.seller === job.seller && receipt.priceAtomic === c.call.amount && receipt.feeBps === 500 &&
    receipt.sellerAtomic === fee.sellerAtomic && receipt.feeAtomic === fee.feeAtomic && receipt.rail === "erc8183" && receipt.network === "eip155:5042002" &&
    receipt.rootJobId === job.id && receipt.parentJobId === undefined && receipt.hop === 0 && receipt.ancestors?.length === 0 &&
    millis(receipt.createdAtMs) && receipt.createdAtMs >= outcome.finishedAtMs && receipt.latencyMs === receipt.createdAtMs - job.createdAtMs &&
    docBytes(receipt.escrow) === docBytes(evidence))
  for (const k of ["feeAccrualId", "feeSweepTx", "authorizationNonce", "sessionId", "receiptSignature", "canary"] as const) escrowCheck(receipt[k] === undefined)
  escrowCheck(receipt.sellerCostUsd === outcome.costUsd && (outcome.costUsd === undefined || Number.isFinite(outcome.costUsd) && outcome.costUsd >= 0))
  if (proof !== null) escrowCheck(receipt.createdAtMs >= proof.blockTimestamp * 1000)
  let completion: Completion | null = null
  if (evidence.state === "settled") {
    assertOutputSize(outcome.output)
    escrowCheck(receipt.settled && shouldSettle(outcome, true).settle && receipt.reason === "ok" && receipt.settleTx === proof!.txHash && receipt.settleRefKind === "onchain")
    const s = submission?.proof
    escrowCheck(s !== undefined && s.kind === "submit" && s.feeAtomic === 0n && s.sellerAtomic === 0n && s.refundAtomic === 0n &&
      s.submittedAt === s.blockTimestamp && s.submittedAt === proof!.submittedAt && s.txHash !== proof!.txHash &&
      s.blockNumber < proof!.blockNumber && s.blockTimestamp <= proof!.blockTimestamp &&
      submission!.outputHash === hashJson(outcome.output))
    const children = receipt.children ?? []
    escrowCheck(children.length <= 1000 && new Set(children.map(child => child.jobId)).size === children.length &&
      children.every(child => child.jobId !== job.id && child.priceAtomic > 0n && child.priceAtomic < 2n ** 256n))
    const treeHash = children.length === 0 ? ERC8183_ZERO_HASH : treeHashOf(job.id, children)
    escrowCheck(children.length === 0 ? receipt.treeHash === undefined || receipt.treeHash === treeHash : receipt.treeHash === treeHash)
    completion = escrowCompletionProjection(c, { hubJobId: job.id, outputHash: hashJson(outcome.output), treeHash,
      childCount: children.length, childTotalAtomic: children.reduce((sum, child) => sum + (child.settled ? child.priceAtomic : 0n), 0n) })
    const supplied = escrowRecord(v.completion, ["bytes", "hash", "outputHash", "tree"])
    const tree = escrowRecord(supplied.tree, ["treeHash", "childCount", "childTotalAtomic"])
    escrowCheck(supplied.bytes === completion.bytes && supplied.hash === completion.hash && supplied.outputHash === completion.outputHash &&
      tree.treeHash === completion.tree.treeHash && tree.childCount === completion.tree.childCount && tree.childTotalAtomic === completion.tree.childTotalAtomic)
  } else {
    escrowCheck(!receipt.settled && receipt.settleTx === undefined && receipt.settleRefKind === undefined && submission === null && v.completion === null &&
      receipt.reason === (evidence.state === "refunded" ? "escrow refunded" : "escrow outcome uncertain; reconciliation required"))
  }
  return { job, receipt, proof, submission, completion }
}
export function escrowTerminalWire(t: EscrowTerminal): string {
  return escrowEvidenceBytes({ job: JSON.parse(escrowJobWire(t.job)), receipt: JSON.parse(escrowReceiptWire(t.receipt)),
    proof: proofWire(t.proof), submission: t.submission === null ? null : { proof: proofWire(t.submission.proof), outputHash: t.submission.outputHash }, completion: t.completion === null ? null :
      { ...t.completion, tree: { ...t.completion.tree, childTotalAtomic: String(t.completion.tree.childTotalAtomic) } } })
}
export function decodeEscrowTerminal(context: EscrowActionContext, encoded: string): EscrowTerminal {
  escrowCheck(Buffer.byteLength(encoded) <= 1048576)
  const wire = JSON.parse(encoded)
  const raw = escrowRecord(wire, ["job", "receipt", "proof", "submission", "completion"])
  const t = captureEscrowTerminal(context, { job: decodeEscrowJob(docBytes(raw.job)), receipt: decodeEscrowReceipt(docBytes(raw.receipt)),
    proof: raw.proof === null ? null : revive(raw.proof as Record<string, unknown>, BIG_PROOF),
    submission: raw.submission === null ? null : { ...(raw.submission as Submission),
      proof: revive((raw.submission as unknown as { proof: Record<string, unknown> }).proof, BIG_PROOF) },
    completion: raw.completion === null ? null : { ...(raw.completion as Completion),
      tree: revive((raw.completion as unknown as { tree: Record<string, unknown> }).tree, ["childTotalAtomic"]) } })
  escrowCheck(escrowTerminalWire(t) === encoded); return t
}
