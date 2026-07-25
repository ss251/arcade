import { Schema } from "effect"

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
  createdAtMs: Schema.Number
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
