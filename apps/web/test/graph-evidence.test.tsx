import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { decodeListing, decodeListings } from "../src/lib/hub-decode.ts"
import { loadSkillPage } from "../src/lib/skill-page-data.ts"
import { SkillPage } from "../src/components/skill-page.tsx"

const graph = { agentId: "5042002:7", settlementCount: 11, feedbackCount: 5, validationPassCount: 4 }
const raw = (evidence: unknown = graph) => ({ id: "diff-triage", version: "1", serviceName: "Diff Triage",
  description: "Offline Graph fixture", price: "$0.12", seller: `0x${"1".repeat(40)}`,
  inputSchema: {}, outputSchema: {}, bounds: { timeoutSec: 5 }, graph: evidence })
const page = async (value: unknown) => loadSkillPage({ name: "diff-triage" }, {
  describeSkill: vi.fn(async () => decodeListing(value, "diff-triage")),
  listingReceipts: vi.fn(async () => []),
  resolveName: vi.fn(async () => { throw Error("Unexpected name read") })
}, () => 1)

describe("G8 optional web index evidence", () => {
  it("retains only the shared four-field projection through both decoders", () => {
    const input = raw({ ...graph, indexedBlock: 99, privateUrl: "PRIVATE_GRAPH", nested: { key: "PRIVATE_GRAPH" } })
    const detail = decodeListing(input, "diff-triage"), catalogue = decodeListings([input])
    expect(detail).toHaveProperty("graph", graph); expect(catalogue[0]).toHaveProperty("graph", graph)
    expect(JSON.stringify({ detail, catalogue })).not.toMatch(/PRIVATE_GRAPH|indexedBlock/)
  })
  it("preserves that exact evidence through the actual page serialization and render", async () => {
    const data = await page(raw()), html = renderToStaticMarkup(<SkillPage data={data} />)
    expect(data.listing).toHaveProperty("graph", graph)
    expect(html).toContain('aria-label="Indexed evidence"'); expect(html).toContain("5042002:7")
    for (const label of ["Indexed settlements", "Indexed feedback", "Indexed validations passed"]) expect(html).toContain(label)
    expect(html).toContain("not independently verified"); expect(html).toContain("not proven payment-backed")
    expect(html).toContain("index block and freshness are not supplied")
    expect(html).toContain("Identity evidence unavailable"); expect(html).toContain("Validation count unavailable")
    expect(html).not.toMatch(/indexedBlock|verified seller ownership/i)
  })
  it.each([undefined, null, { ...graph, agentId: "PRIVATE_GRAPH" }, { ...graph, feedbackCount: -1 }, { hidden: "PRIVATE_GRAPH" }])(
    "drops absent/malformed optional evidence while preserving the listing", async value => {
      const input = raw(value); if (value === undefined) Reflect.deleteProperty(input, "graph")
      const data = await page(input), html = renderToStaticMarkup(<SkillPage data={data} />)
      expect(data.listing?.id).toBe("diff-triage"); expect(data.listing).not.toHaveProperty("graph")
      expect(html).not.toContain('aria-label="Indexed evidence"'); expect(html).not.toContain("PRIVATE_GRAPH")
    })
  it("renders indexed zero rather than inventing a missing or verified registry count", async () => {
    const data = await page(raw({ ...graph, settlementCount: 0, feedbackCount: 0, validationPassCount: 0 }))
    const html = renderToStaticMarkup(<SkillPage data={data} />)
    expect(data.listing).toHaveProperty("graph", { ...graph, settlementCount: 0, feedbackCount: 0, validationPassCount: 0 })
    expect(html).toContain('aria-label="Indexed evidence"'); expect(html).toContain("Validation count unavailable")
  })
  it("never invokes a raw graph getter or serializes extras at the second boundary", async () => {
    const value = decodeListing(raw(), "diff-triage"), getter = vi.fn(() => { throw Error("PRIVATE_GRAPH") })
    Object.defineProperty(value, "graph", { enumerable: true, get: getter })
    const data = await loadSkillPage({ name: "diff-triage" }, {
      describeSkill: vi.fn(async () => value), listingReceipts: vi.fn(async () => []),
      resolveName: vi.fn(async () => { throw Error("Unexpected name read") })
    }, () => 1)
    expect(data.listing?.id).toBe("diff-triage"); expect(data.listing).not.toHaveProperty("graph")
    expect(getter).not.toHaveBeenCalled()
  })
})
