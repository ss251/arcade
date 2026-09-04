import { describe, expect, it } from "vitest"
import { Receipt } from "@arcade/core"
import { Schema } from "effect"
import { PublicListing } from "@arcade/core"
import { agoText, payTestText, renderIndex, renderListingPage, renderListingRows, renderReceiptRows, type ListingView, type PageData } from "../src/ui.ts"

/**
 * The page's argument is that its figures are EVIDENCE, not claims — "every statistic is
 * computed from settled on-chain receipts". On `ARCADE_RAIL=test` that sentence is false:
 * the arithmetic is real, the settlement is not. A judge who lands on a sandbox deployment
 * and screenshots a receipt would be holding a picture of a simulated settlement rendered
 * as proof, and the one property this page exists to have would be gone.
 *
 * The resolution is the same one used for an unreadable fee splitter: don't refuse the
 * page, WITHHOLD the claim. These tests pin that, because it is a property a copy edit
 * could silently undo — the failure is invisible in a diff and only shows up in a
 * screenshot someone else takes.
 */

const receipt = (over: Partial<Receipt> = {}): Receipt =>
  new Receipt({
    jobId: "job_0001",
    skillId: "usdc-flow-check",
    skillVersion: "1.0.0",
    buyer: "0x1111111111111111111111111111111111111111",
    seller: "0x2222222222222222222222222222222222222222",
    priceAtomic: 10_000n,
    sellerAtomic: 9_500n,
    feeAtomic: 500n,
    feeBps: 500,
    settleTx: "0xabc",
    rail: "test",
    network: "eip155:5042002",
    latencyMs: 1_500,
    settled: true,
    reason: "output validated",
    createdAtMs: 1_700_000_000_000,
    ...over
  })

const page = (over: Partial<PageData> = {}): PageData => ({
  listings: [],
  // A settled receipt is present deliberately: the claim under test is about rows that
  // exist. An empty table would pass a broken implementation.
  receipts: [receipt()],
  rail: "eip3009",
  network: "eip155:5042002",
  feeBps: 500,
  ...over
})

/** The exact sentences that assert on-chain provenance. */
const EVIDENCE_CLAIM = "computed from settled on-chain"
const ONCHAIN_ROW_CLAIM = "every row is a real transaction on Arc"

const view = (over: Partial<ListingView> = {}): ListingView => ({
  listing: Schema.decodeUnknownSync(PublicListing)({ id: "usdc-flow-check", version: "1.0.0",
    serviceName: "USDC Flow Check", description: "Checks a flow.", tags: [], price: "$0.01",
    bounds: { timeoutSec: 30 }, inputSchema: { type: "object" }, outputSchema: { type: "object" } }),
  seller: "0x2222222222222222222222222222222222222222",
  stats: { skillId: "usdc-flow-check", calls: 1, settled: 1, successRate: 1,
    p50LatencyMs: 1, p95LatencyMs: 1, availability: 1 }, ratingCount: 0, ratingAverage: null, ...over
})

describe("pay-test evidence", () => {
  const meta = { rail: "eip3009", network: "eip155:5042002", feeBps: 500 }
  const passed = { atMs: Date.now() - 45_000, jobId: "job_canary", ok: true, settleTx: `0x${"a".repeat(64)}` }
  it("shows the same successful evidence on the row and detail, with a transaction link", () => {
    for (const html of [renderListingRows([view({ payTested: passed })]), renderListingPage(view({ payTested: passed }), [], meta)]) {
      expect(html).toContain("pay-tested")
      expect(html).toContain(`https://testnet.arcscan.app/tx/${passed.settleTx}`)
      expect(html).toContain('rel="noreferrer"')
    }
  })
  it("never nests a transaction link inside the listing navigation link", () => {
    const html = renderListingRows([view({ payTested: passed })])
    expect(html).toContain('href="/skill/usdc-flow-check"')
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/)
    expect(html).toContain('class="paytest"')
  })
  it("gives delisting priority over even a stale successful pay-test", () => {
    const html = renderListingPage(view({ delisted: true, payTested: passed }), [], meta)
    expect(html).toContain("delisted: failed pay-test")
    expect(html).not.toContain(`https://testnet.arcscan.app/tx/${passed.settleTx}`)
    expect(html).toContain("ordinary paid calls are refused")
  })
  it("shows an individual failed attempt without inventing a delist or settlement link", () => {
    const html = payTestText(view({ payTested: { ...passed, ok: false } }))
    expect(html).toContain("pay-test failed")
    expect(html).not.toContain("delisted")
    expect(html).not.toContain("href=")
  })
  it("states missing evidence and the reason for a skip", () => {
    expect(payTestText(view())).toContain("not pay-tested yet")
    const html = renderListingPage(view({ payTestSkip: "not pay-tested — priced above this hub's canary cap" }), [], meta)
    expect(html).toContain("not pay-tested")
    expect(html).toContain("canary cap")
  })
  it("escapes seller-derived skip reasons and transaction text", () => {
    expect(payTestText(view({ payTestSkip: '<img src=x onerror="alert(1)">' }))).not.toContain("<img")
    const html = payTestText(view({ payTested: { ...passed, settleTx: '\"><script>alert(1)</script>' } }))
    expect(html).not.toContain("<script>")
    expect(html).not.toContain('href="javascript:')
  })
  it("does not fabricate a transaction for a pass with no hash", () => {
    const { settleTx: _tx, ...withoutTx } = passed
    expect(payTestText(view({ payTested: withoutTx }))).not.toContain("href=")
  })
  it("marks only actual canary receipts without hiding their settlement arithmetic", () => {
    const html = renderReceiptRows([receipt({ canary: true })])
    expect(html).toContain("canary")
    expect(html).toContain("$0.01")
    expect(html).toContain("0xabc")
    expect(renderReceiptRows([receipt()])).not.toContain("canary")
    expect(renderReceiptRows([receipt({ canary: false })])).not.toContain("canary")
  })
})

describe("agoText", () => {
  const now = 1_700_000_000_000
  it.each([[45_000, "45s ago"], [240_000, "4m ago"], [10_800_000, "3h ago"], [180_000_000, "2d ago"],
    [-1_000, "0s ago"]])("formats elapsed time %s", (elapsed, text) => expect(agoText(now - Number(elapsed), now)).toBe(text))
  it("does not present malformed times as evidence", () => {
    expect(agoText(Number.NaN, now)).toBe("at an unknown time")
    expect(agoText(now, Infinity)).toBe("at an unknown time")
  })
})

describe("marketplace page — evidence claims", () => {
  it("asserts on-chain provenance on a real rail", () => {
    const html = renderIndex(page({ rail: "eip3009" }))
    expect(html).toContain(EVIDENCE_CLAIM)
    expect(html).toContain(ONCHAIN_ROW_CLAIM)
    expect(html).not.toContain('class="sandbox"')
  })

  it("withholds both on-chain claims on the simulated rail", () => {
    const html = renderIndex(page({ rail: "test" }))
    expect(html).not.toContain(EVIDENCE_CLAIM)
    expect(html).not.toContain(ONCHAIN_ROW_CLAIM)
  })

  it("says what the sandbox is, rather than staying silent about it", () => {
    const html = renderIndex(page({ rail: "test" }))
    expect(html).toContain('class="sandbox"')
    expect(html).toContain("No USDC")
    expect(html).toContain("not evidence that it settled")
  })

  it("keeps the settle-on-success guarantee on both rails — it is rail-independent", () => {
    // This one is TRUE on the test rail: a refusal is never charged regardless of how
    // settlement is performed. Withholding it too would understate the product.
    for (const rail of ["eip3009", "test"]) {
      expect(renderIndex(page({ rail }))).toContain("Failed calls are never charged")
    }
  })

  it("still discloses a treasury-is-seller pilot inside the sandbox copy", () => {
    // The two disclosures compose; neither branch may swallow the other.
    const html = renderIndex(page({ rail: "test", treasuryIsSeller: true }))
    expect(html).toContain("the treasury is the operator")
    expect(html).toContain("simulated settlement")
  })
})

/**
 * An unreadable splitter leaves TWO facts unverified, and the page must name both.
 *
 * When `splitterFacts` cannot reach the contract, the hub fails open on `feeBps()` AND on
 * the seller comparison — in the same breath, for the same reason. The page previously said
 * only that the split was unverified, which would let a reader assume the recipient had been
 * checked: the smaller uncertainty announced while the larger one exists. That is precisely
 * the shape these disclosures were written to prevent, so the wording was widened rather
 * than a second sentence added.
 */
describe("splitter disclosure — what was not checked", () => {
  const listingView = (over: Partial<ListingView> = {}): ListingView =>
    ({
      listing: Schema.decodeUnknownSync(PublicListing)({
        id: "usdc-flow-check",
        version: "1.0.0",
        serviceName: "USDC Flow Check",
        description: "Checks a flow.",
        tags: ["payments"],
        price: "$0.01",
        bounds: { timeoutSec: 30, maxTurns: 1, maxToolCalls: 1, maxCostUsd: 0.01 },
        inputSchema: { type: "object" },
        outputSchema: { type: "object" }
      }),
      seller: "0xcf821769ED3c0E55e152745377bb833d7155A78a",
      feeSplitter: "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206",
      splitterVerified: false,
      stats: {
        skillId: "usdc-flow-check",
        calls: 2,
        settled: 2,
        successRate: 1,
        p50LatencyMs: 1200,
        p95LatencyMs: 1800,
        availability: 1
      },
      ratingCount: 0,
      ratingAverage: null,
      ...over
    }) as ListingView

  const meta = { rail: "eip3009", network: "eip155:5042002", feeBps: 500 }

  it("says neither the split nor the payee is verified when the contract is unreadable", () => {
    const html = renderListingPage(listingView(), [], meta)
    expect(html).toContain("neither the split nor the payee is verified")
    // The stronger of the two must be spelled out, not implied.
    expect(html).toContain("nothing confirmed the splitter pays this seller")
  })

  it("does not claim the split alone is the only thing unchecked", () => {
    // The exact previous wording. Its absence is the assertion — a reader given only this
    // would reasonably conclude the recipient had been verified.
    const html = renderListingPage(listingView(), [], meta)
    expect(html).not.toMatch(/so the split is unverified/)
  })

  it("makes the verified claim only when the contract was actually read", () => {
    // The inverse. If the page said "unverified" regardless, the disclosure would carry no
    // information — the same reason an always-visible jump-to-latest button is worthless.
    const html = renderListingPage(listingView({ splitterVerified: true }), [], meta)
    expect(html).not.toContain("neither the split nor the payee is verified")
  })
})
