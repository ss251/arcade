import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { Counters, ListingCard } from "../src/components/listing-card.tsx"
import { marketListing, marketStats, OBSERVED } from "./fixtures/market-data.ts"

const card = (over: Parameters<typeof marketListing>[0] = {}, observedAtMs: number | undefined = OBSERVED) =>
  renderToStaticMarkup(<ListingCard listing={marketListing(over)} observedAtMs={observedAtMs} />)
describe("H6 marketplace evidence and presentation", () => {
  it("caps the price track so a long valid price cannot consume the name column", () => {
    // Actual390px browser Red measured title width0 with minmax(0,auto).
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(/\.market \.listing-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) fit-content\(40%\)/.test(css)).toBe(true)
  })
  it("ranks an annotated ENS name without asserting independent verification", () => {
    const html = card({ ensName: "diff-triage.seller.arcade.eth" })
    expect(html).toContain("diff-triage.seller.arcade.eth")
    expect(html.indexOf("diff-triage.seller.arcade.eth")).toBeLessThan(html.indexOf("card-id"))
    expect(html).toContain('href="/skill/diff-triage"')
    expect(html).not.toContain("verified"); expect(html).not.toContain("name is live")
  })
  it("distinguishes explicit no-history from an older hub's missing metadata", () => {
    expect(card()).toContain("no recorded pay-test")
    const { payTested: _test, ...legacy } = marketListing()
    expect(renderToStaticMarkup(<ListingCard listing={legacy} observedAtMs={OBSERVED} />)).toContain("pay-test status unavailable")
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
    expect(card()).toContain("call statistics unavailable")
    const html = card({ stats: { calls: 0, settled: 0, successRate: 0, p50LatencyMs: 0, p95LatencyMs: 0 } })
    expect(html).toContain("no recorded calls"); expect(html).not.toContain("0s p50")
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
