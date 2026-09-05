import { describe, expect, it, vi } from "vitest"
import { Bounds, PublicListing, Receipt, ReceiptChild, treeHashOf } from "@arcade/core"
import type { ListingRecord, RunnerRecord } from "../src/store.ts"
import { SellerSummaryUnavailable, sellerSummary, usdToAtomic } from "../src/summary.ts"

const SELLER = "0xcf821769ED3c0E55e152745377bb833d7155A78a"
const OTHER = `0x${"12".repeat(20)}`
const BUYER = `0x${"34".repeat(20)}`
const TX = `0x${"ab".repeat(32)}`
const NOW = 1_700_000_100_000
const listing = (id = "diff-triage", over: Partial<ListingRecord> = {}): ListingRecord => ({
  listing: PublicListing.make({ id, serviceName: "Diff Triage", version: "0.1.0", price: "$0.12",
    description: "Public service", tags: [], bounds: Bounds.make({ timeoutSec: 60 }), inputSchema: {}, outputSchema: {} }),
  seller: SELLER, runnerId: "runner-1", publishedAtMs: NOW - 1_000, ...over
})
const receipt = (over: Partial<Receipt> = {}): Receipt => Receipt.make({
  jobId: "job-root", skillId: "diff-triage", skillVersion: "0.1.0", buyer: BUYER, seller: SELLER,
  priceAtomic: 120_000n, sellerAtomic: 114_000n, feeAtomic: 6_000n, feeBps: 500,
  rail: "eip3009", network: "eip155:5042002", latencyMs: 2_000, settled: true,
  reason: "PRIVATE provider diagnostic", createdAtMs: NOW - 100, settleTx: TX, sellerCostUsd: 0,
  rootJobId: "job-root", hop: 0, ancestors: [], children: [], treeCommittedAtomic: 0n, ...over
})
const runner = (over: Partial<RunnerRecord> = {}): RunnerRecord => ({
  runnerId: "runner-1", seller: SELLER, skillIds: ["diff-triage"], maxConcurrency: 2,
  connectedAtMs: NOW - 2_000, lastSeenMs: NOW, activeJobs: 0, ...over
})
const summary = (receipts: readonly Receipt[], listings: readonly ListingRecord[] = [listing()], runners: readonly RunnerRecord[] = []) =>
  sellerSummary(SELLER, listings, receipts, runners, NOW)
const child = (over: Partial<Receipt> = {}): Receipt => {
  const { children: _children, treeCommittedAtomic: _committed, ...base } = receipt()
  return Receipt.make({ ...base, jobId: "job-child", skillId: "child-skill", seller: OTHER, buyer: SELLER,
    parentJobId: "job-root", hop: 1, ancestors: ["diff-triage"], priceAtomic: 50_000n,
    sellerAtomic: 47_500n, feeAtomic: 2_500n, ...over })
}
const withTree = (root: Receipt, descendants: readonly Receipt[]): Receipt => Receipt.make({ ...root,
  children: descendants.map(r => ReceiptChild.make({ jobId: r.jobId, skillId: r.skillId,
    priceAtomic: r.priceAtomic, settled: r.settled, ...(r.settleTx === undefined ? {} : { settleTx: r.settleTx }) })),
  treeCommittedAtomic: descendants.filter(r => r.settled).reduce((sum, r) => sum + r.priceAtomic, 0n)
})

describe("usdToAtomic", () => {
  it("rounds reported finite USD at the six-decimal boundary", () => {
    expect(usdToAtomic(0.02)).toBe(20_000n)
    expect(usdToAtomic(0.30000000000000004)).toBe(300_000n)
    expect(usdToAtomic(0.0000005)).toBe(1n)
    expect(usdToAtomic(0)).toBe(0n)
  })
  it.each([-1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, 1e100])("refuses unsafe costs %s", value => {
    expect(() => usdToAtomic(value)).toThrow(SellerSummaryUnavailable)
  })
})

describe("sellerSummary", () => {
  it("uses settled receipts for income and all attempted jobs for known inference cost", () => {
    const failed = receipt({ jobId: "job-failed", rootJobId: "job-failed", settled: false, sellerCostUsd: 0.01 })
    const s = summary([receipt({ sellerCostUsd: 0.02 }), failed])
    expect(s).toMatchObject({ calls: 2, settled: 1, revenue: "$0.12", fees: "$0.006", net: "$0.114",
      inferenceCost: "$0.03", margin: "$0.084", inferenceCostComplete: true, subSpendComplete: true })
    expect(s.listings[0]?.marginPerCall).toBe("$0.084")
  })
  it("never treats absent cost as free and still reports the known subtotal", () => {
    const { sellerCostUsd: _cost, ...unknown } = receipt()
    const s = summary([Receipt.make(unknown), receipt({ jobId: "job-fail", rootJobId: "job-fail", settled: false, sellerCostUsd: 0.01 })])
    expect(s).toMatchObject({ inferenceCost: null, inferenceCostAtomic: null, knownInferenceCostAtomic: "10000",
      inferenceCostComplete: false, margin: null, marginAtomic: null })
    expect(s.listings[0]?.marginPerCallAtomic).toBeNull()
  })
  it("reports real negative margin without clamping", () => {
    expect(summary([receipt({ sellerCostUsd: 0.5 })]).margin).toBe("-$0.386")
  })
  it("has exact zero totals for an empty ledger but no average for zero settled calls", () => {
    expect(summary([])).toMatchObject({ calls: 0, settled: 0, revenue: "$0.00", inferenceCost: "$0.00", subSpend: "$0.00", margin: "$0.00" })
    expect(summary([]).listings[0]?.marginPerCall).toBeNull()
  })
  it("deduplicates identical jobs and rejects contradictory relevant duplicates without diagnostics", () => {
    const r = receipt()
    expect(summary([r, Receipt.make({ ...r })]).calls).toBe(1)
    expect(() => summary([r, receipt({ sellerCostUsd: 0.4 })])).toThrow("seller summary is unavailable")
    expect(() => summary([r, receipt({ seller: OTHER })])).toThrow(SellerSummaryUnavailable)
  })
  it("isolates canonical seller addresses and retains historical earnings after ownership changes", () => {
    const s = sellerSummary(SELLER.toLowerCase(), [listing("diff-triage", { seller: OTHER })],
      [receipt(), receipt({ jobId: "foreign", seller: OTHER })], [], NOW)
    expect(s).toMatchObject({ seller: SELLER.toLowerCase(), calls: 1, settled: 1, revenueAtomic: "120000", listings: [] })
    expect(() => sellerSummary("0xseller", [], [], [], NOW)).toThrow(SellerSummaryUnavailable)
  })
  it("subtracts only direct seller-funded hires, not the flat grandchild total", () => {
    const c = child()
    const grandchild = child({ jobId: "job-grandchild", parentJobId: c.jobId, seller: BUYER, buyer: OTHER,
      skillId: "grandchild-skill", hop: 2, ancestors: ["diff-triage", "child-skill"],
      priceAtomic: 10_000n, sellerAtomic: 9_500n, feeAtomic: 500n })
    const s = summary([withTree(receipt({ sellerCostUsd: 0.02 }), [c, grandchild]), c, grandchild])
    expect(s).toMatchObject({ subSpendAtomic: "50000", margin: "$0.044", subSpendComplete: true })
    const middle = sellerSummary(OTHER, [listing("child-skill", { seller: OTHER })],
      [withTree(receipt(), [c, grandchild]), c, grandchild], [], NOW)
    expect(middle).toMatchObject({ subSpendAtomic: "10000", marginAtomic: "37500" })
  })
  it("does not infer sponsorship or seller control for a different direct funding wallet", () => {
    // Actual A9 uses this dedicated subbuy wallet, distinct from the payout seller.
    const subbuy = "0xd3Ad4D10D4d24bD57740A5430ED5Fd28c6824634"
    for (const buyer of [subbuy, BUYER]) {
      const c = child({ buyer })
      expect(summary([withTree(receipt(), [c]), c])).toMatchObject({
        subSpendAtomic: null, knownSubSpendAtomic: "0", subSpendComplete: false, marginAtomic: null
      })
    }
  })
  it("deduplicates a direct edge when this seller also serves another descendant", () => {
    const c = child({ seller: SELLER })
    const g = child({ jobId: "job-grand", parentJobId: c.jobId, skillId: "grand-skill", buyer: SELLER,
      hop: 2, ancestors: ["diff-triage", "child-skill"], priceAtomic: 10_000n, sellerAtomic: 9_500n, feeAtomic: 500n })
    expect(summary([withTree(receipt(), [c, g]), c, g, g]).subSpendAtomic).toBe("60000")
  })
  it("includes settled hires even if their parent failed", () => {
    const c = child()
    expect(summary([withTree(receipt({ settled: false, sellerCostUsd: 0.02 }), [c]), c]))
      .toMatchObject({ revenueAtomic: "0", subSpendAtomic: "50000", marginAtomic: "-70000" })
  })
  it("does not claim complete zero spending for an unresolved manifest child", () => {
    const c = child({ settled: false })
    expect(summary([withTree(receipt(), [c]), c])).toMatchObject({
      knownSubSpendAtomic: "0", subSpendAtomic: null, subSpendComplete: false, marginAtomic: null
    })
  })
  it("retains exact zero for a released failed child omitted from the root manifest", () => {
    const c = child({ settled: false })
    expect(summary([receipt(), c])).toMatchObject({
      subSpendAtomic: "0", subSpendComplete: true, marginAtomic: "114000"
    })
  })
  it("marks spend unknown without full lineage context rather than using flat descriptors", () => {
    const c = child()
    expect(summary([withTree(receipt(), [c])])).toMatchObject({ subSpend: null, margin: null, subSpendComplete: false })
    const { children: _children, rootJobId: _root, hop: _hop, ancestors: _anc, treeCommittedAtomic: _committed, ...legacy } = receipt()
    expect(summary([Receipt.make(legacy)]).subSpend).toBeNull()
  })
  it("retains a known direct subtotal but refuses completeness for a missing descendant", () => {
    const c = child()
    const missing = child({ jobId: "missing", parentJobId: c.jobId, skillId: "missing-skill", buyer: OTHER,
      hop: 2, ancestors: ["diff-triage", "child-skill"] })
    expect(summary([withTree(receipt(), [c, missing]), c]))
      .toMatchObject({ subSpendAtomic: null, knownSubSpendAtomic: "50000", marginAtomic: null })
  })
  it("refuses completeness for contradictory lineage or omitted settled descendants", () => {
    const c = child({ ancestors: ["unrelated"] })
    expect(summary([withTree(receipt(), [c]), c]).subSpend).toBeNull()
    expect(summary([receipt(), child()]).subSpend).toBeNull()
  })
  it("requires exact runner identity, seller, served skill, publication and nonfuture heartbeat", () => {
    for (const r of [runner({ runnerId: "another" }), runner({ seller: OTHER }), runner({ skillIds: [] }),
      runner({ lastSeenMs: NOW + 1 }), runner({ lastSeenMs: NOW - 30_001 }), runner({ connectedAtMs: NOW + 1 })]) {
      expect(summary([], [listing()], [r]).listings[0]?.live).toBe(false)
    }
    expect(summary([], [listing()], [runner({ lastSeenMs: NOW - 30_000, connectedAtMs: NOW - 40_000 })]).listings[0]?.live).toBe(true)
    expect(summary([], [listing("diff-triage", { publishedAtMs: NOW + 1 })], [runner()]).listings[0]?.live).toBe(false)
    expect(summary([], [listing("diff-triage", { delisted: true })], [runner()]).listings[0]?.live).toBe(false)
  })
  it("copies only actual public provenance fields, not private job details or invented counts", () => {
    const l = listing("diff-triage", { payTested: { atMs: NOW - 20, ok: true, jobId: "PRIVATE-paytest", settleTx: TX },
      ensName: "diff-triage.seller.arcade.eth", agentId: "42", registrationTx: TX, agentVerified: true })
    const s = summary([receipt()], [l], [runner()])
    expect(s.listings[0]).toMatchObject({ payTestOk: true, payTestTx: TX, ensName: l.ensName, agentId: "42", agentVerified: true, live: true })
    const wire = JSON.stringify(s)
    for (const secret of ["PRIVATE", "job-root", "runner-1", BUYER, "validationPassCount", "ensExpired"]) expect(wire).not.toContain(secret)
  })
  it("does not mutate inputs or execute private getters", () => {
    const r = receipt(), getter = vi.fn(() => { throw new Error("PRIVATE") })
    Object.defineProperty(r, "unusedPrivate", { get: getter })
    Object.freeze(r)
    expect(summary([r]).calls).toBe(1)
    expect(getter).not.toHaveBeenCalled()
  })
  it("refuses malformed financial input and bounded work with fixed errors", () => {
    expect(() => summary([receipt({ feeAtomic: 1n })])).toThrow(SellerSummaryUnavailable)
    expect(() => summary([receipt({ sellerCostUsd: NaN })])).toThrow(SellerSummaryUnavailable)
    expect(() => summary(Array.from({ length: 10_001 }, () => receipt()))).toThrow(SellerSummaryUnavailable)
  })
  it("does not mix incompatible networks into Arc USDC accounting", () => {
    expect(() => summary([receipt({ network: "eip155:1" })])).toThrow(SellerSummaryUnavailable)
  })
  it("does not mark an ambiguous runner identity live", () => {
    expect(summary([], [listing()], [runner(), runner({ seller: OTHER })]).listings[0]?.live).toBe(false)
  })
  it("rejects contradictory listing ownership for the same publication id", () => {
    expect(() => summary([], [listing(), listing("diff-triage", { seller: OTHER })])).toThrow(SellerSummaryUnavailable)
  })
  it("deduplicates the same receipt with an order-independent descendant commitment", () => {
    const a = child(), b = child({ jobId: "job-second", skillId: "second-skill" })
    const first = withTree(receipt(), [a, b]), second = withTree(receipt(), [b, a])
    expect(summary([first, second, a, b])).toMatchObject({ calls: 1, subSpendAtomic: "100000" })
  })
  it("snapshots array data without invoking caller iterators", () => {
    const rows = [receipt()], iterator = vi.fn(() => { throw new Error("PRIVATE") })
    Object.defineProperty(rows, Symbol.iterator, { value: iterator })
    expect(summary(rows).calls).toBe(1)
    expect(iterator).not.toHaveBeenCalled()
  })
  it("never serializes an invalid runner timestamp object", () => {
    const r = runner(), toJSON = vi.fn(() => NOW)
    Object.defineProperty(r, "lastSeenMs", { value: { toJSON } })
    expect(summary([], [listing()], [r]).listings[0]?.live).toBe(false)
    expect(toJSON).not.toHaveBeenCalled()
  })
  it.each([
    ["test", "0xtest01234567890000"],
    ["gateway", "00112233-4455-6677-8899-aabbccddeeff"]
  ] as const)("accepts actual %s rail references as local ledger locators only", (rail, settleTx) => {
    const c = child({ rail, settleTx }), root = withTree(receipt({ rail, settleTx }), [c])
    const committed = Receipt.make({ ...root, treeHash: treeHashOf(root.jobId, root.children!) })
    expect(summary([committed, c])).toMatchObject({ calls: 1, subSpendAtomic: "50000", marginAtomic: "64000" })
    expect(JSON.stringify(summary([committed, c]))).not.toContain(settleTx)
  })
  it("rejects unsupported rail names before trusting even a hash-shaped locator", () => {
    const r = receipt()
    Object.defineProperty(r, "rail", { value: "unreviewed-rail" })
    expect(() => summary([r])).toThrow(SellerSummaryUnavailable)
  })
  it.each(["0xshort", `0x${"0".repeat(64)}`, "https://provider.example/private", "0xtest01234567890000"])(
    "refuses malformed or wrong-rail EIP3009 references", settleTx => {
      expect(() => summary([receipt({ settleTx })])).toThrow(SellerSummaryUnavailable)
    }
  )
  it("does not accept a child descriptor under an incompatible root rail", () => {
    const c = child({ rail: "gateway", settleTx: "00112233-4455-6677-8899-aabbccddeeff" })
    expect(() => summary([withTree(receipt(), [c]), c])).toThrow(SellerSummaryUnavailable)
  })
  it("does not attribute a hash-shaped child locator from a different rail", () => {
    const c = child({ rail: "gateway", settleTx: TX })
    const root = withTree(receipt({ rail: "eip3009" }), [c])
    expect(summary([root, c])).toMatchObject({
      knownSubSpendAtomic: "0", subSpendAtomic: null, subSpendComplete: false, marginAtomic: null
    })
  })
  it("validates supplied root commitments against exact flat child bytes", () => {
    const c = child(), root = withTree(receipt(), [c])
    const good = Receipt.make({ ...root, treeHash: treeHashOf(root.jobId, root.children!) })
    expect(summary([good, c]).subSpendComplete).toBe(true)
    for (const treeHash of [TX, "malformed", `0x${"0".repeat(64)}`]) {
      expect(summary([Receipt.make({ ...root, treeHash }), c])).toMatchObject({ subSpendComplete: false, subSpendAtomic: null, marginAtomic: null })
    }
    const uppercase = child({ settleTx: TX.toUpperCase().replace("0X", "0x") })
    const uppercaseRoot = withTree(receipt(), [uppercase])
    expect(summary([Receipt.make({ ...uppercaseRoot, treeHash: treeHashOf(uppercaseRoot.jobId, uppercaseRoot.children!) }), uppercase]).subSpendComplete).toBe(true)
  })
  it("labels no missing-hash blockchain proof: full matching local lineage still accounts exactly", () => {
    const c = child(), root = withTree(receipt(), [c])
    expect(root.treeHash).toBeUndefined()
    expect(summary([root, c])).toMatchObject({ subSpendAtomic: "50000", subSpendComplete: true })
    expect(JSON.stringify(summary([root, c]))).not.toContain("treeHash")
  })
})
