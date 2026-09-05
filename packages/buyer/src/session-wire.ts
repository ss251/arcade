import { Schema } from "effect"
import { JobOutcome, Receipt, SessionCall, SessionReceipt, formatPrice, shouldSettle, type ChainConfig, type RailName } from "@arcade/core"
import { PaymentRequirements, paymentRequirementsKind } from "@arcade/payments"

/** Fixed private-protocol decoder failure: never retains its input. */
export class SessionWireInvalid extends Error { readonly _tag = "SessionWireInvalid"; constructor() { super("Invalid session data") } }
const bad = (): never => { throw new SessionWireInvalid() }
const decode = <A, I>(schema: Schema.Schema<A, I>, value: unknown): A => {
  try { return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value) } catch { return bad() }
}
export const sessionFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") { for (const v of Object.values(value)) sessionFreeze(v); Object.freeze(value) }
  return value
}
/** Own JSON only, with bounds BEFORE accessing a getter or encoding a large key. */
const normalizeSessionData = (input: unknown, limit: number): unknown => {
  let nodes = 0, bytes = 0
  const active = new Set<object>(), encoder = new TextEncoder()
  const add = (text: string) => { if (text.length > limit) bad(); bytes += encoder.encode(text).byteLength; if (bytes > limit) bad() }
  const visit = (v: unknown, depth: number): unknown => {
    if (++nodes > 65536 || depth > 64) return bad()
    if (typeof v === "string") { add(v); return v }
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v !== "object" || active.has(v)) return bad()
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v), keys = Reflect.ownKeys(v)
    if ((!array && proto !== Object.prototype && proto !== null) || keys.length > 65536) return bad()
    active.add(v)
    try {
      if (array) {
        if (keys.length !== v.length + 1) return bad()
        return Array.from({ length: v.length }, (_, i) => { const d = Object.getOwnPropertyDescriptor(v, String(i));
          if (d === undefined || !d.enumerable || !("value" in d)) return bad(); return visit(d.value, depth + 1) })
      }
      const result: Record<string, unknown> = Object.create(null)
      for (const key of keys) {
        const d = Object.getOwnPropertyDescriptor(v, key)!
        if (typeof key !== "string" || key === "__proto__" || key === "__bigint" || !d.enumerable || !("value" in d)) return bad()
        add(key); result[key] = visit(d.value, depth + 1)
      }
      return result
    } finally { active.delete(v) }
  }
  const copied = visit(input, 0), encoded = JSON.stringify(copied)
  if (encoder.encode(encoded).byteLength > limit) return bad()
  return sessionFreeze(copied)
}
/** Reflective/serialization exceptions also stay fixed. This does not make
 * hostile Proxy execution a sandbox; ordinary accessor properties are not invoked. */
export const sessionData = (input: unknown, limit = 1_048_576): unknown => {
  try { return normalizeSessionData(input, limit) } catch { return bad() }
}
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : bad()
const exact = (value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> => {
  const v = object(value)
  if (Object.keys(v).some(key => !required.includes(key) && !optional.includes(key)) || required.some(key => !Object.hasOwn(v, key))) return bad()
  return v
}
export const sessionAddress = (v: unknown): string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v) ? v.toLowerCase() : bad()
const canonicalAddress = (v: unknown): string => v === sessionAddress(v) ? v as string : bad()
export const sessionJobId = (v: unknown): string => typeof v === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(v) ? v : bad()
export const sessionSkillId = (v: unknown): string => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,127}$/.test(v) ? v : bad()
export const sessionService = (v: unknown): string => typeof v === "string" && /^[a-z0-9-]{1,32}$/.test(v) ? v : bad()
const sid = (v: unknown): string => typeof v === "string" && /^ses_[a-f0-9]{32}$/.test(v) ? v : bad()
const capability = (v: unknown): string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v) ? v : bad()
const railOf = (v: unknown): RailName => v === "gateway" || v === "eip3009" || v === "test" ? v : bad()
const atomic = (v: unknown, positive = false): bigint => {
  if (typeof v !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(v)) return bad()
  const n = BigInt(v); return n < 1n << 256n && (!positive || n > 0n) ? n : bad()
}
export const sessionBudget = (value: unknown): bigint => {
  if (typeof value !== "string" || value.length > 80 || !/^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) return bad()
  const [whole, fraction = ""] = value.split("."), amount = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))
  return amount > 0n && amount < 1n << 256n ? amount : bad()
}
const display = (value: unknown): bigint => {
  if (typeof value !== "string" || value.length > 82 || !/^\$(0|[1-9][0-9]*)\.[0-9]{2,6}$/.test(value)) return bad()
  const [whole, fraction = ""] = value.slice(1).split("."), amount = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))
  return amount < 1n << 256n && formatPrice(amount) === value ? amount : bad()
}
export const sessionOrigin = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\?#]/.test(value)) return bad()
  let url: URL; try { url = new URL(value) } catch { return bad() }
  if (url.origin !== value || url.username || url.password || !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))) return bad()
  return value
}
export interface SessionIdentity { readonly id: string; readonly buyer: string; readonly rail: RailName; readonly network: string; readonly budgetAtomic: bigint }
export const decodeSessionOpen = (input: unknown, expected: { buyer: string; chain: ChainConfig; budgetAtomic: bigint; rail?: RailName }) => {
  const v = exact(sessionData(input, 16384), ["session_id", "session_token", "rail", "network", "budget", "note"]), rail = railOf(v.rail)
  if (v.network !== expected.chain.caip2 || display(v.budget) !== expected.budgetAtomic || expected.rail !== undefined && rail !== expected.rail ||
    rail === "gateway" && expected.chain.gateway === null || typeof v.note !== "string") return bad()
  return sessionFreeze({ id: sid(v.session_id), token: capability(v.session_token), rail, network: expected.chain.caip2,
    buyer: canonicalAddress(expected.buyer), budgetAtomic: expected.budgetAtomic })
}
export interface SessionCallJson { readonly jobId: string; readonly skillId: string; readonly priceAtomic: string; readonly state: SessionCall["state"];
  readonly settled: boolean; readonly createdAtMs: number; readonly settleRef?: string; readonly settleRefKind?: SessionCall["settleRefKind"] }
const callOf = (input: unknown, rail: RailName): SessionCallJson => {
  const v = exact(input, ["jobId", "skillId", "priceAtomic", "state", "settled", "createdAtMs"], ["settleRef", "settleRefKind"])
  const decoded = decode(SessionCall, { ...v, jobId: sessionJobId(v.jobId), skillId: sessionSkillId(v.skillId), priceAtomic: atomic(v.priceAtomic, true) })
  if (decoded.settled && decoded.settleRefKind !== (rail === "gateway" ? "gateway-transfer" : rail === "test" ? "test" : "onchain")) return bad()
  return sessionFreeze({ jobId: decoded.jobId, skillId: decoded.skillId, priceAtomic: decoded.priceAtomic.toString(), state: decoded.state,
    settled: decoded.settled, createdAtMs: decoded.createdAtMs,
    ...(decoded.settleRef === undefined ? {} : { settleRef: decoded.settleRef }), ...(decoded.settleRefKind === undefined ? {} : { settleRefKind: decoded.settleRefKind }) })
}
const callsOf = (v: unknown, rail: RailName): readonly SessionCallJson[] => {
  if (!Array.isArray(v) || v.length > 100) return bad()
  const calls = v.map(call => callOf(call, rail)), refs = calls.filter(call => call.settled).map(call => call.settleRef)
  if (new Set(calls.map(call => call.jobId)).size !== calls.length || new Set(refs).size !== refs.length) return bad()
  return sessionFreeze(calls)
}
export interface SessionReceiptJson { readonly sessionId: string; readonly buyer: string; readonly rail: RailName; readonly network: string;
  readonly budgetAtomic: string; readonly spentAtomic: string; readonly heldAtomic: string; readonly calls: readonly SessionCallJson[];
  readonly settledCalls: number; readonly settlementRefs: readonly string[]; readonly complete: true; readonly openedAtMs: number; readonly closedAtMs: number }
export const decodeSessionClosed = (input: unknown, identity: SessionIdentity): SessionReceiptJson => {
  const v = exact(sessionData(input, 131072), ["sessionId", "buyer", "rail", "network", "budgetAtomic", "spentAtomic", "heldAtomic", "calls", "settledCalls", "settlementRefs", "complete", "openedAtMs", "closedAtMs"])
  if (v.sessionId !== identity.id || v.buyer !== identity.buyer || v.rail !== identity.rail || v.network !== identity.network || atomic(v.budgetAtomic, true) !== identity.budgetAtomic) return bad()
  const calls = callsOf(v.calls, identity.rail)
  decode(SessionReceipt, { ...v, budgetAtomic: atomic(v.budgetAtomic, true), spentAtomic: atomic(v.spentAtomic), heldAtomic: atomic(v.heldAtomic), calls: calls.map(call => ({ ...call, priceAtomic: atomic(call.priceAtomic, true) })) })
  return sessionFreeze({ ...v, calls } as unknown as SessionReceiptJson)
}
export interface SessionHubStatus extends SessionIdentity { readonly spentAtomic: bigint; readonly heldAtomic: bigint; readonly remainingAtomic: bigint;
  readonly calls: readonly SessionCallJson[]; readonly complete: boolean; readonly closed: boolean; readonly closedReceipt?: SessionReceiptJson }
export const decodeSessionStatus = (input: unknown, identity: SessionIdentity): SessionHubStatus => {
  const v = exact(sessionData(input, 131072), ["session_id", "rail", "network", "budget", "spent", "held", "remaining", "calls", "complete", "closed"], ["closed_receipt"])
  if (v.session_id !== identity.id || v.rail !== identity.rail || v.network !== identity.network || display(v.budget) !== identity.budgetAtomic || typeof v.complete !== "boolean" || typeof v.closed !== "boolean") return bad()
  const calls = callsOf(v.calls, identity.rail), spentAtomic = display(v.spent), heldAtomic = display(v.held), remainingAtomic = display(v.remaining)
  const spent = calls.filter(c => c.state === "settled").reduce((sum, c) => sum + atomic(c.priceAtomic), 0n)
  const held = calls.filter(c => !["settled", "released"].includes(c.state)).reduce((sum, c) => sum + atomic(c.priceAtomic), 0n)
  if (spent !== spentAtomic || held !== heldAtomic || spent + held + remainingAtomic !== identity.budgetAtomic || v.complete !== (held === 0n) || v.closed && !v.complete || v.closed !== Object.hasOwn(v, "closed_receipt")) return bad()
  const closedReceipt = v.closed ? decodeSessionClosed(v.closed_receipt, identity) : undefined
  if (closedReceipt !== undefined && (closedReceipt.spentAtomic !== spent.toString() || JSON.stringify(closedReceipt.calls) !== JSON.stringify(calls))) return bad()
  return sessionFreeze({ ...identity, spentAtomic, heldAtomic, remainingAtomic, calls, complete: v.complete, closed: v.closed, ...(closedReceipt === undefined ? {} : { closedReceipt }) })
}
export interface SessionListing { readonly id: string; readonly serviceName: string; readonly version: string; readonly seller: string; readonly priceAtomic: bigint }
export const decodeSessionListing = (input: unknown, service: string, skillId: string): SessionListing => {
  const v = object(sessionData(input))
  if (v.id !== sessionSkillId(skillId) || v.serviceName !== sessionService(service) || typeof v.version !== "string" || !/^[A-Za-z0-9.+-]{1,128}$/.test(v.version)) return bad()
  const priceAtomic = display(v.price); if (priceAtomic <= 0n) return bad()
  return sessionFreeze({ id: skillId, serviceName: service, version: v.version, seller: sessionAddress(v.seller), priceAtomic })
}
export const decodeSessionChallenge = (input: unknown, identity: SessionIdentity, chain: ChainConfig, listing: SessionListing, resource: string): PaymentRequirements => {
  const v = exact(sessionData(input, 16384), ["x402Version", "error", "accepts"])
  if (v.x402Version !== 2 || v.error !== "payment required" || !Array.isArray(v.accepts) || v.accepts.length !== 1) return bad()
  const r = decode(PaymentRequirements, v.accepts[0]), gateway = identity.rail === "gateway"
  if (r.network !== identity.network || r.network !== chain.caip2 || atomic(r.amount, true) !== listing.priceAtomic || sessionAddress(r.asset) !== chain.usdc.address.toLowerCase() ||
    r.resource !== resource || r.mimeType !== "application/json" || r.maxTimeoutSeconds !== 604900 || paymentRequirementsKind(r) !== (gateway ? "gateway" : "usdc") ||
    r.extra.name !== (gateway ? "GatewayWalletBatched" : chain.usdc.eip712Name) || r.extra.version !== (gateway ? "1" : chain.usdc.eip712Version)) return bad()
  const split = r.extra.feeSplitter
  if (Object.keys(r.extra).some(k => !["name", "version", "verifyingContract", ...(identity.rail === "eip3009" ? ["feeSplitter", "feeSplitterVersion"] : [])].includes(k))) return bad()
  if (split === undefined ? sessionAddress(r.payTo) !== listing.seller || r.extra.feeSplitterVersion !== undefined
    : identity.rail !== "eip3009" || sessionAddress(split) !== sessionAddress(r.payTo) || ![1, 2].includes(r.extra.feeSplitterVersion as number)) return bad()
  return sessionFreeze(PaymentRequirements.make({ ...r, asset: sessionAddress(r.asset), payTo: sessionAddress(r.payTo), extra: { ...r.extra,
    ...(r.extra.verifyingContract === undefined ? {} : { verifyingContract: sessionAddress(r.extra.verifyingContract) }), ...(split === undefined ? {} : { feeSplitter: sessionAddress(split) }) } }))
}
export const decodeSessionAccepted = (input: unknown, origin: string, amount: bigint) => {
  const v = exact(sessionData(input, 16384), ["job_id", "status", "poll_url", "job_token", "price"]), jobId = sessionJobId(v.job_id)
  if (v.status !== "queued" || display(v.price) !== amount || v.poll_url !== `${origin}/jobs/${jobId}/result`) return bad()
  return sessionFreeze({ jobId, jobToken: capability(v.job_token), pollUrl: v.poll_url as string })
}
export interface SessionResultContext { readonly identity: SessionIdentity; readonly chain: ChainConfig; readonly listing: SessionListing;
  readonly jobId: string; readonly nonce: string; readonly amountAtomic: bigint; readonly requirements: { readonly extra: Readonly<Record<string, unknown>> } }
export type SessionDecodedResult = { readonly kind: "pending" | "uncertain" } | { readonly kind: "terminal"; readonly jobId: string;
  readonly status: "succeeded" | "rejected"; readonly result: unknown; readonly receipt: Readonly<Record<string, unknown>> }
export const decodeSessionResult = (status: number, input: unknown, ctx: SessionResultContext): SessionDecodedResult => {
  const raw = sessionData(input, 2_113_536)
  if (status === 202) { const v = exact(raw, ["job_id", "status"]); if (v.job_id !== ctx.jobId || v.status !== "pending") return bad(); return { kind: "pending" } }
  if (status === 503) { const v = exact(raw, ["error", "settlement_status"]); if (v.error !== "session_settlement_uncertain" || v.settlement_status !== "uncertain") return bad(); return { kind: "uncertain" } }
  if (status !== 200) return bad()
  const v = exact(raw, ["job_id", "status", "result", "receipt"], ["detail"]), settled = v.status === "succeeded"
  if (v.job_id !== ctx.jobId || (!settled && v.status !== "rejected") || (settled ? Object.hasOwn(v, "detail") : v.detail !== "session_released" || v.result !== null)) return bad()
  if (settled && !shouldSettle(JobOutcome.make({ status: "succeeded", output: v.result, startedAtMs: 0, finishedAtMs: 0 }), true).settle) return bad()
  const r = exact(v.receipt, ["jobId", "skillId", "skillVersion", "buyer", "seller", "priceAtomic", "sellerAtomic", "feeAtomic", "feeBps", "rail", "network", "latencyMs", "settled", "reason", "createdAtMs", "rootJobId", "hop", "ancestors", "authorizationNonce", "sessionId", "price", "sellerShare", "fee", "explorer"], ["sellerCostUsd", "canary", "settleTx", "settleRefKind"])
  const { price, sellerShare, fee, explorer, ...fields } = r
  const receipt = decode(Receipt, { ...fields, priceAtomic: atomic(r.priceAtomic, true), sellerAtomic: atomic(r.sellerAtomic), feeAtomic: atomic(r.feeAtomic) })
  if (receipt.jobId !== ctx.jobId || receipt.rootJobId !== ctx.jobId || receipt.hop !== 0 || receipt.ancestors?.length !== 0 || receipt.sessionId !== ctx.identity.id ||
    receipt.buyer !== ctx.identity.buyer || receipt.seller !== ctx.listing.seller || receipt.skillId !== ctx.listing.id || receipt.skillVersion !== ctx.listing.version ||
    receipt.rail !== ctx.identity.rail || receipt.network !== ctx.identity.network || receipt.priceAtomic !== ctx.amountAtomic || receipt.authorizationNonce !== ctx.nonce ||
    receipt.settled !== settled || receipt.reason !== (settled ? "ok" : "session_released") || receipt.feeBps < 0 || receipt.feeBps > 10000 ||
    ctx.requirements.extra.feeSplitter === undefined && receipt.feeBps !== 0 || receipt.feeAtomic !== receipt.priceAtomic * BigInt(receipt.feeBps) / 10000n ||
    receipt.sellerAtomic + receipt.feeAtomic !== receipt.priceAtomic || display(price) !== receipt.priceAtomic || display(fee) !== receipt.feeAtomic || display(sellerShare) !== receipt.sellerAtomic ||
    !Number.isSafeInteger(receipt.latencyMs) || receipt.latencyMs < 0 || !Number.isSafeInteger(receipt.createdAtMs) || receipt.createdAtMs < receipt.latencyMs ||
    receipt.canary !== undefined && receipt.canary !== true || receipt.sellerCostUsd !== undefined && (!Number.isFinite(receipt.sellerCostUsd) || receipt.sellerCostUsd < 0)) return bad()
  callOf({ jobId: ctx.jobId, skillId: ctx.listing.id, priceAtomic: r.priceAtomic, state: settled ? "settled" : "released", settled,
    createdAtMs: receipt.createdAtMs - receipt.latencyMs, ...(receipt.settleTx === undefined ? {} : { settleRef: receipt.settleTx }), ...(receipt.settleRefKind === undefined ? {} : { settleRefKind: receipt.settleRefKind }) }, ctx.identity.rail)
  const expectedExplorer = settled && ctx.identity.rail === "eip3009" ? `${ctx.chain.explorerBaseUrl}/tx/${receipt.settleTx}` : null
  if (explorer !== expectedExplorer) return bad()
  return sessionFreeze({ kind: "terminal", jobId: ctx.jobId, status: settled ? "succeeded" : "rejected", result: v.result, receipt: { ...r } })
}
