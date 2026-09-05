import { describe, expect, it, vi } from "vitest"
import { Deferred, Effect, Fiber, Ref } from "effect"
import { Bounds, JobOutcome, PublicListing, Receipt, SessionStorageUnavailable, loadChainConfig, treeHashOf } from "@arcade/core"
import { PaymentPayload, PaymentRequirements, makeTestRail, makeTestState, type Rail, type SettledPayment } from "@arcade/payments"
import { StoreLive, StoreTag } from "../src/store.ts"
import { BrokerLive, BrokerTag } from "../src/broker.ts"
import { makeSessions } from "../src/sessions.ts"
import { makeRails } from "../src/rails.ts"
import { canonicalSessionPayment, canonicalSessionRequirements, prepareSessionCall } from "../src/session-call.ts"
import { runSessionJob } from "../src/pipeline-sessions.ts"

async function fixture(failSettlement = false, mixedCase = false, mode: "test" | "eip3009" | "gateway" = "test", splitter = false) {
  const buyer = `0x${"a".repeat(40)}`, seller = `0x${"b".repeat(40)}`, chain = loadChainConfig("arc-testnet"), now = Date.now()
  const id = `ses_${"3".repeat(32)}`, jobId = `job_${"3".repeat(20)}`
  const listing = PublicListing.make({ id: "demo", version: "1.0.0", serviceName: "demo", tags: [], description: "Offline", price: "$0.10",
    inputSchema: {}, outputSchema: { type: "object" }, bounds: Bounds.make({ timeoutSec: 10, maxSubSpendUsd: 0.05 }) })
  const state = Effect.runSync(Ref.make({ ...makeTestState({}, 1_000_000n), failSettlement })), testRail = makeTestRail(state)
  // Non-test rails below are controlled adapter seams, NOT crypto/network/durable
  // admission proof. Seed their prior admission through the actual F5 kernel.
  const rail: Rail = mode === "test" ? testRail : { ...testRail, name: mode,
    settle: verified => Effect.succeed({ payer: verified.payer, amountAtomic: verified.amountAtomic,
      txHash: mode === "gateway" ? "12345678-1234-4234-8234-123456789012" : `0x${"4".repeat(64)}`,
      settlementKind: mode === "gateway" ? "gateway-transfer" : "onchain" }) }
  const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
  const broker = await Effect.runPromise(BrokerTag.pipe(Effect.provide(BrokerLive)))
  const facade = makeSessions({ store, rails: makeRails(rail, []), chain, newId: () => id })
  const sessions = mode === "test" ? facade : { ...facade, beginSettlement: store.beginSessionSettlement }
  if (mode === "test") await Effect.runPromise(sessions.openSession({ buyer, budgetAtomic: 1_000_000n, openedAtMs: now - 1 }))
  else await Effect.runPromise(store.openSession({ id, buyer, budgetAtomic: 1_000_000n, rail: mode, network: chain.caip2, openedAtMs: now - 1 }))
  const snapshot = await Effect.runPromise(sessions.snapshot(id))
  const payTo = splitter ? `0x${"c".repeat(40)}` : seller
  const base = await Effect.runPromise(rail.challenge({ priceAtomic: 100_000n, resource: "http://127.0.0.1/x/demo/demo", payTo }))
  const requirements = canonicalSessionRequirements(PaymentRequirements.make({ ...base,
    extra: mode === "gateway" ? { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway!.wallet }
      : { ...base.extra, ...(splitter ? { feeSplitter: payTo, feeSplitterVersion: 2 } : {}) } }))
  const payload = PaymentPayload.make({ x402Version: 2, accepted: requirements, payload: { signature: "0xgood", authorization: {
    from: mixedCase ? `0x${"A".repeat(40)}` : buyer, to: payTo, value: "100000", validAfter: String(Math.floor(now / 1000) - 1), validBefore: String(Math.floor(now / 1000) + 600), nonce: `0x${"3".repeat(64)}` } } })
  const verified = await Effect.runPromise(rail.verify(canonicalSessionPayment(payload), requirements))
  const call = prepareSessionCall({ snapshot, record: { listing, seller, runnerId: "runner_demo", publishedAtMs: now,
    ...(splitter ? { feeSplitter: payTo, splitterVersion: 2, splitterVerified: true, splitterFeeBps: 500, splitterNetwork: chain.caip2 } : {}) },
    chain, rail, verified, requirements, jobId, input: {}, createdAtMs: now })
  await Effect.runPromise(mode === "test" ? sessions.reserve(call.binding, call.job) : store.reserveSessionJob(call.binding, call.job))
  let dispatches = 0
  await Effect.runPromise(broker.register({ runnerId: "runner_demo", seller, close() {}, send(message) {
    if (message._tag !== "JobAssignment") return
    dispatches++
    Effect.runSync(broker.complete(message.jobId, JobOutcome.make({ status: "succeeded", output: { answer: "paid" }, startedAtMs: now, finishedAtMs: Date.now() })))
  } }, ["demo"]))
  return { state, store, broker, sessions, call, id, jobId, dispatches: () => dispatches }
}
const childReceipt = (f: Awaited<ReturnType<typeof fixture>>, n = 5, patch: Partial<Receipt> = {}) => Receipt.make({
  jobId: `job_${String(n).repeat(20)}`, skillId: `child-${n}`, skillVersion: "1.0.0", buyer: `0x${"9".repeat(40)}`,
  seller: `0x${"d".repeat(40)}`, priceAtomic: 10_000n, sellerAtomic: 10_000n, feeAtomic: 0n, feeBps: 0,
  rail: "eip3009", network: f.call.binding.network, settled: true, settleTx: `0x${String(n).repeat(64)}`,
  reason: "ok", createdAtMs: Date.now(), latencyMs: 0, rootJobId: f.jobId, parentJobId: f.jobId,
  hop: 1, ancestors: ["demo"], ...patch })
const seedChild = async (f: Awaited<ReturnType<typeof fixture>>, receipt: Receipt, state: "committed" | "released" | "reserved" = "committed", persist = true) => {
  await Effect.runPromise(f.store.reserveTree(f.jobId, receipt.jobId, receipt.priceAtomic, 50_000n))
  if (state === "committed") await Effect.runPromise(f.store.commitTree(receipt.jobId))
  if (state === "released") await Effect.runPromise(f.store.releaseTree(receipt.jobId))
  if (persist) await Effect.runPromise(f.store.putReceipt(receipt))
}
describe("session-root execution", () => {
  it("canonicalizes mixed-case signed address representations before verification so actual TestRail settlement completes", async () => {
    const f = await fixture(false, true)
    const result = await Effect.runPromiseExit(runSessionJob(f.call, f))
    expect(result._tag).toBe("Success")
    expect((await Effect.runPromise(f.sessions.snapshot(f.id))).session.spentAtomic).toBe(100_000n)
  })
  it("settles an actual TestRail payment atomically with real Broker output and zero fee", async () => {
    const f = await fixture(), result = await Effect.runPromise(runSessionJob(f.call, f))
    expect(result.receipt).toMatchObject({ settled: true, settleRefKind: "test", feeBps: 0, feeAtomic: 0n, sellerAtomic: 100_000n })
    expect(result.receipt.children).toBeUndefined()
    expect(result.receipt.feeAccrualId).toBeUndefined()
    expect((await Effect.runPromise(f.sessions.snapshot(f.id))).session.spentAtomic).toBe(100_000n)
    expect(result.outcome.costUsd).toBeUndefined()
  })
  it("holds an ambiguous settlement and exposes no output or terminal receipt", async () => {
    const f = await fixture(true), result = await Effect.runPromiseExit(runSessionJob(f.call, f))
    expect(result._tag).toBe("Failure")
    const snapshot = await Effect.runPromise(f.sessions.snapshot(f.id))
    expect(snapshot.calls[0]?.state).toBe("uncertain"); expect(snapshot.heldAtomic).toBe(100_000n)
    expect((await Effect.runPromise(f.store.getJob(f.jobId)))?.outcome).toBeUndefined()
    expect(await Effect.runPromise(f.store.getSessionReceipt(f.id, f.jobId))).toBeUndefined()
  })
  it("claims one execution attempt across concurrent and later evaluation of the same issued Effect", async () => {
    const f = await fixture(), issued = runSessionJob(f.call, f)
    const results = await Promise.all([Effect.runPromiseExit(issued), Effect.runPromiseExit(issued)])
    expect(results.filter(r => r._tag === "Success")).toHaveLength(1)
    expect((await Effect.runPromiseExit(issued))._tag).toBe("Failure")
    expect(f.dispatches()).toBe(1)
    expect(Effect.runSync(Ref.get(f.state)).settlements).toHaveLength(1)
  })
  it("rejects a duplicate outside the active owner's cleanup without changing its settling hold", async () => {
    const f = await fixture(), entered = Effect.runSync(Deferred.make<void>()), proceed = Effect.runSync(Deferred.make<void>())
    const settle = f.call.rail.settle
    vi.spyOn(f.call.rail, "settle").mockImplementation((...args) => Effect.gen(function* () {
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(proceed)
      return yield* settle(...args)
    }))
    let marks = 0
    const sessions = { ...f.sessions, markUncertain: (...args: Parameters<typeof f.sessions.markUncertain>) => {
      marks++; return f.sessions.markUncertain(...args)
    } }
    const issued = runSessionJob(f.call, { ...f, sessions }), owner = Effect.runFork(issued)
    try {
      await Effect.runPromise(Deferred.await(entered).pipe(Effect.timeout("1 second")))
      expect((await Effect.runPromiseExit(issued))._tag).toBe("Failure")
      expect(marks).toBe(0)
      expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("settling")
      expect(f.dispatches()).toBe(1)
      await Effect.runPromise(Deferred.succeed(proceed, undefined))
      expect((await Effect.runPromise(Fiber.await(owner)))._tag).toBe("Success")
      expect(Effect.runSync(Ref.get(f.state)).settlements).toHaveLength(1)
    } finally { await Effect.runPromise(Fiber.interrupt(owner)) }
  })
  it("does not commit a hash-shaped foreign-rail child as EIP V2 tree evidence", async () => {
    const f = await fixture(false, false, "eip3009", true), childId = `job_${"5".repeat(20)}`
    await Effect.runPromise(f.store.reserveTree(f.jobId, childId, 10_000n, 50_000n))
    await Effect.runPromise(f.store.commitTree(childId))
    await Effect.runPromise(f.store.putReceipt(Receipt.make({ jobId: childId, skillId: "child", skillVersion: "1.0.0",
      buyer: f.call.binding.seller, seller: `0x${"d".repeat(40)}`, priceAtomic: 10_000n, sellerAtomic: 10_000n, feeAtomic: 0n, feeBps: 0,
      rail: "gateway", network: f.call.binding.network, settled: true, settleTx: `0x${"5".repeat(64)}`,
      reason: "ok", createdAtMs: Date.now(), latencyMs: 0, rootJobId: f.jobId, parentJobId: f.jobId, hop: 1, ancestors: ["demo"] })))
    const settle = vi.spyOn(f.call.rail, "settle"), result = await Effect.runPromise(runSessionJob(f.call, f))
    expect(result.receipt.settled).toBe(false)
    expect(settle).not.toHaveBeenCalled()
    expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("released")
  })
  it("retains only valid known failed inference cost, not failed output or diagnostics", async () => {
    const f = await fixture()
    const broker = { ...f.broker, dispatch: () => Effect.succeed(JobOutcome.make({ status: "failed", costUsd: 0.0123,
      output: { private: "not a successful result" }, error: "PRIVATE_PROVIDER_REASON", startedAtMs: f.call.job.createdAtMs, finishedAtMs: Date.now() })) }
    const result = await Effect.runPromise(runSessionJob(f.call, { ...f, broker }))
    expect(result.receipt.sellerCostUsd).toBe(0.0123)
    expect(result.outcome.costUsd).toBe(0.0123)
    expect(result.outcome.output).toBeUndefined(); expect(result.outcome.error).toBeUndefined()
    expect(result.receipt.settled).toBe(false)
  })
  it.each(["malformed-result", "throw", "defect", "commit", "marker"])("holds post-barrier %s without exposing outcome or retrying", async failure => {
    const f = await fixture(), original = f.call.rail.settle
    const settle = vi.spyOn(f.call.rail, "settle").mockImplementation((...args) => {
      if (failure === "throw") throw new Error("PRIVATE_SETTLEMENT")
      if (failure === "defect") return Effect.die("PRIVATE_SETTLEMENT")
      return original(...args).pipe(Effect.map(value => failure === "malformed-result" || failure === "marker" ? { ...value, amountAtomic: 1n } : value))
    })
    const sessions = { ...f.sessions,
      ...(failure === "commit" ? { commit: () => Effect.die("PRIVATE_STORAGE") } : {}),
      ...(failure === "marker" ? { markUncertain: () => Effect.die("PRIVATE_MARKER") } : {}) }
    const issued = runSessionJob(f.call, { ...f, sessions }), result = await Effect.runPromise(Effect.either(issued))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "SessionStorageUnavailable" } })
    expect(JSON.stringify(result)).not.toContain("PRIVATE_")
    expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe(failure === "marker" ? "settling" : "uncertain")
    expect((await Effect.runPromise(f.sessions.snapshot(f.id))).heldAtomic).toBe(100_000n)
    expect(await Effect.runPromise(f.store.getSessionReceipt(f.id, f.jobId))).toBeUndefined()
    expect((await Effect.runPromise(f.store.getJob(f.jobId)))?.outcome).toBeUndefined()
    expect((await Effect.runPromiseExit(issued))._tag).toBe("Failure"); expect(settle).toHaveBeenCalledTimes(1)
  })
  it.each(["false", "typed", "defect"])("does not send when the durable begin barrier returns %s", async failure => {
    const f = await fixture(), settle = vi.spyOn(f.call.rail, "settle"), mark = vi.fn(f.sessions.markUncertain)
    const sessions = { ...f.sessions, markUncertain: mark, beginSettlement: () => failure === "false" ? Effect.succeed({ claimed: false })
      : failure === "typed" ? Effect.fail(new SessionStorageUnavailable()) : Effect.die("PRIVATE_BEGIN") }
    expect((await Effect.runPromiseExit(runSessionJob(f.call, { ...f, sessions })))._tag).toBe("Failure")
    expect(settle).not.toHaveBeenCalled(); expect(mark).not.toHaveBeenCalled()
    expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("reserved")
  })
  it("preserves interruption during settlement and never settles a late uncooperative response again", async () => {
    const f = await fixture(), entered = Effect.runSync(Deferred.make<void>())
    let resolve!: (value: SettledPayment) => void
    const late = new Promise<SettledPayment>(r => { resolve = r })
    const settle = vi.spyOn(f.call.rail, "settle").mockImplementation(() => Deferred.succeed(entered, undefined).pipe(Effect.zipRight(Effect.promise(() => late))))
    const issued = runSessionJob(f.call, f), fiber = Effect.runFork(issued)
    try {
      await Effect.runPromise(Deferred.await(entered).pipe(Effect.timeout("1 second")))
      const interrupted = await Effect.runPromise(Fiber.interrupt(fiber))
      expect(interrupted._tag).toBe("Failure")
      expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("uncertain")
      resolve({ payer: f.call.binding.buyer, amountAtomic: 100_000n, txHash: `0xtest${"f".repeat(14)}` })
      await Promise.resolve()
      expect(await Effect.runPromise(f.store.getSessionReceipt(f.id, f.jobId))).toBeUndefined()
      expect((await Effect.runPromiseExit(issued))._tag).toBe("Failure"); expect(settle).toHaveBeenCalledTimes(1)
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
  it("bounds settlement to 30 seconds and retains its hold at the exact deadline", async () => {
    vi.useFakeTimers()
    try {
      const f = await fixture(), entered = Effect.runSync(Deferred.make<void>())
      const settle = vi.spyOn(f.call.rail, "settle").mockImplementation(() => Deferred.succeed(entered, undefined).pipe(Effect.zipRight(Effect.never)))
      const fiber = Effect.runFork(runSessionJob(f.call, f))
      try {
        await Effect.runPromise(Deferred.await(entered))
        await vi.advanceTimersByTimeAsync(29_999)
        expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("settling")
        await vi.advanceTimersByTimeAsync(1)
        expect((await Effect.runPromise(Fiber.await(fiber)))._tag).toBe("Failure")
        expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("uncertain")
        expect(settle).toHaveBeenCalledTimes(1)
      } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
    } finally { vi.useRealTimers() }
  })
  it.each(["test", "gateway"] as const)("skips D and tree reads for %s while preserving the exact verified object", async mode => {
    const f = await fixture(false, false, mode), original = f.call.rail.settle
    const settle = vi.spyOn(f.call.rail, "settle").mockImplementation((verified, tree) => {
      expect(verified).toBe(f.call.verified); expect(tree).toBeUndefined()
      return original(verified, tree)
    })
    const tree = vi.fn(() => Effect.die("TREE_MUST_NOT_READ")), all = vi.fn(() => { throw new Error("RECEIPTS_MUST_NOT_READ") })
    const store = { ...f.store, treeState: tree, get allReceipts() { return all() } }
    const onTerminal = vi.fn(() => Effect.void)
    const result = await Effect.runPromise(runSessionJob(f.call, { ...f, store, attester: { onTerminal, idle: Effect.void },
      attest: { origin: "http://127.0.0.1", payTo: "ignored-context-payee", chainId: 5042002, identityRegistry: `0x${"e".repeat(40)}` } }))
    expect(result.receipt.feeAtomic).toBe(0n); expect(result.receipt.sellerAtomic).toBe(100_000n)
    expect(settle).toHaveBeenCalledTimes(1); expect(tree).not.toHaveBeenCalled(); expect(all).not.toHaveBeenCalled(); expect(onTerminal).not.toHaveBeenCalled()
  })
  it.each(["getter", "cycle", "oversize", "invalid-output", "future-time", "invalid-cost"])("releases %s runner data before any begin/send and stores no raw diagnostic", async malformed => {
    const f = await fixture(), getters = vi.fn(() => "PRIVATE_GETTER")
    const cycle: { self?: unknown } = {}; cycle.self = cycle
    const output = malformed === "getter" ? Object.defineProperty({}, "private", { get: getters, enumerable: true })
      : malformed === "cycle" ? cycle : malformed === "oversize" ? { data: "x".repeat(1_048_576) } : malformed === "invalid-output" ? [] : {}
    const raw = { status: "succeeded", output, startedAtMs: f.call.job.createdAtMs,
      finishedAtMs: malformed === "future-time" ? Date.now() + 60_000 : Date.now(),
      ...(malformed === "invalid-cost" ? { costUsd: -1 } : {}) } as JobOutcome
    const begin = vi.fn(f.sessions.beginSettlement), settle = vi.spyOn(f.call.rail, "settle")
    const result = await Effect.runPromise(runSessionJob(f.call, { ...f, sessions: { ...f.sessions, beginSettlement: begin },
      broker: { ...f.broker, dispatch: () => Effect.succeed(raw) } }))
    expect(result.receipt.settled).toBe(false); expect(result.outcome.output).toBeUndefined()
    expect(result.outcome.costUsd).toBeUndefined(); expect(result.outcome.error).toBeUndefined()
    expect(begin).not.toHaveBeenCalled(); expect(settle).not.toHaveBeenCalled(); expect(getters).not.toHaveBeenCalled()
    expect((await Effect.runPromise(f.store.getJob(f.jobId)))?.createdAtMs).toBe(f.call.job.createdAtMs)
  })
  it("bounds an unfinished dispatch and releases it without settlement", async () => {
    vi.useFakeTimers()
    try {
      const f = await fixture(), entered = Effect.runSync(Deferred.make<void>()), settle = vi.spyOn(f.call.rail, "settle")
      const broker = { ...f.broker, dispatch: () => Deferred.succeed(entered, undefined).pipe(Effect.zipRight(Effect.never)) }
      const fiber = Effect.runFork(runSessionJob(f.call, { ...f, broker }))
      try {
        await Effect.runPromise(Deferred.await(entered)); await vi.advanceTimersByTimeAsync(14_999)
        expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("reserved")
        await vi.advanceTimersByTimeAsync(1)
        expect((await Effect.runPromise(Fiber.await(fiber)))._tag).toBe("Success")
        expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("released")
        expect(settle).not.toHaveBeenCalled()
      } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
    } finally { vi.useRealTimers() }
  })
  it("retains pre-barrier interruption without running or settling later", async () => {
    const f = await fixture(), entered = Effect.runSync(Deferred.make<void>()), settle = vi.spyOn(f.call.rail, "settle")
    const broker = { ...f.broker, dispatch: () => Deferred.succeed(entered, undefined).pipe(Effect.zipRight(Effect.never)) }
    const issued = runSessionJob(f.call, { ...f, broker }), fiber = Effect.runFork(issued)
    try {
      await Effect.runPromise(Deferred.await(entered).pipe(Effect.timeout("1 second")))
      expect((await Effect.runPromise(Fiber.interrupt(fiber)))._tag).toBe("Failure")
      expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("reserved")
      expect((await Effect.runPromiseExit(issued))._tag).toBe("Failure"); expect(settle).not.toHaveBeenCalled()
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
  it("rechecks expiry before begin and keeps the original queued timestamp", async () => {
    const f = await fixture(), settle = vi.spyOn(f.call.rail, "settle")
    const result = await Effect.runPromise(runSessionJob(f.call, { ...f, now: () => Number(f.call.binding.validBefore) * 1000 }))
    expect(result.receipt.settled).toBe(false); expect(settle).not.toHaveBeenCalled()
    expect((await Effect.runPromise(f.store.getJob(f.jobId)))?.createdAtMs).toBe(f.call.job.createdAtMs)
  })
  it("does not publish output or enqueue D before atomic finish, then uses the actual EIP payee and observed fee", async () => {
    const f = await fixture(false, false, "eip3009", true), reached = Effect.runSync(Deferred.make<void>()), proceed = Effect.runSync(Deferred.make<void>())
    let persistedWhenEnqueued = false
    const onTerminal = vi.fn((_event: import("../src/attest.ts").AttestJob) => Effect.gen(function* () {
      const receipt = yield* f.store.getSessionReceipt(f.id, f.jobId)
      persistedWhenEnqueued = receipt?.settled === true
    }).pipe(Effect.orDie))
    const sessions = { ...f.sessions, commit: (value: Parameters<typeof f.sessions.commit>[0]) => Deferred.succeed(reached, undefined).pipe(
      Effect.zipRight(Deferred.await(proceed)), Effect.zipRight(f.sessions.commit(value))) }
    let completed = false
    const fiber = Effect.runFork(runSessionJob(f.call, { ...f, sessions, attester: { onTerminal, idle: Effect.void },
      attest: { agentId: "1", origin: "http://127.0.0.1", payTo: "not-authority", chainId: 5042002, identityRegistry: `0x${"e".repeat(40)}` } }).pipe(Effect.tap(() => Effect.sync(() => { completed = true }))))
    try {
      await Effect.runPromise(Deferred.await(reached).pipe(Effect.timeout("1 second")))
      expect(completed).toBe(false); expect(onTerminal).not.toHaveBeenCalled()
      expect(await Effect.runPromise(f.store.getSessionReceipt(f.id, f.jobId))).toBeUndefined()
      expect((await Effect.runPromise(f.store.getJob(f.jobId)))?.outcome).toBeUndefined()
      await Effect.runPromise(Deferred.succeed(proceed, undefined))
      const result = await Effect.runPromise(Fiber.join(fiber))
      expect(result.receipt).toMatchObject({ feeBps: 500, feeAtomic: 5_000n, sellerAtomic: 95_000n })
      expect(result.receipt.feeAccrualId).toBeUndefined(); expect(onTerminal).toHaveBeenCalledTimes(1)
      expect(persistedWhenEnqueued).toBe(true)
      expect(onTerminal.mock.calls[0]?.[0]).toMatchObject({ payTo: f.call.verified.payTo, settleTx: `0x${"4".repeat(64)}`, output: { answer: "paid" } })
      expect(result.receipt.createdAtMs).toBeGreaterThanOrEqual(f.call.job.createdAtMs)
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
  it.each(["hang", "throw"])("bounds best-effort EIP D %s after terminal persistence", async behavior => {
    vi.useFakeTimers()
    try {
      const f = await fixture(false, false, "eip3009"), entered = Effect.runSync(Deferred.make<void>())
      const onTerminal = vi.fn(() => { if (behavior === "throw") throw new Error("PRIVATE_ATTEST")
        return Deferred.succeed(entered, undefined).pipe(Effect.zipRight(Effect.never)) })
      const fiber = Effect.runFork(runSessionJob(f.call, { ...f, attester: { onTerminal, idle: Effect.void },
        attest: { origin: "http://127.0.0.1", payTo: "unused", chainId: 5042002, identityRegistry: `0x${"e".repeat(40)}` } }))
      try {
        if (behavior === "hang") { await Effect.runPromise(Deferred.await(entered)); await vi.advanceTimersByTimeAsync(50) }
        expect((await Effect.runPromise(Fiber.await(fiber)))._tag).toBe("Success")
        expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("settled")
        expect(onTerminal).toHaveBeenCalledTimes(1)
      } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
    } finally { vi.useRealTimers() }
  })
  it("passes only actual correlated flat EIP descendants as one V2 commitment, with no tree fields in the session artifact", async () => {
    const f = await fixture(false, false, "eip3009", true)
    const direct = childReceipt(f), nested = childReceipt(f, 6, { parentJobId: direct.jobId, hop: 2, ancestors: ["demo", direct.skillId] })
    const { settleTx: _omittedRef, ...releasedFields } = childReceipt(f, 7)
    const released = Receipt.make({ ...releasedFields, settled: false, reason: "refused" })
    await seedChild(f, nested); await seedChild(f, direct); await seedChild(f, released, "released")
    const settle = vi.spyOn(f.call.rail, "settle"), result = await Effect.runPromise(runSessionJob(f.call, { ...f, hireCapability: "separate-seller-funded-capability" }))
    const children = [direct, nested].map(r => ({ jobId: r.jobId, skillId: r.skillId, priceAtomic: r.priceAtomic, settled: true, settleTx: r.settleTx! }))
    expect(settle).toHaveBeenCalledExactlyOnceWith(f.call.verified, { treeHash: treeHashOf(f.jobId, children), childCount: 2, childTotalAtomic: 20_000n })
    expect(result.receipt.settled).toBe(true)
    for (const key of ["children", "treeHash", "treeCeilingAtomic", "treeCommittedAtomic", "feeAccrualId"]) expect(result.receipt).not.toHaveProperty(key)
    expect((await Effect.runPromise(f.store.treeState(f.jobId))).committedAtomic).toBe(20_000n)
    expect((await Effect.runPromise(f.sessions.snapshot(f.id))).session.spentAtomic).toBe(100_000n)
  })
  it.each(["missing", "duplicate", "reserved", "wrong-network", "bad-ref", "zero-ref", "wrong-kind", "wrong-root", "wrong-parent", "wrong-hop", "wrong-ancestors", "wrong-price"])("refuses %s child evidence before settlement without a synthetic fallback", async malformed => {
    const f = await fixture(false, false, "eip3009", true), original = childReceipt(f)
    await seedChild(f, original, malformed === "reserved" ? "reserved" : "committed", false)
    const patch: Partial<Receipt> = malformed === "wrong-network" ? { network: "eip155:1" }
      : malformed === "bad-ref" ? { settleTx: "opaque-transfer" } : malformed === "zero-ref" ? { settleTx: `0x${"0".repeat(64)}` }
      : malformed === "wrong-kind" ? { settleRefKind: "gateway-transfer" }
      : malformed === "wrong-root" ? { rootJobId: `job_${"9".repeat(20)}` }
      : malformed === "wrong-parent" ? { parentJobId: `job_${"9".repeat(20)}` }
      : malformed === "wrong-hop" ? { hop: 0 } : malformed === "wrong-ancestors" ? { ancestors: ["foreign"] }
      : malformed === "wrong-price" ? { priceAtomic: 1n, sellerAtomic: 1n } : {}
    if (malformed !== "missing") await Effect.runPromise(f.store.putReceipt(Receipt.make({ ...original, ...patch })))
    if (malformed === "duplicate") await Effect.runPromise(f.store.putReceipt(original))
    const settle = vi.spyOn(f.call.rail, "settle"), result = await Effect.runPromise(runSessionJob(f.call, f))
    expect(result.receipt.settled).toBe(false); expect(settle).not.toHaveBeenCalled()
    expect(result.outcome.output).toBeUndefined()
    expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("released")
    expect((await Effect.runPromise(f.store.treeState(f.jobId))).committedAtomic).toBe(malformed === "reserved" ? 0n : 10_000n)
  })
  it("dispatches only the ordinary hire capability, never session credentials or a forged child parent", async () => {
    const f = await fixture(), dispatch = vi.spyOn(f.broker, "dispatch")
    await Effect.runPromise(runSessionJob(f.call, { ...f, hireCapability: "ordinary-hire-capability" }))
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ jobId: f.jobId, skillId: "demo", skillVersion: "1.0.0",
      input: {}, timeoutSec: 10, hireCapability: "ordinary-hire-capability" })
    expect(JSON.stringify(dispatch.mock.calls)).not.toContain(f.id)
  })
  it("rejects a corrupt negative legacy tree read before granting settlement authority", async () => {
    const f = await fixture(false, false, "eip3009", true)
    const receipt = childReceipt(f, 5, { priceAtomic: -1n, sellerAtomic: -1n })
    // Actual kernel refuses this reservation. Only a corrupted read seam can
    // present the inconsistent tree; do not label this an admitted real child.
    expect(await Effect.runPromise(f.store.reserveTree(f.jobId, receipt.jobId, -1n, 50_000n))).toBe(false)
    await Effect.runPromise(f.store.putReceipt(receipt))
    const store = { ...f.store, treeState: () => Effect.succeed({ reservedAtomic: 0n, committedAtomic: -1n,
      children: [{ childJobId: receipt.jobId, amountAtomic: -1n, state: "committed" as const }] }) }
    const settle = vi.spyOn(f.call.rail, "settle"), result = await Effect.runPromise(runSessionJob(f.call, { ...f, store }))
    expect(result.receipt.settled).toBe(false); expect(settle).not.toHaveBeenCalled()
  })
  it("bounds a stuck uncertainty marker to 50ms without releasing or enqueueing EIP D", async () => {
    vi.useFakeTimers()
    const gate = Effect.runSync(Deferred.make<void>())
    try {
      const f = await fixture(false, false, "eip3009"), entered = Effect.runSync(Deferred.make<void>())
      const onTerminal = vi.fn(() => Effect.void), mark = vi.fn(() => Deferred.succeed(entered, undefined).pipe(Effect.zipRight(Deferred.await(gate))))
      const sessions = { ...f.sessions, commit: () => Effect.die("PRIVATE_FINISH"), markUncertain: mark }
      const fiber = Effect.runFork(runSessionJob(f.call, { ...f, sessions, attester: { onTerminal, idle: Effect.void },
        attest: { origin: "http://127.0.0.1", payTo: "unused", chainId: 5042002, identityRegistry: `0x${"e".repeat(40)}` } }))
      try {
        await Effect.runPromise(Deferred.await(entered)); await vi.advanceTimersByTimeAsync(50)
        const state = await Effect.runPromise(Fiber.poll(fiber))
        expect(state._tag).toBe("Some")
        if (state._tag === "Some") expect(state.value._tag).toBe("Failure")
        expect((await Effect.runPromise(f.sessions.snapshot(f.id))).calls[0]?.state).toBe("settling")
        expect(await Effect.runPromise(f.store.getSessionReceipt(f.id, f.jobId))).toBeUndefined()
        expect(mark).toHaveBeenCalledTimes(1); expect(onTerminal).not.toHaveBeenCalled()
      } finally { await Effect.runPromise(Deferred.succeed(gate, undefined)); await Effect.runPromise(Fiber.interrupt(fiber)) }
    } finally { vi.useRealTimers() }
  })
  it("captures execution options and attestation coordinates when the Effect is issued", async () => {
    const f = await fixture(false, false, "eip3009"), dispatch = vi.spyOn(f.broker, "dispatch")
    const first = vi.fn(() => Effect.void), late = vi.fn(() => Effect.void)
    const options = { ...f, hireCapability: "original-hire", attester: { onTerminal: first, idle: Effect.void },
      attest: { origin: "http://127.0.0.1", payTo: "not-authority", chainId: 5042002, identityRegistry: `0x${"e".repeat(40)}` } }
    const issued = runSessionJob(f.call, options)
    options.hireCapability = "late-hire"; options.attester = { onTerminal: late, idle: Effect.void }; options.attest.origin = "http://127.0.0.2"
    await Effect.runPromise(issued)
    expect(dispatch.mock.calls[0]?.[0].hireCapability).toBe("original-hire")
    expect(first).toHaveBeenCalledTimes(1); expect(late).not.toHaveBeenCalled()
    expect(first.mock.calls[0]).toEqual([expect.objectContaining({ origin: "http://127.0.0.1" })])
  })
})
