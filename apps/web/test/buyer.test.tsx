import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Buyer, BuyerRecoveryPanel, BuyerSavedList } from "../src/components/buyer.tsx"
import type { BuyerRecoveryView, SavedJobSummary } from "../src/lib/buyer-recovery.ts"

const job: SavedJobSummary = { jobId: `job_${"a".repeat(32)}`, skillId: "diff-triage", priceAtomic: "10000",
  createdAtMs: 10, hubOrigin: "https://hub.example", realm: "ordinary" }
const view: BuyerRecoveryView = { selected: job, busy: null, tree: { state: "idle" }, result: { state: "idle" } }
const noop = () => {}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe("buyer presentation and passive SSR", () => {
  it("SSR never reads browser storage, signs, or fetches", () => {
    const io = vi.fn(() => { throw Error("SSR IO") })
    vi.stubGlobal("fetch", io); vi.stubGlobal("window", { get localStorage() { return io() }, ethereum: { request: io } })
    const html = renderToStaticMarkup(<Buyer />)
    expect(html).toContain("Loading saved access on this browser"); expect(html).toContain("Session recovery is unavailable here")
    expect(html).not.toContain("No saved jobs"); expect(io).not.toHaveBeenCalled()
  })
  it.each(["invalid", "unavailable", "ready"] as const)("distinguishes empty and storage %s", status => {
    const html = renderToStaticMarkup(<BuyerSavedList status={status} jobs={[]} selected={null} onSelect={noop} />)
    expect(html).toContain(status === "invalid" ? "Saved access is unreadable" : status === "unavailable" ? "Browser storage is unavailable" : "No saved jobs")
    expect(html).not.toMatch(/\$0|spent|balance/)
  })
  it("shows accepted price and full issuer without adding spend totals or capabilities", () => {
    const html = renderToStaticMarkup(<BuyerSavedList status="ready" jobs={[job]} selected={null} onSelect={noop} />)
    expect(html).toContain("Accepted price"); expect(html).toContain("$0.01"); expect(html).toContain(job.hubOrigin)
    expect(html).toContain(job.jobId); expect(html).not.toMatch(/Total spent|job_token|x-job-token|token=/)
  })
  it("requires explicit reads and describes weaker historical provenance", () => {
    const html = renderToStaticMarkup(<BuyerRecoveryPanel view={view} onRead={noop} onCancel={noop} onForget={noop} />)
    expect(html).toContain("View result"); expect(html).toContain("View receipt tree")
    expect(html).toContain("not the original signed buyer or nonce"); expect(html).toContain("Forget this job on this browser")
    expect(html).toContain("does not cancel a job or revoke its token")
  })
  it("renders escaped complete result text and qualifies Gateway references", () => {
    const output = JSON.stringify({ report: '<script>alert("seller")</script>' })
    const html = renderToStaticMarkup(<BuyerRecoveryPanel view={{ ...view, result: { state: "settled", source: "issuing-hub", correlation: "saved-row",
      rail: "gateway", network: "eip155:5042002", priceAtomic: "10000", reference: "12345678-1234-4234-8234-123456789abc",
      referenceKind: "gateway-transfer", explorer: null, resultJson: output } }} onRead={noop} onCancel={noop} onForget={noop} />)
    expect(html).toContain("Hub reports settled"); expect(html).toContain("not a mined transaction")
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("/tx/")
    expect(html).toContain('tabindex="0" role="region" aria-label="Complete result JSON"')
  })
  it.each(["pending", "unavailable", "not_settled"] as const)("keeps %s evidence separate from a no-charge claim", state => {
    const result = state === "not_settled" ? { state, source: "issuing-hub" as const, correlation: "saved-row" as const,
      rail: "eip3009" as const, network: "eip155:5042002", priceAtomic: "10000", reference: null, referenceKind: null, explorer: null, resultJson: null } : { state }
    const html = renderToStaticMarkup(<BuyerRecoveryPanel view={{ ...view, result }} onRead={noop} onCancel={noop} onForget={noop} />)
    expect(html).toContain(state === "pending" ? "Hub still reports pending" : state === "unavailable" ? "Result unavailable" : "Hub reports not settled")
    expect(html).not.toMatch(/not charged|refunded|paid nothing|Total spent/)
  })
})
