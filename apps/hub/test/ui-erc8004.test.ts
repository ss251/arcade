import { describe, expect, it } from "vitest"
import { Bounds, PublicListing, explorerTxUrl } from "@arcade/core"
import { renderListingPage, type ListingView } from "../src/ui.ts"

const listing = PublicListing.make({ id: "identity-test", version: "1.0.0", serviceName: "Identity test", description: "d", tags: [],
  price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: { type: "object" }, outputSchema: { type: "object" } })
const tx = `0x${"ab".repeat(32)}`
const evidence = { validationPasses: 7, validationsRead: 8, settlementFeedback: 5, stale: false }
const view = (over: Partial<ListingView> = {}): ListingView => ({ listing, seller: `0x${"11".repeat(20)}`,
  stats: { skillId: listing.id, calls: 2, settled: 2, successRate: 1, p50LatencyMs: 10, p95LatencyMs: 20, availability: 1 },
  ratingCount: 0, ratingAverage: null, ...over })
const meta = { rail: "eip3009", network: "eip155:5042002", feeBps: 500 }
const html = (over: Partial<ListingView> = {}, rail = "eip3009") => renderListingPage(view({ agentId: "42", registrationTx: tx,
  agentVerified: true, evidence, ...over }), [], { ...meta, rail })
const section = (text: string) => text.match(/<section class="identity-evidence"[\s\S]*?<\/section>/)?.[0] ?? ""

describe("identity settlement evidence panel", () => {
  it("keeps the endpoint footer outside the receipts table container", () => {
    expect(html()).toMatch(/<\/table>\s*<\/div>\s*<footer>/)
  })
  it("shows checked ownership, announced registration link, and accurately bounded counts", () => {
    const text = section(html())
    expect(text).toContain("settlement evidence"); expect(text).toContain("ERC-8004"); expect(text).toContain("#42")
    expect(text).toContain(explorerTxUrl(tx)); expect(text).toContain("7 of 8")
    expect(text).toMatch(/20.*unique.*requests/i); expect(text).toMatch(/answered.*hub.*validator/i)
    expect(text).toMatch(/5.*hub.*attester/s); expect(text).toMatch(/registration.*announced/i)
    expect(text).toMatch(/seller owns the agent/)
  })
  it("adds no identity claim when there is no agent", () => {
    expect(renderListingPage(view(), [], meta)).not.toContain("ERC-8004")
  })
  it.each([false, undefined])("withholds even supplied fresh counts when ownership is unverified: %s", agentVerified => {
    const text = section(html({ agentVerified }))
    expect(text).toMatch(/ownership.*unverified/i); expect(text).not.toContain("7 of 8")
    expect(text).not.toContain("seller owns the agent")
  })
  it.each([undefined, { ...evidence, stale: true }])("withholds unavailable reads rather than inventing zeros", evidence => {
    const text = section(html({ evidence }))
    expect(text).toMatch(/could not be read/i); expect(text).not.toContain("7 of 8"); expect(text).not.toContain("0 of 0")
  })
  it.each([{ validationPasses: 9 }, { validationsRead: 21 }, { settlementFeedback: -1 }, { validationPasses: NaN },
    { validationsRead: 1.5 }, { settlementFeedback: Infinity }])("rejects invalid count data", over => {
    const text = section(html({ evidence: { ...evidence, ...over } }))
    expect(text).toMatch(/counts.*withheld/i); expect(text).not.toMatch(/NaN|Infinity/)
  })
  it.each([undefined, "", "0xreg", '\"><script>bad()</script>'])("never invents or injects a registration link: %s", registrationTx => {
    const text = section(html({ registrationTx }))
    expect(text).not.toContain("href="); expect(text).not.toContain("<script>"); expect(text).toContain("not recorded")
  })
  it("escapes the identity and uses no synthetic ranking terminology", () => {
    const text = section(html({ agentId: '<img src=x onerror="boom">' }))
    expect(text).not.toContain("<img"); expect(text).toContain("&lt;img")
    expect(text.toLowerCase()).not.toMatch(/score|reputation|rank|rating/)
  })
  it("does not turn simulated payment mode into chain evidence", () => {
    const text = section(html({}, "test"))
    expect(text).toMatch(/simulated/i); expect(text).not.toContain("7 of 8"); expect(text).not.toContain("seller owns the agent")
  })
})
