import { describe, expect, it } from "vitest"
import { Receipt, ReceiptChild } from "@arcade/core"
import { Schema } from "effect"
import { PublicListing } from "@arcade/core"
import { agoText, payTestText, renderIndex, renderListingPage, renderListingRows, renderMeta, renderReceiptRows, type ListingView, type PageData } from "../src/ui.ts"

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
  it("does not relabel historical simulated rows from the current real default", () => {
    const html = renderIndex(page({ rail: "eip3009" }))
    expect(html).not.toContain(EVIDENCE_CLAIM)
    expect(html).not.toContain(ONCHAIN_ROW_CLAIM)
    expect(html).toContain("TestRail rows are simulated")
  })

  it("withholds both on-chain claims on the simulated rail", () => {
    const html = renderIndex(page({ rail: "test" }))
    expect(html).not.toContain(EVIDENCE_CLAIM)
    expect(html).not.toContain(ONCHAIN_ROW_CLAIM)
  })

  it("says what the sandbox is, rather than staying silent about it", () => {
    const html = renderIndex(page({ rail: "test" }))
    expect(html).toContain('class="sandbox"')
    expect(html).toContain("No USDC moves for TestRail rows")
    expect(html).toContain("not proof of a mined settlement")
  })

  it("distinguishes validation refusal from an unknown paid outcome on every default rail", () => {
    for (const rail of ["eip3009", "test", "gateway"]) {
      const html = renderIndex(page({ rail }))
      expect(html).not.toContain("Failed calls are never charged")
      expect(html).not.toContain("the payer keeps")
      expect(html).toContain("Settlement is attempted only after output validation")
      expect(html).toContain("An unknown paid outcome is not proof of no charge")
      expect(html).toContain("do not retry a payment automatically")
    }
  })

  it("does not relabel EIP and Gateway history when the default is TestRail", () => {
    const html = renderIndex(page({ rail: "test", receipts: [
      receipt({ rail: "eip3009", settleTx: `0x${"a".repeat(64)}` }),
      receipt({ rail: "gateway", settleRefKind: "gateway-transfer", settleTx: "00000000-0000-4000-8000-000000000001" })
    ] }))
    expect(html).not.toContain("no row below is a transaction")
    expect(html).not.toContain("no transaction below exists")
    expect(html).toContain("Gateway transfer references are not mined batch proof")
    expect(html).toContain("Reference links are for inspection")
    expect(html).toContain("<th>reference</th>")
  })

  it("still discloses a treasury-is-seller pilot inside the sandbox copy", () => {
    // The two disclosures compose; neither branch may swallow the other.
    const html = renderIndex(page({ rail: "test", treasuryIsSeller: true }))
    expect(html).toContain("the treasury is the operator")
    expect(html).toContain("TestRail rows are simulated")
  })
})

describe("receipt references and private session provenance", () => {
  const hash = `0x${"a".repeat(64)}`
  const uuid = "00000000-0000-4000-8000-000000000001"
  const child = (over: Partial<ReceiptChild> = {}) => new ReceiptChild({
    jobId: "job_private_child", skillId: "child-skill", priceAtomic: 1000n,
    settled: true, settleTx: hash, ...over
  })

  it.each([undefined, "onchain"] as const)("links only eligible EIP references with kind %s", (kind) => {
    const html = renderReceiptRows([receipt({ rail: "eip3009", settleTx: hash, ...(kind === undefined ? {} : { settleRefKind: kind }) })])
    expect(html).toContain(`href="https://testnet.arcscan.app/tx/${hash}"`)
    expect(html).toContain('rel="noreferrer"')
    expect(html).toContain("$0.01")
  })

  it.each([
    { rail: "gateway", settleRefKind: "gateway-transfer", settleTx: uuid },
    { rail: "gateway", settleRefKind: "onchain", settleTx: hash },
    { rail: "test", settleTx: hash },
    { rail: "eip3009", settleRefKind: "gateway-transfer", settleTx: hash },
    { rail: "eip3009", settleRefKind: "gateway-batch", settleTx: hash },
    { rail: "eip3009", settleRefKind: "test", settleTx: hash },
    { rail: "eip3009", network: "eip155:1", settleTx: hash },
    { rail: "eip3009", network: "arc-mainnet", settleTx: hash },
    { rail: "eip3009", settleTx: `0x${"0".repeat(64)}` },
    { rail: "eip3009", settleTx: "0xmalformed" },
    { rail: "eip3009", settled: false, settleTx: hash }
  ] satisfies Partial<Receipt>[])("does not manufacture explorer proof for %j", (over) => {
    expect(renderReceiptRows([receipt(over)])).not.toContain("href=")
  })

  it("keeps a full escaped Gateway reference and labels simulated references", () => {
    const html = renderReceiptRows([receipt({ rail: "gateway", settleRefKind: "gateway-transfer", settleTx: uuid })])
    expect(html).toContain(`Gateway transfer · ${uuid}`)
    const hostile = renderReceiptRows([receipt({ rail: "gateway", settleTx: '<img src=x onerror="alert(1)">' })])
    expect(hostile).not.toContain("<img")
    expect(hostile).not.toContain("href=")
    expect(hostile).toContain("&lt;img")
    expect(renderReceiptRows([receipt()])).toContain("simulated")
  })

  it("uses root provenance but the settled child's own state and reference", () => {
    const html = renderReceiptRows([receipt({ rail: "eip3009", settled: false, settleTx: undefined,
      children: [child()] })])
    expect(html).toContain(`href="https://testnet.arcscan.app/tx/${hash}"`)
    expect(html).toContain('class="child"')
    for (const rail of ["test", "gateway"] as const) {
      expect(renderReceiptRows([receipt({ rail, children: [child()] })])).not.toContain("href=")
    }
    expect(renderReceiptRows([receipt({ rail: "eip3009", settleTx: undefined,
      children: [child({ settled: false })] })])).not.toContain("href=")
  })

  it("scrubs a child skill alias that contains the private job handle", () => {
    const html = renderReceiptRows([receipt({ children: [child({ skillId: "job_private_child" })] })])
    expect(html).not.toContain("job_private_child")
    expect(html).toContain("unknown-skill")
  })

  it("emits only the session word alongside canary, including released receipts", () => {
    const sessionId = `ses_${"a".repeat(32)}`
    const html = renderReceiptRows([receipt({ sessionId, canary: true, settled: false, children: [child()] })])
    expect(html).toContain('<span class="unrated">session</span>')
    expect(html).toContain('<span class="unrated">canary</span>')
    expect(html).not.toContain(sessionId)
    expect(html.match(/>session<\/span>/g)).toHaveLength(1)
  })

  it.each([undefined, "ses_abc", `ses_${"A".repeat(32)}`, `ses_${"a".repeat(32)}\n`])("does not forge a session marker for %j", (sessionId) => {
    const r = { ...receipt({ sessionId }), session: true } as Receipt
    expect(renderReceiptRows([r])).not.toContain('>session</span>')
  })

  it("uses the same reference heading on the listing detail", () => {
    const html = renderListingPage(view(), [receipt()], { rail: "eip3009", network: "eip155:5042002", feeBps: 500 })
    expect(html).toContain("<th>reference</th>")
    expect(html).not.toContain("<th>tx</th>")
  })

  it("does not claim zero charge from a non-settled receipt after an unknown paid outcome", () => {
    const html = renderReceiptRows([receipt({ rail: "eip3009", settled: false, reason: "SettleError", settleTx: undefined })])
    expect(html).not.toContain("$0 charged")
    expect(html).toContain('title="No settlement recorded; not a balance proof."')
    expect(html).toContain("SettleError")
  })

  it.each([undefined, "unexpected", null])("does not turn a present invalid kind into legacy link authority: %j", (kind) => {
    const malformed = { ...receipt({ rail: "eip3009", settleTx: hash }), settleRefKind: kind } as unknown as Receipt
    expect(renderReceiptRows([malformed])).not.toContain("href=")
  })
})

describe("receipt table scroll structure", () => {
  it.each(["index", "detail"] as const)("provides contained, keyboard-accessible scrolling on the %s page", (surface) => {
    const html = surface === "index" ? renderIndex(page()) : renderListingPage(view(), [receipt()],
      { rail: "eip3009", network: "eip155:5042002", feeBps: 500 })
    // String assertions pin the CSS/accessible structure, not browser layout.
    expect(html).toMatch(/\.tape\{[^}]*overflow-x:auto/)
    expect(html).toContain(".tape table{min-width:640px}")
    expect(html).toContain('<div class="tape" role="region" aria-label="Receipts (scroll horizontally for references)" tabindex="0">')
    expect(html).toContain(".tape:focus-visible")
  })
})

describe("mixed-receipt fee presentation", () => {
  const gateway = receipt({ rail: "gateway", settleRefKind: "gateway-transfer",
    settleTx: "00000000-0000-4000-8000-000000000001", feeBps: 0, feeAtomic: 0n, sellerAtomic: 10000n })
  it.each(["index", "detail"] as const)("does not apply the configured percentage to every %s receipt", (surface) => {
    const html = surface === "index" ? renderIndex(page({ receipts: [gateway] })) : renderListingPage(view(), [gateway],
      { rail: "eip3009", network: "eip155:5042002", feeBps: 500 })
    expect(html).not.toContain('<th class="num">fee (5%)</th>')
    expect(html).toContain('<th class="num">fee</th>')
    expect(html).toContain('<td class="num">$0.00</td>')
  })
  it("labels the configured default consistently in initial and refreshed metadata", () => {
    for (const html of [renderIndex(page({ receipts: [gateway] })), renderMeta(page({ receipts: [gateway] }))]) {
      expect(html).toContain("default fee 5%")
    }
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
