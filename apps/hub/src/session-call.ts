import { Schema } from "effect"
import { Bounds, Job, JobOutcome, PublicListing, Receipt, Session, SessionCall, SessionInvalid,
  parsePrice, shouldSettle, splitFee, type ChainConfig } from "@arcade/core"
import { PaymentPayload, PaymentRequirements, type Rail, type SettledPayment, type VerifiedPayment } from "@arcade/payments"
import { sessionJson, sessionParse, sessionJobCopy, sessionReceiptCopy, sessionRequestDigest,
  SESSION_EVIDENCE_BYTES, type SessionBinding, type SessionSnapshot, type SessionTerminal } from "./session-ledger.ts"
import type { ListingRecord } from "./store.ts"
import { validateOutput } from "./validate.ts"

const invalid = (): never => { throw new SessionInvalid() }
const address = (v: unknown): string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v) ? v.toLowerCase() : invalid()
const integer = (v: unknown): bigint => typeof v === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < 1n << 256n ? BigInt(v) : invalid()
const time = (v: number) => { if (!Number.isSafeInteger(v) || v < 0) invalid(); return v }
export const sessionJobIdOk = (v: unknown): v is string => typeof v === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(v)
const freeze = <T>(v: T): T => { if (v !== null && typeof v === "object") { for (const child of Object.values(v)) freeze(child); Object.freeze(v) } return v }

/** Read only own data, before Schema or routing fields can invoke an accessor.
 * Known protocol Classes become plain data; arbitrary prototypes remain refused.
 * Final F5 canonical serialization supplies the exact byte/depth/node boundary. */
export const sessionCallData = (input: unknown, limit = SESSION_EVIDENCE_BYTES): unknown => {
  let nodes = 0, stringBytes = 0
  const active = new Set<object>()
  const visit = (v: unknown, depth: number): unknown => {
    if (++nodes > 65536 || depth > 64) return invalid()
    if (typeof v === "string") { stringBytes += Buffer.byteLength(v); if (stringBytes > limit) invalid(); return v }
    if (v === null || typeof v !== "object") return v
    if (active.has(v)) return invalid()
    const proto = Object.getPrototypeOf(v)
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null &&
      ![Bounds, PublicListing, PaymentRequirements, PaymentPayload, Job, JobOutcome, Receipt, Session, SessionCall].some(c => v instanceof c)) return invalid()
    const keys = Reflect.ownKeys(v)
    if (keys.length > 65536) return invalid()
    active.add(v)
    try {
      if (Array.isArray(v)) {
        if (keys.length !== v.length + 1) return invalid()
        return Array.from({ length: v.length }, (_, i) => { const d = Object.getOwnPropertyDescriptor(v, String(i))
          if (d === undefined || !d.enumerable || !("value" in d)) return invalid(); return visit(d.value, depth + 1) })
      }
      const result: Record<string, unknown> = Object.create(null)
      for (const key of keys) {
        const d = Object.getOwnPropertyDescriptor(v, key)!
        if (typeof key !== "string" || key === "__proto__" || key === "__bigint" || !d.enumerable || !("value" in d)) return invalid()
        if (key.length > limit) return invalid()
        stringBytes += Buffer.byteLength(key)
        if (stringBytes > limit) return invalid()
        result[key] = visit(d.value, depth + 1)
      }
      return result
    } finally { active.delete(v) }
  }
  return sessionParse(sessionJson(visit(input, 0), limit), limit)
}

/** EVM addresses sign as 20 bytes, not checksum spelling. Normalize consistently
 * BEFORE the actual selected verifier, including the splitter-routing coordinates.
 * Never change the signature or replace the resulting VerifiedPayment object. */
export const canonicalSessionRequirements = (input: PaymentRequirements): PaymentRequirements => {
  const r = Schema.decodeUnknownSync(PaymentRequirements, { onExcessProperty: "error" })(sessionCallData(input, 16384))
  return freeze(PaymentRequirements.make({ ...r, asset: address(r.asset), payTo: address(r.payTo), extra: { ...r.extra,
    ...(r.extra.verifyingContract === undefined ? {} : { verifyingContract: address(r.extra.verifyingContract) }),
    ...(r.extra.feeSplitter === undefined ? {} : { feeSplitter: address(r.extra.feeSplitter) }) } }))
}
export const canonicalSessionPayment = (input: PaymentPayload): PaymentPayload => {
  const p = Schema.decodeUnknownSync(PaymentPayload, { onExcessProperty: "error" })(sessionCallData(input, 16384))
  return freeze(PaymentPayload.make({ ...p, accepted: canonicalSessionRequirements(p.accepted), payload: { ...p.payload,
    authorization: { ...p.payload.authorization, from: address(p.payload.authorization.from), to: address(p.payload.authorization.to) } } }))
}

export const sessionListing = (record: ListingRecord): ListingRecord => {
  const data = sessionCallData(record) as ListingRecord
  const listing = Schema.decodeUnknownSync(PublicListing, { onExcessProperty: "error" })(data.listing)
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(listing.id) || !/^[A-Za-z0-9.+-]{1,128}$/.test(listing.version)) return invalid()
  return freeze({ ...data, seller: address(data.seller), listing })
}
export const sessionFee = (record: ListingRecord, rail: Rail, chain: ChainConfig): { feeBps: number; payTo: string; splitterVersion?: 1 | 2 } => {
  const seller = address(record.seller)
  if (rail.name !== "eip3009" || record.feeSplitter === undefined) return { feeBps: 0, payTo: seller }
  const fee = record.splitterFeeBps
  if (record.splitterVerified !== true || typeof fee !== "number" || !Number.isSafeInteger(fee) || fee < 0 || fee > 10000 ||
    record.splitterNetwork !== chain.caip2 || (record.splitterVersion !== 1 && record.splitterVersion !== 2)) return invalid()
  return { feeBps: fee, payTo: address(record.feeSplitter), splitterVersion: record.splitterVersion }
}
export const checkSessionRequirements = (r: PaymentRequirements, record: ListingRecord, rail: Rail, chain: ChainConfig, resource: string): PaymentRequirements => {
  const value = Schema.decodeUnknownSync(PaymentRequirements, { onExcessProperty: "error" })(sessionCallData(r, 16384))
  const fee = sessionFee(record, rail, chain), gateway = rail.name === "gateway", extra = value.extra
  if (value.scheme !== "exact" || value.network !== chain.caip2 || value.amount !== parsePrice(record.listing.price).toString() ||
    address(value.asset) !== chain.usdc.address.toLowerCase() || address(value.payTo) !== fee.payTo || value.resource !== resource ||
    value.maxTimeoutSeconds !== 604900 || value.mimeType !== "application/json" ||
    extra.name !== (gateway ? "GatewayWalletBatched" : chain.usdc.eip712Name) || extra.version !== (gateway ? "1" : chain.usdc.eip712Version)) return invalid()
  if (gateway) {
    if (chain.gateway === null || address(extra.verifyingContract) !== chain.gateway.wallet.toLowerCase() ||
      Object.keys(extra).some(k => !["name", "version", "verifyingContract"].includes(k))) return invalid()
  } else {
    if (Object.keys(extra).some(k => !["name", "version", "verifyingContract", "feeSplitter", "feeSplitterVersion"].includes(k)) ||
      extra.verifyingContract !== undefined && address(extra.verifyingContract) !== chain.usdc.address.toLowerCase()) return invalid()
    if (fee.splitterVersion === undefined ? extra.feeSplitter !== undefined || extra.feeSplitterVersion !== undefined
      : address(extra.feeSplitter) !== fee.payTo || extra.feeSplitterVersion !== fee.splitterVersion) return invalid()
  }
  return freeze(value)
}
export interface PreparedSessionCall {
  readonly job: Job; readonly binding: SessionBinding; readonly listing: PublicListing
  readonly rail: Rail; readonly verified: VerifiedPayment; readonly feeBps: number; readonly splitterVersion?: 1 | 2
  readonly canary?: boolean
}
export interface PrepareSessionCallInput {
  readonly snapshot: SessionSnapshot; readonly record: ListingRecord; readonly chain: ChainConfig; readonly rail: Rail
  readonly verified: VerifiedPayment; readonly jobId: string; readonly input: unknown; readonly createdAtMs: number
  readonly requirements: PaymentRequirements
  /** Trusted router classification after actual payer verification, never client data. */
  readonly canary?: boolean
}
export const prepareSessionCall = (args: PrepareSessionCallInput): PreparedSessionCall => {
  const record = sessionListing(args.record), s = args.snapshot.session, rail = args.rail, chain = args.chain
  const raw = sessionCallData(args.verified, 32768) as VerifiedPayment
  const p = Schema.decodeUnknownSync(PaymentPayload, { onExcessProperty: "error" })(raw.payload), a = p.payload.authorization
  const r = checkSessionRequirements(raw.requirements, record, rail, chain, raw.requirements.resource)
  const accepted = checkSessionRequirements(p.accepted, record, rail, chain, r.resource)
  if (sessionJson(sessionCallData(r)) !== sessionJson(sessionCallData(args.requirements)) ||
    raw.payer !== address(raw.payer) || raw.payTo !== address(raw.payTo) || a.from !== address(a.from) || a.to !== address(a.to) ||
    sessionJson(sessionCallData(r)) !== sessionJson(sessionCallData(accepted)) ||
    p.resource !== undefined && p.resource.url !== r.resource || s.closedAtMs !== undefined || s.rail !== rail.name || s.network !== chain.caip2 ||
    address(raw.payer) !== s.buyer || address(a.from) !== s.buyer || address(raw.payTo) !== address(r.payTo) || address(a.to) !== address(r.payTo) ||
    raw.network !== s.network || raw.amountAtomic !== parsePrice(record.listing.price) || integer(a.value) !== raw.amountAtomic ||
    !/^0x[0-9a-f]{64}$/.test(a.nonce) || /^0x0{64}$/.test(a.nonce) || !sessionJobIdOk(args.jobId)) return invalid()
  const createdAtMs = time(args.createdAtMs), after = integer(a.validAfter), before = integer(a.validBefore), now = BigInt(Math.floor(createdAtMs / 1000))
  if (createdAtMs < s.openedAtMs || after >= before || after > now || before <= now ||
    rail.name === "gateway" && (before - after > 605500n || before > now + 604900n)) return invalid()
  const input = sessionCallData(args.input), fee = sessionFee(record, rail, chain)
  const job = freeze(sessionJobCopy(Job.make({ id: args.jobId, skillId: record.listing.id, seller: record.seller, buyer: s.buyer,
    priceAtomic: raw.amountAtomic, input, status: "queued", createdAtMs, rootJobId: args.jobId, hop: 0, ancestors: [] })))
  const binding: SessionBinding = freeze({ sessionId: s.id, jobId: job.id, buyer: s.buyer, seller: record.seller, skillId: job.skillId,
    skillVersion: record.listing.version, rail: rail.name, network: s.network, asset: chain.usdc.address.toLowerCase(),
    verifyingContract: (rail.name === "gateway" ? chain.gateway!.wallet : chain.usdc.address).toLowerCase(),
    domainName: String(r.extra.name), domainVersion: String(r.extra.version), payTo: fee.payTo, amountAtomic: raw.amountAtomic,
    nonce: a.nonce, validAfter: after, validBefore: before, requestDigest: sessionRequestDigest(input) })
  const call = Object.freeze({ job, binding, listing: record.listing, rail, verified: freeze(args.verified), ...fee,
    ...(args.canary === true ? { canary: true } : {}) })
  // Worst-width times prove fixed release headroom before creating any durable hold.
  const releaseProbe = releasedSessionTerminal(call, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE)
  // A finite number's exponent/fixed spelling may be a few bytes wider than MAX_VALUE.
  // Keep explicit local cost-encoding headroom; this candidate is never persisted.
  sessionJson(releaseProbe.job, SESSION_EVIDENCE_BYTES - 16)
  return call
}
/** Optional known inference cost, never arbitrary failed output/provider prose. */
export const sessionReleaseCost = (input: unknown): number | undefined => {
  try {
    const outcome = Schema.decodeUnknownSync(JobOutcome, { onExcessProperty: "error" })(sessionCallData(input))
    return typeof outcome.costUsd === "number" && Number.isFinite(outcome.costUsd) && outcome.costUsd >= 0 ? outcome.costUsd : undefined
  } catch { return undefined }
}
export const releasedSessionTerminal = (call: PreparedSessionCall, atMs: number, costUsd?: number): Extract<SessionTerminal, { kind: "released" }> => {
  const at = time(atMs); if (at < call.job.createdAtMs) return invalid()
  if (costUsd !== undefined && (!Number.isFinite(costUsd) || costUsd < 0)) return invalid()
  const outcome = JobOutcome.make({ status: "rejected", startedAtMs: call.job.createdAtMs, finishedAtMs: at,
    ...(costUsd === undefined ? {} : { costUsd }) })
  return { kind: "released", sessionId: call.binding.sessionId, jobId: call.job.id,
    job: sessionJobCopy(Job.make({ ...call.job, status: outcome.status, outcome })), receipt: receiptFor(call, outcome, at) }
}
function receiptFor(call: PreparedSessionCall, outcome: JobOutcome, at: number, reference?: { txHash: string; kind: "onchain" | "gateway-transfer" | "test" }): Receipt {
  const { binding: b } = call
  if (time(at) < outcome.finishedAtMs || at < call.job.createdAtMs) return invalid()
  return sessionReceiptCopy(Receipt.make({ jobId: b.jobId, skillId: b.skillId, skillVersion: b.skillVersion, buyer: b.buyer, seller: b.seller,
    priceAtomic: b.amountAtomic, ...splitFee(b.amountAtomic, call.feeBps), feeBps: call.feeBps,
    ...(outcome.costUsd === undefined ? {} : { sellerCostUsd: outcome.costUsd }), rail: b.rail, network: b.network,
    latencyMs: at - call.job.createdAtMs, createdAtMs: at, settled: reference !== undefined, reason: reference === undefined ? "session_released" : "ok",
    sessionId: b.sessionId, rootJobId: b.jobId, hop: 0, ancestors: [], authorizationNonce: b.nonce,
    ...(call.canary === true ? { canary: true } : {}),
    ...(reference === undefined ? {} : { settleTx: reference.txHash, settleRefKind: reference.kind }) }))
}
export const prepareSessionOutcome = (call: PreparedSessionCall, input: unknown, atMs: number): JobOutcome => {
  const outcome = Schema.decodeUnknownSync(JobOutcome, { onExcessProperty: "error" })(sessionCallData(input))
  if (time(outcome.startedAtMs) < call.job.createdAtMs || time(outcome.finishedAtMs) < outcome.startedAtMs || outcome.finishedAtMs > time(atMs) ||
    outcome.costUsd !== undefined && (!Number.isFinite(outcome.costUsd) || outcome.costUsd < 0) ||
    !shouldSettle(outcome, validateOutput(outcome.output, call.listing.outputSchema)).settle) return invalid()
  sessionJobCopy(Job.make({ ...call.job, status: outcome.status, outcome }))
  // Local size probe only. Never returned, stored, sent to settle/finish, or logged.
  receiptFor(call, outcome, Number.MAX_SAFE_INTEGER, { txHash: "x".repeat(128), kind: "gateway-transfer" })
  return freeze(outcome)
}
export const settledSessionTerminal = (call: PreparedSessionCall, outcome: JobOutcome, atMs: number, original: SettledPayment): Extract<SessionTerminal, { kind: "settled" }> => {
  const settlement = sessionCallData(original, 16384) as SettledPayment, b = call.binding
  if (Object.keys(settlement).some(k => !["txHash", "payer", "amountAtomic", "settlementKind"].includes(k)) ||
    settlement.payer !== b.buyer || settlement.amountAtomic !== b.amountAtomic) return invalid()
  const kind = settlement.settlementKind ?? (b.rail === "test" ? "test" : b.rail === "eip3009" ? "onchain" : undefined)
  const ref = settlement.txHash
  if (typeof ref !== "string" || (b.rail === "gateway" ? kind !== "gateway-transfer" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ref)
    : b.rail === "test" ? kind !== "test" || !/^0xtest[0-9a-f]{14,122}$/.test(ref)
    : kind !== "onchain" || !/^0x[0-9a-f]{64}$/.test(ref) || /^0x0{64}$/.test(ref))) return invalid()
  return { kind: "settled", sessionId: b.sessionId, jobId: b.jobId, settlement: original,
    job: sessionJobCopy(Job.make({ ...call.job, status: outcome.status, outcome })),
    receipt: receiptFor(call, outcome, atMs, { txHash: ref, kind: kind as "onchain" | "gateway-transfer" | "test" }) }
}
