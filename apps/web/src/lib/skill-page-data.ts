import { EnsNameExpired, type ListingDetail, type PublicReceiptRow } from "./hub.ts"
import { addressOk, decodeListing, decodeReceipts, nameOk, skillIdOk } from "./hub-decode.ts"
import { settlementReferenceKind } from "./format.ts"
import { checkedGraphEvidence } from "../../../../packages/buyer/src/graph-evidence.ts"

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export interface SkillPageListing extends Omit<ListingDetail, "inputSchema" | "outputSchema" | "bounds"> {
  readonly inputSchema: JsonValue
  readonly outputSchema: JsonValue
  readonly bounds?: Record<string, number>
}
export interface SkillPageData {
  readonly listing: SkillPageListing | null
  readonly receipts: readonly PublicReceiptRow[] | null
  readonly listingError: "listing_unavailable" | null
  readonly receiptsError: "receipts_unavailable" | null
  readonly nameError: "invalid_name" | "name_expired" | "name_unavailable" | "name_mismatch" | null
  /** Matched informational ENS identity, never payment authority. */
  readonly resolvedName: string | null
  readonly observedAtMs: number
}
type Reads = Pick<typeof import("./hub.ts"), "describeSkill" | "listingReceipts" | "resolveName">
const invalid = (): never => { throw new Error("Invalid skill page data") }
const record = (v: unknown): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return invalid()
  return v as Record<string, unknown>
}
const own = (v: object, key: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(v, key)
  if (d !== undefined && (!("value" in d) || !d.enumerable)) return invalid()
  return d?.value
}
/** Unknown fields are not read, including their accessors or toJSON methods. */
const pick = (v: unknown, keys: readonly string[]): Record<string, unknown> => {
  const r = record(v), out: Record<string, unknown> = Object.create(null)
  for (const key of keys) if (Object.hasOwn(r, key)) out[key] = own(r, key)
  return out
}
const array = (v: unknown, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max) return invalid()
  return Array.from({ length: v.length }, (_, i) => {
    if (!Object.hasOwn(v, String(i))) return invalid()
    return own(v, String(i))
  })
}
/** Public schemas are bounded plain JSON, not objects with serialization behavior. */
const schemaCopy = (input: unknown): JsonValue => {
  let nodes = 0, bytes = 0
  const active = new Set<object>(), encoder = new TextEncoder()
  const add = (s: string) => { if (s.length > 65536) invalid(); bytes += encoder.encode(JSON.stringify(s)).length; if (bytes > 131072) invalid() }
  const visit = (v: unknown, depth: number): JsonValue => {
    if (++nodes > 8192 || depth > 16 || (bytes += 2) > 131072) return invalid()
    if (v === null || typeof v === "boolean") return v
    if (typeof v === "string") { add(v); return v }
    if (typeof v === "number" && Number.isFinite(v)) { bytes += 24; return v }
    if (typeof v !== "object" || active.has(v)) return invalid()
    active.add(v)
    try {
      if (Array.isArray(v)) return array(v, 8192).map(x => visit(x, depth + 1))
      const r = record(v), keys = Reflect.ownKeys(r), out: Record<string, JsonValue> = Object.create(null)
      if (keys.length > 8192) return invalid()
      for (const key of keys) {
        if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) return invalid()
        add(key); out[key] = visit(own(r, key), depth + 1)
      }
      return out
    } finally { active.delete(v) }
  }
  const result = visit(input, 0)
  if (bytes > 131072) return invalid()
  return result
}
const payTest = (v: unknown): unknown => v === null ? null : { ...pick(v, ["atMs", "ok", "settleTx"]), jobId: "" }
class NameMismatch extends Error {}
const listingProjection = (value: unknown, id: string, resolvedSeller?: string): SkillPageListing => {
  const raw = record(value), out = pick(raw, ["id", "version", "serviceName", "description", "tags", "price", "replaces", "seller", "delisted", "ensName", "ensExpired"])
  if (resolvedSeller !== undefined && skillIdOk(out.id) && addressOk(out.seller) &&
    (out.id !== id || out.seller.toLowerCase() !== resolvedSeller.toLowerCase())) throw new NameMismatch()
  const inputSchema = schemaCopy(own(raw, "inputSchema")), outputSchema = schemaCopy(own(raw, "outputSchema"))
  out.inputSchema = inputSchema; out.outputSchema = outputSchema
  const graphDescriptor = Object.getOwnPropertyDescriptor(raw, "graph")
  const graph = graphDescriptor?.enumerable && "value" in graphDescriptor ? checkedGraphEvidence(graphDescriptor.value) : undefined
  if (graph !== undefined) out.graph = graph
  const nested: Readonly<Record<string, readonly string[]>> = {
    bounds: ["timeoutSec", "maxTurns", "maxTokens", "maxToolCalls", "maxCostUsd", "maxSubSpendUsd"],
    stats: ["skillId", "calls", "settled", "successRate", "p50LatencyMs", "p95LatencyMs", "availability"], ratings: ["count", "average"]
  }
  for (const [key, keys] of Object.entries(nested)) { const v = own(raw, key); if (v !== undefined) out[key] = pick(v, keys) }
  const test = own(raw, "payTested"), history = own(raw, "payTestHistory")
  if (test !== undefined) out.payTested = payTest(test)
  if (history !== undefined) out.payTestHistory = array(history, 20).map(payTest)
  const { inputSchema: _input, outputSchema: _output, bounds: validatedBounds, ...result } = decodeListing(out, id)
  let publicBounds: Record<string, number> | undefined
  if (validatedBounds !== undefined) {
    publicBounds = {}
    for (const [key, value] of Object.entries(validatedBounds)) {
      if (typeof value !== "number") return invalid()
      publicBounds[key] = value
    }
  }
  // H4 already flattened D's evidence. Re-decoding it as raw erc8004 would lose
  // it or require fabricating chain/registry context; copy only its known scalars.
  const extras = pick(raw, ["agentId", "agentVerified", "registrationTx", "registrationUri", "evidenceStale", "splitterVersion"])
  for (const [key, v] of Object.entries(extras)) {
    if (v === undefined) { delete extras[key]; continue }
    const valid = key === "agentId" ? typeof v === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < 1n << 256n
      : key === "registrationTx" ? typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/.test(v)
      : key === "registrationUri" ? v === `/listings/${id}/agent-registration.json`
      : key === "splitterVersion" ? v === 1 || v === 2
      : typeof v === "boolean"
    if (!valid) return invalid()
  }
  const counts = pick(raw, ["validationPasses", "validationsRead", "settlementFeedback"])
  const count = (v: unknown, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max
  if (extras.agentId !== undefined && extras.agentVerified === true && extras.evidenceStale === false &&
    count(counts.validationPasses, 20) && count(counts.validationsRead, 20) && count(counts.settlementFeedback, 4096) &&
    counts.validationPasses <= counts.validationsRead) Object.assign(extras, counts)
  return { ...result, ...extras, inputSchema, outputSchema, ...(publicBounds === undefined ? {} : { bounds: publicBounds }) }
}
const receiptKeys = ["skillId", "skillVersion", "seller", "priceAtomic", "sellerAtomic", "feeAtomic", "feeBps", "price", "sellerShare", "fee",
  "settled", "reason", "latencyMs", "createdAtMs", "settleTx", "explorer", "hop", "treeHash", "rail", "network", "sellerCostUsd", "feeSweepTx",
  "treeCeilingAtomic", "treeCommittedAtomic", "canary", "session", "settleRefKind"] as const
const receiptProjection = (value: unknown, id: string): readonly PublicReceiptRow[] => decodeReceipts(array(value, 20).map(raw => {
  const out = pick(raw, receiptKeys)
  // Whitelisting must not convert inherited/invalid presence into legacy absence.
  const kind = settlementReferenceKind(raw)
  if (kind !== undefined) out.settleRefKind = kind
  out.children = array(own(record(raw), "children"), 1024).map(child => pick(child, ["skillId", "priceAtomic", "price", "settled", "settleTx", "explorer"]))
  return out
}), id, 20)

/** No transport, key or capability here. H4 owns the bounded reads; this is their
 * independent-result and server-serialization boundary, with no retries. */
export const loadSkillPage = async (input: unknown, reads: Reads, now: () => number = Date.now): Promise<SkillPageData> => {
  // One display observation at the return boundary, after the allowed reads and
  // projections. It is not a paid clock or a claim of atomic upstream snapshots.
  const finish = (data: Omit<SkillPageData, "observedAtMs">): SkillPageData => {
    let observedAtMs: number
    try { observedAtMs = now(); if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) throw new Error() }
    catch { throw new Error("Skill page observation unavailable") }
    return { ...data, observedAtMs }
  }
  const base: Omit<SkillPageData, "observedAtMs"> = { listing: null, receipts: null, listingError: null, receiptsError: null, nameError: null, resolvedName: null }
  let name: string | undefined
  try {
    const r = record(input)
    if (Reflect.ownKeys(r).length !== 1 || !Object.hasOwn(r, "name")) invalid()
    const value = own(r, "name")
    if (typeof value !== "string" || value.length > 253 || !(skillIdOk(value) || nameOk(value))) return invalid()
    name = value
  } catch { /* Fixed invalid-name projection below; never stringify input. */ }
  if (name === undefined) return finish({ ...base, nameError: "invalid_name" })
  let id = name, resolvedSeller: string | undefined
  if (!skillIdOk(name)) {
    try {
      const resolved = record(await reads.resolveName(name)), skill = own(resolved, "skillId"), seller = own(resolved, "seller")
      if (own(resolved, "name") !== name || own(resolved, "expired") !== false || !skillIdOk(skill) || !addressOk(seller)) throw new Error()
      id = skill; resolvedSeller = seller
    } catch (e) { return finish({ ...base, nameError: e instanceof EnsNameExpired ? "name_expired" : "name_unavailable" }) }
  }
  const [detail, receiptRows] = await Promise.all([
    Promise.resolve().then(() => reads.describeSkill(id)).then(raw => listingProjection(raw, id, resolvedSeller))
      .catch(e => e instanceof NameMismatch ? e : null),
    Promise.resolve().then(() => reads.listingReceipts(id, 20)).then(raw => receiptProjection(raw, id)).catch(() => null)
  ])
  const mismatch = detail instanceof NameMismatch
  return finish({ ...base, listing: mismatch ? null : detail, receipts: receiptRows,
    listingError: detail === null ? "listing_unavailable" : null, receiptsError: receiptRows === null ? "receipts_unavailable" : null,
    nameError: mismatch ? "name_mismatch" : null, resolvedName: !mismatch && detail !== null && resolvedSeller !== undefined ? name : null })
}
