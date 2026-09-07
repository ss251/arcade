/** Terminal evidence data, NOT execution authority or an RPC proof verifier. */
import { Schema } from "effect"

const uint = (positive = false) => Schema.String.pipe(Schema.filter(s =>
  /^(0|[1-9][0-9]{0,77})$/.test(s) && BigInt(s) < 2n ** 256n && (!positive || BigInt(s) > 0n)))
const hash = Schema.String.pipe(Schema.filter(s => /^0x[0-9a-f]{64}$/.test(s) && BigInt(s) > 0n))
const address = Schema.String.pipe(Schema.filter(s => /^0x[0-9a-f]{40}$/.test(s) && BigInt(s) > 0n))
const seconds = (positive = false) => Schema.Number.pipe(Schema.filter(n =>
  Number.isSafeInteger(n) && n >= (positive ? 1 : 0) && n < 2 ** 48))
const base = { protocol: Schema.Literal("arcade:erc8183:terminal:v1"), chainId: Schema.Literal(5042002),
  escrow: address, jobId: uint(true), requestHash: hash, amountAtomic: uint(true) }
const proof = { txHash: hash, blockHash: hash, blockNumber: uint(true), blockTimestamp: seconds(true),
  submittedAt: seconds(), gasWei: uint(), sellerAtomic: uint(), feeAtomic: uint(), refundAtomic: uint() }
/** Check descriptors BEFORE Struct can read fields. Evidence is small, flat JSON. */
function flatData(input: unknown): boolean {
  try {
    if (!input || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype) return false
    const keys = Reflect.ownKeys(input)
    if (keys.length > 20) return false
    for (const key of keys) {
      if (typeof key !== "string" || key.length > 32) return false
      const d = Object.getOwnPropertyDescriptor(input, key)
      if (!d || !d.enumerable || !("value" in d)) return false
      if (typeof d.value === "string" ? d.value.length > 128 : typeof d.value !== "number" || !Number.isSafeInteger(d.value)) return false
    }
    return true
  } catch { return false }
}
const closed = <F extends Schema.Struct.Fields>(fields: F) => Schema.Unknown.pipe(
  Schema.filter(flatData, { message: () => "Invalid escrow terminal evidence" }),
  Schema.compose(Schema.Struct(fields).annotations({ parseOptions: { onExcessProperty: "error" } }), { strict: false }))
const settled = closed({ ...base, state: Schema.Literal("settled"), ...proof }).pipe(Schema.filter(e => {
  const amount = BigInt(e.amountAtomic), fee = amount * 500n / 10000n
  return amount <= (2n ** 256n - 1n) / 500n && BigInt(e.feeAtomic) === fee && BigInt(e.sellerAtomic) === amount - fee && e.refundAtomic === "0" &&
    e.submittedAt > 0 && e.submittedAt <= e.blockTimestamp
}))
const refunded = closed({ ...base, state: Schema.Literal("refunded"), ...proof }).pipe(Schema.filter(e =>
  e.sellerAtomic === "0" && e.feeAtomic === "0" && e.refundAtomic === e.amountAtomic && e.submittedAt <= e.blockTimestamp))
/** Uncertainty carries no claimed transaction, payout, refund or zero-cost assertion. */
export const EscrowReceiptEvidence = Schema.Unknown.pipe(
  // Guard before Union's discriminator optimization can inspect state.
  Schema.filter(flatData, { message: () => "Invalid escrow terminal evidence" }),
  Schema.compose(Schema.Union(settled, refunded, closed({ ...base, state: Schema.Literal("uncertain") })), { strict: false }))
export type EscrowReceiptEvidence = typeof EscrowReceiptEvidence.Type
