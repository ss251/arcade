/** Bun-only private durable action journal. No automatic recovery or broadcast replay. */
import { Database } from "bun:sqlite"
import { closeSync, constants, fsyncSync, lstatSync, openSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { keccak256, toHex, type Hex } from "viem"
import { escrowActionContext, escrowCompletionProjection, type PreparedEscrowAction } from "./erc8183-actions.ts"
import { captureEscrowOperation, type EscrowActionClaim, type EscrowActionJournal, type EscrowOperation } from "./erc8183-executor.ts"
import { assertEscrowSignedAction, captureEscrowTransactionTerms, type EscrowSignedAction } from "./erc8183-evidence.ts"
import { escrowBytes32, escrowCheck, escrowRecord, escrowSeconds, escrowUint } from "./erc8183-codec.ts"
type Context = ReturnType<typeof escrowActionContext>
type Proof = Parameters<EscrowActionJournal["confirmed"]>[1]
type State = "claimed" | "intended" | "prepared" | "attempted" | "confirmed" | "uncertain"
interface Entry {
  id: string; context: Context; operation: EscrowOperation; state: State
  intent: PreparedEscrowAction | null; signed: EscrowSignedAction | null; proof: Proof | null
}
interface Row { id: string; job: string; sender: string; ordinal: number; state: string; json: string; digest: string }
const pack = (value: unknown): string => JSON.stringify(value, (_k, v) => typeof v === "bigint" ? { $uint: v.toString() } : v)
function unpack(json: string): unknown {
  escrowCheck(typeof json === "string" && json.length <= 524288)
  return JSON.parse(json, (_k, v) => {
    if (v && typeof v === "object" && "$uint" in v) {
      escrowCheck(Object.keys(v).length === 1 && typeof v.$uint === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v.$uint))
      return escrowUint(BigInt(v.$uint))
    }
    return v
  })
}
const digest = (json: string) => keccak256(toHex(json))
const jobKey = (c: Context) => `5042002:${c.call.escrow}:${c.jobId}`
const senderKey = (c: Context) => `5042002:${c.call.evaluator}`
const uuid = (id: unknown): string => { escrowCheck(typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)); return id }
function captureProof(input: unknown, entry: Entry): Proof {
  const p = escrowRecord(input, ["kind", "txHash", "blockHash", "blockNumber", "blockTimestamp", "submittedAt", "gasWei", "feeAtomic", "sellerAtomic", "refundAtomic"])
  escrowCheck(entry.signed !== null && p.kind === entry.operation.kind && p.txHash === entry.signed.hash)
  const result = { kind: entry.operation.kind, txHash: escrowBytes32(p.txHash, false), blockHash: escrowBytes32(p.blockHash, false),
    blockNumber: escrowUint(p.blockNumber), blockTimestamp: escrowSeconds(p.blockTimestamp), submittedAt: escrowSeconds(p.submittedAt),
    gasWei: escrowUint(p.gasWei), feeAtomic: escrowUint(p.feeAtomic), sellerAtomic: escrowUint(p.sellerAtomic), refundAtomic: escrowUint(p.refundAtomic) }
  const amount = entry.context.call.amount, fee = amount * 500n / 10000n
  escrowCheck(result.blockNumber > 0n && result.gasWei <= entry.signed.gasCapWei &&
    result.submittedAt <= result.blockTimestamp && (result.kind !== "submit" || result.submittedAt === result.blockTimestamp) &&
    (result.kind !== "complete" || result.submittedAt > 0) &&
    result.feeAtomic === (result.kind === "complete" ? fee : 0n) &&
    result.sellerAtomic === (result.kind === "complete" ? amount - fee : 0n) && result.refundAtomic === (result.kind === "reject" ? amount : 0n))
  return Object.freeze(result)
}
function validate(row: Row): Entry {
  escrowCheck(digest(row.json) === row.digest && Number.isSafeInteger(row.ordinal) && row.ordinal >= 0 && row.ordinal < 3)
  const r = escrowRecord(unpack(row.json), ["id", "context", "operation", "state", "intent", "signed", "proof"])
  const context = escrowActionContext(r.context), operation = captureEscrowOperation(context, r.operation)
  escrowCheck(uuid(r.id) === row.id && jobKey(context) === row.job && senderKey(context) === row.sender &&
    r.state === row.state && ["claimed", "intended", "prepared", "attempted", "confirmed", "uncertain"].includes(row.state))
  const e = { id: row.id, context, operation, state: row.state as State,
    intent: r.intent, signed: r.signed, proof: r.proof } as Entry
  if (e.intent !== null) {
    const a = e.intent
    const required = ["kind", "context", "chainId", "sender", "to", "value", "data"]
    const optional = operation.kind === "budget" ? ["providerNonce", "providerDeadline"] :
      operation.kind === "submit" ? ["providerNonce", "providerDeadline", "outputHash"] :
      operation.kind === "complete" ? ["outputHash", "reason", "receipt"] : ["reason"]
    escrowRecord(a, [...required, ...optional])
    escrowCheck(a.kind === operation.kind && pack(escrowActionContext(a.context)) === pack(context) && a.chainId === 5042002 &&
      a.sender === context.call.evaluator && a.to === context.call.escrow && a.value === 0n && /^0x(?:[0-9a-f]{2}){1,65535}$/.test(a.data))
    if (operation.kind === "budget" || operation.kind === "submit") { escrowBytes32(a.providerNonce, false); escrowUint(a.providerDeadline) }
    if (operation.kind === "complete" || operation.kind === "reject") {
      escrowCheck(a.reason === toHex(operation.kind === "complete" ? "arcade-settled" : "arcade-" + operation.reason, { size: 32 }))
    }
    if (operation.kind === "complete") escrowCheck(pack(a.receipt) === pack(escrowCompletionProjection(context, operation.receipt)))
    if (operation.kind === "submit") escrowCheck(a.outputHash === operation.outputHash)
  }
  if (e.signed !== null) {
    escrowRecord(e.signed, ["hash", "serialized", "nonce", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "gasCapWei"])
    const s = e.signed, t = captureEscrowTransactionTerms({ nonce: s.nonce, gas: s.gas, maxFeePerGas: s.maxFeePerGas,
      maxPriorityFeePerGas: s.maxPriorityFeePerGas, gasCapWei: s.gasCapWei })
    escrowCheck(e.intent !== null && /^0x02(?:[0-9a-f]{2}){1,65535}$/.test(s.serialized) && keccak256(s.serialized) === s.hash && t.nonce === s.nonce)
  }
  if (e.proof !== null) e.proof = captureProof(e.proof, e)
  escrowCheck((e.state === "confirmed") === (e.proof !== null) &&
    (e.state === "uncertain" || e.state === "claimed" && e.intent === null && e.signed === null ||
      e.state === "intended" && e.intent !== null && e.signed === null ||
      ["prepared", "attempted", "confirmed"].includes(e.state) && e.intent !== null && e.signed !== null))
  escrowCheck(pack(e) === row.json)
  return e
}

/** Parent directory must already be owned, canonical and private (0700). SQLite EXTRA
 * + DELETE journaling is the durability boundary, subject to the OS/filesystem honoring
 * fsync. This does not guard hostile same-user disk edits or unrelated sender programs. */
export function openEscrowActionJournal(path: string) {
  let db: Database | undefined, opened: Database, closed = false
  let inode = 0, device = 0
  try {
    escrowCheck(isAbsolute(path) && resolve(path) === path && realpathSync(dirname(path)) === dirname(path))
    const directory = lstatSync(dirname(path))
    escrowCheck(directory.isDirectory() && directory.uid === process.getuid!() && (directory.mode & 0o777) === 0o700)
    let created = false
    try {
      const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      try { fsyncSync(fd) } finally { closeSync(fd) }
      created = true
      const dir = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY)
      try { fsyncSync(dir) } finally { closeSync(dir) }
    } catch (error) { if ((error as { code?: unknown }).code !== "EEXIST") throw error }
    const stat = lstatSync(path)
    escrowCheck(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.getuid!() && (stat.mode & 0o777) === 0o600)
    inode = stat.ino; device = stat.dev
    db = new Database(path, { create: false, strict: true })
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON")
    escrowCheck(db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode === "delete" &&
      db.query<{ synchronous: number }, []>("PRAGMA synchronous").get()?.synchronous === 3 &&
      db.query<{ fullfsync: number }, []>("PRAGMA fullfsync").get()?.fullfsync === 1)
    if (created) db.exec(`CREATE TABLE escrow_actions (
      id TEXT PRIMARY KEY, job TEXT NOT NULL, sender TEXT NOT NULL, ordinal INTEGER NOT NULL,
      state TEXT NOT NULL, json TEXT NOT NULL, digest TEXT NOT NULL, UNIQUE(job, ordinal));
      CREATE UNIQUE INDEX escrow_sender_owner ON escrow_actions(sender) WHERE state <> 'confirmed';
      PRAGMA user_version=1;`)
    escrowCheck(db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version === 1 &&
      db.query<{ quick_check: string }, []>("PRAGMA quick_check").get()?.quick_check === "ok")
    const rows = db.query<Row, []>("SELECT * FROM escrow_actions ORDER BY job, ordinal LIMIT 10001").all()
    escrowCheck(rows.length <= 10000)
    for (const row of rows) validate(row)
    opened = db
  } catch { try { db?.close() } catch { /* Never expose path-bearing SQLite diagnostics. */ } throw new Error("escrow_journal_unavailable") }
  const guarded = <T>(work: () => T): T => {
    try {
      escrowCheck(!closed)
      const stat = lstatSync(path), directory = lstatSync(dirname(path))
      escrowCheck(stat.ino === inode && stat.dev === device && stat.nlink === 1 && stat.isFile() && !stat.isSymbolicLink() &&
        stat.uid === process.getuid!() && (stat.mode & 0o777) === 0o600 && directory.isDirectory() &&
        directory.uid === process.getuid!() && (directory.mode & 0o777) === 0o700 && realpathSync(dirname(path)) === dirname(path))
      return work()
    } catch { throw new Error("escrow_journal_unavailable") }
  }
  const rowsFor = (c: Context) => opened.query<Row, [string]>("SELECT * FROM escrow_actions WHERE job=? ORDER BY ordinal").all(jobKey(c))
  const load = (claim: EscrowActionClaim): { row: Row; entry: Entry } => {
    const row = opened.query<Row, [string]>("SELECT * FROM escrow_actions WHERE id=?").get(uuid(claim.id))
    escrowCheck(row !== null); return { row, entry: validate(row) }
  }
  const save = (row: Row, e: Entry) => {
    const json = pack(e), next = { ...row, state: e.state, json, digest: digest(json) }
    validate(next)
    escrowCheck(opened.query("UPDATE escrow_actions SET state=?,json=?,digest=? WHERE id=? AND state=? AND digest=?")
      .run(next.state, json, next.digest, row.id, row.state, row.digest).changes === 1)
  }
  const advance = (claim: EscrowActionClaim, state: State, update: (entry: Entry) => void) => guarded(() => opened.transaction(() => {
    const { row, entry } = load(claim); escrowCheck(entry.state === state); update(entry); save(row, entry)
  }).immediate())
  const journal = Object.freeze<EscrowActionJournal>({ durability: "durable",
    claim: async (context, operation) => guarded(() => opened.transaction(() => {
      const c = escrowActionContext(context), o = captureEscrowOperation(c, operation), rows = rowsFor(c), entries = rows.map(validate)
      escrowCheck(rows.length < 4 && entries.every(e => pack(e.context) === pack(c)))
      const last = entries.at(-1)
      if (last && (last.state !== "confirmed" || last.operation.kind === "complete" || last.operation.kind === "reject") ||
        entries.some(e => e.operation.kind === o.kind) || o.kind === "budget" && last ||
        o.kind === "complete" && last?.operation.kind !== "submit" ||
        o.kind === "submit" && last && last.operation.kind !== "budget") return undefined
      const occupied = opened.query<Row, [string]>("SELECT * FROM escrow_actions WHERE sender=? AND state<>'confirmed'").get(senderKey(c))
      if (occupied) { validate(occupied); return undefined }
      escrowCheck(opened.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM escrow_actions").get()!.n < 10000)
      const id = crypto.randomUUID(), e: Entry = { id, context: c, operation: o, state: "claimed", intent: null, signed: null, proof: null }, json = pack(e)
      const row = { id, job: jobKey(c), sender: senderKey(c), ordinal: rows.length, state: e.state, json, digest: digest(json) }
      validate(row)
      opened.query("INSERT INTO escrow_actions VALUES (?,?,?,?,?,?,?)").run(id, row.job, row.sender, row.ordinal, row.state, json, row.digest)
      return Object.freeze({ id })
    }).immediate()),
    matchSubmission: async (claim, outputHash, submittedAt) => guarded(() => opened.transaction(() => {
      const { entry } = load(claim)
      escrowCheck(entry.operation.kind === "complete" && entry.state !== "uncertain" && entry.state !== "confirmed")
      const previous = rowsFor(entry.context).map(validate).find(e => e.operation.kind === "submit")
      return previous?.state === "confirmed" && previous.intent?.outputHash === escrowBytes32(outputHash, false) &&
        previous.proof?.submittedAt === escrowSeconds(submittedAt)
    }).deferred()),
    intent: async (claim, action) => advance(claim, "claimed", e => {
      e.intent = unpack(pack(action)) as PreparedEscrowAction; e.state = "intended"
    }),
    prepared: async (claim, signed) => {
      try {
        const { entry } = guarded(() => load(claim)); escrowCheck(entry.state === "intended" && entry.intent !== null)
        const terms = { nonce: signed.nonce, gas: signed.gas, maxFeePerGas: signed.maxFeePerGas,
          maxPriorityFeePerGas: signed.maxPriorityFeePerGas, gasCapWei: signed.gasCapWei }
        const captured = await assertEscrowSignedAction(entry.intent, signed.serialized, terms)
        escrowCheck(pack(captured) === pack(signed))
        advance(claim, "intended", e => { e.signed = captured; e.state = "prepared" })
      } catch { throw new Error("escrow_journal_unavailable") }
    },
    attempt: async (claim, hash) => advance(claim, "prepared", e => {
      escrowCheck(e.signed?.hash === escrowBytes32(hash, false)); e.state = "attempted"
    }),
    confirmed: async (claim, proof) => advance(claim, "attempted", e => {
      const captured = captureProof(proof, e)
      if (e.operation.kind === "complete") {
        const submit = rowsFor(e.context).map(validate).find(p => p.operation.kind === "submit")
        escrowCheck(submit?.state === "confirmed" && submit.intent?.outputHash === e.intent?.outputHash &&
          submit.proof?.submittedAt === captured.submittedAt)
      }
      e.proof = captured; e.state = "confirmed"
    }),
    uncertain: async (claim, hash) => guarded(() => opened.transaction(() => {
      const { row, entry } = load(claim)
      if (entry.state === "confirmed" || entry.state === "uncertain") return
      if (hash !== undefined && entry.signed !== null) escrowCheck(entry.signed.hash === escrowBytes32(hash, false))
      entry.state = "uncertain"; save(row, entry)
    }).immediate())
  })
  return Object.freeze({ journal, close: () => { if (!closed) { closed = true; opened.close() } } })
}
