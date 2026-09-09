/** Read-only route projections. No Store mutation, payment or provider diagnostics.
 * Local /stats stays local; only actual decoded aggregates may say "subgraph". */
import { Effect } from "effect"
import type { Graph } from "./graph.ts"

export interface ListingGraphEvidence {
  readonly agentId: string; readonly settlementCount: number; readonly feedbackCount: number; readonly validationPassCount: number
}
export interface HubGraphTotals { readonly settlementCount: number; readonly settledVolumeAtomic: bigint }
type Payload = Readonly<Record<string, string | number>>

// G7 is the primary wire decoder. These small own-scalar projections also contain
// replacement service defects and prevent future provider fields reaching routes.
const own = (v: unknown, key: string): unknown => {
  if (!v || typeof v !== "object") return undefined
  const d = Object.getOwnPropertyDescriptor(v, key)
  return d?.enumerable && "value" in d ? d.value : undefined
}
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0
const atomic = (v: unknown): v is bigint => typeof v === "bigint" && v >= 0n && v < 1n << 256n
const statsProjection = (raw: unknown): Payload | null => {
  const counts = ["settlementCount", "treeCount", "agentCount", "feedbackCount", "validationPassCount"] as const
  const amounts = ["settledVolumeAtomic", "feeAtomic", "childTotalAtomic"] as const
  const copied: Record<string, number | bigint> = Object.create(null)
  for (const key of counts) { const value = own(raw, key); if (!count(value)) return null; copied[key] = value }
  for (const key of amounts) { const value = own(raw, key); if (!atomic(value)) return null; copied[key] = value }
  const indexedBlock = own(raw, "indexedBlock")
  if (!count(indexedBlock) || indexedBlock < 1 || indexedBlock > 2147483647 ||
    copied.treeCount! > copied.settlementCount! || copied.feeAtomic! > copied.settledVolumeAtomic!) return null
  return Object.freeze({ source: "subgraph", indexedBlock,
    ...Object.fromEntries(counts.map(key => [key, copied[key] as number])),
    ...Object.fromEntries(amounts.map(key => [key, copied[key]!.toString()])) })
}
const listingProjection = (raw: unknown): ListingGraphEvidence | null => {
  const agentId = own(raw, "agentId"), settlementCount = own(raw, "settlementCount"),
    feedbackCount = own(raw, "feedbackCount"), validationPassCount = own(raw, "validationPassCount")
  if (typeof agentId !== "string" || !/^5042002:(0|[1-9][0-9]{0,77})$/.test(agentId) ||
    BigInt(agentId.slice(8)) >= 1n << 256n || !count(settlementCount) || !count(feedbackCount) || !count(validationPassCount)) return null
  return Object.freeze({ agentId, settlementCount, feedbackCount, validationPassCount })
}
const soft = <A>(operation: () => Effect.Effect<A | null>) => Effect.suspend(operation).pipe(
  Effect.timeout(5000), Effect.catchAllCause(() => Effect.succeed(null)))

/** Fallback is lazy: a valid Graph observation does not depend on local Store IO.
 * A failed local read propagates for the HTTP owner to return a fixed 503. */
export const graphStatsPayload = (graph: Graph, hubTotals: HubGraphTotals | Effect.Effect<HubGraphTotals, unknown>): Effect.Effect<Payload, unknown> =>
  Effect.flatMap(soft(() => graph.stats().pipe(Effect.map(statsProjection))), indexed => indexed !== null
    ? Effect.succeed(indexed)
    : Effect.map(Effect.isEffect(hubTotals) ? hubTotals : Effect.succeed(hubTotals), totals => {
      if (!count(totals.settlementCount) || typeof totals.settledVolumeAtomic !== "bigint" || totals.settledVolumeAtomic < 0n) throw Error("Graph fallback unavailable")
      return Object.freeze({ source: "hub", settlementCount: totals.settlementCount, settledVolumeAtomic: totals.settledVolumeAtomic.toString() })
    }))

/** One whole-batch deadline, bounded input and max4 concurrency. Oversize input
 * omits optional evidence; it never truncates the existing catalog itself. */
export const graphEvidenceOf = (graph: Graph, listingIds: readonly string[]): Effect.Effect<ReadonlyMap<string, ListingGraphEvidence>> =>
  Effect.suspend(() => {
    const ids: string[] = []
    if (!Array.isArray(listingIds) || listingIds.length > 256) return Effect.succeed(new Map<string, ListingGraphEvidence>())
    for (let i = 0; i < listingIds.length; i++) {
      const d = Object.getOwnPropertyDescriptor(listingIds, String(i)), id = d && "value" in d ? d.value : undefined
      if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) return Effect.succeed(new Map<string, ListingGraphEvidence>())
      if (!ids.includes(id)) ids.push(id)
    }
    return Effect.forEach(ids, id => soft(() => graph.evidenceFor(id).pipe(Effect.map(listingProjection)))
      .pipe(Effect.map(value => [id, value] as const)), { concurrency: 4 }).pipe(
      Effect.map(rows => new Map(rows.flatMap(([id, value]) => value === null ? [] : [[id, value] as const]))),
      Effect.timeout(5000),
      Effect.catchAllCause(() => Effect.succeed(new Map<string, ListingGraphEvidence>())))
  }).pipe(Effect.catchAllCause(() => Effect.succeed(new Map<string, ListingGraphEvidence>())))
