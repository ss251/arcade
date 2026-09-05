import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, open, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensJournalPath, withEnsJournal, type EnsJournalEntry } from "../src/ens-journal.ts"

let directory: string, path: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "arcade-ens-journal-")); path = join(directory, "pending.json") })
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })
const entry: EnsJournalEntry = { chainId: 11155111, signer: `0x${"11".repeat(20)}`, op: "renew", target: `0x${"22".repeat(20)}`, resource: "42", value: "10000", stage: "intent" }
const hash = `0x${"aa".repeat(32)}`
describe("durable ENS write journal", () => {
  it("uses a distinct explicit sibling without repurposing HOME", () => {
    expect(ensJournalPath({ ARCADE_ENS_STATE: join(directory, "ens.json") })).toBe(join(directory, "ens-pending.json"))
    expect(ensJournalPath({ ARCADE_ENS_JOURNAL: path })).toBe(path)
    expect(() => ensJournalPath({ ARCADE_ENS_STATE: path, ARCADE_ENS_JOURNAL: path })).toThrow()
  })
  it("does not let an explicit journal replace the default state path either", () => {
    const defaultState = join(directory, ".arcade", "ens.json")
    // Inject an environment object only; never mutate the real HOME.
    expect(() => ensJournalPath({ HOME: directory, ARCADE_ENS_JOURNAL: defaultState })).toThrow()
  })
  it("retains intent, then hash, then confirmation across independent handles with private mode", async () => {
    await withEnsJournal(path, async journal => { expect(journal.entries).toEqual([]); await journal.set(entry) })
    await withEnsJournal(path, async journal => { expect(journal.entries).toEqual([entry]); await journal.set({ ...entry, stage: "submitted", txHash: hash }) })
    await withEnsJournal(path, async journal => { expect(journal.entries[0]?.txHash).toBe(hash); await journal.set({ ...entry, stage: "confirmed", txHash: hash }) })
    await withEnsJournal(path, async journal => expect(journal.entries[0]?.stage).toBe("confirmed"))
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })
  it("does not let concurrent writers enter an occupied transaction lock", async () => {
    let release!: () => void, entered!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    const first = withEnsJournal(path, async journal => { await journal.set(entry); entered(); await new Promise<void>(resolve => { release = resolve }) })
    await ready
    await expect(withEnsJournal(path, async () => {})).rejects.toThrow(/journal/)
    release(); await first
    await withEnsJournal(path, async journal => expect(journal.entries).toHaveLength(1))
  })
  it("rejects pending provenance changes and unproven confirmation without changing bytes", async () => {
    await withEnsJournal(path, journal => journal.set(entry))
    const before = await readFile(path, "utf8")
    for (const next of [{ ...entry, value: "10001" }, { ...entry, stage: "confirmed" as const, txHash: hash }, { ...entry, stage: "submitted" as const, txHash: "0x" }]) {
      await expect(withEnsJournal(path, journal => journal.set(next))).rejects.toThrow()
      expect(await readFile(path, "utf8")).toBe(before)
    }
  })
  it("never downgrades a confirmed checkpoint to submitted, even for identical transaction bytes", async () => {
    await withEnsJournal(path, async journal => {
      await journal.set(entry)
      await journal.set({ ...entry, stage: "submitted", txHash: hash })
      await journal.set({ ...entry, stage: "confirmed", txHash: hash })
    })
    const before = await readFile(path, "utf8")
    await expect(withEnsJournal(path, journal => journal.set({ ...entry, stage: "submitted", txHash: hash }))).rejects.toThrow()
    expect(await readFile(path, "utf8")).toBe(before)
  })
  it("rejects malformed, foreign, oversized, or secret-bearing input and symlinks", async () => {
    for (const raw of ['{"privateKey":"SECRET"}', "x".repeat(262145)]) {
      await writeFile(path, raw)
      await expect(withEnsJournal(path, async () => {})).rejects.toThrow()
      expect(await readFile(path, "utf8")).toBe(raw)
    }
    await rm(path)
    const target = join(directory, "unrelated.json")
    await writeFile(target, "preserve")
    await symlink(target, path)
    await expect(withEnsJournal(path, async () => {})).rejects.toThrow()
    expect(await readFile(target, "utf8")).toBe("preserve")
  })
  it("syncs the real file and directory before returning, and keeps memory unchanged on file sync failure", async () => {
    const probe = await open(join(directory, "probe"), "wx"), prototype = Object.getPrototypeOf(probe)
    await probe.close()
    const sync = prototype.sync
    const order: string[] = []
    const spy = vi.spyOn(prototype, "sync").mockImplementation(async function (this: Awaited<ReturnType<typeof open>>) {
      order.push((await this.stat()).isDirectory() ? "directory" : "file")
      return sync.call(this)
    })
    await withEnsJournal(path, journal => journal.set(entry))
    expect(order).toEqual(["file", "directory"])
    spy.mockRestore()
    vi.spyOn(prototype, "sync").mockImplementation(async function (this: Awaited<ReturnType<typeof open>>) {
      if ((await this.stat()).isFile()) throw new Error("SECRET filesystem")
      return sync.call(this)
    })
    await withEnsJournal(path, async journal => {
      await expect(journal.set({ ...entry, stage: "submitted", txHash: hash })).rejects.not.toThrow("SECRET")
      expect(journal.entries).toEqual([entry])
    })
    expect(JSON.parse(await readFile(path, "utf8")).entries).toEqual([entry])
  })
})
