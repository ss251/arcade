import { createHash, randomBytes } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, mkdtemp, open, readFile, realpath, type FileHandle } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Database } from "bun:sqlite"
import { Schema } from "effect"
import type { SessionLedgerCall } from "../apps/hub/src/session-ledger.ts"
import type { SessionReceiptJson } from "../packages/buyer/src/session-wire.ts"
import type { BuyerSessionPromise } from "../packages/buyer/src/session.ts"
import type { FixtureStart } from "./fixtures/gateway-session-runtime.ts"

// Legacy core selects a chain at module evaluation. Never evaluate it for help,
// refusal or importing this entry. Explicit operations catch fixed diagnostics.
let loaded: Promise<readonly [typeof import("@arcade/core"), typeof import("../apps/hub/src/session-ledger.ts"), typeof import("../apps/hub/src/sessions.ts"), typeof import("../packages/buyer/src/session-wire.ts")]> | undefined
const libraries = () => loaded ??= Promise.all([import("@arcade/core"), import("../apps/hub/src/session-ledger.ts"), import("../apps/hub/src/sessions.ts"), import("../packages/buyer/src/session-wire.ts")])

/** Offline-only evidence. No environment credential is read by this entry. */
export class SessionEvidenceError extends Error { readonly _tag = "SessionEvidenceError"; constructor() { super("Gateway session evidence unavailable") } }
const bad = (): never => { throw new SessionEvidenceError() }
function check(condition: unknown): asserts condition { if (!condition) bad() }
const hash = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex")
const exact = (v: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join(",") !== [...keys].sort().join(",")) return bad()
  return v as Record<string, unknown>
}
const row = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : bad()
const text = (v: unknown): string => typeof v === "string" ? v : bad()
const list = (v: unknown, length: number): readonly unknown[] => Array.isArray(v) && v.length === length ? v : bad()
const unique = (values: readonly string[]): void => check(new Set(values).size === values.length)
export const parseSessionEvidenceArgs = (argv: readonly string[]): { mode: "help" | "offline" } => {
  if (argv.length === 1 && argv[0] === "--help") return { mode: "help" }
  if (argv.length === 1 && argv[0] === "--offline") return { mode: "offline" }
  return bad()
}
export interface EvidenceObservation {
  readonly index: number; readonly jobId: string; readonly nonce: string; readonly validAfter: string; readonly validBefore: string
  readonly inputDigest: string; readonly outputDigest: string; readonly settleRef: string
}
export interface EvidenceRows { readonly sessions: readonly unknown[]; readonly calls: readonly unknown[]; readonly jobs: readonly unknown[]; readonly receipts: readonly unknown[] }
export interface TwentyCallEvidence extends EvidenceRows {
  readonly closed: SessionReceiptJson; readonly buyer: string; readonly seller: string; readonly observations: readonly EvidenceObservation[]
}
/** Bounded persisted rows, not a caller's claimed count. The production ledger validator
 * is supplemented with independent global membership, scalar, fixture and source facts. */
export const assertTwentyCallEvidence = async (input: unknown): Promise<{ readonly closedHash: string; readonly persistedHash: string }> => {
  try {
    const [{ Job, Receipt, Session, loadChainConfig }, { sessionJson, sessionParse, sessionRequestDigest, sessionAuthorizationKey, sessionSnapshot, validateSessionLedger }, { sessionReceipt }, { decodeSessionClosed, sessionData }] = await libraries()
    const canonical = (v: unknown) => sessionJson(v, 1_048_576)
    const v = exact(input, ["sessions", "calls", "jobs", "receipts", "closed", "buyer", "seller", "observations"])
    const header = row(list(v.sessions, 1)[0]), envelope = exact(sessionParse(text(header.json)), ["session", "callCount", "heldAtomic"])
    const s = Schema.decodeUnknownSync(Session, { onExcessProperty: "error" })(envelope.session)
    check(envelope.callCount === 20 && envelope.heldAtomic === 0n && header.call_count === 20 && header.held_atomic === "0")
    check(header.id === s.id && header.buyer === s.buyer && header.budget_atomic === s.budgetAtomic.toString() && header.spent_atomic === s.spentAtomic.toString() &&
      header.rail === s.rail && header.network === s.network && header.opened_at_ms === s.openedAtMs && header.closed_at_ms === s.closedAtMs)
    const chain = loadChainConfig("arc-testnet")
    check(s.buyer === v.buyer && v.buyer !== v.seller && s.rail === "gateway" && s.network === chain.caip2 && s.budgetAtomic === 200_000n && s.spentAtomic === 200_000n && s.closedAtMs !== undefined)
    const calls = list(v.calls, 20).map(value => {
      const r = row(value), c = sessionParse(text(r.json)) as SessionLedgerCall
      check(r.job_id === c.binding?.jobId && r.session_id === s.id && r.session_id === c.binding.sessionId && r.authorization_key === sessionAuthorizationKey(c.binding) &&
        r.state === c.state && r.amount_atomic === String(c.binding.amountAtomic) && r.created_at_ms === c.createdAtMs &&
        r.settlement_key === JSON.stringify([c.binding.network, c.binding.rail, c.settleRef]))
      return c
    })
    const jobs = list(v.jobs, 20).map(value => { const r = row(value), j = Schema.decodeUnknownSync(Job, { onExcessProperty: "error" })(sessionParse(text(r.json), 1_048_576))
      check(r.id === j.id && r.status === j.status && r.created_at_ms === j.createdAtMs && typeof r.boot_id === "string" && r.boot_id.length > 0); return j })
    const receipts = list(v.receipts, 20).map(value => { const r = row(value), p = Schema.decodeUnknownSync(Receipt, { onExcessProperty: "error" })(sessionParse(text(r.json), 1_048_576))
      check(r.job_id === p.jobId && r.created_at_ms === p.createdAtMs && r.accrual_id === null && p.feeAccrualId === undefined); return p })
    const observations = list(v.observations, 20).map(value => exact(sessionData(value, 4096), ["index", "jobId", "nonce", "validAfter", "validBefore", "inputDigest", "outputDigest", "settleRef"]))
    for (const ids of [calls.map(c => c.binding.jobId), jobs.map(j => j.id), receipts.map(p => p.jobId), observations.map(o => text(o.jobId))]) {
      unique(ids); check([...ids].sort().join() === jobs.map(j => j.id).sort().join())
    }
    unique(observations.map(o => text(o.nonce))); unique(observations.map(o => text(o.settleRef)))
    const st = { sessions: new Map([[s.id, s]]), sessionCalls: new Map(calls.map(c => [c.binding.jobId, c])), jobs: new Map(jobs.map(j => [j.id, j])), receipts }
    validateSessionLedger(st)
    const closed = decodeSessionClosed(v.closed, { id: s.id, buyer: s.buyer, rail: s.rail, network: s.network, budgetAtomic: s.budgetAtomic })
    check(closed.settledCalls === 20 && closed.calls.length === 20 && closed.settlementRefs.length === 20 && closed.spentAtomic === "200000" && closed.heldAtomic === "0")
    const snapshot = sessionSnapshot(st, s.id); check(snapshot !== undefined)
    const expectedClosed = sessionReceipt(snapshot!)
    const decodedCoreClosed = { ...closed, budgetAtomic: BigInt(closed.budgetAtomic), spentAtomic: BigInt(closed.spentAtomic), heldAtomic: BigInt(closed.heldAtomic),
      calls: closed.calls.map(c => ({ ...c, priceAtomic: BigInt(c.priceAtomic) })) }
    check(canonical({ ...expectedClosed }) === canonical(decodedCoreClosed))
    observations.forEach((o, offset) => {
      check(o.index === offset + 1)
      const jobId = text(o.jobId), c = st.sessionCalls.get(jobId)!, b = c.binding, j = st.jobs.get(jobId)!, p = receipts.find(r => r.jobId === jobId)!
      const expectedInput = sessionRequestDigest({ index: offset + 1 }), expectedOutput = sessionRequestDigest({ index: offset + 1, proof: "offline-runner-probe" })
      check(b.sessionId === s.id && b.buyer === v.buyer && b.seller === v.seller && b.payTo === v.seller && b.skillId === "gateway-session-probe" && b.skillVersion === "1.0.0" &&
        b.amountAtomic === 10_000n && b.asset === chain.usdc.address.toLowerCase() && b.verifyingContract === chain.gateway!.wallet.toLowerCase() &&
        b.domainName === "GatewayWalletBatched" && b.domainVersion === "1" && b.rail === "gateway" && b.network === chain.caip2 &&
        b.nonce === o.nonce && /^0x[0-9a-f]{64}$/.test(b.nonce) && !/^0x0{64}$/.test(b.nonce) && b.validAfter.toString() === o.validAfter && b.validBefore.toString() === o.validBefore)
      check(c.state === "settled" && c.settleRefKind === "gateway-transfer" && c.settleRef === o.settleRef && p.authorizationNonce === b.nonce && p.settleTx === o.settleRef)
      check(b.requestDigest === expectedInput && o.inputDigest === expectedInput && sessionRequestDigest(j.input) === expectedInput &&
        o.outputDigest === expectedOutput && sessionRequestDigest(j.outcome?.output) === expectedOutput)
      const { outcome: _outcome, ...withoutOutcome } = j
      check(c.queuedDigest === sessionRequestDigest({ ...withoutOutcome, status: "queued" }) && c.terminalJobDigest === sessionRequestDigest(j) && c.receiptDigest === sessionRequestDigest(p))
      check(j.status === "succeeded" && j.outcome?.status === "succeeded" && j.outcome.stopReason === "end_turn" && p.reason === "ok" && p.feeAtomic === 0n && p.feeBps === 0 && p.sellerAtomic === 10_000n && p.settled)
      for (const field of ["children", "treeHash", "treeCeilingAtomic", "treeCommittedAtomic", "receiptSignature", "feeAccrualId", "feeSweepTx", "canary"] as const) check(p[field] === undefined)
      check(j.rootJobId === jobId && j.parentJobId === undefined && j.hop === 0 && j.ancestors?.length === 0 && p.rootJobId === jobId && p.parentJobId === undefined && p.hop === 0 && p.ancestors?.length === 0)
      check(c.createdAtMs === j.createdAtMs && p.latencyMs === p.createdAtMs - j.createdAtMs && s.openedAtMs <= j.createdAtMs && j.createdAtMs <= j.outcome.startedAtMs &&
        j.outcome.startedAtMs <= j.outcome.finishedAtMs && j.outcome.finishedAtMs <= p.createdAtMs && p.createdAtMs <= s.closedAtMs!)
    })
    return Object.freeze({ closedHash: hash(canonical(closed)), persistedHash: hash(canonical({ sessions: v.sessions, calls: v.calls, jobs: v.jobs, receipts: v.receipts })) })
  } catch { return bad() }
}

/** Read-only, globally bounded sentinel queries; never imports a mutating Store. */
export const readSessionEvidence = (path: string): EvidenceRows => {
  let db: Database | undefined
  try {
    db = new Database(path, { readonly: true, strict: true })
    const sessions = db.query("SELECT id,buyer,budget_atomic,spent_atomic,rail,network,opened_at_ms,closed_at_ms,call_count,held_atomic,json FROM sessions ORDER BY id LIMIT 2").all()
    const calls = db.query("SELECT job_id,session_id,authorization_key,state,amount_atomic,created_at_ms,settlement_key,json FROM session_calls ORDER BY job_id LIMIT 21").all()
    const jobs = db.query("SELECT id,status,boot_id,created_at_ms,json FROM jobs ORDER BY id LIMIT 21").all()
    const receipts = db.query("SELECT job_id,accrual_id,created_at_ms,json FROM receipts ORDER BY job_id LIMIT 21").all()
    for (const table of ["tree_reservations", "pay_tests", "erc8004_docs", "ratings"] as const) check(db.query(`SELECT 1 FROM ${table} LIMIT 1`).get() === null)
    return { sessions, calls, jobs, receipts }
  } catch { return bad() } finally { try { db?.close() } catch { bad() } }
}

export interface EvidenceJournal {
  readonly directory: string; readonly append: (event: string, facts: unknown) => Promise<void>
  readonly close: () => Promise<string>
}
/** Fresh private owner, not a resumable capability or funding journal. */
export const createEvidenceJournal = async (parent = tmpdir()): Promise<EvidenceJournal> => {
  let handle: FileHandle | undefined
  try {
    const [, { sessionJson }, , { sessionData }] = await libraries()
    const canonical = (v: unknown) => sessionJson(v, 1_048_576)
    const directory = await realpath(await mkdtemp(join(parent, "arcade-gateway-session-"))); await chmod(directory, 0o700)
    check((await lstat(directory)).isDirectory())
    handle = await open(join(directory, "evidence.jsonl"), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    await handle.sync()
    for (const path of [directory, dirname(directory)]) { const dir = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      try { await dir.sync() } finally { await dir.close() } }
    let poison = false, closed = false, seq = 0, head = "0".repeat(64), queue = Promise.resolve()
    const claims = new Set<string>()
    return Object.freeze({ directory,
      append(event: string, facts: unknown) {
        let encoded: string
        try {
          check(!closed && !poison && ["intent", "sources", "open", "call", "signer", "paid", "result", "close", "closed", "cleanup", "audit", "runtime", "uncertain"].includes(event))
          const fields: Readonly<Record<string, readonly string[]>> = {
            intent: ["runId", "calls", "amountAtomic", "budgetAtomic", "mode"], sources: ["manifestHash", "sourceHash", "executedSourceHash", "policyHash", "implementationHash"], open: [], call: ["index", "inputDigest"],
            signer: ["index", "nonce", "validAfter", "validBefore", "typedDataHash"], paid: ["index", "inputDigest"],
            result: ["index", "jobId", "nonce", "validAfter", "validBefore", "inputDigest", "outputDigest", "settleRef"],
            close: [], closed: ["closedHash"], cleanup: ["hubStopped", "runnerStopped", "listening"], audit: ["closedHash", "persistedHash"], uncertain: ["stage"], runtime: ["hub", "runner"]
          }
          const safe = sessionData(facts, 16_384), f = exact(safe, fields[event]!)
          const decimal = (value: unknown) => typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value)
          if (event === "intent") check(f.mode === "offline" && f.calls === 20 && f.amountAtomic === "10000" && f.budgetAtomic === "200000" && typeof f.runId === "string" && /^[a-f0-9]{32}$/.test(f.runId))
          if (["sources", "closed", "audit"].includes(event)) for (const value of Object.values(f)) hexHash(value)
          if (["call", "paid", "result"].includes(event)) evidenceDigest(f.inputDigest)
          if (["signer", "result"].includes(event)) {
            evidenceDigest(f.nonce); check(f.nonce !== `0x${"0".repeat(64)}` && decimal(f.validAfter) && decimal(f.validBefore) && BigInt(String(f.validAfter)) < BigInt(String(f.validBefore)))
          }
          if (event === "signer") hexHash(f.typedDataHash)
          if (event === "result") { jobOf(f.jobId); evidenceDigest(f.outputDigest); uuid(f.settleRef); check(integer(f.index, 20) >= 1) }
          if (event === "cleanup") check(f.hubStopped === true && f.runnerStopped === true && f.listening === false)
          if (event === "uncertain") check(["setup", "readiness", "open", "calls", "cleanup", "audit"].includes(String(f.stage)))
          if (event === "runtime") for (const role of ["hub", "runner"] as const) {
            const counters = exact(f[role], role === "hub" ? ["rpcCalls", "verifyCalls", "settleCalls", "beginCalls", "finishCalls", "unexpectedRequests"] : ["spawned", "exited", "results", "unexpectedRequests"])
            for (const v of Object.values(counters)) check(v === null || Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000)
          }
          if (["open", "call", "signer", "paid", "close"].includes(event)) {
            const key = `${event}:${event === "call" || event === "signer" || event === "paid" ? f.index : "once"}`
            if (event === "call" || event === "signer" || event === "paid") check(Number.isInteger(f.index) && Number(f.index) >= 1 && Number(f.index) <= 20)
            check(!claims.has(key)); claims.add(key)
          }
          encoded = canonical({ version: 1, seq: ++seq, previous: head, event, facts: safe }); head = hash(encoded)
        } catch { poison = true; return Promise.reject(new SessionEvidenceError()) }
        const writing = queue.then(async () => { check(!poison); try {
          const bytes = Buffer.from(encoded + "\n"), result = await handle!.write(bytes); check(result.bytesWritten === bytes.length); await handle!.sync()
        } catch { poison = true; bad() } })
        queue = writing; void queue.catch(() => {}); return writing
      },
      async close() { check(!closed); closed = true; try { await queue; check(!poison); await handle!.sync(); await handle!.close(); return head }
        catch { try { await handle!.close() } catch {} return bad() } }
    })
  } catch { try { await handle?.close() } catch {} return bad() }
}

/** Retains the original closed artifact, not a reconstructed summary; never overwrites. */
export async function writeClosedEvidence(directory: string, value: unknown): Promise<string> {
  let file: FileHandle | undefined, dir: FileHandle | undefined
  try {
    const [, { sessionJson }, , { sessionData }] = await libraries()
    const data = Buffer.from(sessionJson(sessionData(value, 131072), 131072))
    file = await open(join(directory, "closed.json"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    check((await file.write(data)).bytesWritten === data.length); await file.sync(); await file.close(); file = undefined
    dir = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); await dir.sync(); await dir.close(); dir = undefined
    return hash(data)
  } catch { return bad() } finally { await file?.close().catch(() => {}); await dir?.close().catch(() => {}) }
}
export async function evidencePolicyHash(): Promise<string> {
  try {
    const [{ loadChainConfig }, { sessionJson }] = await libraries(), { FIXTURE_POLICY } = await import("./fixtures/gateway-session-runtime.ts")
    return hash(sessionJson({ ...FIXTURE_POLICY, chain: { ...loadChainConfig("arc-testnet") }, fundsMoved: false, liveEvidence: "NOT_RUN" }, 16384))
  } catch { return bad() }
}
/** Verify the closed, on-disk journal after all writers have exited. */
export async function verifyEvidenceJournal(directory: string, expectedHash: string): Promise<void> {
  let file: FileHandle | undefined
  try {
    const [, { sessionJson }] = await libraries()
    file = await open(join(directory, "evidence.jsonl"), constants.O_RDONLY | constants.O_NOFOLLOW)
    const metadata = await file.stat(); check(metadata.isFile() && metadata.nlink === 1 && metadata.size <= 262144 && (metadata.mode & 0o777) === 0o600 && metadata.uid === process.getuid?.())
    const content = await file.readFile({ encoding: "utf8" }); check(content.endsWith("\n"))
    const lines = content.slice(0, -1).split("\n"), events = ["intent", "sources", "open", ...Array.from({ length: 20 }, () => ["call", "signer", "paid", "result"]).flat(), "close", "closed", "cleanup", "audit"]
    check(lines.length === events.length); let previous = "0".repeat(64)
    for (const [i, line] of lines.entries()) {
      check(Buffer.byteLength(line) <= 32768); const value = exact(JSON.parse(line), ["version", "seq", "previous", "event", "facts"])
      check(sessionJson(value, 32768) === line && value.version === 1 && value.seq === i + 1 && value.previous === previous && value.event === events[i])
      if (i >= 3 && i < 83) check(row(value.facts).index === Math.floor((i - 3) / 4) + 1)
      previous = hash(line)
    }
    check(previous === expectedHash); await file.close(); file = undefined
  } catch { return bad() } finally { await file?.close().catch(() => {}) }
}

const bounded = async <T>(work: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SessionEvidenceError()), Math.max(1, ms)) })]) }
  finally { if (timer !== undefined) clearTimeout(timer) }
}
const integer = (v: unknown, max: number): number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max ? Number(v) : bad()
const pidOf = (v: unknown): number => integer(v, 2_147_483_647) > 1 ? Number(v) : bad()
const hexHash = (v: unknown): string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v) ? v : bad()
const evidenceDigest = (v: unknown): string => typeof v === "string" && /^0x[a-f0-9]{64}$/.test(v) ? v : bad()
const jobOf = (v: unknown): string => typeof v === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(v) ? v : bad()
const uuid = (v: unknown): string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v) ? v : bad()
const loopback = (v: unknown): string => {
  check(typeof v === "string" && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(v))
  const u = new URL(v as string); check(u.origin === v && Number(u.port) <= 65535); return v as string
}
export interface FixtureFrame { readonly version: 1; readonly runId: string; readonly role: "hub" | "runner"; readonly event: "ready" | "snapshot" | "stopped" | "failed"; readonly facts: Record<string, unknown> }
/** Closed IPC decoder: counters and record identities never become public output. */
export function decodeEvidenceFrame(input: unknown, expected: { runId: string; role: "hub" | "runner"; pid: number }): FixtureFrame {
  try {
    const v = exact(input, ["version", "runId", "role", "event", "facts"])
    check(v.version === 1 && v.runId === expected.runId && v.role === expected.role && ["ready", "snapshot", "stopped", "failed"].includes(text(v.event)))
    if (v.event === "failed") { check(exact(v.facts, ["code"]).code === "fixture_unavailable"); return v as unknown as FixtureFrame }
    const hub = expected.role === "hub", ready = v.event === "ready"
    const fields = hub ? ready ? ["pid", "origin"] : ["pid", "origin", "rpcCalls", "verifyCalls", "settleCalls", "beginCalls", "finishCalls", "unexpectedRequests", "records", "facilitator"]
      : ready ? ["pid", "manifestHash", "sourceHash", "guardedSourceHash"] : ["pid", "manifestHash", "sourceHash", "guardedSourceHash", "spawned", "exited", "results", "unexpectedRequests", "records"]
    const f = exact(v.facts, fields); check(pidOf(f.pid) === expected.pid)
    if (hub) loopback(f.origin); else for (const key of ["manifestHash", "sourceHash", "guardedSourceHash"]) hexHash(f[key])
    if (!ready) {
      check(integer(f.unexpectedRequests, 1000) === 0)
      for (const key of hub ? ["verifyCalls", "settleCalls", "beginCalls", "finishCalls"] : ["spawned", "exited", "results"]) integer(f[key], 20)
      if (hub) integer(f.rpcCalls, 4)
      check(Array.isArray(f.records) && f.records.length <= 20)
      const ids: string[] = [], indices: number[] = [], pids: number[] = []
      for (const entry of f.records as unknown[]) {
        const r = exact(entry, hub ? ["jobId", "nonce", "begin", "finish", "settleRef"] : ["jobId", "index", "pid", "inputDigest", "outputDigest", "exitCode"])
        ids.push(jobOf(r.jobId))
        if (hub) { evidenceDigest(r.nonce); check(r.nonce !== `0x${"0".repeat(64)}` && typeof r.begin === "boolean" && typeof r.finish === "boolean"); if (r.settleRef !== null) uuid(r.settleRef) }
        else { check(integer(r.index, 20) >= 1); indices.push(Number(r.index)); pids.push(pidOf(r.pid)); evidenceDigest(r.inputDigest); if (r.outputDigest !== null) evidenceDigest(r.outputDigest); if (r.exitCode !== null) integer(r.exitCode, 255) }
      }
      unique(ids); if (!hub) { unique(indices.map(String)); unique(pids.map(String)) }
      if (hub) {
        check(Array.isArray(f.facilitator) && f.facilitator.length <= 20); const nonces: string[] = []
        for (const entry of f.facilitator as unknown[]) { const r = exact(entry, ["nonce", "verify", "settle", "settleRef"])
          nonces.push(evidenceDigest(r.nonce)); check(r.verify === 1 && (r.settle === 0 || r.settle === 1)); if (r.settleRef !== null) uuid(r.settleRef) }
        unique(nonces)
      }
    }
    return v as unknown as FixtureFrame
  } catch { return bad() }
}
export interface EvidenceChild { readonly pid: number; readonly ready: Promise<FixtureFrame>; readonly snapshot: () => Promise<FixtureFrame>; readonly stop: () => Promise<FixtureFrame>; readonly reap: () => Promise<void>; readonly counters: () => Readonly<Record<string, number | null>> }
/** Every descendant entry is owned by the fixture. This parent owns only these two handles. */
export function launchEvidenceChild(config: FixtureStart): EvidenceChild {
  const root = fileURLToPath(new URL("../", import.meta.url)), file = fileURLToPath(new URL("./fixtures/gateway-session-runtime.ts", import.meta.url))
  const child = Bun.spawn([process.execPath, "--no-env-file", file, `--${config.role}`], { cwd: root, env: { PATH: dirname(process.execPath), ARCADE_NETWORK: "arc-testnet" }, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  let fatal = false, awaiting: { event: string; resolve: (v: FixtureFrame) => void; reject: (e: Error) => void } | undefined, total = 0, stopped = false
  const counts: Record<string, number | null> = Object.fromEntries((config.role === "hub" ? ["rpcCalls", "verifyCalls", "settleCalls", "beginCalls", "finishCalls", "unexpectedRequests"] : ["spawned", "exited", "results", "unexpectedRequests"]).map(key => [key, null]))
  const response = (event: string): Promise<FixtureFrame> => {
    check(!fatal && awaiting === undefined)
    return new Promise((resolve, reject) => { awaiting = { event, resolve, reject } })
  }
  const failChild = () => { fatal = true; awaiting?.reject(new SessionEvidenceError()); awaiting = undefined }
  const ready = response("ready"); void ready.catch(() => {})
  const stdout = (async () => {
    const reader = child.stdout.getReader(), decoder = new TextDecoder("utf-8", { fatal: true }); let pending = ""
    try { for (;;) {
      const next = await reader.read(); if (next.done) break
      total += next.value.byteLength; check(total <= 262144)
      pending += decoder.decode(next.value, { stream: true }); check(Buffer.byteLength(pending) <= 65536)
      for (;;) { const newline = pending.indexOf("\n"); if (newline < 0) break
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
        check(line.startsWith("GATEWAY_SESSION_FIXTURE "))
        const parsed: unknown = JSON.parse(line.slice(24)), f = row(parsed)
        if (f.version === 1 && f.runId === config.runId && f.role === config.role && row(f.facts).pid === child.pid) {
          for (const key of Object.keys(counts)) { const value = row(f.facts)[key]; if (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1000) counts[key] = Number(value) }
        }
        const frame = decodeEvidenceFrame(parsed, { runId: config.runId, role: config.role, pid: child.pid })
        check(frame.event !== "failed" && awaiting !== undefined && awaiting.event === frame.event)
        const wait = awaiting!; awaiting = undefined; wait.resolve(frame)
      }
    } pending += decoder.decode(); check(pending === "" && awaiting === undefined) } catch { failChild(); throw new SessionEvidenceError() } finally { reader.releaseLock() }
  })()
  const stderr = (async () => { const reader = child.stderr.getReader(); try { for (;;) { const r = await reader.read(); if (r.done) break; check(r.value.length === 0) } }
    catch { failChild(); throw new SessionEvidenceError() } finally { reader.releaseLock() } })()
  void stdout.catch(() => {}); void stderr.catch(() => {})
  child.stdin.write(JSON.stringify(config) + "\n"); void child.stdin.flush()
  const command = async (name: "snapshot" | "stop") => {
    const reply = response(name === "stop" ? "stopped" : "snapshot"); void reply.catch(() => {})
    child.stdin.write(JSON.stringify({ version: 1, runId: config.runId, command: name }) + "\n"); await child.stdin.flush()
    return bounded(reply, Math.min(8000, config.deadlineUnixMs - Date.now()))
  }
  const reap = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
      try { await bounded(child.exited, 5000) } catch { child.kill("SIGKILL"); await bounded(child.exited, 1000) }
    }
    await bounded(Promise.allSettled([stdout, stderr]), 1000)
    check(child.exitCode !== null || child.signalCode !== null)
  }
  return Object.freeze({ pid: child.pid, ready: bounded(ready, 10000), snapshot: () => command("snapshot"), reap, counters: () => Object.freeze({ ...counts }),
    async stop() { check(!stopped); stopped = true; try { const frame = await command("stop"); child.stdin.end(); const code = await bounded(child.exited, 6000)
      await bounded(Promise.all([stdout, stderr]), 1000); check(code === 0 && !fatal); return frame } finally { await reap() } }
  })
}

/** The single sequential owner stops at the first unknown result. There is no
 * finally-close, replacement session, re-sign, extra call or funding fallback. */
export async function executeTwentySessionCalls(session: BuyerSessionPromise, journal: EvidenceJournal,
  capture: { index: number; readonly signed: Map<number, { nonce: string; validAfter: string; validBefore: string }> }, signal: AbortSignal): Promise<{ observations: readonly EvidenceObservation[]; closed: SessionReceiptJson }> {
  const [, { sessionRequestDigest }] = await libraries(), observations: EvidenceObservation[] = []
  for (let index = 1; index <= 20; index++) {
    check(!signal.aborted); capture.index = index
    const input = Object.freeze({ index }), inputDigest = sessionRequestDigest(input)
    await journal.append("call", { index, inputDigest }); check(!signal.aborted)
    const result = await session.call({ seller: "gateway-session-probe", skillId: "gateway-session-probe", input, maxAmountAtomic: 10000n, maxWaitMs: 5000, pollIntervalMs: 20 }, { signal })
    check(!signal.aborted && result.status === "succeeded" && result.authorizedAmountAtomic === 10000n)
    const signed = capture.signed.get(index); check(signed !== undefined)
    const observation = Object.freeze({ index, jobId: jobOf(result.jobId), ...signed!, inputDigest,
      outputDigest: sessionRequestDigest(result.result), settleRef: uuid(result.receipt.settleTx) })
    check(observation.outputDigest === sessionRequestDigest({ index, proof: "offline-runner-probe" }))
    await journal.append("result", observation); observations.push(observation)
  }
  capture.index = 0; check(!signal.aborted)
  await journal.append("close", {}); check(!signal.aborted)
  let closed: SessionReceiptJson
  try { closed = await session.close({ signal }) }
  catch { check(!signal.aborted); const status = await session.status({ signal }); check(status.closed && status.closedReceipt !== undefined); closed = status.closedReceipt! }
  return { observations: Object.freeze(observations), closed }
}

export interface OfflineSessionSummary {
  readonly mode: "offline"; readonly status: "PASS"; readonly calls: 20; readonly priceAtomic: "10000"; readonly budgetAtomic: "200000"; readonly spentAtomic: "200000"
  readonly transferReferences: 20; readonly minedBatchesProved: 0; readonly fundsMoved: false; readonly liveEvidence: "NOT_RUN"
  readonly closedHash: string; readonly persistedHash: string; readonly journalHash: string; readonly manifestHash: string; readonly sourceHash: string; readonly executedSourceHash: string
}
/** F12-only outbound observation. Capabilities stay in this private closure, never
 * its result, journal or diagnostics. Server authentication remains authoritative. */
export function makeEvidenceRequestAudit(origin: string) {
  loopback(origin)
  let sessionId: string | undefined, sessionToken: string | undefined
  const jobTokens = new Map<string, string>()
  const token = (value: string | null): string => typeof value === "string" && /^[a-f0-9]{32}$/.test(value) ? value : bad()
  return Object.freeze({
    opened(id: string) { check(sessionId === undefined && /^ses_[a-f0-9]{32}$/.test(id)); sessionId = id },
    record(urlString: string, method: string, headers: Headers) {
      const u = new URL(urlString); check(u.origin === origin && u.search === "" && u.hash === "")
      check(!headers.has("x-payment") && !headers.has("authorization") && !headers.has("cookie"))
      const publicRequest = method === "POST" && u.pathname === "/sessions" || method === "GET" && u.pathname === "/listings/gateway-session-probe"
      if (publicRequest) {
        for (const key of ["x-arcade-session", "x-session-token", "x-job-token", "payment-signature"]) check(!headers.has(key))
        return
      }
      check(sessionId !== undefined && headers.get("x-arcade-session") === sessionId)
      const present = token(headers.get("x-session-token")), probe = method === "POST" && u.pathname === "/x/gateway-session-probe/gateway-session-probe"
      if (sessionToken === undefined) {
        check((probe || method === "GET" && u.pathname === `/sessions/${sessionId}`) && !headers.has("payment-signature")); sessionToken = present
      }
      else check(present === sessionToken)
      const result = method === "GET" ? /^\/jobs\/(job_[A-Za-z0-9]{16,128})\/result$/.exec(u.pathname) : null
      if (result !== null) {
        check(!headers.has("payment-signature")); const value = token(headers.get("x-job-token")), id = result[1]!, prior = jobTokens.get(id)
        if (prior === undefined) { check(jobTokens.size < 20 && ![...jobTokens.values()].includes(value)); jobTokens.set(id, value) }
        else check(prior === value)
      } else {
        check(!headers.has("x-job-token"))
        check(probe || method === "POST" && u.pathname === `/sessions/${sessionId}/close` || method === "GET" && u.pathname === `/sessions/${sessionId}`)
        if (!probe) check(!headers.has("payment-signature"))
      }
    },
    complete(jobIds: readonly string[]) {
      check(sessionToken !== undefined && jobIds.length === 20 && new Set(jobIds).size === 20 && jobTokens.size === 20 && jobIds.every(id => jobTokens.has(id)))
    }
  })
}
export async function runOfflineSessionEvidence(): Promise<OfflineSessionSummary> {
  let journal: EvidenceJournal | undefined, hub: EvidenceChild | undefined, runner: EvidenceChild | undefined
  let journalClosed = false, writersStopped = false, stage = "setup"
  const controller = new AbortController(), deadline = Date.now() + 110000, hard = setTimeout(() => controller.abort(), 110000)
  try {
    const [{ loadChainConfig }, { sessionRequestDigest, sessionJson }, , { sessionData }] = await libraries()
    const [{ openSessionPromise }, { privateKeyToAccount }, { FIXTURE_POLICY }, { sessionRequest }] = await Promise.all([
      import("../packages/buyer/src/session.ts"), import("viem/accounts"), import("./fixtures/gateway-session-runtime.ts"), import("../packages/buyer/src/session-http.ts")])
    check(loadChainConfig().caip2 === loadChainConfig("arc-testnet").caip2)
    journal = await createEvidenceJournal()
    const implementationFiles = [fileURLToPath(import.meta.url), fileURLToPath(new URL("./fixtures/gateway-session-runtime.ts", import.meta.url))]
    const implementationHashes = await Promise.all(implementationFiles.map(async path => hash(await readFile(path))))
    const runId = randomBytes(16).toString("hex"), base = { version: 1 as const, runId, directory: journal.directory, ownerPid: process.pid, deadlineUnixMs: deadline }
    await journal.append("intent", { runId, mode: "offline", calls: 20, amountAtomic: "10000", budgetAtomic: "200000" })
    hub = launchEvidenceChild({ ...base, role: "hub", hubSecret: randomBytes(32).toString("hex") })
    const hubReady = await hub.ready, origin = loopback(hubReady.facts.origin)
    runner = launchEvidenceChild({ ...base, role: "runner", hubOrigin: origin }); const runnerReady = await runner.ready
    const nativeFetch = globalThis.fetch, capturedJournal = journal
    const source = await readFile(fileURLToPath(new URL("./fixtures/gateway-session-probe/run.ts.txt", import.meta.url)))
    const manifest = await readFile(fileURLToPath(new URL("./fixtures/gateway-session-probe/arcade.json", import.meta.url)))
    const executed = await readFile(join(journal.directory, "skills", FIXTURE_POLICY.skillId, "run.ts"))
    check(source.length <= 16384 && manifest.length <= 16384 && executed.length <= 16384)
    const sources = { manifestHash: hash(manifest), sourceHash: hash(source), executedSourceHash: hash(executed),
      policyHash: await evidencePolicyHash(), implementationHash: hash(implementationHashes.join("\n")) }
    check(sources.manifestHash === runnerReady.facts.manifestHash && sources.sourceHash === runnerReady.facts.sourceHash && sources.executedSourceHash === runnerReady.facts.guardedSourceHash)
    await journal.append("sources", sources)
    // Readiness uses the real listing installed by signed Hello, never a delay or Broker stub.
    stage = "readiness"
    let listed = false
    for (let attempt = 0; attempt < 80 && !controller.signal.aborted; attempt++) {
      const response = await sessionRequest(nativeFetch, `${origin}/listings/${FIXTURE_POLICY.skillId}`, { method: "GET", headers: {} },
        { signal: controller.signal, deadlineMs: performance.now() + 3000, maxBytes: 16384 })
      if (response.status === 200) { const r = row(sessionData(response.body, 16384)); check(r.id === FIXTURE_POLICY.skillId && r.serviceName === FIXTURE_POLICY.serviceName && r.version === "1.0.0" && r.seller === FIXTURE_POLICY.seller && r.price === "$0.01"); listed = true; break }
      check(response.status === 404); await bounded(new Promise<void>(resolve => setTimeout(resolve, 25)), 50)
    }
    check(listed && !controller.signal.aborted)
    const capture = { index: 0, signed: new Map<number, { nonce: string; validAfter: string; validBefore: string }>() }, paid = new Set<number>(), requestAudit = makeEvidenceRequestAudit(origin)
    let requests = 0, opens = 0, closes = 0, probes = 0, listings = 0, polls = 0, signerEntries = 0
    const fetcher: typeof fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      check(!controller.signal.aborted && typeof input === "string" && ++requests <= 2000)
      const url = new URL(input as string), headers = new Headers(init?.headers), method = init?.method ?? "GET"
      check(url.origin === origin && url.search === "" && url.hash === "" && init?.redirect === "error" && init.credentials === "omit")
      requestAudit.record(input, method, headers)
      if (method === "POST" && url.pathname === "/sessions") check(++opens === 1)
      else if (method === "POST" && /^\/sessions\/ses_[a-f0-9]{32}\/close$/.test(url.pathname)) check(++closes === 1)
      else if (method === "GET" && url.pathname === `/listings/${FIXTURE_POLICY.skillId}`) check(++listings <= 20)
      else if (method === "GET" && (/^\/jobs\/job_[A-Za-z0-9]{16,128}\/result$/.test(url.pathname) || /^\/sessions\/ses_[a-f0-9]{32}$/.test(url.pathname))) check(++polls <= 1900)
      else if (method === "POST" && url.pathname === `/x/${FIXTURE_POLICY.serviceName}/${FIXTURE_POLICY.skillId}`) {
        check(capture.index >= 1 && capture.index <= 20 && init?.body === JSON.stringify({ index: capture.index }))
        if (headers.has("payment-signature")) {
          check(!paid.has(capture.index) && capture.signed.has(capture.index)); paid.add(capture.index)
          await capturedJournal.append("paid", { index: capture.index, inputDigest: sessionRequestDigest({ index: capture.index }) }); check(!controller.signal.aborted)
        } else check(++probes <= 20)
      } else return bad()
      return nativeFetch(input, init)
    }, { preconnect() { return bad() } })
    // Public deterministic fixture identity; no environment or Keychain lookup.
    const synthetic = privateKeyToAccount(`0x${"01".repeat(32)}`)
    const signing: typeof synthetic.signTypedData = async parameters => {
      check(!controller.signal.aborted && capture.index >= 1 && capture.index <= 20 && !capture.signed.has(capture.index))
      const m = row(parameters.message), nonce = evidenceDigest(m.nonce)
      check(nonce !== `0x${"0".repeat(64)}` && m.from === FIXTURE_POLICY.buyer && m.to === FIXTURE_POLICY.seller && m.value === 10000n && typeof m.validAfter === "bigint" && typeof m.validBefore === "bigint")
      const signed = { nonce, validAfter: String(m.validAfter), validBefore: String(m.validBefore) }; capture.signed.set(capture.index, signed)
      await capturedJournal.append("signer", { index: capture.index, ...signed, typedDataHash: hash(sessionJson(parameters, 16384)) }); check(!controller.signal.aborted)
      signerEntries++; return synthetic.signTypedData(parameters)
    }
    const account = { ...synthetic, signTypedData: signing }
    stage = "open"; await journal.append("open", {}); check(!controller.signal.aborted)
    const session = await openSessionPromise({ hubUrl: origin, account, budgetUsd: "0.20", rail: "gateway", fetch: fetcher }, { signal: controller.signal })
    requestAudit.opened(session.id)
    stage = "calls"
    const completed = await executeTwentySessionCalls(session, journal, capture, controller.signal)
    requestAudit.complete(completed.observations.map(o => o.jobId))
    check(signerEntries === 20 && capture.signed.size === 20 && paid.size === 20 && opens === 1 && closes === 1 && probes === 20 && listings === 20)
    const artifactHash = await writeClosedEvidence(journal.directory, completed.closed)
    await journal.append("closed", { closedHash: artifactHash })
    stage = "cleanup"
    const runnerStopped = await runner.stop(), hubStopped = await hub.stop(); writersStopped = true
    const rs = runnerStopped.facts, hs = hubStopped.facts
    check(rs.spawned === 20 && rs.exited === 20 && rs.results === 20 && hs.rpcCalls === 4 && hs.verifyCalls === 20 && hs.settleCalls === 20 && hs.beginCalls === 20 && hs.finishCalls === 20)
    for (const key of ["manifestHash", "sourceHash", "guardedSourceHash"]) check(rs[key] === runnerReady.facts[key])
    const runnerRows = list(rs.records, 20).map(row), hubRows = list(hs.records, 20).map(row), facilitatorRows = list(hs.facilitator, 20).map(row)
    for (const observation of completed.observations) {
      const r = runnerRows.find(r => r.jobId === observation.jobId), h = hubRows.find(h => h.jobId === observation.jobId), f = facilitatorRows.find(f => f.nonce === observation.nonce)
      check(r?.index === observation.index && r.inputDigest === observation.inputDigest && r.outputDigest === observation.outputDigest && r.exitCode === 0 &&
        h?.nonce === observation.nonce && h.begin === true && h.finish === true && h.settleRef === observation.settleRef && f?.verify === 1 && f.settle === 1 && f.settleRef === observation.settleRef)
    }
    let refused = false
    try { const response = await nativeFetch(origin, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(500) }); await response.body?.cancel() }
    catch { refused = true }
    check(refused); await journal.append("cleanup", { hubStopped: true, runnerStopped: true, listening: false })
    stage = "audit"
    const rows = readSessionEvidence(join(journal.directory, "database.sqlite"))
    check((await Promise.all(implementationFiles.map(async path => hash(await readFile(path))))).join("\n") === implementationHashes.join("\n"))
    const artifact = await readFile(join(journal.directory, "closed.json")); check(artifact.length <= 131072 && hash(artifact) === artifactHash)
    const proof = await assertTwentyCallEvidence({ ...rows, ...completed, closed: JSON.parse(artifact.toString("utf8")), buyer: FIXTURE_POLICY.buyer, seller: FIXTURE_POLICY.seller })
    check(proof.closedHash === artifactHash)
    await journal.append("audit", proof); const journalHash = await journal.close(); journalClosed = true
    await verifyEvidenceJournal(journal.directory, journalHash)
    return Object.freeze({ mode: "offline", status: "PASS", calls: 20, priceAtomic: "10000", budgetAtomic: "200000", spentAtomic: "200000", transferReferences: 20, minedBatchesProved: 0,
      fundsMoved: false, liveEvidence: "NOT_RUN", ...proof, journalHash, manifestHash: hexHash(rs.manifestHash), sourceHash: hexHash(rs.sourceHash), executedSourceHash: hexHash(rs.guardedSourceHash) })
  } catch {
    if (journal !== undefined && !journalClosed && hub !== undefined && runner !== undefined) {
      await Promise.allSettled([hub.snapshot(), runner.snapshot()])
      await journal.append("runtime", { hub: hub.counters(), runner: runner.counters() }).catch(() => {})
    }
    if (journal !== undefined && !journalClosed) await journal.append("uncertain", { stage }).catch(() => {})
    return bad()
  } finally {
    clearTimeout(hard); controller.abort()
    let cleanupFailed = false
    if (!writersStopped) {
      if (runner) try { await runner.stop() } catch { cleanupFailed = true; await runner.reap().catch(() => {}) }
      if (hub) try { await hub.stop() } catch { cleanupFailed = true; await hub.reap().catch(() => {}) }
    }
    if (journal !== undefined && !journalClosed) try { await journal.close() } catch { cleanupFailed = true }
    if (cleanupFailed) bad()
  }
}
export async function sessionEvidenceMain(argv: readonly string[], io: { readonly runOffline: () => Promise<unknown>; readonly write: (line: string) => void } = {
  runOffline: runOfflineSessionEvidence, write: line => process.stdout.write(line + "\n")
}): Promise<number> {
  try {
    const args = parseSessionEvidenceArgs(argv)
    if (args.mode === "help") { io.write("Usage: e2e-gateway-session.sh --offline | --help\nOffline fixture only; live evidence NOT RUN."); return 0 }
    const result = await io.runOffline(); io.write(JSON.stringify(result)); return 0
  } catch { io.write('{"status":"REFUSED","code":"gateway_session_evidence_unavailable","fundsMoved":false,"liveEvidence":"NOT_RUN"}'); return 2 }
}
if (import.meta.main) process.exitCode = await sessionEvidenceMain(process.argv.slice(2))
