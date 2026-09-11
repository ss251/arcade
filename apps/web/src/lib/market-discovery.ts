import type { ListingSummary } from "./hub-decode.ts"

export type MarketSort = "catalog" | "price-low" | "price-high" | "settlement-rate" | "latency" | "evidence"
export interface MarketFilters {
  readonly query: string; readonly tags: readonly string[]; readonly minimum: string; readonly maximum: string; readonly sort: MarketSort
}
export const DEFAULT_MARKET_FILTERS: MarketFilters = { query: "", tags: [], minimum: "", maximum: "", sort: "catalog" }
export const MARKET_SORTS: readonly [MarketSort, string][] = [
  ["catalog", "Catalog order"], ["price-low", "Price: low to high"], ["price-high", "Price: high to low"],
  ["settlement-rate", "Recorded settlement rate"], ["latency", "Fastest median response"], ["evidence", "Most recorded calls"]
]
export const readMarketSort = (value: string): MarketSort | undefined => MARKET_SORTS.find(([key]) => key === value)?.[0]

/** USDC has six decimal places. Never round price limits through a JS number. */
export function marketPriceAtomic(value: string): bigint | null {
  const match = /^\$?(0|[1-9][0-9]{0,71})(?:\.([0-9]{1,6}))?$/.exec(value.trim())
  if (!match) return null
  return BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"))
}
const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-US")
export const catalogTags = (listings: readonly ListingSummary[]): readonly string[] =>
  [...new Set(listings.flatMap(listing => listing.tags ?? []))].sort((a, b) => a.localeCompare(b, "en-US"))
export const recordedStats = (listing: ListingSummary) => listing.stats !== undefined && listing.stats.calls > 0 ? listing.stats : null
export const settlementPercent = (settled: number, calls: number): string | null => {
  if (!Number.isSafeInteger(calls) || calls <= 0 || !Number.isSafeInteger(settled) || settled < 0 || settled > calls) return null
  const tenths = (BigInt(settled) * 1000n + BigInt(calls) / 2n) / BigInt(calls)
  return `${tenths / 10n}${tenths % 10n === 0n ? "" : `.${tenths % 10n}`}%`
}
const compare = (a: bigint | number, b: bigint | number) => a < b ? -1 : a > b ? 1 : 0
const knownFirst = <T>(a: T | null, b: T | null, order: (left: T, right: T) => number): number =>
  a === null ? b === null ? 0 : 1 : b === null ? -1 : order(a, b)

/** Local discovery over the returned catalog. No quotes, wallets, or fabricated measurements. */
export function discoverListings(listings: readonly ListingSummary[], filters: MarketFilters): { readonly listings: readonly ListingSummary[]; readonly error: string | null } {
  const min = filters.minimum.trim() === "" ? null : marketPriceAtomic(filters.minimum)
  const max = filters.maximum.trim() === "" ? null : marketPriceAtomic(filters.maximum)
  if (filters.minimum.trim() !== "" && min === null || filters.maximum.trim() !== "" && max === null)
    return { listings: [], error: "Enter a USDC price with up to 6 decimal places." }
  if (min !== null && max !== null && min > max) return { listings: [], error: "Minimum price must not exceed maximum price." }
  const words = normalized(filters.query.trim()).split(/\s+/).filter(Boolean)
  const found = listings.filter(listing => {
    const text = normalized([listing.serviceName, listing.id, listing.description, ...(listing.tags ?? [])].join(" "))
    if (!words.every(word => text.includes(word)) || !filters.tags.every(tag => listing.tags?.includes(tag))) return false
    const price = marketPriceAtomic(listing.price)
    return (min === null && max === null) || price !== null && (min === null || price >= min) && (max === null || price <= max)
  })
  // Stable ties retain hub catalog order. Missing/zero-call evidence always sorts last.
  return { listings: found.sort((a, b) => {
    const left = recordedStats(a), right = recordedStats(b)
    switch (filters.sort) {
      case "price-low": return knownFirst(marketPriceAtomic(a.price), marketPriceAtomic(b.price), compare)
      case "price-high": return knownFirst(marketPriceAtomic(a.price), marketPriceAtomic(b.price), (x, y) => compare(y, x))
      case "settlement-rate": return knownFirst(left, right, (x, y) => compare(BigInt(y.settled) * BigInt(x.calls), BigInt(x.settled) * BigInt(y.calls)))
      case "latency": return knownFirst(left, right, (x, y) => compare(x.p50LatencyMs, y.p50LatencyMs))
      case "evidence": return knownFirst(left, right, (x, y) => compare(y.calls, x.calls))
      default: return 0
    }
  }), error: null }
}
