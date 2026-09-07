/** Durable inference ownership on the hub's existing SQLite connection. No RPC/signing. */
import type { Database } from "bun:sqlite"
import { openEscrowTree, type EscrowRootTreeState } from "./escrow-tree.ts"
import { Data, Effect } from "effect"
import { hashJson, Job } from "@arcade/core"
import { escrowActionContext, escrowCheck, escrowContextFromWire, escrowContextToWire,
  escrowProviderContextHash, EscrowFactsRefused, type EscrowActionContext } from "@arcade/payments"
import { captureEscrowTerminal, decodeEscrowTerminal, escrowTerminalWire, escrowReceiptWire,
  escrowJobWire as jobWire, decodeEscrowJob as decodeJob } from "./escrow-terminal.ts"
export class EscrowStoreRefused extends Data.TaggedError("EscrowStoreRefused") {}
export class EscrowStorageUnavailable extends Data.TaggedError("EscrowStorageUnavailable") {}
export interface EscrowAdmission {
  readonly context: EscrowActionContext; readonly job: Job
  readonly state: "admitted" | "executing" | "uncertain" | "settled" | "refunded"
}
export interface EscrowStore {
  readonly durability: "durable" | "volatile"
  readonly admit: (context: unknown, queued: Job) => Effect.Effect<{ created: boolean; jobId: string }, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly begin: (context: unknown, jobId: string) => Effect.Effect<{ claimed: boolean }, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly uncertain: (context: unknown, jobId: string) => Effect.Effect<void, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly finish: (context: unknown, terminal: unknown) => Effect.Effect<{ created: boolean }, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly get: (jobId: string) => Effect.Effect<EscrowAdmission | undefined, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly prepareTree: (context: unknown, jobId: string, ceilingAtomic: bigint) => Effect.Effect<void, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly closeTree: (context: unknown, jobId: string) => Effect.Effect<EscrowRootTreeState, EscrowStoreRefused | EscrowStorageUnavailable>
}
const keyOf = (c: EscrowActionContext) => `${c.call.chainId}:${c.call.escrow}:${c.jobId}`
const jobIdOf = (id: unknown): string => { escrowCheck(typeof id === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(id)); return id }
function matches(context: EscrowActionContext, job: Job) {
  const c = context.call
  jobIdOf(job.id)
  escrowCheck(job.skillId === c.skillId && job.seller === c.provider && job.buyer === context.client && job.priceAtomic === c.amount &&
    hashJson(job.input) === c.inputHash && job.rootJobId === job.id && job.hop === 0 && job.parentJobId === undefined &&
    job.ancestors?.length === 0 && Number.isSafeInteger(job.createdAtMs) && job.createdAtMs >= 0)
}
interface Row { key: string; job_id: string; context_json: string; context_hash: string; state: string; job_digest: string
  id: string; escrow_key: string; status: string; created_at_ms: number; json: string
  terminal_json: string | null; terminal_digest: string | null }
const SELECT = `SELECT escrow_admissions.*, jobs.id, jobs.escrow_key, jobs.status, jobs.created_at_ms, jobs.json
  FROM escrow_admissions JOIN jobs ON jobs.id = escrow_admissions.job_id`
/** Called before the legacy reaper or cache load. Migration never rewrites existing jobs. */
export function openEscrowStore(db: Database, bootId: string, durability: EscrowStore["durability"]) {
  let assertTreeBinding = (_id: string): void => {}
  if (!db.query<{ name: string }, []>("PRAGMA table_info(jobs)").all().some(c => c.name === "escrow_key")) db.exec("ALTER TABLE jobs ADD COLUMN escrow_key TEXT")
  db.exec(`CREATE TABLE IF NOT EXISTS escrow_admissions (
    key TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id), context_json TEXT NOT NULL,
    context_hash TEXT NOT NULL, state TEXT NOT NULL, job_digest TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_escrow_key ON jobs(escrow_key) WHERE escrow_key IS NOT NULL;`)
  for (const column of ["terminal_json", "terminal_digest"]) if (!db.query<{ name: string }, []>("PRAGMA table_info(escrow_admissions)").all().some(c => c.name === column))
    db.exec(`ALTER TABLE escrow_admissions ADD COLUMN ${column} TEXT`)
  db.exec(`CREATE TABLE IF NOT EXISTS escrow_terminal_refs (tx_hash TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES escrow_admissions(job_id), kind TEXT NOT NULL);`)
  const topology = () => {
    if ((db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM escrow_admissions").get()?.n ?? 10001) > 10000 ||
      db.query(`SELECT 1 FROM jobs LEFT JOIN escrow_admissions ON escrow_admissions.key = jobs.escrow_key
        WHERE jobs.escrow_key IS NOT NULL AND (escrow_admissions.job_id IS NULL OR escrow_admissions.job_id != jobs.id) LIMIT 1`).get() ||
      db.query(`SELECT 1 FROM escrow_admissions LEFT JOIN jobs ON jobs.id = escrow_admissions.job_id
        WHERE jobs.id IS NULL OR jobs.escrow_key IS NULL OR jobs.escrow_key != escrow_admissions.key LIMIT 1`).get() ||
      db.query("SELECT 1 FROM escrow_admissions JOIN session_calls ON session_calls.job_id = escrow_admissions.job_id LIMIT 1").get() ||
      db.query(`SELECT 1 FROM escrow_admissions LEFT JOIN receipts ON receipts.job_id = escrow_admissions.job_id
        WHERE state NOT IN ('admitted','executing','uncertain','settled','refunded') OR
        (state IN ('settled','refunded') AND terminal_json IS NULL) OR (state IN ('admitted','executing') AND terminal_json IS NOT NULL) OR
        (terminal_json IS NULL) != (terminal_digest IS NULL) OR (terminal_json IS NULL) != (receipts.job_id IS NULL) LIMIT 1`).get() ||
      (db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM escrow_terminal_refs").get()?.n ?? 20001) > 20000 ||
      db.query(`SELECT 1 FROM escrow_terminal_refs LEFT JOIN escrow_admissions ON escrow_admissions.job_id = escrow_terminal_refs.job_id
        WHERE escrow_admissions.job_id IS NULL OR terminal_json IS NULL LIMIT 1`).get()) throw new EscrowStorageUnavailable()
  }
  const capture = (row: Row): EscrowAdmission => {
    try {
      escrowCheck(Buffer.byteLength(row.context_json) <= 16384)
      const context = escrowContextFromWire(JSON.parse(row.context_json)), job = decodeJob(row.json)
      escrowCheck(JSON.stringify(escrowContextToWire(context)) === row.context_json && keyOf(context) === row.key &&
        row.escrow_key === row.key && row.id === row.job_id && row.id === job.id && row.status === job.status &&
        row.created_at_ms === job.createdAtMs && row.context_hash === escrowProviderContextHash(context) &&
        row.job_digest === hashJson(JSON.parse(row.json)) && ["admitted", "executing", "uncertain", "settled", "refunded"].includes(row.state))
      matches(context, job)
      assertTreeBinding(job.id)
      if (row.terminal_json === null) escrowCheck(job.outcome === undefined &&
        (row.state === "admitted" ? job.status === "queued" : row.state === "executing" ? job.status === "running" : row.state === "uncertain" && ["queued", "running"].includes(job.status)))
      else {
        const terminal = decodeEscrowTerminal(context, row.terminal_json), receipt = terminal.receipt
        const saved = db.query<{ json: string; created_at_ms: number; accrual_id: string | null }, [string]>("SELECT * FROM receipts WHERE job_id = ?").get(job.id)
        escrowCheck(row.terminal_digest === hashJson(JSON.parse(row.terminal_json)) && jobWire(terminal.job) === row.json &&
          row.state === receipt.escrow!.state && saved?.json === escrowReceiptWire(receipt) && saved.created_at_ms === receipt.createdAtMs && saved.accrual_id === null)
        const refs = db.query<{ tx_hash: string; kind: string }, [string]>("SELECT tx_hash,kind FROM escrow_terminal_refs WHERE job_id = ? LIMIT 3").all(job.id)
        const proofs = [terminal.proof, terminal.submission?.proof ?? null].filter(p => p !== null)
        escrowCheck(refs.length === proofs.length && proofs.every(p => refs.some(r => r.tx_hash === p.txHash && r.kind === p.kind)))
      }
      return { context, job, state: row.state as EscrowAdmission["state"] }
    } catch { throw new EscrowStorageUnavailable() }
  }
  db.transaction(() => { topology(); for (const row of db.query<Row, []>(SELECT + " LIMIT 10001").all()) capture(row) }).deferred()
  const read = (id: string) => {
    topology(); const row = db.query<Row, [string]>(SELECT + " WHERE escrow_admissions.job_id = ?").get(jobIdOf(id))
    return row === null ? undefined : capture(row)
  }
  const owned = (id: string) => {
    try {
      topology()
      return db.query("SELECT 1 FROM jobs WHERE id = ? AND escrow_key IS NOT NULL").get(id) !== null
    } catch { throw new EscrowStorageUnavailable() }
  }
  const effect = <A>(work: () => A): Effect.Effect<A, EscrowStoreRefused | EscrowStorageUnavailable> => Effect.uninterruptible(Effect.try({
    try: work, catch: error => error instanceof EscrowFactsRefused || error instanceof EscrowStoreRefused ? new EscrowStoreRefused() : new EscrowStorageUnavailable() }))
  const request = <A>(work: () => A): A => { try { return work() } catch { throw new EscrowStoreRefused() } }
  const admit = db.transaction((context: EscrowActionContext, job: Job) => {
    topology(); matches(context, job); escrowCheck(durability === "durable" && job.status === "queued" && job.outcome === undefined)
    const key = keyOf(context), existing = db.query<Row, [string]>(SELECT + " WHERE escrow_admissions.key = ?").get(key)
    if (existing) {
      capture(existing); escrowCheck(existing.context_hash === escrowProviderContextHash(context))
      return { created: false, jobId: existing.job_id }
    }
    escrowCheck(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM escrow_admissions").get()!.n < 10000 &&
      !db.query("SELECT 1 FROM jobs WHERE id = ?").get(job.id) && !db.query("SELECT 1 FROM receipts WHERE job_id = ?").get(job.id) &&
      !db.query("SELECT 1 FROM session_calls WHERE job_id = ?").get(job.id))
    const json = jobWire(job)
    db.query("INSERT INTO jobs (id,status,boot_id,created_at_ms,json,escrow_key) VALUES (?,?,?,?,?,?)")
      .run(job.id, job.status, bootId, job.createdAtMs, json, key)
    db.query("INSERT INTO escrow_admissions (key,job_id,context_json,context_hash,state,job_digest) VALUES (?,?,?,?,?,?)")
      .run(key, job.id, JSON.stringify(escrowContextToWire(context)), escrowProviderContextHash(context), "admitted", hashJson(JSON.parse(json)))
    const persisted = read(job.id)
    if (persisted?.state !== "admitted" || jobWire(persisted.job) !== json ||
      escrowProviderContextHash(persisted.context) !== escrowProviderContextHash(context)) throw new EscrowStorageUnavailable()
    return { created: true, jobId: job.id }
  })
  const transition = db.transaction((raw: unknown, id: string, kind: "begin" | "uncertain") => {
    escrowCheck(durability === "durable")
    const context = escrowActionContext(raw), previous = read(id)
    escrowCheck(previous !== undefined && escrowProviderContextHash(previous.context) === escrowProviderContextHash(context))
    if (kind === "begin" && previous.state !== "admitted") return { claimed: false }
    if (kind === "uncertain" && previous.state === "uncertain") return { claimed: false }
    escrowCheck(previous.state === "admitted" || previous.state === "executing")
    const job = kind === "begin" ? Job.make({ ...previous.job, status: "running" }) : previous.job, json = jobWire(job)
    db.query("UPDATE jobs SET status = ?, json = ?, boot_id = ? WHERE id = ? AND escrow_key = ?")
      .run(job.status, json, bootId, id, keyOf(context))
    db.query("UPDATE escrow_admissions SET state = ?, job_digest = ? WHERE key = ?")
      .run(kind === "begin" ? "executing" : "uncertain", hashJson(JSON.parse(json)), keyOf(context))
    const persisted = read(id)
    if (persisted?.state !== (kind === "begin" ? "executing" : "uncertain") || jobWire(persisted.job) !== json ||
      escrowProviderContextHash(persisted.context) !== escrowProviderContextHash(context)) throw new EscrowStorageUnavailable()
    return { claimed: kind === "begin" }
  })
  const finish = db.transaction((raw: unknown, rawTerminal: unknown) => {
    escrowCheck(durability === "durable")
    const context = request(() => escrowActionContext(raw)), terminal = request(() => captureEscrowTerminal(context, rawTerminal))
    const id = terminal.job.id, previous = read(id), json = escrowTerminalWire(terminal)
    escrowCheck(previous !== undefined && escrowProviderContextHash(previous.context) === escrowProviderContextHash(context))
    const existing = db.query<Row, [string]>(SELECT + " WHERE escrow_admissions.job_id = ?").get(id)!
    if (existing.terminal_json !== null) { escrowCheck(existing.terminal_json === json); return { created: false } }
    const rootTree = tree.snapshot(id)
    if (rootTree) {
      escrowCheck(rootTree.closed)
      if (terminal.receipt.escrow!.state !== "uncertain") {
        escrowCheck(rootTree.reservedAtomic === 0n)
        const children = terminal.receipt.children ?? [], committed = rootTree.children.filter(row => row.state === "committed")
        escrowCheck(children.length === committed.length && committed.every(row => children.some(child => child.jobId === row.childJobId &&
          child.priceAtomic === row.amountAtomic && child.settled)) && terminal.receipt.treeCeilingAtomic === rootTree.ceilingAtomic &&
          terminal.receipt.treeCommittedAtomic === rootTree.committedAtomic)
      }
    }
    escrowCheck(["admitted", "executing", "uncertain"].includes(previous.state) &&
      (terminal.receipt.escrow!.state !== "settled" || previous.state === "executing") &&
      (previous.state !== "uncertain" || terminal.receipt.escrow!.state === "uncertain") &&
      terminal.job.createdAtMs === previous.job.createdAtMs &&
      jobWire(Job.make({ ...terminal.job, status: previous.job.status, outcome: undefined })) === jobWire(previous.job))
    for (const p of [terminal.proof, terminal.submission?.proof ?? null]) if (p !== null) {
      escrowCheck(db.query("SELECT 1 FROM escrow_terminal_refs WHERE tx_hash = ?").get(p.txHash) === null)
      db.query("INSERT INTO escrow_terminal_refs (tx_hash,job_id,kind) VALUES (?,?,?)").run(p.txHash, id, p.kind)
    }
    db.query("INSERT INTO receipts (job_id,accrual_id,created_at_ms,json) VALUES (?,NULL,?,?)")
      .run(id, terminal.receipt.createdAtMs, escrowReceiptWire(terminal.receipt))
    const jobJson = jobWire(terminal.job)
    db.query("UPDATE jobs SET status = ?, json = ?, boot_id = ? WHERE id = ? AND escrow_key = ?")
      .run(terminal.job.status, jobJson, bootId, id, keyOf(context))
    db.query("UPDATE escrow_admissions SET state = ?, job_digest = ?, terminal_json = ?, terminal_digest = ? WHERE job_id = ?")
      .run(terminal.receipt.escrow!.state, hashJson(JSON.parse(jobJson)), json, hashJson(JSON.parse(json)), id)
    const persisted = read(id)
    if (persisted?.state !== terminal.receipt.escrow!.state || jobWire(persisted.job) !== jobJson ||
      db.query<{ terminal_json: string }, [string]>("SELECT terminal_json FROM escrow_admissions WHERE job_id = ?").get(id)?.terminal_json !== json)
      throw new EscrowStorageUnavailable()
    return { created: true }
  })
  const store: EscrowStore = Object.freeze<EscrowStore>({ durability,
    admit: (raw, queued) => effect(() => {
      const input = request(() => ({ context: escrowActionContext(raw), job: decodeJob(jobWire(queued)) }))
      return admit.immediate(input.context, input.job)
    }),
    begin: (context, id) => effect(() => transition.immediate(context, id, "begin")),
    uncertain: (context, id) => effect(() => { transition.immediate(context, id, "uncertain") }),
    finish: (context, terminal) => effect(() => finish.immediate(context, terminal)),
    get: id => effect(() => db.transaction(read).deferred(id)),
    prepareTree: (context, id, ceiling) => effect(() => { escrowCheck(durability === "durable"); tree.prepare(context, id, ceiling) }),
    closeTree: (context, id) => effect(() => { escrowCheck(durability === "durable"); return tree.close(context, id) }) })
  const tree = openEscrowTree(db, read)
  assertTreeBinding = tree.assertBinding
  return Object.freeze({ store, owned, tree,
    getReceipts: () => {
      try {
        topology()
        return db.query<Row, []>(SELECT + " WHERE terminal_json IS NOT NULL LIMIT 10001").all().map(row => {
          const value = capture(row); return decodeEscrowTerminal(value.context, row.terminal_json!).receipt
        })
      } catch { throw new EscrowStorageUnavailable() }
    },
    assertHealthy: () => { try { topology() } catch { throw new EscrowStorageUnavailable() } },
    getJob: (id: string) => { try { return db.transaction(read).deferred(id)?.job } catch { throw new EscrowStorageUnavailable() } } })
}
