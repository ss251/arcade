/** Bun-only, one-purchase private journal. No automatic replay/resume, key, RPC or send.
 * Cooperating handles share this file; unrelated wallet programs/files are not locked. */
import { Database } from "bun:sqlite"
import { closeSync, constants, fsyncSync, lstatSync, openSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { docBytes, hashJson } from "@arcade/core"
import { keccak256, parseTransaction, toHex, type Hex } from "viem"
import { createEscrowBuyerIntent, captureOriginalEscrowBuyerAction, prepareEscrowBuyerAction,
  type EscrowBuyerIntent, type PreparedEscrowBuyerAction } from "./erc8183-buyer-intent.ts"
import { assertEscrowBuyerSigned } from "./erc8183-buyer-evidence.ts"
import { captureEscrowTransactionTerms, type EscrowSignedAction } from "./erc8183-evidence.ts"
import { captureEscrowJob, escrowBytes32, escrowCheck, escrowRecord, escrowSeconds, escrowUint } from "./erc8183-codec.ts"
import { captureEscrowIdentity } from "./erc8183-reader.ts"
type Kind = "create" | "approve" | "fund"
type Proof = { kind: Kind | "budget"; chainId: 5042002; escrow: Hex; intentId: Hex; jobId: bigint; txHash: Hex;
  blockHash: Hex; blockNumber: bigint; blockTimestamp: number; gasWei: bigint; gasPayer: Hex; fundedAtomic: bigint }
type Accepted = { jobId: string; token: string; pollUrl: string }
type Action = { kind: Kind; snapshot: unknown; preparedAt: number; allowanceAtomic: bigint | null;
  signed: EscrowSignedAction | null; attempted: boolean; proof: Proof | null }
type Entry = { claimId: string; source: ReturnType<typeof sourceOf>["source"]; body: string; uncertain: boolean;
  budgetAttempted: boolean; budgetProof: Proof | null; rootAttempted: boolean; accepted: Accepted | null; actions: Action[] }
interface Row { slot: number; claim: string; revision: number; state: string; json: string; digest: string }
export interface EscrowBuyerClaim { readonly id: string }
const SCHEMA = "CREATE TABLE buyer_purchase (slot INTEGER PRIMARY KEY CHECK(slot=1),claim TEXT NOT NULL,revision INTEGER NOT NULL,state TEXT NOT NULL,json TEXT NOT NULL,digest TEXT NOT NULL)"
const pack = (value: unknown): string => JSON.stringify(value, (_, v) => typeof v === "bigint" ? { $uint: v.toString() } : v)
function unpack(json: string): unknown {
  escrowCheck(typeof json === "string" && Buffer.byteLength(json) <= 524288)
  return JSON.parse(json, (_, v) => {
    if (v && typeof v === "object" && "$uint" in v) {
      escrowCheck(Object.keys(v).length === 1 && typeof v.$uint === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v.$uint))
      return escrowUint(BigInt(v.$uint))
    }
    return v
  })
}
const digest = (json: string) => keccak256(toHex(json))
function sourceOf(raw: unknown, body: string) {
  const r = escrowRecord(raw, ["identity", "call", "requirements", "client", "issuedAt", "expiresInSeconds",
    "capability", "maxAmountAtomic", "gasBudgetWei"]), i = createEscrowBuyerIntent(raw)
  // This concrete three-buyer-transaction flow excludes evaluator-paid budget gas.
  // A shared buyer/evaluator account would need different nonce/gas accounting.
  escrowCheck(i.client !== i.call.evaluator && typeof body === "string" && Buffer.byteLength(body) <= 131072)
  const input: unknown = JSON.parse(body)
  escrowCheck(docBytes(input) === body && hashJson(input) === i.call.inputHash)
  const capability = escrowBytes32(r.capability, false)
  escrowCheck(Buffer.byteLength(JSON.stringify({ input, payment: { x402Version: 2, accepted: i.requirements,
    payload: { jobId: ((1n << 256n) - 1n).toString(), capability } } })) <= 131072)
  const source = { identity: i.identity, call: i.call, requirements: i.requirements, client: i.client, issuedAt: i.issuedAt,
    expiresInSeconds: escrowSeconds(r.expiresInSeconds), capability, maxAmountAtomic: i.maxAmountAtomic, gasBudgetWei: i.gasBudgetWei }
  return { source, intent: i }
}
function acceptedOf(raw: unknown, i: EscrowBuyerIntent): Accepted {
  const r = escrowRecord(raw, ["jobId", "token", "pollUrl"])
  escrowCheck(typeof r.jobId === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(r.jobId) &&
    typeof r.token === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(r.token) &&
    r.pollUrl === `${new URL(i.call.resource).origin}/jobs/${r.jobId}/result?token=${r.token}`)
  return Object.freeze({ jobId: r.jobId, token: r.token, pollUrl: r.pollUrl as string })
}
function proofOf(raw: unknown, i: EscrowBuyerIntent, kind: Proof["kind"], jobId?: bigint): Proof {
  const r = escrowRecord(raw, ["kind", "chainId", "escrow", "intentId", "jobId", "txHash", "blockHash", "blockNumber",
    "blockTimestamp", "gasWei", "gasPayer", "fundedAtomic"])
  const result = { kind, chainId: 5042002 as const, escrow: i.call.escrow, intentId: i.id, jobId: escrowUint(r.jobId),
    txHash: escrowBytes32(r.txHash, false), blockHash: escrowBytes32(r.blockHash, false), blockNumber: escrowUint(r.blockNumber),
    blockTimestamp: escrowSeconds(r.blockTimestamp), gasWei: escrowUint(r.gasWei),
    gasPayer: kind === "budget" ? i.call.evaluator : i.client, fundedAtomic: kind === "fund" ? i.call.amount : 0n }
  escrowCheck(r.kind === kind && r.chainId === 5042002 && r.escrow === result.escrow && r.intentId === i.id &&
    result.jobId > 0n && (jobId === undefined || result.jobId === jobId) && result.blockNumber > 0n &&
    result.blockTimestamp >= i.issuedAt && result.blockTimestamp <= i.fundBy && r.gasPayer === result.gasPayer && r.fundedAtomic === result.fundedAtomic)
  return Object.freeze(result)
}
function actionOf(a: Action, i: EscrowBuyerIntent, jobId?: bigint): PreparedEscrowBuyerAction {
  return prepareEscrowBuyerAction(i, a.snapshot, a.kind === "create" ? { kind: "create" } :
    { kind: a.kind, jobId, allowanceAtomic: a.allowanceAtomic }, a.preparedAt)
}
function snapshotOf(raw: unknown, kind: Kind) {
  const fields = escrowRecord(raw, kind === "create" ? ["identity", "chainId", "escrow", "blockNumber", "blockHash", "timestamp"] :
    ["chainId", "escrow", "blockNumber", "blockHash", "timestamp", "jobId", "pendingClaimHash", "job"])
  // Replace nested input with captured data before any serialization; never call toJSON
  // or a getter while recording a preflight snapshot.
  if (kind === "create") fields.identity = captureEscrowIdentity(fields.identity)
  else fields.job = captureEscrowJob(fields.job)
  return { ...fields }
}
const totalGas = (e: Entry) => e.actions.reduce((sum, a) => sum + (a.proof?.gasWei ?? 0n), 0n)
function phase(e: Entry): string {
  if (e.accepted) return "accepted"
  if (e.rootAttempted) return "root_attempted"
  const last = e.actions.at(-1)
  if (last && (e.actions.length > 1 || !last.proof)) {
    return last.kind + (last.proof ? last.kind === "approve" ? "d" : "ed" : last.attempted ? "_attempted" : last.signed ? "_prepared" : "_intended")
  }
  if (e.budgetProof) return "budgeted"
  if (e.budgetAttempted) return "budget_attempted"
  return last ? "created" : "claimed"
}
const publicState = (e: Entry) => e.uncertain ? "uncertain" : phase(e)
function validate(row: Row) {
  escrowCheck(row.slot === 1 && /^[0-9a-f-]{36}$/.test(row.claim) && Number.isSafeInteger(row.revision) && row.revision >= 0 &&
    row.revision <= 32 && digest(row.json) === row.digest)
  const r = escrowRecord(unpack(row.json), ["claimId", "source", "body", "uncertain", "budgetAttempted", "budgetProof", "rootAttempted", "accepted", "actions"])
  escrowCheck(r.claimId === row.claim && typeof r.body === "string" && typeof r.uncertain === "boolean" &&
    typeof r.budgetAttempted === "boolean" && typeof r.rootAttempted === "boolean" && Array.isArray(r.actions) && r.actions.length <= 3)
  const captured = sourceOf(r.source, r.body), i = captured.intent
  const e: Entry = { claimId: row.claim, source: captured.source, body: r.body, uncertain: r.uncertain,
    budgetAttempted: r.budgetAttempted, budgetProof: null, rootAttempted: r.rootAttempted, accepted: null, actions: [] }
  let jobId: bigint | undefined, previous: Proof | undefined, gas = 0n, nonce: number | undefined
  const hashes = new Set<string>()
  for (let n = 0; n < r.actions.length; n++) {
    const raw = escrowRecord(r.actions[n], ["kind", "snapshot", "preparedAt", "allowanceAtomic", "signed", "attempted", "proof"])
    const kind = (["create", "approve", "fund"] as const)[n]!
    escrowCheck(raw.kind === kind && typeof raw.attempted === "boolean" && (n === 0 || e.actions[n - 1]!.proof !== null))
    if (n === 1) {
      escrowCheck(e.budgetAttempted && r.budgetProof !== null)
      e.budgetProof = proofOf(r.budgetProof, i, "budget", jobId)
      escrowCheck(previous && e.budgetProof.blockNumber >= previous.blockNumber && e.budgetProof.blockTimestamp >= previous.blockTimestamp)
      escrowCheck(!hashes.has(e.budgetProof.txHash)); hashes.add(e.budgetProof.txHash); previous = e.budgetProof
    }
    const allowanceAtomic = raw.allowanceAtomic === null ? null : escrowUint(raw.allowanceAtomic)
    escrowCheck(kind === "create" ? allowanceAtomic === null : allowanceAtomic === (kind === "approve" ? 0n : i.call.amount))
    const a: Action = { kind, snapshot: raw.snapshot, preparedAt: escrowSeconds(raw.preparedAt), allowanceAtomic,
      signed: null, attempted: raw.attempted, proof: null }, prepared = actionOf(a, i, jobId)
    if (previous) {
      const s = snapshotOf(a.snapshot, kind)
      escrowCheck(a.preparedAt >= previous.blockTimestamp && escrowSeconds(s.timestamp) >= previous.blockTimestamp &&
        escrowUint(s.blockNumber) >= previous.blockNumber)
    }
    if (raw.signed !== null) {
      const s = escrowRecord(raw.signed, ["hash", "serialized", "nonce", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "gasCapWei"])
      const terms = captureEscrowTransactionTerms({ nonce: s.nonce, gas: s.gas, maxFeePerGas: s.maxFeePerGas,
        maxPriorityFeePerGas: s.maxPriorityFeePerGas, gasCapWei: s.gasCapWei })
      escrowCheck(typeof s.serialized === "string" && /^0x02(?:[0-9a-f]{2}){1,65535}$/.test(s.serialized) &&
        keccak256(s.serialized as Hex) === s.hash && terms.gasCapWei <= i.gasBudgetWei - gas && (nonce === undefined || terms.nonce === nonce + 1))
      const tx = parseTransaction(s.serialized as `0x02${string}`)
      escrowCheck(tx.type === "eip1559" && tx.chainId === 5042002 && tx.to?.toLowerCase() === prepared.to && tx.data === prepared.data &&
        (tx.value ?? 0n) === 0n && tx.nonce === terms.nonce && tx.gas === terms.gas && tx.maxFeePerGas === terms.maxFeePerGas &&
        (tx.maxPriorityFeePerGas ?? 0n) === terms.maxPriorityFeePerGas && (!tx.accessList || tx.accessList.length === 0))
      a.signed = Object.freeze({ hash: escrowBytes32(s.hash, false), serialized: s.serialized as `0x02${string}`, ...terms })
      escrowCheck(!hashes.has(a.signed.hash)); hashes.add(a.signed.hash); nonce = terms.nonce
    }
    escrowCheck(!a.attempted || a.signed !== null)
    if (raw.proof !== null) {
      escrowCheck(a.attempted && a.signed !== null)
      a.proof = proofOf(raw.proof, i, kind, jobId)
      escrowCheck(a.proof.txHash === a.signed.hash && a.proof.gasWei <= a.signed.gasCapWei &&
        (!previous || a.proof.blockNumber >= previous.blockNumber && a.proof.blockTimestamp >= previous.blockTimestamp))
      if (kind === "create") jobId = a.proof.jobId
      previous = a.proof; gas += a.proof.gasWei; escrowCheck(gas <= i.gasBudgetWei)
    }
    e.actions.push(a)
  }
  if (e.budgetAttempted) escrowCheck(e.actions[0]?.proof !== null && e.actions[0]?.proof !== undefined)
  if (r.budgetProof !== null && e.budgetProof === null) {
    escrowCheck(e.budgetAttempted && jobId !== undefined && previous)
    e.budgetProof = proofOf(r.budgetProof, i, "budget", jobId)
    escrowCheck(e.budgetProof.blockNumber >= previous.blockNumber && e.budgetProof.blockTimestamp >= previous.blockTimestamp && !hashes.has(e.budgetProof.txHash))
  }
  if (e.rootAttempted) escrowCheck(e.actions.length === 3 && e.actions[2]!.proof !== null)
  if (r.accepted !== null) { escrowCheck(e.rootAttempted && !e.uncertain); e.accepted = acceptedOf(r.accepted, i) }
  escrowCheck(publicState(e) === row.state && pack(e) === row.json)
  return { entry: e, intent: i }
}

export function openEscrowBuyerJournal(path: string) {
  let db: Database | undefined, opened: Database, closed = false, inode = 0, device = 0
  const claims = new WeakSet<object>()
  const paths = () => {
    escrowCheck(typeof path === "string" && Buffer.byteLength(path) <= 4096 && isAbsolute(path) && resolve(path) === path && realpathSync(dirname(path)) === dirname(path))
    const dir = lstatSync(dirname(path))
    escrowCheck(dir.isDirectory() && dir.uid === process.getuid!() && (dir.mode & 0o777) === 0o700)
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      try { lstatSync(path + suffix) } catch (e) { if ((e as { code?: unknown }).code === "ENOENT") continue; throw e }
      throw Error("retained auxiliary file")
    }
  }
  const file = () => {
    paths(); const s = lstatSync(path)
    escrowCheck(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.uid === process.getuid!() &&
      s.size <= 2097152 && (s.mode & 0o777) === 0o600 && (!inode || s.ino === inode && s.dev === device)); return s
  }
  try {
    paths(); let created = false
    try {
      const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      try { fsyncSync(fd) } finally { closeSync(fd) }; created = true
      const directory = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY)
      try { fsyncSync(directory) } finally { closeSync(directory) }
    } catch (e) { if ((e as { code?: unknown }).code !== "EEXIST") throw e }
    const s = file(); inode = s.ino; device = s.dev
    db = new Database(path, { create: false, strict: true })
    const checkSchema = () => {
      const schema = db!.query<{ name: string; sql: string }, []>("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
      escrowCheck(schema.length === 1 && schema[0]!.name === "buyer_purchase" && schema[0]!.sql === SCHEMA &&
        db!.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version === 1 &&
        db!.query<{ quick_check: string }, []>("PRAGMA quick_check").get()?.quick_check === "ok")
    }
    // Refuse an existing unrelated DB before changing persistent journal settings.
    if (!created) checkSchema()
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; PRAGMA busy_timeout=1000")
    escrowCheck(db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode === "delete" &&
      db.query<{ synchronous: number }, []>("PRAGMA synchronous").get()?.synchronous === 3 &&
      db.query<{ fullfsync: number }, []>("PRAGMA fullfsync").get()?.fullfsync === 1)
    if (created) db.exec(SCHEMA + "; PRAGMA user_version=1")
    if (created) checkSchema()
    const rows = db.query<Row, []>("SELECT * FROM buyer_purchase LIMIT 2").all(); escrowCheck(rows.length <= 1)
    for (const row of rows) validate(row)
    opened = db
  } catch { try { db?.close() } catch { /* Fixed private-storage diagnostics only. */ } throw Error("escrow_buyer_journal_unavailable") }
  const guarded = <T>(work: () => T): T => {
    try { escrowCheck(!closed); file(); return work() } catch { throw Error("escrow_buyer_journal_unavailable") }
  }
  const current = () => opened.query<Row, []>("SELECT * FROM buyer_purchase WHERE slot=1").get()
  const owned = (claim: EscrowBuyerClaim) => {
    escrowCheck(claims.has(claim)); const row = current(); escrowCheck(row && row.claim === claim.id)
    const captured = validate(row); return { row, ...captured }
  }
  const save = (row: Row, entry: Entry) => {
    const json = pack(entry), next: Row = { ...row, revision: row.revision + 1, state: publicState(entry), json, digest: digest(json) }
    validate(next)
    escrowCheck(opened.query("UPDATE buyer_purchase SET revision=?,state=?,json=?,digest=? WHERE slot=1 AND revision=? AND digest=?")
      .run(next.revision, next.state, json, next.digest, row.revision, row.digest).changes === 1)
  }
  const advance = (claim: EscrowBuyerClaim, expected: string, change: (e: Entry, i: EscrowBuyerIntent) => void) => guarded(() =>
    opened.transaction(() => {
      const { row, entry, intent } = owned(claim); escrowCheck(!entry.uncertain && phase(entry) === expected)
      change(entry, intent); save(row, entry)
    }).immediate())
  const journal = Object.freeze({ durability: "durable" as const,
    async claim(raw: unknown, body: string): Promise<EscrowBuyerClaim | undefined> {
      return guarded(() => {
        const { source } = sourceOf(raw, body)
        return opened.transaction(() => {
          const old = current(); if (old) { validate(old); return undefined }
          const claim = Object.freeze({ id: crypto.randomUUID() }), entry: Entry = { claimId: claim.id, source, body,
            uncertain: false, budgetAttempted: false, budgetProof: null, rootAttempted: false, accepted: null, actions: [] }
          const json = pack(entry), row: Row = { slot: 1, claim: claim.id, revision: 0, state: "claimed", json, digest: digest(json) }
          validate(row); opened.query("INSERT INTO buyer_purchase VALUES (1,?,?,?,?,?)").run(row.claim, 0, row.state, json, row.digest)
          claims.add(claim); return claim
        }).immediate()
      })
    },
    async intent(claim: EscrowBuyerClaim, input: PreparedEscrowBuyerAction, snapshot: unknown, preparedAt: number, allowanceAtomic?: bigint) {
      try {
        const action = captureOriginalEscrowBuyerAction(input), kind = action.kind
        advance(claim, ({ create: "claimed", approve: "budgeted", fund: "approved" })[kind], (e, i) => {
          escrowCheck(i.id === action.intent.id)
          const a: Action = { kind, snapshot: snapshotOf(snapshot, kind), preparedAt: escrowSeconds(preparedAt),
            allowanceAtomic: allowanceAtomic === undefined ? null : escrowUint(allowanceAtomic), signed: null, attempted: false, proof: null }
          const rebuilt = actionOf(a, i, e.actions[0]?.proof?.jobId)
          escrowCheck(rebuilt.data === action.data && rebuilt.sender === action.sender && rebuilt.to === action.to && rebuilt.jobId === action.jobId)
          e.actions.push(a)
        })
      } catch { throw Error("escrow_buyer_journal_unavailable") }
    },
    async prepared(claim: EscrowBuyerClaim, signed: EscrowSignedAction) {
      try {
        const { entry, intent } = guarded(() => owned(claim)), a = entry.actions.at(-1); escrowCheck(a)
        const s = escrowRecord(signed, ["hash", "serialized", "nonce", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "gasCapWei"]),
          hash = escrowBytes32(s.hash, false), serialized = s.serialized,
          terms = captureEscrowTransactionTerms({ nonce: s.nonce, gas: s.gas, maxFeePerGas: s.maxFeePerGas,
            maxPriorityFeePerGas: s.maxPriorityFeePerGas, gasCapWei: s.gasCapWei })
        const captured = await assertEscrowBuyerSigned(actionOf(a, intent, entry.actions[0]?.proof?.jobId), serialized, terms)
        escrowCheck(captured.hash === hash)
        advance(claim, a.kind + "_intended", e => { e.actions.at(-1)!.signed = captured })
      } catch { throw Error("escrow_buyer_journal_unavailable") }
    },
    async attempt(claim: EscrowBuyerClaim, hash: unknown) {
      try {
        const { entry, intent } = guarded(() => owned(claim)), a = entry.actions.at(-1); escrowCheck(a?.signed)
        const s = a.signed
        await assertEscrowBuyerSigned(actionOf(a, intent, entry.actions[0]?.proof?.jobId), s.serialized,
          { nonce: s.nonce, gas: s.gas, maxFeePerGas: s.maxFeePerGas, maxPriorityFeePerGas: s.maxPriorityFeePerGas, gasCapWei: s.gasCapWei })
        advance(claim, a.kind + "_prepared", e => { escrowCheck(escrowBytes32(hash, false) === e.actions.at(-1)!.signed!.hash); e.actions.at(-1)!.attempted = true })
      } catch { throw Error("escrow_buyer_journal_unavailable") }
    },
    async confirmed(claim: EscrowBuyerClaim, raw: unknown) {
      const { entry } = guarded(() => owned(claim)), a = entry.actions.at(-1)
      if (!a) throw Error("escrow_buyer_journal_unavailable")
      advance(claim, a.kind + "_attempted", (e, i) => { e.actions.at(-1)!.proof = proofOf(raw, i, a.kind, e.actions[0]?.proof?.jobId) })
    },
    async httpAttempt(claim: EscrowBuyerClaim, kind: "budget" | "root") {
      if (kind !== "budget" && kind !== "root") throw Error("escrow_buyer_journal_unavailable")
      advance(claim, kind === "budget" ? "created" : "funded", e => {
        if (kind === "budget") e.budgetAttempted = true; else e.rootAttempted = true
      })
    },
    async budgetConfirmed(claim: EscrowBuyerClaim, raw: unknown) {
      advance(claim, "budget_attempted", (e, i) => { e.budgetProof = proofOf(raw, i, "budget", e.actions[0]!.proof!.jobId) })
    },
    async accepted(claim: EscrowBuyerClaim, raw: unknown) {
      advance(claim, "root_attempted", (e, i) => { e.accepted = acceptedOf(raw, i) })
    },
    async uncertain(claim: EscrowBuyerClaim) {
      guarded(() => opened.transaction(() => {
        const { row, entry } = owned(claim)
        if (entry.uncertain || entry.accepted) return
        entry.uncertain = true; save(row, entry)
      }).immediate())
    },
    async inspect() {
      return guarded(() => {
        const row = current(); if (!row) return Object.freeze({ state: "empty" as const })
        const { entry: e, intent: i } = validate(row)
        return Object.freeze({ state: publicState(e), intentId: i.id, spentGasWei: totalGas(e),
          proofs: Object.freeze([e.actions[0]?.proof, e.budgetProof, ...e.actions.slice(1).map(a => a.proof)].filter(p => p != null)) })
      })
    },
    /** Private result capability; do not log or include in public SDK proof projections. */
    async readAccepted(): Promise<Readonly<Accepted> | undefined> {
      return guarded(() => { const row = current(); return row ? validate(row).entry.accepted ?? undefined : undefined })
    }
  })
  return Object.freeze({ journal, close: () => { if (!closed) { closed = true; opened.close() } } })
}
