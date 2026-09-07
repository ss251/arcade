import { describe, expect, expectTypeOf, it } from "vitest"
import { Schema } from "effect"
import { buildEscrowRequirements, captureEscrowPayment, captureEscrowRequirements } from "../src/erc8183-wire.ts"
import { PaymentPayload, type VerifiedPayment } from "../src/types.ts"
import type { Rail } from "../src/rail.ts"
import type { EscrowPaymentPayload, EscrowCompletionContext } from "../src/erc8183-wire.ts"
import { rpcFixture } from "./fixtures/erc8183-rpc.ts"
import { hash } from "./fixtures/erc8183-action.ts"
async function setup() {
  const f = await rpcFixture(), c = f.f.context.call
  const input = { priceAtomic: c.amount, resource: c.resource, payTo: c.provider, description: "Fixture skill",
    escrow: { skillId: c.skillId, skillVersion: c.skillVersion, inputHash: c.inputHash,
      providerAgentId: c.providerAgentId, timeoutSeconds: c.timeoutSeconds } }
  return { f, input, requirements: buildEscrowRequirements(f.identity, input, 1800) }
}
describe("separate closed escrow wire (existing exact schema unchanged)", () => {
  it("preserves exact rail generic defaults and supports an explicit escrow contract", () => {
    expectTypeOf<Parameters<Rail["verify"]>[0]>().toEqualTypeOf<PaymentPayload>()
    expectTypeOf<Parameters<Rail["settle"]>[0]>().toEqualTypeOf<VerifiedPayment>()
    expectTypeOf<Parameters<Rail["settle"]>[2]>().toEqualTypeOf<undefined>()
    type Example = Rail<EscrowPaymentPayload, { rail: "erc8183" }, EscrowCompletionContext>
    expectTypeOf<Parameters<Example["verify"]>[0]>().toEqualTypeOf<EscrowPaymentPayload>()
    expectTypeOf<Parameters<Example["settle"]>[2]>().toEqualTypeOf<EscrowCompletionContext | undefined>()
  })
  it("roundtrips request-bound metadata and a capability without dummy exact fields", async () => {
    const h = await setup(), parsed = captureEscrowRequirements(JSON.parse(JSON.stringify(h.requirements)))
    expect(parsed.call).toEqual(h.f.f.context.call)
    expect(parsed.expiresInSeconds).toBe(1800)
    const payment = captureEscrowPayment({ x402Version: 2, accepted: h.requirements, payload: { jobId: "7", capability: hash(77) } })
    expect(payment.payload).toEqual({ jobId: "7", capability: hash(77) })
    expect(Object.isFrozen(payment.payload)).toBe(true)
    expect(Schema.is(PaymentPayload)(payment)).toBe(false)
    expect("authorization" in payment.payload).toBe(false)
  })
  it("requires real trusted request context and explicit adequate new-job lifetime", async () => {
    const h = await setup()
    const { escrow: _context, ...withoutContext } = h.input
    expect(() => buildEscrowRequirements(h.f.identity, withoutContext, 1800)).toThrow("escrow_facts_refused")
    expect(() => buildEscrowRequirements(h.f.identity, h.input, 659)).toThrow("escrow_facts_refused")
    expect(() => buildEscrowRequirements(h.f.identity, h.input, NaN)).toThrow("escrow_facts_refused")
  })
  it("refuses legacy/dummy authorization, unknown metadata and claimed payer", async () => {
    const h = await setup(), base = { x402Version: 2, accepted: h.requirements, payload: { jobId: "7", capability: hash(77) } }
    for (const payload of [{ jobId: "7" }, { ...base.payload, payer: h.f.f.context.client },
      { ...base.payload, authorization: {} }, { ...base.payload, signature: "0x" }]) {
      expect(() => captureEscrowPayment({ ...base, payload })).toThrow("escrow_facts_refused")
    }
    expect(() => captureEscrowRequirements({ ...h.requirements, extra: { ...h.requirements.extra, unknown: true } }))
      .toThrow("escrow_facts_refused")
    expect(() => captureEscrowRequirements({ ...h.requirements, scheme: "exact" })).toThrow("escrow_facts_refused")
    expect(() => captureEscrowRequirements({ ...h.requirements, maxTimeoutSeconds: 1800 })).toThrow("escrow_facts_refused")
  })
  it("never invokes getters and binds an optional resource descriptor to the same URL", async () => {
    const h = await setup(); let invoked = false
    const hostile = { ...h.requirements, get amount() { invoked = true; return "300000" } }
    expect(() => captureEscrowRequirements(hostile)).toThrow("escrow_facts_refused"); expect(invoked).toBe(false)
    const base = { x402Version: 2, accepted: h.requirements, payload: { jobId: "7", capability: hash(77) } }
    expect(captureEscrowPayment({ ...base, resource: { url: h.requirements.resource } }).resource?.url).toBe(h.requirements.resource)
    expect(() => captureEscrowPayment({ ...base, resource: { url: "https://example.test/other" } })).toThrow("escrow_facts_refused")
  })
  it.each(["0", "01", "-1", "1e3", "9".repeat(79)])("rejects noncanonical or invalid price %s", async amount => {
    const h = await setup()
    expect(() => captureEscrowRequirements({ ...h.requirements, amount })).toThrow("escrow_facts_refused")
  })
  it("captures deep metadata and capability independently of later source mutation", async () => {
    const h = await setup(), source = JSON.parse(JSON.stringify(h.requirements))
    const captured = captureEscrowRequirements(source)
    source.extra.request.inputHash = hash(99); source.extra.providerAgentId = "900"
    expect(captured.call.inputHash).toBe(h.f.f.context.call.inputHash)
    expect(captured.call.providerAgentId).toBe(h.f.f.context.call.providerAgentId)
    expect(Object.isFrozen(captured.requirements.extra)).toBe(true)
    expect(Object.isFrozen(captured.requirements.extra["request"])).toBe(true)
  })
  it("rejects nested accessors, unknown resource fields and overflow metadata", async () => {
    const h = await setup(); let invoked = false
    const base = JSON.parse(JSON.stringify(h.requirements))
    Object.defineProperty(base.extra.request, "inputHash", { enumerable: true, get() { invoked = true; return hash(9) } })
    expect(() => captureEscrowRequirements(base)).toThrow("escrow_facts_refused"); expect(invoked).toBe(false)
    for (const extra of [{ ...h.requirements.extra, providerAgentId: (1n << 256n).toString() },
      { ...h.requirements.extra, expiresInSeconds: "1800" }, { ...h.requirements.extra, protocol: "other" }]) {
      expect(() => captureEscrowRequirements({ ...h.requirements, extra })).toThrow("escrow_facts_refused")
    }
    expect(() => captureEscrowPayment({ x402Version: 2, accepted: h.requirements,
      payload: { jobId: "7", capability: hash(77) }, resource: { url: h.requirements.resource, payer: "claimed" } }))
      .toThrow("escrow_facts_refused")
  })
})
