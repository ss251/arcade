import { describe, expect, it } from "vitest"
import { Effect, Fiber } from "effect"
import { makeErc8183Rail } from "../src/erc8183.ts"
import { escrowRequestDescription } from "../src/erc8183-request.ts"
import { captureEscrowPayment } from "../src/erc8183-wire.ts"
import type { EscrowActionJournal } from "../src/erc8183-executor.ts"
import { rpcFixture } from "./fixtures/erc8183-rpc.ts"
import { hash } from "./fixtures/erc8183-action.ts"
async function setup(stage: "budget" | "submit" | "reject" = "submit", overrides: Partial<EscrowActionJournal> = {}) {
  const h = await rpcFixture(stage, { capability: hash(77) }), c = h.f.context.call, events: string[] = []
  // Unit-only journal port; real SQLite durability is tested separately.
  const journal: EscrowActionJournal = { durability: "durable",
    claim: async () => { events.push("claim"); return undefined },
    matchSubmission: async () => false, intent: async () => {}, prepared: async () => {},
    attempt: async () => {}, confirmed: async () => {}, uncertain: async () => { events.push("uncertain") }, ...overrides }
  const config = { ...h.options, operationTimeoutMs: 30000, expiresInSeconds: 1800, journal,
    providerAuthorization: async () => { events.push("provider-signature")
      if (!("nonce" in h.f.input)) throw Error("unused")
      return { nonce: h.f.input.nonce, deadline: h.f.input.deadline, signature: h.f.input.signature } } }
  const rail = makeErc8183Rail(config)
  const input = { priceAtomic: c.amount, resource: c.resource, payTo: c.provider,
    escrow: { skillId: c.skillId, skillVersion: c.skillVersion, inputHash: c.inputHash,
      providerAgentId: c.providerAgentId, timeoutSeconds: c.timeoutSeconds } }
  const requirements = await Effect.runPromise(rail.challenge(input))
  const payment = captureEscrowPayment({ x402Version: 2, accepted: requirements, payload: { jobId: "7", capability: hash(77) } })
  h.f.snapshot.job.description = escrowRequestDescription(c, h.f.context.client, h.f.context.expiredAt, hash(77))
  return { h, rail, config, requirements, payment, input, events }
}
describe("guarded escrow Effect rail (fake chain; no live activation)", () => {
  it("challenges without IO and verifies a real capability commitment without retaining its secret", async () => {
    const h = await setup(); expect(h.h.calls).toHaveLength(0)
    const v = await Effect.runPromise(h.rail.verify(h.payment, h.requirements))
    expect(v).toMatchObject({ rail: "erc8183", stage: "funded", payer: h.h.f.context.client, amountAtomic: 300000n })
    expect(v.context.requestHash).toBe(h.h.f.snapshot.job.description.slice("arcade:erc8183:request:v1:".length))
    expect(Object.isFrozen(v)).toBe(true); expect(Object.isFrozen(v.context.call)).toBe(true)
    const publicText = JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x)
    expect(publicText).not.toContain(hash(77)); expect(publicText).not.toContain('"payload"')
    expect(h.h.acquisitions()).toBe(0); expect(h.events).toEqual([])
  })
  it("rejects changed current requirements before RPC and wrong capabilities without signing", async () => {
    const h = await setup(), changed = await Effect.runPromise(h.rail.challenge({ ...h.input, priceAtomic: 1n }))
    expect(await Effect.runPromise(Effect.flip(h.rail.verify(h.payment, changed)))).toMatchObject({ _tag: "InvalidSignature", reason: "Escrow request refused" })
    expect(h.h.calls).toHaveLength(0)
    expect(await Effect.runPromise(Effect.flip(h.rail.verify({ ...h.payment, payload: { jobId: "7", capability: hash(78) } }, h.requirements))))
      .toMatchObject({ _tag: "InvalidSignature", reason: "Escrow request refused" })
    expect(h.h.acquisitions()).toBe(0); expect(h.events).toEqual([])
  })
  it("brands verified values per factory and refuses copies before any action IO", async () => {
    const h = await setup(), v = await Effect.runPromise(h.rail.verify(h.payment, h.requirements))
    const n = h.h.calls.length, other = makeErc8183Rail(h.config)
    for (const attempt of [Effect.asVoid(h.rail.submit({ ...v }, hash(9))), Effect.asVoid(other.reject(v, "timeout")), Effect.asVoid(h.rail.settle(v))]) {
      expect(await Effect.runPromise(Effect.flip(attempt))).toMatchObject({ _tag: "SettlementFailed", reason: "Escrow action refused before dispatch" })
    }
    expect(h.h.calls).toHaveLength(n); expect(h.events).toEqual([])
  })
  it("keeps budget verification separate from funded verification and inference authority", async () => {
    const h = await setup("budget"), v = await Effect.runPromise(h.rail.verifyBudget(h.payment, h.requirements))
    expect(v.stage).toBe("budget")
    expect(await Effect.runPromise(Effect.flip(h.rail.verify(h.payment, h.requirements)))).toMatchObject({ _tag: "InvalidSignature" })
    expect(await Effect.runPromise(Effect.flip(h.rail.budget(v)))).toMatchObject({ reason: "Escrow action refused before dispatch" })
    expect(h.events).toEqual(["claim"]); expect(h.h.acquisitions()).toBe(0)
  })
  it("refuses unsafe configuration eagerly without acquiring a signer", async () => {
    const h = await setup()
    for (const update of [{ journal: { ...h.config.journal, durability: "volatile" } }, { operationTimeoutMs: 300001 },
      { operationTimeoutMs: 0 }, { expiresInSeconds: NaN }, { gasCapWei: 0n }]) {
      expect(() => makeErc8183Rail({ ...h.config, ...update } as typeof h.config)).toThrow("escrow_rail_unavailable")
    }
    expect(h.h.acquisitions()).toBe(0)
  })
  it.each(["budget", "submit", "reject"] as const)("returns independently decoded %s proof through the concrete executor", async kind => {
    const h = await setup(kind, { claim: async () => ({ id: "unit-claim" }) })
    const proof = kind === "budget" ? await Effect.runPromise(h.rail.budget(await Effect.runPromise(h.rail.verifyBudget(h.payment, h.requirements)))) :
      kind === "submit" ? await Effect.runPromise(h.rail.submit(await Effect.runPromise(h.rail.verify(h.payment, h.requirements)), hash(9))) :
        await Effect.runPromise(h.rail.reject(await Effect.runPromise(h.rail.verify(h.payment, h.requirements)), "output_invalid"))
    expect(proof).toMatchObject({ kind, txHash: h.h.f.signed.hash, refundAtomic: kind === "reject" ? 300000n : 0n })
    expect(h.h.calls.filter(c => c.method === "eth_sendRawTransaction")).toHaveLength(1)
    expect(h.h.acquisitions()).toBe(1)
  })
  it("keeps claimed send ambiguity distinct and never automatically sends a rejection", async () => {
    const h = await setup("submit", { claim: async () => ({ id: "unit-claim" }) }), dispatched: string[] = []
    const fetch = (async (url, init) => {
      const body = JSON.parse(String(init?.body))
      if (body.method === "eth_sendRawTransaction") { dispatched.push(body.method); throw Error("private-provider-diagnostic") }
      return h.config.fetch(url, init)
    }) as typeof globalThis.fetch
    const rail = makeErc8183Rail({ ...h.config, fetch }), v = await Effect.runPromise(rail.verify(h.payment, h.requirements))
    const error = await Effect.runPromise(Effect.flip(rail.submit(v, hash(9))))
    expect(error).toMatchObject({ reason: "Escrow action outcome uncertain; reconciliation required" })
    expect(JSON.stringify(error)).not.toContain("private-provider-diagnostic")
    expect(dispatched).toHaveLength(1); expect(h.events).toContain("uncertain")
  })
  it("interrupts read-only verification without a late verified result or key read", async () => {
    const h = await setup(); let start!: () => void, stopped = false
    const started = new Promise<void>(resolve => { start = resolve })
    const fetch = (async (_url, init) => {
      start()
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => { stopped = true; reject(Error("stopped")) }, { once: true }))
    }) as typeof globalThis.fetch
    const rail = makeErc8183Rail({ ...h.config, fetch })
    const fiber = Effect.runFork(rail.verify(h.payment, h.requirements)); await started
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(stopped).toBe(true); expect(h.h.acquisitions()).toBe(0); expect(h.events).toEqual([])
  })
  it("awaits claimed-action uncertainty cleanup when Effect is interrupted", async () => {
    let start!: () => void, cleanup!: () => void, release!: () => void, finished = false
    const started = new Promise<void>(resolve => { start = resolve }), cleaning = new Promise<void>(resolve => { cleanup = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    const h = await setup("submit", { claim: async () => ({ id: "unit-claim" }), uncertain: async () => { cleanup(); await barrier } })
    const rail = makeErc8183Rail({ ...h.config, providerAuthorization: async () => { start(); return new Promise(() => {}) } })
    const v = await Effect.runPromise(rail.verify(h.payment, h.requirements)), fiber = Effect.runFork(rail.submit(v, hash(9)))
    await started
    const interrupt = Effect.runPromise(Fiber.interrupt(fiber)).then(() => { finished = true })
    await cleaning; expect(finished).toBe(false); release(); await interrupt
    expect(finished).toBe(true); expect(h.h.sent()).toBe(false); expect(h.h.acquisitions()).toBe(0)
  })
  it.each(["skillId", "skillVersion", "inputHash", "providerAgentId", "timeoutSeconds"] as const)
    ("rejects a current %s changed from the funded capability commitment", async field => {
      const h = await setup(), replacements = { skillId: "other", skillVersion: "2.0.0", inputHash: hash(98), providerAgentId: 9n, timeoutSeconds: 61 }
      const terms = await Effect.runPromise(h.rail.challenge({ ...h.input, escrow: { ...h.input.escrow, [field]: replacements[field] } }))
      expect(await Effect.runPromise(Effect.flip(h.rail.verify({ ...h.payment, accepted: terms }, terms))))
        .toMatchObject({ _tag: "InvalidSignature" })
      expect(h.h.acquisitions()).toBe(0); expect(h.events).toEqual([])
    })
  it("rejects a non-EOA provider at read-only verification before inference or signing", async () => {
    const h = await setup(), fetch = (async (url, init) => {
      const body = JSON.parse(String(init?.body))
      if (body.method === "eth_getCode" && body.params[0] === h.h.f.context.call.provider)
        return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x1234" })
      return h.config.fetch(url, init)
    }) as typeof globalThis.fetch
    const rail = makeErc8183Rail({ ...h.config, fetch })
    expect(await Effect.runPromise(Effect.flip(rail.verify(h.payment, h.requirements)))).toMatchObject({ _tag: "InvalidSignature" })
    expect(h.h.acquisitions()).toBe(0); expect(h.events).toEqual([])
  })
  it("validates actual receipt fields and tree shape before journal or RPC", async () => {
    const h = await setup(), v = await Effect.runPromise(h.rail.verify(h.payment, h.requirements)), reads = h.h.calls.length
    const context = { hubJobId: "job_" + "a".repeat(32), outputHash: hash(9) }
    for (const operation of [h.rail.settle(v, undefined, { ...context, outputHash: hash(0) }),
      h.rail.settle(v, { treeHash: hash(0), childCount: 1, childTotalAtomic: 1n }, context),
      h.rail.settle(v, undefined, { ...context, hubJobId: "missing-prefix" })]) {
      expect(await Effect.runPromise(Effect.flip(operation))).toMatchObject({ reason: "Escrow action refused before dispatch" })
    }
    expect(h.events).toEqual([]); expect(h.h.calls).toHaveLength(reads)
  })
})
