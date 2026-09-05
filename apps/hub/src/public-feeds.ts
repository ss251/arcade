import { formatPrice, type Receipt } from "@arcade/core"
import type { ListingRecord } from "./store.ts"
import { scrubReceipt, type PublicReceiptRow } from "./receipts-feed.ts"

/** Display convenience, not permission: finite limits truncate/clamp; invalid means 20. */
export const receiptLimit = (params: URLSearchParams): number | null => {
  if (params.getAll("limit").length > 1) return null
  const raw = Number(params.get("limit") ?? 20)
  return Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 20
}

export const listingReceiptFeed = (
  receipts: ReadonlyArray<Receipt>, skillId: string, limit: number
): ReadonlyArray<PublicReceiptRow> => receipts.filter(r => r.skillId === skillId)
  .sort((a, b) => b.createdAtMs - a.createdAtMs)
  .slice(0, limit).map(scrubReceipt)

/** Hub ledger statistics, including hub-owned canaries (not a customer-demand metric). */
export const publicStats = (
  listings: ReadonlyArray<Pick<ListingRecord, "seller">>, receipts: ReadonlyArray<Receipt>,
  source: "hub" | "subgraph" = "hub"
) => {
  // A provenance probe is not indexed statistics. G8 must supply the actual Graph
  // aggregate before this route can truthfully report any non-hub source.
  if (source !== "hub") return undefined
  const settled = receipts.filter(r => r.settled)
  const volume = settled.reduce((sum, r) => sum + r.priceAtomic, 0n)
  const fees = settled.reduce((sum, r) => sum + r.feeAtomic, 0n)
  return {
    listings: listings.length,
    sellers: new Set(listings.map(l => l.seller.toLowerCase())).size,
    calls: receipts.length,
    settled: settled.length,
    volume: formatPrice(volume), volumeAtomic: volume.toString(),
    fees: formatPrice(fees), feesAtomic: fees.toString(),
    trees: new Set(settled.filter(r => (r.children ?? []).length > 0).map(r => r.jobId)).size,
    // G8 must change the actual aggregation as well as provenance. A source-label
    // probe alone cannot turn these local counts into independently indexed data.
    source: "hub" as const
  }
}
