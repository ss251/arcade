import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { Cause, Effect } from "effect"
import { hashJson, Job, Receipt } from "@arcade/core"
import { escrowActionContext, escrowContextToWire, escrowProviderContextHash } from "@arcade/payments"
import { fixture } from "../../../packages/payments/test/fixtures/erc8183-action.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { EscrowStorageUnavailable } from "../src/escrow-store.ts"
const owned: Array<() => void> = []
afterEach(() => { for (const close of owned.splice(0).reverse()) close() })
const run = Effect.runPromise
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "arcade-escrow-store-")), path = join(directory, "store.sqlite")
  owned.push(() => rmSync(directory, { recursive: true }))
  const open = () => { const s = openSqliteStore(path, "owned_escrow_fixture"); let closed = false
    const close = () => { if (!closed) { closed = true; s.close() } }; owned.push(close); return { ...s, close } }
  const inspect = () => { const db = new Database(path); owned.push(() => db.close()); return db }
  const f = await fixture("submit"), input = { z: 1, a: { __bigint: "not a metadata bigint" } }
  const context = escrowActionContext({ ...f.context, call: { ...f.context.call, inputHash: hashJson(input) } })
  const id = "job_" + "c".repeat(32), job = Job.make({ id, skillId: context.call.skillId,
    seller: context.call.provider, buyer: context.client, priceAtomic: context.call.amount, input,
    status: "queued", createdAtMs: 1000000, rootJobId: id, hop: 0, ancestors: [] })
  return { path, open, inspect, context, job }
}
async function rejects<A, E>(effect: Effect.Effect<A, E>, tag = "EscrowStoreRefused") {
  const exit = await Effect.runPromiseExit(effect); expect(exit._tag).toBe("Failure")
  if (exit._tag === "Failure") expect(Cause.pretty(exit.cause)).toContain(tag)
}
describe("actual durable escrow Store admission", () => {
  test("two existing handles share one atomic admission and one inference claim", async () => {
    const h = await setup(), a = h.open().store, b = h.open().store
    expect(a.escrow?.durability).toBe("durable")
    expect(await run(a.escrow!.admit(h.context, h.job))).toEqual({ created: true, jobId: h.job.id })
    expect(await run(b.escrow!.admit(h.context, h.job))).toEqual({ created: false, jobId: h.job.id })
    expect((await run(b.getJob(h.job.id)))?.input).toEqual(h.job.input)
    expect(await run(a.escrow!.begin(h.context, h.job.id))).toEqual({ claimed: true })
    expect(await run(b.escrow!.begin(h.context, h.job.id))).toEqual({ claimed: false })
    expect((await run(b.escrow!.get(h.job.id)))?.state).toBe("executing")
  })
  test("restart does not reap escrow or turn held money into an ordinary uncharged failure", async () => {
    const h = await setup(), a = h.open()
    expect(a.store.escrow?.durability).toBe("durable")
    await run(a.store.escrow!.admit(h.context, h.job))
    await run(a.store.escrow!.begin(h.context, h.job.id))
    await run(a.store.escrow!.uncertain(h.context, h.job.id))
    a.close()
    const b = h.open()
    expect(b.reaped).toBe(0)
    expect((await run(b.store.escrow!.get(h.job.id)))?.state).toBe("uncertain")
    expect(await run(b.store.escrow!.begin(h.context, h.job.id))).toEqual({ claimed: false })
    expect((await run(b.store.getJob(h.job.id)))?.status).toBe("running")
  })
  test("an identical verified request with a new candidate hub ID returns the original; changed context refuses", async () => {
    const h = await setup(), s = h.open().store, id = "job_" + "d".repeat(32)
    await run(s.escrow!.admit(h.context, h.job))
    expect(await run(s.escrow!.admit(h.context, Job.make({ ...h.job, id, rootJobId: id, createdAtMs: 1000001 })))).toEqual({ created: false, jobId: h.job.id })
    expect(await run(s.getJob(id))).toBeUndefined()
    await rejects(s.escrow!.admit({ ...h.context, requestHash: hashJson({ altered: true }) }, h.job))
    await rejects(s.escrow!.begin({ ...h.context, expiredAt: 3000 }, h.job.id))
    await rejects(s.escrow!.uncertain({ ...h.context, expiredAt: 3000 }, h.job.id))
    expect((await run(s.escrow!.get(h.job.id)))?.state).toBe("admitted")
  })
  test("preserves ordered input and literal bigint-tag-shaped buyer data through disk and returned-copy mutation", async () => {
    const h = await setup(), s = h.open().store
    await run(s.escrow!.admit(h.context, h.job))
    const first = (await run(s.getJob(h.job.id)))!
    expect(hashJson(first.input)).toBe(h.context.call.inputHash)
    expect(Object.keys(first.input as object)).toEqual(["z", "a"])
    ;(first.input as { z: number }).z = 99
    expect(hashJson((await run(s.getJob(h.job.id)))!.input)).toBe(h.context.call.inputHash)
    expect((await run(s.escrow!.get(h.job.id)))!.job.input).toEqual(h.job.input)
    const changedOrder = { a: { __bigint: "not a metadata bigint" }, z: 1 }
    await rejects(s.escrow!.admit(h.context, Job.make({ ...h.job, input: changedOrder })))
  })
  test("stale legacy job and receipt writers cannot overwrite escrow-owned evidence", async () => {
    const h = await setup(), a = h.open().store, b = h.open().store
    await run(a.escrow!.admit(h.context, h.job)); await run(a.escrow!.begin(h.context, h.job.id))
    await rejects(b.putJob(Job.make({ ...h.job, status: "failed" })))
    const r = Receipt.make({ jobId: h.job.id, skillId: h.job.skillId, skillVersion: "1.0.0", buyer: h.job.buyer, seller: h.job.seller,
      priceAtomic: h.job.priceAtomic, sellerAtomic: h.job.priceAtomic, feeAtomic: 0n, feeBps: 0, rail: "test",
      network: "eip155:5042002", latencyMs: 1, settled: false, reason: "not an escrow refund", createdAtMs: 1000001 })
    await rejects(b.putReceipt(r))
    expect(await run(b.allReceipts)).toEqual([])
    expect((await run(b.getJob(h.job.id)))?.status).toBe("running")
  })
  test("a failed second INSERT rolls back the queued row and leaves no published memory state", async () => {
    const h = await setup(), s = h.open().store, db = h.inspect()
    db.exec("CREATE TRIGGER reject_escrow_insert BEFORE INSERT ON escrow_admissions BEGIN SELECT RAISE(ABORT, 'owned fixture refusal'); END")
    await rejects(s.escrow!.admit(h.context, h.job), "EscrowStorageUnavailable")
    expect(db.query("SELECT * FROM jobs").all()).toEqual([])
    expect(db.query("SELECT * FROM escrow_admissions").all()).toEqual([])
    expect(await run(s.getJob(h.job.id))).toBeUndefined()
    db.exec("DROP TRIGGER reject_escrow_insert")
    expect(await run(s.escrow!.admit(h.context, h.job))).toEqual({ created: true, jobId: h.job.id })
  })
  test.each(["binding", "marker", "digest", "state", "context", "receipt"])("detects corrupt %s before reads or legacy restart reaping", async mode => {
    const h = await setup(), s = h.open().store, db = h.inspect()
    await run(s.escrow!.admit(h.context, h.job)); await run(s.escrow!.begin(h.context, h.job.id))
    if (mode === "binding") db.exec("DELETE FROM escrow_admissions")
    if (mode === "marker") db.exec("UPDATE jobs SET escrow_key = NULL")
    if (mode === "digest") db.exec("UPDATE escrow_admissions SET job_digest = 'wrong'")
    if (mode === "state") db.exec("UPDATE escrow_admissions SET state = 'settled'")
    if (mode === "context") db.exec("UPDATE escrow_admissions SET context_json = '{}'")
    if (mode === "receipt") db.query("INSERT INTO receipts (job_id,created_at_ms,json) VALUES (?,1,'{}')").run(h.job.id)
    await rejects(s.escrow!.get(h.job.id), "EscrowStorageUnavailable")
    expect(() => h.open()).toThrow(EscrowStorageUnavailable)
    expect(db.query<{ status: string }, []>("SELECT status FROM jobs").get()?.status).toBe("running")
  })
  test("an existing legacy job cannot be adopted as an escrow admission", async () => {
    const h = await setup(), s = h.open().store
    await run(s.putJob(h.job))
    await rejects(s.escrow!.admit(h.context, h.job))
    expect(await run(s.escrow!.get(h.job.id))).toBeUndefined()
    expect(h.inspect().query("SELECT escrow_key FROM jobs").get()).toEqual({ escrow_key: null })
  })
  test("volatile SQLite refuses admission rather than claiming durable execution authority", async () => {
    const h = await setup(), s = openSqliteStore(":memory:", "owned_volatile"); owned.push(s.close)
    expect(s.store.escrow?.durability).toBe("volatile")
    await rejects(s.store.escrow!.admit(h.context, h.job))
    expect(await run(s.store.getJob(h.job.id))).toBeUndefined()
  })
  test("a deferred failure at COMMIT rolls back both queued ownership and binding", async () => {
    const h = await setup(), s = h.open().store, db = h.inspect()
    db.exec(`CREATE TABLE owned_parent (id TEXT PRIMARY KEY);
      CREATE TABLE owned_guard (id TEXT REFERENCES owned_parent(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER owned_commit_abort AFTER INSERT ON escrow_admissions BEGIN INSERT INTO owned_guard VALUES ('missing'); END;`)
    await rejects(s.escrow!.admit(h.context, h.job), "EscrowStorageUnavailable")
    expect(db.query("SELECT * FROM jobs").all()).toEqual([])
    expect(db.query("SELECT * FROM escrow_admissions").all()).toEqual([])
    expect(await run(s.getJob(h.job.id))).toBeUndefined()
  })
  test("failed execution-state commit leaves the admitted job unchanged on both handles", async () => {
    const h = await setup(), a = h.open().store, b = h.open().store, db = h.inspect()
    await run(a.escrow!.admit(h.context, h.job))
    db.exec("CREATE TRIGGER reject_escrow_update BEFORE UPDATE ON escrow_admissions BEGIN SELECT RAISE(ABORT, 'private fixture diagnostic'); END")
    await rejects(a.escrow!.begin(h.context, h.job.id), "EscrowStorageUnavailable")
    expect((await run(b.escrow!.get(h.job.id)))?.state).toBe("admitted")
    expect((await run(b.getJob(h.job.id)))?.status).toBe("queued")
    db.exec("DROP TRIGGER reject_escrow_update")
    expect(await run(b.escrow!.begin(h.context, h.job.id))).toEqual({ claimed: true })
  })
  test("adds an ownership column to an old jobs table without rewriting existing evidence", async () => {
    const h = await setup(), db = h.inspect(), old = Job.make({ ...h.job, input: {}, status: "succeeded" })
    const json = JSON.stringify(old, (_key, value) => typeof value === "bigint" ? { __bigint: String(value) } : value)
    db.exec("CREATE TABLE jobs (id TEXT PRIMARY KEY,status TEXT NOT NULL,boot_id TEXT NOT NULL,created_at_ms INTEGER NOT NULL,json TEXT NOT NULL)")
    db.query("INSERT INTO jobs (id,status,boot_id,created_at_ms,json) VALUES (?,?,?,?,?)").run(old.id, old.status, "previous", old.createdAtMs, json)
    const s = h.open()
    expect(s.reaped).toBe(0)
    expect(db.query("SELECT json,escrow_key FROM jobs").get()).toEqual({ json, escrow_key: null })
    expect((await run(s.store.getJob(old.id)))?.priceAtomic).toBe(old.priceAtomic)
  })
  test("closed metadata, accessors, oversized UTF-8 and mismatching root jobs refuse before admission", async () => {
    const h = await setup(), s = h.open().store; let calls = 0
    const accessor = { ...h.job, get input() { calls++; throw Error("private getter") } }
    await rejects(s.escrow!.admit(h.context, accessor as Job)); expect(calls).toBe(0)
    await rejects(s.escrow!.admit(h.context, { ...h.job, unexpected: undefined } as Job))
    for (const changed of [{ status: "running" as const }, { parentJobId: "parent" }, { hop: 1 }, { priceAtomic: 1n }, { seller: h.context.client }])
      await rejects(s.escrow!.admit(h.context, Job.make({ ...h.job, ...changed })))
    const input = { text: "é".repeat(524288) }, context = { ...h.context, call: { ...h.context.call, inputHash: hashJson(input) } }
    await rejects(s.escrow!.admit(context, Job.make({ ...h.job, input })))
    expect(await run(s.getJob(h.job.id))).toBeUndefined()
  })
  test("10,000 retained bindings refuse the next admission without evicting evidence", async () => {
    const h = await setup(), s = h.open().store, db = h.inspect()
    await run(s.escrow!.admit(h.context, h.job))
    const original = db.query<{ json: string }, []>("SELECT json FROM jobs").get()!, template = JSON.parse(original.json)
    const insertJob = db.query("INSERT INTO jobs (id,status,boot_id,created_at_ms,json,escrow_key) VALUES (?,'queued','owned',?,?,?)")
    const insertBinding = db.query("INSERT INTO escrow_admissions (key,job_id,context_json,context_hash,state,job_digest) VALUES (?,?,?,?,'admitted',?)")
    db.transaction(() => {
      for (let n = 1; n <= 10000; n++) {
        if (BigInt(n) === h.context.jobId) continue
        const context = escrowActionContext({ ...h.context, jobId: BigInt(n) }), id = "job_" + n.toString(16).padStart(32, "0")
        const wire = { ...template, id, rootJobId: id }, key = `5042002:${context.call.escrow}:${n}`
        insertJob.run(id, h.job.createdAtMs, JSON.stringify(wire), key)
        insertBinding.run(key, id, JSON.stringify(escrowContextToWire(context)), escrowProviderContextHash(context), hashJson(wire))
      }
    }).immediate()
    const id = "job_" + "e".repeat(32)
    await rejects(s.escrow!.admit({ ...h.context, jobId: 10001n }, Job.make({ ...h.job, id, rootJobId: id })))
    expect(db.query("SELECT COUNT(*) AS n FROM escrow_admissions").get()).toEqual({ n: 10000 })
    expect(await run(s.escrow!.admit(h.context, h.job))).toEqual({ created: false, jobId: h.job.id })
  })
  test("closed database reads expose only fixed storage errors", async () => {
    const h = await setup(), s = h.open(); await run(s.store.escrow!.admit(h.context, h.job)); s.close()
    await rejects(s.store.escrow!.get(h.job.id), "EscrowStorageUnavailable")
    await rejects(s.store.getJob(h.job.id), "EscrowStorageUnavailable")
    await rejects(s.store.allReceipts, "EscrowStorageUnavailable")
  })
  test("ignored SQLite writes cannot report created or claimed authority", async () => {
    const h = await setup(), s = h.open().store, db = h.inspect()
    db.exec("CREATE TRIGGER ignore_admission BEFORE INSERT ON escrow_admissions BEGIN SELECT RAISE(IGNORE); END")
    await rejects(s.escrow!.admit(h.context, h.job), "EscrowStorageUnavailable")
    expect(db.query("SELECT * FROM jobs").all()).toEqual([])
    db.exec("DROP TRIGGER ignore_admission")
    await run(s.escrow!.admit(h.context, h.job))
    db.exec(`CREATE TRIGGER ignore_job_update BEFORE UPDATE ON jobs BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER ignore_admission_update BEFORE UPDATE ON escrow_admissions BEGIN SELECT RAISE(IGNORE); END;`)
    await rejects(s.escrow!.begin(h.context, h.job.id), "EscrowStorageUnavailable")
    expect((await run(s.escrow!.get(h.job.id)))?.state).toBe("admitted")
  })
})
