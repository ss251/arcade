/** Separate escrow capability wire. Exact PaymentPayload and session decoding are unchanged. */
import type { Hex } from "viem"
import { PaymentRequirements } from "./types.ts"
import type { ChallengeInput } from "./rail.ts"
import { captureEscrowCall, captureEscrowProof, type EscrowCall } from "./erc8183-request.ts"
import { captureEscrowIdentity } from "./erc8183-reader.ts"
import { escrowCheck, escrowRecord, escrowSeconds, escrowUint, EscrowFactsRefused } from "./erc8183-codec.ts"
export type EscrowChallengeContext = Pick<EscrowCall, "skillId" | "skillVersion" | "inputHash" | "providerAgentId" | "timeoutSeconds">
export interface EscrowCompletionContext { readonly hubJobId: string; readonly outputHash: Hex }
export interface EscrowPaymentPayload {
  readonly x402Version: 2; readonly accepted: PaymentRequirements
  readonly payload: { readonly jobId: string; readonly capability: Hex }
  readonly resource?: { readonly url: string; readonly description?: string; readonly mimeType?: string }
}
const PROTOCOL = "arcade:erc8183:request:v1"
/** Accept only plain data or the known requirements class, never accessors. */
function record(input: unknown, required: readonly string[], optional: readonly string[] = [], requirement = false) {
  escrowCheck(input && typeof input === "object" && (Object.getPrototypeOf(input) === Object.prototype ||
    requirement && Object.getPrototypeOf(input) === PaymentRequirements.prototype))
  const allowed = [...required, ...optional], result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(input)) {
    escrowCheck(typeof key === "string" && allowed.includes(key))
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    escrowCheck(descriptor && descriptor.enumerable && "value" in descriptor); result[key] = descriptor.value
  }
  escrowCheck(required.every(key => Object.hasOwn(result, key)))
  return result
}
function text(value: unknown, limit: number) {
  escrowCheck(typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= limit && !/[\x00-\x1f\x7f]/.test(value))
  return value
}
function decimal(value: unknown): bigint {
  escrowCheck(typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value)); return escrowUint(BigInt(value))
}
function requirements(call: EscrowCall, expiresInSeconds: number, description?: string) {
  escrowCheck(escrowSeconds(expiresInSeconds) >= call.timeoutSeconds + 600)
  const request = Object.freeze({ method: call.method, skillId: call.skillId, skillVersion: call.skillVersion,
    inputHash: call.inputHash, timeoutSeconds: call.timeoutSeconds })
  const value = PaymentRequirements.make({ scheme: "erc8183", network: "eip155:5042002", asset: call.token,
    amount: call.amount.toString(), payTo: call.provider, resource: call.resource,
    ...(description === undefined ? {} : { description }), mimeType: "application/json", maxTimeoutSeconds: call.timeoutSeconds,
    extra: Object.freeze({ protocol: PROTOCOL, escrow: call.escrow, hook: call.hook, evaluator: call.evaluator,
      providerAgentId: call.providerAgentId.toString(), expiresInSeconds, request }) })
  // Schema construction copies the record; freeze the resulting record, not only its input.
  Object.freeze(value.extra["request"]); Object.freeze(value.extra)
  return Object.freeze(value)
}
export function buildEscrowRequirements(identity: unknown, input: ChallengeInput, expiresInSeconds: number) {
  try {
    const id = captureEscrowIdentity(identity), r = record(input, ["priceAtomic", "resource", "payTo", "escrow"],
      ["description", "feeSplitter", "feeSplitterVersion"])
    const e = escrowRecord(r.escrow, ["skillId", "skillVersion", "inputHash", "providerAgentId", "timeoutSeconds"])
    const call = captureEscrowCall({ chainId: 5042002, escrow: id.escrow, hook: id.hook, evaluator: id.evaluator, token: id.token,
      provider: r.payTo, amount: r.priceAtomic, resource: r.resource, method: "POST", ...e })
    return requirements(call, expiresInSeconds, r.description === undefined ? undefined : text(r.description, 4096))
  } catch { throw new EscrowFactsRefused() }
}
/** Captures terms, not truth: the hub must supply its CURRENT independently derived
 * requirements as verify's second argument. Echoed header metadata is never authority. */
export function captureEscrowRequirements(input: unknown) {
  try {
    const r = record(input, ["scheme", "network", "asset", "amount", "payTo", "resource", "mimeType", "maxTimeoutSeconds", "extra"], ["description"], true)
    escrowCheck(r.scheme === "erc8183" && r.network === "eip155:5042002" && r.mimeType === "application/json")
    const extra = escrowRecord(r.extra, ["protocol", "escrow", "hook", "evaluator", "providerAgentId", "expiresInSeconds", "request"])
    escrowCheck(extra.protocol === PROTOCOL)
    const request = escrowRecord(extra.request, ["method", "skillId", "skillVersion", "inputHash", "timeoutSeconds"])
    const call = captureEscrowCall({ chainId: 5042002, escrow: extra.escrow, hook: extra.hook, evaluator: extra.evaluator,
      token: r.asset, provider: r.payTo, providerAgentId: decimal(extra.providerAgentId), amount: decimal(r.amount),
      resource: r.resource, ...request })
    escrowCheck(r.maxTimeoutSeconds === call.timeoutSeconds)
    const expiresInSeconds = escrowSeconds(extra.expiresInSeconds)
    const captured = requirements(call, expiresInSeconds, r.description === undefined ? undefined : text(r.description, 4096))
    return Object.freeze({ call, expiresInSeconds, requirements: captured })
  } catch { throw new EscrowFactsRefused() }
}
export function captureEscrowPayment(input: unknown): EscrowPaymentPayload {
  try {
    const r = record(input, ["x402Version", "accepted", "payload"], ["resource"])
    escrowCheck(r.x402Version === 2)
    const accepted = captureEscrowRequirements(r.accepted).requirements, proof = captureEscrowProof(r.payload)
    let resource: EscrowPaymentPayload["resource"]
    if (Object.hasOwn(r, "resource")) {
      const descriptor = record(r.resource, ["url"], ["description", "mimeType"])
      escrowCheck(descriptor.url === accepted.resource)
      resource = Object.freeze({ url: accepted.resource,
        ...(descriptor.description === undefined ? {} : { description: text(descriptor.description, 4096) }),
        ...(descriptor.mimeType === undefined ? {} : { mimeType: text(descriptor.mimeType, 128) }) })
    }
    const result = Object.freeze({ x402Version: 2 as const, accepted,
      payload: Object.freeze({ jobId: proof.jobId.toString(), capability: proof.capability }), ...(resource === undefined ? {} : { resource }) })
    escrowCheck(Buffer.byteLength(JSON.stringify(result)) <= 16384)
    return result
  } catch { throw new EscrowFactsRefused() }
}
export const encodeEscrowHeader = (input: EscrowPaymentPayload): string =>
  Buffer.from(JSON.stringify(captureEscrowPayment(input)), "utf8").toString("base64")
