import { describe, expect, it } from "vitest"
import { hashTypedData } from "viem"
import { assertEscrowProviderSignature, captureEscrowProviderIntent, decodeEscrowProviderIntent,
  encodeEscrowProviderIntent, escrowProviderContextHash, escrowProviderTypedData } from "../src/erc8183-provider-intent.ts"
import { setBudgetAuthorization, submitAuthorization } from "../src/erc8183-auth.ts"
import { fixture, hash } from "./fixtures/erc8183-action.ts"
async function intent(kind: "budget" | "submit" = "budget") {
  const f = await fixture(kind)
  return { f, i: captureEscrowProviderIntent({ requestId: hash(101), context: f.context, kind, issuedAt: 1000,
    nonce: 2n, deadline: 1600n, hubJobId: kind === "submit" ? "job_" + "a".repeat(32) : null,
    outputHash: kind === "submit" ? hash(9) : null }) }
}
describe("captured provider signing intent, not authority", () => {
  it.each(["budget", "submit"] as const)("matches the existing %s authorization and independent fixture signature", async kind => {
    const { f, i } = await intent(kind), c = i.context.call
    const base = { chainId: 5042002, escrow: c.escrow, signer: c.provider, jobId: i.context.jobId, nonce: 2n, deadline: 1600n }
    const expected = kind === "budget" ? setBudgetAuthorization({ ...base, token: c.token, amount: c.amount }, 1000) :
      submitAuthorization({ ...base, deliverable: hash(9) }, 1000)
    expect(hashTypedData(escrowProviderTypedData(i))).toBe(hashTypedData(expected))
    if (!("signature" in f.input)) throw Error("fixture")
    expect(await assertEscrowProviderSignature(i, f.input.signature)).toBe(f.input.signature.toLowerCase())
    await expect(assertEscrowProviderSignature({ ...i, context: { ...i.context, jobId: 8n } }, f.input.signature))
      .rejects.toThrow("escrow_facts_refused")
  })
  it("roundtrips frozen complete context and uint72/uint256 values without precision loss", async () => {
    const { i } = await intent("submit"), input = { ...i, nonce: (1n << 72n) - 1n,
      context: { ...i.context, jobId: (1n << 256n) - 1n, call: { ...i.context.call, providerAgentId: (1n << 256n) - 1n } } }
    const json = encodeEscrowProviderIntent(input), decoded = decodeEscrowProviderIntent(json)
    expect(decoded).toEqual(input); expect(Object.isFrozen(decoded)).toBe(true)
    expect(Object.isFrozen(decoded.context.call)).toBe(true)
    expect(encodeEscrowProviderIntent(decoded)).toBe(json)
    expect(json).not.toContain("$uint")
    input.context.call.skillVersion = "2.0.0"
    expect(decoded.context.call.skillVersion).toBe("1.0.0")
    expect(escrowProviderContextHash(decoded.context)).not.toBe(escrowProviderContextHash(input.context))
  })
  it("rejects noncanonical storage, unknown fields, malformed or widened issuance bounds", async () => {
    const { i } = await intent(), json = encodeEscrowProviderIntent(i), parsed = JSON.parse(json)
    for (const bad of [" " + json, JSON.stringify({ ...parsed, nonce: "02" }),
      JSON.stringify({ ...parsed, protocol: "different" }), JSON.stringify({ ...parsed, extra: "forbidden" }),
      JSON.stringify({ ...parsed, context: { ...parsed.context, jobId: "07" } })]) {
      expect(() => decodeEscrowProviderIntent(bad)).toThrow()
    }
    for (const delta of [{ deadline: 1601n }, { deadline: 1599n }, { nonce: 1n << 72n }, { requestId: hash(0) },
      { kind: "complete" }, { issuedAt: 1000.5 }, { outputHash: hash(9) }, { capability: hash(1) }]) {
      expect(() => captureEscrowProviderIntent({ ...i, ...delta })).toThrow("escrow_facts_refused")
    }
    expect(() => encodeEscrowProviderIntent({ ...i, context: { ...i.context, call: { ...i.context.call, amount: (1n << 256n) - 1n } } }))
      .toThrow("escrow_facts_refused")
  })
  it("does not invoke accessors or allow a submit without a real hub-job/output binding", async () => {
    const { i } = await intent("submit"); let getters = 0
    expect(() => captureEscrowProviderIntent({ ...i, get outputHash() { getters++; return hash(9) } }))
      .toThrow("escrow_facts_refused")
    expect(getters).toBe(0)
    for (const delta of [{ hubJobId: null }, { hubJobId: "job_short" }, { outputHash: null }, { outputHash: hash(0) }]) {
      expect(() => captureEscrowProviderIntent({ ...i, ...delta })).toThrow("escrow_facts_refused")
    }
  })
})
