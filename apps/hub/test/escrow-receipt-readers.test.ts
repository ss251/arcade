import { describe, expect, it } from "vitest"
import { Receipt, ReceiptChild, treeHashOf, Job, JobOutcome } from "@arcade/core"
import { receiptExplorer } from "../src/receipt-reference.ts"
import { publicReceipt } from "../src/receipts-feed.ts"
import { sellerSummary } from "../src/summary.ts"
import { buildTreeView } from "../src/tree-view.ts"
import { escrowReceiptView } from "../src/escrow-receipt-view.ts"
import { escrowResultDelivery } from "../src/escrow-result.ts"
import { row, hash, address, ROOT, CHILD, SELLER, BUYER, TX, REFUND } from "./fixtures/escrow-receipt.ts"
describe("explicit escrow receipt reader compatibility", () => {
  it("links confirmed completion with its own escrow evidence", () => {
    expect(receiptExplorer(row())).toBe(`https://testnet.arcscan.app/tx/${TX}`)
  })
  it("publishes confirmed refund separately from quoted price and settlement", () => {
    const pub = publicReceipt(row("refunded"))
    expect(pub).toMatchObject({ settled: false, priceAtomic: "120000", reason: "escrow refunded", explorer: null,
      escrow: { state: "refunded", escrowJobId: "7", refundTx: REFUND, refundAtomic: "120000" } })
    expect(pub).not.toHaveProperty("settleTx")
    expect(JSON.stringify(pub)).not.toContain(ROOT)
    expect(JSON.stringify(pub)).not.toContain(BUYER)
  })
  it("accounts only confirmed revenue and keeps uncertainty's final margin unknown", () => {
    expect(sellerSummary(SELLER, [], [row()], [], 1002000)).toMatchObject({ revenueAtomic: "120000", marginAtomic: "114000" })
    expect(sellerSummary(SELLER, [], [row("uncertain")], [], 1002000)).toMatchObject({ revenueAtomic: "0", marginAtomic: null })
  })
  it.each(["eip3009", "gateway", "test"] as const)("uses the actual %s child receipt for mixed-rail tree links", rail => {
    const childTx = rail === "gateway" ? "00000000-0000-4000-8000-000000000001" : rail === "test" ? "0xtest" + "a".repeat(16) : hash("a")
    const child = Receipt.make({ jobId: CHILD, skillId: "child-skill", skillVersion: "1.0.0", buyer: SELLER, seller: address("3"),
      priceAtomic: 10000n, sellerAtomic: 9500n, feeAtomic: 500n, feeBps: 500, rail, network: "eip155:5042002",
      settled: true, settleTx: childTx, reason: "ok", latencyMs: 100, createdAtMs: 1000000,
      rootJobId: ROOT, parentJobId: ROOT, hop: 1, ancestors: ["root-skill"], sellerCostUsd: 0 })
    const children = [ReceiptChild.make({ jobId: CHILD, skillId: child.skillId, priceAtomic: child.priceAtomic, settled: true, settleTx: child.settleTx })]
    const root = Receipt.make({ ...row(), children, treeHash: treeHashOf(ROOT, children), treeCommittedAtomic: 10000n })
    const view = buildTreeView(ROOT, [root, child])
    expect(view).toMatchObject({ complete: true, nodes: [{ explorer: `https://testnet.arcscan.app/tx/${TX}` },
      { explorer: rail === "eip3009" ? `https://testnet.arcscan.app/tx/${childTx}` : null }] })
    expect(sellerSummary(SELLER, [], [root, child], [], 1002000)).toMatchObject({ subSpendAtomic: "10000", marginAtomic: "104000" })
    expect(publicReceipt(root).children[0]?.explorer).toBeNull()
    expect(publicReceipt(root).children[0]).not.toHaveProperty("settleTx")
    // Compact, unhashed provenance additions cannot replace the actual receipt.
    Object.assign(children[0]!, { rail: "eip3009", network: "eip155:5042002", settleRefKind: "onchain" })
    expect(publicReceipt(root).children[0]?.explorer).toBeNull()
    expect(buildTreeView(ROOT, [root])?.complete).toBe(false)
    expect(sellerSummary(SELLER, [], [root], [], 1002000).subSpendAtomic).toBeNull()
    const foreign = Receipt.make({ ...child, network: "eip155:1" })
    expect(buildTreeView(ROOT, [root, foreign])?.complete).toBe(false)
    expect(sellerSummary(SELLER, [], [root, foreign], [], 1002000).subSpendAtomic).toBeNull()
  })
  it.each(["missing", "wrong rail", "wrong network", "wrong allocation", "wrong tx", "wrong kind", "fake refund", "child escrow", "session", "nonce"])("refuses %s metadata coherently across readers", mode => {
    const r = row(), changed = { ...r,
      ...(mode === "missing" ? { escrow: undefined } : mode === "wrong rail" ? { rail: "eip3009" } : mode === "wrong network" ? { network: "eip155:1" } :
        mode === "wrong allocation" ? { sellerAtomic: 113999n, feeAtomic: 6001n } : mode === "wrong tx" ? { settleTx: hash("a") } :
        mode === "wrong kind" ? { settleRefKind: "gateway-transfer" } : mode === "fake refund" ? { settled: false } :
        mode === "child escrow" ? { parentJobId: CHILD, hop: 1 } : mode === "session" ? { sessionId: "ses_" + "a".repeat(32) } : { authorizationNonce: hash("b") }) }
    expect(escrowReceiptView(changed)).toBeNull()
    expect(receiptExplorer(changed)).toBeNull()
    expect(publicReceipt(changed as Receipt)).toMatchObject({ settled: false, reason: "escrow evidence unavailable", explorer: null })
    expect(() => sellerSummary(SELLER, [], [changed as Receipt], [], 1002000)).toThrow("seller summary is unavailable")
    expect(buildTreeView(ROOT, [changed as Receipt])).toBeUndefined()
  })
  it("never invents movement, private correlation or a final margin for uncertainty", () => {
    const r = row("uncertain"), pub = publicReceipt(r)
    expect(pub.escrow).toEqual({ state: "uncertain", escrowJobId: "7", contract: address("6"), amountAtomic: "120000" })
    expect(pub.reason).toBe("escrow outcome uncertain; reconciliation required")
    for (const privateValue of [ROOT, BUYER, r.escrow!.requestHash]) expect(JSON.stringify(pub)).not.toContain(privateValue)
    expect(buildTreeView(ROOT, [r])).toMatchObject({ complete: true, nodes: [{ settled: false, explorer: null }] })
    expect(sellerSummary(SELLER, [], [row("refunded")], [], 1002000)).toMatchObject({ revenueAtomic: "0", marginAtomic: "0" })
  })
  it("does not execute escrow or outer evidence getters", () => {
    let reads = 0
    for (const key of ["escrow", "settled", "buyer", "rail"]) {
      const r = { ...row() }
      Object.defineProperty(r, key, { enumerable: true, get() { reads++; throw Error("owned private getter") } })
      expect(escrowReceiptView(r)).toBeNull(); expect(receiptExplorer(r)).toBeNull()
    }
    expect(reads).toBe(0)
  })
  it("refuses contradictory duplicate escrow evidence instead of selecting a winner", () => {
    const r = row(), changed = Receipt.make({ ...r, escrow: { ...r.escrow!, requestHash: hash("e") } })
    expect(() => sellerSummary(SELLER, [], [r, changed], [], 1002000)).toThrow("seller summary is unavailable")
  })
})

const completedJob = () => Job.make({ id: ROOT, skillId: "root-skill", buyer: BUYER, seller: SELLER, priceAtomic: 120000n,
  input: { z: 1, a: 2 }, status: "succeeded", createdAtMs: 1000000, rootJobId: ROOT, hop: 0, ancestors: [],
  outcome: JobOutcome.make({ status: "succeeded", output: { z: "owned result", a: { __bigint: "literal" } }, startedAtMs: 1000000, finishedAtMs: 1000001 }) })
describe("escrow result delivery", () => {
  it("returns an isolated ordered output only against coherent settled receipt/job", () => {
    const job = completedJob(), result = escrowResultDelivery(row(), job)
    expect(result).toEqual({ kind: "delivered", output: job.outcome!.output })
    if (result?.kind === "delivered") expect(Object.keys(result.output as object)).toEqual(["z", "a"])
    expect(escrowResultDelivery({ rail: "eip3009" }, undefined)).toBeUndefined()
  })
  it.each(["refunded", "uncertain"] as const)("never reads or releases private output on %s", state => {
    let reads = 0
    const result = escrowResultDelivery(row(state), { get outcome() { reads++; throw Error("PRIVATE_ERROR") } })
    expect(result?.kind).toBe("withheld"); expect(reads).toBe(0)
    expect(JSON.stringify(result)).not.toContain("not charged")
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
  })
  it.each(["missing", "foreign", "refusal", "getter", "partial", "oversized"])("refuses %s result without falling back to legacy", mode => {
    const job = completedJob()
    const changed = mode === "missing" ? undefined : mode === "foreign" ? { ...job, id: CHILD } : mode === "refusal" ?
      { ...job, outcome: { ...job.outcome!, stopReason: "refusal:fixture" } } : mode === "partial" ? { ...job, outcome: undefined } :
      mode === "oversized" ? { ...job, outcome: { ...job.outcome!, output: "x".repeat(1048577) } } :
      { ...job, get outcome() { throw Error("PRIVATE_GETTER") } }
    expect(escrowResultDelivery(row(), changed)).toEqual({ kind: "unavailable" })
  })
})
