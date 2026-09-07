/** Pure recorded-evidence checks, not RPC verification or payment authority. */
import { Schema } from "effect"
import { EscrowReceiptEvidence } from "../../../packages/core/src/escrow-receipt.ts"
import { type Receipt, type ReceiptChild, treeHashOf } from "../../../packages/core/src/receipt.ts"
const ABSENT = Symbol(), INVALID = Symbol()
const field = (value: unknown, key: string): unknown => {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return INVALID
    const d = Object.getOwnPropertyDescriptor(value, key)
    return d === undefined ? key in value ? INVALID : ABSENT : d.enumerable && "value" in d ? d.value : INVALID
  } catch { return INVALID }
}
const absent = (value: unknown) => value === ABSENT || value === undefined
const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value) && BigInt(value) > 0n
const id = (value: unknown): value is string => typeof value === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(value)
/** undefined = legacy; null = invalid new evidence; value = coherent escrow data. */
export function escrowReceiptView(receipt: unknown): EscrowReceiptEvidence | null | undefined {
  try {
    const raw = field(receipt, "escrow"), rail = field(receipt, "rail")
    if (rail !== "erc8183") return absent(raw) ? undefined : null
    const parsed = Schema.decodeUnknownEither(EscrowReceiptEvidence)(raw)
    if (parsed._tag === "Left") return null
    const e = parsed.right, amount = BigInt(e.amountAtomic), fee = amount * 500n / 10000n
    const job = field(receipt, "jobId"), ancestry = field(receipt, "ancestors")
    if (field(receipt, "network") !== "eip155:5042002" || field(receipt, "priceAtomic") !== amount ||
      field(receipt, "sellerAtomic") !== amount - fee || field(receipt, "feeAtomic") !== fee || field(receipt, "feeBps") !== 500 ||
      !id(job) || field(receipt, "rootJobId") !== job || !absent(field(receipt, "parentJobId")) || field(receipt, "hop") !== 0 ||
      !Array.isArray(ancestry) || Object.getPrototypeOf(ancestry) !== Array.prototype || ancestry.length !== 0 || Reflect.ownKeys(ancestry).length !== 1 ||
      !address(field(receipt, "buyer")) || !address(field(receipt, "seller"))) return null
    for (const k of ["sessionId", "authorizationNonce", "feeAccrualId", "feeSweepTx"]) if (!absent(field(receipt, k))) return null
    if (e.state === "settled") {
      if (field(receipt, "settled") !== true || field(receipt, "settleTx") !== e.txHash || field(receipt, "settleRefKind") !== "onchain") return null
    } else if (field(receipt, "settled") !== false || !absent(field(receipt, "settleTx")) || !absent(field(receipt, "settleRefKind"))) return null
    return e
  } catch { return null }
}
export const escrowReceiptReason = (e: EscrowReceiptEvidence | null): string => e === null ? "escrow evidence unavailable" :
  e.state === "settled" ? "ok" : e.state === "refunded" ? "escrow refunded" : "escrow outcome uncertain; reconciliation required"
/** Escrow roots may hire existing rails; never infer or admit child escrow work. */
export const receiptChildRailCompatible = (root: Receipt["rail"], child: Receipt["rail"]): boolean => root === "erc8183"
  ? child === "eip3009" || child === "gateway" || child === "test" : root === child
export const recordedTreeHash = (rail: Receipt["rail"], jobId: string, children: readonly ReceiptChild[]): string =>
  rail === "erc8183" && children.length === 0 ? "0x" + "0".repeat(64) : treeHashOf(jobId, children)
