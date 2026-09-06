/** Public JSON decoders. Explicit projections, no hub boot, IO, keys or payment authority. */
// Exact inert imports: the core barrel eagerly selects a server-side network.
import { dnsNameOf } from "../../../../packages/core/src/ens.ts"
import { formatPrice } from "../../../../packages/core/src/money.ts"
import { loadChainConfig } from "../../../../packages/core/src/chain-config.ts"
import { NON_SETTLING } from "../../../../packages/core/src/job.ts"
import { checkedGraphEvidence, type GraphEvidence } from "../../../../packages/buyer/src/graph-evidence.ts"
import { settlementReferenceKind, type SettlementReferenceKind } from "./format.ts"

export interface PayTest { readonly atMs: number; readonly jobId: string; readonly ok: boolean; readonly settleTx?: string }
export interface ListingStats {
  readonly calls: number; readonly settled: number; readonly successRate: number
  readonly p50LatencyMs: number; readonly p95LatencyMs: number
  readonly skillId?: string; readonly availability?: number
}
export interface ListingSummary {
  readonly id: string; readonly version: string; readonly serviceName: string; readonly description: string
  readonly tags?: ReadonlyArray<string>; readonly price: string; readonly replaces?: string; readonly seller: string
  readonly payTested?: PayTest | null; readonly delisted?: boolean; readonly ensName?: string | null
  readonly ensExpired?: boolean; readonly stats?: ListingStats
  readonly graph?: GraphEvidence
}
export interface ListingDetail extends ListingSummary {
  readonly inputSchema: unknown; readonly outputSchema: unknown; readonly bounds?: Record<string, unknown>
  readonly ratings?: { readonly count: number; readonly average: number | null }
  readonly payTestHistory?: ReadonlyArray<PayTest>
  readonly agentId?: string; readonly agentVerified?: boolean; readonly registrationTx?: string
  /** Announced registration document, not independently checked mint evidence. */
  readonly registrationUri?: string; readonly validationPasses?: number; readonly validationsRead?: number
  readonly settlementFeedback?: number; readonly evidenceStale?: boolean; readonly splitterVersion?: 1 | 2
}
export interface ReceiptRow {
  readonly skillId: string; readonly priceAtomic: string; readonly sellerAtomic: string; readonly feeAtomic: string
  readonly feeBps: number; readonly settleTx?: string; readonly latencyMs: number; readonly settled: boolean
  readonly reason: string; readonly createdAtMs: number
}
export interface PublicReceiptChild {
  readonly skillId: string; readonly priceAtomic: string; readonly price: string; readonly settled: boolean
  readonly settleTx?: string; readonly explorer: string | null
}
export interface PublicReceiptRow extends ReceiptRow {
  readonly price: string; readonly sellerShare: string; readonly fee: string; readonly explorer: string | null
  readonly hop: number; readonly treeHash?: string
  /** Flat recorded descendants, not direct tree edges. */
  readonly children: ReadonlyArray<PublicReceiptChild>
  readonly skillVersion: string; readonly seller: string; readonly rail: "eip3009" | "gateway" | "test"; readonly network: string
  readonly sellerCostUsd?: number; readonly feeSweepTx?: string; readonly treeCeilingAtomic?: string
  readonly treeCommittedAtomic?: string; readonly canary?: boolean
  /** Older hubs omit these fields; an absent session marker is not inferred false. */
  readonly session?: boolean; readonly settleRefKind?: SettlementReferenceKind
}
export interface MarketStats {
  readonly listings: number; readonly sellers: number; readonly calls: number; readonly settled: number
  readonly volume: string; readonly volumeAtomic: string; readonly fees: string; readonly feesAtomic: string
  readonly trees: number; readonly source: "hub" | "subgraph"
}
export interface SellerListingRow {
  readonly id: string; readonly serviceName: string; readonly price: string; readonly live: boolean; readonly delisted: boolean
  readonly payTestedAtMs?: number; readonly payTestOk?: boolean; readonly payTestTx?: string
  readonly ensName?: string; readonly ensExpired?: boolean; readonly agentId?: string; readonly registrationTx?: string
  readonly agentVerified?: boolean; readonly calls: number; readonly settled: number; readonly revenue: string
  readonly revenueAtomic: string; readonly marginPerCall: string | null; readonly marginPerCallAtomic: string | null
}
export interface SellerSummary {
  readonly seller: string; readonly calls: number; readonly settled: number; readonly revenue: string; readonly revenueAtomic: string
  readonly fees: string; readonly feesAtomic: string; readonly net: string; readonly netAtomic: string
  readonly inferenceCost: string | null; readonly inferenceCostAtomic: string | null
  readonly subSpend: string | null; readonly subSpendAtomic: string | null; readonly margin: string | null; readonly marginAtomic: string | null
  readonly knownInferenceCost: string; readonly knownInferenceCostAtomic: string; readonly knownSubSpend: string; readonly knownSubSpendAtomic: string
  readonly inferenceCostComplete: boolean; readonly subSpendComplete: boolean; readonly listings: ReadonlyArray<SellerListingRow>
}
export interface TreeNode {
  readonly nodeId: string; readonly parentNodeId: string | null; readonly skillId: string; readonly hop: number
  readonly priceAtomic: string; readonly price: string; readonly settled: boolean; readonly reason: string; readonly latencyMs: number
  readonly settleTx?: string; readonly explorer: string | null
}
export type TreeEvidenceFlag = "commitment-missing" | "commitment-mismatch" | "receipt-missing" | "receipt-conflict" |
  "lineage-invalid" | "evidence-malformed" | "limit-exceeded" | "reservation-unresolved"
export interface TreeView {
  readonly rootJobId: string
  /** A recorded canonical digest, NOT an independently mined commitment or transaction. */
  readonly treeHash?: string; readonly ceiling?: string; readonly committed?: string
  readonly nodes: ReadonlyArray<TreeNode>; readonly complete: boolean; readonly evidenceFlags: ReadonlyArray<TreeEvidenceFlag>
}
export interface ResolvedName {
  readonly name: string; readonly skillId: string; readonly seller: string; readonly endpoint: string
  readonly payTo: string; readonly chain: string; readonly priceAtomic: string | null; readonly expired: false
}

const invalid = (): never => { throw new Error("Invalid public hub response") }
const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid()
  return value as Record<string, unknown>
}
const own = (value: Record<string, unknown>, key: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(value, key)
  if (d !== undefined && !("value" in d)) return invalid()
  return d?.value
}
const array = (value: unknown, max: number): unknown[] => {
  if (!Array.isArray(value) || value.length > max) return invalid()
  return Array.from({ length: value.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i))
    return d !== undefined && "value" in d ? d.value : invalid()
  })
}
const text = (value: unknown, max: number, empty = false): string =>
  typeof value === "string" && value.length <= max && (empty || value.length > 0) ? value : invalid()
const bool = (value: unknown): boolean => typeof value === "boolean" ? value : invalid()
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : invalid()
const finite = (value: unknown, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : invalid()
export const skillIdOk = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(v)
export const addressOk = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v)
export const rootIdOk = (v: unknown): v is string => typeof v === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(v)
const hashOk = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/i.test(v)
export const nameOk = (v: unknown): v is string => {
  if (typeof v !== "string" || v.length > 253 || !/^[a-z0-9.-]+\.eth$/.test(v)) return false
  try { dnsNameOf(v); return true } catch { return false }
}
const skill = (v: unknown): string => skillIdOk(v) ? v : invalid()
const address = (v: unknown): string => addressOk(v) ? v : invalid()
const atomic = (v: unknown, signed = false): string => {
  if (typeof v !== "string" || !(signed ? /^(0|-?[1-9][0-9]{0,77})$/ : /^(0|[1-9][0-9]{0,77})$/).test(v)) return invalid()
  const n = BigInt(v), max = (1n << 256n) - 1n
  return n >= -max && n <= max ? v : invalid()
}
const money = (v: string): string => BigInt(v) < 0n ? `-${formatPrice(-BigInt(v))}` : formatPrice(BigInt(v))
const pair = (r: Record<string, unknown>, key: string, signed = false, nullable = false): { display: string | null; atomic: string | null } => {
  const a = own(r, `${key}Atomic`), d = own(r, key)
  if (nullable && a === null && d === null) return { display: null, atomic: null }
  const value = atomic(a, signed)
  if (d !== money(value)) return invalid()
  return { display: d as string, atomic: value }
}
const requiredPair = (r: Record<string, unknown>, key: string) => {
  const p = pair(r, key)
  return { display: p.display!, atomic: p.atomic! }
}
const price = (v: unknown): string => {
  const s = text(v, 100)
  if (!/^\$?(0|[1-9][0-9]{0,77})(\.[0-9]{1,6})?$/.test(s)) return invalid()
  const [whole, frac = ""] = s.replace(/^\$/, "").split(".")
  atomic((BigInt(whole!) * 1_000_000n + BigInt(frac.padEnd(6, "0"))).toString())
  return s
}
const displayedAtomic = (v: unknown): bigint => {
  const s = price(v), [whole, frac = ""] = s.replace(/^\$/, "").split(".")
  const n = BigInt(whole!) * 1_000_000n + BigInt(frac.padEnd(6, "0"))
  if (s !== money(n.toString())) return invalid()
  return n
}
const reasonSet = new Set(["ok", "refused", "settled", "not settled", "session_released", "output is empty", "output failed the listing's outputSchema",
  "job status is queued", "job status is running", "job status is succeeded", ...Array.from(NON_SETTLING, s => `job status is ${s}`),
  "engine refused (stop_reason=refusal)", "engine refused (stop_reason=content_filter)", "engine refused (stop_reason=reasoning_extraction)",
  "settlement failed (SettlementFailed)", "settlement failed (RpcFailure)"])
const reason = (v: unknown, settled: boolean): string => typeof v === "string" && reasonSet.has(v) ? v : settled ? "settled" : "not settled"
const configs = [loadChainConfig("arc-testnet"), loadChainConfig("arc-mainnet")].filter(c => c.status === "ready")
const chain = (v: unknown) => configs.find(c => c.caip2 === v)
const reference = (v: unknown, rail?: string): string | undefined => hashOk(v) ? v : typeof v === "string" && (
  rail === "gateway" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v) ||
  rail === "test" && /^0xtest[0-9a-fA-F]{14,26}$/.test(v)) ? v : undefined
const explorer = (v: unknown, tx: string | undefined, settled: boolean, network?: string, rail?: string,
  kind?: SettlementReferenceKind): string | null => {
  if (!settled || !hashOk(tx) || rail !== undefined && rail !== "eip3009" || kind !== undefined && kind !== "onchain") return null
  return configs.some(c => (network === undefined || network === c.caip2) && v === `${c.explorerBaseUrl.replace(/\/$/, "")}/tx/${tx}`)
    ? v as string : null
}
const optional = <T>(r: Record<string, unknown>, key: string, read: (v: unknown) => T): T | undefined => {
  const v = own(r, key); return v === undefined ? undefined : read(v)
}
const copyOptional = <K extends string, T>(key: K, value: T | undefined): Partial<Record<K, T>> => value === undefined ? {} : { [key]: value } as Record<K, T>
const sessionMarker = (r: Record<string, unknown>): boolean | undefined => {
  const d = Object.getOwnPropertyDescriptor(r, "session")
  if (d === undefined) return "session" in r ? invalid() : undefined
  return d.enumerable && "value" in d ? bool(d.value) : invalid()
}

const statsOf = (v: unknown, id: string): ListingStats => {
  const r = object(v), calls = integer(own(r, "calls")), settled = integer(own(r, "settled")), rate = finite(own(r, "successRate"), 1)
  if (settled > calls || rate !== (calls === 0 ? 0 : settled / calls)) return invalid()
  const p50 = finite(own(r, "p50LatencyMs")), p95 = finite(own(r, "p95LatencyMs"))
  if (p95 < p50 || own(r, "skillId") !== undefined && own(r, "skillId") !== id) return invalid()
  return { calls, settled, successRate: rate, p50LatencyMs: p50, p95LatencyMs: p95,
    ...copyOptional("skillId", optional(r, "skillId", skill)), ...copyOptional("availability", optional(r, "availability", v => finite(v, 1))) }
}
const payTest = (v: unknown): PayTest => {
  const r = object(v), jobId = own(r, "jobId")
  if (jobId !== "" && !rootIdOk(jobId)) return invalid()
  return { atMs: integer(own(r, "atMs")), jobId: jobId as string, ok: bool(own(r, "ok")),
    ...copyOptional("settleTx", hashOk(own(r, "settleTx")) ? own(r, "settleTx") as string : undefined) }
}
const listingSummary = (v: unknown): ListingSummary => {
  const r = object(v), id = skill(own(r, "id"))
  // Optional index evidence must not discard an otherwise valid listing.
  const d = Object.getOwnPropertyDescriptor(r, "graph")
  const graph = d?.enumerable && "value" in d ? checkedGraphEvidence(d.value) : undefined
  return { id, version: text(own(r, "version"), 128, true), serviceName: text(own(r, "serviceName"), 32),
    description: text(own(r, "description"), 500, true), price: price(own(r, "price")), seller: address(own(r, "seller")),
    ...copyOptional("tags", optional(r, "tags", v => array(v, 5).map(tag => text(tag, 32)))),
    ...copyOptional("replaces", optional(r, "replaces", v => text(v, 120, true))),
    ...copyOptional("ensName", optional(r, "ensName", v => v === null ? null : nameOk(v) ? v : invalid())),
    ...copyOptional("ensExpired", optional(r, "ensExpired", bool)), ...copyOptional("delisted", optional(r, "delisted", bool)),
    ...copyOptional("payTested", optional(r, "payTested", v => v === null ? null : payTest(v))),
    ...copyOptional("stats", optional(r, "stats", v => statsOf(v, id))), ...copyOptional("graph", graph) }
}
/** Schemas remain public data; copy bounded plain JSON, never an accessor/prototype. */
const jsonValue = (v: unknown, depth = 0, budget = { left: 8192 }): unknown => {
  if (--budget.left < 0 || depth > 16) return invalid()
  if (v === null || typeof v === "boolean" || typeof v === "string" && v.length <= 65_536 || typeof v === "number" && Number.isFinite(v)) return v
  if (Array.isArray(v)) return array(v, 8192).map(x => jsonValue(x, depth + 1, budget))
  const r = object(v), out: Record<string, unknown> = Object.create(null)
  for (const key of Object.keys(r)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) return invalid()
    out[key] = jsonValue(own(r, key), depth + 1, budget)
  }
  return out
}
const bounds = (v: unknown): Record<string, unknown> => {
  const r = object(v), timeout = integer(own(r, "timeoutSec"), 900)
  if (timeout < 1) return invalid()
  const out: Record<string, unknown> = { timeoutSec: timeout }
  for (const key of ["maxTurns", "maxTokens", "maxToolCalls", "maxCostUsd", "maxSubSpendUsd"]) {
    const value = own(r, key)
    if (value !== undefined) { const n = key.endsWith("Usd") ? finite(value) : integer(value); if (n <= 0) return invalid(); out[key] = n }
  }
  return out
}
const identity = (v: unknown, id: string): Partial<ListingDetail> => {
  if (v === undefined) return {}
  try {
    const r = object(v), cfg = chain(own(r, "chain")), registry = own(r, "registry"), agentId = atomic(own(r, "agentId"))
    if (cfg?.erc8004 === undefined || !addressOk(registry) || registry.toLowerCase() !== cfg.erc8004.identity.toLowerCase()) return {}
    const verified = bool(own(r, "verified")), stale = bool(own(r, "stale"))
    const base = { agentId, agentVerified: verified, evidenceStale: stale,
      registrationUri: `/listings/${id}/agent-registration.json`,
      ...copyOptional("registrationTx", hashOk(own(r, "registrationTx")) ? own(r, "registrationTx") as string : undefined) }
    try {
      const pass = integer(own(r, "validationPasses"), 20), reads = integer(own(r, "validationsRead"), 20), feedback = integer(own(r, "settlementFeedback"), 4096)
      return verified && !stale && pass <= reads ? { ...base, validationPasses: pass, validationsRead: reads, settlementFeedback: feedback } : base
    } catch { return base }
  } catch { return {} }
}
export const decodeListings = (v: unknown): ReadonlyArray<ListingSummary> => array(v, 1024).map(listingSummary)
export const decodeListing = (v: unknown, requested: string): ListingDetail => {
  const r = object(v), summary = listingSummary(r)
  if (summary.id !== requested || own(r, "inputSchema") === undefined || own(r, "outputSchema") === undefined) return invalid()
  const ratings = optional(r, "ratings", v => {
    const value = object(v), count = integer(own(value, "count")), avg = own(value, "average")
    if (count === 0 ? avg !== null : typeof avg !== "number" || avg < 1 || avg > 5 || !Number.isFinite(avg)) return invalid()
    return { count, average: avg as number | null }
  })
  const history = optional(r, "payTestHistory", v => array(v, 20).map(payTest))
  if (history?.some((p, i) => i > 0 && p.atMs < history[i - 1]!.atMs)) return invalid()
  return { ...summary, inputSchema: jsonValue(own(r, "inputSchema")), outputSchema: jsonValue(own(r, "outputSchema")),
    ...copyOptional("bounds", optional(r, "bounds", bounds)), ...copyOptional("ratings", ratings),
    ...copyOptional("payTestHistory", history), ...identity(own(r, "erc8004"), summary.id) }
}

export const decodeStats = (v: unknown): MarketStats => {
  const r = object(v), listings = integer(own(r, "listings")), sellers = integer(own(r, "sellers")), calls = integer(own(r, "calls")),
    settled = integer(own(r, "settled")), trees = integer(own(r, "trees")), volume = requiredPair(r, "volume"), fees = requiredPair(r, "fees"), source = own(r, "source")
  if (sellers > listings || settled > calls || trees > settled || BigInt(fees.atomic) > BigInt(volume.atomic) || source !== "hub" && source !== "subgraph") return invalid()
  return { listings, sellers, calls, settled, trees, volume: volume.display, volumeAtomic: volume.atomic, fees: fees.display, feesAtomic: fees.atomic, source }
}
const receiptChild = (v: unknown, rail: string, network: string, kind: SettlementReferenceKind | undefined): PublicReceiptChild => {
  const r = object(v), priceAtomic = atomic(own(r, "priceAtomic")), settled = bool(own(r, "settled")), tx = settled ? reference(own(r, "settleTx"), rail) : undefined
  if (own(r, "price") !== money(priceAtomic)) return invalid()
  const skillId = own(r, "skillId")
  return { skillId: skillIdOk(skillId) ? skillId : "unknown-skill", priceAtomic, price: money(priceAtomic), settled,
    ...copyOptional("settleTx", tx), explorer: explorer(own(r, "explorer"), tx, settled, network, rail, kind) }
}
export const decodeReceipts = (v: unknown, requested?: string, max = 10_000): ReadonlyArray<PublicReceiptRow> => {
  const rows = array(v, max).map((value): PublicReceiptRow => {
    const r = object(value), skillId = skill(own(r, "skillId")), priceAtomic = atomic(own(r, "priceAtomic")), sellerAtomic = atomic(own(r, "sellerAtomic")),
      feeAtomic = atomic(own(r, "feeAtomic")), settled = bool(own(r, "settled")), rail = own(r, "rail"), network = text(own(r, "network"), 128), feeBps = integer(own(r, "feeBps"), 10_000)
    if (requested !== undefined && skillId !== requested || rail !== "eip3009" && rail !== "gateway" && rail !== "test" ||
      BigInt(sellerAtomic) + BigInt(feeAtomic) !== BigInt(priceAtomic) || own(r, "price") !== money(priceAtomic) ||
      own(r, "sellerShare") !== money(sellerAtomic) || own(r, "fee") !== money(feeAtomic)) return invalid()
    const tx = settled ? reference(own(r, "settleTx"), rail) : undefined, kind = settlementReferenceKind(r)
    return { skillId, skillVersion: text(own(r, "skillVersion"), 128, true), seller: address(own(r, "seller")), rail, network,
      priceAtomic, sellerAtomic, feeAtomic, feeBps, price: money(priceAtomic), sellerShare: money(sellerAtomic), fee: money(feeAtomic),
      settled, reason: reason(own(r, "reason"), settled), latencyMs: integer(own(r, "latencyMs")), createdAtMs: integer(own(r, "createdAtMs")),
      ...copyOptional("settleTx", tx), explorer: explorer(own(r, "explorer"), tx, settled, network, rail, kind), hop: integer(own(r, "hop"), 64),
      ...copyOptional("treeHash", hashOk(own(r, "treeHash")) ? own(r, "treeHash") as string : undefined),
      ...copyOptional("feeSweepTx", hashOk(own(r, "feeSweepTx")) ? own(r, "feeSweepTx") as string : undefined),
      ...copyOptional("treeCeilingAtomic", optional(r, "treeCeilingAtomic", atomic)), ...copyOptional("treeCommittedAtomic", optional(r, "treeCommittedAtomic", atomic)),
      ...copyOptional("sellerCostUsd", optional(r, "sellerCostUsd", finite)), ...copyOptional("canary", optional(r, "canary", bool)),
      ...copyOptional("session", sessionMarker(r)), ...copyOptional("settleRefKind", kind),
      children: array(own(r, "children"), 1024).map(c => receiptChild(c, rail, network, kind)) }
  })
  if (requested !== undefined && rows.some((r, i) => i > 0 && r.createdAtMs > rows[i - 1]!.createdAtMs)) return invalid()
  return rows
}
const sellerListing = (v: unknown): SellerListingRow => {
  const r = object(v), calls = integer(own(r, "calls")), settled = integer(own(r, "settled")), revenue = requiredPair(r, "revenue"), margin = pair(r, "marginPerCall", true, true)
  const live = bool(own(r, "live")), delisted = bool(own(r, "delisted"))
  if (settled > calls || live && delisted || settled === 0 && margin.atomic !== null) return invalid()
  const payAt = optional(r, "payTestedAtMs", integer), payOk = optional(r, "payTestOk", bool)
  if ((payAt === undefined) !== (payOk === undefined)) return invalid()
  return { id: skill(own(r, "id")), serviceName: text(own(r, "serviceName"), 32), price: price(own(r, "price")), live, delisted, calls, settled,
    revenue: revenue.display, revenueAtomic: revenue.atomic, marginPerCall: margin.display, marginPerCallAtomic: margin.atomic,
    ...copyOptional("payTestedAtMs", payAt), ...copyOptional("payTestOk", payOk),
    ...copyOptional("payTestTx", hashOk(own(r, "payTestTx")) && payOk !== undefined ? own(r, "payTestTx") as string : undefined),
    ...copyOptional("ensName", optional(r, "ensName", v => nameOk(v) ? v : invalid())), ...copyOptional("ensExpired", optional(r, "ensExpired", bool)),
    ...copyOptional("agentId", optional(r, "agentId", atomic)),
    ...copyOptional("registrationTx", hashOk(own(r, "registrationTx")) && own(r, "agentId") !== undefined ? own(r, "registrationTx") as string : undefined),
    ...copyOptional("agentVerified", own(r, "agentId") === undefined ? undefined : optional(r, "agentVerified", bool)) }
}
export const decodeSellerSummary = (v: unknown, requested: string): SellerSummary => {
  const r = object(v), seller = address(own(r, "seller")), calls = integer(own(r, "calls")), settled = integer(own(r, "settled")),
    revenue = requiredPair(r, "revenue"), fees = requiredPair(r, "fees"), net = requiredPair(r, "net"),
    cost = pair(r, "inferenceCost", false, true), spend = pair(r, "subSpend", false, true), margin = pair(r, "margin", true, true),
    knownCost = requiredPair(r, "knownInferenceCost"), knownSpend = requiredPair(r, "knownSubSpend"),
    costComplete = bool(own(r, "inferenceCostComplete")), spendComplete = bool(own(r, "subSpendComplete"))
  if (seller.toLowerCase() !== requested.toLowerCase() || settled > calls || BigInt(revenue.atomic) !== BigInt(fees.atomic) + BigInt(net.atomic) ||
      costComplete !== (cost.atomic !== null) || spendComplete !== (spend.atomic !== null) ||
      costComplete && cost.atomic !== knownCost.atomic || spendComplete && spend.atomic !== knownSpend.atomic ||
      (costComplete && spendComplete ? margin.atomic !== (BigInt(net.atomic) - BigInt(cost.atomic!) - BigInt(spend.atomic!)).toString() : margin.atomic !== null)) return invalid()
  const listings = array(own(r, "listings"), 1024).map(sellerListing)
  if (new Set(listings.map(l => l.id)).size !== listings.length || listings.some(l => l.calls > calls || l.settled > settled)) return invalid()
  return { seller, calls, settled, revenue: revenue.display, revenueAtomic: revenue.atomic, fees: fees.display, feesAtomic: fees.atomic,
    net: net.display, netAtomic: net.atomic, inferenceCost: cost.display, inferenceCostAtomic: cost.atomic,
    subSpend: spend.display, subSpendAtomic: spend.atomic, margin: margin.display, marginAtomic: margin.atomic,
    knownInferenceCost: knownCost.display, knownInferenceCostAtomic: knownCost.atomic, knownSubSpend: knownSpend.display, knownSubSpendAtomic: knownSpend.atomic,
    inferenceCostComplete: costComplete, subSpendComplete: spendComplete, listings }
}
const flags: readonly TreeEvidenceFlag[] = ["commitment-missing", "commitment-mismatch", "receipt-missing", "receipt-conflict", "lineage-invalid", "evidence-malformed", "limit-exceeded", "reservation-unresolved"]
export const decodeTree = (v: unknown, requested: string): TreeView => {
  const r = object(v), root = own(r, "rootJobId"), complete = bool(own(r, "complete")), evidenceFlags = array(own(r, "evidenceFlags"), flags.length)
  if (root !== requested || evidenceFlags.some(f => !flags.includes(f as TreeEvidenceFlag)) || new Set(evidenceFlags).size !== evidenceFlags.length || complete !== (evidenceFlags.length === 0)) return invalid()
  const seen = new Map<string, TreeNode>(), siblings = new Map<string, number>()
  const nodes = array(own(r, "nodes"), 256).map(value => {
    const n = object(value), id = text(own(n, "nodeId"), 64), parent = own(n, "parentNodeId"), hop = integer(own(n, "hop"), 16),
      priceAtomic = atomic(own(n, "priceAtomic")), settled = bool(own(n, "settled")),
      tx = settled ? reference(own(n, "settleTx"), "gateway") ?? reference(own(n, "settleTx"), "test") : undefined
    if (!/^0(?:\.(0|[1-9][0-9]{0,2})){0,16}$/.test(id) || seen.has(id) || hop !== id.split(".").length - 1 || own(n, "price") !== money(priceAtomic)) return invalid()
    if (id === "0") { if (parent !== null || seen.size !== 0) return invalid() }
    else {
      const expected = id.slice(0, id.lastIndexOf(".")), index = Number(id.slice(id.lastIndexOf(".") + 1))
      if (parent !== expected || !seen.has(expected) || index !== (siblings.get(expected) ?? 0)) return invalid()
      siblings.set(expected, index + 1)
    }
    const out: TreeNode = { nodeId: id, parentNodeId: parent as string | null, skillId: skill(own(n, "skillId")), hop, priceAtomic,
      price: money(priceAtomic), settled, reason: reason(own(n, "reason"), settled), latencyMs: integer(own(n, "latencyMs")),
      ...copyOptional("settleTx", tx), explorer: explorer(own(n, "explorer"), tx, settled) }
    seen.set(id, out); return out
  })
  const ceiling = optional(r, "ceiling", displayedAtomic), committed = optional(r, "committed", displayedAtomic)
  if (nodes.length === 0 || complete && (!hashOk(own(r, "treeHash")) || ceiling === undefined || committed === undefined) ||
    complete && committed !== nodes.slice(1).filter(n => n.settled).reduce((sum, n) => sum + BigInt(n.priceAtomic), 0n) ||
    complete && committed! > ceiling!) return invalid()
  return { rootJobId: requested, complete, evidenceFlags: evidenceFlags as TreeEvidenceFlag[], nodes,
    ...copyOptional("treeHash", hashOk(own(r, "treeHash")) ? own(r, "treeHash") as string : undefined),
    ...copyOptional("ceiling", optional(r, "ceiling", price)), ...copyOptional("committed", optional(r, "committed", price)) }
}
export const decodeName = (v: unknown, requested: string, origin: string): ResolvedName => {
  const r = object(v), name = own(r, "name"), skillId = skill(own(r, "skillId")), seller = address(own(r, "seller")),
    payTo = address(own(r, "payTo")), endpoint = own(r, "endpoint"), network = own(r, "chain")
  if (name !== requested || own(r, "expired") !== false || chain(network) === undefined || endpoint !== `${origin}/x/${seller}/${skillId}`) return invalid()
  return { name: requested, skillId, seller, endpoint: endpoint as string, payTo, chain: network as string,
    priceAtomic: own(r, "priceAtomic") === null ? null : atomic(own(r, "priceAtomic")), expired: false }
}
