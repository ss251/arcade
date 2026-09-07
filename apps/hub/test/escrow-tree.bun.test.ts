import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { Cause, Effect } from "effect"
import { hashJson, Job } from "@arcade/core"
import { escrowActionContext } from "@arcade/payments"
import { fixture } from "../../../packages/payments/test/fixtures/erc8183-action.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { EscrowStorageUnavailable } from "../src/escrow-store.ts"
const owned: Array<() => void> = []
afterEach(() => { for (const close of owned.splice(0).reverse()) close() })
const run = Effect.runPromise, child = (n: number) => "job_" + String(n).padStart(32, "0")
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "arcade-escrow-tree-")), path = join(directory, "store.sqlite")
  owned.push(() => rmSync(directory, { recursive: true }))
  const open = () => { const s = openSqliteStore(path, "owned_tree_fixture"); let closed = false
    const close = () => { if (!closed) { closed = true; s.close() } }; owned.push(close); return { ...s, close } }
  const inspect = () => { const db = new Database(path); owned.push(() => db.close()); return db }
  const f = await fixture("submit"), input = { ordered: "fixture" }
  const context = escrowActionContext({ ...f.context, call: { ...f.context.call, inputHash: hashJson(input) } })
  const id = "job_" + "c".repeat(32), queued = Job.make({ id, skillId: context.call.skillId, seller: context.call.provider,
    buyer: context.client, priceAtomic: context.call.amount, input, status: "queued", createdAtMs: 1000000,
    rootJobId: id, hop: 0, ancestors: [] })
  const a = open(), b = open()
  await run(a.store.escrow!.admit(context, queued)); await run(a.store.escrow!.begin(context, id))
  return { open, inspect, a, b, context, id }
}
async function rejected(effect: Effect.Effect<unknown, unknown>, tag?: string) {
  const exit = await Effect.runPromiseExit(effect); expect(exit._tag).toBe("Failure")
  if (tag && exit._tag === "Failure") expect(Cause.pretty(exit.cause)).toContain(tag)
}
describe("durable escrow root tree closure", () => {
  test("two existing handles share the ceiling and closure; restart cannot reopen it", async () => {
    const h = await setup(), a = h.a.store, b = h.b.store
    expect(await run(a.reserveTree(h.id, child(1), 1n, 10n))).toBe(false)
    await run(a.escrow!.prepareTree(h.context, h.id, 10n))
    expect(await run(a.reserveTree(h.id, child(1), 6n, 10n))).toBe(true)
    expect(await run(b.reserveTree(h.id, child(2), 5n, 10n))).toBe(false)
    expect(await run(b.reserveTree(h.id, child(2), 4n, 11n))).toBe(false)
    expect(await run(b.reserveTree(h.id, child(2), 4n, 10n))).toBe(true)
    const closed = await run(b.escrow!.closeTree(h.context, h.id))
    expect(closed).toMatchObject({ closed: true, ceilingAtomic: 10n, reservedAtomic: 10n, committedAtomic: 0n })
    expect(await run(a.reserveTree(h.id, child(3), 1n, 10n))).toBe(false)
    await run(a.commitTree(child(1))); await run(b.releaseTree(child(2)))
    expect(await run(a.treeState(h.id))).toMatchObject({ reservedAtomic: 0n, committedAtomic: 6n })
    await run(b.commitTree(child(1)))
    await rejected(a.releaseTree(child(1))); await rejected(b.commitTree(child(2)))
    h.a.close(); h.b.close(); const c = h.open().store
    await run(c.escrow!.prepareTree(h.context, h.id, 10n))
    expect((await run(c.escrow!.closeTree(h.context, h.id))).closed).toBe(true)
    expect(await run(c.reserveTree(h.id, child(3), 1n, 10n))).toBe(false)
    await rejected(c.escrow!.prepareTree(h.context, h.id, 11n), "EscrowStoreRefused")
  })
  test("zero ceiling closes a genuine leaf without altering legacy roots", async () => {
    const h = await setup(), s = h.a.store
    await run(s.escrow!.prepareTree(h.context, h.id, 0n))
    expect(await run(s.reserveTree(h.id, child(1), 1n, 0n))).toBe(false)
    expect(await run(s.escrow!.closeTree(h.context, h.id))).toEqual({ closed: true, ceilingAtomic: 0n,
      children: [], reservedAtomic: 0n, committedAtomic: 0n })
    expect(await run(s.reserveTree("legacy", child(9), 3n, 3n))).toBe(true)
    await run(s.commitTree(child(9)))
    expect(await run(s.treeState("legacy"))).toMatchObject({ committedAtomic: 3n })
  })
  test.each(["header deleted", "ceiling", "closed", "digest", "binding deleted", "child deleted", "child amount", "child state"])("corrupt %s refuses current reads and restart", async mode => {
    const h = await setup(), s = h.a.store
    await run(s.escrow!.prepareTree(h.context, h.id, 10n)); await run(s.reserveTree(h.id, child(1), 4n, 10n))
    const db = h.inspect()
    if (mode === "header deleted") db.exec("DELETE FROM escrow_root_trees")
    if (mode === "ceiling") db.exec("UPDATE escrow_root_trees SET ceiling_atomic = '11'")
    if (mode === "closed") db.exec("UPDATE escrow_root_trees SET closed = 1")
    if (mode === "digest") db.exec("UPDATE escrow_admissions SET tree_digest = 'wrong'")
    if (mode === "binding deleted") db.exec("UPDATE escrow_admissions SET tree_digest = NULL")
    if (mode === "child deleted") db.exec("DELETE FROM tree_reservations")
    if (mode === "child amount") db.exec("UPDATE tree_reservations SET amount_atomic = '3'")
    if (mode === "child state") db.exec("UPDATE tree_reservations SET state = 'released'")
    await rejected(s.treeState(h.id)); await rejected(s.getJob(h.id), "EscrowStorageUnavailable")
    await rejected(s.escrow!.prepareTree(h.context, h.id, 10n), "EscrowStorageUnavailable")
    expect(() => h.open()).toThrow(EscrowStorageUnavailable)
  })
  test.each(["prepare", "reserve", "close", "transition", "digest", "commit"])("ignored/failed %s writes roll back without publishing authority", async mode => {
    const h = await setup(), s = h.a.store, db = h.inspect()
    if (mode !== "prepare") await run(s.escrow!.prepareTree(h.context, h.id, 10n))
    if (mode === "transition") await run(s.reserveTree(h.id, child(1), 4n, 10n))
    if (mode === "commit") db.exec(`CREATE TABLE owned_parent(id TEXT PRIMARY KEY);
      CREATE TABLE owned_child(id TEXT REFERENCES owned_parent(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER owned_failure AFTER INSERT ON tree_reservations BEGIN INSERT INTO owned_child VALUES('missing'); END;`)
    else {
      const [table, op] = mode === "prepare" ? ["escrow_root_trees", "INSERT"] : mode === "close" ? ["escrow_root_trees", "UPDATE"] :
        mode === "digest" ? ["escrow_admissions", "UPDATE"] : ["tree_reservations", mode === "transition" ? "UPDATE" : "INSERT"]
      db.exec(`CREATE TRIGGER owned_failure BEFORE ${op} ON ${table} BEGIN SELECT RAISE(IGNORE); END;`)
    }
    const work = mode === "prepare" ? s.escrow!.prepareTree(h.context, h.id, 10n) : mode === "close" ? s.escrow!.closeTree(h.context, h.id) :
      mode === "transition" ? s.commitTree(child(1)) : s.reserveTree(h.id, child(1), 4n, 10n)
    await rejected(work)
    const read = await run(h.b.store.treeState(h.id))
    expect(read.reservedAtomic).toBe(mode === "transition" ? 4n : 0n); expect(read.committedAtomic).toBe(0n)
    db.exec("DROP TRIGGER owned_failure")
    if (mode === "prepare") await run(s.escrow!.prepareTree(h.context, h.id, 10n))
    expect(await run(s.escrow!.closeTree(h.context, h.id))).toMatchObject({ closed: true, ceilingAtomic: 10n })
  })
  test("foreign contexts, existing child ownership and uncertainty never reopen admission", async () => {
    const h = await setup(), s = h.a.store
    const foreign = { ...h.context, expiredAt: h.context.expiredAt + 1 }
    await rejected(s.escrow!.prepareTree(foreign, h.id, 10n), "EscrowStoreRefused")
    await run(s.escrow!.prepareTree(h.context, h.id, 10n))
    await rejected(s.escrow!.closeTree(foreign, h.id), "EscrowStoreRefused")
    expect(await run(s.reserveTree(h.id, h.id, 1n, 10n))).toBe(false)
    await run(s.reserveTree(h.id, child(1), 4n, 10n))
    expect(await run(h.b.store.reserveTree("legacy", child(1), 1n, 10n))).toBe(false)
    expect(await run(s.reserveTree(h.id, child(1), 1n, 10n))).toBe(false)
    await run(s.escrow!.uncertain(h.context, h.id))
    expect(await run(s.reserveTree(h.id, child(2), 1n, 10n))).toBe(false)
    await run(s.escrow!.closeTree(h.context, h.id)); await run(s.commitTree(child(1)))
    expect((await run(s.treeState(h.id))).committedAtomic).toBe(4n)
  })
  test.each([-1n, 2n ** 256n])("invalid ceiling %s is refused before preparation", async ceiling => {
    const h = await setup()
    await rejected(h.a.store.escrow!.prepareTree(h.context, h.id, ceiling), "EscrowStoreRefused")
    expect(h.inspect().query("SELECT * FROM escrow_root_trees").all()).toEqual([])
  })
  test("returned snapshots cannot mutate the persistent closure or amounts", async () => {
    const h = await setup(), s = h.a.store
    await run(s.escrow!.prepareTree(h.context, h.id, 10n)); await run(s.reserveTree(h.id, child(1), 4n, 10n))
    const saved = await run(s.escrow!.closeTree(h.context, h.id))
    ;(saved as { closed: boolean }).closed = false
    ;(saved.children[0] as { amountAtomic: bigint }).amountAtomic = 1n
    expect((await run(s.escrow!.closeTree(h.context, h.id))).reservedAtomic).toBe(4n)
    expect(await run(s.reserveTree(h.id, child(2), 1n, 10n))).toBe(false)
  })
  test("1,000 retained children refuse the next reservation without eviction, even after release", async () => {
    const h = await setup(), s = h.a.store, db = h.inspect()
    await run(s.escrow!.prepareTree(h.context, h.id, 1000n))
    // Owned capacity fixture, not public input: seed canonical retained rows and their digest.
    db.transaction(() => {
      const insert = db.query("INSERT INTO tree_reservations VALUES (?,?,?,'released')")
      for (let n = 1; n <= 1000; n++) insert.run(child(n), h.id, "1")
      const header = db.query("SELECT * FROM escrow_root_trees").get()
      const rows = db.query("SELECT * FROM tree_reservations ORDER BY rowid").all()
      db.query("UPDATE escrow_admissions SET tree_digest = ? WHERE job_id = ?").run(hashJson({ header, rows }), h.id)
    }).immediate()
    expect((await run(s.treeState(h.id))).children).toHaveLength(1000)
    expect(await run(s.reserveTree(h.id, child(1001), 1n, 1000n))).toBe(false)
    expect((await run(h.b.store.treeState(h.id))).children).toHaveLength(1000)
  })
  test("a conflicting released child cannot be reused by another escrow root or legacy cache", async () => {
    const h = await setup(), s = h.a.store
    await run(s.escrow!.prepareTree(h.context, h.id, 10n)); await run(s.reserveTree(h.id, child(1), 4n, 10n))
    await run(s.releaseTree(child(1)))
    expect(await run(h.b.store.reserveTree("legacy", child(1), 1n, 10n))).toBe(false)
    expect(await run(s.reserveTree(h.id, child(1), 1n, 10n))).toBe(false)
  })
})
