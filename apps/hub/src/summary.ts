import { formatPrice, ReceiptChild, treeHashOf, type Receipt } from "@arcade/core"
import type { ListingRecord, RunnerRecord } from "./store.ts"

/** A route can map this named, fixed diagnostic to an unavailable response. */
export class SellerSummaryUnavailable extends Error {
  readonly _tag = "SellerSummaryUnavailable"
  constructor() { super("seller summary is unavailable"); this.name = "SellerSummaryUnavailable" }
}
function refuse(): never { throw new SellerSummaryUnavailable() }
const MAX_ROWS = 10_000
const MAX_ENTITIES = 1_024
const MAX_DESCENDANTS = 1_024
const MAX_HOP = 64
const UINT256_MAX = (1n << 256n) - 1n
const own = (value: unknown, key: string): unknown => {
  if (value === null || typeof value !== "object") return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined
}
const address = (value: unknown): string | undefined =>
  typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value)
    ? value.toLowerCase() : undefined
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
const skill = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(value)
const hash = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/.test(value)
const railName = (value: unknown): value is Receipt["rail"] => value === "eip3009" || value === "gateway" || value === "test"
// Locators only: Gateway transfer UUIDs and simulated rail references are not chain proof.
const reference = (rail: Receipt["rail"], value: unknown): value is string => hash(value) || typeof value === "string" && (
  rail === "gateway" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value) ||
  rail === "test" && /^0xtest[0-9a-fA-F]{14,26}$/.test(value))
const instant = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const atomic = (value: unknown): value is bigint => typeof value === "bigint" && value >= 0n && value <= UINT256_MAX
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
const list = (value: unknown, max: number): readonly unknown[] => {
  if (!Array.isArray(value) || value.length > max) refuse()
  const snapshot: unknown[] = []
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
    if (descriptor === undefined || !("value" in descriptor)) refuse()
    snapshot.push(descriptor.value)
  }
  return snapshot
}

/** Reported USD rounded once to six decimals, only while atomic precision is safe. */
export const usdToAtomic = (usd: number): bigint => {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) refuse()
  const rounded = Math.round(usd * 1_000_000)
  if (!Number.isSafeInteger(rounded)) refuse()
  return BigInt(rounded)
}
const money = (value: bigint): string => value < 0n ? `-${formatPrice(-value)}` : formatPrice(value)

export interface SellerListingRow {
  readonly id: string; readonly serviceName: string; readonly price: string
  readonly live: boolean; readonly delisted: boolean
  readonly payTestedAtMs?: number; readonly payTestOk?: boolean; readonly payTestTx?: string
  readonly ensName?: string; readonly ensExpired?: boolean
  readonly agentId?: string; readonly registrationTx?: string; readonly agentVerified?: boolean
  readonly calls: number; readonly settled: number
  readonly revenue: string; readonly revenueAtomic: string
  /** Total listing margin, including failed-job overhead, divided by settled calls. */
  readonly marginPerCall: string | null; readonly marginPerCallAtomic: string | null
}
export interface SellerSummary {
  readonly seller: string; readonly calls: number; readonly settled: number
  readonly revenue: string; readonly revenueAtomic: string
  readonly fees: string; readonly feesAtomic: string
  readonly net: string; readonly netAtomic: string
  readonly inferenceCost: string | null; readonly inferenceCostAtomic: string | null
  readonly subSpend: string | null; readonly subSpendAtomic: string | null
  readonly margin: string | null; readonly marginAtomic: string | null
  /** Known subtotals are not complete costs when the corresponding flag is false. */
  readonly knownInferenceCost: string; readonly knownInferenceCostAtomic: string
  readonly knownSubSpend: string; readonly knownSubSpendAtomic: string
  readonly inferenceCostComplete: boolean; readonly subSpendComplete: boolean
  readonly listings: ReadonlyArray<SellerListingRow>
}

interface Lineage { root: string; parent: string | undefined; hop: number; ancestors: readonly string[] }
interface Child { jobId: string; skillId: string; price: bigint; settled: boolean; tx: string | undefined }
interface Row extends Child {
  seller: string; buyer: string; net: bigint; fee: bigint; cost: bigint | null
  version: string; network: string; rail: Receipt["rail"]; at: number
  lineage: Lineage | null; children: readonly Child[] | null; committed: bigint | null
  /** Undefined is absent local-ledger metadata; null is a supplied malformed commitment. */
  treeHash: string | null | undefined
}
const lineageOf = (r: unknown): Lineage | null => {
  const root = own(r, "rootJobId"), parent = own(r, "parentJobId"), hop = own(r, "hop"), raw = own(r, "ancestors")
  if (!id(root) || (parent !== undefined && !id(parent)) || typeof hop !== "number" ||
    !Number.isInteger(hop) || hop < 0 || hop > MAX_HOP || !Array.isArray(raw) || raw.length !== hop) return null
  const ancestors = list(raw, MAX_HOP)
  if (!ancestors.every(skill) || new Set(ancestors).size !== ancestors.length) return null
  return { root, parent, hop, ancestors }
}
const childOf = (r: unknown, rail: Receipt["rail"]): Child => {
  const jobId = own(r, "jobId"), skillId = own(r, "skillId"), price = own(r, "priceAtomic"), settled = own(r, "settled"), tx = own(r, "settleTx")
  if (!id(jobId) || !skill(skillId) || !atomic(price) || typeof settled !== "boolean" || (tx !== undefined && !reference(rail, tx))) refuse()
  // The canonical tree commits the original locator bytes, including hex letter case.
  return { jobId, skillId, price, settled, tx: typeof tx === "string" ? tx : undefined }
}
const rowOf = (r: unknown, now: number): Row => {
  const rail = own(r, "rail")
  if (!railName(rail)) refuse()
  const child = childOf(r, rail), seller = address(own(r, "seller")), buyer = address(own(r, "buyer"))
  const net = own(r, "sellerAtomic"), fee = own(r, "feeAtomic"), cost = own(r, "sellerCostUsd"), at = own(r, "createdAtMs")
  const version = own(r, "skillVersion"), network = own(r, "network")
  if (seller === undefined || buyer === undefined || !atomic(net) || !atomic(fee) || net + fee !== child.price ||
    !instant(at) || at > now || !text(version, 128) || network !== "eip155:5042002") refuse()
  const rawChildren = own(r, "children"), committed = own(r, "treeCommittedAtomic"), treeHash = own(r, "treeHash")
  return { ...child, seller, buyer, net, fee, cost: cost === undefined ? null : usdToAtomic(cost as number), at, version, network, rail,
    lineage: lineageOf(r), children: rawChildren === undefined ? null : list(rawChildren, MAX_DESCENDANTS).map(c => childOf(c, rail))
      .sort((a, b) => a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0),
    committed: atomic(committed) ? committed : null, treeHash: treeHash === undefined ? undefined : hash(treeHash) ? treeHash.toLowerCase() : null }
}
// Compare only the bounded accounting projection. Private diagnostics and fee-sweep
// backfills are irrelevant; economically contradictory duplicates cannot pick a winner.
const fingerprint = (value: Row): string => JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item)
const rootOf = (r: Row, rows: ReadonlyMap<string, Row>): Row | undefined => {
  let current = r
  for (let depth = 0; depth <= MAX_HOP; depth++) {
    const l = current.lineage
    if (l === null) return undefined
    if (l.hop === 0) return l.parent === undefined && l.root === current.jobId && l.ancestors.length === 0 ? current : undefined
    if (l.parent === undefined) return undefined
    const parent = rows.get(l.parent), p = parent?.lineage
    if (parent === undefined || p === undefined || p === null || p.root !== l.root || p.hop + 1 !== l.hop ||
      l.ancestors[l.hop - 1] !== parent.skillId || p.ancestors.some((name, i) => l.ancestors[i] !== name) ||
      l.ancestors.includes(current.skillId)) return undefined
    current = parent
  }
  return undefined
}

interface Totals { calls: number; settled: number; revenue: bigint; fees: bigint; net: bigint; cost: bigint; spend: bigint; costComplete: boolean; spendComplete: boolean }
const empty = (): Totals => ({ calls: 0, settled: 0, revenue: 0n, fees: 0n, net: 0n, cost: 0n, spend: 0n, costComplete: true, spendComplete: true })
const margin = (t: Totals): bigint | null => t.costComplete && t.spendComplete ? t.net - t.cost - t.spend : null

/**
 * Pure summary over a complete hub snapshot, not a financial/chain verifier. `children`
 * on modern root receipts is a FLAT descendant commitment, despite its legacy comment.
 * Exact direct edges require full child receipts, parent/root/hop/skill ancestry and the
 * actual child's buyer. A different buyer could be a dedicated seller-controlled subbuy
 * wallet or a sponsor; receipts alone cannot attribute its funding, so margin is unknown.
 * Missing root
 * manifests/context make spend unknown, not zero. Missing inference reports are likewise
 * unknown, including scripts and failed jobs; every known failed-job cost is included.
 * Canary purchases remain calls in the ledger, not an invented customer-demand metric.
 */
export const sellerSummary = (
  seller: string, listings: ReadonlyArray<ListingRecord>, receipts: ReadonlyArray<Receipt>,
  runners: ReadonlyArray<RunnerRecord>, nowMs: number
): SellerSummary => {
  try {
    const key = address(seller)
    if (key === undefined || !instant(nowMs)) refuse()
    const inputListings = list(listings, MAX_ENTITIES), inputRunners = list(runners, MAX_ENTITIES), inputReceipts = list(receipts, MAX_ROWS)
    const rows = new Map<string, Row>(), conflicts = new Set<string>(), relevant = new Set<string>()
    let descendants = 0
    for (const r of inputReceipts) {
      const mine = address(own(r, "seller")) === key, jobId = own(r, "jobId")
      if (mine && id(jobId)) relevant.add(jobId)
      let parsed: Row
      try { parsed = rowOf(r, nowMs) } catch { if (mine) refuse(); if (id(jobId)) conflicts.add(jobId); continue }
      descendants += parsed.children?.length ?? 0
      if (descendants > 20_000) refuse()
      const previous = rows.get(parsed.jobId)
      if (previous !== undefined && fingerprint(previous) !== fingerprint(parsed)) conflicts.add(parsed.jobId)
      else rows.set(parsed.jobId, parsed)
    }
    for (const conflict of conflicts) { if (relevant.has(conflict)) refuse(); rows.delete(conflict) }
    const roots = new Map<string, Row | undefined>(), members = new Map<string, Row[]>()
    for (const r of rows.values()) {
      const root = rootOf(r, rows)
      roots.set(r.jobId, root)
      if (r.lineage !== null) {
        const group = members.get(r.lineage.root) ?? []
        group.push(r); members.set(r.lineage.root, group)
      }
    }
    const complete = new Map<string, boolean>()
    for (const [rootId, group] of members) {
      const root = rows.get(rootId), manifest = root?.children
      let valid = root !== undefined && roots.get(rootId) === root && manifest !== undefined && manifest !== null && root.committed !== null
      const children = new Map<string, Child>()
      let committed = 0n
      for (const c of manifest ?? []) {
        const full = rows.get(c.jobId)
        // Actual root manifests contain non-released reservations as well as commits.
        // An unsettled entry still present is unresolved, not evidence of a free hire.
        if (!c.settled || children.has(c.jobId) || c.jobId === rootId || full === undefined || roots.get(c.jobId) !== root || full.rail !== root?.rail ||
          full.skillId !== c.skillId || full.price !== c.price || full.settled !== c.settled || full.tx !== c.tx) valid = false
        children.set(c.jobId, c)
        if (c.settled) committed += c.price
      }
      if (root?.committed !== committed) valid = false
      // Completeness means coherent local ledger data, not independently mined proof.
      // Missing hashes do not invent blockchain verification; a supplied hash must match.
      if (root !== undefined && root.treeHash !== undefined && root.treeHash !== treeHashOf(rootId, (manifest ?? []).map(c => ReceiptChild.make({
        jobId: c.jobId, skillId: c.skillId, priceAtomic: c.price, settled: c.settled,
        ...(c.tx === undefined ? {} : { settleTx: c.tx })
      })))) valid = false
      for (const r of group) if (roots.get(r.jobId) !== root || (r.jobId !== rootId && r.settled && !children.has(r.jobId))) valid = false
      complete.set(rootId, valid)
    }
    const spend = new Map<string, bigint>(), unknownFunding = new Set<string>()
    for (const r of rows.values()) {
      const root = roots.get(r.jobId)
      if (!r.settled || r.lineage?.parent === undefined || root === undefined || r.rail !== root.rail) continue
      const parent = rows.get(r.lineage.parent)
      if (parent?.seller !== key) continue
      if (r.buyer !== key) { unknownFunding.add(parent.jobId); continue }
      spend.set(parent.jobId, (spend.get(parent.jobId) ?? 0n) + r.price)
    }
    const total = empty(), perSkill = new Map<string, Totals>()
    for (const r of rows.values()) {
      if (r.seller !== key) continue
      const per = perSkill.get(r.skillId) ?? empty()
      for (const t of [total, per]) {
        t.calls++
        if (r.settled) { t.settled++; t.revenue += r.price; t.fees += r.fee; t.net += r.net }
        if (r.cost === null) t.costComplete = false
        else t.cost += r.cost
        t.spend += spend.get(r.jobId) ?? 0n
        if (r.lineage === null || roots.get(r.jobId) === undefined || complete.get(r.lineage.root) !== true || unknownFunding.has(r.jobId)) t.spendComplete = false
      }
      perSkill.set(r.skillId, per)
    }
    const runnerClaims = new Map<string, string>(), ambiguousRunners = new Set<string>()
    for (const r of inputRunners) {
      const runnerId = own(r, "runnerId"), skills = own(r, "skillIds")
      if (!id(runnerId)) continue
      const claimedSkills = Array.isArray(skills) ? list(skills, MAX_ENTITIES).filter(skill).slice().sort() : null
      const connected = own(r, "connectedAtMs"), last = own(r, "lastSeenMs")
      const signature = JSON.stringify([address(own(r, "seller")), instant(connected) ? connected : null, instant(last) ? last : null, claimedSkills])
      const previous = runnerClaims.get(runnerId)
      if (previous !== undefined && previous !== signature) ambiguousRunners.add(runnerId)
      runnerClaims.set(runnerId, signature)
    }
    const owners = new Map<string, Set<string | undefined>>()
    for (const rec of inputListings) {
      const skillId = own(own(rec, "listing"), "id")
      if (!skill(skillId)) continue
      const claims = owners.get(skillId) ?? new Set<string | undefined>()
      claims.add(address(own(rec, "seller"))); owners.set(skillId, claims)
    }
    const seen = new Map<string, string>(), listingRows: SellerListingRow[] = []
    for (const rec of inputListings) {
      if (address(own(rec, "seller")) !== key) continue
      const listing = own(rec, "listing"), skillId = own(listing, "id"), serviceName = own(listing, "serviceName"), price = own(listing, "price")
      const runnerId = own(rec, "runnerId"), published = own(rec, "publishedAtMs")
      if (!skill(skillId) || !text(serviceName, 32) || !text(price, 100) || !/^\$?\d+(\.\d{1,6})?$/.test(price) || !id(runnerId) || !instant(published)) refuse()
      if (owners.get(skillId)?.size !== 1) refuse()
      const delisted = own(rec, "delisted") === true, per = perSkill.get(skillId) ?? empty(), m = margin(per)
      const live = !delisted && !ambiguousRunners.has(runnerId) && published <= nowMs && inputRunners.some(r => {
        const connected = own(r, "connectedAtMs"), last = own(r, "lastSeenMs"), skills = own(r, "skillIds")
        return own(r, "runnerId") === runnerId && address(own(r, "seller")) === key && instant(connected) &&
          connected <= published && instant(last) && last >= connected && last <= nowMs && nowMs - last <= 30_000 &&
          Array.isArray(skills) && list(skills, MAX_ENTITIES).includes(skillId)
      })
      const pay = own(rec, "payTested"), payAt = own(pay, "atMs"), payOk = own(pay, "ok"), payTx = own(pay, "settleTx")
      const ensName = own(rec, "ensName"), agentId = own(rec, "agentId"), registrationTx = own(rec, "registrationTx"), agentVerified = own(rec, "agentVerified")
      const validAgent = typeof agentId === "string" && /^(0|[1-9][0-9]{0,77})$/.test(agentId) && BigInt(agentId) <= UINT256_MAX
      const avg = m === null || per.settled === 0 ? null : m / BigInt(per.settled)
      const row: SellerListingRow = {
        id: skillId, serviceName, price, live, delisted, calls: per.calls, settled: per.settled,
        revenue: money(per.revenue), revenueAtomic: per.revenue.toString(),
        marginPerCall: avg === null ? null : money(avg), marginPerCallAtomic: avg?.toString() ?? null,
        ...(instant(payAt) && payAt <= nowMs && typeof payOk === "boolean" ? {
          payTestedAtMs: payAt, payTestOk: payOk, ...(hash(payTx) ? { payTestTx: payTx } : {})
        } : {}),
        ...(text(ensName, 253) && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(ensName) ? { ensName } : {}),
        ...(validAgent ? { agentId, ...(hash(registrationTx) ? { registrationTx } : {}),
          ...(typeof agentVerified === "boolean" ? { agentVerified } : {}) } : {})
      }
      // No ensExpired is manufactured: it lives in the current watcher, not ListingRecord.
      const signature = JSON.stringify({ row, runnerId, published })
      const previous = seen.get(skillId)
      if (previous !== undefined && previous !== signature) refuse()
      if (previous === undefined) listingRows.push(row)
      seen.set(skillId, signature)
    }
    const m = margin(total)
    return {
      seller: key, calls: total.calls, settled: total.settled,
      revenue: money(total.revenue), revenueAtomic: total.revenue.toString(), fees: money(total.fees), feesAtomic: total.fees.toString(),
      net: money(total.net), netAtomic: total.net.toString(),
      inferenceCost: total.costComplete ? money(total.cost) : null, inferenceCostAtomic: total.costComplete ? total.cost.toString() : null,
      subSpend: total.spendComplete ? money(total.spend) : null, subSpendAtomic: total.spendComplete ? total.spend.toString() : null,
      margin: m === null ? null : money(m), marginAtomic: m?.toString() ?? null,
      knownInferenceCost: money(total.cost), knownInferenceCostAtomic: total.cost.toString(),
      knownSubSpend: money(total.spend), knownSubSpendAtomic: total.spend.toString(),
      inferenceCostComplete: total.costComplete, subSpendComplete: total.spendComplete, listings: listingRows
    }
  } catch { throw new SellerSummaryUnavailable() }
}
