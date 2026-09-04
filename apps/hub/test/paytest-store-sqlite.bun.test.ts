import { afterEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { Effect } from "effect"
import { Bounds, PublicListing } from "@arcade/core"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openSqliteStore, type SqliteStore } from "../src/store-sqlite.ts"
import { PAY_TEST_HISTORY, type PayTestRow } from "../src/store.ts"

const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const OTHER = "0x1111111111111111111111111111111111111111"
const directories: Array<string> = []
const handles = new Set<{ close: () => void }>()
const pathForTest = () => {
  const directory = mkdtempSync(join(tmpdir(), "arcade-paytest-"))
  directories.push(directory)
  return join(directory, "hub.sqlite")
}
const open = (path: string, boot: string) => {
  const opened = openSqliteStore(path, boot)
  handles.add(opened)
  return opened
}
const inspect = (path: string) => {
  const db = new Database(path)
  handles.add(db)
  return db
}
const close = (handle: { close: () => void }) => {
  handle.close()
  handles.delete(handle)
}
afterEach(() => {
  for (const handle of handles) handle.close()
  handles.clear()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  directories.length = 0
})

const listing = PublicListing.make({
  id: "usdc-flow-check", version: "0.1.0", serviceName: "Flow", description: "d", tags: [],
  price: "$0.01", bounds: Bounds.make({ timeoutSec: 30 }), inputSchema: {}, outputSchema: {}
})
const row = (atMs: number, ok = false, over: Partial<PayTestRow> = {}): PayTestRow => ({
  skillId: listing.id, seller: SELLER, atMs, jobId: `job_${atMs}`, ok,
  reason: ok ? "ok" : "private operator diagnostic",
  ...(ok ? { settleTx: `0x${atMs}` } : {}), ...over
})
const record = (opened: SqliteStore, entry: PayTestRow) => Effect.runSync(opened.store.recordPayTest(entry))
const state = (opened: SqliteStore, seller = SELLER, skillId = listing.id) =>
  Effect.runSync(opened.store.payTestState(skillId, seller))
const history = (opened: SqliteStore, seller = SELLER) =>
  Effect.runSync(opened.store.payTestHistory(listing.id, seller))
const announce = (opened: SqliteStore) => Effect.runSync(opened.store.putListing({
  listing, seller: SELLER, runnerId: "rnr_live", publishedAtMs: 10
}))

describe("durable pay-test evidence", () => {
  it("keeps a delist across restart/reconnect, then durably relists on a passing purchase", () => {
    const path = pathForTest()
    const first = open(path, "boot_1")
    announce(first)
    Effect.runSync(first.store.putRunner({ runnerId: "rnr_live", seller: SELLER, skillIds: [listing.id],
      maxConcurrency: 1, connectedAtMs: 1, lastSeenMs: 1, activeJobs: 0 }))
    for (const atMs of [1, 2, 3]) record(first, row(atMs))
    close(first)

    const second = open(path, "boot_2")
    expect(Effect.runSync(second.store.allListings)).toEqual([])
    expect(Effect.runSync(second.store.allRunners)).toEqual([])
    expect(Effect.runSync(second.store.allPayTested)).toHaveLength(1)
    announce(second)
    expect(Effect.runSync(second.store.getListing(listing.id))).toMatchObject({
      delisted: true, payTested: { jobId: "job_3", ok: false }
    })
    record(second, row(4, true))
    expect(Effect.runSync(second.store.getListing(listing.id)).delisted).toBe(false)
    close(second)

    const third = open(path, "boot_3")
    expect(state(third)).toMatchObject({ delisted: false, consecutiveFailures: 0,
      last: { jobId: "job_4", ok: true, settleTx: "0x4" } })
    expect(history(third)[0]).toEqual({ atMs: 1, jobId: "job_1", ok: false })
    expect(JSON.stringify(history(third))).not.toContain("operator diagnostic")
  })

  it("persists normalized sellers while isolating other sellers and skill ids", () => {
    const path = pathForTest()
    const first = open(path, "boot_1")
    for (const atMs of [1, 2, 3]) record(first, row(atMs, false, {
      seller: atMs % 2 ? SELLER : SELLER.toLowerCase()
    }))
    record(first, row(4, true, { seller: OTHER }))
    record(first, row(5, true, { skillId: "other-skill" }))
    close(first)

    const db = inspect(path)
    const sellers = db.query<{ seller: string }, []>("SELECT DISTINCT seller FROM pay_tests ORDER BY seller").all()
    expect(sellers).toEqual([{ seller: OTHER }, { seller: SELLER.toLowerCase() }])
    const second = open(path, "boot_2")
    expect(state(second, SELLER.toUpperCase()).delisted).toBe(true)
    expect(state(second, OTHER).delisted).toBe(false)
    expect(state(second, SELLER, "other-skill").last?.jobId).toBe("job_5")
    expect(Effect.runSync(second.store.allPayTested)).toHaveLength(3)
  })

  it("keeps the newest 100 disk rows and 20 memory rows with stable equal-time ordering", () => {
    const path = pathForTest()
    const first = open(path, "boot_1")
    for (let index = 1; index <= 130; index++) record(first, row(100, index === 130, {
      jobId: `job_${index}`, seller: index % 2 ? SELLER : SELLER.toLowerCase()
    }))
    expect(PAY_TEST_HISTORY).toBe(20)
    const before = history(first)
    expect(before.map((entry) => entry.jobId)).toEqual(Array.from({ length: 20 }, (_, i) => `job_${i + 111}`))
    const db = inspect(path)
    const rows = db.query<{ job_id: string }, []>("SELECT job_id FROM pay_tests ORDER BY at_ms, rowid").all()
    expect(rows).toHaveLength(100)
    expect(rows[0]?.job_id).toBe("job_31")
    expect(rows[99]?.job_id).toBe("job_130")
    close(first)

    const second = open(path, "boot_2")
    expect(history(second)).toEqual(before)
    expect(state(second).last?.jobId).toBe("job_130")
    expect(state(second).delisted).toBe(false)
  })

  it("prunes and restores by timestamp, not the arrival order of an older failure", () => {
    const path = pathForTest()
    const first = open(path, "boot_1")
    for (let atMs = 125; atMs >= 1; atMs--) record(first, row(atMs, atMs === 125))
    record(first, row(0))
    const before = history(first)
    expect(before.map((entry) => entry.atMs)).toEqual(Array.from({ length: 20 }, (_, i) => i + 106))
    expect(state(first).delisted).toBe(false)
    const db = inspect(path)
    const bounds = db.query<{ oldest: number; newest: number; count: number }, []>(
      "SELECT MIN(at_ms) AS oldest, MAX(at_ms) AS newest, COUNT(*) AS count FROM pay_tests"
    ).get()
    expect(bounds).toEqual({ oldest: 26, newest: 125, count: 100 })
    close(first)
    const second = open(path, "boot_2")
    expect(history(second)).toEqual(before)
    expect(state(second).last?.ok).toBe(true)
  })

  it("normalizes loaded historical rows and prunes their case variants as one seller", () => {
    const path = pathForTest()
    const first = open(path, "boot_1")
    const db = inspect(path)
    const insert = db.query("INSERT INTO pay_tests (skill_id, seller, at_ms, job_id, ok, reason) VALUES (?, ?, ?, ?, 0, 'offline')")
    for (let atMs = 1; atMs <= 100; atMs++) insert.run(listing.id,
      atMs % 2 ? SELLER : SELLER.toLowerCase(), atMs, `job_${atMs}`)
    close(first)
    const second = open(path, "boot_2")
    expect(Effect.runSync(second.store.allPayTested)[0]?.seller).toBe(SELLER.toLowerCase())
    expect(history(second)).toHaveLength(20)
    record(second, row(101, true))
    expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pay_tests").get()?.count).toBe(100)
    expect(db.query("SELECT job_id FROM pay_tests WHERE at_ms = 1").get()).toBeNull()
  })

  it("does not change memory when a closed database cannot persist the passing result", () => {
    const path = pathForTest()
    const first = open(path, "boot_1")
    for (const atMs of [1, 2, 3]) record(first, row(atMs))
    announce(first)
    const before = history(first)
    close(first)
    expect(Effect.runSyncExit(first.store.recordPayTest(row(4, true)))._tag).toBe("Failure")
    expect(history(first)).toEqual(before)
    expect(Effect.runSync(first.store.getListing(listing.id)).delisted).toBe(true)
    const second = open(path, "boot_2")
    expect(history(second)).toEqual(before)
  })

  it("does not mutate memory on insert failure and can retry after the database recovers", () => {
    const path = pathForTest()
    const first = open(path, "boot_1")
    for (const atMs of [1, 2, 3]) record(first, row(atMs))
    const before = history(first)
    const db = inspect(path)
    db.exec("CREATE TRIGGER reject_pay_test BEFORE INSERT ON pay_tests BEGIN SELECT RAISE(ABORT, 'test insert failure'); END")
    expect(Effect.runSyncExit(first.store.recordPayTest(row(4, true)))._tag).toBe("Failure")
    expect(history(first)).toEqual(before)
    expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pay_tests").get()?.count).toBe(3)
    db.exec("DROP TRIGGER reject_pay_test")
    record(first, row(4, true))
    expect(state(first).delisted).toBe(false)
    close(first)
    expect(state(open(path, "boot_2")).last?.jobId).toBe("job_4")
  })

  it("rolls back the insert too when pruning fails, before publishing any memory verdict", () => {
    const path = pathForTest()
    const first = open(path, "boot_1")
    for (let atMs = 1; atMs <= 100; atMs++) record(first, row(atMs))
    const before = history(first)
    const db = inspect(path)
    db.exec("CREATE TRIGGER reject_prune BEFORE DELETE ON pay_tests BEGIN SELECT RAISE(ABORT, 'test prune failure'); END")
    expect(Effect.runSyncExit(first.store.recordPayTest(row(101, true)))._tag).toBe("Failure")
    expect(history(first)).toEqual(before)
    expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pay_tests").get()?.count).toBe(100)
    expect(db.query("SELECT job_id FROM pay_tests WHERE at_ms = 101").get()).toBeNull()
    db.exec("DROP TRIGGER reject_prune")
    record(first, row(101, true))
    expect(history(first)).toHaveLength(20)
    expect(state(first).last?.jobId).toBe("job_101")
    expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pay_tests").get()?.count).toBe(100)
    close(first)
    expect(state(open(path, "boot_2")).delisted).toBe(false)
  })
})
