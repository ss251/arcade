import { describe, expect, it, vi } from "vitest"
import { Effect, Ref } from "effect"
import { Job, JobOutcome, Receipt, loadChainConfig } from "@arcade/core"
import { makeStore, sessionStoreApi, type StoreState } from "../src/store.ts"
import { sessionJson, sessionRequestDigest, type SessionBinding, type SessionTerminal } from "../src/session-ledger.ts"

const cfg = loadChainConfig("arc-testnet"), buyer = `0x${"1".repeat(40)}`, seller = `0x${"2".repeat(40)}`
const sid = (n = 1) => `ses_${n.toString(16).padStart(32, "0")}`
const jid = (n = 1) => `job_${n.toString(16).padStart(20, "0")}`
const run = Effect.runPromise
const emptyState = (): StoreState => ({ listings: new Map(), runners: new Map(), jobs: new Map(), receipts: [],
  ratings: [], trees: new Map(), payTests: new Map(), erc8004Docs: new Map(), sessions: new Map(), sessionCalls: new Map() })
const admission = (n = 1, session = 1) => {
  const input = { owned: "receipt fixture" }, amount = 30n
  const binding: SessionBinding = { sessionId: sid(session), jobId: jid(n), buyer, seller, skillId: "fixture", skillVersion: "1.0.0",
    rail: "test", network: cfg.caip2, asset: cfg.usdc.address, verifyingContract: cfg.usdc.address,
    domainName: cfg.usdc.eip712Name, domainVersion: cfg.usdc.eip712Version, payTo: seller, amountAtomic: amount,
    nonce: `0x${n.toString(16).padStart(64, "0")}`, validAfter: 1n, validBefore: 601n, requestDigest: sessionRequestDigest(input) }
  const job = Job.make({ id: jid(n), skillId: "fixture", seller, buyer, priceAtomic: amount, input,
    status: "queued", createdAtMs: 2, rootJobId: jid(n), hop: 0, ancestors: [] })
  return { binding, job }
}
const terminal = (n = 1, session = 1, settled = true): SessionTerminal => {
  const { job } = admission(n, session), reference = `0xtest${n.toString(16).padStart(14, "0")}`
  const outcome = JobOutcome.make({ status: settled ? "succeeded" : "refused", startedAtMs: 2, finishedAtMs: 3,
    output: { retained: "actual terminal evidence" } })
  const receipt = Receipt.make({ jobId: job.id, skillId: "fixture", skillVersion: "1.0.0", buyer, seller,
    priceAtomic: 30n, sellerAtomic: 30n, feeAtomic: 0n, feeBps: 0, rail: "test", network: cfg.caip2,
    latencyMs: 1, settled, reason: settled ? "ok" : "session_released", createdAtMs: 3,
    rootJobId: job.id, hop: 0, ancestors: [], sessionId: sid(session), authorizationNonce: admission(n, session).binding.nonce,
    ...(settled ? { settleTx: reference, settleRefKind: "test" as const } : {}) })
  const base = { sessionId: sid(session), jobId: job.id, job: Job.make({ ...job, status: outcome.status, outcome }), receipt }
  return settled ? { ...base, kind: "settled", settlement: { payer: buyer, amountAtomic: 30n, txHash: reference } }
    : { ...base, kind: "released" }
}
const fixture = async () => {
  const ref = await run(Ref.make(emptyState())), store = makeStore(ref)
  for (const n of [1, 2]) await run(store.openSession({ id: sid(n), buyer, budgetAtomic: 100n, rail: "test", network: cfg.caip2, openedAtMs: 1 }))
  const reserve = async (n = 1, session = 1) => { const a = admission(n, session); await run(store.reserveSessionJob(a.binding, a.job)) }
  const finish = async (n = 1, session = 1, settled = true) => {
    if (settled) await run(store.beginSessionSettlement(sid(session), jid(n)))
    const t = terminal(n, session, settled); await run(store.finishSessionJob(t)); return t.receipt
  }
  return { ref, store, reserve, finish }
}
const rejected = async <A, E>(effect: Effect.Effect<A, E>, tag: string) => {
  const result = await run(Effect.either(effect)); expect(result).toMatchObject({ _tag: "Left", left: { _tag: tag } }); return result
}

describe("selected persisted session receipt", () => {
  it.each(["reserved", "settling", "uncertain"] as const)("terminal bundle remains absent for %s", async state => {
    const f = await fixture(); await f.reserve()
    if (state !== "reserved") await run(f.store.beginSessionSettlement(sid(), jid()))
    if (state === "uncertain") await run(f.store.markSessionUncertain(sid(), jid()))
    expect(await run(f.store.getSessionTerminal(sid(), jid()))).toBeUndefined()
  })
  it.each([true, false])("returns a defensive Job/Receipt pair from one validated selected read, settled=%s", async settled => {
    const f = await fixture(); await f.reserve(); await f.finish(1, 1, settled)
    const state = await run(Ref.get(f.ref)), read = vi.fn(() => state), mutate = vi.fn()
    const selected = sessionStoreApi(read, mutate, "volatile")
    const first = await run(selected.getSessionTerminal(sid(), jid()))
    const expected = terminal(1, 1, settled)
    expect(first).toEqual({ job: expected.job, receipt: expected.receipt })
    expect(read).toHaveBeenCalledExactlyOnceWith(sid()); expect(mutate).not.toHaveBeenCalled()
    Object.assign(first!.job.outcome!.output as object, { retained: "caller mutation" })
    Object.assign(first!.receipt, { reason: "caller mutation" })
    expect(await run(selected.getSessionTerminal(sid(), jid()))).toEqual({ job: expected.job, receipt: expected.receipt })
  })
  it("validates bundle identifiers before IO and requires actual selected membership", async () => {
    const read = vi.fn(() => { throw Error("PRIVATE_READER") }), mutate = vi.fn()
    const selected = sessionStoreApi(read, mutate, "volatile")
    await rejected(selected.getSessionTerminal(`${sid()}\n`, jid()), "SessionInvalid")
    await rejected(selected.getSessionTerminal(sid(), `job_${"a".repeat(129)}`), "SessionInvalid")
    expect(read).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled()
    const f = await fixture(); await f.reserve(1, 2); await f.finish(1, 2)
    await rejected(f.store.getSessionTerminal(sid(), jid()), "SessionNotFound")
  })
  it("keeps the validated pair stable after actual memory mutation and rejects the next corrupt read", async () => {
    const f = await fixture(); await f.reserve(); await f.finish()
    const seen = await run(f.store.getSessionTerminal(sid(), jid())), expected = terminal()
    await run(Ref.update(f.ref, state => ({ ...state, jobs: new Map(state.jobs).set(jid(), Job.make({ ...expected.job,
      outcome: JobOutcome.make({ ...expected.job.outcome!, output: { private: "POST_READ_MUTATION" } }) })) })))
    expect(seen).toEqual({ job: expected.job, receipt: expected.receipt })
    const failure = await rejected(f.store.getSessionTerminal(sid(), jid()), "SessionStorageUnavailable")
    expect(JSON.stringify(failure)).not.toContain("POST_READ_MUTATION")
  })
  it.each(["reserved", "settling", "uncertain"] as const)("returns no fabricated receipt for %s", async state => {
    const f = await fixture(); await f.reserve()
    if (state !== "reserved") await run(f.store.beginSessionSettlement(sid(), jid()))
    if (state === "uncertain") await run(f.store.markSessionUncertain(sid(), jid()))
    const before = await run(Ref.get(f.ref))
    expect(await run(f.store.getSessionReceipt(sid(), jid()))).toBeUndefined()
    expect(await run(Ref.get(f.ref))).toBe(before)
  })
  it.each([true, false])("returns the actual persisted terminal receipt, settled=%s", async settled => {
    const f = await fixture(); await f.reserve(); const expected = await f.finish(1, 1, settled)
    const first = await run(f.store.getSessionReceipt(sid(), jid()))
    expect(first).toEqual(expected); expect(first).not.toBe(expected)
    expect(first?.authorizationNonce).toBe(admission().binding.nonce)
    const second = await run(f.store.getSessionReceipt(sid(), jid()))
    expect(second).toEqual(first); expect(second).not.toBe(first); expect(second?.ancestors).not.toBe(first?.ancestors)
    Object.assign(first!, { reason: "caller-mutated" }); (first!.ancestors as string[]).push("private-mutation")
    expect(await run(f.store.getSessionReceipt(sid(), jid()))).toEqual(expected)
  })
  it("requires selected session membership, not a global receipt match", async () => {
    const f = await fixture(); await f.reserve(1, 2); await f.finish(1, 2)
    for (const [session, job] of [[sid(), jid()], [sid(), jid(8)], [sid(9), jid()]]) {
      await rejected(f.store.getSessionReceipt(session!, job!), "SessionNotFound")
    }
    expect(await run(f.store.getSessionReceipt(sid(2), jid()))).toEqual(terminal(1, 2).receipt)
  })
  it("validates scalar canonical IDs before invoking the read callback", async () => {
    const read = vi.fn(() => { throw new Error("PRIVATE_READ_DIAGNOSTIC") }), mutate = vi.fn()
    const store = sessionStoreApi(read, mutate, "volatile")
    const coercion = vi.fn(() => sid()), object = { toString: coercion }
    for (const bad of ["", "ses_1", `${sid()}\n`, sid().toUpperCase(), null, 1, object]) {
      await rejected(store.getSessionReceipt(bad as string, jid()), "SessionInvalid")
    }
    for (const bad of ["", "job_abc", `job_${"a".repeat(129)}`, `${jid()}\n`, `${jid()}\r`, `${jid()}\u2028`, `job_${"é".repeat(16)}`, null, object]) {
      await rejected(store.getSessionReceipt(sid(), bad as string), "SessionInvalid")
    }
    expect(read).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled(); expect(coercion).not.toHaveBeenCalled()
  })
  it("accepts exact 16/128-character ASCII job suffix boundaries with one selected read", async () => {
    const f = await fixture()
    for (const length of [16, 128]) {
      const a = admission(length), jobId = `job_${"A".repeat(length)}`
      await run(f.store.reserveSessionJob({ ...a.binding, jobId }, Job.make({ ...a.job, id: jobId, rootJobId: jobId })))
      const state = await run(Ref.get(f.ref)), read = vi.fn(() => state), mutate = vi.fn()
      const selected = sessionStoreApi(read, mutate, "volatile")
      expect(await run(selected.getSessionReceipt(sid(), jobId))).toBeUndefined()
      expect(read).toHaveBeenCalledExactlyOnceWith(sid()); expect(mutate).not.toHaveBeenCalled()
    }
  })
  it.each(["missing-receipt", "duplicate-receipt", "foreign-receipt", "changed-receipt", "missing-job", "changed-output"])("refuses %s as unavailable without repairing state", async corruption => {
    const f = await fixture(); await f.reserve(); await f.finish()
    await run(Ref.update(f.ref, state => {
      const jobs = new Map(state.jobs), receipt = state.receipts[0]!
      if (corruption === "missing-job") jobs.delete(jid())
      if (corruption === "changed-output") { const job = jobs.get(jid())!; jobs.set(jid(), Job.make({ ...job,
        outcome: JobOutcome.make({ ...job.outcome!, output: { private: "CHANGED_PRIVATE_OUTPUT" } }) })) }
      const receipts = corruption === "missing-receipt" ? [] : corruption === "duplicate-receipt" ? [receipt, receipt]
        : corruption === "foreign-receipt" ? [Receipt.make({ ...receipt, sessionId: sid(2) })]
        : corruption === "changed-receipt" ? [Receipt.make({ ...receipt, sellerAtomic: 29n, feeAtomic: 1n })] : state.receipts
      return { ...state, jobs, receipts }
    }))
    const before = await run(Ref.get(f.ref)), result = await rejected(f.store.getSessionReceipt(sid(), jid()), "SessionStorageUnavailable")
    expect(JSON.stringify(result)).not.toContain("CHANGED_PRIVATE_OUTPUT")
    expect(await run(Ref.get(f.ref))).toBe(before)
  })
  it("refuses an unexpected receipt while the selected call remains pending", async () => {
    const f = await fixture(); await f.reserve()
    await run(Ref.update(f.ref, state => ({ ...state, receipts: [terminal().receipt] })))
    await rejected(f.store.getSessionReceipt(sid(), jid()), "SessionStorageUnavailable")
  })
  it("does not invoke a stored receipt accessor or reflect reader diagnostics", async () => {
    const f = await fixture(); await f.reserve(); await f.finish()
    const getter = vi.fn(() => { throw new Error("PRIVATE_RECEIPT_GETTER") })
    await run(Ref.update(f.ref, state => ({ ...state, receipts: [Object.defineProperty({ ...state.receipts[0]! }, "reason", { get: getter, enumerable: true })] })))
    await rejected(f.store.getSessionReceipt(sid(), jid()), "SessionStorageUnavailable"); expect(getter).not.toHaveBeenCalled()
    for (const backend of ["volatile", "durable"] as const) {
      const api = sessionStoreApi(() => { throw new Error("PRIVATE_READ_DIAGNOSTIC") }, vi.fn(), backend)
      const result = await rejected(api.getSessionReceipt(sid(), jid()), "SessionStorageUnavailable")
      expect(JSON.stringify(result)).not.toContain("PRIVATE_READ_DIAGNOSTIC")
    }
  })
  it("retains memory whole-state validation instead of claiming selected physical storage", async () => {
    const f = await fixture(); await f.reserve(); await f.finish(); await f.reserve(2, 2)
    await run(Ref.update(f.ref, state => { const jobs = new Map(state.jobs); jobs.delete(jid(2)); return { ...state, jobs } }))
    await rejected(f.store.getSessionReceipt(sid(), jid()), "SessionStorageUnavailable")
  })
  it("a reused read Effect sees fresh terminal evidence and remains read-only after close", async () => {
    const f = await fixture(); await f.reserve(); const read = f.store.getSessionReceipt(sid(), jid())
    expect(await run(read)).toBeUndefined(); const expected = await f.finish()
    expect(await run(read)).toEqual(expected); await run(f.store.closeSession(sid(), 4))
    const before = await run(Ref.get(f.ref)), bytes = sessionJson(expected)
    expect(sessionJson(await run(read))).toBe(bytes); expect(await run(Ref.get(f.ref))).toBe(before)
  })
})
