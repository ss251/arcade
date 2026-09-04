import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { Bounds, PublicListing } from "@arcade/core"
import { StoreLive, StoreTag, payTestStateOf, payTestKey, PAY_TEST_HISTORY, type PayTestRow } from "../src/store.ts"

const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const OTHER = "0x1111111111111111111111111111111111111111"
const listing = PublicListing.make({ id: "demo", version: "1.0.0", serviceName: "Demo", description: "d",
  tags: [], price: "$0.01", bounds: Bounds.make({ timeoutSec: 30 }), inputSchema: {}, outputSchema: {} })
const row = (ok: boolean, atMs: number, over: Partial<PayTestRow> = {}): PayTestRow => ({
  skillId: "demo", seller: SELLER, atMs, jobId: `job_${atMs}`, ok, reason: ok ? "ok" : "not settled",
  ...(ok ? { settleTx: `0x${atMs}` } : {}), ...over
})
const rec = (seller = SELLER) => ({ listing, seller, runnerId: "rnr_1", publishedAtMs: 0 })
const run = <A, E>(eff: Effect.Effect<A, E, StoreTag>) => Effect.runPromise(Effect.provide(eff, StoreLive))

describe("payTestStateOf", () => {
  it("counts trailing failures, delists at three, and relists only on a pass", () => {
    expect(payTestStateOf([])).toEqual({ consecutiveFailures: 0, delisted: false })
    const h = [row(false, 1), row(true, 2), row(false, 3), row(false, 4)]
    expect(payTestStateOf(h)).toMatchObject({ consecutiveFailures: 2, delisted: false, last: { atMs: 4 } })
    expect(payTestStateOf([...h, row(false, 5)]).delisted).toBe(true)
    expect(payTestStateOf([...h, row(false, 5), row(true, 6)]).delisted).toBe(false)
    expect(payTestStateOf(h, 2).delisted).toBe(true)
  })
  it("projects only public evidence fields", () => {
    expect(payTestStateOf([row(true, 1)]).last).toEqual({ atMs: 1, jobId: "job_1", ok: true, settleTx: "0x1" })
    expect(payTestStateOf([row(false, 1)]).last).not.toHaveProperty("settleTx")
  })
  it("orders by time without mutating the source; equal times retain insertion order", () => {
    const rows = [row(true, 4), row(false, 1), row(false, 2), row(false, 3)]
    expect(payTestStateOf(rows)).toMatchObject({ delisted: false, last: { atMs: 4, ok: true } })
    expect(rows[0]?.atMs).toBe(4)
    expect(payTestStateOf([row(false, 1), row(false, 1), row(false, 1), row(true, 1)]).delisted).toBe(false)
  })
  it("keys by skill and normalized seller", () => {
    expect(payTestKey("demo", SELLER)).toBe(payTestKey("demo", SELLER.toLowerCase()))
    expect(payTestKey("demo", OTHER)).not.toBe(payTestKey("demo", SELLER))
    expect(payTestKey("other", SELLER)).not.toBe(payTestKey("demo", SELLER))
  })
})

describe("store pay-tests", () => {
  it("decorates each immutable listing snapshot from history", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putListing(rec())
      for (const n of [1, 2]) yield* s.recordPayTest(row(false, n))
      const midway = yield* s.getListing("demo")
      yield* s.recordPayTest(row(false, 3))
      const dead = yield* s.getListing("demo")
      yield* s.recordPayTest(row(true, 4))
      return { midway, dead, alive: yield* s.getListing("demo") }
    }))
    expect(out.midway.delisted).toBe(false)
    expect(out.dead.delisted).toBe(true)
    expect(out.dead.payTested?.ok).toBe(false)
    expect(out.alive.delisted).toBe(false)
    expect(out.alive.payTested?.settleTx).toBe("0x4")
  })
  it("a drop and reconnect preserves the verdict; another seller inherits none", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putListing(rec())
      for (const n of [1, 2, 3]) yield* s.recordPayTest(row(false, n))
      yield* s.removeListingsForRunner("rnr_1")
      const offline = yield* s.allPayTested
      yield* s.putListing({ ...rec(SELLER.toLowerCase()), runnerId: "rnr_2" })
      const back = yield* s.getListing("demo")
      yield* s.putListing(rec(OTHER))
      yield* s.recordPayTest(row(false, 4))
      return { offline, back, other: yield* s.getListing("demo") }
    }))
    expect(out.offline).toHaveLength(1)
    expect(out.offline[0]?.state.delisted).toBe(true)
    expect(out.back.delisted).toBe(true)
    expect(out.other.delisted).toBe(false)
    expect(out.other.payTested).toBeUndefined()
  })
  it("never trusts caller-provided pay-test decoration", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putListing({ ...rec(), delisted: true, payTested: { atMs: 999, jobId: "forged", ok: true } })
      const untested = yield* s.getListing("demo")
      for (const n of [1, 2, 3]) yield* s.recordPayTest(row(false, n))
      yield* s.putListing({ ...rec(), delisted: false, payTested: { atMs: 999, jobId: "forged", ok: true } })
      return { untested, tested: yield* s.getListing("demo") }
    }))
    expect(out.untested.delisted).toBe(false)
    expect(out.untested).not.toHaveProperty("payTested")
    expect(out.tested.delisted).toBe(true)
    expect(out.tested.payTested?.jobId).toBe("job_3")
  })
  it("keeps newest twenty in chronological order with a private-free history", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      for (let n = 25; n >= 1; n--) yield* s.recordPayTest(row(n === 25, n))
      return { history: yield* s.payTestHistory("demo", SELLER.toLowerCase()), state: yield* s.payTestState("demo", SELLER) }
    }))
    expect(PAY_TEST_HISTORY).toBe(20)
    expect(out.history).toHaveLength(20)
    expect(out.history.map((r) => r.atMs)).toEqual(Array.from({ length: 20 }, (_, n) => n + 6))
    expect(out.state.last?.ok).toBe(true)
    for (const evidence of out.history) expect(Object.keys(evidence).sort()).toEqual(evidence.ok
      ? ["atMs", "jobId", "ok", "settleTx"] : ["atMs", "jobId", "ok"])
  })
  it("does not retain mutable references to appended rows or returned histories", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      const original = row(false, 1)
      yield* s.recordPayTest(original)
      ;(original as { ok: boolean }).ok = true
      const history = yield* s.payTestHistory("demo", SELLER)
      ;(history[0] as { ok: boolean }).ok = true
      return yield* s.payTestState("demo", SELLER)
    }))
    expect(out.last?.ok).toBe(false)
  })
})
