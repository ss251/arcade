import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import type { AgentAnnouncement } from "@arcade/core"
import { Erc8004Failed, noopErc8004, verifyAgentClaims, type Erc8004 } from "../src/erc8004.ts"

const SELLER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
const OTHER = "0x1111111111111111111111111111111111111111"
const HASH = `0x${"a".repeat(64)}`
const claim = (skillId = "skill-aa", agentId = "1") => ({ skillId, agentId, registrationTx: HASH })
const unsafe = (values: readonly unknown[]) => values as ReadonlyArray<AgentAnnouncement>
const svc = (ownerOf: Erc8004["ownerOf"]): Erc8004 => ({ ...noopErc8004("off"), armed: true, ownerOf })
const run = Effect.runPromise
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe("bounded ownerOf verification", () => {
  it("keeps a proven owner case-insensitively without claiming the mint transaction was checked", async () => {
    const out = await run(verifyAgentClaims(svc(() => Effect.succeed(SELLER.toUpperCase().replace("0X", "0x"))), SELLER, unsafe([claim()])))
    expect(out.get("skill-aa")).toEqual({ agentId: "1", registrationTx: HASH, agentVerified: true })
  })
  it("drops a definitively wrong owner", async () => {
    expect((await run(verifyAgentClaims(svc(() => Effect.succeed(OTHER)), SELLER, unsafe([claim()])))).size).toBe(0)
  })
  it.each([() => new Erc8004Failed({ op: "owner", reason: "PRIVATE_RPC_KEY" }),
    () => { throw new Error("PRIVATE_SYNC") }, () => Effect.die("PRIVATE_DEFECT"), () => Effect.succeed("PRIVATE_NOT_AN_ADDRESS")])(
    "keeps unreadable claims explicitly unverified without private diagnostics", async ownerOf => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const out = await run(verifyAgentClaims(svc(ownerOf), SELLER, unsafe([claim()])))
      expect(out.get("skill-aa")?.agentVerified).toBe(false)
      expect(JSON.stringify([...out, warn.mock.calls])).not.toContain("PRIVATE")
    })
  it("does not read on an unarmed hub", async () => {
    const ownerOf = vi.fn(() => Effect.succeed(SELLER))
    expect((await run(verifyAgentClaims({ ...svc(ownerOf), armed: false }, SELLER, unsafe([claim()])))).size).toBe(0)
    expect(ownerOf).not.toHaveBeenCalled()
  })
  it("rejects malformed injected plain objects before any registry call", async () => {
    const ownerOf = vi.fn(() => Effect.succeed(SELLER))
    for (const bad of [{ ...claim(), agentId: "01" }, { ...claim(), agentId: (1n << 256n).toString() },
      { ...claim(), skillId: "../bad" }, { ...claim(), registrationTx: "0xreg" }, null, 1]) {
      expect((await run(verifyAgentClaims(svc(ownerOf), SELLER, unsafe([claim(), bad])))).size).toBe(0)
    }
    expect(ownerOf).not.toHaveBeenCalled()
  })
  it("does not invoke claim accessors or accept inherited fields", async () => {
    let calls = 0
    const getter = Object.defineProperty({ ...claim() }, "agentId", { get() { calls++; return "1" } })
    const ownerOf = vi.fn(() => Effect.succeed(SELLER))
    for (const value of [getter, Object.create(claim())]) expect((await run(verifyAgentClaims(svc(ownerOf), SELLER, unsafe([value])))).size).toBe(0)
    expect(calls).toBe(0); expect(ownerOf).not.toHaveBeenCalled()
  })
  it("drops all ambiguous duplicate skill claims rather than choosing one", async () => {
    const ownerOf = vi.fn(() => Effect.succeed(SELLER))
    const out = await run(verifyAgentClaims(svc(ownerOf), SELLER, unsafe([claim(), claim("skill-aa", "2"), claim("skill-bb", "3")])))
    expect([...out.keys()]).toEqual(["skill-bb"]); expect(ownerOf).toHaveBeenCalledTimes(1)
  })
  it("deduplicates owner reads across skills sharing the same agent", async () => {
    const ownerOf = vi.fn(() => Effect.succeed(SELLER))
    const out = await run(verifyAgentClaims(svc(ownerOf), SELLER, unsafe([claim(), claim("skill-bb")])))
    expect(out.size).toBe(2); expect(ownerOf).toHaveBeenCalledTimes(1)
  })
  it("caps the array and unique reads, leaving unqueried claims unverified", async () => {
    const ownerOf = vi.fn(() => Effect.succeed(SELLER))
    const many = Array.from({ length: 20 }, (_, n) => claim(`skill-${n}`, String(n)))
    const out = await run(verifyAgentClaims(svc(ownerOf), SELLER, unsafe(many)))
    expect(out.size).toBe(20); expect(ownerOf).toHaveBeenCalledTimes(16)
    expect(out.get("skill-19")?.agentVerified).toBe(false)
    ownerOf.mockClear()
    expect((await run(verifyAgentClaims(svc(ownerOf), SELLER, unsafe(Array(65).fill(claim()))))).size).toBe(0)
    expect(ownerOf).not.toHaveBeenCalled()
  })
  it("finishes a stalled verification by the overall deadline", async () => {
    vi.useFakeTimers()
    const ownerOf = vi.fn(() => Effect.never)
    const result = run(verifyAgentClaims(svc(ownerOf), SELLER, unsafe(Array.from({ length: 16 }, (_, n) => claim(`skill-${n}`, String(n))))))
    await vi.advanceTimersByTimeAsync(5_100)
    const out = await result
    expect(out.size).toBe(16); expect([...out.values()].every(value => value.agentVerified === false)).toBe(true)
    expect(ownerOf.mock.calls.length).toBeLessThanOrEqual(6)
  })
})
