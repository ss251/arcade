import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Ref } from "effect"
import { Job, JobOutcome, Receipt, Session, loadChainConfig } from "@arcade/core"
import { PaymentPayload } from "@arcade/payments"
import { makeTestRail, makeTestState } from "../../../packages/payments/src/test-rail.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { sessionJson, sessionRequestDigest, type NewSession, type SessionBinding, type SessionTerminal } from "../src/session-ledger.ts"

const cfg = loadChainConfig("arc-testnet"), buyer = `0x${"1".repeat(40)}`, seller = `0x${"2".repeat(40)}`
const id = (n: number) => `ses_${n.toString(16).padStart(32, "0")}`
const jid = (n: number) => `job_${n.toString(16).padStart(20, "0")}`
const makeSession = (n = 1, budgetAtomic = 100n): NewSession => ({ id: id(n), buyer, budgetAtomic, rail: "gateway", network: cfg.caip2, openedAtMs: 1 })
const admission = (n = 1, amountAtomic = 60n, session = 1) => {
  const input = { question: "owned offline fixture" }
  const binding: SessionBinding = { sessionId: id(session), jobId: jid(n), buyer, seller, skillId: "fixture", skillVersion: "1.0.0",
    rail: "gateway", network: cfg.caip2, asset: cfg.usdc.address, verifyingContract: cfg.gateway!.wallet,
    domainName: "GatewayWalletBatched", domainVersion: "1", payTo: seller, amountAtomic,
    nonce: `0x${n.toString(16).padStart(64, "0")}`, validAfter: 1n, validBefore: 604901n,
    requestDigest: sessionRequestDigest(input) }
  const job = Job.make({ id: binding.jobId, skillId: binding.skillId, seller, buyer, priceAtomic: amountAtomic,
    input, status: "queued", createdAtMs: 2, rootJobId: binding.jobId, hop: 0, ancestors: [] })
  return { binding, job }
}
const terminal = (n = 1, amountAtomic = 60n, session = 1, accepted = true): SessionTerminal => {
  const a = admission(n, amountAtomic, session), ref = `12345678-1234-4234-8234-${n.toString(16).padStart(12, "0")}`
  const outcome = JobOutcome.make({ status: accepted ? "succeeded" : "refused", startedAtMs: 2, finishedAtMs: 3,
    ...(accepted ? { output: { ok: true } } : {}) })
  const job = Job.make({ ...a.job, status: outcome.status, outcome })
  const receipt = Receipt.make({ jobId: job.id, skillId: job.skillId, skillVersion: "1.0.0", buyer, seller,
    priceAtomic: amountAtomic, sellerAtomic: amountAtomic, feeAtomic: 0n, feeBps: 0,
    rail: "gateway", network: cfg.caip2, latencyMs: 1, settled: accepted, reason: accepted ? "ok" : "session_released",
    createdAtMs: 3, rootJobId: job.id, hop: 0, ancestors: [], sessionId: id(session),
    ...(accepted ? { settleTx: ref, settleRefKind: "gateway-transfer" as const } : {}) })
  return accepted ? { kind: "settled", sessionId: id(session), jobId: job.id, job, receipt,
    settlement: { payer: buyer, amountAtomic, txHash: ref, settlementKind: "gateway-transfer" } }
    : { kind: "released", sessionId: id(session), jobId: job.id, job, receipt }
}
const owned: Array<{ path: string; closes: Array<() => void> }> = []
const disk = () => {
  const directory = mkdtempSync(join(tmpdir(), "arcade-session-store-")), path = join(directory, "ledger.sqlite")
  const closes: Array<() => void> = []; owned.push({ path: directory, closes })
  const open = () => { const s = openSqliteStore(path, "owned_fixture"); closes.push(() => s.close()); return s }
  const inspect = () => { const db = new Database(path); closes.push(() => db.close()); return db }
  return { path, open, inspect }
}
afterEach(() => { for (const item of owned.splice(0)) { for (const close of item.closes.reverse()) { try { close() } catch { /* already closed by restart case */ } } rmSync(item.path, { recursive: true }) } })
const run = Effect.runPromise
const rejected = async <A, E>(effect: Effect.Effect<A, E>, tag: string) => {
  const result = await run(Effect.either(effect)); expect(result).toMatchObject({ _tag: "Left", left: { _tag: tag } })
  return result
}
const bounded = async <T>(operation: Promise<T>, ms = 5000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([operation, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(Error("owned fixture deadline")), ms) })]) }
  finally { if (timer !== undefined) clearTimeout(timer) }
}

describe("durable session accounting through the Store API", () => {
  test.each(["memory", "disk"])("actual RailTest challenge/verify/settle completes %s accounting with honest test evidence", async backend => {
    const f = backend === "disk" ? disk() : undefined, opened = f?.open()
    const s = opened?.store ?? await run(StoreTag.pipe(Effect.provide(StoreLive)))
    const state = await run(Ref.make(makeTestState({ [buyer]: 100n }))), rail = makeTestRail(state)
    const requirements = await run(rail.challenge({ payTo: seller, priceAtomic: 30n, resource: "http://127.0.0.1/owned-no-network" }))
    const now = BigInt(Math.floor(Date.now() / 1000)), x = admission(1, 30n)
    const payload = PaymentPayload.make({ x402Version: 2, accepted: requirements,
      payload: { authorization: { from: buyer, to: seller, value: "30", validAfter: String(now - 1n), validBefore: String(now + 600n), nonce: x.binding.nonce }, signature: "0x0000" } })
    const verified = await run(rail.verify(payload, requirements))
    const binding: SessionBinding = { ...x.binding, rail: "test", network: verified.network, asset: requirements.asset,
      verifyingContract: cfg.usdc.address, domainName: cfg.usdc.eip712Name, domainVersion: cfg.usdc.eip712Version,
      validAfter: now - 1n, validBefore: now + 600n }
    await run(s.openSession({ ...makeSession(), rail: "test" })); await run(s.reserveSessionJob(binding, x.job))
    expect(await run(s.beginSessionSettlement(id(1), jid(1)))).toEqual({ claimed: true })
    const settlement = await run(rail.settle(verified))
    expect(settlement.txHash).toBe(`0xtest${x.binding.nonce.slice(2, 12)}0000`)
    expect(settlement.settlementKind).toBeUndefined()
    const old = terminal(1, 30n)
    const t: SessionTerminal = { kind: "settled", sessionId: id(1), jobId: jid(1), job: old.job, settlement,
      receipt: Receipt.make({ ...old.receipt, rail: "test", settleTx: settlement.txHash, settleRefKind: "test" }) }
    await run(s.finishSessionJob(t))
    const balances = await run(Ref.get(state)); expect(balances.balances.get(buyer)).toBe(70n); expect(balances.balances.get(seller)).toBe(30n)
    opened?.close(); const later = f?.open().store ?? s
    expect((await run(later.getSessionSnapshot(id(1))))).toMatchObject({ heldAtomic: 0n, session: { spentAtomic: 30n },
      calls: [{ state: "settled", settleRef: settlement.txHash, settleRefKind: "test" }] })
    expect((await run(later.allReceipts))[0]).toMatchObject({ settleTx: settlement.txHash, settleRefKind: "test" })
    expect((await run(later.statsFor("fixture"))).settled).toBe(1)
    await run(later.finishSessionJob(t)); expect((await run(later.getSessionSnapshot(id(1))))?.session.spentAtomic).toBe(30n)
    expect(await run(later.beginSessionSettlement(id(1), jid(1)))).toEqual({ claimed: false })
  })
  test.each(["reserved", "settling", "simulated-acceptance", "settled"])("owned process death after %s preserves only the observed local checkpoint", async checkpoint => {
    const f = disk()
    const child = Bun.spawn([process.execPath, "--no-env-file", new URL("./fixtures/session-store-child.ts", import.meta.url).pathname, f.path, checkpoint],
      { env: {}, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const reader = child.stdout.getReader()
    try {
      const observed = await bounded(reader.read())
      expect(new TextDecoder().decode(observed.value)).toBe(`checkpoint:${checkpoint}\n`)
      child.kill("SIGKILL"); await bounded(child.exited)
      const reopened = f.open(); expect(reopened.reaped).toBe(0)
      const snapshot = await run(reopened.store.getSessionSnapshot(id(1)))
      expect(snapshot).toMatchObject({ heldAtomic: checkpoint === "settled" ? 0n : 60n,
        session: { spentAtomic: checkpoint === "settled" ? 60n : 0n }, calls: [{ state: checkpoint === "reserved" ? "reserved" : checkpoint === "settled" ? "settled" : "settling" }] })
      expect((await run(reopened.store.allReceipts)).length).toBe(checkpoint === "settled" ? 1 : 0)
      expect(await run(reopened.store.beginSessionSettlement(id(1), jid(1)))).toEqual({ claimed: checkpoint === "reserved" })
      expect((await run(reopened.store.getJob(jid(1))))?.status).toBe(checkpoint === "settled" ? "succeeded" : "queued")
    } finally {
      if (child.exitCode === null) { child.kill("SIGKILL"); await bounded(child.exited) }
      await reader.cancel(); reader.releaseLock()
      expect(await bounded(new Response(child.stderr).text())).toBe("")
    }
  }, 10000)
  test("checkpoint fixture import is inert", async () => {
    const f = disk()
    await import("./fixtures/session-store-child.ts")
    expect(await Bun.file(f.path).exists()).toBe(false)
  })
  test("memory and SQLite report their actual backend and preserve exact >2^53 budget on restart", async () => {
    const memory = await run(StoreTag.pipe(Effect.provide(StoreLive))), f = disk(), a = f.open()
    expect(memory.sessionStorage).toBe("volatile"); expect(a.store.sessionStorage).toBe("durable")
    const value = 9_007_199_254_740_993n
    await run(a.store.openSession(makeSession(1, value))); a.close()
    const b = f.open(); expect((await run(b.store.getSessionSnapshot(id(1))))?.remainingAtomic).toBe(value)
    expect(await run(b.store.getSession(id(2)))).toBeUndefined()
  })
  test("two already-open handles admit only one 60-of-100 reservation and see the same queued job", async () => {
    const f = disk(), a = f.open().store, b = f.open().store
    await run(a.openSession(makeSession()))
    const x = admission(), y = admission(2)
    const results = await Promise.all([run(Effect.either(a.reserveSessionJob(x.binding, x.job))), run(Effect.either(b.reserveSessionJob(y.binding, y.job)))])
    expect(results.filter(r => r._tag === "Right")).toHaveLength(1)
    expect((await run(b.getSessionSnapshot(id(1))))?.heldAtomic).toBe(60n)
    expect((await run(b.getJob(jid(1))))?.status).toBe("queued")
  })
  test("a queued-job SQL abort rolls the reservation back and exposes no uncommitted memory", async () => {
    const f = disk(), s = f.open().store, db = f.inspect(); await run(s.openSession(makeSession()))
    db.exec("CREATE TRIGGER owned_abort BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'PRIVATE_SQL_DIAGNOSTIC'); END")
    const a = admission(); const failure = await rejected(s.reserveSessionJob(a.binding, a.job), "SessionStorageUnavailable")
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_SQL_DIAGNOSTIC")
    expect((await run(s.getSessionSnapshot(id(1))))?.heldAtomic).toBe(0n); expect(await run(s.getJob(jid(1)))).toBeUndefined()
    expect(db.query("SELECT count(*) AS n FROM session_calls").get()).toEqual({ n: 0 })
    db.exec("DROP TRIGGER owned_abort"); expect(await run(s.reserveSessionJob(a.binding, a.job))).toEqual({ created: true, jobId: jid(1) })
  })
  test("durable one-shot barrier holds uncertainty across a second handle and restart", async () => {
    const f = disk(), a = f.open(), x = admission(); await run(a.store.openSession(makeSession()))
    await run(a.store.reserveSessionJob(x.binding, x.job)); const b = f.open()
    expect(b.reaped).toBe(0); expect((await run(b.store.getJob(jid(1))))?.status).toBe("queued")
    const permits = await Promise.all([run(a.store.beginSessionSettlement(id(1), jid(1))), run(b.store.beginSessionSettlement(id(1), jid(1)))])
    expect(permits.filter(p => p.claimed)).toHaveLength(1)
    await run(a.store.markSessionUncertain(id(1), jid(1))); a.close(); b.close()
    const c = f.open().store
    expect((await run(c.getSessionSnapshot(id(1))))?.heldAtomic).toBe(60n)
    await rejected(c.closeSession(id(1), 999999999), "SessionPending")
    await rejected(c.finishSessionJob(terminal(1, 60n, 1, false)), "SessionConflict")
  })
  test("receipt-insert abort after simulated acceptance retains settling and cannot double spend", async () => {
    const f = disk(), s = f.open().store, db = f.inspect(), a = admission()
    await run(s.openSession(makeSession())); await run(s.reserveSessionJob(a.binding, a.job)); await run(s.beginSessionSettlement(id(1), jid(1)))
    db.exec("CREATE TRIGGER owned_abort BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'PRIVATE_RECEIPT'); END")
    await rejected(s.finishSessionJob(terminal()), "SessionStorageUnavailable")
    expect((await run(s.getSessionSnapshot(id(1))))).toMatchObject({ heldAtomic: 60n, remainingAtomic: 40n, session: { spentAtomic: 0n } })
    expect(await run(s.allReceipts)).toHaveLength(0)
    db.exec("DROP TRIGGER owned_abort"); await run(s.finishSessionJob(terminal())); await run(s.finishSessionJob(terminal()))
    expect(await run(s.allReceipts)).toHaveLength(1)
    expect((await run(s.closeSession(id(1), 4)))).toMatchObject({ complete: true, heldAtomic: 0n, session: { spentAtomic: 60n, closedAtMs: 4 } })
  })
  test("released nonce tombstone blocks another session after reopen", async () => {
    const f = disk(), a = f.open(), x = admission()
    await run(a.store.openSession(makeSession())); await run(a.store.reserveSessionJob(x.binding, x.job))
    await run(a.store.finishSessionJob(terminal(1, 60n, 1, false))); a.close()
    const b = f.open().store; await run(b.openSession(makeSession(2)))
    const y = admission(2, 60n, 2)
    await rejected(b.reserveSessionJob({ ...y.binding, nonce: x.binding.nonce }, y.job), "SessionConflict")
    expect((await run(b.getSessionSnapshot(id(2))))?.remainingAtomic).toBe(100n)
  })
  test("legacy writers cannot bypass current disk session ownership from a stale handle", async () => {
    const f = disk(), a = f.open().store, b = f.open().store, x = admission()
    await run(a.openSession(makeSession())); await run(a.reserveSessionJob(x.binding, x.job))
    expect((await run(Effect.exit(b.putJob(Job.make({ ...x.job, status: "failed" })))))._tag).toBe("Failure")
    expect((await run(Effect.exit(b.putReceipt(terminal().receipt))))._tag).toBe("Failure")
    expect((await run(a.getSessionSnapshot(id(1))))?.heldAtomic).toBe(60n)
    expect((await run(b.getJob(jid(1))))?.status).toBe("queued")
  })
  test("legacy receipt writer cannot invent session membership", async () => {
    const f = disk(), s = f.open().store
    expect((await run(Effect.exit(s.putReceipt(terminal().receipt))))._tag).toBe("Failure")
    expect(await run(s.allReceipts)).toHaveLength(0)
  })
  test("legacy fee backfill cannot rewrite immutable session terminal evidence", async () => {
    const f = disk(), a = f.open().store, b = f.open().store, x = admission(), t = terminal()
    await run(a.openSession(makeSession())); await run(a.reserveSessionJob(x.binding, x.job)); await run(a.beginSessionSettlement(id(1), jid(1)))
    await run(a.finishSessionJob({ ...t, receipt: Receipt.make({ ...t.receipt, feeAccrualId: "fixture" }) }))
    expect(await run(a.backfillFeeSweep("fixture", `0x${"f".repeat(64)}`))).toBe(0)
    expect(await run(b.backfillFeeSweep("fixture", `0x${"f".repeat(64)}`))).toBe(0)
    expect((await run(b.allReceipts))[0]?.feeSweepTx).toBeUndefined()
    expect((await run(b.getSessionSnapshot(id(1))))?.session.spentAtomic).toBe(60n)
  })
  test("memory session reads do not expose mutable queued input or receipt objects", async () => {
    const s = await run(StoreTag.pipe(Effect.provide(StoreLive))), x = admission()
    await run(s.openSession(makeSession())); await run(s.reserveSessionJob(x.binding, x.job))
    const exposed = await run(s.getJob(jid(1))); (exposed!.input as { question: string }).question = "mutated"
    expect((await run(s.getJob(jid(1))))?.input).toEqual(x.job.input)
    await run(s.finishSessionJob(terminal(1, 60n, 1, false)))
    const receipts = await run(s.allReceipts); Object.assign(receipts[0]!, { reason: "mutated" })
    expect((await run(s.allReceipts))[0]?.reason).toBe("session_released")
  })
  test("accessor-bearing admission metadata is rejected without executing the getter", async () => {
    const f = disk(), s = f.open().store, x = admission(); let reads = 0
    await run(s.openSession(makeSession()))
    Object.defineProperty(x.binding, "sessionId", { enumerable: true, get: () => { reads++; return id(1) } })
    await rejected(s.reserveSessionJob(x.binding, x.job), "SessionInvalid")
    expect(reads).toBe(0); expect((await run(s.getSessionSnapshot(id(1))))?.heldAtomic).toBe(0n)
  })
  test("raw bigint revival tags are refused before queued state can be persisted", async () => {
    const f = disk(), s = f.open().store, x = admission()
    await run(s.openSession(makeSession()))
    const malformed = Job.make({ ...x.job, input: { innocent: { __bigint: "PRIVATE_NOT_AN_INTEGER" } } })
    await rejected(s.reserveSessionJob(x.binding, malformed), "SessionInvalid")
    expect(await run(s.getJob(jid(1)))).toBeUndefined()
  })
  test("semantic retries return the original job even with a fresh route ID and timestamp", async () => {
    const f = disk(), a = f.open().store, b = f.open().store, x = admission(), y = admission(2)
    await run(a.openSession(makeSession())); await run(a.reserveSessionJob(x.binding, x.job))
    expect(await run(b.reserveSessionJob({ ...y.binding, nonce: x.binding.nonce }, Job.make({ ...y.job, createdAtMs: 77 })))).toEqual({ created: false, jobId: jid(1) })
    expect(await run(b.getJob(jid(2)))).toBeUndefined()
    await rejected(b.reserveSessionJob({ ...y.binding, nonce: x.binding.nonce, validBefore: x.binding.validBefore + 1n }, y.job), "SessionConflict")
  })
  test("a deferred foreign-key failure at COMMIT rolls back spend, call, job and receipt", async () => {
    const f = disk(), s = f.open().store, db = f.inspect(), x = admission()
    await run(s.openSession(makeSession())); await run(s.reserveSessionJob(x.binding, x.job)); await run(s.beginSessionSettlement(id(1), jid(1)))
    db.exec("CREATE TABLE owned_commit_guard (parent TEXT REFERENCES sessions(id) DEFERRABLE INITIALLY DEFERRED)")
    db.exec("CREATE TRIGGER owned_abort AFTER INSERT ON receipts BEGIN INSERT INTO owned_commit_guard VALUES ('missing'); END")
    await rejected(s.finishSessionJob(terminal()), "SessionStorageUnavailable")
    expect(db.query("SELECT count(*) AS n FROM owned_commit_guard").get()).toEqual({ n: 0 })
    expect(await run(s.allReceipts)).toHaveLength(0)
    expect((await run(s.getSessionSnapshot(id(1))))).toMatchObject({ heldAtomic: 60n, session: { spentAtomic: 0n }, calls: [{ state: "settling" }] })
    db.exec("DROP TRIGGER owned_abort"); await run(s.finishSessionJob(terminal()))
    expect((await run(s.getSessionSnapshot(id(1))))?.session.spentAtomic).toBe(60n)
  })
  test("corrupted redundant money columns and closed databases refuse with fixed storage errors", async () => {
    const f = disk(), handle = f.open(), s = handle.store, db = f.inspect()
    await run(s.openSession(makeSession())); db.exec("UPDATE sessions SET spent_atomic = '99'")
    await rejected(s.getSessionSnapshot(id(1)), "SessionStorageUnavailable")
    handle.close(); await rejected(s.getSessionSnapshot(id(1)), "SessionStorageUnavailable")
  })
  test("corrupt canonical disk JSON fails writes as storage unavailable without private diagnostics", async () => {
    const f = disk(), s = f.open().store, db = f.inspect(); await run(s.openSession(makeSession()))
    db.query("UPDATE sessions SET json = ?").run('{ "private": "PRIVATE_DISK_CONTENT" }')
    const failure = await rejected(s.closeSession(id(1), 4), "SessionStorageUnavailable")
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_DISK_CONTENT")
    expect(db.query("SELECT closed_at_ms FROM sessions").get()).toEqual({ closed_at_ms: null })
  })
  test.each(["reserved", "released"])("deleting a %s call fails closed instead of erasing a hold or nonce tombstone", async state => {
    const f = disk(), s = f.open().store, db = f.inspect(), x = admission()
    await run(s.openSession(makeSession())); await run(s.reserveSessionJob(x.binding, x.job))
    if (state === "released") await run(s.finishSessionJob(terminal(1, 60n, 1, false)))
    db.exec("DELETE FROM session_calls")
    await rejected(s.getSessionSnapshot(id(1)), "SessionStorageUnavailable")
    await rejected(s.reserveSessionJob(x.binding, x.job), "SessionStorageUnavailable")
  })
  test("reopen detects a deleted call before the old reaper can falsify its queued job", async () => {
    const f = disk(), opened = f.open(), db = f.inspect(), x = admission()
    await run(opened.store.openSession(makeSession())); await run(opened.store.reserveSessionJob(x.binding, x.job)); opened.close()
    db.exec("DELETE FROM session_calls")
    expect(() => f.open()).toThrow(expect.objectContaining({ _tag: "SessionStorageUnavailable" }))
    expect(db.query("SELECT status FROM jobs").get()).toEqual({ status: "queued" })
  })
  test("external deletion in another session cannot free its global nonce for a new admission", async () => {
    const f = disk(), s = f.open().store, db = f.inspect(), x = admission(), other = admission(2, 60n, 2)
    await run(s.openSession(makeSession())); await run(s.openSession(makeSession(2))); await run(s.reserveSessionJob(x.binding, x.job))
    db.query("DELETE FROM session_calls WHERE job_id = ?").run(jid(1))
    await rejected(s.reserveSessionJob({ ...other.binding, nonce: x.binding.nonce }, other.job), "SessionStorageUnavailable")
    expect(db.query("SELECT COUNT(*) AS n FROM jobs WHERE id = ?").get(jid(2))).toEqual({ n: 0 })
  })
  test("selected-session status and admission never parse unrelated session evidence", async () => {
    const f = disk(), s = f.open().store, db = f.inspect()
    for (const n of [1, 2]) { const x = admission(n, 30n, n); await run(s.openSession(makeSession(n))); await run(s.reserveSessionJob(x.binding, x.job)) }
    db.query("UPDATE jobs SET json = ? WHERE id = ?").run("PRIVATE_UNRELATED_INVALID_JSON", jid(2))
    expect((await run(s.getSessionSnapshot(id(1))))?.heldAtomic).toBe(30n)
    const x = admission(3, 30n)
    expect(await run(s.reserveSessionJob(x.binding, x.job))).toEqual({ created: true, jobId: jid(3) })
    await rejected(s.getSessionSnapshot(id(2)), "SessionStorageUnavailable")
  })
  test("actual selected evidence queries use the session index and row limits; global claims use unique indexes", async () => {
    const f = disk(), s = f.open().store, db = f.inspect(), x = admission(); await run(s.openSession(makeSession()))
    const query = spyOn(Database.prototype, "query")
    let statements: string[] = []
    try {
      await run(s.reserveSessionJob(x.binding, x.job)); await run(s.beginSessionSettlement(id(1), jid(1))); await run(s.finishSessionJob(terminal()))
      await run(s.getSessionSnapshot(id(1)))
      statements = [...new Set(query.mock.calls.map(call => call[0]))]
    } finally { query.mockRestore() }
    const selected = statements.filter(sql => sql.startsWith("SELECT jobs.*") || sql.startsWith("SELECT receipts.*") || sql.startsWith("SELECT * FROM session_calls WHERE session_id"))
    expect(selected).toHaveLength(3)
    expect(statements).toContain("SELECT call_count FROM sessions LIMIT 10001")
    expect(statements).toContain("SELECT COUNT(*) AS n FROM session_calls")
    expect(statements.some(sql => /\bSUM\s*\(|\bCAST\s*\(/i.test(sql))).toBe(false)
    for (const sql of selected) {
      expect(sql).toContain("session_id = ? LIMIT 101")
      const plan = db.query<{ detail: string }, [string]>(`EXPLAIN QUERY PLAN ${sql}`).all(id(1))
      expect(plan.some(row => /SEARCH session_calls USING INDEX session_calls_session/.test(row.detail))).toBe(true)
      expect(db.query(sql).all(id(1))).toHaveLength(1)
    }
    for (const column of ["authorization_key", "settlement_key"]) {
      const sql = statements.find(sql => sql === `SELECT job_id FROM session_calls WHERE ${column} = ?`)
      expect(sql).toBeDefined()
      const plan = db.query<{ detail: string }, [string]>(`EXPLAIN QUERY PLAN ${sql!}`).all("owned missing value")
      expect(plan.some(row => /SEARCH session_calls USING INDEX sqlite_autoindex_session_calls/.test(row.detail))).toBe(true)
    }
  })
  test("global stats and receipts include fresh session evidence after cross-handle completion and restart", async () => {
    const f = disk(), opened = f.open(), observer = f.open(), x = admission()
    expect((await run(observer.store.statsFor("fixture"))).settled).toBe(0)
    await run(opened.store.openSession(makeSession())); await run(opened.store.reserveSessionJob(x.binding, x.job))
    await run(opened.store.beginSessionSettlement(id(1), jid(1))); await run(opened.store.finishSessionJob(terminal()))
    expect((await run(observer.store.statsFor("fixture"))).settled).toBe(1)
    expect(await run(observer.store.allReceipts)).toHaveLength(1)
    opened.close(); observer.close(); const later = f.open().store
    expect((await run(later.statsFor("fixture"))).settled).toBe(1)
    expect(await run(later.allReceipts)).toHaveLength(1)
    // Global receipt correlation deliberately does not load terminal job bodies.
    const db = f.inspect(); db.query("UPDATE jobs SET json = ? WHERE id = ?").run("INVALID_JOB", jid(1))
    expect((await run(later.statsFor("fixture"))).settled).toBe(1)
    await rejected(later.getSessionSnapshot(id(1)), "SessionStorageUnavailable")
    db.query("UPDATE receipts SET json = ? WHERE job_id = ?").run("PRIVATE_INVALID_RECEIPT", jid(1))
    const failed = await run(Effect.exit(later.allReceipts))
    expect(failed._tag).toBe("Failure"); expect(JSON.stringify(failed)).not.toContain("PRIVATE_INVALID_RECEIPT")
    expect((await run(Effect.exit(later.statsFor("fixture"))))._tag).toBe("Failure")
  })
  test("global APIs refuse a missing terminal receipt instead of silently dropping its call", async () => {
    const f = disk(), s = f.open().store, x = admission(); await run(s.openSession(makeSession()))
    await run(s.reserveSessionJob(x.binding, x.job)); await run(s.beginSessionSettlement(id(1), jid(1))); await run(s.finishSessionJob(terminal()))
    f.inspect().exec("DELETE FROM receipts")
    expect((await run(Effect.exit(s.allReceipts)))._tag).toBe("Failure")
    expect((await run(Effect.exit(s.statsFor("fixture"))))._tag).toBe("Failure")
  })
  test("global reference uniqueness refuses a different session's accepted reference before any terminal write", async () => {
    const f = disk(), a = f.open().store, b = f.open().store
    for (const n of [1, 2]) { const x = admission(n, 60n, n); await run(a.openSession(makeSession(n))); await run(a.reserveSessionJob(x.binding, x.job)); await run(a.beginSessionSettlement(id(n), jid(n))) }
    const first = terminal(), other = terminal(2, 60n, 2)
    if (first.kind !== "settled" || other.kind !== "settled") throw Error("fixture")
    await run(a.finishSessionJob(first))
    await rejected(b.finishSessionJob({ ...other, receipt: Receipt.make({ ...other.receipt, settleTx: first.receipt.settleTx }),
      settlement: { ...other.settlement, txHash: first.settlement.txHash } }), "SessionConflict")
    expect((await run(b.getSessionSnapshot(id(2))))).toMatchObject({ heldAtomic: 60n, session: { spentAtomic: 0n } })
    expect((await run(b.getJob(jid(2))))?.status).toBe("queued"); expect(await run(b.allReceipts)).toHaveLength(1)
  })
  test("SQLite memory and temporary backends never claim durable sessions", () => {
    for (const path of [":memory:", ""]) {
      const opened = openSqliteStore(path, "owned_volatile")
      try { expect(opened.store.sessionStorage).toBe("volatile") } finally { opened.close() }
    }
  })
  test.each(["sessions", "session_calls", "jobs"])("terminal %s update failure rolls back every earlier write", async table => {
    const f = disk(), a = f.open().store, b = f.open().store, db = f.inspect(), x = admission()
    await run(a.openSession(makeSession())); await run(a.reserveSessionJob(x.binding, x.job)); await run(a.beginSessionSettlement(id(1), jid(1)))
    db.exec(`CREATE TRIGGER owned_abort BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'PRIVATE_WRITE'); END`)
    await rejected(a.finishSessionJob(terminal()), "SessionStorageUnavailable")
    expect((await run(b.getSessionSnapshot(id(1))))).toMatchObject({ heldAtomic: 60n, session: { spentAtomic: 0n }, calls: [{ state: "settling" }] })
    expect((await run(b.getJob(jid(1))))?.status).toBe("queued"); expect(await run(b.allReceipts)).toHaveLength(0)
    db.exec("DROP TRIGGER owned_abort"); await run(a.finishSessionJob(terminal()))
    expect((await run(b.getSessionSnapshot(id(1))))?.session.spentAtomic).toBe(60n)
  })
  test("failed call insertion and failed uncertainty annotation keep the previous committed state", async () => {
    const f = disk(), s = f.open().store, db = f.inspect(), x = admission(); await run(s.openSession(makeSession()))
    db.exec("CREATE TRIGGER owned_abort BEFORE INSERT ON session_calls BEGIN SELECT RAISE(ABORT, 'PRIVATE_CALL'); END")
    await rejected(s.reserveSessionJob(x.binding, x.job), "SessionStorageUnavailable")
    expect((await run(s.getSessionSnapshot(id(1))))?.heldAtomic).toBe(0n); expect(await run(s.getJob(jid(1)))).toBeUndefined()
    db.exec("DROP TRIGGER owned_abort"); await run(s.reserveSessionJob(x.binding, x.job)); await run(s.beginSessionSettlement(id(1), jid(1)))
    db.exec("CREATE TRIGGER owned_abort BEFORE UPDATE ON session_calls BEGIN SELECT RAISE(ABORT, 'PRIVATE_UNCERTAIN'); END")
    await rejected(s.markSessionUncertain(id(1), jid(1)), "SessionStorageUnavailable")
    expect((await run(s.getSessionSnapshot(id(1))))).toMatchObject({ heldAtomic: 60n, calls: [{ state: "settling" }] })
    expect(await run(s.beginSessionSettlement(id(1), jid(1)))).toEqual({ claimed: false })
  })
  test("equal-price sibling completions use current disk and exact retries survive reopen", async () => {
    const f = disk(), first = f.open(), second = f.open(), a = first.store, b = second.store
    await run(a.openSession(makeSession()))
    for (const n of [1, 2]) { const x = admission(n, 30n); await run(a.reserveSessionJob(x.binding, x.job)); await run(b.beginSessionSettlement(id(1), jid(n))) }
    await Promise.all([run(a.finishSessionJob(terminal(1, 30n))), run(b.finishSessionJob(terminal(2, 30n)))])
    first.close(); second.close(); const s = f.open().store
    await run(s.finishSessionJob(terminal(1, 30n)))
    expect((await run(s.getSessionSnapshot(id(1))))).toMatchObject({ heldAtomic: 0n, remainingAtomic: 40n, session: { spentAtomic: 60n } })
    expect(await run(s.allReceipts)).toHaveLength(2)
    const fresh = admission(3, 30n)
    expect(await run(s.reserveSessionJob({ ...fresh.binding, nonce: admission(1, 30n).binding.nonce }, fresh.job))).toEqual({ created: false, jobId: jid(1) })
    await rejected(s.finishSessionJob(terminal(1, 30n, 1, false)), "SessionConflict")
  })
  test("disk enforces 100 lifetime calls and retains released nonce claims after reopen", async () => {
    const f = disk(), opened = f.open(), s = opened.store; await run(s.openSession(makeSession()))
    for (let n = 1; n <= 100; n++) { const x = admission(n, 1n); await run(s.reserveSessionJob(x.binding, x.job)); await run(s.finishSessionJob(terminal(n, 1n, 1, false))) }
    opened.close(); const later = f.open().store, extra = admission(101, 1n)
    await rejected(later.reserveSessionJob(extra.binding, extra.job), "SessionCapacity")
    expect((await run(later.getSessionSnapshot(id(1))))?.calls).toHaveLength(100)
    expect(f.inspect().query("SELECT count(*) AS n FROM session_calls").get()).toEqual({ n: 100 })
  }, 20000)
  test("disk refuses the 10001st session without deleting any retained row", async () => {
    const f = disk(), s = f.open().store, db = f.inspect()
    const insert = db.query("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    db.transaction(() => { for (let n = 1; n <= 10000; n++) {
      const row = Session.make({ ...makeSession(n), spentAtomic: 0n })
      insert.run(row.id, row.buyer, "100", "0", row.rail, row.network, row.openedAtMs, null, 0, "0", sessionJson({ session: row, callCount: 0, heldAtomic: 0n }))
    } }).immediate()
    await rejected(s.openSession(makeSession(10001)), "SessionCapacity")
    expect(db.query("SELECT count(*) AS n FROM sessions").get()).toEqual({ n: 10000 })
    expect((await run(s.getSessionSnapshot(id(10000))))?.remainingAtomic).toBe(100n)
  }, 10000)
  test("1 MiB UTF-8 job boundary is exact and an oversized terminal job keeps its hold", async () => {
    const f = disk(), s = f.open().store, x = admission(); await run(s.openSession(makeSession()))
    const base = Job.make({ ...x.job, input: { text: "" } })
    const padding = 1048576 - Buffer.byteLength(sessionJson(base, 1048576))
    const exact = Job.make({ ...base, input: { text: "x".repeat(padding) } })
    const binding = { ...x.binding, requestDigest: sessionRequestDigest(exact.input) }
    const oversized = Job.make({ ...exact, input: { text: "x".repeat(padding + 1) } })
    await rejected(s.reserveSessionJob({ ...binding, requestDigest: sessionRequestDigest(oversized.input) }, oversized), "SessionInvalid")
    expect(await run(s.getJob(jid(1)))).toBeUndefined()
    expect(await run(s.reserveSessionJob(binding, exact))).toEqual({ created: true, jobId: jid(1) })
    await run(s.beginSessionSettlement(id(1), jid(1)))
    const t = terminal(), tooLarge = Job.make({ ...t.job, input: exact.input })
    await rejected(s.finishSessionJob({ ...t, job: tooLarge }), "SessionInvalid")
    expect((await run(s.getSessionSnapshot(id(1))))?.heldAtomic).toBe(60n)
    expect(await run(s.allReceipts)).toHaveLength(0)
  })
})
