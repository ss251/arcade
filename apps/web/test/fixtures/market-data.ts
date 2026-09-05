import type { ListingSummary, MarketStats } from "../../src/lib/hub.ts"

export const OBSERVED = 14_400_000
export const marketListing = (over: Partial<ListingSummary> = {}): ListingSummary => ({
  id: "diff-triage", version: "0.1.0", serviceName: "Diff Triage", description: "Reviews a diff and returns a verdict.",
  tags: ["code"], price: "$0.12", seller: `0x${"1".repeat(40)}`, payTested: null, delisted: false, ...over
})
export const marketStats = (over: Partial<MarketStats> = {}): MarketStats => ({
  listings: 4, sellers: 2, calls: 31, settled: 27, volume: "$1.24", volumeAtomic: "1240000",
  fees: "$0.062", feesAtomic: "62000", trees: 3, source: "hub", ...over
})
