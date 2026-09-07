/** Durable inference ownership on the hub's existing SQLite connection. No RPC/signing. */
import type { Database } from "bun:sqlite"
import { Data, Effect, Schema } from "effect"
import { docBytes, hashJson, Job } from "@arcade/core"
import { escrowActionContext, escrowCheck, escrowContextFromWire, escrowContextToWire,
  escrowProviderContextHash, EscrowFactsRefused, type EscrowActionContext } from "@arcade/payments"
export class EscrowStoreRefused extends Data.TaggedError("EscrowStoreRefused") {}
export class EscrowStorageUnavailable extends Data.TaggedError("EscrowStorageUnavailable") {}
export interface EscrowAdmission {
  readonly context: EscrowActionContext; readonly job: Job
  readonly state: "admitted" | "executing" | "uncertain"
}
export interface EscrowStore {
  readonly durability: "durable" | "volatile"
  readonly admit: (context: unknown, queued: Job) => Effect.Effect<{ created: boolean; jobId: string }, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly begin: (context: unknown, jobId: string) => Effect.Effect<{ claimed: boolean }, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly uncertain: (context: unknown, jobId: string) => Effect.Effect<void, EscrowStoreRefused | EscrowStorageUnavailable>
  readonly get: (jobId: string) => Effect.Effect<EscrowAdmission | undefined, EscrowStoreRefused | EscrowStorageUnavailable>
}
const keyOf = (c: EscrowActionContext) => `${c.call.chainId}:${c.call.escrow}:${c.jobId}`
const bytes = (value: unknown) => { const encoded = docBytes(value); escrowCheck(Buffer.byteLength(encoded) <= 1048576); return encoded }
const jobIdOf = (id: unknown): string => { escrowCheck(typeof id === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(id)); return id }
/** Preserve JSON input ordering and scope bigint conversion to priceAtomic ONLY. */
function jobWire(job: Job): string {
  const plain: Record<string, unknown> = {}
  escrowCheck(job && typeof job === "object" && [Object.prototype, Job.prototype].includes(Object.getPrototypeOf(job)))
  for (const key of Reflect.ownKeys(job)) {
    escrowCheck(typeof key === "string" && ["id", "skillId", "seller", "buyer", "priceAtomic", "input", "status", "createdAtMs",
      "outcome", "rootJobId", "parentJobId", "hop", "ancestors"].includes(key))
    const d = Object.getOwnPropertyDescriptor(job, key); escrowCheck(d && d.enumerable && "value" in d)
    if (d.value === undefined) continue
    if (key === "priceAtomic") {
      escrowCheck(typeof d.value === "bigint" && d.value > 0n && d.value < 2n ** 256n)
      plain[key] = String(d.value)
    } else plain[key] = d.value
  }
  return bytes(plain)
}
function decodeJob(encoded: string): Job {
  escrowCheck(Buffer.byteLength(encoded) <= 1048576)
  const wire = JSON.parse(encoded)
  escrowCheck(wire && typeof wire === "object" && !Array.isArray(wire) && typeof wire.priceAtomic === "string" && /^(0|[1-9][0-9]{0,77})$/.test(wire.priceAtomic))
  const job = Schema.decodeUnknownSync(Job, { onExcessProperty: "error" })({ ...wire, priceAtomic: BigInt(wire.priceAtomic) })
  escrowCheck(jobWire(job) === encoded); return job
}
function matches(context: EscrowActionContext, job: Job) {
  const c = context.call
  jobIdOf(job.id)
  escrowCheck(job.skillId === c.skillId && job.seller === c.provider && job.buyer === context.client && job.priceAtomic === c.amount &&
    hashJson(job.input) === c.inputHash && job.rootJobId === job.id && job.hop === 0 && job.parentJobId === undefined &&
    job.ancestors?.length === 0 && Number.isSafeInteger(job.createdAtMs) && job.createdAtMs >= 0 && job.outcome === undefined)
}
interface Row { key: string; job_id: string; context_json: string; context_hash: string; state: string; job_digest: string
  id: string; escrow_key: string; status: string; created_at_ms: number; json: string }
const SELECT = `SELECT escrow_admissions.*, jobs.id, jobs.escrow_key, jobs.status, jobs.created_at_ms, jobs.json
  FROM escrow_admissions JOIN jobs ON jobs.id = escrow_admissions.job_id`
/** Called before the legacy reaper or cache load. Migration never rewrites existing jobs. */
export function openEscrowStore(db: Database, bootId: string, durability: EscrowStore["durability"]) {
  if (!db.query<{ name: string }, []>("PRAGMA table_info(jobs)").all().some(c => c.name === "escrow_key")) db.exec("ALTER TABLE jobs ADD COLUMN escrow_key TEXT")
  db.exec(`CREATE TABLE IF NOT EXISTS escrow_admissions (
    key TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id), context_json TEXT NOT NULL,
    context_hash TEXT NOT NULL, state TEXT NOT NULL, job_digest TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_escrow_key ON jobs(escrow_key) WHERE escrow_key IS NOT NULL;`)
  const topology = () => {
    if ((db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM escrow_admissions").get()?.n ?? 10001) > 10000 ||
      db.query(`SELECT 1 FROM jobs LEFT JOIN escrow_admissions ON escrow_admissions.key = jobs.escrow_key
        WHERE jobs.escrow_key IS NOT NULL AND (escrow_admissions.job_id IS NULL OR escrow_admissions.job_id != jobs.id) LIMIT 1`).get() ||
      db.query(`SELECT 1 FROM escrow_admissions LEFT JOIN jobs ON jobs.id = escrow_admissions.job_id
        WHERE jobs.id IS NULL OR jobs.escrow_key IS NULL OR jobs.escrow_key != escrow_admissions.key LIMIT 1`).get() ||
      db.query("SELECT 1 FROM escrow_admissions JOIN session_calls ON session_calls.job_id = escrow_admissions.job_id LIMIT 1").get() ||
      db.query("SELECT 1 FROM escrow_admissions JOIN receipts ON receipts.job_id = escrow_admissions.job_id LIMIT 1").get()) throw new EscrowStorageUnavailable()
  }
  const capture = (row: Row): EscrowAdmission => {
    try {
      escrowCheck(Buffer.byteLength(row.context_json) <= 16384)
      const context = escrowContextFromWire(JSON.parse(row.context_json)), job = decodeJob(row.json)
      escrowCheck(JSON.stringify(escrowContextToWire(context)) === row.context_json && keyOf(context) === row.key &&
        row.escrow_key === row.key && row.id === row.job_id && row.id === job.id && row.status === job.status &&
        row.created_at_ms === job.createdAtMs && row.context_hash === escrowProviderContextHash(context) &&
        row.job_digest === hashJson(JSON.parse(row.json)) && ["admitted", "executing", "uncertain"].includes(row.state) &&
        (row.state === "admitted" ? job.status === "queued" : row.state === "executing" ? job.status === "running" : ["queued", "running"].includes(job.status)))
      matches(context, job)
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
    topology(); matches(context, job); escrowCheck(durability === "durable" && job.status === "queued")
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
  const store: EscrowStore = Object.freeze<EscrowStore>({ durability,
    admit: (raw, queued) => effect(() => {
      const input = request(() => ({ context: escrowActionContext(raw), job: decodeJob(jobWire(queued)) }))
      return admit.immediate(input.context, input.job)
    }),
    begin: (context, id) => effect(() => transition.immediate(context, id, "begin")),
    uncertain: (context, id) => effect(() => { transition.immediate(context, id, "uncertain") }),
    get: id => effect(() => db.transaction(read).deferred(id)) })
  return Object.freeze({ store, owned,
    assertHealthy: () => { try { topology() } catch { throw new EscrowStorageUnavailable() } },
    getJob: (id: string) => { try { return db.transaction(read).deferred(id)?.job } catch { throw new EscrowStorageUnavailable() } } })
}
