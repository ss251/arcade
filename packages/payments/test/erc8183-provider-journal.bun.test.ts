import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { chmodSync, linkSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openEscrowProviderJournal } from "../src/erc8183-provider-journal.ts"
import { captureEscrowProviderIntent, escrowProviderTypedData } from "../src/erc8183-provider-intent.ts"
import { fixture, hash, provider, evaluator } from "./fixtures/erc8183-action.ts"
async function temporary(work: (path: string) => Promise<void>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-provider-journal-test-"))); chmodSync(dir, 0o700)
  try { await work(join(dir, "provider.sqlite")) } finally { rmSync(dir, { recursive: true, force: true }) }
}
async function intent(kind: "budget" | "submit" = "budget") {
  const f = await fixture(kind)
  return captureEscrowProviderIntent({ requestId: hash(kind === "budget" ? 101 : 102), context: f.context,
    kind, issuedAt: 1000, nonce: kind === "budget" ? 2n : 3n, deadline: 1600n,
    hubJobId: kind === "submit" ? "job_" + "a".repeat(32) : null, outputHash: kind === "submit" ? hash(9) : null })
}
describe("private provider signing journal (actual SQLite, ephemeral fixture signers)", () => {
  test("reopens claims, signatures and uncertainty without a replay API", () => temporary(async path => {
    const i = await intent(), first = openEscrowProviderJournal(path)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(Object.keys(first.journal).sort()).toEqual(["claim", "durability", "signed", "uncertain"])
    const c = await first.journal.claim(i); first.close(); expect(c).toBeDefined()
    const second = openEscrowProviderJournal(path)
    try {
      expect(await second.journal.claim(i)).toBeUndefined()
      await second.journal.signed(c!, await provider.signTypedData(escrowProviderTypedData(i)))
      await second.journal.uncertain(c!) // Does not erase a durably known signature.
    } finally { second.close() }
    const third = openEscrowProviderJournal(path)
    try {
      expect(await third.journal.claim({ ...i, requestId: hash(103), nonce: 4n })).toBeUndefined()
      expect(await third.journal.claim(await intent("submit"))).toBeDefined()
    } finally { third.close() }
    const bytes = readFileSync(path).toString()
    expect(bytes).toContain("arcade:erc8183:provider-intent:v1")
    expect(bytes).not.toContain("privateKey")
  }))
  test("two handles reserve a job exactly once, and retain request and nonce uniqueness", () => temporary(async path => {
    const i = await intent(), a = openEscrowProviderJournal(path), b = openEscrowProviderJournal(path)
    try {
      const results = await Promise.all([a.journal.claim(i), b.journal.claim(i)])
      expect(results.filter(Boolean)).toHaveLength(1)
      const next = { ...i, context: { ...i.context, jobId: 8n } }
      expect(await b.journal.claim({ ...next, requestId: hash(104) })).toBeUndefined()
      expect(await b.journal.claim({ ...next, nonce: 4n })).toBeUndefined()
      expect(await b.journal.claim({ ...next, nonce: 4n, requestId: hash(104) })).toBeDefined()
    } finally { a.close(); b.close() }
  }))
  test("uncertain budget fences submit and restart; changed binding cannot reuse job", () => temporary(async path => {
    const i = await intent(), a = openEscrowProviderJournal(path)
    const c = await a.journal.claim(i); await a.journal.uncertain(c!); a.close()
    const b = openEscrowProviderJournal(path)
    try {
      expect(await b.journal.claim(await intent("submit"))).toBeUndefined()
      await expect(b.journal.claim({ ...i, context: { ...i.context, requestHash: hash(90) } }))
        .rejects.toThrow("escrow_provider_journal_unavailable")
      await expect(b.journal.signed(c!, await provider.signTypedData(escrowProviderTypedData(i))))
        .rejects.toThrow("escrow_provider_journal_unavailable")
    } finally { b.close() }
  }))
  test("requires the actual provider and exact typed intent, including output, nonce and budget", () => temporary(async path => {
    const i = await intent("submit"), a = openEscrowProviderJournal(path), c = await a.journal.claim(i)
    try {
      for (const signature of ["0x", await evaluator.signTypedData(escrowProviderTypedData(i)),
        await provider.signTypedData(escrowProviderTypedData({ ...i, outputHash: hash(10) })),
        await provider.signTypedData(escrowProviderTypedData({ ...i, nonce: 4n }))]) {
        await expect(a.journal.signed(c!, signature)).rejects.toThrow("escrow_provider_journal_unavailable")
      }
      await a.journal.signed(c!, await provider.signTypedData(escrowProviderTypedData(i)))
      expect(await a.journal.claim(await intent())).toBeUndefined()
      await expect(a.journal.signed(c!, await provider.signTypedData(escrowProviderTypedData(i))))
        .rejects.toThrow("escrow_provider_journal_unavailable")
    } finally { a.close() }
  }))
  test("a late signature cannot cross an uncertainty fence on another handle", () => temporary(async path => {
    const i = await intent(), a = openEscrowProviderJournal(path), b = openEscrowProviderJournal(path)
    try {
      const c = await a.journal.claim(i), sig = await provider.signTypedData(escrowProviderTypedData(i))
      const late = a.journal.signed(c!, sig); await b.journal.uncertain(c!)
      await expect(late).rejects.toThrow("escrow_provider_journal_unavailable")
      expect(await b.journal.claim(i)).toBeUndefined()
    } finally { a.close(); b.close() }
  }))
  test("refuses malformed, widened, getter-bearing and incoherent intents before insert", () => temporary(async path => {
    const i = await intent(), a = openEscrowProviderJournal(path); let getters = 0
    try {
      for (const bad of [{ ...i, key: "not-a-secret" }, { ...i, nonce: 1n << 72n }, { ...i, deadline: 1601n },
        { ...i, issuedAt: 2 ** 48 - 1, deadline: (1n << 48n) + 599n }, { ...i, outputHash: hash(9) },
        { ...i, hubJobId: "job_" + "a".repeat(32) }, { ...i, requestId: hash(0) },
        { ...i, get context() { getters++; return i.context } }]) {
        await expect(a.journal.claim(bad)).rejects.toThrow("escrow_provider_journal_unavailable")
      }
      expect(getters).toBe(0); expect(await a.journal.claim(i)).toBeDefined()
    } finally { a.close() }
  }))
  test("refuses broad permissions, links, memory paths and path replacement without leaking paths", () => temporary(async path => {
    const i = await intent(), a = openEscrowProviderJournal(path)
    try {
      const c = await a.journal.claim(i)
      chmodSync(path, 0o644)
      await expect(a.journal.uncertain(c!)).rejects.toThrow(/^escrow_provider_journal_unavailable$/)
      chmodSync(path, 0o600)
      linkSync(path, path + ".hard")
      expect(() => openEscrowProviderJournal(path)).toThrow(/^escrow_provider_journal_unavailable$/)
      rmSync(path + ".hard")
      symlinkSync(path, path + ".link")
      expect(() => openEscrowProviderJournal(path + ".link")).toThrow(/^escrow_provider_journal_unavailable$/)
      renameSync(path, path + ".retained")
      await expect(a.journal.uncertain(c!)).rejects.toThrow(/^escrow_provider_journal_unavailable$/)
    } finally { a.close() }
    expect(() => openEscrowProviderJournal(":memory:")).toThrow(/^escrow_provider_journal_unavailable$/)
  }))
  test("refuses corrupted disk rows and operations after close", () => temporary(async path => {
    const i = await intent(), a = openEscrowProviderJournal(path), c = await a.journal.claim(i); a.close()
    await expect(a.journal.uncertain(c!)).rejects.toThrow(/^escrow_provider_journal_unavailable$/)
    const db = new Database(path); db.exec("UPDATE escrow_provider_signatures SET json='{}'"); db.close()
    expect(() => openEscrowProviderJournal(path)).toThrow(/^escrow_provider_journal_unavailable$/)
  }))
})
