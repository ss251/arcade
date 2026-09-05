import { describe, expect, it } from "vitest"
import { Receipt, ReceiptChild, treeHashOf } from "@arcade/core"
import { buildTreeView } from "../src/tree-view.ts"

const ROOT = "job_root000000000000", CHILD = "job_child00000000000", GRAND = "job_grand00000000000"
const OTHER = "job_other00000000000", BUYER = `0x${"9".repeat(40)}`
const tx = (digit: string) => `0x${digit.repeat(64)}`
const row = (jobId: string, skillId: string, hop: number, parentJobId?: string): Receipt => Receipt.make({
  jobId, skillId, skillVersion: "1.0.0", buyer: BUYER, seller: `0x${"8".repeat(40)}`,
  priceAtomic: 50_000n, sellerAtomic: 47_500n, feeAtomic: 2_500n, feeBps: 500,
  rail: "eip3009", network: "eip155:5042002", settled: true, reason: "ok", latencyMs: 100,
  createdAtMs: 1, rootJobId: ROOT, hop, ...(parentJobId === undefined ? {} : { parentJobId }),
  settleTx: tx(hop === 0 ? "a" : hop === 1 ? "b" : "c")
})
const fixture = (): Receipt[] => {
  const child = row(CHILD, "child-skill", 1, ROOT), grand = row(GRAND, "grand-skill", 2, CHILD)
  const children = [grand, child].map(r => ReceiptChild.make({ jobId: r.jobId, skillId: r.skillId,
    priceAtomic: r.priceAtomic, settled: r.settled, settleTx: r.settleTx }))
  const root = Receipt.make({ ...row(ROOT, "root-skill", 0), children, treeHash: treeHashOf(ROOT, children),
    treeCeilingAtomic: 200_000n, treeCommittedAtomic: 100_000n })
  return [root, child, grand]
}
const withRoot = (rows: Receipt[], patch: Partial<Receipt>): Receipt[] => [Receipt.make({ ...rows[0]!, ...patch }), ...rows.slice(1)]

describe("anonymized tree evidence, not flat-list hierarchy", () => {
  it("derives three levels from recorded lineage despite a reversed flat root commitment", () => {
    const rows = fixture(), view = buildTreeView(ROOT, rows)!
    expect(view.nodes.map(n => n.nodeId)).toEqual(["0", "0.0", "0.0.0"])
    expect(view.nodes.map(n => n.parentNodeId)).toEqual([null, "0", "0.0"])
    expect(view.nodes.map(n => n.skillId)).toEqual(["root-skill", "child-skill", "grand-skill"])
    expect(view.nodes.map(n => n.hop)).toEqual([0, 1, 2])
    expect(view).toMatchObject({ complete: true, evidenceFlags: [], treeHash: rows[0]!.treeHash,
      ceiling: "$0.20", committed: "$0.10" })
    expect(buildTreeView(ROOT, [rows[2]!, rows[0]!, rows[1]!])).toEqual(view)
  })
  it("emits only the authorized root identifier at top level and never copies private evidence fields", () => {
    const rows = fixture().map(r => Object.assign(Receipt.make({ ...r, reason: "PRIVATE_PROVIDER_ERROR",
      ancestors: ["PRIVATE_ANCESTRY"], receiptSignature: "PRIVATE_SIGNATURE", authorizationNonce: "PRIVATE_NONCE" }),
    { sessionId: "PRIVATE_SESSION", future: "PRIVATE_FUTURE" }))
    const view = buildTreeView(ROOT, rows)!
    expect(view.rootJobId).toBe(ROOT)
    const json = JSON.stringify(view.nodes)
    for (const secret of [ROOT, CHILD, GRAND, BUYER, "PRIVATE"]) expect(json).not.toContain(secret)
    expect(Object.keys(view.nodes[0]!).sort()).toEqual(["nodeId", "parentNodeId", "skillId", "hop", "priceAtomic",
      "price", "settled", "reason", "latencyMs", "settleTx", "explorer"].sort())
  })
  it("includes a failed released descendant from valid lineage without adding it to the settlement commitment", () => {
    const rows = fixture(), children = rows[0]!.children!.filter(c => c.jobId !== GRAND)
    rows[0] = Receipt.make({ ...rows[0]!, children, treeHash: treeHashOf(ROOT, children), treeCommittedAtomic: 50_000n })
    rows[2] = Receipt.make({ ...rows[2]!, settled: false, settleTx: undefined, reason: "job status is refused" })
    const view = buildTreeView(ROOT, rows)!
    expect(view.complete).toBe(true)
    expect(view.nodes[2]).toMatchObject({ settled: false, reason: "job status is refused", explorer: null, parentNodeId: "0.0" })
    expect(view.committed).toBe("$0.05")
  })
  it("marks a matching unsettled manifest member as an unresolved reservation, not a complete released failure", () => {
    const child = Receipt.make({ ...row(CHILD, "child-skill", 1, ROOT), settled: false,
      settleTx: undefined, reason: "job status is refused" })
    const children = [ReceiptChild.make({ jobId: CHILD, skillId: child.skillId,
      priceAtomic: child.priceAtomic, settled: false })]
    const root = Receipt.make({ ...row(ROOT, "root-skill", 0), children,
      treeHash: treeHashOf(ROOT, children), treeCommittedAtomic: 0n, treeCeilingAtomic: 200_000n })
    const view = buildTreeView(ROOT, [root, child])!
    expect(view.complete).toBe(false)
    expect(view.evidenceFlags).toContain("reservation-unresolved")
    expect(view.nodes).toHaveLength(2)
    expect(view.nodes[1]).toMatchObject({ settled: false, explorer: null })
    expect(view.committed).toBe("$0.00")
  })
  it("returns a complete single-node modern empty commitment, but marks legacy missing coverage unknown", () => {
    const modern = Receipt.make({ ...row(ROOT, "root-skill", 0), children: [], treeHash: treeHashOf(ROOT, []),
      treeCeilingAtomic: 0n, treeCommittedAtomic: 0n })
    expect(buildTreeView(ROOT, [modern])).toMatchObject({ complete: true, evidenceFlags: [], nodes: [{ nodeId: "0" }] })
    expect(buildTreeView(ROOT, [row(ROOT, "root-skill", 0)])).toMatchObject({ complete: false, evidenceFlags: ["commitment-missing"] })
  })
  it("never promotes a child or foreign-root record into an authorized root", () => {
    expect(buildTreeView(OTHER, fixture())).toBeUndefined()
    expect(buildTreeView(CHILD, fixture())).toBeUndefined()
    expect(buildTreeView(ROOT, withRoot(fixture(), { rootJobId: OTHER }))).toBeUndefined()
    expect(buildTreeView(ROOT, withRoot(fixture(), { parentJobId: OTHER }))).toBeUndefined()
    expect(buildTreeView("../../PRIVATE", fixture())).toBeUndefined()
  })
  it("does not invent a node when a committed descendant receipt is missing", () => {
    const view = buildTreeView(ROOT, fixture().slice(0, 2))!
    expect(view.nodes.map(n => n.skillId)).toEqual(["root-skill", "child-skill"])
    expect(view.complete).toBe(false)
    expect(view.evidenceFlags).toContain("receipt-missing")
  })
  it("withholds foreign-root descendants even when a commitment references the same job id", () => {
    const rows = fixture(); rows[2] = Receipt.make({ ...rows[2]!, rootJobId: OTHER })
    const view = buildTreeView(ROOT, rows)!
    expect(view.complete).toBe(false)
    expect(view.nodes.some(n => n.skillId === "grand-skill")).toBe(false)
    expect(JSON.stringify(view)).not.toContain(OTHER)
  })
  it("deduplicates identical rows but refuses conflicting roots and withholds conflicting descendants", () => {
    const rows = fixture()
    expect(buildTreeView(ROOT, [...rows, Receipt.make({ ...rows[1]! })])).toEqual(buildTreeView(ROOT, rows))
    expect(buildTreeView(ROOT, [...rows, Receipt.make({ ...rows[0]!, settled: false })])).toBeUndefined()
    const view = buildTreeView(ROOT, [...rows, Receipt.make({ ...rows[2]!, settled: false })])!
    expect(view.complete).toBe(false)
    expect(view.evidenceFlags).toContain("receipt-conflict")
    expect(view.nodes.some(n => n.skillId === "grand-skill")).toBe(false)
  })
  it.each(["orphan", "cycle", "wrong-hop"])("marks %s lineage incomplete without drawing fake edges", kind => {
    const rows = fixture()
    rows[2] = Receipt.make({ ...rows[2]!, parentJobId: kind === "orphan" ? OTHER : kind === "cycle" ? GRAND : CHILD,
      hop: kind === "wrong-hop" ? 1 : 2 })
    const view = buildTreeView(ROOT, rows)!
    expect(view.complete).toBe(false)
    expect(view.evidenceFlags).toContain("lineage-invalid")
    expect(view.nodes).toHaveLength(2)
  })
  it("withholds a contradictory hash/budget rather than publishing a valid-looking commitment", () => {
    for (const patch of [{ treeHash: tx("f") }, { treeCommittedAtomic: 1n }, { treeCeilingAtomic: 1n }]) {
      const view = buildTreeView(ROOT, withRoot(fixture(), patch))!
      expect(view.complete).toBe(false)
      expect(view.evidenceFlags).toContain("commitment-mismatch")
      expect(view).not.toHaveProperty("treeHash")
      expect(view.nodes).toHaveLength(1)
    }
  })
  it("does not accept settled money/tx/skill discrepancies with a committed child", () => {
    for (const patch of [{ settleTx: tx("d") }, { skillId: "different-skill" }, { priceAtomic: 2n, sellerAtomic: 2n, feeAtomic: 0n }]) {
      const rows = fixture(); rows[2] = Receipt.make({ ...rows[2]!, ...patch })
      const view = buildTreeView(ROOT, rows)!
      expect(view.complete).toBe(false)
      expect(view.evidenceFlags).toContain("commitment-mismatch")
      expect(view.nodes).toHaveLength(2)
    }
  })
  it("never treats a reserved missing receipt in the root ledger as a settled descendant", () => {
    const rows = fixture(), children = rows[0]!.children!.map(c => c.jobId === GRAND ? ReceiptChild.make({ ...c, settled: false, settleTx: undefined }) : c)
    rows[0] = Receipt.make({ ...rows[0]!, children, treeHash: treeHashOf(ROOT, children), treeCommittedAtomic: 50_000n })
    const view = buildTreeView(ROOT, rows.slice(0, 2))!
    expect(view.complete).toBe(false)
    expect(view.nodes).toHaveLength(2)
    expect(view.evidenceFlags).toContain("receipt-missing")
  })
  it("validates canonical skill ids, including a different job id or buyer smuggled into the root skill slot", () => {
    for (const skillId of [GRAND, BUYER, "PRIVATE\nDIAGNOSTIC"]) {
      const view = buildTreeView(ROOT, withRoot(fixture(), { skillId }))!
      expect(view.complete).toBe(false)
      expect(view.nodes[0]!.skillId).toBe("unknown-skill")
      expect(JSON.stringify(view.nodes)).not.toContain(skillId)
    }
  })
  it("uses exact bounded money and fixed safe reasons/explorers", () => {
    const rows = withRoot(fixture(), { priceAtomic: 9_007_199_254_740_993n, sellerAtomic: 9_007_199_254_740_993n, feeAtomic: 0n })
    const view = buildTreeView(ROOT, rows)!
    expect(view.nodes[0]).toMatchObject({ priceAtomic: "9007199254740993", price: "$9007199254.740993",
      explorer: `https://testnet.arcscan.app/tx/${tx("a")}` })
    for (const patch of [{ latencyMs: Number.NaN }, { latencyMs: -1 }, { priceAtomic: -1n },
      { priceAtomic: 1n << 256n }, { hop: -1 }, { feeBps: 10_001 }]) {
      expect(buildTreeView(ROOT, withRoot(fixture(), patch))).toBeUndefined()
    }
  })
  it("bounds scan, flat child count and depth without throwing or overflowing the stack", () => {
    const root = fixture()[0]!
    expect(buildTreeView(ROOT, Array.from({ length: 20_001 }, () => root))).toBeUndefined()
    const children = Array.from({ length: 257 }, () => root.children![0]!)
    const view = buildTreeView(ROOT, withRoot(fixture(), { children }))!
    expect(view.complete).toBe(false)
    expect(view.evidenceFlags).toContain("limit-exceeded")
    expect(view.nodes).toHaveLength(1)
    const rows = fixture(); rows[2] = Receipt.make({ ...rows[2]!, hop: 17 })
    expect(buildTreeView(ROOT, rows)!.complete).toBe(false)
  })
  it("does not invoke malformed accessors or mutate source receipts", () => {
    const rows = fixture(), before = rows.map(r => ({ ...r })); let reads = 0
    const corrupted = Object.defineProperty({ ...rows[2]! }, "priceAtomic", { get() { reads++; return 50_000n } }) as Receipt
    const view = buildTreeView(ROOT, [...rows.slice(0, 2), corrupted])!
    expect(reads).toBe(0)
    expect(view.complete).toBe(false)
    expect(view.evidenceFlags).toContain("evidence-malformed")
    expect(rows).toEqual(before)
  })
  it("never coerces an unknown rail or unrelated job-id object into a string", () => {
    let calls = 0
    const dangerous = { toString() { calls++; return "eip3009" } }
    const invalidRoot = { ...fixture()[0]!, rail: dangerous } as unknown as Receipt
    expect(buildTreeView(ROOT, [invalidRoot])).toBeUndefined()
    const unrelated = { jobId: dangerous } as unknown as Receipt
    expect(buildTreeView(ROOT, [...fixture(), unrelated])!.complete).toBe(true)
    expect(calls).toBe(0)
  })
})
