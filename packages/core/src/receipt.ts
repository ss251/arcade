import { Schema } from "effect"
import { keccak256, toHex } from "viem"

/**
 * The receipt is the product's trust artifact: it is what makes the take-rate auditable
 * and what gates a rating (only a paying caller holds one).
 *
 * The platform fee is ACCRUED, not settled per call — two on-chain cheques would cost
 * ~4.4% of a $0.10 call on the EIP-3009 rail (measured: 0.00218 USDC/settlement).
 * `feeSweepTx` is backfilled into every receipt a sweep covers, so the fee is still
 * traceable on-chain; it is simply batched, exactly as Gateway batches settlement.
 */

export const RailName = Schema.Literal("eip3009", "gateway", "test")
export type RailName = typeof RailName.Type

export class ReceiptChild extends Schema.Class<ReceiptChild>("ReceiptChild")({
  jobId: Schema.String,
  skillId: Schema.String,
  priceAtomic: Schema.BigIntFromSelf,
  settled: Schema.Boolean,
  settleTx: Schema.optional(Schema.String)
}) {}

/** Canonical, order-independent commitment to a receipt tree. Committed on chain by FeeSplitter v2. */
export const treeHashOf = (rootJobId: string, children: ReadonlyArray<ReceiptChild>): `0x${string}` => {
  const sorted = [...children].sort((a, b) => (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0))
  const canonical = JSON.stringify({
    rootJobId,
    children: sorted.map((c) => ({ jobId: c.jobId, skillId: c.skillId, priceAtomic: c.priceAtomic.toString(), settleTx: c.settleTx ?? null }))
  })
  return keccak256(toHex(canonical))
}

export class Receipt extends Schema.Class<Receipt>("Receipt")({
  jobId: Schema.String,
  skillId: Schema.String,
  skillVersion: Schema.String,
  buyer: Schema.String,
  seller: Schema.String,

  /** Total charged to the buyer, 6-dec atomic. */
  priceAtomic: Schema.BigIntFromSelf,
  /** Seller's share. `sellerAtomic + feeAtomic === priceAtomic`, exactly. */
  sellerAtomic: Schema.BigIntFromSelf,
  /** Platform fee. */
  feeAtomic: Schema.BigIntFromSelf,
  feeBps: Schema.Int,

  /**
   * What the seller spent on inference to produce this, in USD, as reported by the engine.
   *
   * A marketplace that shows a seller their revenue and not their cost is showing them
   * half a business, and on a per-call product where one run can cost more than it earns
   * it is the half that decides whether the listing stays up. Absent for engines with no
   * inference cost (a script) and for jobs that never reached one.
   */
  sellerCostUsd: Schema.optional(Schema.Number),

  /** On-chain settlement of the seller's share. Absent when the job did not settle. */
  settleTx: Schema.optional(Schema.String),
  /** Accrual bucket this receipt's fee belongs to. */
  feeAccrualId: Schema.optional(Schema.String),
  /** Backfilled once the accrual bucket is swept on-chain. */
  feeSweepTx: Schema.optional(Schema.String),

  rail: RailName,
  network: Schema.String,

  /** Wall-clock from job creation to terminal state. */
  latencyMs: Schema.Number,
  /** True when settlement occurred; false records an honest non-settlement. */
  settled: Schema.Boolean,
  /** Why we did or didn't settle — surfaced to the buyer verbatim. */
  reason: Schema.String,
  createdAtMs: Schema.Number,

  rootJobId: Schema.optional(Schema.String),
  parentJobId: Schema.optional(Schema.String),
  hop: Schema.optional(Schema.Int),
  ancestors: Schema.optional(Schema.Array(Schema.String)),
  /** Direct children settled or refused under this job. Present on parents only. */
  children: Schema.optional(Schema.Array(ReceiptChild)),
  /** keccak256 of the canonical tree; the value FeeSplitterV2 committed at settlement. */
  treeHash: Schema.optional(Schema.String),
  /** The EIP-3009 nonce of this settlement, for matching the splitter's Settled event. */
  authorizationNonce: Schema.optional(Schema.String),
  treeCeilingAtomic: Schema.optional(Schema.BigIntFromSelf),
  treeCommittedAtomic: Schema.optional(Schema.BigIntFromSelf),
  /** EIP-191 signature by the hub attester over the canonical receipt JSON. */
  receiptSignature: Schema.optional(Schema.String)
}) {}

/** A rating can only be created by presenting a settled receipt — fake reviews cost real USDC. */
export class Rating extends Schema.Class<Rating>("Rating")({
  receiptJobId: Schema.String,
  skillId: Schema.String,
  skillVersion: Schema.String,
  buyer: Schema.String,
  stars: Schema.Int.pipe(Schema.between(1, 5)),
  comment: Schema.optional(Schema.String.pipe(Schema.maxLength(500))),
  createdAtMs: Schema.Number
}) {}

/** Platform-computed, unfakeable half of a listing's reputation. */
export class ObjectiveStats extends Schema.Class<ObjectiveStats>("ObjectiveStats")({
  skillId: Schema.String,
  calls: Schema.Int,
  settled: Schema.Int,
  /** settled / calls */
  successRate: Schema.Number,
  p50LatencyMs: Schema.Number,
  p95LatencyMs: Schema.Number,
  /** Fraction of the trailing window a runner was connected for this skill. */
  availability: Schema.Number
}) {}

export const encodeReceipt = Schema.encode(Receipt)
export const decodeReceipt = Schema.decodeUnknown(Receipt)
