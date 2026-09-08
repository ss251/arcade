import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { Receipt, ReceiptChild } from "@arcade/core"
import * as feed from "../src/receipts-feed.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { listingReceiptFeed, publicStats, receiptLimit } from "../src/public-feeds.ts"

const tx = `0x${"a".repeat(64)}`
const childTx = `0x${"b".repeat(64)}`
const receipt = (over: Partial<Receipt> = {}): Receipt => Receipt.make({
  jobId: "job_PRIVATE_ROOT", skillId: "public-skill", skillVersion: "1.0.0",
  buyer: "PRIVATE_BUYER", seller: `0x${"1".repeat(40)}`,
  priceAtomic: 120_000n, sellerAtomic: 114_000n, feeAtomic: 6_000n, feeBps: 500,
  rail: "eip3009", network: "eip155:5042002", settled: true, reason: "ok",
  latencyMs: 42, createdAtMs: 1700000000000, settleTx: tx,
  rootJobId: "job_PRIVATE_ROOT", parentJobId: "job_PRIVATE_PARENT", ancestors: ["PRIVATE_ANCESTOR"],
  authorizationNonce: "PRIVATE_NONCE", receiptSignature: "PRIVATE_SIGNATURE", feeAccrualId: "PRIVATE_ACCRUAL",
  hop: 0, treeHash: `0x${"c".repeat(64)}`, treeCeilingAtomic: 50_000n, treeCommittedAtomic: 10_000n,
  children: [ReceiptChild.make({ jobId: "job_PRIVATE_CHILD", skillId: "public-child", priceAtomic: 10_000n,
    settled: true, settleTx: childTx })], ...over
})

describe("pure public feed aggregation", () => {
  it("returns zeroed hub provenance without fabricating a subgraph observation", () => {
    expect(publicStats([], [])).toEqual({ listings: 0, sellers: 0, calls: 0, settled: 0,
      volume: "$0.00", volumeAtomic: "0", fees: "$0.00", feesAtomic: "0", trees: 0, source: "hub" })
  })
  it("refuses non-hub provenance until an actual indexed aggregation exists", () => {
    expect(publicStats([], [], "subgraph")).toBeUndefined()
  })
  it("uses settled rows only, exact sums, casefolded sellers and distinct settled tree roots", () => {
    const first = receipt({ priceAtomic: 9_007_199_254_740_993n })
    const failed = receipt({ settled: false, jobId: "failed", priceAtomic: 1_000_000n, feeAtomic: 10_000n })
    const second = receipt({ jobId: "job_second", priceAtomic: first.priceAtomic, children: undefined })
    expect(publicStats([{ seller: "0xAb" }, { seller: "0xaB" }, { seller: "0xcd" }], [first, second, failed]))
      .toEqual({ listings: 3, sellers: 2, calls: 3, settled: 2, volume: "$18014398509.481986",
        volumeAtomic: "18014398509481986", fees: "$0.012", feesAtomic: "12000", trees: 1, source: "hub" })
  })
  it("sorts a filtered copy newest-first without mutating store receipt order", () => {
    const old = receipt({ createdAtMs: 1 }), fresh = receipt({ createdAtMs: 10 }), tied = receipt({ createdAtMs: 10, priceAtomic: 2n })
    const rows = [old, fresh, receipt({ skillId: "other", createdAtMs: 100 }), tied]
    const before = [...rows]
    expect(listingReceiptFeed(rows, "public-skill", 2)).toEqual([feed.publicReceipt(fresh), feed.publicReceipt(tied)])
    expect(rows).toEqual(before)
    expect(listingReceiptFeed(rows, "missing", 20)).toEqual([])
  })
  it("keeps the plan's display-limit clamp/default and rejects ambiguous duplicate parameters", () => {
    for (const [query, expected] of [["", 20], ["limit=0", 1], ["limit=-1", 1], ["limit=2.9", 2],
      ["limit=1000", 100], ["limit=NaN", 20], ["limit=Infinity", 20], ["limit=", 1], ["limit=1&limit=2", null]] as const) {
      expect(receiptLimit(new URLSearchParams(query))).toBe(expected)
    }
  })
})

describe("shared public receipt boundary", () => {
  it("whitelists known public fields and strips nested capabilities, future fields and private diagnostics", () => {
    const row = feed.publicReceipt(Object.assign(receipt({ reason: "PRIVATE_PROVIDER_ERROR" }), {
      sessionId: "PRIVATE_SESSION", token: "PRIVATE_TOKEN", input: { secret: "PRIVATE_INPUT" },
      unknownFutureField: "PRIVATE_FUTURE"
    }))
    expect(JSON.stringify(row)).not.toContain("PRIVATE")
    expect(row.reason).toBe("settled")
    expect(Object.keys(row).sort()).toEqual(["skillId", "skillVersion", "seller", "rail", "network",
      "priceAtomic", "sellerAtomic", "feeAtomic", "feeBps", "price", "sellerShare", "fee", "settled",
      "reason", "latencyMs", "createdAtMs", "settleTx", "explorer", "session", "hop", "treeHash", "children",
      "treeCeilingAtomic", "treeCommittedAtomic"].sort())
    expect(Object.keys(row.children![0]!).sort()).toEqual(["skillId", "priceAtomic", "price", "settled", "settleTx", "explorer"].sort())
  })
  it("exposes the exact shared scrub export without booting the server", () => {
    expect(feed).toHaveProperty("scrubReceipt", feed.publicReceipt)
  })
  it("preserves exact bigint money including values above the safe-number boundary", () => {
    const row = feed.publicReceipt(receipt({ priceAtomic: 9_007_199_254_740_993n }))
    expect(row.priceAtomic).toBe("9007199254740993")
    expect(row.price).toBe("$9007199254.740993")
    expect(row.sellerShare).toBe("$0.114")
    expect(row.fee).toBe("$0.006")
    expect(row.children![0]).toMatchObject({ price: "$0.01", priceAtomic: "10000" })
  })
  it("always exposes flat descendants with no call identifiers or inferred edges", () => {
    const row = feed.publicReceipt(receipt({ children: undefined, hop: undefined }))
    expect(row.children).toEqual([])
    expect(row).toHaveProperty("hop", 0)
    expect(row).not.toHaveProperty("ancestors")
  })
  it("does not leak the pipeline's unresolved-child job-id fallback as a skill id", () => {
    const row = feed.publicReceipt(receipt({ children: [ReceiptChild.make({ jobId: "job_PRIVATE_CHILD",
      skillId: "job_PRIVATE_CHILD", priceAtomic: 1n, settled: false })] }))
    expect(JSON.stringify(row)).not.toContain("job_PRIVATE_CHILD")
    expect(row.children![0]!.skillId).toBe("unknown-skill")
  })
  it("preserves public pay-test marker and safe optional accounting without private fee correlation", () => {
    const row = feed.publicReceipt(receipt({ canary: true, sellerCostUsd: 0.02, feeSweepTx: childTx }))
    expect(row).toMatchObject({ canary: true, sellerCostUsd: 0.02, feeSweepTx: childTx,
      treeCeilingAtomic: "50000", treeCommittedAtomic: "10000" })
    expect(row).not.toHaveProperty("feeAccrualId")
    expect(feed.publicReceipt(receipt())).not.toHaveProperty("canary")
  })
  it.each(["PRIVATE_DIAGNOSTIC", "job status is PRIVATE", "engine refused (stop_reason=PRIVATE)"])(
    "does not publish unknown refusal text: %s", reason => {
      const row = feed.publicReceipt(receipt({ reason, settled: false }))
      expect(row.reason).toBe("not settled")
      expect(JSON.stringify(row)).not.toContain("PRIVATE")
    })
  it("publishes an unconfirmed settlement as its own verdict, and never its free-form reason", () => {
    // The private reason carries a transaction hash, so it is free-form by construction and
    // must not escape the allowlist. But collapsing it to "not settled" would republish the
    // one claim the hub cannot make about that receipt.
    const tx = `0x${"ab".repeat(32)}`
    const row = feed.publicReceipt(receipt({
      settled: false,
      reason: `settlement unconfirmed (SettlementFailed): transaction ${tx} was broadcast`,
      unresolvedSettleTx: tx
    }))
    expect(row.reason).toBe("settlement unconfirmed")
    expect(JSON.stringify(row)).not.toContain(tx)
    expect(JSON.stringify(row)).not.toContain("unresolvedSettleTx")
  })
  it("keeps only fixed canonical verdicts", () => {
    for (const reason of ["ok", "refused", "session_released", "job status is failed", "job status is runner_lost", "job status is invalid",
      "job status is timeout", "job status is bounds_exceeded", "job status is rejected",
      "engine refused (stop_reason=content_filter)", "engine refused (stop_reason=reasoning_extraction)",
      "output is empty", "output failed the listing's outputSchema"]) {
      expect(feed.publicReceipt(receipt({ reason })).reason).toBe(reason)
    }
  })
  it("keeps the actual offline test-rail reference without turning it into a transaction link", () => {
    const ref = "0xtest01234567890001"
    expect(feed.publicReceipt(receipt({ rail: "test", settleTx: ref }))).toMatchObject({ settleTx: ref, explorer: null })
    expect(feed.publicReceipt(receipt({ rail: "eip3009", settleTx: ref }))).not.toHaveProperty("settleTx")
  })
  it("preserves a bounded Gateway transaction UUID as an unlinked reference", () => {
    const ref = "12345678-1234-1234-1234-123456789abc"
    expect(feed.publicReceipt(receipt({ rail: "gateway", settleTx: ref }))).toMatchObject({ settleTx: ref, explorer: null })
  })
  it("links genuine-shaped settled eip3009 references using the receipt's network", () => {
    const row = feed.publicReceipt(receipt())
    expect(row.explorer).toBe(`https://testnet.arcscan.app/tx/${tx}`)
    expect(row.children![0]!.explorer).toBe(`https://testnet.arcscan.app/tx/${childTx}`)
  })
  it.each([
    { settleTx: "0xmalformed" }, { settleTx: `0x${"0".repeat(64)}` }, { settled: false },
    { network: "eip155:1" }, { network: "eip155:0" }, { rail: "test" as const }, { rail: "gateway" as const }
  ])("does not invent explorer proof for %j", over => {
    const row = feed.publicReceipt(receipt(over))
    expect(row.explorer).toBeNull()
    if (over.network || over.rail) expect(row.children![0]!.explorer).toBeNull()
  })
  it("never passes malformed transaction/reference text through a public string field", () => {
    const row = feed.publicReceipt(receipt({ settleTx: "PRIVATE_TX_ERROR", feeSweepTx: "PRIVATE_FEE_ERROR", treeHash: "PRIVATE_TREE" }))
    expect(JSON.stringify(row)).not.toContain("PRIVATE")
  })
  it("marks memory statistics as hub-derived", async () => {
    const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
    expect(store).toHaveProperty("statsSource")
    expect(await Effect.runPromise(store.statsSource)).toBe("hub")
  })
  it("replaces the same job's receipt in memory without duplicating money or feed entries", async () => {
    const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
    const before = receipt(), updated = receipt({ feeSweepTx: childTx })
    await Effect.runPromise(store.putReceipt(before))
    await Effect.runPromise(store.putReceipt(updated))
    const rows = await Effect.runPromise(store.allReceipts)
    expect(rows).toEqual([updated])
    expect(publicStats([], rows)).toMatchObject({ calls: 1, settled: 1, volumeAtomic: "120000", feesAtomic: "6000" })
    expect(listingReceiptFeed(rows, before.skillId, 20)).toHaveLength(1)
  })
  it("withholds settlement references as well as links for unsettled roots and children", () => {
    const row = feed.publicReceipt(receipt({ settled: false, children: [ReceiptChild.make({
      jobId: "job_child", skillId: "child", priceAtomic: 1n, settled: false, settleTx: childTx
    })] }))
    expect(row).not.toHaveProperty("settleTx")
    expect(row.explorer).toBeNull()
    expect(row.children[0]).not.toHaveProperty("settleTx")
    expect(row.children[0]?.explorer).toBeNull()
  })
})
