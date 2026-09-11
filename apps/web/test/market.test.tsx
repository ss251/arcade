import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { Counters, ListingCard } from "../src/components/listing-card.tsx"
import { marketListing, marketStats, OBSERVED } from "./fixtures/market-data.ts"

const card = (over: Parameters<typeof marketListing>[0] = {}, observedAtMs: number | undefined = OBSERVED) =>
  renderToStaticMarkup(<ListingCard listing={marketListing(over)} observedAtMs={observedAtMs} />)
describe("H6 marketplace evidence and presentation", () => {
  it("gives name and price intrinsic tracks that stack with enlarged text", () => {
    // Re-pinned 2026-09-10 for compact cards that still reflow at 200%: a fixed price percentage crushed
    // both values. Minimum rem tracks wrap; neither can consume the other's track.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 6rem), 1fr))")
  })
  it("leads with a human service name and leaves ENS detail to the listing", () => {
    const html = card({ ensName: "diff-triage.seller.arcade.eth" })
    expect(html).toContain(">Diff Triage</a>")
    expect(html).not.toContain("diff-triage.seller.arcade.eth")
    expect(html).toContain('href="/skill/diff-triage"')
    expect(html).not.toContain("verified"); expect(html).not.toContain("name is live")
  })
  it("says nothing about a pay-test it has no record of, in either absent form", () => {
    // Both absences used to print a sentence about the absence, on every card. The rule
    // that matters is unchanged and asserted below: an unknown pay-test must never be
    // rendered as a passing or failing one. Silence satisfies it; a sentence only added
    // noise to a nine-card catalog.
    const explicit = card()
    expect(explicit).not.toContain("pay-test")
    expect(explicit).not.toContain("is-settled"); expect(explicit).not.toContain("is-refused")
    const { payTested: _test, ...legacy } = marketListing()
    const missing = renderToStaticMarkup(<ListingCard listing={legacy} observedAtMs={OBSERVED} />)
    expect(missing).not.toContain("pay-test")
    expect(missing).not.toContain("is-settled"); expect(missing).not.toContain("is-refused")
  })
  it("uses the serialized observation time and never creates an explorer URL from a bare hash", () => {
    const html = card({ payTested: { atMs: OBSERVED - 7_200_000, jobId: "", ok: true, settleTx: `0x${"ab".repeat(32)}` } })
    expect(html).toContain("pay-tested 2h ago"); expect(html).toContain("is-settled")
    expect(html).not.toContain("arcscan"); expect(html).not.toContain("/tx/")
    expect(html).not.toContain("mined"); expect(html).not.toContain("on-chain")
  })
  it("keeps failed tests distinct, without a no-charge promise", () => {
    const html = card({ payTested: { atMs: OBSERVED, jobId: "", ok: false } })
    expect(html).toContain("pay-test failed"); expect(html).toContain("is-refused")
    expect(html).not.toContain("uncharged"); expect(html).not.toContain("balance untouched")
  })
  it.each(["11111111-2222-3333-4444-555555555555", "0xtest0123456789abcdef"])("does not invent an explorer link for unqualified reference %s", settleTx => {
    const html = card({ payTested: { atMs: OBSERVED, jobId: "", ok: true, settleTx } })
    expect(html).not.toContain("/tx/"); expect(html).not.toContain("arcscan")
  })
  it.each([{ delisted: true }, { ensExpired: true, ensName: "diff-triage.seller.arcade.eth" }])("disables informational detail links for unavailable cards %j", over => {
    const html = card(over)
    expect(html).toContain("Diff Triage"); expect(html).not.toContain('href="/skill/')
    expect(html).toContain(over.delisted ? "delisted" : "name expired")
  })
  it("does not turn absent latency into zero or display an empty sample as measured latency", () => {
    // The defect this guards against is a fabricated measurement, not a missing sentence.
    // Absent stats and a zero-call sample both render nothing at all, which cannot be
    // misread as "0s p50" the way a printed zero could.
    expect(card()).not.toContain("p50")
    const html = card({ stats: { calls: 0, settled: 0, successRate: 0, p50LatencyMs: 0, p95LatencyMs: 0 } })
    expect(html).not.toContain("p50"); expect(html).not.toContain("0s")
    const real = card({ stats: { calls: 17, settled: 15, successRate: 15 / 17, p50LatencyMs: 2471, p95LatencyMs: 3113 } })
    // Discovery shows one qualified proof line; technical latency belongs in receipt detail.
    expect(real).toContain("15/17 settled"); expect(real).toContain("hub records"); expect(real).not.toContain("p50")
  })
  it("escapes hostile seller prose and retains the exact price string", () => {
    const html = card({ description: "<img src=x onerror=alert(1)>", price: "$0.000001" })
    expect(html).not.toContain("<img"); expect(html).toContain("&lt;img"); expect(html).toContain("$0.000001")
  })
  it("does not disguise future or unavailable observation timestamps as fresh evidence", () => {
    expect(card({ payTested: { atMs: OBSERVED + 1, jobId: "", ok: true } })).toContain("in the future")
    expect(card({ payTested: { atMs: OBSERVED, jobId: "", ok: true } }, NaN)).toContain("time unavailable")
  })
  it("prints exact recorded money/counts and always names their source", () => {
    const html = renderToStaticMarkup(<Counters stats={marketStats()} />)
    expect(html).toContain("$1.24"); expect(html).toContain("$0.062"); expect(html).toContain("hub receipts")
    expect(html).toContain("recorded settled volume"); expect(html).toContain("4")
    expect(renderToStaticMarkup(<Counters stats={marketStats({ source: "subgraph" })} />)).toContain("the subgraph")
    expect(html).not.toContain("customer demand")
  })
})
