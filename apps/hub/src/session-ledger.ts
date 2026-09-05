import { createHash } from "node:crypto"
import { Schema, type Effect } from "effect"
import { Job, JobOutcome, Receipt, ReceiptChild, Session, SessionCall, SessionId, SessionNotFound, SessionClosed,
  SessionBudgetExceeded, SessionRailUnavailable, SessionInvalid, SessionConflict, SessionStorageUnavailable,
  SessionCapacity, SessionPending, loadChainConfig, shouldSettle, type RailName, type SessionError } from "@arcade/core"
import type { SettledPayment } from "@arcade/payments"

export const SESSION_METADATA_BYTES = 16_384, SESSION_EVIDENCE_BYTES = 1_048_576
const MAX = (1n << 256n) - 1n
const invalid = (): never => { throw new SessionInvalid() }
const conflict = (): never => { throw new SessionConflict() }
/** Canonical bounded own-data serialization. Reserved bigint tags are never raw input. */
export const sessionJson = (input: unknown, limit = SESSION_METADATA_BYTES): string => {
  let nodes = 0, bytes = 0
  const active = new Set<object>()
  const add = (value: string) => { bytes += Buffer.byteLength(value); if (bytes > limit) invalid(); return value }
  const visit = (value: unknown, depth: number): string => {
    if (++nodes > 65_536 || depth > 64) return invalid()
    if (value === null) return add("null")
    if (typeof value === "string") { if (value.length > limit) return invalid(); return add(JSON.stringify(value)) }
    if (typeof value === "boolean") return add(String(value))
    if (typeof value === "number") { if (!Number.isFinite(value) || Object.is(value, -0)) return invalid(); return add(String(value)) }
    if (typeof value === "bigint") { if (value < -MAX || value > MAX) return invalid(); return add(`{"__bigint":"${value}"}`) }
    if (typeof value !== "object" || active.has(value)) return invalid()
    const proto = Object.getPrototypeOf(value)
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null &&
      ![Job, JobOutcome, Receipt, ReceiptChild, Session, SessionCall].some(c => value instanceof c)) return invalid()
    active.add(value)
    try {
      const keys = Reflect.ownKeys(value)
      if (keys.length > 65_536) return invalid()
      if (Array.isArray(value)) {
        if (keys.length !== value.length + 1) return invalid()
        add("[]"); const parts: string[] = []
        for (let index = 0; index < value.length; index++) {
          const d = Object.getOwnPropertyDescriptor(value, String(index))
          if (d === undefined || !("value" in d) || !d.enumerable) return invalid()
          if (index) add(","); parts.push(visit(d.value, depth + 1))
        }
        return `[${parts.join(",")}]`
      }
      add("{}"); const parts: string[] = []
      for (const key of keys.sort((a, b) => typeof a !== "string" || typeof b !== "string" ? invalid() : a < b ? -1 : a > b ? 1 : 0)) {
        if (typeof key !== "string" || key === "__bigint" || key === "__proto__") return invalid()
        const d = Object.getOwnPropertyDescriptor(value, key)!
        if (!("value" in d) || !d.enumerable) return invalid()
        if (parts.length) add(",")
        const encoded = add(JSON.stringify(key) + ":")
        parts.push(encoded + visit(d.value, depth + 1))
      }
      return `{${parts.join(",")}}`
    } finally { active.delete(value) }
  }
  return visit(input, 0)
}
export const sessionParse = (bytes: string, limit = SESSION_METADATA_BYTES): unknown => {
  if (typeof bytes !== "string" || Buffer.byteLength(bytes) > limit) return invalid()
  const value: unknown = JSON.parse(bytes, (_key, val: unknown) => {
    if (val !== null && typeof val === "object" && Object.hasOwn(val, "__bigint")) {
      const r = val as Record<string, unknown>
      if (Object.keys(r).length !== 1 || typeof r.__bigint !== "string" || !/^-?(0|[1-9][0-9]{0,77})$/.test(r.__bigint)) return invalid()
      return BigInt(r.__bigint)
    }
    return val
  })
  // Recheck depth/nodes/canonical data after decoding; malformed disk is never repaired.
  if (sessionJson(value, limit) !== bytes) return invalid()
  return value
}
const digest = (bytes: string) => `0x${createHash("sha256").update(bytes).digest("hex")}`
export const sessionRequestDigest = (input: unknown): string => digest(sessionJson(input, SESSION_EVIDENCE_BYTES))
const copy = <T>(value: T, limit = SESSION_METADATA_BYTES): T => sessionParse(sessionJson(value, limit), limit) as T
const equal = (a: unknown, b: unknown, limit = SESSION_METADATA_BYTES) => sessionJson(a, limit) === sessionJson(b, limit)
const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value)
const hex = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{64}$/.test(value) && !/^0x0{64}$/.test(value)
const time = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const amount = (value: unknown, positive = false): value is bigint => typeof value === "bigint" && value >= (positive ? 1n : 0n) && value <= MAX
const ownShape = (input: unknown, keys: readonly string[], limit = SESSION_METADATA_BYTES): Record<string, unknown> => {
  const value = copy(input, limit)
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) return invalid()
  return value as Record<string, unknown>
}
const chainFor = (network: string, rail: RailName) => {
  const chain = [loadChainConfig("arc-testnet"), loadChainConfig("arc-mainnet")].find(c => c.caip2 === network)
  if (chain === undefined || chain.status !== "ready" || rail === "gateway" && chain.gateway === null) throw new SessionRailUnavailable({ rail })
  return chain
}
export interface NewSession { readonly id: string; readonly buyer: string; readonly budgetAtomic: bigint; readonly rail: RailName; readonly network: string; readonly openedAtMs: number }
export interface SessionBinding {
  readonly sessionId: string; readonly jobId: string; readonly buyer: string; readonly seller: string
  readonly skillId: string; readonly skillVersion: string; readonly rail: RailName; readonly network: string
  readonly asset: string; readonly verifyingContract: string; readonly domainName: string; readonly domainVersion: string
  readonly payTo: string; readonly amountAtomic: bigint; readonly nonce: string; readonly validAfter: bigint
  readonly validBefore: bigint; readonly requestDigest: string
}
export interface SessionSnapshot { readonly session: Session; readonly heldAtomic: bigint; readonly remainingAtomic: bigint; readonly calls: ReadonlyArray<SessionCall>; readonly complete: boolean }
export type SessionTerminal = { readonly sessionId: string; readonly jobId: string; readonly job: Job; readonly receipt: Receipt } &
  ({ readonly kind: "released" } | { readonly kind: "settled"; readonly settlement: SettledPayment })
export interface SessionLedgerCall {
  readonly binding: SessionBinding; readonly state: SessionCall["state"]; readonly createdAtMs: number
  readonly queuedDigest: string; readonly terminalJobDigest?: string; readonly receiptDigest?: string
  readonly settleRef?: string; readonly settleRefKind?: "onchain" | "gateway-transfer" | "test"
}
export interface SessionLedgerState {
  readonly sessions: Map<string, Session>; readonly sessionCalls: Map<string, SessionLedgerCall>
  readonly jobs: Map<string, Job>; readonly receipts: Array<Receipt>
}
export interface SessionStore {
  readonly sessionStorage: "durable" | "volatile"
  readonly openSession: (input: NewSession) => Effect.Effect<Session, SessionError>
  readonly getSession: (id: string) => Effect.Effect<Session | undefined, SessionError>
  readonly allSessions: Effect.Effect<ReadonlyArray<Session>, SessionError>
  readonly getSessionSnapshot: (id: string) => Effect.Effect<SessionSnapshot | undefined, SessionError>
  readonly reserveSessionJob: (binding: SessionBinding, queued: Job) => Effect.Effect<{ created: boolean; jobId: string }, SessionError>
  readonly beginSessionSettlement: (sessionId: string, jobId: string) => Effect.Effect<{ claimed: boolean }, SessionError>
  readonly finishSessionJob: (terminal: SessionTerminal) => Effect.Effect<void, SessionError>
  readonly markSessionUncertain: (sessionId: string, jobId: string) => Effect.Effect<void, SessionError>
  readonly closeSession: (id: string, atMs: number) => Effect.Effect<SessionSnapshot, SessionError>
}
const bindingKeys = ["sessionId", "jobId", "buyer", "seller", "skillId", "skillVersion", "rail", "network", "asset", "verifyingContract", "domainName", "domainVersion", "payTo", "amountAtomic", "nonce", "validAfter", "validBefore", "requestDigest"]
export const sessionAuthorizationKey = (b: SessionBinding): string => JSON.stringify([b.network, b.domainName, b.domainVersion, b.verifyingContract, b.buyer, b.nonce])
const bindingOf = (input: SessionBinding): SessionBinding => {
  const value = ownShape(input, bindingKeys)
  if (Object.keys(value).length !== bindingKeys.length) return invalid()
  const b = value as unknown as SessionBinding
  Schema.decodeUnknownSync(SessionId)(b.sessionId)
  if (!/^job_[a-zA-Z0-9]{16,128}$/.test(b.jobId) || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(b.skillId) ||
    typeof b.skillVersion !== "string" || !/^[A-Za-z0-9.+-]{1,128}$/.test(b.skillVersion) ||
    !["gateway", "eip3009", "test"].includes(b.rail) || !amount(b.amountAtomic, true) || !amount(b.validAfter) || !amount(b.validBefore) ||
    b.validAfter >= b.validBefore || !hex(b.nonce) || !hex(b.requestDigest)) return invalid()
  for (const key of ["buyer", "seller", "asset", "verifyingContract", "payTo"] as const) {
    if (!address(b[key])) return invalid(); (value[key] as string) = b[key].toLowerCase()
  }
  const c = chainFor(b.network, b.rail)
  if (b.asset !== c.usdc.address.toLowerCase()) return invalid()
  if (b.rail === "gateway") {
    if (b.domainName !== "GatewayWalletBatched" || b.domainVersion !== "1" || b.verifyingContract !== c.gateway!.wallet.toLowerCase() ||
      b.payTo !== b.seller || b.validBefore - b.validAfter > 605500n) return invalid()
  } else if (b.domainName !== c.usdc.eip712Name || b.domainVersion !== c.usdc.eip712Version || b.verifyingContract !== c.usdc.address.toLowerCase()) return invalid()
  return b
}
const checkedSession = (value: unknown): Session => {
  const fields = ownShape(value, ["id", "buyer", "budgetAtomic", "spentAtomic", "rail", "network", "openedAtMs", "closedAtMs"])
  const s = Schema.decodeUnknownSync(Session)(fields)
  chainFor(s.network, s.rail)
  if (s.spentAtomic > s.budgetAtomic || s.closedAtMs !== undefined && s.closedAtMs < s.openedAtMs) return invalid()
  return s
}
export const sessionJobCopy = (input: Job): Job => Schema.decodeUnknownSync(Job, { onExcessProperty: "error" })(copy(input, SESSION_EVIDENCE_BYTES))
export const sessionReceiptCopy = (input: Receipt): Receipt => Schema.decodeUnknownSync(Receipt, { onExcessProperty: "error" })(copy(input, SESSION_EVIDENCE_BYTES))
const jobOf = sessionJobCopy, receiptOf = sessionReceiptCopy
const evidenceDigest = (value: unknown) => digest(sessionJson(value, SESSION_EVIDENCE_BYTES))
const jobMatches = (job: Job, b: SessionBinding) => {
  if (job.id !== b.jobId || job.skillId !== b.skillId || job.buyer !== b.buyer || job.seller !== b.seller || job.priceAtomic !== b.amountAtomic ||
    job.rootJobId !== job.id || job.hop !== 0 || job.parentJobId !== undefined || job.ancestors?.length !== 0 ||
    !time(job.createdAtMs) || sessionRequestDigest(job.input) !== b.requestDigest) return invalid()
}
const refValid = (rail: RailName, reference: unknown, kind: unknown): boolean => typeof reference === "string" && (rail === "gateway"
  ? kind === "gateway-transfer" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reference)
  : rail === "test" ? kind === "test" && /^0xtest[0-9a-f]{14,122}$/.test(reference)
  : kind === "onchain" && hex(reference))
/** Validate all session-correlated evidence, without interpreting unrelated legacy jobs. */
export const validateSessionLedger = (st: SessionLedgerState): void => {
  if (st.sessions.size > 10_000 || st.sessionCalls.size > 1_000_000) return invalid()
  const totals = new Map<string, { spent: bigint; held: bigint; count: number }>(), auth = new Set<string>(), refs = new Set<string>()
  const receiptsByJob = new Map<string, Receipt[]>()
  for (const receipt of st.receipts) { const rows = receiptsByJob.get(receipt.jobId) ?? []; rows.push(receipt); receiptsByJob.set(receipt.jobId, rows) }
  for (const [id, s] of st.sessions) { if (checkedSession(s).id !== id) return invalid(); totals.set(id, { spent: 0n, held: 0n, count: 0 }) }
  for (const [id, raw] of st.sessionCalls) {
    const c = ownShape(raw, ["binding", "state", "createdAtMs", "queuedDigest", "terminalJobDigest", "receiptDigest", "settleRef", "settleRefKind"]) as unknown as SessionLedgerCall
    const b = bindingOf(c.binding), s = st.sessions.get(b.sessionId), t = totals.get(b.sessionId), key = sessionAuthorizationKey(b)
    if (s === undefined || t === undefined || id !== b.jobId || !equal(b, c.binding) || b.buyer !== s.buyer || b.network !== s.network || b.rail !== s.rail ||
      !time(c.createdAtMs) || c.createdAtMs < s.openedAtMs || !hex(c.queuedDigest) || auth.has(key) || ++t.count > 100) return invalid()
    auth.add(key)
    const j = st.jobs.get(id); if (j === undefined) return invalid(); jobMatches(jobOf(j), b)
    const receipts = receiptsByJob.get(id) ?? []
    if (["reserved", "settling", "uncertain"].includes(c.state)) {
      if (j.status !== "queued" || j.outcome !== undefined || evidenceDigest(j) !== c.queuedDigest || receipts.length ||
        c.receiptDigest !== undefined || c.terminalJobDigest !== undefined || c.settleRef !== undefined || c.settleRefKind !== undefined) return invalid()
      t.held += b.amountAtomic
    } else if (c.state === "settled" || c.state === "released") {
      if (receipts.length !== 1 || !hex(c.terminalJobDigest) || !hex(c.receiptDigest) || evidenceDigest(j) !== c.terminalJobDigest ||
        evidenceDigest(receipts[0]) !== c.receiptDigest) return invalid()
      terminalMatches(j, receiptOf(receipts[0]!), b, c.state === "settled")
      if (c.state === "settled") {
        if (!refValid(b.rail, c.settleRef, c.settleRefKind) || receipts[0]!.settleTx !== c.settleRef || receipts[0]!.settleRefKind !== c.settleRefKind) return invalid()
        const refKey = b.network + ":" + b.rail + ":" + c.settleRef
        if (refs.has(refKey)) return invalid(); refs.add(refKey); t.spent += b.amountAtomic
      } else if (c.settleRef !== undefined || c.settleRefKind !== undefined) return invalid()
    } else return invalid()
  }
  for (const [id, s] of st.sessions) {
    const t = totals.get(id)!
    if (t.spent !== s.spentAtomic || t.spent + t.held > s.budgetAtomic || s.closedAtMs !== undefined && t.held !== 0n) return invalid()
  }
}
function terminalMatches(job: Job, receipt: Receipt, b: SessionBinding, accepted: boolean): void {
  jobMatches(job, b)
  if (job.status === "queued" || job.status === "running" || job.outcome === undefined || job.outcome.status !== job.status ||
    !time(job.outcome.startedAtMs) || !time(job.outcome.finishedAtMs) || job.outcome.startedAtMs < job.createdAtMs || job.outcome.finishedAtMs < job.outcome.startedAtMs ||
    accepted && !shouldSettle(job.outcome, true).settle || receipt.createdAtMs < job.outcome.finishedAtMs) return invalid()
  receiptMatches(receipt, b, accepted)
}
function receiptMatches(receipt: Receipt, b: SessionBinding, accepted: boolean): void {
  if (receipt.jobId !== b.jobId || receipt.sessionId !== b.sessionId || receipt.skillId !== b.skillId || receipt.skillVersion !== b.skillVersion ||
    receipt.buyer !== b.buyer || receipt.seller !== b.seller || receipt.rail !== b.rail || receipt.network !== b.network || receipt.priceAtomic !== b.amountAtomic ||
    receipt.settled !== accepted || receipt.reason !== (accepted ? "ok" : "session_released") || !amount(receipt.sellerAtomic) || !amount(receipt.feeAtomic) ||
    receipt.sellerAtomic + receipt.feeAtomic !== b.amountAtomic || !Number.isSafeInteger(receipt.feeBps) || receipt.feeBps < 0 || receipt.feeBps > 10000 ||
    receipt.feeAtomic !== b.amountAtomic * BigInt(receipt.feeBps) / 10000n || !time(receipt.createdAtMs) ||
    !time(receipt.latencyMs) || receipt.rootJobId !== b.jobId || receipt.hop !== 0 || receipt.parentJobId !== undefined || receipt.ancestors?.length !== 0 ||
    receipt.children !== undefined || receipt.treeHash !== undefined || receipt.treeCeilingAtomic !== undefined || receipt.treeCommittedAtomic !== undefined ||
    receipt.receiptSignature !== undefined || receipt.authorizationNonce !== undefined && receipt.authorizationNonce !== b.nonce ||
    !accepted && (receipt.settleTx !== undefined || receipt.settleRefKind !== undefined) ||
    accepted && !refValid(b.rail, receipt.settleTx, receipt.settleRefKind)) return invalid()
}
/** Existing global receipt/stat APIs validate each row's local correlation, not every job in its session. */
export const sessionReceiptEvidence = (raw: SessionLedgerCall, input: Receipt, session: Session): Receipt => {
  const call = ownShape(raw, ["binding", "state", "createdAtMs", "queuedDigest", "terminalJobDigest", "receiptDigest", "settleRef", "settleRefKind"]) as unknown as SessionLedgerCall
  const b = bindingOf(call.binding), receipt = receiptOf(input), accepted = call.state === "settled"
  if (!equal(b, call.binding) || b.sessionId !== session.id || b.buyer !== session.buyer || b.rail !== session.rail || b.network !== session.network ||
    !time(call.createdAtMs) || call.createdAtMs < session.openedAtMs || receipt.createdAtMs < call.createdAtMs ||
    !hex(call.queuedDigest) || !hex(call.terminalJobDigest) || evidenceDigest(receipt) !== call.receiptDigest ||
    (!accepted && call.state !== "released") || (accepted ? call.settleRef !== receipt.settleTx || call.settleRefKind !== receipt.settleRefKind
      : call.settleRef !== undefined || call.settleRefKind !== undefined)) return invalid()
  receiptMatches(receipt, b, accepted)
  return receipt
}
export const sessionSnapshot = (st: SessionLedgerState, id: string): SessionSnapshot | undefined => {
  Schema.decodeUnknownSync(SessionId)(id); validateSessionLedger(st)
  const s = st.sessions.get(id); if (s === undefined) return undefined
  const calls = [...st.sessionCalls.values()].filter(c => c.binding.sessionId === id).sort((a, b) => a.createdAtMs - b.createdAtMs || a.binding.jobId.localeCompare(b.binding.jobId))
  const heldAtomic = calls.filter(c => ["reserved", "settling", "uncertain"].includes(c.state)).reduce((sum, c) => sum + c.binding.amountAtomic, 0n)
  return { session: checkedSession(s), heldAtomic, remainingAtomic: s.budgetAtomic - s.spentAtomic - heldAtomic,
    complete: heldAtomic === 0n, calls: calls.map(c => SessionCall.make({ jobId: c.binding.jobId, skillId: c.binding.skillId, priceAtomic: c.binding.amountAtomic,
      state: c.state, settled: c.state === "settled", createdAtMs: c.createdAtMs,
      ...(c.settleRef === undefined ? {} : { settleRef: c.settleRef, settleRefKind: c.settleRefKind! }) })) }
}
export type SessionCommand = { readonly kind: "open"; readonly input: NewSession } | { readonly kind: "reserve"; readonly binding: SessionBinding; readonly job: Job } |
  { readonly kind: "begin"; readonly sessionId: string; readonly jobId: string } |
  { readonly kind: "uncertain"; readonly sessionId: string; readonly jobId: string } |
  { readonly kind: "finish"; readonly terminal: SessionTerminal } | { readonly kind: "close"; readonly sessionId: string; readonly atMs: number }
export interface SessionTransition { readonly state: SessionLedgerState; readonly result: Session | SessionSnapshot | { created: boolean; jobId: string } | { claimed: boolean } | undefined }
/** One pure transition; adapters commit this result atomically before publishing it. */
/** Never inspect even a routing field before refusing getters/non-data input. */
export const normalizeSessionCommand = (input: SessionCommand): SessionCommand => {
  const command = copy(input, 2 * SESSION_EVIDENCE_BYTES + SESSION_METADATA_BYTES)
  const keys = command.kind === "open" ? ["kind", "input"] : command.kind === "reserve" ? ["kind", "binding", "job"] :
    command.kind === "finish" ? ["kind", "terminal"] : command.kind === "close" ? ["kind", "sessionId", "atMs"] :
    command.kind === "begin" || command.kind === "uncertain" ? ["kind", "sessionId", "jobId"] : invalid()
  if (Object.keys(command).some(k => !keys.includes(k))) return invalid()
  if (command.kind === "finish") {
    const allowed = command.terminal.kind === "settled" ? ["kind", "sessionId", "jobId", "job", "receipt", "settlement"] : ["kind", "sessionId", "jobId", "job", "receipt"]
    if (Object.keys(command.terminal).some(k => !allowed.includes(k))) return invalid()
  }
  return command
}
const transition = (before: SessionLedgerState, command: SessionCommand): SessionTransition => {
  validateSessionLedger(before)
  const st: SessionLedgerState = { sessions: new Map(before.sessions), sessionCalls: new Map(before.sessionCalls), jobs: new Map(before.jobs), receipts: [...before.receipts] }
  let result: SessionTransition["result"]
  if (command.kind === "open") {
    const fields = ownShape(command.input, ["id", "buyer", "budgetAtomic", "rail", "network", "openedAtMs"])
    if (!address(fields.buyer)) return invalid(); fields.buyer = fields.buyer.toLowerCase()
    const s = checkedSession({ ...fields, spentAtomic: 0n }), existing = st.sessions.get(s.id)
    if (existing !== undefined) { if (!equal(existing, s)) return conflict(); return { state: before, result: checkedSession(existing) } }
    if (st.sessions.size >= 10_000) throw new SessionCapacity()
    st.sessions.set(s.id, s); result = checkedSession(s)
  } else {
    const id = command.kind === "reserve" ? command.binding.sessionId : command.kind === "finish" ? command.terminal.sessionId : command.sessionId
    Schema.decodeUnknownSync(SessionId)(id)
    const s = st.sessions.get(id); if (s === undefined) throw new SessionNotFound({ sessionId: id })
    if (command.kind === "reserve") {
      const b = bindingOf(command.binding), j = jobOf(command.job); jobMatches(j, b)
      if (j.status !== "queued" || j.outcome !== undefined || j.createdAtMs < s.openedAtMs || b.buyer !== s.buyer || b.network !== s.network || b.rail !== s.rail) return invalid()
      const key = sessionAuthorizationKey(b), existingJob = st.sessionCalls.get(b.jobId)
      if (existingJob !== undefined && sessionAuthorizationKey(existingJob.binding) !== key) return conflict()
      if (existingJob === undefined && (st.jobs.has(b.jobId) || st.receipts.some(r => r.jobId === b.jobId))) return conflict()
      const existing = [...st.sessionCalls.values()].find(c => sessionAuthorizationKey(c.binding) === key)
      if (existing !== undefined) {
        const { jobId: _a, ...old } = existing.binding, { jobId: _b, ...fresh } = b
        if (!equal(old, fresh)) return conflict()
        return { state: before, result: { created: false, jobId: existing.binding.jobId } }
      }
      if (st.jobs.has(b.jobId) || st.receipts.some(r => r.jobId === b.jobId)) return conflict()
      if (s.closedAtMs !== undefined) throw new SessionClosed({ sessionId: id, closedAtMs: s.closedAtMs })
      const snapshot = sessionSnapshot(before, id)!
      if (snapshot.calls.length >= 100) throw new SessionCapacity()
      if (b.amountAtomic > snapshot.remainingAtomic) throw new SessionBudgetExceeded({ sessionId: id, budgetAtomic: s.budgetAtomic, spentAtomic: s.spentAtomic, requestedAtomic: b.amountAtomic })
      st.sessionCalls.set(b.jobId, { binding: b, state: "reserved", createdAtMs: j.createdAtMs, queuedDigest: evidenceDigest(j) })
      st.jobs.set(j.id, j); result = { created: true, jobId: j.id }
    } else if (command.kind === "close") {
      if (!time(command.atMs) || command.atMs < s.openedAtMs) return invalid()
      if (s.closedAtMs !== undefined) throw new SessionClosed({ sessionId: id, closedAtMs: s.closedAtMs })
      const snapshot = sessionSnapshot(before, id)!
      if (snapshot.heldAtomic !== 0n) throw new SessionPending()
      if (snapshot.calls.some(c => c.createdAtMs > command.atMs) || st.receipts.some(r => r.sessionId === id && r.createdAtMs > command.atMs)) return invalid()
      st.sessions.set(id, Session.make({ ...s, closedAtMs: command.atMs })); result = sessionSnapshot(st, id)!
    } else {
      const jobId = command.kind === "finish" ? command.terminal.jobId : command.jobId
      const c = st.sessionCalls.get(jobId)
      if (c === undefined || c.binding.sessionId !== id) return conflict()
      if (command.kind === "begin") {
        if (c.state === "released") return conflict()
        result = { claimed: c.state === "reserved" }
        if (c.state === "reserved") st.sessionCalls.set(jobId, { ...c, state: "settling" })
      } else if (command.kind === "uncertain") {
        if (c.state !== "settling" && c.state !== "uncertain") return conflict()
        st.sessionCalls.set(jobId, { ...c, state: "uncertain" })
      } else {
        const t = command.terminal, accepted = t.kind === "settled", j = jobOf(t.job), r = receiptOf(t.receipt)
        if (t.kind !== "settled" && t.kind !== "released") return invalid()
        terminalMatches(j, r, c.binding, accepted)
        let reference: { settleRef: string; settleRefKind: "onchain" | "gateway-transfer" | "test" } | undefined
        if (accepted) {
          const p = ownShape(t.settlement, ["payer", "amountAtomic", "txHash", "settlementKind"])
          // Actual TestRail omits this optional field and returns a simulated
          // 0xtest reference. Only EIP hashes normalize to onchain (not mined proof).
          // Gateway must still name its transfer kind explicitly.
          const kind = p.settlementKind === undefined ? c.binding.rail === "test" ? "test" : c.binding.rail === "eip3009" ? "onchain" : undefined : p.settlementKind
          if (p.payer !== c.binding.buyer || p.amountAtomic !== c.binding.amountAtomic || p.txHash !== r.settleTx || kind !== r.settleRefKind ||
            !refValid(c.binding.rail, p.txHash, kind)) return invalid()
          reference = { settleRef: r.settleTx!, settleRefKind: r.settleRefKind as "onchain" | "gateway-transfer" | "test" }
        }
        const next: SessionLedgerCall = { ...c, state: accepted ? "settled" : "released", terminalJobDigest: evidenceDigest(j), receiptDigest: evidenceDigest(r), ...reference }
        if (c.state === "settled" || c.state === "released") { if (!equal(c, next)) return conflict(); return { state: before, result: undefined } }
        if (accepted ? c.state !== "settling" && c.state !== "uncertain" : c.state !== "reserved") return conflict()
        if (j.createdAtMs !== c.createdAtMs || s.closedAtMs !== undefined) return conflict()
        st.sessionCalls.set(jobId, next); st.jobs.set(jobId, j); st.receipts.push(r)
        if (accepted) st.sessions.set(id, Session.make({ ...s, spentAtomic: s.spentAtomic + c.binding.amountAtomic }))
      }
    }
  }
  validateSessionLedger(st)
  return { state: st, result }
}
export const transitionSession = (before: SessionLedgerState, input: SessionCommand): SessionTransition => {
  try { return transition(before, normalizeSessionCommand(input)) } catch (error) { throw sessionError(error) }
}
export const sessionError = (error: unknown, storage = false): SessionError => {
  if ([SessionNotFound, SessionClosed, SessionBudgetExceeded, SessionRailUnavailable, SessionInvalid, SessionConflict, SessionStorageUnavailable, SessionCapacity, SessionPending].some(c => error instanceof c)) return error as SessionError
  return storage ? new SessionStorageUnavailable() : new SessionInvalid()
}
