import { describe, expect, it } from "vitest"
import { Effect, Ref } from "effect"
import { Bounds, PublicListing, Receipt } from "@arcade/core"
import { makeStore } from "../src/store.ts"

/**
 * The store owns two things that show up in front of a judge: the fee-sweep backfill (which
 * is what keeps a BATCHED take-rate individually auditable) and the objective stats that
 * back a listing's reputation. Both were untested.
 */

const emptyState = () => ({
  listings: new Map(),
  runners: new Map(),
  jobs: new Map(),
  receipts: [],
  ratings: []
})

const store = () => makeStore(Effect.runSync(Ref.make(emptyState())))

const receipt = (over: Partial<Parameters<typeof Receipt.make>[0]> = {}) =>
  Receipt.make({
    jobId: `job_${Math.random().toString(36).slice(2, 10)}`,
    skillId: "demo",
    skillVersion: "1.0.0",
    buyer: "0xBuyer",
    seller: "0xSeller",
    priceAtomic: 250_000n,
    sellerAtomic: 237_500n,
    feeAtomic: 12_500n,
    feeBps: 500,
    rail: "test",
    network: "eip155:5042002",
    latencyMs: 1000,
    settled: true,
    reason: "ok",
    createdAtMs: Date.now(),
    ...over
  } as Parameters<typeof Receipt.make>[0])

describe("store — fee sweep backfill", () => {
  it("backfills the sweep tx into every receipt in the accrual bucket", async () => {
    const s = store()
    await Effect.runPromise(s.putReceipt(receipt({ feeAccrualId: "acc_2026-07-26" })))
    await Effect.runPromise(s.putReceipt(receipt({ feeAccrualId: "acc_2026-07-26" })))
    await Effect.runPromise(s.putReceipt(receipt({ feeAccrualId: "acc_2026-07-27" })))

    const n = await Effect.runPromise(s.backfillFeeSweep("acc_2026-07-26", "0xSWEEP"))
    expect(n).toBe(2)

    const all = await Effect.runPromise(s.allReceipts)
    const swept = all.filter((r) => r.feeSweepTx === "0xSWEEP")
    expect(swept).toHaveLength(2)
    // The other bucket must be untouched — sweeps are per-bucket, not global.
    expect(all.find((r) => r.feeAccrualId === "acc_2026-07-27")?.feeSweepTx).toBeUndefined()
  })

  it("is idempotent — re-sweeping does not overwrite an already-swept receipt", async () => {
    const s = store()
    await Effect.runPromise(s.putReceipt(receipt({ feeAccrualId: "acc_1" })))
    expect(await Effect.runPromise(s.backfillFeeSweep("acc_1", "0xFIRST"))).toBe(1)
    expect(await Effect.runPromise(s.backfillFeeSweep("acc_1", "0xSECOND"))).toBe(0)

    const all = await Effect.runPromise(s.allReceipts)
    expect(all[0]?.feeSweepTx).toBe("0xFIRST")
  })

  it("preserves every other receipt field through the backfill", async () => {
    const s = store()
    await Effect.runPromise(s.putReceipt(receipt({ feeAccrualId: "acc_1", settleTx: "0xSETTLE" })))
    await Effect.runPromise(s.backfillFeeSweep("acc_1", "0xSWEEP"))

    const [r] = await Effect.runPromise(s.allReceipts)
    expect(r?.settleTx).toBe("0xSETTLE")
    expect(r?.priceAtomic).toBe(250_000n)
    expect(r?.sellerAtomic + r!.feeAtomic).toBe(r!.priceAtomic)
  })

  it("ignores buckets with no matching receipts", async () => {
    const s = store()
    expect(await Effect.runPromise(s.backfillFeeSweep("nope", "0xX"))).toBe(0)
  })
})

describe("store — objective stats", () => {
  it("reports zeroes for a skill with no calls rather than dividing by zero", async () => {
    const stats = await Effect.runPromise(store().statsFor("demo"))
    expect(stats).toMatchObject({ calls: 0, settled: 0, successRate: 0, availability: 0 })
  })

  it("computes success rate from settled vs total", async () => {
    const s = store()
    await Effect.runPromise(s.putReceipt(receipt({ settled: true })))
    await Effect.runPromise(s.putReceipt(receipt({ settled: true })))
    await Effect.runPromise(s.putReceipt(receipt({ settled: false, reason: "engine refused" })))

    const stats = await Effect.runPromise(s.statsFor("demo"))
    expect(stats.calls).toBe(3)
    expect(stats.settled).toBe(2)
    expect(stats.successRate).toBeCloseTo(2 / 3)
  })

  it("computes latency percentiles from SETTLED calls only", async () => {
    const s = store()
    for (const ms of [100, 200, 300, 400, 1000]) {
      await Effect.runPromise(s.putReceipt(receipt({ latencyMs: ms })))
    }
    // A failed call's latency is not a service-quality signal.
    await Effect.runPromise(s.putReceipt(receipt({ settled: false, latencyMs: 99_999 })))

    const stats = await Effect.runPromise(s.statsFor("demo"))
    expect(stats.p95LatencyMs).toBeLessThan(99_999)
    expect(stats.p50LatencyMs).toBe(300)
  })

  it("scopes stats to one skill", async () => {
    const s = store()
    await Effect.runPromise(s.putReceipt(receipt({ skillId: "a" })))
    await Effect.runPromise(s.putReceipt(receipt({ skillId: "b" })))
    expect((await Effect.runPromise(s.statsFor("a"))).calls).toBe(1)
  })

  it("reports availability from whether a runner currently serves the skill", async () => {
    const s = store()
    expect((await Effect.runPromise(s.statsFor("demo"))).availability).toBe(0)

    await Effect.runPromise(
      s.putRunner({
        runnerId: "r1",
        seller: "0xSeller",
        skillIds: ["demo"],
        maxConcurrency: 1,
        connectedAtMs: Date.now(),
        lastSeenMs: Date.now(),
        activeJobs: 0
      })
    )
    expect((await Effect.runPromise(s.statsFor("demo"))).availability).toBe(1)
  })
})

describe("store — listings lifecycle", () => {
  const listing = PublicListing.make({
    id: "demo",
    version: "1.0.0",
    serviceName: "Demo",
    description: "d",
    tags: [],
    price: "$0.01",
    bounds: Bounds.make({ timeoutSec: 5 }),
    inputSchema: {},
    outputSchema: {}
  })

  it("removes a runner's listings when it disconnects", async () => {
    const s = store()
    await Effect.runPromise(
      s.putListing({ listing, seller: "0xSeller", runnerId: "r1", publishedAtMs: Date.now() })
    )
    expect(await Effect.runPromise(s.allListings)).toHaveLength(1)

    await Effect.runPromise(s.removeListingsForRunner("r1"))
    // A listing nobody can serve must not stay on the marketplace.
    expect(await Effect.runPromise(s.allListings)).toHaveLength(0)
  })

  it("leaves other runners' listings alone", async () => {
    const s = store()
    await Effect.runPromise(
      s.putListing({ listing, seller: "0xA", runnerId: "r1", publishedAtMs: Date.now() })
    )
    await Effect.runPromise(
      s.putListing({
        listing: PublicListing.make({ ...listing, id: "other" }),
        seller: "0xB",
        runnerId: "r2",
        publishedAtMs: Date.now()
      })
    )
    await Effect.runPromise(s.removeListingsForRunner("r1"))
    const rest = await Effect.runPromise(s.allListings)
    expect(rest).toHaveLength(1)
    expect(rest[0]?.listing.id).toBe("other")
  })

  it("fails with ListingNotFound for an unknown skill", async () => {
    const exit = await Effect.runPromiseExit(store().getListing("ghost"))
    expect(exit._tag).toBe("Failure")
  })
})
