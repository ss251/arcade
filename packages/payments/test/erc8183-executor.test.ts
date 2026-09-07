import { describe, expect, it } from "vitest"
import { createEscrowExecutor, type EscrowExecutorDependencies } from "../src/erc8183-executor.ts"
import { fixture, hash } from "./fixtures/erc8183-action.ts"
async function harness(kind: "budget" | "submit" | "complete" | "reject" = "complete") {
  const f = await fixture(kind), events: string[] = [], controller = new AbortController()
  const point = (name: string) => { events.push(name) }
  let duplicate = false
  const deps: EscrowExecutorDependencies = {
    signal: controller.signal, deadlineMs: performance.now() + 30000, nowSeconds: () => 1000,
    identity: { escrow: f.context.call.escrow, hook: f.context.call.hook, evaluator: f.context.call.evaluator,
      token: f.context.call.token, treasury: f.context.treasury },
    readJob: async () => { point("snapshot"); return f.snapshot },
    readJobAt: async () => { point("poststate"); return f.after },
    providerCode: async () => { point("provider-code"); return "0x" },
    providerNonceUsed: async () => { point("provider-nonce"); return false },
    providerAuthorization: async () => { point("provider-signature");
      if (!("nonce" in f.input)) throw Error("unused for evaluator-only action")
      return { nonce: f.input.nonce, deadline: f.input.deadline, signature: f.input.signature }
    },
    nonceState: async () => { point("sender-nonce"); return { latest: 3, pending: 3 } },
    transactionTerms: async () => { point("terms"); return f.terms },
    signTransaction: async () => { point("sign"); return f.raw },
    broadcast: async () => { point("broadcast"); return f.signed.hash },
    readReceipt: async () => { point("receipt"); return f.receipt },
    readTransaction: async () => { point("transaction"); return f.mined },
    journal: {
      durability: "durable",
      claim: async () => { point("claim"); return duplicate ? undefined : { id: "fixture-claim" } },
      matchSubmission: async () => { point("submission"); return true },
      intent: async () => { point("intent") },
      prepared: async () => { point("prepared") },
      attempt: async () => { point("attempt") },
      confirmed: async () => { point("confirmed") },
      uncertain: async () => { point("uncertain") }
    }
  }
  const operation = kind === "budget" ? { kind } : kind === "submit" ? { kind, outputHash: f.action.outputHash } : f.input
  return { f, events, controller, deps, operation, duplicate: () => { duplicate = true } }
}
describe("guarded escrow executor ordering (fake chain/journal, no durability claim)", () => {
  it.each(["budget", "submit", "reject"] as const)("executes exactly one %s with the expected provider-signing boundary", async kind => {
    const h = await harness(kind), result = await createEscrowExecutor(h.deps).execute(h.f.context, h.operation)
    expect(result.kind).toBe(kind)
    expect(h.events.filter(e => e === "broadcast")).toHaveLength(1)
    expect(h.events.filter(e => e === "provider-signature")).toHaveLength(kind === "reject" ? 0 : 1)
    if (kind !== "reject") expect(h.events.indexOf("claim")).toBeLessThan(h.events.indexOf("provider-signature"))
  })
  it("reserves, persists exact intent and signed hash, attempts once, and confirms independent evidence", async () => {
    const h = await harness(), result = await createEscrowExecutor(h.deps).execute(h.f.context, h.operation)
    expect(result).toMatchObject({ kind: "complete", txHash: h.f.signed.hash, sellerAtomic: 285000n, feeAtomic: 15000n })
    const at = (name: string) => h.events.indexOf(name)
    expect(at("claim")).toBeLessThan(at("sign"))
    expect(at("intent")).toBeLessThan(at("sign"))
    expect(at("sign")).toBeLessThan(at("prepared"))
    expect(at("prepared")).toBeLessThan(at("attempt"))
    expect(at("attempt")).toBeLessThan(at("broadcast"))
    expect(at("poststate")).toBeLessThan(at("confirmed"))
    expect(h.events.filter(e => e === "snapshot").length).toBeGreaterThanOrEqual(2)
    expect(h.events.filter(e => e === "broadcast")).toHaveLength(1)
    expect(h.events).not.toContain("uncertain")
  })
  it("refuses volatile journals and duplicate claims without requesting a signature or sending", async () => {
    const h = await harness()
    expect(() => createEscrowExecutor({ ...h.deps, journal: { ...h.deps.journal, durability: "volatile" } }))
      .toThrow("escrow_executor_unavailable")
    h.duplicate()
    await expect(createEscrowExecutor(h.deps).execute(h.f.context, h.operation)).rejects.toThrow("escrow_execution_refused")
    expect(h.events).toEqual(["claim"])
  })
  it.each(["intent", "prepared", "attempt"] as const)("never broadcasts after a %s persistence failure", async point => {
    const h = await harness()
    const journal = { ...h.deps.journal, [point]: async () => { h.events.push(point); throw Error("private storage failure") } }
    await expect(createEscrowExecutor({ ...h.deps, journal }).execute(h.f.context, h.operation))
      .rejects.toThrow(/^escrow_execution_uncertain$/)
    expect(h.events).not.toContain("broadcast")
    expect(h.events).toContain("uncertain")
  })
  it("does not retry or reject when a broadcast result is unknown or its returned hash differs", async () => {
    for (const wrongHash of [false, true]) {
      const h = await harness()
      const broadcast = async () => { h.events.push("broadcast"); if (wrongHash) return hash(9); throw Error("private upstream ambiguity") }
      await expect(createEscrowExecutor({ ...h.deps, broadcast }).execute(h.f.context, h.operation))
        .rejects.toThrow(/^escrow_execution_uncertain$/)
      expect(h.events.filter(e => e === "broadcast")).toHaveLength(1)
      expect(h.events).not.toContain("confirmed")
      expect(h.events).toContain("uncertain")
    }
  })
  it("refuses a changed sender nonce, delegated provider code, or unbound Submit output before signing", async () => {
    for (const change of ["nonce", "code", "submission"]) {
      const h = await harness()
      const deps = { ...h.deps,
        ...(change === "nonce" ? { nonceState: async () => ({ latest: 3, pending: 4 }) } : {}),
        ...(change === "code" ? { providerCode: async () => "0x01" as const } : {}),
        ...(change === "submission" ? { journal: { ...h.deps.journal, matchSubmission: async () => false } } : {}) }
      await expect(createEscrowExecutor(deps).execute(h.f.context, h.operation)).rejects.toThrow("escrow_execution_uncertain")
      expect(h.events).not.toContain("sign")
      expect(h.events).not.toContain("broadcast")
    }
  })
  it("refuses a late nonce change or cancellation after journaling the signed intent", async () => {
    for (const abort of [false, true]) {
      const h = await harness(); let prepared = false
      const journal = { ...h.deps.journal, prepared: async () => { prepared = true; if (abort) h.controller.abort() } }
      const nonceState = async () => ({ latest: 3, pending: prepared ? 4 : 3 })
      await expect(createEscrowExecutor({ ...h.deps, journal, nonceState }).execute(h.f.context, h.operation))
        .rejects.toThrow("escrow_execution_uncertain")
      expect(h.events).not.toContain("broadcast")
    }
  })
  it("retains uncertainty if confirmation or its durable record fails", async () => {
    for (const malformed of [false, true]) {
      const h = await harness()
      const deps = { ...h.deps, ...(malformed ? { readReceipt: async () => ({ ...h.f.receipt, logs: [] }) } :
        { journal: { ...h.deps.journal, confirmed: async () => { throw Error("private commit failure") } } }) }
      await expect(createEscrowExecutor(deps).execute(h.f.context, h.operation)).rejects.toThrow("escrow_execution_uncertain")
      expect(h.events.filter(e => e === "broadcast")).toHaveLength(1)
      expect(h.events).toContain("uncertain")
    }
  })
  it("bounds an unresolved claim and never continues after its late completion", async () => {
    const h = await harness(); let release!: (claim: { id: string }) => void
    const journal = { ...h.deps.journal, claim: () => new Promise<{ id: string }>(resolve => { release = resolve }) }
    const executor = createEscrowExecutor({ ...h.deps, deadlineMs: performance.now() + 25, journal })
    await expect(executor.execute(h.f.context, h.operation)).rejects.toThrow("escrow_execution_uncertain")
    release({ id: "late-durable-reservation" }); await Promise.resolve()
    expect(h.events).toEqual([])
    await expect(executor.execute(h.f.context, h.operation)).rejects.toThrow("escrow_execution_refused")
  })
  it("refuses used provider nonces and authorization expiry during the final read", async () => {
    for (const used of [true, false]) {
      const h = await harness("submit"); let n = 1000, reads = 0
      const deps = { ...h.deps, nowSeconds: () => n, providerNonceUsed: async () => used,
        nonceState: async () => { if (++reads === 2) n = 1600; return { latest: 3, pending: 3 } } }
      await expect(createEscrowExecutor(deps).execute(h.f.context, h.operation)).rejects.toThrow("escrow_execution_uncertain")
      expect(h.events).not.toContain("broadcast")
      if (used) expect(h.events).not.toContain("sign")
    }
  })
  it("captures operation fields without getters and refuses before claiming", async () => {
    const h = await harness(); let invoked = false
    const operation = { kind: "complete", get receipt() { invoked = true; return h.f.input } }
    await expect(createEscrowExecutor(h.deps).execute(h.f.context, operation)).rejects.toThrow("escrow_execution_refused")
    expect(invoked).toBe(false); expect(h.events).toEqual([])
  })
  it("refuses an already canceled invocation without claiming or reporting an ambiguous claim", async () => {
    const h = await harness(); h.controller.abort()
    await expect(createEscrowExecutor(h.deps).execute(h.f.context, h.operation)).rejects.toThrow("escrow_execution_refused")
    expect(h.events).toEqual([])
  })
})
