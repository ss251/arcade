import { Database } from "bun:sqlite"
import { Effect, Layer, Ref, Schema } from "effect"
import { Job, Rating, Receipt, Session, SessionId, SessionInvalid, SessionCapacity, SessionStorageUnavailable, SessionConflict } from "@arcade/core"
import { sessionJson, sessionParse, sessionAuthorizationKey, transitionSession, validateSessionLedger, SESSION_EVIDENCE_BYTES,
  normalizeSessionCommand, sessionReceiptEvidence, type SessionLedgerState, type SessionLedgerCall, type SessionCommand } from "./session-ledger.ts"
import { StoreTag, makeStore, sessionStoreApi, payTestKey, PAY_TEST_HISTORY, erc8004DocKey, validateErc8004DocBytes,
  type Erc8004DocKind, type PayTestRow, type Store, type StoreState, type TreeRow } from "./store.ts"

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
 * Canary history does persist. A restart must not erase three failed pay-tests and
 * silently relist a dead skill when its runner reconnects. History belongs to the skill
 * and seller, independently of any live listing or runner record.
 *
 * **Legacy write-through; session authority is separate.** Unrelated legacy reads keep the
 * existing implementation — including the percentile and stats logic that is already
 * tested — and every mutation is mirrored to sqlite. The tradeoff is stated rather than
 * hidden: the working set lives in memory, so this is a durable snapshot rather than a
 * database, and it is sized for a hub with thousands of receipts, not millions. Swapping
 * in a real SQL store later means replacing one Layer, which is the same shape as the
 * rails. Session admissions, holds and terminal evidence instead query current disk
 * under synchronous transactions, then publish only after commit. They are never
 * authorized from this legacy cached working set.
 *
 * **Boot reaping.** `pipeline.ts` writes a job row exactly once, when the job finishes, so
 * before this change an interrupted job left NO row at all — and the poll endpoint
 * answers "pending" when it cannot find one. A buyer whose job was in flight when the hub
 * restarted would poll forever, never receiving a terminal answer. The job row is now
 * written at dispatch, which is what makes the second half possible: on boot, any row
 * still in a non-terminal state belongs to a process that is gone, and is reaped to
 * `failed`. Nothing was settled, so the buyer was never charged and the receipt reads
 * `settled=false` for the same reason as any other failure path. Session-owned jobs
 * are excluded: their durable held/settling/uncertain state is not a no-charge proof.
 *
 * The residual is the seller's: their runner may have burned inference on a job the hub
 * has now given up on, and will find its result dropped. That is the mirror of the
 * settle-on-success guarantee and it is logged rather than papered over.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, buyer TEXT NOT NULL, budget_atomic TEXT NOT NULL, spent_atomic TEXT NOT NULL,
  rail TEXT NOT NULL, network TEXT NOT NULL, opened_at_ms INTEGER NOT NULL, closed_at_ms INTEGER,
  call_count INTEGER NOT NULL CHECK (call_count BETWEEN 0 AND 100), held_atomic TEXT NOT NULL, json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_calls (
  job_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), authorization_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('reserved','settling','uncertain','settled','released')),
  amount_atomic TEXT NOT NULL, created_at_ms INTEGER NOT NULL, settlement_key TEXT UNIQUE, json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS session_calls_session ON session_calls(session_id);
CREATE TABLE IF NOT EXISTS erc8004_docs (
  job_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  bytes TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (job_id, kind)
);
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
CREATE TABLE IF NOT EXISTS tree_reservations (
  child_job_id TEXT PRIMARY KEY,
  root_job_id TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pay_tests (
  skill_id TEXT NOT NULL,
  seller TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  job_id TEXT NOT NULL,
  settle_tx TEXT,
  ok INTEGER NOT NULL,
  reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS tree_root ON tree_reservations(root_job_id);
CREATE INDEX IF NOT EXISTS pay_tests_key ON pay_tests(skill_id, seller COLLATE NOCASE, at_ms);
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
interface SessionHeaderRow {
  id: string; buyer: string; budget_atomic: string; spent_atomic: string; rail: string; network: string
  opened_at_ms: number; closed_at_ms: number | null; call_count: number; held_atomic: string; json: string
}
interface CallRow {
  job_id: string; session_id: string; authorization_key: string; state: string; amount_atomic: string
  created_at_ms: number; settlement_key: string | null; json: string
}
const settlementKey = (call: SessionLedgerCall): string | null => call.state === "settled"
  ? JSON.stringify([call.binding.network, call.binding.rail, call.settleRef]) : null
const callFromRow = (row: CallRow): SessionLedgerCall => {
  const call = sessionParse(row.json) as SessionLedgerCall
  if (row.job_id !== call.binding?.jobId || row.session_id !== call.binding.sessionId || row.authorization_key !== sessionAuthorizationKey(call.binding) ||
    row.state !== call.state || row.amount_atomic !== String(call.binding.amountAtomic) || row.created_at_ms !== call.createdAtMs ||
    row.settlement_key !== settlementKey(call)) throw new SessionStorageUnavailable()
  return call
}
const headerFromRow = (row: SessionHeaderRow) => {
  const envelope = sessionParse(row.json) as { session: unknown; callCount: unknown; heldAtomic: unknown }
  if (envelope === null || typeof envelope !== "object" || Object.keys(envelope).sort().join(",") !== "callCount,heldAtomic,session") throw new SessionStorageUnavailable()
  const s = Schema.decodeUnknownSync(Session, { onExcessProperty: "error" })(envelope.session)
  if (!Number.isSafeInteger(envelope.callCount) || typeof envelope.callCount !== "number" || envelope.callCount < 0 || envelope.callCount > 100 ||
    typeof envelope.heldAtomic !== "bigint" || envelope.heldAtomic < 0n || envelope.heldAtomic + s.spentAtomic > s.budgetAtomic ||
    s.closedAtMs !== undefined && envelope.heldAtomic !== 0n || row.call_count !== envelope.callCount || row.held_atomic !== String(envelope.heldAtomic) ||
    row.id !== s.id || row.buyer !== s.buyer || row.budget_atomic !== String(s.budgetAtomic) || row.spent_atomic !== String(s.spentAtomic) ||
    row.rail !== s.rail || row.network !== s.network || row.opened_at_ms !== s.openedAtMs || row.closed_at_ms !== (s.closedAtMs ?? null)) throw new SessionStorageUnavailable()
  return { session: s, callCount: envelope.callCount, heldAtomic: envelope.heldAtomic }
}

export const openSqliteStore = (path: string, bootId: string): SqliteStore => {
  const db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode = WAL")
  // A completed document sink must be durable before its hash can be sent on chain.
  db.exec("PRAGMA synchronous = FULL")
  db.exec("PRAGMA busy_timeout = 1000")
  db.exec("PRAGMA foreign_keys = ON")
  db.exec(SCHEMA)

  const countCalls = db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM session_calls WHERE session_id = ?")
  const headerCountValid = (row: SessionHeaderRow) => {
    const header = headerFromRow(row)
    if (countCalls.get(row.id)?.n !== header.callCount) throw new SessionStorageUnavailable()
    return header
  }
  const listSessionHeaders = () => {
    const rows = db.query<SessionHeaderRow, []>("SELECT * FROM sessions ORDER BY id LIMIT 10001").all()
    if (rows.length > 10000 || db.query("SELECT 1 FROM session_calls LEFT JOIN sessions ON sessions.id = session_calls.session_id WHERE sessions.id IS NULL LIMIT 1").get()) throw new SessionStorageUnavailable()
    return rows.map(headerCountValid)
  }
  // This check must precede legacy reaping. Missing call rows cannot erase held
  // money/tombstones and reclassify their still-queued jobs as ordinary failures.
  try { db.transaction(listSessionHeaders).deferred() } catch { db.close(); throw new SessionStorageUnavailable() }

  // Anything non-terminal was left behind by a process that no longer exists. `boot_id`
  // makes that a fact on the row rather than something inferred from a timestamp, so the
  // log can name which boot abandoned the work.
  const stale = db
    .query<{ id: string; json: string; boot_id: string }, []>(
      `SELECT id, json, boot_id FROM jobs WHERE status IN ('queued','running')
       AND NOT EXISTS (SELECT 1 FROM session_calls WHERE session_calls.job_id = jobs.id)`
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
  for (const row of db.query<{ json: string }, []>(`SELECT json FROM jobs WHERE NOT EXISTS (SELECT 1 FROM session_calls WHERE session_calls.job_id = jobs.id)`).all()) {
    const j = decodeJob(fromJson(row.json)) as Job
    jobs.set(j.id, j)
  }

  const receipts = db
    .query<{ json: string }, []>(`SELECT json FROM receipts WHERE NOT EXISTS (SELECT 1 FROM session_calls WHERE session_calls.job_id = receipts.job_id) ORDER BY created_at_ms ASC`)
    .all()
    .map((r) => decodeReceiptRow(fromJson(r.json)) as Receipt)

  const ratings = db
    .query<{ json: string }, []>(`SELECT json FROM ratings`)
    .all()
    .map((r) => decodeRating(fromJson(r.json)) as Rating)

  const trees = new Map<string, Array<TreeRow>>()
  for (const row of db.query<{ child_job_id: string; root_job_id: string; amount_atomic: string; state: TreeRow["state"] }, []>(`SELECT * FROM tree_reservations`).all()) {
    const rows = trees.get(row.root_job_id) ?? []
    rows.push({ childJobId: row.child_job_id, amountAtomic: BigInt(row.amount_atomic), state: row.state })
    trees.set(row.root_job_id, rows)
  }

  const payTests = new Map<string, Array<PayTestRow>>()
  for (const row of db.query<{
    skill_id: string; seller: string; at_ms: number; job_id: string;
    settle_tx: string | null; ok: number; reason: string
  }, []>(`SELECT skill_id, seller, at_ms, job_id, settle_tx, ok, reason
          FROM pay_tests ORDER BY at_ms ASC, rowid ASC`).all()) {
    const key = payTestKey(row.skill_id, row.seller)
    const entry: PayTestRow = {
      skillId: row.skill_id, seller: row.seller.toLowerCase(), atMs: row.at_ms,
      jobId: row.job_id, ok: row.ok === 1, reason: row.reason,
      ...(row.settle_tx === null ? {} : { settleTx: row.settle_tx })
    }
    payTests.set(key, [...(payTests.get(key) ?? []), entry].slice(-PAY_TEST_HISTORY))
  }

  const erc8004Docs = new Map<string, string>()
  for (const row of db.query<{ job_id: string; kind: Erc8004DocKind; bytes: string }, []>(
    "SELECT job_id, kind, bytes FROM erc8004_docs").all()) {
    const key = erc8004DocKey(row.job_id, row.kind)
    validateErc8004DocBytes(row.bytes)
    erc8004Docs.set(key, row.bytes)
  }

  // Listings and runners start EMPTY by design — see the note above.
  const initial: StoreState = {
    listings: new Map(),
    runners: new Map(),
    jobs,
    receipts,
    ratings,
    trees,
    payTests,
    erc8004Docs,
    sessions: new Map(),
    sessionCalls: new Map()
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
  const upsertTree = db.query(
    `INSERT INTO tree_reservations (child_job_id, root_job_id, amount_atomic, state) VALUES (?, ?, ?, ?)
     ON CONFLICT(child_job_id) DO UPDATE SET state = excluded.state`
  )
  const setTreeStateStmt = db.query(`UPDATE tree_reservations SET state = ? WHERE child_job_id = ?`)
  const putPayTestStmt = db.query(
    `INSERT INTO pay_tests (skill_id, seller, at_ms, job_id, settle_tx, ok, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  // Keep 100 operator rows on disk, and only the newest 20 in memory. NOCASE also
  // groups pre-existing mixed-case rows; rowid preserves insertion order for ties.
  const prunePayTestStmt = db.query(
    `DELETE FROM pay_tests WHERE skill_id = ?1 AND seller = ?2 COLLATE NOCASE AND rowid NOT IN
       (SELECT rowid FROM pay_tests WHERE skill_id = ?1 AND seller = ?2 COLLATE NOCASE
        ORDER BY at_ms DESC, rowid DESC LIMIT 100)`
  )
  const persistPayTest = db.transaction((row: PayTestRow) => {
    putPayTestStmt.run(row.skillId, row.seller, row.atMs, row.jobId, row.settleTx ?? null,
      row.ok ? 1 : 0, row.reason)
    prunePayTestStmt.run(row.skillId, row.seller)
  })

  const putDoc = db.query("INSERT INTO erc8004_docs (job_id, kind, bytes, created_at_ms) VALUES (?, ?, ?, ?) ON CONFLICT(job_id, kind) DO NOTHING")
  const getDoc = db.query<{ bytes: string }, [string, string]>("SELECT bytes FROM erc8004_docs WHERE job_id = ? AND kind = ?")
  const persistDoc = db.transaction((jobId: string, kind: Erc8004DocKind, bytes: string) => {
    putDoc.run(jobId, kind, bytes, Date.now())
    // Check disk, not a potentially stale in-memory snapshot in another open process.
    // Silently ignoring a conflict would let a caller attest a hash we will never serve.
    if (getDoc.get(jobId, kind)?.bytes !== bytes) throw new Error("registry document already exists with different bytes")
  })

  // New session authority always reads current disk in one transaction; legacy
  // listing/runner and unrelated job behavior remains the existing memory seam.
  const loadSessionState = (sessionId: string): SessionLedgerState => {
    const sessions = new Map<string, Session>(), sessionCalls = new Map<string, SessionLedgerCall>()
    const row = db.query<SessionHeaderRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(sessionId)
    const header = row === null ? undefined : headerCountValid(row)
    if (header !== undefined) sessions.set(header.session.id, header.session)
    const calls = db.query<CallRow, [string]>("SELECT * FROM session_calls WHERE session_id = ? LIMIT 101").all(sessionId)
    if (calls.length > 100 || header === undefined && calls.length !== 0) throw new SessionStorageUnavailable()
    for (const row of calls) sessionCalls.set(row.job_id, callFromRow(row))
    const jobs = new Map<string, Job>()
    for (const row of db.query<{ id: string; status: string; created_at_ms: number; json: string }, [string]>(
      "SELECT jobs.* FROM session_calls JOIN jobs ON jobs.id = session_calls.job_id WHERE session_calls.session_id = ? LIMIT 101").all(sessionId)) {
      const job = Schema.decodeUnknownSync(Job, { onExcessProperty: "error" })(sessionParse(row.json, SESSION_EVIDENCE_BYTES))
      if (job.id !== row.id || job.status !== row.status || job.createdAtMs !== row.created_at_ms) throw new SessionStorageUnavailable()
      jobs.set(job.id, job)
    }
    const receipts = db.query<{ job_id: string; accrual_id: string | null; created_at_ms: number; json: string }, [string]>(
      "SELECT receipts.* FROM session_calls JOIN receipts ON receipts.job_id = session_calls.job_id WHERE session_calls.session_id = ? LIMIT 101").all(sessionId).map(row => {
      const receipt = Schema.decodeUnknownSync(Receipt, { onExcessProperty: "error" })(sessionParse(row.json, SESSION_EVIDENCE_BYTES))
      if (receipt.jobId !== row.job_id || (receipt.feeAccrualId ?? null) !== row.accrual_id || receipt.createdAtMs !== row.created_at_ms) throw new SessionStorageUnavailable()
      return receipt
    })
    const result = { sessions, sessionCalls, jobs, receipts }
    try { validateSessionLedger(result) } catch { throw new SessionStorageUnavailable() }
    const held = [...sessionCalls.values()].reduce((sum, call) => sum + (["reserved", "settling", "uncertain"].includes(call.state) ? call.binding.amountAtomic : 0n), 0n)
    if (header !== undefined && (header.callCount !== sessionCalls.size || header.heldAtomic !== held)) throw new SessionStorageUnavailable()
    return result
  }
  const readSessions = db.transaction((id: string) => {
    try { return loadSessionState(id) } catch { throw new SessionStorageUnavailable() }
  })
  const persistSession = db.query(`INSERT INTO sessions (id,buyer,budget_atomic,spent_atomic,rail,network,opened_at_ms,closed_at_ms,call_count,held_atomic,json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET spent_atomic=excluded.spent_atomic,closed_at_ms=excluded.closed_at_ms,call_count=excluded.call_count,held_atomic=excluded.held_atomic,json=excluded.json`)
  const persistCall = db.query(`INSERT INTO session_calls (job_id,session_id,authorization_key,state,amount_atomic,created_at_ms,settlement_key,json)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET state=excluded.state,settlement_key=excluded.settlement_key,json=excluded.json`)
  const sessionForJob = (id: string) => db.query<{ session_id: string }, [string]>("SELECT session_id FROM session_calls WHERE job_id = ?").get(id)?.session_id
  const ownedSessionJob = (id: string) => sessionForJob(id) !== undefined
  const checkedId = (id: unknown): string => { try { return Schema.decodeUnknownSync(SessionId)(id) } catch { throw new SessionInvalid() } }
  const mutateSession = db.transaction((command: SessionCommand) => {
    const sessionId = checkedId(command.kind === "open" ? command.input.id : command.kind === "reserve" ? command.binding.sessionId : command.kind === "finish" ? command.terminal.sessionId : command.sessionId)
    // Count-only global corruption guard, under the same writer lock. No money
    // aggregation or unrelated evidence decoding; this is not authentication
    // against an actor coordinating row deletion with counter rewrites.
    const counts = db.query<{ call_count: number }, []>("SELECT call_count FROM sessions LIMIT 10001").all()
    if (counts.length > 10000 || counts.some(row => !Number.isSafeInteger(row.call_count) || row.call_count < 0 || row.call_count > 100) ||
      counts.reduce((sum, row) => sum + row.call_count, 0) !== db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM session_calls").get()!.n) throw new SessionStorageUnavailable()
    let old: SessionLedgerState
    try { old = loadSessionState(sessionId) } catch { throw new SessionStorageUnavailable() }
    if (command.kind === "open" && !old.sessions.has(sessionId) && db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM sessions").get()!.n >= 10000) throw new SessionCapacity()
    // Global claims use exact UNIQUE indexes; unrelated evidence is never loaded.
    if (command.kind === "reserve") {
      if (!old.sessionCalls.has(command.binding.jobId) && (db.query("SELECT 1 FROM jobs WHERE id = ?").get(command.binding.jobId) ||
        db.query("SELECT 1 FROM receipts WHERE job_id = ?").get(command.binding.jobId) || ownedSessionJob(command.binding.jobId))) throw new SessionConflict()
    }
    const t = transitionSession(old, command)
    for (const [id, call] of t.state.sessionCalls) if (old.sessionCalls.get(id) !== call) {
      const owner = db.query<{ job_id: string }, [string]>("SELECT job_id FROM session_calls WHERE authorization_key = ?").get(sessionAuthorizationKey(call.binding))
      const ref = settlementKey(call), previous = ref === null ? null : db.query<{ job_id: string }, [string]>("SELECT job_id FROM session_calls WHERE settlement_key = ?").get(ref)
      if (owner !== null && owner.job_id !== id || previous !== null && previous.job_id !== id) throw new SessionConflict()
    }
    const held = (state: SessionLedgerState) => [...state.sessionCalls.values()].reduce((sum, call) => sum + (["reserved", "settling", "uncertain"].includes(call.state) ? call.binding.amountAtomic : 0n), 0n)
    const heldAtomic = held(t.state), callCount = t.state.sessionCalls.size
    for (const [id, s] of t.state.sessions) if (old.sessions.get(id) !== s || old.sessionCalls.size !== callCount || held(old) !== heldAtomic) {
      persistSession.run(s.id, s.buyer, String(s.budgetAtomic), String(s.spentAtomic), s.rail, s.network, s.openedAtMs, s.closedAtMs ?? null,
        callCount, String(heldAtomic), sessionJson({ session: s, callCount, heldAtomic }))
    }
    for (const [id, c] of t.state.sessionCalls) if (old.sessionCalls.get(id) !== c) persistCall.run(id, c.binding.sessionId, sessionAuthorizationKey(c.binding), c.state, String(c.binding.amountAtomic), c.createdAtMs, settlementKey(c), sessionJson(c))
    for (const [id, j] of t.state.jobs) if (old.jobs.get(id) !== j) putJobStmt.run(j.id, j.status, bootId, j.createdAtMs, sessionJson(j, SESSION_EVIDENCE_BYTES))
    for (const r of t.state.receipts) if (!old.receipts.includes(r)) db.query("INSERT INTO receipts (job_id,accrual_id,created_at_ms,json) VALUES (?,?,?,?)").run(r.jobId, r.feeAccrualId ?? null, r.createdAtMs, sessionJson(r, SESSION_EVIDENCE_BYTES))
    return t
  })
  const sessionOps = sessionStoreApi(id => readSessions.deferred(checkedId(id)), command =>
    mutateSession.immediate(normalizeSessionCommand(command)).result,
    path === ":memory:" || path === "" ? "volatile" : "durable",
    () => { try { return db.transaction(listSessionHeaders).deferred().map(header => header.session) } catch { throw new SessionStorageUnavailable() } })
  // Existing inherently-global APIs intentionally enumerate terminal receipts.
  // They validate each bounded row once, without loading its job or all siblings.
  const currentReceipts = db.transaction(() => {
    try {
      const headers = new Map(listSessionHeaders().map(header => [header.session.id, header.session]))
      const result = [...Effect.runSync(inner.allReceipts)]
      const rows = db.query<CallRow & { receipt_json: string | null; receipt_id: string | null; accrual_id: string | null; receipt_at: number | null }, []>(
        `SELECT session_calls.*, receipts.json AS receipt_json, receipts.job_id AS receipt_id, receipts.accrual_id, receipts.created_at_ms AS receipt_at
         FROM session_calls LEFT JOIN receipts ON receipts.job_id = session_calls.job_id
         WHERE session_calls.state IN ('settled','released') OR receipts.job_id IS NOT NULL`).all()
      for (const row of rows) {
        if (row.receipt_json === null) throw new SessionStorageUnavailable()
        const call = callFromRow(row), session = headers.get(call.binding.sessionId)
        if (session === undefined) throw new SessionStorageUnavailable()
        const receipt = sessionReceiptEvidence(call, Schema.decodeUnknownSync(Receipt, { onExcessProperty: "error" })(sessionParse(row.receipt_json, SESSION_EVIDENCE_BYTES)), session)
        if (receipt.jobId !== row.receipt_id || (receipt.feeAccrualId ?? null) !== row.accrual_id || receipt.createdAtMs !== row.receipt_at) throw new SessionStorageUnavailable()
        result.push(receipt)
      }
      return result.sort((a, b) => a.createdAtMs - b.createdAtMs)
    } catch { throw new SessionStorageUnavailable() }
  })

  const store: Store = {
    ...inner,
    ...sessionOps,
    getJob: id => Effect.sync(() => {
      try { const sessionId = sessionForJob(id); return sessionId !== undefined ? readSessions.deferred(sessionId).jobs.get(id) : Effect.runSync(inner.getJob(id)) }
      catch { throw new SessionStorageUnavailable() }
    }),
    allReceipts: Effect.sync(() => currentReceipts.deferred()),
    statsFor: skillId => Effect.sync(() => {
      const state = Effect.runSync(Ref.get(ref)), receipts = currentReceipts.deferred()
      return Effect.runSync(makeStore(Effect.runSync(Ref.make({ ...state, receipts }))).statsFor(skillId))
    }),
    putErc8004Doc: (jobId, kind, bytes) => Effect.uninterruptible(Effect.sync(() => {
      erc8004DocKey(jobId, kind)
      validateErc8004DocBytes(bytes)
      persistDoc.immediate(jobId, kind, bytes)
      // No yielding or memory publication before the durable transaction commits.
      Effect.runSync(inner.putErc8004Doc(jobId, kind, bytes))
    })),
    putJob: job => Effect.uninterruptible(Effect.sync(() => db.transaction(() => {
      if (ownedSessionJob(job.id)) throw new SessionConflict()
      Effect.runSync(inner.putJob(job))
      putJobStmt.run(job.id, job.status, bootId, job.createdAtMs, toJson(job))
    }).immediate())),
    putReceipt: r => Effect.uninterruptible(Effect.sync(() => db.transaction(() => {
      if (r.sessionId !== undefined || ownedSessionJob(r.jobId)) throw new SessionConflict()
      Effect.runSync(inner.putReceipt(r))
      putReceiptStmt.run(r.jobId, r.feeAccrualId ?? null, r.createdAtMs, toJson(r))
    }).immediate())),
    putRating: (r) =>
      Effect.tap(inner.putRating(r), () =>
        Effect.sync(() => putRatingStmt.run(r.receiptJobId, toJson(r)))
      ),
    recordPayTest: (row) =>
      Effect.uninterruptible(Effect.sync(() => {
        const owned: PayTestRow = {
          skillId: row.skillId, seller: row.seller.toLowerCase(), atMs: row.atMs,
          jobId: row.jobId, ok: row.ok, reason: row.reason,
          ...(row.settleTx === undefined ? {} : { settleTx: row.settleTx })
        }
        // Commit both SQL changes before publishing the verdict. One synchronous,
        // uninterruptible boundary prevents a yield between commit and the pure Ref
        // update. A failed insert, prune or commit leaves memory unchanged.
        persistPayTest(owned)
        Effect.runSync(inner.recordPayTest(owned))
      })),
    reserveTree: (root, child, amount, ceiling) =>
      Effect.tap(inner.reserveTree(root, child, amount, ceiling), (ok) =>
        Effect.sync(() => { if (ok) upsertTree.run(child, root, amount.toString(), "reserved") })
      ),
    commitTree: (child) => Effect.tap(inner.commitTree(child), () => Effect.sync(() => setTreeStateStmt.run("committed", child))),
    releaseTree: (child) => Effect.tap(inner.releaseTree(child), () => Effect.sync(() => setTreeStateStmt.run("released", child))),
    // The sweep rewrites many receipts at once; re-persisting the whole set afterwards is
    // simpler than tracking which rows the in-memory update touched, and a sweep is rare.
    backfillFeeSweep: (accrualId, txHash) =>
      Effect.tap(inner.backfillFeeSweep(accrualId, txHash), () =>
        Effect.gen(function* () {
          const all = yield* inner.allReceipts
          yield* Effect.sync(() => {
            for (const r of all) {
              if (r.sessionId !== undefined || ownedSessionJob(r.jobId)) continue
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
  ratings: [],
  trees: new Map(),
  payTests: new Map(),
  erc8004Docs: new Map(),
  sessions: new Map(),
  sessionCalls: new Map()
})
