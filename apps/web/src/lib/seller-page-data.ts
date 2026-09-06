/** Public summary serialization boundary. No IO, wallet, key or aggregation here. */
import { addressOk, decodeSellerSummary, type SellerSummary } from "./hub-decode.ts"

export interface SellerPageData {
  readonly state: "missing" | "invalid" | "unavailable" | "ready"
  readonly address: string | null; readonly summary: SellerSummary | null; readonly observedAtMs: number | null
}
const record = (v: unknown): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw 0
  return v as Record<string, unknown>
}
const own = (v: object, key: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(v, key)
  if (d !== undefined && (!d.enumerable || !("value" in d))) throw 0
  return d?.value
}
const totals = ["seller", "calls", "settled", "revenue", "revenueAtomic", "fees", "feesAtomic", "net", "netAtomic",
  "inferenceCost", "inferenceCostAtomic", "subSpend", "subSpendAtomic", "margin", "marginAtomic", "knownInferenceCost",
  "knownInferenceCostAtomic", "knownSubSpend", "knownSubSpendAtomic", "inferenceCostComplete", "subSpendComplete"] as const
const listing = ["id", "serviceName", "price", "live", "delisted", "payTestedAtMs", "payTestOk", "payTestTx", "ensName", "ensExpired",
  "agentId", "registrationTx", "agentVerified", "calls", "settled", "revenue", "revenueAtomic", "marginPerCall", "marginPerCallAtomic"] as const
const scalars = (input: unknown, keys: readonly string[]): Record<string, unknown> => {
  const raw = record(input), out: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const value = own(raw, key)
    if (value === undefined) continue
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw 0
    out[key] = value
  }
  return out
}
const project = (input: unknown, address: string): SellerSummary => {
  const raw = record(input), out = scalars(raw, totals), values = own(raw, "listings")
  if (!Array.isArray(values) || values.length > 1024) throw 0
  out.listings = Array.from({ length: values.length }, (_, i) => scalars(own(values, String(i)), listing))
  return decodeSellerSummary(out, address)
}

/** Query extras stay out of the server request. Invalid shapes never coerce into
 * an address or expose raw query content in the page's error text. */
export const sellerSearch = (input: unknown): { address: string } => {
  try {
    const value = own(record(input), "address")
    return { address: value === undefined || value === "" ? "" : addressOk(value) ? value : "invalid" }
  } catch { return { address: "invalid" } }
}

/** Exactly one injected H4 bounded read for a valid address; no retry. Unknown
 * extensions never reach Start serialization, including getters/toJSON hooks. */
export const loadSellerPage = async (input: unknown, read: (address: string) => Promise<unknown>, now: () => number = Date.now): Promise<SellerPageData> => {
  const finish = (state: SellerPageData["state"], address: string | null, summary: SellerSummary | null = null): SellerPageData => {
    let observedAtMs: number | null = null
    try { const value = now(); if (Number.isSafeInteger(value) && value >= 0) observedAtMs = value } catch { /* display time unavailable */ }
    return { state, address, summary, observedAtMs }
  }
  let address: string
  try {
    const raw = record(input)
    if (Reflect.ownKeys(raw).length !== 1 || !Object.hasOwn(raw, "address")) throw 0
    const value = own(raw, "address")
    if (value === "") return finish("missing", null)
    if (!addressOk(value)) throw 0
    address = value
  } catch { return finish("invalid", null) }
  try { return finish("ready", address, project(await read(address), address)) }
  catch { return finish("unavailable", address) }
}
