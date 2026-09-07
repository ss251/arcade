import { describe, expect, it } from "vitest"
import { JobOutcome, PublicListing, Bounds, MAX_OUTPUT_CHARS, hashJson, validateOutput as sharedValidate } from "@arcade/core"
import { validateOutput as hubValidate } from "../../../apps/hub/src/validate.ts"
import { captureLocalEscrowCompletion } from "../src/escrow-local.ts"
import { fixture, hash } from "../../payments/test/fixtures/erc8183-action.ts"
async function setup() {
  const f = await fixture(), input = { question: "fixture" }, output = { text: "fixture result" }
  const context = { ...f.context, call: { ...f.context.call, inputHash: hashJson(input) } }
  const listing = PublicListing.make({ id: "skill", version: "1.0.0", serviceName: "Fixture", description: "Fixture",
    price: "$0.30", rails: ["erc8183"], tags: [], bounds: Bounds.make({ timeoutSec: 60 }),
    inputSchema: { type: "object", required: ["question"], properties: { question: { type: "string" } } },
    outputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } } })
  const outcome = JobOutcome.make({ status: "succeeded", stopReason: "end_turn", output, startedAtMs: 1000, finishedAtMs: 1001 })
  return { hubJobId: "job_" + "a".repeat(32), context, input, outcome, listing,
    seller: f.context.call.provider, providerAgentId: 8n }
}
describe("runner-local escrow completion data (not signing authority)", () => {
  it("uses the same validator as the hub and captures only actual validated commitments", async () => {
    expect(sharedValidate).toBe(hubValidate)
    const h = await setup(), proof = captureLocalEscrowCompletion(h)
    expect(proof).toEqual({ hubJobId: h.hubJobId, context: h.context, outputHash: hashJson(h.outcome.output) })
    expect(Object.isFrozen(proof)).toBe(true); expect(Object.isFrozen(proof.context.call)).toBe(true)
    const publicBytes = JSON.stringify(proof, (_, value) => typeof value === "bigint" ? value.toString() : value)
    expect(publicBytes).not.toContain("fixture result"); expect(publicBytes).not.toContain('"question"')
  })
  it.each(["refused", "invalid", "timeout", "bounds_exceeded", "rejected", "runner_lost", "failed"] as const)
    ("refuses a local %s outcome regardless of an exit-code story", async status => {
      const h = await setup()
      expect(() => captureLocalEscrowCompletion({ ...h, outcome: JobOutcome.make({ ...h.outcome, status }) }))
        .toThrow(/^escrow_local_completion_refused$/)
    })
  it("refuses actual input, output schema, refusal reason, listing, seller and agent mismatches", async () => {
    const h = await setup()
    for (const update of [{ input: { question: "changed" } }, { seller: h.context.client }, { providerAgentId: 9n },
      { outcome: JobOutcome.make({ ...h.outcome, stopReason: "refusal:policy" }) },
      { outcome: JobOutcome.make({ ...h.outcome, output: { error: "not the result" } }) },
      { listing: PublicListing.make({ ...h.listing, price: "$0.31" }) },
      { listing: PublicListing.make({ ...h.listing, version: "2.0.0" }) },
      { listing: PublicListing.make({ ...h.listing, rails: ["eip3009"] }) },
      { context: { ...h.context, call: { ...h.context.call, inputHash: hash(9) } } }]) {
      expect(() => captureLocalEscrowCompletion({ ...h, ...update })).toThrow(/^escrow_local_completion_refused$/)
    }
  })
  it("refuses accessors and private error details without invoking getters", async () => {
    const h = await setup(); let read = false
    const output = Object.defineProperty({}, "text", { enumerable: true, get() { read = true; return "private" } })
    expect(() => captureLocalEscrowCompletion({ ...h, outcome: JobOutcome.make({ ...h.outcome, output }) }))
      .toThrow(/^escrow_local_completion_refused$/)
    expect(read).toBe(false)
  })
  it("binds actual input schema, skill ID and execution timeout, not only price", async () => {
    const h = await setup(), input = { question: 1 }
    for (const update of [{ listing: PublicListing.make({ ...h.listing, id: "different" }) },
      { listing: PublicListing.make({ ...h.listing, bounds: Bounds.make({ timeoutSec: 61 }) }) },
      { input, context: { ...h.context, call: { ...h.context.call, inputHash: hashJson(input) } } }])
      expect(() => captureLocalEscrowCompletion({ ...h, ...update })).toThrow(/^escrow_local_completion_refused$/)
  })
  it("refuses empty/oversized output and invalid timestamps using unchanged core limits", async () => {
    const h = await setup()
    for (const output of [undefined, null, "", [], {}, { text: "x".repeat(MAX_OUTPUT_CHARS + 1) }])
      expect(() => captureLocalEscrowCompletion({ ...h, outcome: JobOutcome.make({ ...h.outcome, output }) }))
        .toThrow(/^escrow_local_completion_refused$/)
    for (const update of [{ startedAtMs: -1 }, { finishedAtMs: 999 }, { finishedAtMs: NaN }])
      expect(() => captureLocalEscrowCompletion({ ...h, outcome: JobOutcome.make({ ...h.outcome, ...update }) }))
        .toThrow()
  })
  it("does not retain mutable source data or accept extra private manifest fields", async () => {
    const h = await setup(), output = { text: "first" }, source = { ...h, outcome: JobOutcome.make({ ...h.outcome, output }) }
    const proof = captureLocalEscrowCompletion(source), old = hashJson(output)
    output.text = "changed"; source.context.call.inputHash = hash(2); source.input.question = "changed"
    expect(proof.outputHash).toBe(old); expect(proof.context.call.inputHash).not.toBe(hash(2))
    expect(() => captureLocalEscrowCompletion({ ...h, listing: { ...h.listing, engine: { private: "private" } } }))
      .toThrow(/^escrow_local_completion_refused$/)
  })
})
