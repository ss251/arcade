import { Database } from "bun:sqlite"
import { Effect, Layer, Ref, Schema } from "effect"
import { Job, Rating, Receipt } from "@arcade/core"
import { StoreTag, makeStore, type Store, type StoreState } from "./store.ts"

/**
 * Durable hub state.
 *
 * **What persists, and what deliberately does not.** Receipts, ratings and jobs are
 * evidence — a buyer holds a `job_token` for work they paid for, and the marketplace page
 * is only credible because its statistics are computed from settled receipts. Those must
 * survive a restart.
 *
 * Listings and runners must NOT. A listing is only valid while its runner is connected,
 * and restoring one from disk would advertise a skill nobody is serving — the exact
 * property `/openapi.json`, `/.well-known/x402` and `/skill.md` are built to guarantee.
 * Runners dial out with backoff and re-announce within seconds of the hub returning, so
 * the live set rebuilds itself from the only source that can be right about it.
 *
 * **Write-through over the in-memory store, not a SQL reimplementation.** Reads keep the
 * existing implementation — including the percentile and stats logic that is already
 * tested — and every mutation is mirrored to sqlite. The tradeoff is stated rather than
 * hidden: the working set lives in memory, so this is a durable snapshot rather than a
 * database, and it is sized for a hub with thousands of receipts, not millions. Swapping
 * in a real SQL store later means replacing one Layer, which is the same shape as the
 * rails.
 *
 * **Boot reaping.** `pipeline.ts` writes a job row exactly once, when the job finishes, so
 * before this change an interrupted job left NO row at all — and the poll endpoint
 * answers "pending" when it cannot find one. A buyer whose job was in flight when the hub
 * restarted would poll forever, never receiving a terminal answer. The job row is now
 * written at dispatch, which is what makes the second half possible: on boot, any row
 * still in a non-terminal state belongs to a process that is gone, and is reaped to
 * `failed`. Nothing was settled, so the buyer was never charged and the receipt reads
 * `settled=false` for the same reason as any other failure path.
 *
 * The residual is the seller's: their runner may have burned inference on a job the hub
 * has now given up on, and will find its result dropped. That is the mirror of the
 * settle-on-success guarantee and it is logged rather than papered over.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS receipts (
  job_id TEXT PRIMARY KEY,
  accrual_id TEXT,
  created_at_ms INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ratings (
  receipt_job_id TEXT PRIMARY KEY,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
`

/**
 * Money is `Schema.BigIntFromSelf`, whose encoded form is still a bigint — and
 * `JSON.stringify` throws on those rather than quietly losing them. Tagging them on the
 * way out and reviving on the way in keeps atomic units exact; going through `Number`
 * would silently round every amount above 2^53 and produce a receipt that does not match
 * the chain.
 */
const toJson = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? { __bigint: val.toString() } : val))

const fromJson = (s: string): unknown =>
  JSON.parse(s, (_k, val) => {
    if (val !== null && typeof val === "object" && typeof (val as { __bigint?: unknown }).__bigint === "string") {
      return BigInt((val as { __bigint: string }).__bigint)
    }
    return val
  })

// Decoding validates on the way back in, so a row corrupted or written by an older schema
// fails loudly at boot rather than becoming a malformed receipt on the public page.
const decodeJob = Schema.decodeUnknownSync(Job)
const decodeReceiptRow = Schema.decodeUnknownSync(Receipt)
const decodeRating = Schema.decodeUnknownSync(Rating)

export interface SqliteStore {
  readonly store: Store
  readonly reaped: number
  readonly bootId: string
  readonly close: () => void
}

export const openSqliteStore = (path: string, bootId: string): SqliteStore => {
  const db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode = WAL")
  db.exec(SCHEMA)

  // Anything non-terminal was left behind by a process that no longer exists. `boot_id`
  // makes that a fact on the row rather than something inferred from a timestamp, so the
  // log can name which boot abandoned the work.
  const stale = db
    .query<{ id: string; json: string; boot_id: string }, []>(
      `SELECT id, json, boot_id FROM jobs WHERE status IN ('queued','running')`
    )
    .all()

  for (const row of stale) {
    const job = decodeJob(fromJson(row.json)) as Job
    const reaped = Job.make({
      ...job,
      status: "failed",
      outcome: job.outcome ?? undefined
    })
    db.query(`UPDATE jobs SET status = 'failed', json = ? WHERE id = ?`).run(
      toJson(reaped),
      row.id
    )
  }

  const jobs = new Map<string, Job>()
  for (const row of db.query<{ json: string }, []>(`SELECT json FROM jobs`).all()) {
    const j = decodeJob(fromJson(row.json)) as Job
    jobs.set(j.id, j)
  }

  const receipts = db
    .query<{ json: string }, []>(`SELECT json FROM receipts ORDER BY created_at_ms ASC`)
    .all()
    .map((r) => decodeReceiptRow(fromJson(r.json)) as Receipt)

  const ratings = db
    .query<{ json: string }, []>(`SELECT json FROM ratings`)
    .all()
    .map((r) => decodeRating(fromJson(r.json)) as Rating)

  // Listings and runners start EMPTY by design — see the note above.
  const initial: StoreState = {
    listings: new Map(),
    runners: new Map(),
    jobs,
    receipts,
    ratings
  }

  const ref = Effect.runSync(Ref.make(initial))
  const inner = makeStore(ref)

  const putJobStmt = db.query(
    `INSERT INTO jobs (id, status, boot_id, created_at_ms, json) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, json = excluded.json`
  )
  const putReceiptStmt = db.query(
    `INSERT INTO receipts (job_id, accrual_id, created_at_ms, json) VALUES (?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET json = excluded.json, accrual_id = excluded.accrual_id`
  )
  const putRatingStmt = db.query(
    `INSERT INTO ratings (receipt_job_id, json) VALUES (?, ?)
     ON CONFLICT(receipt_job_id) DO NOTHING`
  )

  const store: Store = {
    ...inner,
    putJob: (job) =>
      Effect.tap(inner.putJob(job), () =>
        Effect.sync(() =>
          putJobStmt.run(job.id, job.status, bootId, job.createdAtMs, toJson(job))
        )
      ),
    putReceipt: (r) =>
      Effect.tap(inner.putReceipt(r), () =>
        Effect.sync(() =>
          putReceiptStmt.run(
            r.jobId,
            r.feeAccrualId ?? null,
            r.createdAtMs,
            toJson(r)
          )
        )
      ),
    putRating: (r) =>
      Effect.tap(inner.putRating(r), () =>
        Effect.sync(() => putRatingStmt.run(r.receiptJobId, toJson(r)))
      ),
    // The sweep rewrites many receipts at once; re-persisting the whole set afterwards is
    // simpler than tracking which rows the in-memory update touched, and a sweep is rare.
    backfillFeeSweep: (accrualId, txHash) =>
      Effect.tap(inner.backfillFeeSweep(accrualId, txHash), () =>
        Effect.gen(function* () {
          const all = yield* inner.allReceipts
          yield* Effect.sync(() => {
            for (const r of all) {
              putReceiptStmt.run(
                r.jobId,
                r.feeAccrualId ?? null,
                r.createdAtMs,
                toJson(r)
              )
            }
          })
        })
      )
  }

  return { store, reaped: stale.length, bootId, close: () => db.close() }
}

/**
 * `ARCADE_DB` selects durability. Unset keeps the in-memory store, which is what tests and
 * a laptop want; setting it is what a public host must do, because every deploy is a
 * restart and a hub that forgets strands the buyers who already paid.
 */
export const StoreFromEnv = (): Layer.Layer<StoreTag> => {
  const path = process.env["ARCADE_DB"]
  if (path === undefined || path === "") {
    return Layer.effect(StoreTag, Effect.map(Ref.make(emptyState()), makeStore))
  }
  const bootId = `boot_${Date.now().toString(36)}`
  const opened = openSqliteStore(path, bootId)
  if (opened.reaped > 0) {
    console.warn(
      `[hub] reaped ${opened.reaped} job(s) left running by a previous boot — marked failed, ` +
        "so their buyers get a terminal answer and were never charged. Any seller still " +
        "working on one will have its result dropped."
    )
  }
  console.log(`[hub] store: sqlite at ${path} (boot ${bootId})`)
  return Layer.succeed(StoreTag, opened.store)
}

const emptyState = (): StoreState => ({
  listings: new Map(),
  runners: new Map(),
  jobs: new Map(),
  receipts: [],
  ratings: []
})
