/** Local completion data only. Original-socket ownership, current chain checks and
 * durable signing claims remain necessary before this can authorize a signature. */
import { Schema } from "effect"
import { PublicListing, Bounds, JobOutcome, docBytes, hashJson, parsePrice, shouldSettle, validateJson,
  assertOutputSize } from "@arcade/core"
import { escrowActionContext, escrowAddress, escrowCheck, escrowRecord, escrowUint } from "@arcade/payments"
/** Copy known data classes without invoking getters before committing their JSON.
 * Never put a private SkillManifest here; accept its PublicListing projection only. */
function data(value: unknown, prototype: object): unknown {
  escrowCheck(value && typeof value === "object" &&
    [Object.prototype, prototype].includes(Object.getPrototypeOf(value)))
  const plain: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    escrowCheck(typeof key === "string")
    const d = Object.getOwnPropertyDescriptor(value, key)
    escrowCheck(d && d.enumerable && "value" in d)
    plain[key] = prototype === PublicListing.prototype && key === "bounds" ? data(d.value, Bounds.prototype) : d.value
  }
  return JSON.parse(docBytes(plain))
}
export function captureLocalEscrowCompletion(input: unknown) {
  try {
    const a = escrowRecord(input, ["hubJobId", "context", "input", "outcome", "listing", "seller", "providerAgentId"])
    const assignment = captureLocalEscrowAssignment({ hubJobId: a.hubJobId, context: a.context, input: a.input,
      listing: a.listing, seller: a.seller, providerAgentId: a.providerAgentId })
    const { context, listing } = assignment
    const outcome = Schema.decodeUnknownSync(JobOutcome, { onExcessProperty: "error" })(data(a.outcome, JobOutcome.prototype))
    escrowCheck(Number.isSafeInteger(outcome.startedAtMs) && outcome.startedAtMs >= 0 &&
      Number.isSafeInteger(outcome.finishedAtMs) && outcome.finishedAtMs >= outcome.startedAtMs)
    assertOutputSize(outcome.output)
    escrowCheck(shouldSettle(outcome, validateJson(outcome.output, listing.outputSchema)).settle)
    return Object.freeze({ hubJobId: assignment.hubJobId, context, outputHash: hashJson(outcome.output) })
  } catch { throw Error("escrow_local_completion_refused") }
}
export type LocalEscrowCompletion = ReturnType<typeof captureLocalEscrowCompletion>
/** Captured local listing facts, not chain or socket authority. */
export function captureLocalEscrowListing(input: unknown) {
  const a = escrowRecord(input, ["context", "listing", "seller", "providerAgentId"])
  const context = escrowActionContext(a.context), c = context.call
  const listing = Schema.decodeUnknownSync(PublicListing, { onExcessProperty: "error" })(data(a.listing, PublicListing.prototype))
  escrowCheck(c.provider === escrowAddress(a.seller) && c.providerAgentId === escrowUint(a.providerAgentId) &&
    c.skillId === listing.id && c.skillVersion === listing.version && c.amount === parsePrice(listing.price) &&
    c.timeoutSeconds === listing.bounds.timeoutSec && listing.rails?.includes("erc8183") === true)
  return Object.freeze({ context, listing, listingHash: hashJson(data(listing, PublicListing.prototype)) })
}
/** The runner must execute this captured input and keep completion on its local stack. */
export function captureLocalEscrowAssignment(input: unknown) {
  const a = escrowRecord(input, ["hubJobId", "context", "input", "listing", "seller", "providerAgentId"])
  escrowCheck(typeof a.hubJobId === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(a.hubJobId))
  const facts = captureLocalEscrowListing({ context: a.context, listing: a.listing, seller: a.seller, providerAgentId: a.providerAgentId })
  const actualInput: unknown = JSON.parse(docBytes(a.input))
  escrowCheck(hashJson(actualInput) === facts.context.call.inputHash && validateJson(actualInput, facts.listing.inputSchema))
  return Object.freeze({ ...facts, hubJobId: a.hubJobId, input: actualInput })
}
