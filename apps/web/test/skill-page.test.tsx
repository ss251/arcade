import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { Evidence, SchemaBlock } from "../src/components/evidence.tsx"
import { SkillPage } from "../src/components/skill-page.tsx"
import { decodeListing, decodeReceipts } from "../src/lib/hub-decode.ts"
import type { SkillPageData, SkillPageListing } from "../src/lib/skill-page-data.ts"
import { loadChainConfig } from "../../../packages/core/src/chain-config.ts"

const TX = `0x${"ab".repeat(32)}`, CHILD_TX = `0x${"cd".repeat(32)}`
const url = (tx: string) => `https://testnet.arcscan.app/tx/${tx}`
const observedAtMs = 14_400_000
const inputSchema = { type: "object", properties: { diff: { type: "string" } } }
const outputSchema = { type: "object", properties: { verdict: { type: "string" } } }
const bounds = { timeoutSec: 120, maxCostUsd: 0.05, maxSubSpendUsd: 0.2 }
const listing = (over: Partial<SkillPageListing> = {}): SkillPageListing => ({
  ...decodeListing({ id: "diff-triage", version: "0.1.0", serviceName: "Diff Triage",
    description: "Reviews a diff.", seller: `0x${"1".repeat(40)}`, price: "$0.12",
    inputSchema, outputSchema, bounds }, "diff-triage"), inputSchema, outputSchema, bounds, ...over
})
const row = (over: Record<string, unknown> = {}) => decodeReceipts([{
  skillId: "diff-triage", skillVersion: "0.1.0", seller: `0x${"1".repeat(40)}`,
  rail: "eip3009", network: "eip155:5042002", settleRefKind: "onchain",
  priceAtomic: "120000", sellerAtomic: "114000", feeAtomic: "6000", feeBps: 500,
  price: "$0.12", sellerShare: "$0.114", fee: "$0.006", settled: true, reason: "ok",
  latencyMs: 2471, createdAtMs: observedAtMs - 120_000, settleTx: TX, explorer: url(TX), hop: 0,
  children: [{ skillId: "counterparty-graph", priceAtomic: "50000", price: "$0.05", settled: true,
    settleTx: CHILD_TX, explorer: url(CHILD_TX) }], ...over
}])[0]!
const data = (over: Partial<SkillPageData> = {}): SkillPageData => ({
  listing: listing(), receipts: [], listingError: null, receiptsError: null,
  nameError: null, resolvedName: null, observedAtMs, ...over
})
const html = (over: Partial<SkillPageData> = {}) => renderToStaticMarkup(<SkillPage data={data(over)} />)
const evidenceListing = (over: Record<string, unknown> = {}) => {
  const config = loadChainConfig("arc-testnet")
  return decodeListing({ ...listing(), erc8004: { agentId: "42", chain: config.caip2,
    registry: config.erc8004!.identity, verified: true, stale: false, registrationTx: TX,
    validationPasses: 7, validationsRead: 9, settlementFeedback: 3, ...over } }, "diff-triage")
}

describe("H8 qualified listing evidence", () => {
  it("distinguishes unavailable identity and counters from verified zero", () => {
    const missing = renderToStaticMarkup(<Evidence listing={listing()} />)
    expect(missing).toContain("Identity evidence unavailable")
    expect(missing).toContain("Validation count unavailable")
    expect(missing).toContain("Feedback count unavailable")
    expect(missing).not.toContain("not registered")
    const zero = renderToStaticMarkup(<Evidence listing={evidenceListing({ agentId: "0",
      validationPasses: 0, validationsRead: 0, settlementFeedback: 0 })} />)
    expect(zero).toContain("agent #0")
    expect(zero).toContain("0 of 0")
    expect(zero).toContain("0 matching feedback records")
    expect(zero).toContain("Hub-verified seller ownership")
  })
  it("shows only real H4 fresh verified counts with their bounded D provenance", () => {
    const out = renderToStaticMarkup(<Evidence listing={evidenceListing()} />)
    expect(out).toContain("settlement evidence")
    expect(out).toContain("Hub-verified seller ownership")
    expect(out).toContain("7 of 9")
    expect(out).toContain("latest 20 unique validation requests")
    expect(out).toContain("response 100")
    expect(out).toContain("agent-wide")
    expect(out).toContain("4096")
    expect(out).toContain("not a tally of this skill")
    expect(out).toContain(TX)
    expect(out).toContain("Announced registration reference")
    expect(out).not.toContain("<a ")
    expect(out).not.toMatch(/score|rating|★|per finished job/i)
  })
  it("keeps real H4 stale or unverified counts unavailable", () => {
    for (const identity of [{ stale: true }, { verified: false }, { stale: true, verified: false }]) {
      const out = renderToStaticMarkup(<Evidence listing={evidenceListing(identity)} />)
      expect(out).toContain("Validation count unavailable")
      expect(out).toContain("Feedback count unavailable")
      expect(out).not.toContain("7 of 9")
      if (identity.stale) expect(out).toContain("Evidence is stale")
      if (identity.verified === false) expect(out).toContain("Announced identity; ownership unverified")
    }
  })
  it("refuses standalone mixed-provenance numeric props even when a caller bypasses H4", () => {
    const fresh = listing({ agentId: "42", agentVerified: true, evidenceStale: false,
      validationPasses: 7, validationsRead: 9, settlementFeedback: 3 })
    const { agentId: _agent, ...noAgent } = fresh
    for (const mixed of [{ ...fresh, evidenceStale: true }, { ...fresh, agentVerified: false },
      noAgent, { ...fresh, validationPasses: 10 }, { ...fresh, validationsRead: 21 }, { ...fresh, settlementFeedback: 4097 }]) {
      const out = renderToStaticMarkup(<Evidence listing={mixed} />)
      expect(out).toContain("Validation count unavailable")
      expect(out).toContain("Feedback count unavailable")
      expect(out).not.toContain("matching feedback records")
    }
  })
  it.each([true, false, undefined])("states only the hub's ENS expiry observation %s", expired => {
    const out = renderToStaticMarkup(<Evidence listing={listing({ ensName: "diff-triage.ss251.arcade.eth", ...(expired === undefined ? {} : { ensExpired: expired }) })} />)
    expect(out).toContain(expired === true ? "Hub reports name expired" : expired === false ? "Hub reports name not expired" : "Name expiry unavailable")
    expect(out).toContain("not a current runner-liveness proof")
    expect(out).not.toContain("runner stopped")
    expect(out).not.toContain("renews while")
  })
})

describe("H8 bounded schema inspection", () => {
  it("renders JSON as escaped text in keyboard-inspectable native details", () => {
    const out = renderToStaticMarkup(<SchemaBlock title="input" schema={{ type: "object", description: "<script>alert(1)</script>" }} />)
    expect(out).toContain("<details")
    expect(out).toContain("<summary>input</summary>")
    expect(out).toContain("&quot;type&quot;: &quot;object&quot;")
    expect(out).toContain("&lt;script&gt;")
    expect(out).not.toContain("<script>")
    expect(out).toContain('tabindex="0"')
  })
  it("does not execute getters or toJSON and returns a fixed refusal", () => {
    let calls = 0
    for (const schema of [Object.defineProperty({}, "x", { enumerable: true, get() { calls++; return "PRIVATE" } }),
      { toJSON() { calls++; return "PRIVATE" } }, Object.assign(Object.create({ x: "PRIVATE" }), { type: "object" })]) {
      const out = renderToStaticMarkup(<SchemaBlock title="input" schema={schema} />)
      expect(out).toContain("Schema unavailable for safe display")
      expect(out).not.toContain("PRIVATE")
    }
    expect(calls).toBe(0)
  })
  it.each(["huge value", "huge key", "nodes", "depth", "cycle", "proxy"]) ("bounds or refuses %s", kind => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
    let deep: unknown = null; for (let i = 0; i < 20; i++) deep = { child: deep }
    const cases: Record<string, unknown> = { "huge value": { x: "x".repeat(70_000) },
      "huge key": { ["x".repeat(70_000)]: 1 }, nodes: Array(9000).fill(null), depth: deep, cycle: cyclic,
      proxy: new Proxy({}, { ownKeys() { throw Error("PRIVATE_PROXY") } }) }
    const out = renderToStaticMarkup(<SchemaBlock title="input" schema={cases[kind]} />)
    expect(out).toContain("Schema unavailable for safe display")
    expect(out.length).toBeLessThan(1000)
    expect(out).not.toContain("PRIVATE_PROXY")
  })
  it.each([true, false, null])("preserves JSON scalar schema %s", schema => {
    expect(renderToStaticMarkup(<SchemaBlock title="input" schema={schema} />)).toContain(`<code>${JSON.stringify(schema)}</code>`)
  })
  it("refuses sparse arrays, symbols, undefined and non-finite JSON without coercing", () => {
    for (const schema of [Array(2), { [Symbol("hidden")]: 1 }, undefined, NaN, Infinity, 1n,
      Object.defineProperty({}, "hidden", { value: "PRIVATE", enumerable: false })]) {
      const out = renderToStaticMarkup(<SchemaBlock title="input" schema={schema} />)
      expect(out).toContain("Schema unavailable for safe display")
      expect(out).not.toContain("PRIVATE")
    }
  })
  it("bounds escaped UTF-8 output, not only source string length", () => {
    for (const schema of [{ x: "\u0001".repeat(12_000) }, { ["\u0001".repeat(12_000)]: 0 }, { x: "🧪".repeat(17_000) }]) {
      expect(renderToStaticMarkup(<SchemaBlock title="input" schema={schema} />)).toContain("Schema unavailable for safe display")
    }
  })
})

describe("H8 listing page and public receipt records", () => {
  it("uses the existing navigation and an ordinary qualified chat link, never a payment form", () => {
    const out = html()
    expect(out).toContain('class="wrap skill-page"')
    expect(out).toContain('aria-label="Sections"')
    expect(out).toContain('href="/chat"')
    expect(out).toContain("Open chat")
    expect(out).toContain("Availability and payment are checked separately")
    expect(out).toContain("$0.12")
    expect(out).toContain("per call")
    expect(out).toContain("Declared bounds")
    expect(out).not.toMatch(/<form|<input|<button|wallet key|payment-signature|x-job-token|\/market/)
  })
  it("does not render private/unknown listing fields, pay-test IDs or invented seller/pay-test links", () => {
    const l = { ...listing({ payTested: { jobId: "job_PRIVATE_SENTINEL0000", atMs: 0, ok: true, settleTx: TX },
      payTestHistory: [{ jobId: "job_PRIVATE_HISTORY0000", atMs: 0, ok: true, settleTx: TX },
        { jobId: "", atMs: 0, ok: false }] }), token: "PRIVATE_TOKEN", buyer: "PRIVATE_BUYER" }
    const out = html({ listing: l })
    expect(out).not.toMatch(/PRIVATE|job_|arcscan|href="\/listings/)
    expect(out).toContain("passed")
    expect(out).toContain("failed")
    expect(out).toContain("4h ago")
    expect(out).toContain(TX)
  })
  it("distinguishes unavailable from empty history and receipt observations", () => {
    const absent = html({ receipts: null, receiptsError: "receipts_unavailable" })
    expect(absent).toContain("Pay-test history unavailable")
    expect(absent).toContain("Recent records unavailable")
    expect(absent).toContain("Diff Triage")
    const empty = html({ listing: listing({ payTestHistory: [] }) })
    expect(empty).toContain("No recorded pay-test history returned")
    expect(empty).toContain("No recent records returned")
    expect(empty).not.toMatch(/never hired|has not had its turn|never pay-tested/i)
  })
  it("keeps receipt observations visible when detail is unavailable", () => {
    const out = html({ listing: null, listingError: "listing_unavailable", receipts: [row()] })
    expect(out).toContain("Listing unavailable")
    expect(out).toContain("Recent public records")
    expect(out).toContain("diff-triage")
    expect(out).not.toContain("No such listing")
    expect(out).not.toContain("Open chat")
  })
  it.each(["invalid_name", "name_expired", "name_unavailable", "name_mismatch"] as const)("does not offer a detail purchase shortcut after %s", nameError => {
    const out = html({ nameError, resolvedName: null })
    expect(out).not.toContain("Open chat")
    expect(out).not.toContain("undefined")
    expect(out).toContain('role="status"')
  })
  it.each([{ delisted: true }, { ensExpired: true }])("labels unavailable detail and suppresses its chat CTA", over => {
    const out = html({ listing: listing({ ensName: "diff-triage.ss251.arcade.eth", ...over }) })
    expect(out).toContain("<h1>Diff Triage</h1>")
    expect(out).not.toContain("Open chat")
    expect(out).toContain("informational")
  })
  it("uses only correlated resolved name as an additional observation, not an unverified title", () => {
    const out = html({ resolvedName: "diff-triage.ss251.arcade.eth" })
    expect(out).toContain("<h1>Diff Triage</h1>")
    expect(out).toContain("Resolved name")
    expect(out).toContain("diff-triage.ss251.arcade.eth")
  })
  it("escapes seller prose and never promotes an announced name to the title", () => {
    const out = html({ listing: listing({ description: "<script>PRIVATE_SCRIPT</script>",
      ensName: "announced-only.ss251.arcade.eth" }) })
    expect(out).toContain("&lt;script&gt;PRIVATE_SCRIPT&lt;/script&gt;")
    expect(out).not.toContain("<script>")
    expect(out).toContain("<h1>Diff Triage</h1>")
  })
  it("shows flat descendants without inventing nodes, ancestry, latency or authenticated trees", () => {
    const out = html({ receipts: [row()] })
    expect(out).toContain("Flat recorded descendants")
    expect(out).toContain("not direct parent-child edges")
    expect(out).toContain("counterparty-graph")
    expect(out).toContain(`href="${url(TX)}"`)
    expect(out).toContain(`href="${url(CHILD_TX)}"`)
    expect(out).not.toMatch(/<svg|tree-edge|parentNodeId|rootJobId|\/trees\/|0ms/)
  })
  it.each(["gateway", "test", "invalid-kind"])("keeps %s references unlinked through real H4 decoding", kind => {
    const r = row(kind === "invalid-kind" ? { settleRefKind: undefined } :
      { rail: kind, settleRefKind: kind === "gateway" ? "gateway-transfer" : "test" })
    const out = html({ receipts: [r] })
    expect(out).not.toContain("arcscan")
    expect(out).toContain("Settlement reference")
  })
  it("never reconstructs an explorer link withheld by H4, even for an eligible-looking hash", () => {
    const r = row({ explorer: null, children: [] })
    const out = html({ receipts: [r] })
    expect(out).toContain(TX)
    expect(out).not.toContain("arcscan")
  })
  it("states unresolved settlement without a zero-charge claim and preserves independent public markers", () => {
    const out = html({ receipts: [row({ settled: false, reason: "session_released", session: true, canary: true })] })
    expect(out).toContain("not recorded settled")
    expect(out).toContain("not a balance proof")
    expect(out).toContain("session")
    expect(out).toContain("canary")
    expect(out).not.toMatch(/\$0 charged|balance untouched|refunded/)
  })
  it("appends only scoped content-flow, wrapping, local scrolling and keyboard CSS", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const marker = "/* H8 skill-page:"
    expect(css).toContain(marker)
    const prefix = css.slice(0, css.indexOf(marker))
    expect(createHash("sha256").update(prefix).digest("hex")).toBe("503918fda8fa025914270aac9defcc1e8e57d838018c22eda92dd8d07770b1ad")
    const end = css.indexOf("/* Ordinary buyer recovery")
    expect(end).toBeGreaterThan(css.indexOf(marker))
    const scoped = css.slice(css.indexOf(marker), end)
    expect(scoped).toContain(".wrap.skill-page")
    expect(scoped).toContain("height: auto")
    expect(scoped).toContain("minmax(min(100%, 280px), 1fr)")
    expect(scoped).toContain("overflow-x: auto")
    expect(scoped).toContain(":focus-visible")
    expect(scoped).toContain("min-width: 0")
    expect(scoped).not.toMatch(/(?:^|\n)(?:\.tree|\.market|:root|body|\.dim)[\s.{]/)
  })
})
