import { Schema } from "effect"
import { JobId } from "./job.ts"
import { RailName } from "./receipt.ts"

/** A local budget ceiling, not escrow, available wallet balance or a batching proof. */
export const SESSION_HEADER = "x-arcade-session"
export const SessionId = Schema.String.pipe(Schema.pattern(/^ses_[0-9a-f]{32}$/))
export const SessionAddress = Schema.String.pipe(Schema.pattern(/^0x[0-9a-f]{40}$/), Schema.filter(v => !/^0x0{40}$/.test(v)))
export const SessionAmount = Schema.BigIntFromSelf.pipe(Schema.filter(v => v >= 0n && v < 1n << 256n))
export const SessionTime = Schema.Number.pipe(Schema.filter(v => Number.isSafeInteger(v) && v >= 0))
export const SessionState = Schema.Literal("reserved", "settling", "uncertain", "settled", "released")
export const SessionRefKind = Schema.Literal("onchain", "gateway-transfer", "gateway-batch", "test")
export class Session extends Schema.Class<Session>("Session")(Schema.Struct({
  id: SessionId, buyer: SessionAddress, budgetAtomic: SessionAmount.pipe(Schema.filter(v => v > 0n)),
  spentAtomic: SessionAmount, rail: RailName, network: Schema.String.pipe(Schema.pattern(/^eip155:[1-9][0-9]{0,15}$/)),
  openedAtMs: SessionTime, closedAtMs: Schema.optional(SessionTime)
}).pipe(Schema.filter(v => v.spentAtomic <= v.budgetAtomic && (v.closedAtMs === undefined || v.closedAtMs >= v.openedAtMs)))) {}
/** Public accounting summary: no nonce, signature, request or private diagnostics. */
export class SessionCall extends Schema.Class<SessionCall>("SessionCall")(Schema.Struct({
  jobId: JobId, skillId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  priceAtomic: SessionAmount, state: SessionState, settled: Schema.Boolean,
  settleRef: Schema.optional(Schema.String.pipe(Schema.maxLength(128))), settleRefKind: Schema.optional(SessionRefKind),
  createdAtMs: SessionTime
}).pipe(Schema.filter(v => v.state === "settled"
  ? v.settled && v.settleRefKind !== undefined && typeof v.settleRef === "string" && (v.settleRefKind === "gateway-transfer"
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.settleRef)
    : v.settleRefKind === "test" ? /^0xtest[0-9a-f]{14,122}$/.test(v.settleRef)
    : /^0x[0-9a-f]{64}$/.test(v.settleRef) && !/^0x0{64}$/.test(v.settleRef))
  : !v.settled && v.settleRef === undefined && v.settleRefKind === undefined))) {}
export class SessionReceipt extends Schema.Class<SessionReceipt>("SessionReceipt")(Schema.Struct({
  sessionId: SessionId, buyer: SessionAddress, rail: RailName, network: Schema.String.pipe(Schema.pattern(/^eip155:[1-9][0-9]{0,15}$/)),
  budgetAtomic: SessionAmount.pipe(Schema.filter(v => v > 0n)), spentAtomic: SessionAmount, heldAtomic: SessionAmount,
  calls: Schema.Array(SessionCall).pipe(Schema.maxItems(100)), settledCalls: Schema.Int.pipe(Schema.between(0, 100)),
  settlementRefs: Schema.Array(Schema.String).pipe(Schema.maxItems(100)), complete: Schema.Literal(true),
  openedAtMs: SessionTime, closedAtMs: SessionTime
}).pipe(Schema.filter(v => {
  const settled = v.calls.filter(call => call.state === "settled")
  const refs = settled.map(call => call.settleRef)
  const kind = v.rail === "gateway" ? "gateway-transfer" : v.rail === "test" ? "test" : "onchain"
  return v.heldAtomic === 0n && v.spentAtomic <= v.budgetAtomic && v.closedAtMs >= v.openedAtMs
    && v.calls.every(call => (call.state === "settled" || call.state === "released") && call.createdAtMs >= v.openedAtMs && call.createdAtMs <= v.closedAtMs)
    && new Set(v.calls.map(call => call.jobId)).size === v.calls.length
    && settled.length === v.settledCalls && settled.reduce((sum, call) => sum + call.priceAtomic, 0n) === v.spentAtomic
    && settled.every(call => call.settleRefKind === kind)
    && new Set(refs).size === refs.length && v.settlementRefs.length === refs.length
    && new Set(v.settlementRefs).size === refs.length && refs.every(ref => ref !== undefined && v.settlementRefs.includes(ref))
}))) {}
