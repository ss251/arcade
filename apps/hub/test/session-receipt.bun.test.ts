import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { Job, JobOutcome, Receipt, loadChainConfig } from "@arcade/core"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { sessionJson, sessionRequestDigest, type SessionBinding, type SessionTerminal } from "../src/session-ledger.ts"

const cfg = loadChainConfig("arc-testnet"), buyer = `0x${"1".repeat(40)}`, seller = `0x${"2".repeat(40)}`
const sid = (n = 1) => `ses_${n.toString(16).padStart(32, "0")}`, jid = (n = 1) => `job_${n.toString(16).padStart(20, "0")}`
const run = Effect.runPromise
const admission = (n = 1, session = 1) => {
  const input = { owned: "disk receipt fixture" }
  const binding: SessionBinding = { sessionId: sid(session), jobId: jid(n), buyer, seller, skillId: "fixture", skillVersion: "1.0.0",
    rail: "gateway", network: cfg.caip2, asset: cfg.usdc.address, verifyingContract: cfg.gateway!.wallet,
    domainName: "GatewayWalletBatched", domainVersion: "1", payTo: seller, amountAtomic: 30n,
    nonce: `0x${n.toString(16).padStart(64, "0")}`, validAfter: 1n, validBefore: 604901n, requestDigest: sessionRequestDigest(input) }
  const job = Job.make({ id: jid(n), skillId: "fixture", seller, buyer, priceAtomic: 30n, input,
    status: "queued", createdAtMs: 2, rootJobId: jid(n), hop: 0, ancestors: [] })
  return { binding, job }
}
const terminal = (n = 1, session = 1, settled = true): SessionTerminal => {
  const { job } = admission(n, session), reference = `12345678-1234-4234-8234-${n.toString(16).padStart(12, "0")}`
  const outcome = JobOutcome.make({ status: settled ? "succeeded" : "refused", startedAtMs: 2, finishedAtMs: 3, output: { retained: true } })
  const receipt = Receipt.make({ jobId: job.id, skillId: "fixture", skillVersion: "1.0.0", buyer, seller,
    priceAtomic: 30n, sellerAtomic: 30n, feeAtomic: 0n, feeBps: 0, rail: "gateway", network: cfg.caip2,
    latencyMs: 1, settled, reason: settled ? "ok" : "session_released", createdAtMs: 3,
    rootJobId: job.id, hop: 0, ancestors: [], sessionId: sid(session),
    ...(settled ? { settleTx: reference, settleRefKind: "gateway-transfer" as const } : {}) })
  const base = { sessionId: sid(session), jobId: job.id, job: Job.make({ ...job, status: outcome.status, outcome }), receipt }
  return settled ? { ...base, kind: "settled", settlement: { payer: buyer, amountAtomic: 30n, txHash: reference, settlementKind: "gateway-transfer" } }
    : { ...base, kind: "released" }
}
const owned: Array<{ directory: string; close: Array<() => void> }> = []
const disk = () => {
  const directory = mkdtempSync(join(tmpdir(), "arcade-session-receipt-")), path = join(directory, "owned.sqlite"), close: Array<() => void> = []
  owned.push({ directory, close })
  const open = () => { const handle = openSqliteStore(path, "owned-receipt-reader"); close.push(() => handle.close()); return handle }
  const inspect = () => { const db = new Database(path); close.push(() => db.close()); return db }
  return { open, inspect }
}
afterEach(() => { for (const f of owned.splice(0)) { for (const close of f.close.reverse()) { try { close() } catch { /* already closed for restart */ } } rmSync(f.directory, { recursive: true }) } })
const rejected = async <A, E>(effect: Effect.Effect<A, E>, tag: string) => {
  const result = await run(Effect.either(effect)); expect(result).toMatchObject({ _tag: "Left", left: { _tag: tag } }); return result
}
const seed = async (store: ReturnType<typeof openSqliteStore>["store"], n = 1, session = 1, settled = true) => {
  const a = admission(n, session)
  await run(store.openSession({ id: sid(session), buyer, budgetAtomic: 100n, rail: "gateway", network: cfg.caip2, openedAtMs: 1 }))
  await run(store.reserveSessionJob(a.binding, a.job))
  if (settled) await run(store.beginSessionSettlement(sid(session), jid(n)))
  const t = terminal(n, session, settled); await run(store.finishSessionJob(t)); return t
}

describe("current-disk selected session receipt", () => {
  test.each([true, false])("terminal bundle is selected once, copied, and survives actual reopen, settled=%s", async settled => {
    const f = disk(), writer = f.open(), reader = f.open(), t = await seed(writer.store, 1, 1, settled)
    const query = spyOn(Database.prototype, "query")
    // Observe the actual selected read, not a memory adapter or synthesized pair.
    try {
      const pair = await run(reader.store.getSessionTerminal(sid(), jid()))
      expect(pair).toEqual({ job: t.job, receipt: t.receipt })
      expect(query.mock.calls).toHaveLength(4)
      expect(query.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true)
      Object.assign(pair!.job.outcome!.output as object, { retained: "caller mutation" })
      Object.assign(pair!.receipt, { reason: "caller mutation" })
    } finally { query.mockRestore() }
    expect(await run(reader.store.getSessionTerminal(sid(), jid()))).toEqual({ job: t.job, receipt: t.receipt })
    writer.close(); reader.close()
    const later = f.open(); expect(later.reaped).toBe(0)
    expect(await run(later.store.getSessionTerminal(sid(), jid()))).toEqual({ job: t.job, receipt: t.receipt })
    const db = f.inspect()
    db.query("UPDATE jobs SET json = ? WHERE id = ?").run(sessionJson(Job.make({ ...t.job,
      outcome: JobOutcome.make({ ...t.job.outcome!, output: { changed: true } }) })), jid())
    await rejected(later.store.getSessionTerminal(sid(), jid()), "SessionStorageUnavailable")
  })
  test.each([true, false])("observes terminal across two handles and reopen, settled=%s", async settled => {
    const f = disk(), writer = f.open(), reader = f.open(), a = admission()
    await run(writer.store.openSession({ id: sid(), buyer, budgetAtomic: 100n, rail: "gateway", network: cfg.caip2, openedAtMs: 1 }))
    await run(writer.store.reserveSessionJob(a.binding, a.job))
    expect(await run(reader.store.getSessionReceipt(sid(), jid()))).toBeUndefined()
    if (settled) await run(writer.store.beginSessionSettlement(sid(), jid()))
    const t = terminal(1, 1, settled); await run(writer.store.finishSessionJob(t))
    const seen = await run(reader.store.getSessionReceipt(sid(), jid())); expect(seen).toEqual(t.receipt)
    Object.assign(seen!, { sellerAtomic: 0n }); (seen!.ancestors as string[]).push("owned-mutation")
    expect(await run(reader.store.getSessionReceipt(sid(), jid()))).toEqual(t.receipt)
    await run(writer.store.closeSession(sid(), 4)); writer.close(); reader.close()
    const later = f.open(); expect(later.reaped).toBe(0)
    expect(await run(later.store.getSessionReceipt(sid(), jid()))).toEqual(t.receipt)
  })
  test("foreign or missing membership is not a global receipt lookup", async () => {
    const f = disk(), store = f.open().store; await seed(store, 1, 2)
    await run(store.openSession({ id: sid(), buyer, budgetAtomic: 100n, rail: "gateway", network: cfg.caip2, openedAtMs: 1 }))
    for (const [s, j] of [[sid(), jid()], [sid(2), jid(8)], [sid(9), jid()]]) await rejected(store.getSessionReceipt(s!, j!), "SessionNotFound")
    expect(await run(store.getSessionReceipt(sid(2), jid()))).toEqual(terminal(1, 2).receipt)
  })
  test("malformed scalar IDs never prepare a SQLite read", async () => {
    const store = disk().open().store, query = spyOn(Database.prototype, "query")
    try {
      for (const [s, j] of [[`${sid()}\n`, jid()], [sid(), `${jid()}\n`], [sid(), `job_${"a".repeat(129)}`]]) {
        await rejected(store.getSessionReceipt(s!, j!), "SessionInvalid")
      }
      expect(query).not.toHaveBeenCalled()
    } finally { query.mockRestore() }
  })
  test("queries only selected indexed evidence in the existing read transaction", async () => {
    const f = disk(), store = f.open().store, db = f.inspect(); const expected = await seed(store)
    await seed(store, 2, 2)
    const query = spyOn(Database.prototype, "query")
    let statements: string[] = []
    try { expect(await run(store.getSessionReceipt(sid(), jid()))).toEqual(expected.receipt); statements = query.mock.calls.map(call => call[0]) }
    finally { query.mockRestore() }
    expect(statements).toHaveLength(4)
    expect(statements).toContain("SELECT * FROM sessions WHERE id = ?")
    expect(statements.every(sql => sql.startsWith("SELECT "))).toBe(true)
    for (const sql of statements.filter(sql => sql !== "SELECT * FROM sessions WHERE id = ?")) {
      expect(sql).toContain("session_calls"); expect(sql).toContain("session_id = ? LIMIT 101")
      const plan = db.query<{ detail: string }, [string]>(`EXPLAIN QUERY PLAN ${sql}`).all(sid())
      expect(plan.some(row => /SEARCH session_calls USING INDEX session_calls_session/.test(row.detail))).toBe(true)
      expect(db.query(sql).all(sid())).toHaveLength(1)
    }
    // An unavailable write lock does not block this read or cause compensation.
    db.exec("BEGIN IMMEDIATE")
    try { expect(await run(store.getSessionReceipt(sid(), jid()))).toEqual(expected.receipt) }
    finally { db.exec("ROLLBACK") }
  })
  test("does not decode corrupt terminal evidence in an unrelated session", async () => {
    const f = disk(), store = f.open().store, db = f.inspect(); const expected = await seed(store); await seed(store, 2, 2)
    db.query("UPDATE receipts SET json = ? WHERE job_id = ?").run("PRIVATE_UNRELATED_RECEIPT", jid(2))
    expect(await run(store.getSessionReceipt(sid(), jid()))).toEqual(expected.receipt)
    const result = await rejected(store.getSessionReceipt(sid(2), jid(2)), "SessionStorageUnavailable")
    expect(JSON.stringify(result)).not.toContain("PRIVATE_UNRELATED_RECEIPT")
  })
  test.each([true, false])("missing terminal receipt is unavailable, not pending, settled=%s", async settled => {
    const f = disk(), store = f.open().store, db = f.inspect(); await seed(store, 1, 1, settled)
    db.query("DELETE FROM receipts WHERE job_id = ?").run(jid())
    await rejected(store.getSessionReceipt(sid(), jid()), "SessionStorageUnavailable")
    expect(db.query("SELECT count(*) AS n FROM receipts").get()).toEqual({ n: 0 })
  })
  test.each(["receipt-json", "receipt-coordinates", "job-json", "deleted-call"])("refuses %s and sees actual recovery from a second handle", async corruption => {
    const f = disk(), store = f.open().store, db = f.inspect(); const t = await seed(store)
    const old = db.query<{ json: string }, [string]>("SELECT json FROM receipts WHERE job_id = ?").get(jid())!.json
    const call = db.query("SELECT * FROM session_calls WHERE job_id = ?").get(jid()) as Record<string, string | number | null>
    if (corruption === "receipt-json") db.query("UPDATE receipts SET json = ? WHERE job_id = ?").run("PRIVATE_CORRUPT_RECEIPT", jid())
    if (corruption === "receipt-coordinates") db.query("UPDATE receipts SET json = ? WHERE job_id = ?").run(sessionJson(Receipt.make({ ...t.receipt, sessionId: sid(2) })), jid())
    if (corruption === "job-json") db.query("UPDATE jobs SET json = ? WHERE id = ?").run("PRIVATE_CORRUPT_JOB", jid())
    if (corruption === "deleted-call") db.query("DELETE FROM session_calls WHERE job_id = ?").run(jid())
    const result = await rejected(store.getSessionReceipt(sid(), jid()), "SessionStorageUnavailable")
    expect(JSON.stringify(result)).not.toContain("PRIVATE_CORRUPT")
    if (corruption === "deleted-call") db.query("INSERT INTO session_calls VALUES (?,?,?,?,?,?,?,?)").run(
      call.job_id!, call.session_id!, call.authorization_key!, call.state!, call.amount_atomic!, call.created_at_ms!, call.settlement_key!, call.json!)
    else if (corruption === "job-json") db.query("UPDATE jobs SET json = ? WHERE id = ?").run(sessionJson(t.job), jid())
    else db.query("UPDATE receipts SET json = ? WHERE job_id = ?").run(old, jid())
    expect(await run(store.getSessionReceipt(sid(), jid()))).toEqual(t.receipt)
  })
})
