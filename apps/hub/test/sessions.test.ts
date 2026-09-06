import { describe, expect, it, vi } from "vitest"
import { Cause, Effect, Exit, FiberId, Ref } from "effect"
import { Job, JobOutcome, Receipt, Session, SessionCall, SessionConflict, SessionInvalid,
  SessionStorageUnavailable, loadChainConfig, type ChainConfig, type RailName } from "@arcade/core"
import { PaymentPayload, type Rail } from "@arcade/payments"
import { makeTestRail, makeTestState } from "../../../packages/payments/src/test-rail.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { makeRails } from "../src/rails.ts"
import { sessionRequestDigest, type SessionBinding, type SessionSnapshot, type SessionStore, type SessionTerminal } from "../src/session-ledger.ts"
import { makeSessions, newSessionId, sessionReceipt } from "../src/sessions.ts"

const chain = loadChainConfig("arc-testnet"), buyer = `0x${"a".repeat(40)}`, seller = `0x${"b".repeat(40)}`
const sid = (n = 1) => `ses_${n.toString(16).padStart(32, "0")}`, jid = (n = 1) => `job_${n.toString(16).padStart(20, "0")}`
const run = Effect.runPromise
const rail = (name: RailName): Rail => ({ name, challenge: vi.fn(() => Effect.die("rail must remain untouched")),
  verify: vi.fn(() => Effect.die("rail must remain untouched")), settle: vi.fn(() => Effect.die("rail must remain untouched")) })
const setup = async (override: Partial<SessionStore> = {}) => {
  const original = await run(StoreTag.pipe(Effect.provide(StoreLive))), store = { ...original, ...override }
  const test = rail("test"), gateway = rail("gateway"), rails = makeRails(test, [gateway])
  return { original, store, test, gateway, rails, service: makeSessions({ store, rails, chain, newId: () => sid() }) }
}
const open = (budgetAtomic = 100n) => ({ buyer, budgetAtomic, openedAtMs: 1 })
const pair = (n = 1, amountAtomic = 30n, kind: RailName = "test") => {
  const input = { question: "local facade fixture" }
  const binding: SessionBinding = { sessionId: sid(), jobId: jid(n), buyer, seller, skillId: "fixture", skillVersion: "1.0.0",
    rail: kind, network: chain.caip2, asset: chain.usdc.address, verifyingContract: kind === "gateway" ? chain.gateway!.wallet : chain.usdc.address,
    domainName: kind === "gateway" ? "GatewayWalletBatched" : chain.usdc.eip712Name, domainVersion: kind === "gateway" ? "1" : chain.usdc.eip712Version,
    payTo: seller, amountAtomic, nonce: `0x${n.toString(16).padStart(64, "0")}`, validAfter: 1n, validBefore: 604901n, requestDigest: sessionRequestDigest(input) }
  const job = Job.make({ id: jid(n), skillId: "fixture", buyer, seller, priceAtomic: amountAtomic, input,
    status: "queued", createdAtMs: 2, rootJobId: jid(n), hop: 0, ancestors: [] })
  return { binding, job }
}
const terminal = (n = 1, accepted = true, amountAtomic = 30n): SessionTerminal => {
  const p = pair(n, amountAtomic), ref = `0xtest${p.binding.nonce.slice(2, 12)}${n.toString(16).padStart(4, "0")}`
  const outcome = JobOutcome.make({ status: accepted ? "succeeded" : "refused", startedAtMs: 2, finishedAtMs: 3,
    ...(accepted ? { output: { ok: true } } : {}) })
  const job = Job.make({ ...p.job, status: outcome.status, outcome })
  const receipt = Receipt.make({ jobId: job.id, skillId: job.skillId, skillVersion: "1.0.0", buyer, seller, priceAtomic: amountAtomic,
    sellerAtomic: amountAtomic, feeAtomic: 0n, feeBps: 0, rail: "test", network: chain.caip2, latencyMs: 1, settled: accepted,
    reason: accepted ? "ok" : "session_released", createdAtMs: 3, sessionId: sid(), rootJobId: job.id, hop: 0, ancestors: [],
    ...(accepted ? { settleTx: ref, settleRefKind: "test" as const } : {}) })
  return accepted ? { kind: "settled", sessionId: sid(), jobId: job.id, job, receipt, settlement: { payer: buyer, amountAtomic, txHash: ref } }
    : { kind: "released", sessionId: sid(), jobId: job.id, job, receipt }
}
const settled = (n = 1, amount = 30n) => { const t = terminal(n, true, amount); if (t.kind !== "settled") throw Error("fixture"); return t }
const released = (n = 1, amount = 30n) => { const t = terminal(n, false, amount); if (t.kind !== "released") throw Error("fixture"); return t }
const fails = async <A, E>(effect: Effect.Effect<A, E>, tag: string) => expect(await run(Effect.either(effect))).toMatchObject({ _tag: "Left", left: { _tag: tag } })

describe("thin authoritative session service", () => {
  it("generates full canonical IDs without a truncated collision domain", () => {
    const ids = Array.from({ length: 32 }, newSessionId)
    expect(new Set(ids).size).toBe(32)
    for (const id of ids) expect(id).toMatch(/^ses_[0-9a-f]{32}$/)
  })
  it("normalizes buyer case, preserves exact amounts and never touches a rail at open/read/close", async () => {
    const f = await setup(), budget = 9_007_199_254_740_993n
    const s = await run(f.service.openSession({ ...open(budget), buyer: buyer.toUpperCase().replace("0X", "0x") }))
    expect(s).toMatchObject({ id: sid(), buyer, budgetAtomic: budget, network: chain.caip2, rail: "test" })
    expect(await run(f.service.inFlightAtomic(sid()))).toBe(0n)
    const r = await run(f.service.closeSession(sid(), 9))
    expect(r).toMatchObject({ closedAtMs: 9, spentAtomic: 0n, budgetAtomic: budget, calls: [], complete: true })
    for (const r of [f.test, f.gateway]) for (const fn of [r.challenge, r.verify, r.settle]) expect(fn).not.toHaveBeenCalled()
  })
  it("shares F5 authority across service objects and retains equal-price sibling holds", async () => {
    const f = await setup(), second = makeSessions({ store: f.store, rails: f.rails, chain })
    await run(f.service.openSession(open()))
    const p = pair(1, 60n), q = pair(2, 60n)
    const results = await Promise.all([run(Effect.either(f.service.reserve(p.binding, p.job))), run(Effect.either(second.reserve(q.binding, q.job)))])
    expect(results.filter(r => r._tag === "Right")).toHaveLength(1)
    expect(await run(second.inFlightAtomic(sid()))).toBe(60n)
    await run(f.service.release(released(1, 60n)))
    expect(await run(second.inFlightAtomic(sid()))).toBe(0n)
  })
  it("returns the original semantic retry after closure without new execution or time mutation", async () => {
    const f = await setup(); await run(f.service.openSession(open())); const p = pair(), q = pair(2)
    await run(f.service.reserve(p.binding, p.job)); await run(f.service.release(released())); await run(f.service.closeSession(sid(), 9))
    const retry = { ...p.binding, jobId: q.job.id }, fresh = Job.make({ ...p.job, id: q.job.id, rootJobId: q.job.id, createdAtMs: 999 })
    expect(await run(f.service.reserve(retry, fresh))).toEqual({ created: false, jobId: p.job.id })
    expect((await run(f.service.snapshot(sid()))).session.closedAtMs).toBe(9)
    await fails(f.service.closeSession(sid(), 10), "SessionClosed")
  })
  it("keeps settling/uncertain holds and never issues a second send permit", async () => {
    const f = await setup(); await run(f.service.openSession(open())); const p = pair(); await run(f.service.reserve(p.binding, p.job))
    expect(await run(f.service.beginSettlement(sid(), jid()))).toEqual({ claimed: true })
    await run(f.service.markUncertain(sid(), jid()))
    expect(await run(f.service.beginSettlement(sid(), jid()))).toEqual({ claimed: false })
    await fails(f.service.release(released()), "SessionConflict"); await fails(f.service.closeSession(sid(), 9), "SessionPending")
    expect(await run(f.service.inFlightAtomic(sid()))).toBe(30n)
    await run(f.service.commit(settled())); await run(f.service.commit(settled()))
    expect(await run(f.service.closeSession(sid(), 9))).toMatchObject({ spentAtomic: 30n, heldAtomic: 0n, settlementRefs: [settled().settlement.txHash] })
  })
  it("does not project a complete but open snapshot as a closed receipt", async () => {
    const f = await setup(); await run(f.service.openSession(open()))
    const snapshot = await run(f.service.snapshot(sid())); expect(snapshot.complete).toBe(true)
    expect(() => sessionReceipt(snapshot)).toThrow(SessionInvalid)
  })
  it("bounds open fields and refuses getters/extra fields before ID generation or store mutation", async () => {
    const f = await setup(), newId = vi.fn(() => sid()), write = vi.fn(f.store.openSession)
    const service = makeSessions({ store: { ...f.store, openSession: write }, rails: f.rails, chain, newId })
    expect(newId).not.toHaveBeenCalled(); let reads = 0
    const getter = { ...open(), get buyer() { reads++; return buyer } }
    for (const value of [getter, { ...open(), extra: "private" }, { ...open(), rail: "x".repeat(10000) },
      { ...open(), budgetAtomic: 0n }, { ...open(), openedAtMs: -1 }, { ...open(), buyer: "0x" + "0".repeat(40) }]) {
      await fails(service.openSession(value as Parameters<typeof service.openSession>[0]), "SessionInvalid")
    }
    expect(reads).toBe(0); expect(newId).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
    await fails(service.openSession({ ...open(), rail: "eip3009" }), "SessionRailUnavailable")
    expect(write).not.toHaveBeenCalled()
  })
  it("never opens an escrow session even if a future escrow rail is built", async () => {
    const f = await setup(), escrow = rail("erc8183"), write = vi.fn(f.store.openSession), newId = vi.fn(() => sid())
    const service = makeSessions({ store: { ...f.store, openSession: write }, rails: makeRails(escrow, [f.test]), chain, newId })
    await fails(service.openSession({ ...open(), rail: "erc8183" }), "SessionRailUnavailable")
    await fails(service.openSession(open()), "SessionRailUnavailable")
    expect(newId).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
    expect(escrow.challenge).not.toHaveBeenCalled(); expect(escrow.verify).not.toHaveBeenCalled(); expect(escrow.settle).not.toHaveBeenCalled()
  })
  it.each(["ses_abc", "ses_" + "A".repeat(32), "ses_" + "0".repeat(33)])("refuses injected noncanonical ID %s", async id => {
    const f = await setup(), write = vi.fn(f.store.openSession)
    const service = makeSessions({ store: { ...f.store, openSession: write }, rails: f.rails, chain, newId: () => id })
    await fails(service.openSession(open()), "SessionInvalid"); expect(write).not.toHaveBeenCalled()
  })
  it("uses explicit ready pinned configuration without observing a forged routing getter", async () => {
    const f = await setup(); let reads = 0
    for (const altered of [{ ...chain, status: "pending" }, { ...chain, chainId: 1 }, { ...chain, caip2: "eip155:1" },
      { ...chain, usdc: { ...chain.usdc, eip712Name: "foreign" } }, { ...chain, gateway: null },
      { ...chain, get id() { reads++; return chain.id } }, loadChainConfig("arc-mainnet")]) {
      expect(() => makeSessions({ store: f.store, rails: f.rails, chain: altered as ChainConfig })).toThrow(SessionInvalid)
    }
    expect(reads).toBe(0)
  })
  it("refuses routing getters in reserve/terminal input without invoking them or the Store", async () => {
    const f = await setup(), reserve = vi.fn(f.store.reserveSessionJob), finish = vi.fn(f.store.finishSessionJob)
    const service = makeSessions({ store: { ...f.store, reserveSessionJob: reserve, finishSessionJob: finish }, rails: f.rails, chain })
    const p = pair(); let reads = 0
    const binding = { ...p.binding, get rail() { reads++; return "test" as const } }
    await fails(service.reserve(binding, p.job), "SessionInvalid")
    const t = settled(), getter = { ...t, get kind() { reads++; return "settled" as const } }
    await fails(service.commit(getter), "SessionInvalid")
    expect(reads).toBe(0); expect(reserve).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled()
  })
  it("preserves terminal variant checks at runtime and delegates exact own-data only once", async () => {
    const f = await setup(), finish = vi.fn((_terminal: SessionTerminal) => Effect.void)
    const service = makeSessions({ store: { ...f.store, finishSessionJob: finish }, rails: f.rails, chain })
    const paid = settled(), unpaid = released()
    // Intentionally cross the static boundary to prove runtime misuse also refuses.
    // @ts-expect-error a release cannot be committed
    await fails(service.commit(unpaid), "SessionInvalid")
    // @ts-expect-error a settlement cannot be released
    await fails(service.release(paid), "SessionInvalid")
    await fails(service.commit({ ...paid, extra: "not admitted" } as typeof paid), "SessionInvalid")
    expect(finish).not.toHaveBeenCalled()
    await run(service.commit(paid)); expect(finish).toHaveBeenCalledTimes(1)
    expect(finish.mock.calls[0]?.[0]).toEqual(paid)
    expect(finish.mock.calls[0]?.[0]).not.toBe(paid)
    expect(finish.mock.calls[0]?.[0]?.kind).toBe("settled")
    if (finish.mock.calls[0]?.[0]?.kind === "settled") expect(finish.mock.calls[0][0].settlement.settlementKind).toBeUndefined()
  })
  it("guards real-rail volatile admission and begin but still records attempted outcome/uncertainty", async () => {
    const f = await setup(), p = pair(1, 30n, "gateway"), begin = vi.fn(f.store.beginSessionSettlement)
    const service = makeSessions({ store: { ...f.store, beginSessionSettlement: begin }, rails: f.rails, chain })
    await fails(service.openSession({ ...open(), rail: "gateway" }), "SessionStorageUnavailable")
    await run(f.original.openSession({ ...open(), id: sid(), rail: "gateway", network: chain.caip2 }))
    await fails(service.reserve(p.binding, p.job), "SessionStorageUnavailable")
    await run(f.original.reserveSessionJob(p.binding, p.job))
    await fails(service.beginSettlement(sid(), jid()), "SessionStorageUnavailable"); expect(begin).not.toHaveBeenCalled()
    await run(f.original.beginSessionSettlement(sid(), jid()))
    await run(service.markUncertain(sid(), jid()))
    const t = settled(), reference = "12345678-1234-4234-8234-000000000001"
    await run(service.commit({ ...t, receipt: Receipt.make({ ...t.receipt, rail: "gateway", settleTx: reference, settleRefKind: "gateway-transfer" }),
      settlement: { ...t.settlement, txHash: reference, settlementKind: "gateway-transfer" } }))
    expect(await run(service.closeSession(sid(), 9))).toMatchObject({ rail: "gateway", spentAtomic: 30n, settlementRefs: [reference] })
  })
  it("validates begin identity and IDs before its only atomic begin, without a second status read", async () => {
    const f = await setup(); await run(f.service.openSession(open())); const p = pair(); await run(f.service.reserve(p.binding, p.job))
    const good = await run(f.service.snapshot(sid())), begin = vi.fn(f.store.beginSessionSettlement)
    const read = vi.fn(() => Effect.succeed({ ...good, session: Session.make({ ...good.session, id: sid(2) }) }))
    const service = makeSessions({ store: { ...f.store, getSessionSnapshot: read, beginSessionSettlement: begin }, rails: f.rails, chain })
    await fails(service.beginSettlement(sid(), jid()), "SessionStorageUnavailable"); expect(begin).not.toHaveBeenCalled()
    await fails(service.beginSettlement(sid(), "job_bad"), "SessionInvalid"); expect(read).toHaveBeenCalledTimes(1)
    read.mockImplementation(() => Effect.succeed(good))
    expect(await run(service.beginSettlement(sid(), jid()))).toEqual({ claimed: true })
    expect(begin).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(2)
  })
  it("preserves original interrupt causes and maps non-interrupt defects without compensation", async () => {
    const f = await setup(), release = vi.fn(f.store.finishSessionJob), original = Cause.parallel(Cause.fail(new SessionInvalid()), Cause.interrupt(FiberId.runtime(99, 1)))
    const fail = vi.fn(() => Effect.failCause(original))
    const service = makeSessions({ store: { ...f.store, markSessionUncertain: fail, finishSessionJob: release }, rails: f.rails, chain })
    const exit = await Effect.runPromiseExit(service.markUncertain(sid(), jid()))
    expect(Exit.isFailure(exit) && exit.cause).toEqual(original)
    expect(fail).toHaveBeenCalledTimes(1); expect(release).not.toHaveBeenCalled()
    const error = new SessionConflict()
    for (const [behavior, expected] of [
      [() => { throw Error("private SQL and authorization") }, SessionStorageUnavailable],
      [() => Effect.die("private provider"), SessionStorageUnavailable],
      [() => Effect.fail(error), SessionConflict]
    ] as const) {
      const method = vi.fn(behavior), s = makeSessions({ store: { ...f.store, markSessionUncertain: method }, rails: f.rails, chain })
      const result = await run(Effect.either(s.markUncertain(sid(), jid())))
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(expected)
        if (expected === SessionConflict) expect(result.left).toBe(error)
        expect(JSON.stringify(result.left)).not.toMatch(/private|SQL|authorization/)
      }
      expect(method).toHaveBeenCalledTimes(1)
    }
  })
  it("projects only fresh immutable whitelisted fields without private Store data", async () => {
    const f = await setup(); await run(f.service.openSession(open())); const p = pair(); await run(f.service.reserve(p.binding, p.job))
    const good = await run(f.service.snapshot(sid()))
    const raw = { ...good, token: "private-capability", session: { ...good.session, nonce: "private-nonce" },
      calls: good.calls.map(c => ({ ...c, input: "private-input" })) }
    const s = makeSessions({ store: { ...f.store, getSessionSnapshot: () => Effect.succeed(raw) }, rails: f.rails, chain })
    const a = await run(s.snapshot(sid())), b = await run(s.snapshot(sid()))
    expect(a).not.toBe(b); expect(a.calls).not.toBe(b.calls); expect(a.session).not.toBe(raw.session)
    expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(a.calls)).toBe(true); expect(Object.isFrozen(a.calls[0])).toBe(true)
    expect(JSON.stringify(a, (_k, v: unknown) => typeof v === "bigint" ? v.toString() : v)).not.toMatch(/private|token|nonce|input/)
    expect(() => Object.assign(a.session, { spentAtomic: 1n })).toThrow()
    let reads = 0
    const getter = { ...good, get calls() { reads++; return good.calls } }
    const bad = makeSessions({ store: { ...f.store, getSessionSnapshot: () => Effect.succeed(getter) }, rails: f.rails, chain })
    await fails(bad.snapshot(sid()), "SessionStorageUnavailable"); expect(reads).toBe(0)
  })
  it("projects only the committed close result and preserves duplicate-close errors", async () => {
    const f = await setup(); await run(f.service.openSession(open()))
    const read = vi.fn(() => Effect.die("must not reread close")), close = vi.fn(f.store.closeSession)
    const service = makeSessions({ store: { ...f.store, getSessionSnapshot: read, closeSession: close }, rails: f.rails, chain })
    expect((await run(service.closeSession(sid(), 9))).closedAtMs).toBe(9)
    await fails(service.closeSession(sid(), 10), "SessionClosed")
    expect(close).toHaveBeenCalledTimes(2); expect(read).not.toHaveBeenCalled()
  })
  it("refuses inconsistent snapshots without deduplication or synthetic accounting repairs", async () => {
    const f = await setup(); await run(f.service.openSession(open())); const p = pair(); await run(f.service.reserve(p.binding, p.job))
    await run(f.service.beginSettlement(sid(), jid())); await run(f.service.commit(settled())); await run(f.service.closeSession(sid(), 9))
    const good = await run(f.service.snapshot(sid())), call = good.calls[0]!
    for (const altered of [{ ...good, remainingAtomic: 100n }, { ...good, heldAtomic: 1n }, { ...good, complete: false },
      { ...good, calls: [call, SessionCall.make({ ...call, jobId: jid(2) })], session: Session.make({ ...good.session, spentAtomic: 60n }), remainingAtomic: 40n },
      { ...good, calls: [SessionCall.make({ ...call, settleRef: "0x" + "a".repeat(64), settleRefKind: "onchain" })] }]) {
      expect(() => sessionReceipt(altered)).toThrow(SessionInvalid)
    }
  })
  it.each(["foreign-network", "zero-priced-call"])("closed projection refuses impossible %s evidence", async variant => {
    const f = await setup(); await run(f.service.openSession(open())); const p = pair(); await run(f.service.reserve(p.binding, p.job))
    await run(f.service.beginSettlement(sid(), jid())); await run(f.service.commit(settled())); await run(f.service.closeSession(sid(), 9))
    const good = await run(f.service.snapshot(sid()))
    const altered = variant === "foreign-network" ? { ...good, session: Session.make({ ...good.session, network: "eip155:1" }) }
      : { ...good, session: Session.make({ ...good.session, spentAtomic: 0n }), remainingAtomic: 100n,
        calls: [SessionCall.make({ ...good.calls[0]!, priceAtomic: 0n })] }
    expect(() => sessionReceipt(altered)).toThrow(SessionInvalid)
  })
  it("preserves the actual TestRail's omitted kind through commit and closed artifact", async () => {
    const f = await setup(), state = await run(Ref.make(makeTestState({ [buyer]: 100n }))), actual = makeTestRail(state)
    const s = makeSessions({ store: f.store, rails: makeRails(actual, []), chain, newId: () => sid() })
    const requirements = await run(actual.challenge({ priceAtomic: 30n, payTo: seller, resource: "http://127.0.0.1/never-requested" }))
    const now = BigInt(Math.floor(Date.now() / 1000)), p = pair()
    const auth = { from: buyer, to: seller, value: "30", validAfter: String(now - 1n), validBefore: String(now + 600n), nonce: p.binding.nonce }
    const verified = await run(actual.verify(PaymentPayload.make({ x402Version: 2, accepted: requirements, payload: { authorization: auth, signature: "0x0000" } }), requirements))
    await run(s.openSession(open())); await run(s.reserve({ ...p.binding, validAfter: now - 1n, validBefore: now + 600n }, p.job))
    await run(s.beginSettlement(sid(), jid())); const result = await run(actual.settle(verified)), t = settled()
    expect(result.settlementKind).toBeUndefined()
    await run(s.commit({ ...t, receipt: Receipt.make({ ...t.receipt, settleTx: result.txHash }), settlement: result }))
    expect(await run(s.closeSession(sid(), 9))).toMatchObject({ spentAtomic: 30n, calls: [{ settleRefKind: "test", settleRef: result.txHash }] })
    expect((await run(Ref.get(state))).balances.get(seller)).toBe(30n)
  })
  it("duplicate completion cannot consume an equal-priced sibling hold through two facades", async () => {
    const f = await setup(), other = makeSessions({ store: f.store, rails: f.rails, chain })
    await run(f.service.openSession(open()))
    for (const n of [1, 2]) { const p = pair(n); await run(f.service.reserve(p.binding, p.job)); await run(other.beginSettlement(sid(), jid(n))) }
    await run(f.service.commit(settled(1))); await run(other.commit(settled(1)))
    expect(await run(other.inFlightAtomic(sid()))).toBe(30n)
    expect((await run(other.snapshot(sid()))).session.spentAtomic).toBe(30n)
    await run(other.commit(settled(2)))
    expect(await run(f.service.closeSession(sid(), 9))).toMatchObject({ spentAtomic: 60n, heldAtomic: 0n, settledCalls: 2 })
  })
})

describe("F6 session-local identifier bounds", () => {
  it.each(["begin", "uncertain"] as const)("accepts 128 characters and refuses 129 before %s Store IO", async method => {
    const f = await setup(); await run(f.service.openSession(open()))
    const p = pair(), valid = "job_" + "Aa0".repeat(43).slice(0, 128), invalid = valid + "a"
    const job = Job.make({ ...p.job, id: valid, rootJobId: valid })
    await run(f.original.reserveSessionJob({ ...p.binding, jobId: valid }, job))
    if (method === "uncertain") await run(f.original.beginSessionSettlement(sid(), valid))
    const read = vi.fn(f.store.getSessionSnapshot), begin = vi.fn(f.store.beginSessionSettlement), uncertain = vi.fn(f.store.markSessionUncertain)
    const service = makeSessions({ store: { ...f.store, getSessionSnapshot: read, beginSessionSettlement: begin, markSessionUncertain: uncertain }, rails: f.rails, chain })
    await fails(method === "begin" ? service.beginSettlement(sid(), invalid) : service.markUncertain(sid(), invalid), "SessionInvalid")
    expect(read).not.toHaveBeenCalled(); expect(begin).not.toHaveBeenCalled(); expect(uncertain).not.toHaveBeenCalled()
    if (method === "begin") expect(await run(service.beginSettlement(sid(), valid))).toEqual({ claimed: true })
    else await run(service.markUncertain(sid(), valid))
    expect(read).toHaveBeenCalledTimes(method === "begin" ? 1 : 0)
    expect(begin).toHaveBeenCalledTimes(method === "begin" ? 1 : 0)
    expect(uncertain).toHaveBeenCalledTimes(method === "uncertain" ? 1 : 0)
  })
  const closed = (jobId: string, skillId = "fixture"): SessionSnapshot => ({
    session: Session.make({ ...open(), id: sid(), spentAtomic: 0n, rail: "test", network: chain.caip2, closedAtMs: 4 }),
    heldAtomic: 0n, remainingAtomic: 100n, complete: true,
    calls: [SessionCall.make({ jobId, skillId, priceAtomic: 1n, state: "released", settled: false, createdAtMs: 2 })]
  })
  it.each([128, 129])("checks the %i-character returned call ID in pure closed projection", length => {
    const id = "job_" + "a".repeat(length), snapshot = closed(id)
    if (length === 128) expect(sessionReceipt(snapshot).calls[0]?.jobId).toBe(id)
    else expect(() => sessionReceipt(snapshot)).toThrow(SessionInvalid)
  })
  it.each([128, 129])("validates a %i-character Store reservation result without retrying", async length => {
    const f = await setup(), id = "job_" + "A".repeat(length), method = vi.fn((_binding: SessionBinding, _job: Job) => Effect.succeed({ created: false, jobId: id }))
    const service = makeSessions({ store: { ...f.store, reserveSessionJob: method }, rails: f.rails, chain })
    const p = pair()
    if (length === 128) expect(await run(service.reserve(p.binding, p.job))).toEqual({ created: false, jobId: id })
    else await fails(service.reserve(p.binding, p.job), "SessionStorageUnavailable")
    expect(method).toHaveBeenCalledTimes(1)
  })
  it("refuses a projected skill label impossible under the session binding", () => {
    expect(() => sessionReceipt(closed(jid(), "invalid/skill"))).toThrow(SessionInvalid)
    expect(sessionReceipt(closed(jid(), "a".repeat(128))).calls[0]?.skillId).toHaveLength(128)
  })
})
