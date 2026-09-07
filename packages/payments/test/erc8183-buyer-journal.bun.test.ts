import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { chmodSync, linkSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openEscrowBuyerJournal } from "../src/erc8183-buyer-journal.ts"
import { assertEscrowBuyerReceipt, assertEscrowBuyerSigned, assertEscrowBuyerBudgetReceipt } from "../src/erc8183-buyer-evidence.ts"
import { prepareEscrowBuyerAction } from "../src/erc8183-buyer-intent.ts"
import { buyerFixture, buyer, hash } from "./fixtures/erc8183-buyer.ts"
import { hashJson } from "@arcade/core"
async function temporary(work: (path: string) => Promise<void>) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "arcade-buyer-journal-test-"))); chmodSync(directory, 0o700)
  try { await work(join(directory, "purchase.sqlite")) } finally { rmSync(directory, { recursive: true, force: true }) }
}
const body = JSON.stringify({ fixture: true })
type Journal = ReturnType<typeof openEscrowBuyerJournal>["journal"]
async function step(kind: "create" | "approve" | "fund") {
  const f = await buyerFixture(kind), n = kind === "create" ? 0 : kind === "approve" ? 2 : 3,
    snapshot = { ...f.snapshot, blockNumber: 50n + BigInt(n), blockHash: hash(50 + n), timestamp: 1000 + n },
    before = kind === "create" ? { identity: f.intent.identity, chainId: 5042002, escrow: f.intent.call.escrow,
      blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash, timestamp: snapshot.timestamp } : snapshot,
    action = prepareEscrowBuyerAction(f.intent, before, kind === "create" ? { kind } :
      { kind, jobId: 7n, allowanceAtomic: kind === "approve" ? 0n : 300000n }, snapshot.timestamp),
    terms = { ...f.terms, nonce: kind === "create" ? 3 : kind === "approve" ? 4 : 5 },
    raw = await buyer.signTransaction({ ...f.transaction, nonce: terms.nonce }), signed = await assertEscrowBuyerSigned(action, raw, terms),
    blockNumber = 51n + BigInt(n), blockHash = hash(51 + n), receipt = { ...f.receipt, transactionHash: signed.hash, blockNumber, blockHash,
      logs: f.receipt.logs.map(l => ({ ...l, transactionHash: signed.hash, blockNumber, blockHash })) },
    tx = { ...f.tx, hash: signed.hash, nonce: terms.nonce, blockNumber, blockHash }, after = { ...f.after, blockNumber, blockHash, timestamp: 1001 + n },
    proof = assertEscrowBuyerReceipt(action, signed, tx, receipt, after, f.allowanceAtomic)
  return { ...f, action, before, preparedAt: snapshot.timestamp, terms, raw, signed, proof }
}
async function record(j: Journal, claim: { readonly id: string }, f: Awaited<ReturnType<typeof step>>) {
  await j.intent(claim, f.action, f.before, f.preparedAt, f.action.kind === "create" ? undefined : f.action.kind === "approve" ? 0n : 300000n)
  await j.prepared(claim, f.signed); await j.attempt(claim, f.signed.hash); await j.confirmed(claim, f.proof)
}
async function budget(j: Journal, claim: { readonly id: string }) {
  const f = await buyerFixture("budget"), blockNumber = 52n, blockHash = hash(52),
    receipt = { ...f.receipt, blockNumber, blockHash, logs: f.receipt.logs.map(l => ({ ...l, blockNumber, blockHash })) },
    tx = { ...f.tx, blockNumber, blockHash }, after = { ...f.after, blockNumber, blockHash, timestamp: 1002 }
  await j.httpAttempt(claim, "budget")
  const proof = await assertEscrowBuyerBudgetReceipt(f.intent, 7n, f.raw, tx, receipt, after)
  await j.budgetConfirmed(claim, proof); return proof
}
describe("one-purchase private buyer journal (owned SQLite, no network)", () => {
  test("durably owns one request, refuses second handles and never claims again after reopening", () => temporary(async path => {
    const f = await buyerFixture(), a = openEscrowBuyerJournal(path), b = openEscrowBuyerJournal(path)
    try {
      expect(statSync(path).mode & 0o777).toBe(0o600)
      const claimed = await a.journal.claim(f.input, body)
      expect(claimed).toBeDefined()
      expect(await b.journal.claim(f.input, body)).toBeUndefined()
      expect(await a.journal.claim(f.input, body)).toBeUndefined()
      expect(await b.journal.inspect()).toMatchObject({ state: "claimed", spentGasWei: 0n })
      await expect(b.journal.httpAttempt(claimed!, "budget")).rejects.toThrow("escrow_buyer_journal_unavailable")
      await a.journal.uncertain(claimed!)
      expect(await b.journal.inspect()).toMatchObject({ state: "uncertain" })
    } finally { a.close(); b.close() }
    const reopened = openEscrowBuyerJournal(path)
    try { expect(await reopened.journal.claim(f.input, body)).toBeUndefined(); expect(await reopened.journal.readAccepted()).toBeUndefined() }
    finally { reopened.close() }
  }))
  test("binds input bytes before any claim and keeps public status secret-free", () => temporary(async path => {
    const f = await buyerFixture(), a = openEscrowBuyerJournal(path)
    try {
      for (const invalid of ['{"fixture":false}', ' {"fixture":true}', "not JSON"]) {
        await expect(a.journal.claim(f.input, invalid)).rejects.toThrow("escrow_buyer_journal_unavailable")
        expect(await a.journal.inspect()).toEqual({ state: "empty" })
      }
      await a.journal.claim(f.input, body)
      const status = JSON.stringify(await a.journal.inspect(), (_, v) => typeof v === "bigint" ? v.toString() : v)
      expect(status).not.toContain(f.input.capability); expect(status).not.toContain(body)
      expect(status).not.toContain(f.raw); expect(status).not.toContain("token")
    } finally { a.close() }
  }))
  test("fences create phases, hashes and late writes after uncertainty", () => temporary(async path => {
    const f = await buyerFixture(), a = openEscrowBuyerJournal(path)
    const deployment = { identity: f.intent.identity, chainId: 5042002, escrow: f.intent.call.escrow,
      blockNumber: f.snapshot.blockNumber, blockHash: f.snapshot.blockHash, timestamp: f.snapshot.timestamp }
    try {
      const c = (await a.journal.claim(f.input, body))!
      await expect(a.journal.prepared(c, f.signed!)).rejects.toThrow("escrow_buyer_journal_unavailable")
      await a.journal.intent(c, f.action!, deployment, 1000)
      await a.journal.prepared(c, f.signed!)
      await expect(a.journal.attempt(c, "0x" + "09".repeat(32))).rejects.toThrow("escrow_buyer_journal_unavailable")
      await a.journal.attempt(c, f.signed!.hash)
      const proof = assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, f.receipt, f.after)
      await a.journal.confirmed(c, proof)
      expect(await a.journal.inspect()).toMatchObject({ state: "created", spentGasWei: 200000n })
      await a.journal.httpAttempt(c, "budget")
      await expect(a.journal.httpAttempt(c, "budget")).rejects.toThrow("escrow_buyer_journal_unavailable")
      await a.journal.uncertain(c)
      await expect(a.journal.httpAttempt(c, "root")).rejects.toThrow("escrow_buyer_journal_unavailable")
    } finally { a.close() }
  }))
  test("rejects broad permissions, unknown/corrupt schema and retained SQLite sidecars without recovery", () => temporary(async path => {
    const a = openEscrowBuyerJournal(path); a.close()
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      writeFileSync(path + suffix, "retained", { mode: 0o600 })
      expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
      expect(statSync(path + suffix).size).toBe(8)
      rmSync(path + suffix)
    }
    chmodSync(path, 0o644)
    expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
    chmodSync(path, 0o600)
    const db = new Database(path); db.exec("PRAGMA user_version=99"); db.close()
    expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
    expect(() => openEscrowBuyerJournal(":memory:")).toThrow("escrow_buyer_journal_unavailable")
  }))
  test("records all three exact buyer transactions and independent budget, then retains private result on reopen", () => temporary(async path => {
    const create = await step("create"), approve = await step("approve"), fund = await step("fund"), a = openEscrowBuyerJournal(path),
      jobId = "job_" + "a".repeat(32), token = "t".repeat(64), accepted = { jobId, token, pollUrl: `https://example.test/jobs/${jobId}/result?token=${token}` }
    try {
      const c = (await a.journal.claim(create.input, body))!
      await record(a.journal, c, create)
      await expect(a.journal.intent(c, approve.action, approve.before, approve.preparedAt, 0n)).rejects.toThrow("escrow_buyer_journal_unavailable")
      await budget(a.journal, c); await record(a.journal, c, approve); await record(a.journal, c, fund)
      expect(await a.journal.inspect()).toMatchObject({ state: "funded", spentGasWei: 600000n })
      await a.journal.httpAttempt(c, "root")
      await expect(a.journal.accepted(c, { ...accepted, pollUrl: accepted.pollUrl.replace("example.test", "elsewhere.test") }))
        .rejects.toThrow("escrow_buyer_journal_unavailable")
      await a.journal.accepted(c, accepted); await a.journal.uncertain(c)
      const status = await a.journal.inspect()
      expect(status).toMatchObject({ state: "accepted", spentGasWei: 600000n })
      expect("proofs" in status && status.proofs?.map(p => p.kind)).toEqual(["create", "budget", "approve", "fund"])
      expect(JSON.stringify(status, (_, v) => typeof v === "bigint" ? v.toString() : v)).not.toContain(token)
      expect(await a.journal.claim(create.input, body)).toBeUndefined()
    } finally { a.close() }
    const reopened = openEscrowBuyerJournal(path)
    try { expect(await reopened.journal.readAccepted()).toEqual(accepted); expect(await reopened.journal.claim(create.input, body)).toBeUndefined() }
    finally { reopened.close() }
  }))
  test("enforces remaining cumulative gas, sequential nonce and preflight time without altering durable phase on refusal", () => temporary(async path => {
    const create = await step("create"), approve = await step("approve"), a = openEscrowBuyerJournal(path)
    try {
      const c = (await a.journal.claim(create.input, body))!
      await record(a.journal, c, create); await budget(a.journal, c)
      await expect(a.journal.intent(c, approve.action, { ...approve.before, timestamp: 1000 }, 1000, 0n)).rejects.toThrow("escrow_buyer_journal_unavailable")
      await a.journal.intent(c, approve.action, approve.before, approve.preparedAt, 0n)
      const excessive = await assertEscrowBuyerSigned(approve.action, approve.raw, { ...approve.terms, gasCapWei: 6000000n })
      await expect(a.journal.prepared(c, excessive)).rejects.toThrow("escrow_buyer_journal_unavailable")
      const wrongNonceRaw = await buyer.signTransaction({ ...approve.transaction, nonce: 5 }),
        wrongNonce = await assertEscrowBuyerSigned(approve.action, wrongNonceRaw, { ...approve.terms, nonce: 5 })
      await expect(a.journal.prepared(c, wrongNonce)).rejects.toThrow("escrow_buyer_journal_unavailable")
      expect(await a.journal.inspect()).toMatchObject({ state: "approve_intended", spentGasWei: 200000n })
      await a.journal.prepared(c, approve.signed); await a.journal.attempt(c, approve.signed.hash)
      await expect(a.journal.confirmed(c, { ...approve.proof, gasWei: 2000001n })).rejects.toThrow("escrow_buyer_journal_unavailable")
      await a.journal.confirmed(c, approve.proof)
      expect(await a.journal.inspect()).toMatchObject({ state: "approved", spentGasWei: 400000n })
    } finally { a.close() }
  }))
  test("uncertainty wins against a pending signature verification and getters are never invoked", () => temporary(async path => {
    const f = await step("create"), a = openEscrowBuyerJournal(path); let reads = 0
    try {
      const c = (await a.journal.claim(f.input, body))!
      await expect(a.journal.intent(c, f.action, { ...f.before, get identity() { reads++; return f.intent.identity } }, 1000))
        .rejects.toThrow("escrow_buyer_journal_unavailable")
      await a.journal.intent(c, f.action, f.before, 1000)
      await expect(a.journal.prepared(c, { ...f.signed, get serialized() { reads++; return f.signed.serialized } })).rejects.toThrow("escrow_buyer_journal_unavailable")
      expect(reads).toBe(0)
      const pending = a.journal.prepared(c, f.signed); await a.journal.uncertain(c)
      await expect(pending).rejects.toThrow("escrow_buyer_journal_unavailable")
      expect(await a.journal.inspect()).toMatchObject({ state: "uncertain" })
    } finally { a.close() }
  }))
  test("rejects changed rows and file replacement while preserving private storage", () => temporary(async path => {
    const f = await buyerFixture(), a = openEscrowBuyerJournal(path)
    try {
      await a.journal.claim(f.input, body)
      renameSync(path, path + ".retained")
      await expect(a.journal.inspect()).rejects.toThrow("escrow_buyer_journal_unavailable")
      expect(statSync(path + ".retained").size).toBeGreaterThan(0)
    } finally { a.close() }
    renameSync(path + ".retained", path)
    const db = new Database(path); db.exec("UPDATE buyer_purchase SET json='{}'"); db.close()
    expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
  }))
  test("refuses hardlinks, broken sidecar symlinks, nonprivate parents and oversized files", () => temporary(async path => {
    const a = openEscrowBuyerJournal(path); a.close()
    linkSync(path, path + ".link")
    expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
    rmSync(path + ".link")
    symlinkSync(path + ".missing", path + "-journal")
    expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
    rmSync(path + "-journal")
    chmodSync(join(path, ".."), 0o755)
    expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
    chmodSync(join(path, ".."), 0o700)
    const before = readFileSync(path); truncateSync(path, 2097153)
    expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
    expect(before.length).toBeLessThan(2097153)
  }))
  test("rejects envelope overflow, excessive JSON nesting and buyer/evaluator aliasing before claim", () => temporary(async path => {
    const f = await buyerFixture(), a = openEscrowBuyerJournal(path)
    try {
      // Body fits by one byte; adding the real payment envelope must overflow.
      const bigInput = { text: "x".repeat(131060) }, inputHash = hashJson(bigInput), source = { ...f.input,
        call: { ...f.input.call, inputHash }, requirements: { ...f.input.requirements,
          extra: { ...f.input.requirements.extra, request: { ...f.input.requirements.extra.request as object, inputHash } } } }
      await expect(a.journal.claim(source, JSON.stringify(bigInput))).rejects.toThrow("escrow_buyer_journal_unavailable")
      await expect(a.journal.claim(f.input, "[".repeat(66) + "0" + "]".repeat(66))).rejects.toThrow("escrow_buyer_journal_unavailable")
      await expect(a.journal.claim({ ...f.input, client: f.intent.call.evaluator }, body)).rejects.toThrow("escrow_buyer_journal_unavailable")
      expect(await a.journal.inspect()).toEqual({ state: "empty" })
    } finally { a.close() }
  }))
  test("rejects invented/mixed monetary proofs, wrong jobs and duplicate relay hashes without advancing", () => temporary(async path => {
    const create = await step("create"), a = openEscrowBuyerJournal(path)
    try {
      const c = (await a.journal.claim(create.input, body))!
      await a.journal.intent(c, create.action, create.before, 1000); await a.journal.prepared(c, create.signed)
      await a.journal.attempt(c, create.signed.hash)
      for (const patch of [{ kind: "fund" }, { gasPayer: create.intent.call.evaluator }, { fundedAtomic: 300000n },
        { txHash: hash(99) }, { intentId: hash(99) }, { blockTimestamp: 2141 }, { gasWei: 2000001n }, { settlementKind: "onchain" }]) {
        await expect(a.journal.confirmed(c, { ...create.proof, ...patch })).rejects.toThrow("escrow_buyer_journal_unavailable")
      }
      await a.journal.confirmed(c, create.proof); await a.journal.httpAttempt(c, "budget")
      const f = await buyerFixture("budget"), proof = await assertEscrowBuyerBudgetReceipt(f.intent, 7n, f.raw, f.tx, f.receipt, f.after)
      for (const patch of [{ jobId: 8n }, { txHash: create.proof.txHash }, { gasPayer: create.intent.client }, { fundedAtomic: 300000n }]) {
        await expect(a.journal.budgetConfirmed(c, { ...proof, ...patch })).rejects.toThrow("escrow_buyer_journal_unavailable")
      }
      expect(await a.journal.inspect()).toMatchObject({ state: "budget_attempted", spentGasWei: 200000n })
    } finally { a.close() }
  }))
  test("reopening every create crash phase is read-only, including with a copied old claim", () => temporary(async path => {
    const f = await step("create"), a = openEscrowBuyerJournal(path), c = (await a.journal.claim(f.input, body))!
    const check = async (state: string) => {
      const b = openEscrowBuyerJournal(path)
      try {
        expect(await b.journal.inspect()).toMatchObject({ state })
        expect(await b.journal.claim(f.input, body)).toBeUndefined()
        await expect(b.journal.uncertain({ ...c })).rejects.toThrow("escrow_buyer_journal_unavailable")
      } finally { b.close() }
    }
    try {
      await check("claimed"); await a.journal.intent(c, f.action, f.before, 1000); await check("create_intended")
      await a.journal.prepared(c, f.signed); await check("create_prepared")
      await a.journal.attempt(c, f.signed.hash); await check("create_attempted")
      await a.journal.uncertain(c); await check("uncertain")
      await expect(a.journal.confirmed(c, f.proof)).rejects.toThrow("escrow_buyer_journal_unavailable")
    } finally { a.close() }
  }))
  test("does not alter an unrelated SQLite file while refusing its schema", () => temporary(async path => {
    const db = new Database(path); db.exec("CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('keep')"); db.close(); chmodSync(path, 0o600)
    const before = readFileSync(path)
    expect(() => openEscrowBuyerJournal(path)).toThrow("escrow_buyer_journal_unavailable")
    expect(readFileSync(path).equals(before)).toBe(true)
  }))
})
