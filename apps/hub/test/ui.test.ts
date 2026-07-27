import { describe, expect, it } from "vitest"
import { Receipt } from "@arcade/core"
import { renderIndex, type PageData } from "../src/ui.ts"

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
