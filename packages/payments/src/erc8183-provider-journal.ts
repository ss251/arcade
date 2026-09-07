/** Bun-only private provider signature reservations. No signer, send or replay API. */
import { Database } from "bun:sqlite"
import { closeSync, constants, fsyncSync, lstatSync, openSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { keccak256, toHex, type Hex } from "viem"
import { escrowBytes32, escrowCheck, escrowRecord } from "./erc8183-codec.ts"
import { assertEscrowProviderSignature, captureEscrowProviderIntent, decodeEscrowProviderIntent,
  encodeEscrowProviderIntent, escrowProviderContextHash, type EscrowProviderClaim,
  type EscrowProviderIntent, type EscrowProviderJournal } from "./erc8183-provider-intent.ts"
type State = "claimed" | "signed" | "uncertain"
interface Row { id: Hex; job: string; kind: string; provider_nonce: string; state: State; json: string; digest: Hex }
interface Entry { intent: EscrowProviderIntent; state: State; signature: Hex | null }
const digest = (json: string) => keccak256(toHex(json))
const jobKey = (i: EscrowProviderIntent) => `5042002:${i.context.call.escrow}:${i.context.jobId}`
const nonceKey = (i: EscrowProviderIntent) => `5042002:${i.context.call.provider}:${i.nonce}`
const pack = (e: Entry) => JSON.stringify({ intent: encodeEscrowProviderIntent(e.intent), state: e.state, signature: e.signature })
function validate(row: Row): Entry {
  escrowCheck(typeof row.json === "string" && row.json.length <= 65536 && digest(row.json) === row.digest)
  const r = escrowRecord(JSON.parse(row.json), ["intent", "state", "signature"])
  escrowCheck(typeof r.intent === "string")
  const intent = decodeEscrowProviderIntent(r.intent)
  escrowCheck(row.id === intent.requestId && row.job === jobKey(intent) && row.kind === intent.kind &&
    row.provider_nonce === nonceKey(intent) && row.state === r.state && ["claimed", "signed", "uncertain"].includes(row.state))
  escrowCheck(row.state === "signed" ? typeof r.signature === "string" && /^0x[0-9a-f]{130}$/.test(r.signature) : r.signature === null)
  const e: Entry = { intent, state: row.state, signature: r.signature as Hex | null }
  escrowCheck(pack(e) === row.json)
  return e
}
function coherent(entries: Entry[]) {
  escrowCheck(entries.length <= 2 && entries.every(e => escrowProviderContextHash(e.intent.context) ===
    escrowProviderContextHash(entries[0]!.intent.context)))
  if (entries.length === 2) {
    const budget = entries.find(e => e.intent.kind === "budget"), submit = entries.find(e => e.intent.kind === "submit")
    escrowCheck(budget?.state === "signed" && submit !== undefined && submit.intent.issuedAt >= budget.intent.issuedAt)
  }
}
/** Requires an existing canonical owner-only 0700 parent and 0600 single-link file.
 * DELETE/EXTRA/fullfsync follow the action journal's OS/filesystem durability boundary.
 * This is not protection against hostile same-user edits or physical storage failure.
 * Signatures are verified before their CAS write; reopening never exposes cached signatures
 * or supplies chain/local-completion authority. Unknown claims are not pruned or retried. */
export function openEscrowProviderJournal(path: string) {
  let db: Database | undefined, opened: Database, closed = false, inode = 0, device = 0
  const checkPath = (existing = true) => {
    escrowCheck(isAbsolute(path) && resolve(path) === path && realpathSync(dirname(path)) === dirname(path))
    const directory = lstatSync(dirname(path))
    escrowCheck(directory.isDirectory() && directory.uid === process.getuid!() && (directory.mode & 0o777) === 0o700)
    if (existing) {
      const stat = lstatSync(path)
      escrowCheck(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.getuid!() &&
        (stat.mode & 0o777) === 0o600 && (!inode || stat.ino === inode && stat.dev === device))
      inode = stat.ino; device = stat.dev
    }
  }
  try {
    checkPath(false)
    let created = false
    try {
      const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      try { fsyncSync(fd) } finally { closeSync(fd) }
      created = true
      const dir = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY)
      try { fsyncSync(dir) } finally { closeSync(dir) }
    } catch (error) { if ((error as { code?: unknown }).code !== "EEXIST") throw error }
    checkPath()
    db = new Database(path, { create: false, strict: true })
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; PRAGMA busy_timeout=1000")
    escrowCheck(db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode === "delete" &&
      db.query<{ synchronous: number }, []>("PRAGMA synchronous").get()?.synchronous === 3 &&
      db.query<{ fullfsync: number }, []>("PRAGMA fullfsync").get()?.fullfsync === 1)
    if (created) db.exec(`CREATE TABLE escrow_provider_signatures (
      id TEXT PRIMARY KEY, job TEXT NOT NULL, kind TEXT NOT NULL, provider_nonce TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL, json TEXT NOT NULL, digest TEXT NOT NULL, UNIQUE(job,kind)); PRAGMA user_version=1;`)
    escrowCheck(db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version === 1 &&
      db.query<{ quick_check: string }, []>("PRAGMA quick_check").get()?.quick_check === "ok")
    const rows = db.query<Row, []>("SELECT * FROM escrow_provider_signatures ORDER BY job,kind LIMIT 10001").all()
    escrowCheck(rows.length <= 10000)
    const jobs = new Map<string, Entry[]>()
    for (const row of rows) { const group = jobs.get(row.job) ?? []; group.push(validate(row)); jobs.set(row.job, group) }
    for (const group of jobs.values()) coherent(group)
    opened = db
  } catch { try { db?.close() } catch { /* No path-bearing diagnostics. */ } throw new Error("escrow_provider_journal_unavailable") }
  const guarded = <T>(work: () => T): T => {
    try { escrowCheck(!closed); checkPath(); return work() }
    catch { throw new Error("escrow_provider_journal_unavailable") }
  }
  const load = (claim: EscrowProviderClaim) => {
    const c = escrowRecord(claim, ["id"]), id = escrowBytes32(c.id, false)
    const row = opened.query<Row, [string]>("SELECT * FROM escrow_provider_signatures WHERE id=?").get(id)
    escrowCheck(row !== null); return { row, entry: validate(row) }
  }
  const save = (row: Row, entry: Entry) => {
    const json = pack(entry), next = { ...row, state: entry.state, json, digest: digest(json) }; validate(next)
    escrowCheck(opened.query("UPDATE escrow_provider_signatures SET state=?,json=?,digest=? WHERE id=? AND state=? AND digest=?")
      .run(next.state, json, next.digest, row.id, row.state, row.digest).changes === 1)
  }
  const journal = Object.freeze<EscrowProviderJournal>({ durability: "durable",
    claim: async input => guarded(() => opened.transaction(() => {
      const i = captureEscrowProviderIntent(input), prior = opened.query<Row, [string]>(
        "SELECT * FROM escrow_provider_signatures WHERE job=? ORDER BY kind").all(jobKey(i)).map(validate)
      coherent(prior)
      escrowCheck(prior.every(e => escrowProviderContextHash(e.intent.context) === escrowProviderContextHash(i.context)))
      if (prior.some(e => e.intent.kind === i.kind) || i.kind === "budget" && prior.length ||
        prior.some(e => e.state !== "signed" || e.intent.issuedAt > i.issuedAt)) return undefined
      const duplicates = opened.query<Row, [string, string]>(
        "SELECT * FROM escrow_provider_signatures WHERE id=? OR provider_nonce=?").all(i.requestId, nonceKey(i))
      for (const row of duplicates) validate(row)
      if (duplicates.length) return undefined
      escrowCheck(opened.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM escrow_provider_signatures").get()!.n < 10000)
      const e: Entry = { intent: i, state: "claimed", signature: null }, json = pack(e)
      const row: Row = { id: i.requestId, job: jobKey(i), kind: i.kind, provider_nonce: nonceKey(i), state: e.state, json, digest: digest(json) }
      validate(row)
      opened.query("INSERT INTO escrow_provider_signatures VALUES (?,?,?,?,?,?,?)")
        .run(row.id, row.job, row.kind, row.provider_nonce, row.state, json, row.digest)
      return Object.freeze({ id: i.requestId })
    }).immediate()),
    signed: async (claim, signature) => {
      try {
        const before = guarded(() => load(claim)); escrowCheck(before.entry.state === "claimed")
        const captured = await assertEscrowProviderSignature(before.entry.intent, signature)
        guarded(() => opened.transaction(() => {
          const { row, entry } = load(claim)
          escrowCheck(row.digest === before.row.digest && entry.state === "claimed")
          entry.signature = captured; entry.state = "signed"; save(row, entry)
        }).immediate())
      } catch { throw new Error("escrow_provider_journal_unavailable") }
    },
    uncertain: async claim => guarded(() => opened.transaction(() => {
      const { row, entry } = load(claim)
      if (entry.state === "signed" || entry.state === "uncertain") return
      entry.state = "uncertain"; save(row, entry)
    }).immediate())
  })
  return Object.freeze({ journal, close: () => { if (!closed) { closed = true; opened.close() } } })
}
