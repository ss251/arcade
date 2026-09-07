import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { chmodSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openEscrowActionJournal } from "../src/erc8183-journal.ts"
import { captureEscrowOperation, createEscrowExecutor, type EscrowExecutorDependencies } from "../src/erc8183-executor.ts"
import { assertEscrowActionReceipt } from "../src/erc8183-evidence.ts"
import { fixture, hash } from "./fixtures/erc8183-action.ts"
async function temporary(work: (path: string) => Promise<void>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-escrow-journal-test-"))); chmodSync(dir, 0o700)
  try { await work(join(dir, "actions.sqlite")) } finally { rmSync(dir, { recursive: true, force: true }) }
}
const operation = (f: Awaited<ReturnType<typeof fixture>>) => captureEscrowOperation(f.context,
  f.action.kind === "budget" ? { kind: "budget" } : f.action.kind === "submit" ? { kind: "submit", outputHash: f.action.outputHash } : f.input)
async function confirmation(j: ReturnType<typeof openEscrowActionJournal>["journal"], f: Awaited<ReturnType<typeof fixture>>) {
  const claim = await j.claim(f.context, operation(f)); expect(claim).toBeDefined()
  await j.intent(claim!, f.action); await j.prepared(claim!, f.signed); await j.attempt(claim!, f.signed.hash)
  await j.confirmed(claim!, assertEscrowActionReceipt(f.action, f.signed, f.mined, f.receipt, f.after))
  return claim!
}
describe("private SQLite escrow reservations (real disk, no network)", () => {
  test("reopens every crash stage and refuses duplicate and opposite actions", () => temporary(async path => {
    const f = await fixture("submit"), first = openEscrowActionJournal(path)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    const claim = await first.journal.claim(f.context, operation(f)); first.close()
    expect(claim).toBeDefined()
    for (const stage of ["claimed", "intended", "prepared", "attempted", "uncertain"]) {
      const handle = openEscrowActionJournal(path)
      try {
        expect(await handle.journal.claim(f.context, operation(f))).toBeUndefined()
        expect(await handle.journal.claim(f.context, { kind: "reject", reason: "timeout" })).toBeUndefined()
        if (stage === "claimed") await handle.journal.intent(claim!, f.action)
        if (stage === "intended") await handle.journal.prepared(claim!, f.signed)
        if (stage === "prepared") await handle.journal.attempt(claim!, f.signed.hash)
        if (stage === "attempted") await handle.journal.uncertain(claim!, f.signed.hash)
      } finally { handle.close() }
    }
  })),
  test("two handles cannot own the same job or evaluator across distinct jobs", () => temporary(async path => {
    const f = await fixture("submit"), a = openEscrowActionJournal(path), b = openEscrowActionJournal(path)
    try {
      const results = await Promise.all([a.journal.claim(f.context, operation(f)), b.journal.claim(f.context, operation(f))])
      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await b.journal.claim({ ...f.context, jobId: 8n }, operation(f))).toBeUndefined()
      await a.journal.uncertain(results.find(Boolean)!, undefined)
      expect(await b.journal.claim({ ...f.context, jobId: 8n }, operation(f))).toBeUndefined()
    } finally { a.close(); b.close() }
  })),
  test("confirmed Submit unlocks only a bound completion and confirmed terminal never reopens", () => temporary(async path => {
    const submit = await fixture("submit"), complete = await fixture(), a = openEscrowActionJournal(path)
    try { await confirmation(a.journal, submit) } finally { a.close() }
    const b = openEscrowActionJournal(path)
    try {
      const claim = await b.journal.claim(complete.context, operation(complete)); expect(claim).toBeDefined()
      expect(await b.journal.matchSubmission(claim!, hash(9), 1001)).toBe(true)
      expect(await b.journal.matchSubmission(claim!, hash(8), 1001)).toBe(false)
      expect(await b.journal.matchSubmission(claim!, hash(9), 900)).toBe(false)
      await b.journal.intent(claim!, complete.action); await b.journal.prepared(claim!, complete.signed)
      await b.journal.attempt(claim!, complete.signed.hash)
      const proof = assertEscrowActionReceipt(complete.action, complete.signed, complete.mined, complete.receipt,
        { ...complete.after, job: { ...complete.after.job, submittedAt: 1001 } })
      await expect(b.journal.confirmed(claim!, { ...proof, submittedAt: 900 })).rejects.toThrow("escrow_journal_unavailable")
      await b.journal.confirmed(claim!, proof)
      await b.journal.uncertain(claim!, complete.signed.hash) // Late cancellation cannot overwrite confirmation.
      expect(await b.journal.claim(complete.context, { kind: "reject", reason: "timeout" })).toBeUndefined()
      expect(await b.journal.claim({ ...complete.context, jobId: 8n }, { kind: "submit", outputHash: hash(9) })).toBeDefined()
    } finally { b.close() }
  })),
  test("late writes cannot advance an uncertain claim; a changed request cannot reuse a job", () => temporary(async path => {
    const f = await fixture("submit"), a = openEscrowActionJournal(path)
    try {
      const claim = await a.journal.claim(f.context, operation(f)); await a.journal.uncertain(claim!, undefined)
      await expect(a.journal.intent(claim!, f.action)).rejects.toThrow("escrow_journal_unavailable")
      await expect(a.journal.claim({ ...f.context, requestHash: hash(90) }, operation(f))).rejects.toThrow("escrow_journal_unavailable")
    } finally { a.close() }
  })),
  test("refuses corrupt rows, broad file permissions, and memory-backed paths", () => temporary(async path => {
    const f = await fixture("budget"), a = openEscrowActionJournal(path)
    try { await a.journal.claim(f.context, operation(f)) } finally { a.close() }
    const db = new Database(path); db.exec("UPDATE escrow_actions SET json='{}'"); db.close()
    expect(() => openEscrowActionJournal(path)).toThrow("escrow_journal_unavailable")
    chmodSync(path, 0o644)
    expect(() => openEscrowActionJournal(path)).toThrow("escrow_journal_unavailable")
    expect(() => openEscrowActionJournal(":memory:")).toThrow("escrow_journal_unavailable")
  })),
  test("refuses path replacement and a prepared write resolving after an uncertainty fence", () => temporary(async path => {
    const f = await fixture("submit"), a = openEscrowActionJournal(path)
    try {
      const claim = await a.journal.claim(f.context, operation(f)); await a.journal.intent(claim!, f.action)
      const late = a.journal.prepared(claim!, f.signed); await a.journal.uncertain(claim!, undefined)
      await expect(late).rejects.toThrow("escrow_journal_unavailable")
      renameSync(path, path + ".retained")
      await expect(a.journal.claim(f.context, operation(f))).rejects.toThrow("escrow_journal_unavailable")
    } finally { a.close() }
  })),
  test("coordinator plus real journal fences restart after success and an unknown single send", () => temporary(async path => {
    const f = await fixture("budget"), a = openEscrowActionJournal(path); let sends = 0
    const deps: EscrowExecutorDependencies = {
      signal: new AbortController().signal, deadlineMs: performance.now() + 30000, nowSeconds: () => 1000,
      identity: { escrow: f.context.call.escrow, hook: f.context.call.hook, evaluator: f.context.call.evaluator,
        token: f.context.call.token, treasury: f.context.treasury }, journal: a.journal,
      readJob: async () => f.snapshot, readJobAt: async () => f.after, providerCode: async () => "0x",
      providerNonceUsed: async () => false, providerAuthorization: async () => {
        if (!("nonce" in f.input)) throw Error("fixture")
        return { nonce: f.input.nonce, deadline: f.input.deadline, signature: f.input.signature }
      }, nonceState: async () => ({ latest: 3, pending: 3 }), transactionTerms: async () => f.terms,
      signTransaction: async () => f.raw, broadcast: async () => { sends++; return f.signed.hash },
      readReceipt: async () => f.receipt, readTransaction: async () => f.mined
    }
    try { expect((await createEscrowExecutor(deps).execute(f.context, operation(f))).kind).toBe("budget") }
    finally { a.close() }
    const b = openEscrowActionJournal(path)
    try {
      await expect(createEscrowExecutor({ ...deps, journal: b.journal }).execute(f.context, operation(f)))
        .rejects.toThrow("escrow_execution_refused")
      expect(sends).toBe(1)
      const submit = await fixture("submit")
      const submitDeps: EscrowExecutorDependencies = { ...deps, journal: b.journal, readJob: async () => submit.snapshot,
        signTransaction: async () => submit.raw, broadcast: async () => { sends++; throw Error("unknown response") },
        providerAuthorization: async () => {
          if (!("nonce" in submit.input)) throw Error("fixture")
          return { nonce: submit.input.nonce, deadline: submit.input.deadline, signature: submit.input.signature }
        } }
      await expect(createEscrowExecutor(submitDeps).execute(submit.context, operation(submit))).rejects.toThrow("escrow_execution_uncertain")
      expect(sends).toBe(2)
    } finally { b.close() }
    const c = openEscrowActionJournal(path)
    try {
      expect(await c.journal.claim(f.context, { kind: "reject", reason: "timeout" })).toBeUndefined()
      expect(await c.journal.claim(f.context, { kind: "submit", outputHash: hash(9) })).toBeUndefined()
      expect(sends).toBe(2)
    } finally { c.close() }
  }))
})
