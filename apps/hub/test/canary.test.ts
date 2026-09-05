import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Ref, Schema } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { Bounds, PublicListing } from "@arcade/core"
import { HEADER_PAYMENT_SIGNATURE, PaymentPayload, decodeHeaderJson, makeTestRail, makeTestState } from "@arcade/payments"
import { StoreLive, StoreTag, payTestStateOf, type ListingRecord, type PayTestRow } from "../src/store.ts"
import { buyViaCallSkill, canaryFromEnv, canaryLoop, canaryTick, dueTargets, mergeTargets, parseInterval,
  type BuyFn, type CanaryConfig, type CanaryTarget } from "../src/canary.ts"

const account = privateKeyToAccount(generatePrivateKey()) // Ephemeral offline fixture; never funded.
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const listing = (over: Partial<PublicListing> = {}): PublicListing => PublicListing.make({
  id: "demo", version: "1.0.0", serviceName: "Demo", description: "d", tags: [], price: "$0.01",
  bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: { type: "object" }, outputSchema: { type: "object" }, ...over
})
const record = (l = listing()): ListingRecord => ({ listing: l, seller: SELLER, runnerId: "r", publishedAtMs: 1 })
const target = (l: PublicListing | undefined = listing()): CanaryTarget => ({
  skillId: l?.id ?? "demo", seller: SELLER, listing: l, lastAtMs: null, delisted: false
})
const pass: BuyFn = () => Effect.succeed({ ok: true, jobId: "job_pass", settleTx: "0xabc", reason: "ok" })
const config = (buy: BuyFn = pass): CanaryConfig => ({
  hubUrl: "https://hub.test", account, intervalMs: 1_000, tickMs: 100, maxPriceAtomic: 250_000n, buy, now: () => 10_000
})
const run = <A, E>(eff: Effect.Effect<A, E, StoreTag>) => Effect.runPromise(Effect.provide(eff, StoreLive))
const row = (n: number, over: Partial<PayTestRow> = {}): PayTestRow => ({
  skillId: "demo", seller: SELLER, atMs: n, jobId: `job_${n}`, ok: false, reason: "not settled", ...over
})
const DECLARED_MISMATCH = "the declared canaryInput does not satisfy this listing's own inputSchema"
beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe("parseInterval and opt-in configuration", () => {
  it.each([["45s", 45_000], ["10m", 600_000], ["24h", 86_400_000], ["1d", 86_400_000],
    ["600", 600_000], ["250ms", 250], [" 1s ", 1_000], ["2147483647ms", 2_147_483_647]])(
    "reads %s without timer coercion", (text, ms) => { expect(parseInterval(String(text))).toBe(ms) }
  )
  it.each(["", "0", "0ms", "-1s", "0.5s", "Infinity", "NaN", "soon", "PRIVATE_INTERVAL", "25d", "2147483648ms", "9".repeat(400)])(
    "refuses unsafe duration %s without echoing configuration", (value) => {
      expect(() => parseInterval(value)).toThrow()
      try { parseInterval(value) } catch (error) { expect(String(error)).not.toContain("PRIVATE_INTERVAL") }
    }
  )
  it("is disabled without a key and does not parse unused config", () => {
    vi.stubEnv("ARCADE_CANARY_KEY", "")
    vi.stubEnv("ARCADE_CANARY_INTERVAL", "PRIVATE_UNUSED")
    expect(canaryFromEnv("https://hub.test")).toBeUndefined()
    expect(console.log).not.toHaveBeenCalled()
  })
  it("derives an ephemeral test account, daily interval, and price cap", () => {
    const key = generatePrivateKey()
    vi.stubEnv("ARCADE_CANARY_KEY", key)
    for (const name of ["ARCADE_CANARY_INTERVAL", "ARCADE_CANARY_TICK", "ARCADE_CANARY_MAX_PRICE"]) vi.stubEnv(name, undefined)
    const cfg = canaryFromEnv("https://hub.test")
    expect(cfg).toMatchObject({ intervalMs: 86_400_000, tickMs: 30_000, maxPriceAtomic: 250_000n })
    expect(cfg?.account.address).toBe(privateKeyToAccount(key).address)
    expect(typeof cfg?.buy).toBe("function")
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(key)
  })
  it.each(["ARCADE_CANARY_INTERVAL", "ARCADE_CANARY_TICK", "ARCADE_CANARY_MAX_PRICE", "ARCADE_CANARY_KEY"])(
    "sanitizes invalid %s instead of echoing a credential", (name) => {
      vi.stubEnv("ARCADE_CANARY_KEY", generatePrivateKey())
      vi.stubEnv(name, "PRIVATE_CONFIG_CREDENTIAL")
      expect(() => canaryFromEnv("https://hub.test")).toThrow()
      try { canaryFromEnv("https://hub.test") } catch (error) { expect(String(error)).not.toContain("PRIVATE_CONFIG_CREDENTIAL") }
    }
  )
  it.each([["1ms", 1], ["500ms", 500]])("keeps the tick no longer than an explicitly configured %s interval", (text, ms) => {
    vi.stubEnv("ARCADE_CANARY_KEY", generatePrivateKey())
    vi.stubEnv("ARCADE_CANARY_INTERVAL", String(text))
    vi.stubEnv("ARCADE_CANARY_TICK", "30s")
    const cfg = canaryFromEnv("https://hub.test")
    expect(cfg?.intervalMs).toBe(ms)
    expect(cfg?.tickMs).toBe(ms)
  })
  it("rejects a zero price cap instead of enabling a config the loop cannot run", () => {
    vi.stubEnv("ARCADE_CANARY_KEY", generatePrivateKey())
    vi.stubEnv("ARCADE_CANARY_MAX_PRICE", "$0")
    expect(() => canaryFromEnv("https://hub.test")).toThrow("ARCADE_CANARY_MAX_PRICE")
  })
})

describe("target selection", () => {
  it("merges case-insensitive seller history, preserves live listing data, and never merges different sellers", () => {
    const live = Object.freeze([Object.freeze(record())])
    const known = [
      { skillId: "demo", seller: SELLER.toLowerCase(), state: payTestStateOf([row(9_000)]) },
      { skillId: "demo", seller: "0x1111111111111111111111111111111111111111", state: payTestStateOf([row(2)]) }
    ]
    const merged = mergeTargets(live, known)
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ listing: live[0]?.listing, seller: SELLER, lastAtMs: 9_000 })
    expect(merged[1]?.listing).toBeUndefined()
    expect(live).toHaveLength(1)
  })
  it("keeps absent runners due until delisted, then resumes only once the runner reconnects", () => {
    const known = [
      { skillId: "gone", seller: SELLER, state: payTestStateOf([row(1, { skillId: "gone" })]) },
      { skillId: "dead", seller: SELLER, state: payTestStateOf([1, 2, 3].map(n => row(n, { skillId: "dead" }))) }
    ]
    expect(dueTargets(10_000, 1_000, mergeTargets([], known)).map(t => t.skillId)).toEqual(["gone"])
    const live = { ...record(listing({ id: "dead" })), delisted: true }
    expect(dueTargets(10_000, 1_000, mergeTargets([live], known)).map(t => t.skillId)).toEqual(["gone", "dead"])
  })
  it("waits the full interval and does not immediately retry a future-dated verdict", () => {
    const t = { ...target(), lastAtMs: 9_500 }
    expect(dueTargets(10_000, 1_000, [t])).toEqual([])
    expect(dueTargets(10_500, 1_000, [t])).toEqual([t])
    expect(dueTargets(9_000, 1_000, [t])).toEqual([])
  })
})

describe("canaryTick failure isolation", () => {
  it("records one pass, then honors the persisted interval", async () => {
    const buy = vi.fn(pass)
    const state = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putListing(record())
      yield* canaryTick(config(buy)); yield* canaryTick(config(buy))
      return yield* s.getListing("demo")
    }))
    expect(state.payTested).toMatchObject({ ok: true, jobId: "job_pass", settleTx: "0xabc" })
    expect(state.delisted).toBe(false)
    expect(buy).toHaveBeenCalledTimes(1)
  })
  it("records no verdict for a skip", async () => {
    const state = await run(Effect.gen(function* () {
      const s = yield* StoreTag; yield* s.putListing(record())
      yield* canaryTick(config(() => Effect.succeed(null)))
      return yield* s.payTestState("demo", SELLER)
    }))
    expect(state).toEqual({ consecutiveFailures: 0, delisted: false })
  })
  it.each([false, true])("records sanitized buy failure and continues (synchronous throw: %s)", async (sync) => {
    const rows: PayTestRow[] = []
    await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putListing(record()); yield* s.putListing(record(listing({ id: "second" })))
      const buy: BuyFn = (t) => {
        if (t.skillId === "second") return pass(t)
        if (sync) throw new Error("PRIVATE_BUY_CREDENTIAL")
        return Effect.die(new Error("PRIVATE_BUY_CREDENTIAL"))
      }
      yield* canaryTick(config(buy)).pipe(Effect.provideService(StoreTag, { ...s, recordPayTest: (r) => {
        rows.push(r); return s.recordPayTest(r)
      } }))
    }))
    expect(rows.map(r => r.ok)).toEqual([false, true])
    expect(JSON.stringify([rows, vi.mocked(console.log).mock.calls, vi.mocked(console.error).mock.calls])).not.toContain("PRIVATE_BUY_CREDENTIAL")
  })
  it.each([false, true])("isolates persistence and logging failures without publishing a false verdict (synchronous: %s)", async (sync) => {
    const attempted: string[] = []
    vi.mocked(console.log).mockImplementation(() => { throw new Error("PRIVATE_LOG_CREDENTIAL") })
    const states = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putListing(record()); yield* s.putListing(record(listing({ id: "second" })))
      yield* canaryTick(config()).pipe(Effect.provideService(StoreTag, { ...s, recordPayTest: (r) => {
        attempted.push(r.skillId)
        if (r.skillId === "demo") {
          if (sync) throw new Error("PRIVATE_STORE_CREDENTIAL")
          return Effect.die(new Error("PRIVATE_STORE_CREDENTIAL"))
        }
        return s.recordPayTest(r)
      } }))
      return [yield* s.payTestState("demo", SELLER), yield* s.payTestState("second", SELLER)]
    }))
    expect(attempted).toEqual(["demo", "second"])
    expect(states[0]?.last).toBeUndefined()
    expect(states[1]?.last?.ok).toBe(true)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/PRIVATE_STORE|PRIVATE_LOG/)
  })
  it("throttles paid attempts even when persistence cannot retain a verdict", async () => {
    const buy = vi.fn(pass)
    await run(Effect.gen(function* () {
      const s = yield* StoreTag; yield* s.putListing(record())
      const brokenStore = { ...s, recordPayTest: () => Effect.die(new Error("PRIVATE_STORE_CREDENTIAL")) }
      for (const now of [10_000, 10_500, 11_000]) {
        yield* canaryTick({ ...config(buy), now: () => now }).pipe(Effect.provideService(StoreTag, brokenStore))
      }
      expect(yield* s.allPayTested).toEqual([])
    }))
    expect(buy).toHaveBeenCalledTimes(2)
  })
  it("isolates failure reading the store and does not expose its cause", async () => {
    const buy = vi.fn(pass)
    await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* canaryTick(config(buy)).pipe(Effect.provideService(StoreTag, {
        ...s, allListings: Effect.die(new Error("PRIVATE_DATABASE_CONNECTION"))
      }))
    }))
    expect(buy).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE_DATABASE_CONNECTION")
  })
  it("does not convert interruption into failure evidence or start the next target", async () => {
    const buy = vi.fn(() => Effect.interrupt)
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putListing(record()); yield* s.putListing(record(listing({ id: "second" })))
      const exit = yield* Effect.exit(canaryTick(config(buy)))
      return { exit, history: yield* s.allPayTested }
    }))
    expect(Exit.isFailure(out.exit) && Cause.isInterrupted(out.exit.cause)).toBe(true)
    expect(out.history).toEqual([])
    expect(buy).toHaveBeenCalledTimes(1)
  })
  it.each([0, -1, Infinity, NaN, 0.5, 2_147_483_648])("does no buying with unsafe programmatic timing %s", async (duration) => {
    const buy = vi.fn(pass)
    await run(Effect.gen(function* () {
      const s = yield* StoreTag; yield* s.putListing(record())
      yield* canaryTick({ ...config(buy), intervalMs: duration })
      yield* canaryTick({ ...config(buy), tickMs: duration })
    }))
    expect(buy).not.toHaveBeenCalled()
  })
  it("interrupts the repeating fiber during a pending buy without recording a failed test", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag; yield* s.putListing(record())
      const started = yield* Deferred.make<void>()
      const buy: BuyFn = () => Deferred.succeed(started, undefined).pipe(Effect.zipRight(Effect.never))
      const fiber = yield* Effect.fork(canaryLoop(config(buy)))
      yield* Deferred.await(started)
      const exit = yield* Fiber.interrupt(fiber)
      return { exit, history: yield* s.allPayTested }
    }))
    expect(Exit.isFailure(out.exit) && Cause.isInterrupted(out.exit.cause)).toBe(true)
    expect(out.history).toEqual([])
  })
})

/** Real SDK probe/sign/retry/poll and real in-memory rail; transport never leaves the process. */
const fakeHub = () => {
  const state = Effect.runSync(Ref.make(makeTestState({ [account.address]: 1_000_000n })))
  const rail = makeTestRail(state)
  const calls: Request[] = []
  let settled = false
  let offline = false
  let tx: string | undefined
  let job = 0
  const requirements = Effect.runSync(rail.challenge({ priceAtomic: 10_000n, resource: `https://hub.test/x/${SELLER}/demo`, payTo: SELLER }))
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init); calls.push(req)
    if (req.method === "POST") {
      if (offline) return json({ error: "PRIVATE_OFFLINE_DETAIL" }, 404)
      const header = req.headers.get(HEADER_PAYMENT_SIGNATURE)
      if (header === null) return json({ x402Version: 2, accepts: [requirements] }, 402)
      const payload = Schema.decodeUnknownSync(PaymentPayload)(decodeHeaderJson(header))
      const verified = await Effect.runPromise(rail.verify(payload, requirements))
      tx = settled ? (await Effect.runPromise(rail.settle(verified))).txHash : undefined
      job++
      return json({ job_id: `job_${job}`, poll_url: `https://hub.test/jobs/job_${job}/result?token=${"ab".repeat(16)}` }, 202)
    }
    return json({ job_id: `job_${job}`, status: settled ? "succeeded" : "failed", result: settled ? { ok: true } : null,
      receipt: { settled, ...(tx === undefined ? {} : { settleTx: tx }), reason: "PRIVATE_RECEIPT_REASON" } })
  })
  return { calls, state, setSettled: (value: boolean) => { settled = value }, setOffline: (value: boolean) => { offline = value } }
}

describe("buyViaCallSkill", () => {
  it("runs a finite failure/delist/reconnect/pass cycle through the ordinary signed buyer path", async () => {
    const hub = fakeHub()
    const cfg = config(); const buy = buyViaCallSkill(cfg)
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag; yield* s.putListing(record())
      for (const now of [10_000, 20_000, 30_000]) yield* canaryTick({ ...cfg, buy, now: () => now })
      const dead = yield* s.getListing("demo")
      yield* s.removeListingsForRunner("r")
      yield* canaryTick({ ...cfg, buy, now: () => 40_000 })
      yield* s.putListing(record())
      const reconnected = yield* s.getListing("demo")
      hub.setSettled(true)
      yield* canaryTick({ ...cfg, buy, now: () => 50_000 })
      return { dead, reconnected, alive: yield* s.getListing("demo"), history: yield* s.payTestHistory("demo", SELLER) }
    }))
    expect(out.dead.delisted).toBe(true); expect(out.reconnected.delisted).toBe(true); expect(out.alive.delisted).toBe(false)
    expect(out.history.map(r => r.ok)).toEqual([false, false, false, true])
    expect(out.alive.payTested?.settleTx).toMatch(/^0xtest/)
    expect(hub.calls).toHaveLength(12)
    const posts = hub.calls.filter(r => r.method === "POST")
    expect(posts.map(r => r.headers.has(HEADER_PAYMENT_SIGNATURE))).toEqual([false, true, false, true, false, true, false, true])
    expect(await posts[0]?.json()).toEqual({})
    const state = Effect.runSync(Ref.get(hub.state))
    expect(state.settlements).toHaveLength(1)
    expect(state.balances.get(account.address.toLowerCase())).toBe(990_000n)
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("PRIVATE_RECEIPT_REASON")
  })
  it.each([
    { price: "$0.30" },
    { inputSchema: { type: "string", pattern: "^x$" } },
    { inputSchema: { type: "string", pattern: "^(a+)+$" }, canaryInput: "aaaa" },
    { inputSchema: { type: "string" }, canaryInput: "x".repeat(5_000) }
  ])("skips hub limitations without calling the transport", async (over) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch)
    const out = await Effect.runPromise(buyViaCallSkill(config())(target(listing(over))))
    expect(out).toBeNull(); expect(fetch).not.toHaveBeenCalled()
  })
  it("records an actual declared input/schema mismatch as a failure, never as a skip", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch)
    const bad = listing({ inputSchema: { type: "string", pattern: "^x$" }, canaryInput: "PRIVATE_INPUT" })
    const cfg = config()
    const state = await run(Effect.gen(function* () {
      const s = yield* StoreTag; yield* s.putListing(record(bad))
      yield* canaryTick({ ...cfg, buy: buyViaCallSkill(cfg) })
      return yield* s.payTestState("demo", SELLER)
    }))
    expect(state.last?.ok).toBe(false)
    expect(await Effect.runPromise(buyViaCallSkill(cfg)(target(bad)))).toEqual({ ok: false, jobId: "", reason: DECLARED_MISMATCH })
    expect(fetch).not.toHaveBeenCalled()
  })
  it("counts a real offline 404 as failure and never prints the hub response body", async () => {
    const hub = fakeHub(); hub.setOffline(true)
    const absent = { ...target(), listing: undefined }
    const out = await Effect.runPromise(buyViaCallSkill(config())(absent))
    expect(out?.ok).toBe(false); expect(hub.calls).toHaveLength(1)
    expect(JSON.stringify(out)).not.toContain("PRIVATE_OFFLINE_DETAIL")
    expect(Effect.runSync(Ref.get(hub.state)).settlements).toEqual([])
  })
  it("records a real settled pass when the runner reconnects after the offline target snapshot", async () => {
    const hub = fakeHub(); hub.setSettled(true)
    const absent = { ...target(), listing: undefined }
    const out = await Effect.runPromise(buyViaCallSkill(config())(absent))
    const state = Effect.runSync(Ref.get(hub.state))
    expect(state.settlements).toHaveLength(1)
    expect(state.balances.get(account.address.toLowerCase())).toBe(990_000n)
    expect(out).toEqual({ ok: true, jobId: "job_1", settleTx: state.settlements[0]?.txHash, reason: "ok" })
    expect(hub.calls).toHaveLength(3)
  })
  it("keeps the buyer cap at the listing price when the challenged price rises", async () => {
    const hub = fakeHub()
    const out = await Effect.runPromise(buyViaCallSkill(config())(target(listing({ price: "$0.005" }))))
    expect(out?.ok).toBe(false); expect(hub.calls).toHaveLength(1)
    expect(Effect.runSync(Ref.get(hub.state)).settlements).toEqual([])
  })
})
