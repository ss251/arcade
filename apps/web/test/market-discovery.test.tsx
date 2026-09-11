import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MarketListings } from "../src/components/market-listings.tsx"
import { catalogTags, DEFAULT_MARKET_FILTERS, discoverListings, marketPriceAtomic, readMarketSort, settlementPercent, type MarketFilters } from "../src/lib/market-discovery.ts"
import { marketListing } from "./fixtures/market-data.ts"

const stats = (calls: number, settled: number, p50LatencyMs = 100) => ({ calls, settled, successRate: calls ? settled / calls : 0, p50LatencyMs, p95LatencyMs: p50LatencyMs })
const rows = [
  marketListing({ id: "triage", serviceName: "Diff Triage", description: "Review source changes", tags: ["code", "review"], price: "$0.12", stats: stats(10, 8, 2500) }),
  marketListing({ id: "research", serviceName: "Research Brief", description: "Find primary sources", tags: ["research"], price: "$0.06", stats: stats(2, 2, 900) }),
  marketListing({ id: "extract", serviceName: "Data Extraction", description: "Parse a document", tags: ["data", "review"], price: "$0.02" }),
  marketListing({ id: "untested", serviceName: "New Skill", description: "A new code utility", tags: ["code"], price: "$0.08", stats: stats(0, 0, 0) })
]
const discover = (filters: Partial<MarketFilters> = {}, list = rows) => discoverListings(list, { ...DEFAULT_MARKET_FILTERS, ...filters })
const ids = (filters: Partial<MarketFilters> = {}, list = rows) => discover(filters, list).listings.map(row => row.id)

describe("Marketplace discovery", () => {
  it.each([["DIFF", ["triage"]], ["primary sources", ["research"]], ["extract", ["extract"]], ["review", ["triage", "extract"]], [" code source ", ["triage"]], ["missing", []]])("searches human names, IDs, descriptions and tags for %s", (query, expected) => expect(ids({ query: query as string })).toEqual(expected))
  it("derives tag choices from the catalog and intersects multiple selected tags", () => {
    expect(catalogTags(rows)).toEqual(["code", "data", "research", "review"])
    expect(ids({ tags: ["code", "review"] })).toEqual(["triage"])
    expect(ids({ tags: ["unknown"] })).toEqual([])
    expect(ids({ tags: ["review"], query: "document" })).toEqual(["extract"])
  })
  it("filters inclusive exact minimum and ceiling without rounding a micro-USDC away", () => {
    expect(ids({ minimum: "0.06", maximum: "0.08" })).toEqual(["research", "untested"])
    expect(ids({ maximum: "0.059999" })).toEqual(["extract"])
    const precise = [marketListing({ id: "low", price: "$9007199254740992.000001" }), marketListing({ id: "high", price: "$9007199254740992.000002" })]
    expect(ids({ minimum: "9007199254740992.000002" }, precise)).toEqual(["high"])
    expect(marketPriceAtomic("$0.000001")).toBe(1n)
  })
  it.each(["-1", "1e3", "1.1234567", "Infinity", "01", "1,000", "abc"])("rejects invalid price limit %s", minimum => {
    expect(discover({ minimum }).error).toContain("6 decimal places")
    expect(discover({ minimum }).listings).toEqual([])
  })
  it("identifies a reversed range and restores the original catalog with clear/default filters", () => {
    expect(discover({ minimum: "1", maximum: "0.5" }).error).toContain("must not exceed")
    expect(ids()).toEqual(rows.map(row => row.id)); expect(discover().error).toBeNull()
  })
  it("sorts prices in both directions without mutating the source array", () => {
    expect(ids({ sort: "price-low" })).toEqual(["extract", "research", "untested", "triage"])
    expect(ids({ sort: "price-high" })).toEqual(["triage", "untested", "research", "extract"])
    expect(rows[0]?.id).toBe("triage")
    const precise = [marketListing({ id: "low", price: "$9007199254740992.000001" }), marketListing({ id: "high", price: "$9007199254740992.000002" })]
    expect(ids({ sort: "price-high" }, precise)).toEqual(["high", "low"])
  })
  it("sorts genuine settlement ratios and places missing/zero-call evidence last", () => {
    expect(ids({ sort: "settlement-rate" })).toEqual(["research", "triage", "extract", "untested"])
    expect(ids({ sort: "latency" })).toEqual(["research", "triage", "extract", "untested"])
    expect(ids({ sort: "evidence" })).toEqual(["triage", "research", "extract", "untested"])
    expect(settlementPercent(2, 3)).toBe("66.7%"); expect(settlementPercent(0, 0)).toBeNull()
    expect(settlementPercent(2, 1)).toBeNull(); expect(settlementPercent(0, 3)).toBe("0%")
  })
  it("never uses the separately reported successRate as a settlement ratio", () => {
    const contradictory = [marketListing({ id: "low", stats: { ...stats(10, 1), successRate: 1 } }), marketListing({ id: "high", stats: { ...stats(10, 9), successRate: 0 } })]
    expect(ids({ sort: "settlement-rate" }, contradictory)).toEqual(["high", "low"])
    expect(readMarketSort("rating")).toBeUndefined()
  })
  it("renders accessible local controls and truthfully labels the evidence sort", () => {
    const html = renderToStaticMarkup(<MarketListings listings={rows} observedAtMs={1000} />)
    for (const text of ["Search skills", "Sort skills", "Minimum per call (USDC)", "Maximum per call (USDC)", "Most recorded calls", "not a quality rating", "4 of 4 skills"]) expect(html).toContain(text)
    expect(html).toContain('aria-pressed="false"'); expect(html).not.toContain("payment-signature")
  })
})
