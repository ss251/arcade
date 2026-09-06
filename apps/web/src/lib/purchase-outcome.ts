/** Correlated browser-private projection, not independent chain verification.
 * Never return raw receipts, diagnostics, capability tokens or unpaid output.
 */
import { NON_SETTLING } from "../../../../packages/core/src/job.ts"
import { capturePurchaseInput } from "./purchase-approval.ts"
import { capturePurchaseContext } from "./purchase-context.ts"
import { captureStoredJob } from "./job-store.ts"
import { txLink, settlementReferenceKind } from "./format.ts"

export interface PurchaseOutcome {
  readonly source: "hub"; readonly jobId: string; readonly skillId: string; readonly buyer: string; readonly seller: string
  readonly priceAtomic: string; readonly rail: "eip3009" | "gateway"; readonly network: string; readonly settled: boolean
  readonly reference: string | null; readonly referenceKind: "onchain" | "gateway-transfer" | null
  readonly explorer: string | null; readonly resultJson: string | null
}
const fail = (): never => { throw 0 }
const record = (input: unknown, limit = 64): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail()
  const keys = Reflect.ownKeys(input)
  if (keys.length > limit) return fail()
  const value: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    if (typeof key !== "string") return fail()
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (!d?.enumerable || !("value" in d)) return fail()
    value[key] = d.value
  }
  return value
}
const address = (v: unknown): v is string => typeof v === "string" && v.length === 42 &&
  /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v)
const hash = (v: unknown): v is string => typeof v === "string" && v.length === 66 &&
  /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/i.test(v)
const uint = (v: unknown): v is string => typeof v === "string" && v.length <= 78 &&
  /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < 1n << 256n
const uuid = (v: unknown): v is string => typeof v === "string" && v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const sameAddress = (a: unknown, b: string) => address(a) && a.toLowerCase() === b.toLowerCase()

/** Expected nonce/buyer come from this run's retained actual signed authorization.
 * Old H9 rows alone do not establish that stronger provenance for historical UI.
 */
export const decodePurchaseOutcome = (input: unknown, expected: unknown): Readonly<PurchaseOutcome> | undefined => {
  try {
    const e = record(expected, 4)
    if (Object.keys(e).length !== 4 || !["row", "context", "buyer", "nonce"].every(k => Object.hasOwn(e, k))) return undefined
    const row = captureStoredJob(e.row), context = capturePurchaseContext(e.context)
    if (!row || !context || context.rail === "test" || !address(e.buyer) || !hash(e.nonce) ||
      row.hubOrigin !== context.hubOrigin || row.skillId !== context.skillId || row.priceAtomic !== context.amountAtomic) return undefined
    const raw = record(input, 16), receipt = record(raw.receipt)
    if (raw.job_id !== row.jobId || receipt.jobId !== row.jobId || receipt.skillId !== context.skillId ||
      !sameAddress(receipt.buyer, e.buyer) || !sameAddress(receipt.seller, context.seller) ||
      receipt.network !== context.network || receipt.rail !== context.rail || receipt.priceAtomic !== context.amountAtomic ||
      !hash(receipt.authorizationNonce) || receipt.authorizationNonce.toLowerCase() !== e.nonce.toLowerCase() ||
      !uint(receipt.sellerAtomic) || !uint(receipt.feeAtomic) ||
      typeof receipt.feeBps !== "number" || !Number.isSafeInteger(receipt.feeBps) || receipt.feeBps < 0 || receipt.feeBps > 10000 ||
      BigInt(receipt.sellerAtomic) + BigInt(receipt.feeAtomic) !== BigInt(context.amountAtomic) ||
      BigInt(receipt.feeAtomic) !== BigInt(context.amountAtomic) * BigInt(receipt.feeBps) / 10000n ||
      typeof receipt.skillVersion !== "string" || !receipt.skillVersion || receipt.skillVersion.length > 128 ||
      typeof receipt.latencyMs !== "number" || !Number.isFinite(receipt.latencyMs) || receipt.latencyMs < 0 || receipt.latencyMs > Number.MAX_SAFE_INTEGER ||
      typeof receipt.createdAtMs !== "number" || !Number.isSafeInteger(receipt.createdAtMs) || receipt.createdAtMs < 0 ||
      typeof receipt.settled !== "boolean" || typeof raw.status !== "string") return undefined
    let reference: string | null = null, referenceKind: PurchaseOutcome["referenceKind"] = null, resultJson: string | null = null
    const kind = settlementReferenceKind(receipt)
    if (receipt.settled) {
      if (raw.status !== "succeeded") return undefined
      if (context.rail === "eip3009") {
        if (!hash(receipt.settleTx) || kind !== undefined && kind !== "onchain") return undefined
        reference = receipt.settleTx; referenceKind = "onchain"
      } else {
        if (!uuid(receipt.settleTx) || kind !== undefined && kind !== "gateway-transfer") return undefined
        reference = receipt.settleTx; referenceKind = "gateway-transfer"
      }
      const captured = capturePurchaseInput({ result: raw.result })
      if (captured === undefined || captured.toLowerCase().includes(row.token)) return undefined
      const output: unknown = JSON.parse(captured).result
      if (output === null || typeof output === "string" && output.trim() === "" ||
        typeof output === "object" && Object.keys(output).length === 0) return undefined
      resultJson = captured.slice('{"result":'.length, -1)
    } else {
      if (Object.hasOwn(receipt, "settleTx") || kind !== undefined ||
        raw.status !== "succeeded" && !Array.from(NON_SETTLING).some(status => status === raw.status)) return undefined
      // Deliberately discard even a malicious/unpaid output; never echo raw detail.
    }
    return Object.freeze({ source: "hub", jobId: row.jobId, skillId: context.skillId, buyer: e.buyer, seller: context.seller,
      priceAtomic: context.amountAtomic, rail: context.rail, network: context.network, settled: receipt.settled,
      reference, referenceKind, explorer: txLink(reference, { rail: context.rail, network: context.network,
        settled: receipt.settled, ...(referenceKind === null ? {} : { settleRefKind: referenceKind }) }), resultJson })
  } catch { return undefined }
}
