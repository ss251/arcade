import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ArchivedPurchase, LivePurchaseView, PendingPurchase } from "../src/components/purchase.tsx"
import type { PurchaseView } from "../src/lib/purchase-run.ts"

const skillId = "diff-triage", hash = `0x${"5".repeat(64)}`
const outcome = { source: "hub", jobId: "job_fixture", skillId, buyer: `0x${"1".repeat(40)}`, seller: `0x${"3".repeat(40)}`,
  priceAtomic: "10000", rail: "eip3009", network: "eip155:5042002", settled: true,
  reference: hash, referenceKind: "onchain", explorer: `https://testnet.arcscan.app/tx/${hash}`,
  resultJson: JSON.stringify({ report: "<script>untrusted</script>" }) } as const
const view = (over: Partial<PurchaseView> = {}): PurchaseView => ({ phase: "settled",
  message: "The hub reports settlement. This browser has not independently verified it on chain.", outcome, ...over })
describe("private live purchase presentation", () => {
  it("keeps an archived purchase passive and unverified", () => {
    const html = renderToStaticMarkup(<ArchivedPurchase />)
    expect(html).toContain("unverified transcript")
    expect(html).toContain("Request a fresh purchase")
    expect(html).not.toMatch(/<button|<a |settled on|not charged/)
  })
  it("renders complete escaped output only from the closed live view, with qualified provenance", () => {
    const html = renderToStaticMarkup(<LivePurchaseView view={view()} />)
    expect(html).toContain("has not independently verified")
    expect(html).toContain("returned by the seller")
    expect(html).toContain("Complete result JSON"); expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain(`href="${outcome.explorer}"`)
    expect(html).toContain("inspect the reported transaction")
    expect(html).toContain("$0.01")
  })
  it("discloses a long output without truncating its JSON", () => {
    const resultJson = JSON.stringify({ lines: Array.from({ length: 150 }, (_, i) => `line ${i}`) })
    const html = renderToStaticMarkup(<LivePurchaseView view={view({ outcome: { ...outcome, resultJson } })} />)
    expect(html).toContain("Complete result JSON"); expect(html).toContain("line 0"); expect(html).toContain("line 99")
  })
  it("never labels a Gateway transfer UUID as a mined transaction or explorer link", () => {
    const reference = "12345678-1234-4234-8234-123456789abc"
    const html = renderToStaticMarkup(<LivePurchaseView view={view({ outcome: { ...outcome, rail: "gateway",
      reference, referenceKind: "gateway-transfer", explorer: null } })} />)
    expect(html).toContain(reference); expect(html).toContain("not a mined transaction")
    expect(html).not.toContain("href=")
  })
  it.each(["unavailable", "invalid", "capacity", "conflict"] as const)("makes recovery storage %s visible without exposing a capability", recovery => {
    const html = renderToStaticMarkup(<LivePurchaseView view={view({ recovery, jobId: outcome.jobId })} />)
    expect(html).toContain("Recovery was not saved")
    expect(html).toContain("Keep this tab open")
    expect(html).not.toContain("?token=")
  })
  it("qualifies restored storage and a hub-reported non-settlement without a no-charge promise", () => {
    const html = renderToStaticMarkup(<LivePurchaseView view={view({ recovery: "recovered", phase: "not_settled",
      message: "The hub reports no settlement. This is not independent proof of no charge.",
      outcome: { ...outcome, settled: false, resultJson: null, reference: null, referenceKind: null, explorer: null } })} />)
    expect(html).toContain("not independent proof of no charge")
    expect(html).toContain("Earlier malformed recovery data")
    expect(html).not.toContain("you were not charged"); expect(html).not.toContain("<pre")
  })
  it("SSR does not request terms, read a wallet or mint authority", () => {
    const quote = vi.fn(), decide = vi.fn()
    const html = renderToStaticMarkup(<PendingPurchase part={{ type: "tool-arcade_call_skill", toolCallId: "call_1",
      approval: { id: "approval_1" }, state: "approval-requested",
      input: { skillId, maxAmountUsd: "$0.02", input: "{}" } }} onDecision={decide} quote={quote} />)
    expect(html).toContain("asking the endpoint")
    expect(quote).not.toHaveBeenCalled(); expect(decide).not.toHaveBeenCalled()
    expect(html).not.toContain("approval_1")
  })
})
