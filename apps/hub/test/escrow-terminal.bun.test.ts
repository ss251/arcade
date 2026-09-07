import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { Cause, Effect } from "effect"
import { hashJson, Job, JobOutcome, Receipt } from "@arcade/core"
import { assertEscrowActionReceipt, escrowActionContext, escrowCompletionProjection } from "@arcade/payments"
import { fixture } from "../../../packages/payments/test/fixtures/erc8183-action.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { escrowTerminalEvidence } from "../src/escrow-terminal.ts"
import { EscrowStorageUnavailable } from "../src/escrow-store.ts"
const owned: Array<() => void> = []
afterEach(() => { for (const close of owned.splice(0).reverse()) close() })
const run = Effect.runPromise
async function setup(kind: "complete" | "reject" | "uncertain" = "complete") {
  const directory = mkdtempSync(join(tmpdir(), "arcade-escrow-terminal-")), path = join(directory, "store.sqlite")
  owned.push(() => rmSync(directory, { recursive: true }))
  const open = () => { const s = openSqliteStore(path, "owned_terminal_fixture"); let closed = false
    const close = () => { if (!closed) { closed = true; s.close() } }; owned.push(close); return { ...s, close } }
  const inspect = () => { const db = new Database(path); owned.push(() => db.close()); return db }
  const input = { z: 1, a: { __bigint: "literal" } }, output = { z: "ok", a: { __bigint: "literal" } }
  const options = { inputHash: hashJson(input), outputHash: hashJson(output), hubJobId: "job_" + "c".repeat(32) }
  const f = await fixture(kind === "reject" ? "reject" : "complete", 10001n, { ...options, submittedAt: 1001, timestamp: 1010, blockNumber: 60n })
  const submit = await fixture("submit", 10001n, options)
  const proofOf = (v: typeof f) => assertEscrowActionReceipt(v.action, v.signed, v.mined, v.receipt, v.after)
  const context = f.context, id = options.hubJobId
  const queued = Job.make({ id, skillId: context.call.skillId, seller: context.call.provider, buyer: context.client,
    priceAtomic: context.call.amount, input, status: "queued", createdAtMs: 990000, rootJobId: id, hop: 0, ancestors: [] })
  const outcome = JobOutcome.make({ status: kind === "complete" ? "succeeded" : "failed", output,
    startedAtMs: 990001, finishedAtMs: 999000 })
  const job = Job.make({ ...queued, status: outcome.status, outcome }), proof = kind === "uncertain" ? null : proofOf(f)
  const receipt = Receipt.make({ jobId: id, skillId: job.skillId, skillVersion: "1.0.0", buyer: job.buyer, seller: job.seller,
    priceAtomic: 10001n, sellerAtomic: 9501n, feeAtomic: 500n, feeBps: 500, rail: "erc8183", network: "eip155:5042002",
    latencyMs: 22000, settled: kind === "complete", reason: kind === "complete" ? "ok" : kind === "reject" ? "escrow refunded" : "escrow outcome uncertain; reconciliation required",
    createdAtMs: 1012000, rootJobId: id, hop: 0, ancestors: [], children: [],
    ...(kind === "complete" ? { settleTx: proof!.txHash, settleRefKind: "onchain" as const } : {}),
    escrow: escrowTerminalEvidence(context, proof) })
  const terminal = { job, receipt, proof, submission: kind === "complete" ? { proof: proofOf(submit), outputHash: options.outputHash } : null,
    completion: kind === "complete" ? f.action.receipt! : null }
  return { path, open, inspect, context, queued, terminal }
}
async function rejects<A, E>(effect: Effect.Effect<A, E>, tag = "EscrowStoreRefused") {
  const exit = await Effect.runPromiseExit(effect); expect(exit._tag).toBe("Failure")
  if (exit._tag === "Failure") expect(Cause.pretty(exit.cause)).toContain(tag)
}
describe("durable escrow terminal evidence", () => {
  test.each(["complete", "reject"] as const)("%s requires a closed prepared tree and exact actual accounting", async kind => {
    const h = await setup(kind), s = h.open().store, id = h.queued.id
    await run(s.escrow!.admit(h.context, h.queued)); await run(s.escrow!.begin(h.context, id))
    await run(s.escrow!.prepareTree(h.context, id, 0n))
    const terminal = { ...h.terminal, receipt: Receipt.make({ ...h.terminal.receipt, treeCeilingAtomic: 0n, treeCommittedAtomic: 0n }) }
    await rejects(s.escrow!.finish(h.context, terminal))
    await run(s.escrow!.closeTree(h.context, id))
    await rejects(s.escrow!.finish(h.context, { ...terminal, receipt: Receipt.make({ ...terminal.receipt, treeCeilingAtomic: 1n }) }))
    expect(await run(s.escrow!.finish(h.context, terminal))).toEqual({ created: true })
    expect(await run(s.reserveTree(id, "job_" + "z".repeat(32), 1n, 1n))).toBe(false)
  })
  test("pending closed-tree holds prevent confirmed terminal evidence but are not erased by uncertainty", async () => {
    const h = await setup("reject"), s = h.open().store, id = h.queued.id, child = "job_" + "z".repeat(32)
    await run(s.escrow!.admit(h.context, h.queued)); await run(s.escrow!.begin(h.context, id))
    await run(s.escrow!.prepareTree(h.context, id, 10n)); await run(s.reserveTree(id, child, 4n, 10n))
    await run(s.escrow!.closeTree(h.context, id))
    await rejects(s.escrow!.finish(h.context, h.terminal))
    const terminal = { ...h.terminal, proof: null, receipt: Receipt.make({ ...h.terminal.receipt,
      escrow: escrowTerminalEvidence(h.context, null), reason: "escrow outcome uncertain; reconciliation required" }) }
    await run(s.escrow!.finish(h.context, terminal))
    expect((await run(s.treeState(id))).reservedAtomic).toBe(4n)
    await run(s.commitTree(child))
    expect((await run(s.treeState(id))).committedAtomic).toBe(4n)
    expect((await run(s.allReceipts))[0]!.escrow?.state).toBe("uncertain")
  })
  test.each(["complete", "reject", "uncertain"] as const)("atomically records %s across two handles and restart", async kind => {
    const h = await setup(kind), a = h.open(), b = h.open()
    await run(a.store.escrow!.admit(h.context, h.queued)); await run(a.store.escrow!.begin(h.context, h.queued.id))
    expect(await run(a.store.escrow!.finish(h.context, h.terminal))).toEqual({ created: true })
    expect(await run(b.store.escrow!.finish(h.context, h.terminal))).toEqual({ created: false })
    expect((await run(b.store.getJob(h.queued.id)))?.outcome?.output).toEqual(h.terminal.job.outcome!.output)
    expect(await run(b.store.allReceipts)).toEqual([h.terminal.receipt])
    a.close(); b.close()
    const c = h.open(); expect(c.reaped).toBe(0)
    expect(await run(c.store.allReceipts)).toEqual([h.terminal.receipt])
    expect(await run(c.store.escrow!.begin(h.context, h.queued.id))).toEqual({ claimed: false })
    await rejects(c.store.putReceipt(h.terminal.receipt))
  })
  test.each(["receipt abort", "receipt ignore", "job ignore", "binding ignore", "reference ignore", "commit abort"])("rolls back every write on %s", async mode => {
    const h = await setup(), a = h.open().store, b = h.open().store, db = h.inspect()
    await run(a.escrow!.admit(h.context, h.queued)); await run(a.escrow!.begin(h.context, h.queued.id))
    const [table, action] = mode.startsWith("receipt") ? ["receipts", "INSERT"] : mode.startsWith("job") ? ["jobs", "UPDATE"] :
      mode.startsWith("binding") ? ["escrow_admissions", "UPDATE"] : ["escrow_terminal_refs", "INSERT"]
    if (mode === "commit abort") db.exec(`CREATE TABLE owned_parent (id TEXT PRIMARY KEY);
      CREATE TABLE owned_child (id TEXT REFERENCES owned_parent(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER owned_failure AFTER INSERT ON receipts BEGIN INSERT INTO owned_child VALUES ('missing'); END;`)
    else db.exec(`CREATE TRIGGER owned_failure BEFORE ${action} ON ${table} BEGIN SELECT RAISE(${mode.endsWith("ignore") ? "IGNORE" : "ABORT, 'owned private error'"}); END`)
    await rejects(a.escrow!.finish(h.context, h.terminal), "EscrowStorageUnavailable")
    expect(await run(b.allReceipts)).toEqual([])
    expect((await run(b.getJob(h.queued.id)))?.status).toBe("running")
    expect(db.query("SELECT * FROM escrow_terminal_refs").all()).toEqual([])
    expect(db.query("SELECT terminal_json,terminal_digest FROM escrow_admissions").get()).toEqual({ terminal_json: null, terminal_digest: null })
    db.exec("DROP TRIGGER owned_failure")
    expect(await run(a.escrow!.finish(h.context, h.terminal))).toEqual({ created: true })
  })
  test.each(["receipt missing", "receipt altered", "job altered", "digest", "terminal", "state", "ref missing", "ref altered"])("refuses corrupt %s on reads and restart", async mode => {
    const h = await setup(), s = h.open().store, db = h.inspect()
    await run(s.escrow!.admit(h.context, h.queued)); await run(s.escrow!.begin(h.context, h.queued.id)); await run(s.escrow!.finish(h.context, h.terminal))
    if (mode === "receipt missing") db.exec("DELETE FROM receipts")
    if (mode === "receipt altered") db.exec("UPDATE receipts SET json = '{}'")
    if (mode === "job altered") db.exec("UPDATE jobs SET status = 'failed'")
    if (mode === "digest") db.exec("UPDATE escrow_admissions SET terminal_digest = 'wrong'")
    if (mode === "terminal") db.exec("UPDATE escrow_admissions SET terminal_json = '{}'")
    if (mode === "state") db.exec("UPDATE escrow_admissions SET state = 'refunded'")
    if (mode === "ref missing") db.exec("DELETE FROM escrow_terminal_refs")
    if (mode === "ref altered") db.exec("UPDATE escrow_terminal_refs SET kind = 'reject'")
    await rejects(s.escrow!.get(h.queued.id), "EscrowStorageUnavailable")
    await rejects(s.allReceipts, "EscrowStorageUnavailable")
    expect(() => h.open()).toThrow(EscrowStorageUnavailable)
  })
  test("conflicting retries and uncertainty cannot rewrite or restart terminal work", async () => {
    const h = await setup(), s = h.open().store
    await run(s.escrow!.admit(h.context, h.queued)); await run(s.escrow!.begin(h.context, h.queued.id))
    await run(s.escrow!.uncertain(h.context, h.queued.id))
    await rejects(s.escrow!.finish(h.context, h.terminal))
    expect(await run(s.allReceipts)).toEqual([])
    expect(await run(s.escrow!.begin(h.context, h.queued.id))).toEqual({ claimed: false })
    const evidence = escrowTerminalEvidence(h.context, null)
    const uncertain = { ...h.terminal, proof: null, submission: null, completion: null, receipt: Receipt.make({ ...h.terminal.receipt,
      settled: false, reason: "escrow outcome uncertain; reconciliation required", settleTx: undefined, settleRefKind: undefined, escrow: evidence }) }
    expect(await run(s.escrow!.finish(h.context, uncertain))).toEqual({ created: true })
    await rejects(s.escrow!.finish(h.context, h.terminal))
    await rejects(s.escrow!.finish(h.context, { ...uncertain, receipt: { ...uncertain.receipt, latencyMs: 22001, createdAtMs: 1012001 } }))
    await run(s.escrow!.uncertain(h.context, h.queued.id))
    expect((await run(s.allReceipts))[0]?.escrow?.state).toBe("uncertain")
  })
  test.each(["output", "input order", "submit output", "submit time", "submit money", "projection", "tree", "quote fee", "outer identity", "legacy nonce", "missing metadata", "refusal", "premature receipt", "context"])("refuses inconsistent %s before any terminal write", async mode => {
    const h = await setup(), s = h.open().store
    await run(s.escrow!.admit(h.context, h.queued)); await run(s.escrow!.begin(h.context, h.queued.id))
    const t = h.terminal
    const changed = mode === "output" ? { ...t, job: { ...t.job, outcome: { ...t.job.outcome!, output: { other: true } } } } :
      mode === "input order" ? { ...t, job: { ...t.job, input: { a: { __bigint: "literal" }, z: 1 } } } :
      mode === "submit output" ? { ...t, submission: { ...t.submission!, outputHash: hashJson({ wrong: true }) } } :
      mode === "submit time" ? { ...t, submission: { ...t.submission!, proof: { ...t.submission!.proof, blockNumber: t.proof!.blockNumber } } } :
      mode === "submit money" ? { ...t, submission: { ...t.submission!, proof: { ...t.submission!.proof, sellerAtomic: 1n } } } :
      mode === "projection" ? { ...t, completion: { ...t.completion!, hash: hashJson({ wrong: true }) } } :
      mode === "tree" ? { ...t, receipt: { ...t.receipt, treeHash: hashJson({ wrong: true }) } } :
      mode === "quote fee" ? { ...t, receipt: { ...t.receipt, sellerAtomic: 9500n, feeAtomic: 501n } } :
      mode === "outer identity" ? { ...t, receipt: { ...t.receipt, rail: "eip3009" } } :
      mode === "legacy nonce" ? { ...t, receipt: { ...t.receipt, authorizationNonce: "synthetic" } } :
      mode === "missing metadata" ? { ...t, receipt: { ...t.receipt, escrow: undefined } } :
      mode === "refusal" ? { ...t, job: { ...t.job, outcome: { ...t.job.outcome!, stopReason: "refusal:fixture" } } } :
      mode === "premature receipt" ? { ...t, receipt: { ...t.receipt, createdAtMs: 1000000, latencyMs: 10000 } } : t
    await rejects(s.escrow!.finish(mode === "context" ? { ...h.context, expiredAt: 2001 } : h.context, changed))
    expect(await run(s.allReceipts)).toEqual([])
    expect((await run(s.getJob(h.queued.id)))?.status).toBe("running")
  })
  test("no terminal getters execute and returned receipts cannot mutate disk evidence", async () => {
    const h = await setup(), s = h.open().store; let calls = 0
    await run(s.escrow!.admit(h.context, h.queued)); await run(s.escrow!.begin(h.context, h.queued.id))
    const malicious = { ...h.terminal, get proof() { calls++; throw Error("owned getter") } }
    await rejects(s.escrow!.finish(h.context, malicious)); expect(calls).toBe(0)
    const receipt = { ...h.terminal.receipt, escrow: { get state() { calls++; return "settled" } } }
    await rejects(s.escrow!.finish(h.context, { ...h.terminal, receipt })); expect(calls).toBe(0)
    await run(s.escrow!.finish(h.context, h.terminal))
    const read = (await run(s.allReceipts))[0]!
    ;(read as unknown as { reason: string }).reason = "changed"
    expect((await run(s.allReceipts))[0]!.reason).toBe("ok")
    await rejects(s.escrow!.uncertain(h.context, h.queued.id))
  })
  test.each(["complete", "submit"])("a %s transaction cannot become evidence for a second job", async mode => {
    const h = await setup(), s = h.open().store
    await run(s.escrow!.admit(h.context, h.queued)); await run(s.escrow!.begin(h.context, h.queued.id)); await run(s.escrow!.finish(h.context, h.terminal))
    const context = escrowActionContext({ ...h.context, jobId: 8n }), id = "job_" + "d".repeat(32)
    const queued = Job.make({ ...h.queued, id, rootJobId: id }), job = Job.make({ ...h.terminal.job, id, rootJobId: id })
    await run(s.escrow!.admit(context, queued)); await run(s.escrow!.begin(context, id))
    // Deliberately forged second-job claim; not presented as a verified chain proof.
    const proof = mode === "complete" ? h.terminal.proof! : { ...h.terminal.proof!, txHash: hashJson({ different: true }) }
    const receipt = Receipt.make({ ...h.terminal.receipt, jobId: id, rootJobId: id, settleTx: proof.txHash, escrow: escrowTerminalEvidence(context, proof) })
    const completion = escrowCompletionProjection(context, { hubJobId: id, outputHash: hashJson(job.outcome!.output), ...h.terminal.completion!.tree })
    await rejects(s.escrow!.finish(context, { ...h.terminal, job, receipt, proof, completion }))
    expect((await run(s.allReceipts)).length).toBe(1)
    expect((await run(s.getJob(id)))?.status).toBe("running")
    expect(h.inspect().query("SELECT * FROM escrow_terminal_refs").all().length).toBe(2)
  })
  test("confirmed refund can close admitted work but completion requires a claimed execution", async () => {
    const complete = await setup(), a = complete.open().store
    await run(a.escrow!.admit(complete.context, complete.queued))
    await rejects(a.escrow!.finish(complete.context, complete.terminal))
    const refund = await setup("reject"), b = refund.open().store
    await run(b.escrow!.admit(refund.context, refund.queued))
    expect(await run(b.escrow!.finish(refund.context, refund.terminal))).toEqual({ created: true })
  })
})
