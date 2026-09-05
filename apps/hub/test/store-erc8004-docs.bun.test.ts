import { afterEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { Effect } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { StoreLive, StoreTag, type Erc8004DocKind } from "../src/store.ts"

const directories: string[] = [], handles = new Set<{ close(): void }>()
const path = () => { const dir = mkdtempSync(join(tmpdir(), "arcade-registry-docs-")); directories.push(dir); return join(dir, "hub.sqlite") }
const open = (file: string, boot = "boot") => { const opened = openSqliteStore(file, boot); handles.add(opened); return opened }
const inspect = (file: string) => { const db = new Database(file); handles.add(db); return db }
const close = (handle: { close(): void }) => { handle.close(); handles.delete(handle) }
afterEach(() => {
  for (const handle of handles) handle.close()
  handles.clear()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  directories.length = 0
})
const run = Effect.runPromise
const job = "job_documenttesttest01"
const bytes = '{\n "value": 1, "unicode": "é"\n}\n'

describe("durable immutable registry documents", () => {
  it("returns exact bytes across restart without a listing or runner", async () => {
    const file = path(), first = open(file)
    await run(first.store.putErc8004Doc(job, "feedback", bytes)); close(first)
    const second = open(file, "restart")
    expect(await run(second.store.getErc8004Doc(job, "feedback"))).toBe(bytes)
    expect(await run(second.store.getErc8004Doc(job, "validation-request"))).toBeUndefined()
    expect(await run(second.store.getErc8004Doc("missing", "feedback"))).toBeUndefined()
    expect(await run(second.store.allListings)).toEqual([]); expect(await run(second.store.allRunners)).toEqual([])
  })
  it("accepts identical retry bytes and refuses conflicting bytes without changing either copy", async () => {
    const file = path(), first = open(file)
    await run(first.store.putErc8004Doc(job, "feedback", bytes))
    await run(first.store.putErc8004Doc(job, "feedback", bytes))
    await expect(run(first.store.putErc8004Doc(job, "feedback", '{"value":2}'))).rejects.toThrow()
    expect(await run(first.store.getErc8004Doc(job, "feedback"))).toBe(bytes)
    expect(inspect(file).query("SELECT bytes FROM erc8004_docs").all()).toEqual([{ bytes }])
  })
  it("does not publish memory evidence when a database write fails", async () => {
    const file = path(), first = open(file), db = inspect(file)
    db.exec("CREATE TRIGGER reject_registry_doc BEFORE INSERT ON erc8004_docs BEGIN SELECT RAISE(ABORT, 'private disk diagnostic'); END")
    await expect(run(first.store.putErc8004Doc(job, "feedback", bytes))).rejects.toThrow()
    expect(await run(first.store.getErc8004Doc(job, "feedback"))).toBeUndefined()
    expect(db.query("SELECT bytes FROM erc8004_docs").all()).toEqual([])
    db.exec("DROP TRIGGER reject_registry_doc")
    await run(first.store.putErc8004Doc(job, "feedback", bytes))
    expect(await run(first.store.getErc8004Doc(job, "feedback"))).toBe(bytes)
  })
  it("refuses after a closed database without changing memory", async () => {
    const first = open(path()); close(first)
    await expect(run(first.store.putErc8004Doc(job, "feedback", bytes))).rejects.toThrow()
    expect(await run(first.store.getErc8004Doc(job, "feedback"))).toBeUndefined()
  })
  it("two already-open stores cannot confirm different bytes for the same key", async () => {
    const file = path(), first = open(file), second = open(file, "second")
    await run(first.store.putErc8004Doc(job, "feedback", bytes))
    await expect(run(second.store.putErc8004Doc(job, "feedback", '{"value":2}'))).rejects.toThrow()
    expect(await run(second.store.getErc8004Doc(job, "feedback"))).toBeUndefined()
    await run(second.store.putErc8004Doc(job, "feedback", bytes))
    expect(await run(second.store.getErc8004Doc(job, "feedback"))).toBe(bytes)
  })
  it("rejects malformed keys/kinds and non-object, invalid or oversized JSON before writing", async () => {
    const file = path(), first = open(file)
    for (const [id, kind, value] of [["../job", "feedback", "{}"], [job, "unknown", "{}"],
      [job, "feedback", "null"], [job, "feedback", "[]"], [job, "feedback", "not json"],
      [job, "feedback", JSON.stringify({ text: "x".repeat(1_048_576) })]]) {
      await expect(run(first.store.putErc8004Doc(id!, kind as Erc8004DocKind, value!))).rejects.toThrow()
    }
    expect(inspect(file).query("SELECT bytes FROM erc8004_docs").all()).toEqual([])
  })
  it("uses the same immutable conflict rule in the in-memory store", async () => {
    const store = await run(Effect.provide(StoreTag, StoreLive))
    await run(store.putErc8004Doc(job, "feedback", bytes)); await run(store.putErc8004Doc(job, "feedback", bytes))
    await expect(run(store.putErc8004Doc(job, "feedback", '{"v":2}'))).rejects.toThrow()
    expect(await run(store.getErc8004Doc(job, "feedback"))).toBe(bytes)
  })
})
