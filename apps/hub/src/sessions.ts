import { Cause, Effect, Option, Schema } from "effect"
import { ChainConfig, RailName, Session, SessionAmount, SessionCall, SessionId, SessionReceipt, SessionTime,
  SessionInvalid, SessionNotFound, SessionRailUnavailable, SessionStorageUnavailable, loadChainConfig,
  type Job, type SessionError } from "@arcade/core"
import { normalizeSessionCommand, sessionError, sessionJson, sessionParse, SESSION_EVIDENCE_BYTES,
  type SessionBinding, type SessionSnapshot, type SessionStore, type SessionTerminal } from "./session-ledger.ts"
import type { Rails } from "./rails.ts"

export interface OpenSessionInput {
  readonly buyer: string
  readonly budgetAtomic: bigint
  readonly rail?: RailName
  readonly openedAtMs: number
}
export interface SessionsOptions {
  readonly store: SessionStore
  readonly rails: Rails
  readonly chain: ChainConfig
  readonly newId?: () => string
}
export type SettledSessionTerminal = Extract<SessionTerminal, { kind: "settled" }>
export type ReleasedSessionTerminal = Extract<SessionTerminal, { kind: "released" }>

const invalid = (): never => { throw new SessionInvalid() }
const copy = (input: unknown, limit = SESSION_EVIDENCE_BYTES): unknown => sessionParse(sessionJson(input, limit), limit)
const frozen = <T>(input: T): T => {
  if (input !== null && typeof input === "object") {
    for (const value of Object.values(input)) frozen(value)
    Object.freeze(input)
  }
  return input
}
const inputEffect = <A>(body: () => A): Effect.Effect<A, SessionError> => Effect.try({ try: body, catch: error => sessionError(error) })
/** Keep the original interrupt cause. No failure grants permission to release or retry. */
const storeEffect = <A>(body: () => Effect.Effect<A, SessionError>): Effect.Effect<A, SessionError> =>
  Effect.suspend(body).pipe(Effect.catchAllCause(cause => {
    if (Cause.isInterrupted(cause)) return Effect.failCause(cause)
    const failure = Cause.failureOption(cause), defect = Cause.dieOption(cause)
    return Effect.fail(sessionError(Option.isSome(failure) ? failure.value : Option.isSome(defect) ? defect.value : undefined, true))
  }))
const resultEffect = <A>(body: () => A): Effect.Effect<A, SessionError> =>
  Effect.try({ try: body, catch: () => new SessionStorageUnavailable() })
// Match F5 bindingOf exactly; legacy core IDs/labels intentionally stay broader.
const SessionJobId = Schema.String.pipe(Schema.pattern(/^job_[a-zA-Z0-9]{16,128}$/))
const SessionSkillId = Schema.String.pipe(Schema.pattern(/^[a-z0-9][a-z0-9-]{0,127}$/))
const canonicalId = (input: unknown): string => Schema.decodeUnknownSync(SessionId)(input)
const canonicalJob = (input: unknown): string => Schema.decodeUnknownSync(SessionJobId)(input)
const namedRail = (input: unknown): RailName => Schema.decodeUnknownSync(RailName)(input)
const openSchema = Schema.Struct({ buyer: Schema.String, budgetAtomic: SessionAmount.pipe(Schema.filter(v => v > 0n)),
  rail: Schema.optional(RailName), openedAtMs: SessionTime })
const snapshotSchema = Schema.Struct({ session: Session, heldAtomic: SessionAmount, remainingAtomic: SessionAmount,
  complete: Schema.Boolean, calls: Schema.Array(SessionCall).pipe(Schema.maxItems(100)) })

/** Validate/project a copied authoritative summary, not a second accounting ledger. */
const checkedSnapshot = (input: unknown): SessionSnapshot => {
  const s = Schema.decodeUnknownSync(snapshotSchema)(copy(input))
  for (const call of s.calls) {
    canonicalJob(call.jobId)
    Schema.decodeUnknownSync(SessionSkillId)(call.skillId)
  }
  const network = [loadChainConfig("arc-testnet"), loadChainConfig("arc-mainnet")]
    .find(c => c.status === "ready" && c.caip2 === s.session.network)
  if (network === undefined || s.session.rail === "gateway" && network.gateway === null || s.calls.some(c => c.priceAtomic === 0n)) return invalid()
  const held = s.calls.filter(c => c.state === "reserved" || c.state === "settling" || c.state === "uncertain")
    .reduce((sum, c) => sum + c.priceAtomic, 0n)
  const settled = s.calls.filter(c => c.state === "settled")
  const refs = settled.map(c => c.settleRef)
  const kind = s.session.rail === "test" ? "test" : s.session.rail === "gateway" ? "gateway-transfer" : "onchain"
  if (held !== s.heldAtomic || s.complete !== (held === 0n) ||
    s.session.spentAtomic !== settled.reduce((sum, c) => sum + c.priceAtomic, 0n) ||
    s.remainingAtomic !== s.session.budgetAtomic - s.session.spentAtomic - held ||
    new Set(s.calls.map(c => c.jobId)).size !== s.calls.length || new Set(refs).size !== refs.length ||
    settled.some(c => c.settleRefKind !== kind) || s.calls.some(c => c.createdAtMs < s.session.openedAtMs ||
      s.session.closedAtMs !== undefined && c.createdAtMs > s.session.closedAtMs) ||
    s.session.closedAtMs !== undefined && !s.complete) return invalid()
  return frozen(s)
}

/** Full random UUID entropy; generation happens only when explicitly requested. */
export const newSessionId = (): string => canonicalId(`ses_${crypto.randomUUID().replaceAll("-", "")}`)

/** A complete OPEN snapshot is not closed. Never synthesize a close time or batch. */
export const sessionReceipt = (input: SessionSnapshot): SessionReceipt => {
  try {
    const s = checkedSnapshot(input), c = s.session
    if (!s.complete || c.closedAtMs === undefined) return invalid()
    const settled = s.calls.filter(call => call.state === "settled")
    return frozen(SessionReceipt.make({ sessionId: c.id, buyer: c.buyer, rail: c.rail, network: c.network,
      budgetAtomic: c.budgetAtomic, spentAtomic: c.spentAtomic, heldAtomic: s.heldAtomic, calls: s.calls,
      settledCalls: settled.length, settlementRefs: settled.map(call => call.settleRef!), complete: true,
      openedAtMs: c.openedAtMs, closedAtMs: c.closedAtMs }))
  } catch (error) { throw sessionError(error) }
}

/** Explicit pinned identity/payment coordinates; no ambient selector or provider IO. */
const pinnedChain = (input: ChainConfig): ChainConfig => {
  try {
    const plain: Record<string, unknown> = {}
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!
      if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) return invalid()
      Object.defineProperty(plain, key, { value: descriptor.value, enumerable: true })
    }
    const value = Schema.decodeUnknownSync(ChainConfig, { onExcessProperty: "error" })(copy(plain))
    const pinned = loadChainConfig(value.id)
    if (value.status !== "ready" || pinned.status !== "ready" || value.chainId !== pinned.chainId || value.caip2 !== pinned.caip2 ||
      sessionJson(value.usdc) !== sessionJson(pinned.usdc) ||
      value.gateway?.wallet !== pinned.gateway?.wallet || value.gateway?.domain !== pinned.gateway?.domain ||
      value.gateway?.minValiditySeconds !== pinned.gateway?.minValiditySeconds) return invalid()
    return frozen(pinned)
  } catch (error) { throw sessionError(error) }
}

/** Stateless facade: every accounting decision remains one F5 Store operation. */
export const makeSessions = ({ store, rails, chain, newId = newSessionId }: SessionsOptions) => {
  const selected = pinnedChain(chain)
  const built = (name: unknown): RailName => {
    const canonical = namedRail(name), rail = rails.get(canonical)
    if (rail === undefined || rail.name !== canonical) throw new SessionRailUnavailable({ rail: canonical })
    if (canonical === "gateway" && selected.gateway === null) throw new SessionRailUnavailable({ rail: canonical })
    return canonical
  }
  const admission = (name: RailName) => {
    if (name !== "test" && store.sessionStorage !== "durable") throw new SessionStorageUnavailable()
  }
  const authoritative = (value: unknown, id: string): SessionSnapshot => {
    const s = checkedSnapshot(value)
    if (s.session.id !== id || s.session.network !== selected.caip2) return invalid()
    return s
  }
  const snapshot = (id: string): Effect.Effect<SessionSnapshot, SessionError> => Effect.gen(function* () {
    const valid = yield* inputEffect(() => canonicalId(id))
    const value = yield* storeEffect(() => store.getSessionSnapshot(valid))
    if (value === undefined) return yield* new SessionNotFound({ sessionId: valid })
    return yield* resultEffect(() => authoritative(value, valid))
  })
  const finish = (input: SessionTerminal, kind: "settled" | "released"): Effect.Effect<void, SessionError> => Effect.gen(function* () {
    const c = yield* inputEffect(() => normalizeSessionCommand({ kind: "finish", terminal: input }))
    if (c.kind !== "finish" || c.terminal.kind !== kind) return yield* new SessionInvalid()
    // No volatile guard here: evidence/uncertainty must remain recordable after a send.
    yield* storeEffect(() => store.finishSessionJob(c.terminal))
  })
  return Object.freeze({
    openSession: (input: OpenSessionInput): Effect.Effect<Session, SessionError> => Effect.gen(function* () {
      const parsed = yield* inputEffect(() => {
        const p = Schema.decodeUnknownSync(openSchema, { onExcessProperty: "error" })(copy(input, 16_384))
        if (!/^0x[0-9a-fA-F]{40}$/.test(p.buyer) || /^0x0{40}$/i.test(p.buyer)) return invalid()
        const rail = built(p.rail ?? rails.default.name); admission(rail)
        return { buyer: p.buyer.toLowerCase(), budgetAtomic: p.budgetAtomic, openedAtMs: p.openedAtMs, rail }
      })
      const id = yield* inputEffect(() => canonicalId(newId()))
      const initial = { ...parsed, id, network: selected.caip2 }
      const value = yield* storeEffect(() => store.openSession(initial))
      return yield* resultEffect(() => {
        const s = Schema.decodeUnknownSync(Session)(copy(value))
        if (s.id !== id || s.buyer !== initial.buyer || s.budgetAtomic !== initial.budgetAtomic || s.rail !== initial.rail ||
          s.network !== initial.network || s.openedAtMs !== initial.openedAtMs || s.spentAtomic !== 0n || s.closedAtMs !== undefined) return invalid()
        return frozen(s)
      })
    }),
    snapshot,
    inFlightAtomic: (id: string): Effect.Effect<bigint, SessionError> => Effect.map(snapshot(id), s => s.heldAtomic),
    reserve: (binding: SessionBinding, job: Job): Effect.Effect<{ created: boolean; jobId: string }, SessionError> => Effect.gen(function* () {
      const c = yield* inputEffect(() => normalizeSessionCommand({ kind: "reserve", binding, job }))
      if (c.kind !== "reserve") return yield* new SessionInvalid()
      yield* inputEffect(() => { const rail = built(c.binding.rail); admission(rail); if (c.binding.network !== selected.caip2) invalid() })
      const result = yield* storeEffect(() => store.reserveSessionJob(c.binding, c.job))
      return yield* resultEffect(() => frozen(Schema.decodeUnknownSync(Schema.Struct({ created: Schema.Boolean, jobId: SessionJobId }))(copy(result))))
    }),
    beginSettlement: (id: string, jobId: string): Effect.Effect<{ claimed: boolean }, SessionError> => Effect.gen(function* () {
      const validJob = yield* inputEffect(() => canonicalJob(jobId))
      const s = yield* snapshot(id)
      yield* inputEffect(() => admission(built(s.session.rail)))
      const result = yield* storeEffect(() => store.beginSessionSettlement(s.session.id, validJob))
      return yield* resultEffect(() => frozen(Schema.decodeUnknownSync(Schema.Struct({ claimed: Schema.Boolean }))(copy(result))))
    }),
    commit: (input: SettledSessionTerminal) => finish(input, "settled"),
    release: (input: ReleasedSessionTerminal) => finish(input, "released"),
    markUncertain: (id: string, jobId: string): Effect.Effect<void, SessionError> => Effect.gen(function* () {
      const ids = yield* inputEffect(() => ({ id: canonicalId(id), jobId: canonicalJob(jobId) }))
      yield* storeEffect(() => store.markSessionUncertain(ids.id, ids.jobId))
    }),
    closeSession: (id: string, atMs: number): Effect.Effect<SessionReceipt, SessionError> => Effect.gen(function* () {
      const command = yield* inputEffect(() => ({ id: canonicalId(id), atMs: Schema.decodeUnknownSync(SessionTime)(atMs) }))
      const value = yield* storeEffect(() => store.closeSession(command.id, command.atMs))
      return yield* resultEffect(() => {
        const s = authoritative(value, command.id)
        if (s.session.closedAtMs !== command.atMs) return invalid()
        return sessionReceipt(s)
      })
    }),
    sessionReceipt
  })
}
