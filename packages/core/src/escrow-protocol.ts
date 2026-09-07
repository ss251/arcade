/** Escrow-only socket data contracts. No signing, keys, RPC or execution authority. */
import { Schema } from "effect"
const bytes = new TextEncoder()
/** Inspect descriptors before schema parsing; no accessors, class instances, arrays,
 * secrets in unknown fields, or unbounded JSON trees are accepted by these messages. */
function wireData(input: unknown): boolean {
  let nodes = 0, length = 0
  const visit = (value: unknown, depth: number): boolean => {
    if (++nodes > 128 || depth > 4) return false
    if (typeof value === "string") { if (value.length > 16384) return false; length += bytes.encode(value).length; return length <= 16384 }
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || key.length > 16384) return false
      length += bytes.encode(key).length
      const d = Object.getOwnPropertyDescriptor(value, key)
      if (!d || !d.enumerable || !("value" in d) || length > 16384 || !visit(d.value, depth + 1)) return false
    }
    return true
  }
  try { return visit(input, 0) } catch { return false }
}
const closed = <Fields extends Schema.Struct.Fields>(fields: Fields) => Schema.Unknown.pipe(
  Schema.filter(wireData, { message: () => "Invalid escrow wire data" }),
  // compose.strict controls TS input compatibility only; the runtime Struct below
  // validates unknown input and explicitly rejects excess properties at every level.
  Schema.compose(Schema.Struct(fields).annotations({ parseOptions: { onExcessProperty: "error" } }), { strict: false }))
const text = (max: number) => Schema.String.pipe(Schema.filter(s => s.length > 0 && s.length <= max && bytes.encode(s).length <= max && !/[\x00-\x1f\x7f]/.test(s)))
const address = Schema.String.pipe(Schema.filter(s => /^0x[0-9a-f]{40}$/.test(s) && BigInt(s) > 0n))
const hash = Schema.String.pipe(Schema.filter(s => /^0x[0-9a-f]{64}$/.test(s) && BigInt(s) > 0n))
const decimal = (bits: number, positive = false) => Schema.String.pipe(Schema.filter(s =>
  /^(0|[1-9][0-9]{0,77})$/.test(s) && BigInt(s) < 2n ** BigInt(bits) && (!positive || BigInt(s) > 0n)))
const seconds = Schema.Number.pipe(Schema.filter(n => Number.isSafeInteger(n) && n > 0 && n < 2 ** 48))
export const EscrowCallWire = closed({ chainId: Schema.Literal(5042002), escrow: address, hook: address, evaluator: address,
  token: Schema.Literal("0x3600000000000000000000000000000000000000"), provider: address,
  providerAgentId: decimal(256), amount: decimal(256, true), resource: text(2048), method: Schema.Literal("POST"),
  skillId: text(256), skillVersion: text(128), inputHash: hash, timeoutSeconds: Schema.Int.pipe(Schema.between(1, 900)) })
export const EscrowContextWire = closed({ call: EscrowCallWire, jobId: decimal(256, true), client: address,
  expiredAt: seconds, requestHash: hash, treasury: address })
export type EscrowContextWire = typeof EscrowContextWire.Type
export const EscrowBudgetRequest = closed({ _tag: Schema.Literal("EscrowBudgetRequest"), requestId: hash, context: EscrowContextWire })
export type EscrowBudgetRequest = typeof EscrowBudgetRequest.Type
export const EscrowSubmitRequest = closed({ _tag: Schema.Literal("EscrowSubmitRequest"), requestId: hash, context: EscrowContextWire,
  hubJobId: Schema.String.pipe(Schema.pattern(/^job_[A-Za-z0-9]{16,128}$/)), outputHash: hash })
export type EscrowSubmitRequest = typeof EscrowSubmitRequest.Type
const signed = { requestId: hash, escrow: address, jobId: decimal(256, true), nonce: decimal(72), deadline: decimal(48, true),
  signature: Schema.String.pipe(Schema.pattern(/^0x[0-9a-f]{130}$/)) }
export const EscrowBudgetSigned = closed({ _tag: Schema.Literal("EscrowBudgetSigned"), ...signed })
export type EscrowBudgetSigned = typeof EscrowBudgetSigned.Type
export const EscrowSubmitSigned = closed({ _tag: Schema.Literal("EscrowSubmitSigned"), ...signed })
export type EscrowSubmitSigned = typeof EscrowSubmitSigned.Type
export const EscrowAuthorizationRefused = closed({ _tag: Schema.Literal("EscrowAuthorizationRefused"), requestId: hash,
  operation: Schema.Literal("budget", "submit"), reason: Schema.Literal("authorization_refused") })
export type EscrowAuthorizationRefused = typeof EscrowAuthorizationRefused.Type
export const EscrowProviderRequest = Schema.Union(EscrowBudgetRequest, EscrowSubmitRequest)
export type EscrowProviderRequest = typeof EscrowProviderRequest.Type
export const EscrowProviderReply = Schema.Union(EscrowBudgetSigned, EscrowSubmitSigned, EscrowAuthorizationRefused)
export type EscrowProviderReply = typeof EscrowProviderReply.Type
