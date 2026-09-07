import { describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { captureUnifiedFundingPlan, delegateStatus, spendFromOwner, unifiedSpendParams,
  type UnifiedFundingDependencies, type UnifiedFundingEvent } from "../src/unified-balance-funding.ts"

const owner = `0x${"11".repeat(20)}`, delegate = `0x${"22".repeat(20)}`, txHash = `0x${"33".repeat(32)}`
const request = { owner, recipient: delegate, sourceChain: "Arc_Testnet", amount: "0.25" }
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.either(effect))
const setup = (status: unknown = "ready") => {
  const events: UnifiedFundingEvent[] = []
  const journal = { append: vi.fn(async (event: UnifiedFundingEvent) => { events.push(event) }) }
  const deps: UnifiedFundingDependencies = {
    delegateStatus: vi.fn(async () => status),
    spend: vi.fn(async () => ({ destinationChain: "Arc_Testnet", recipientAddress: delegate, txHash,
      allocations: [{ amount: "0.250000", chain: "Arc_Testnet", sourceAccount: owner }] })), journal
  }
  return { deps, events, journal }
}

describe("Unified Balance delegated funding policy", () => {
  it("captures exact six-decimal owner/source/destination terms before IO", () => {
    const input = { ...request }
    const plan = captureUnifiedFundingPlan(input)
    input.amount = "10"
    expect(plan).toMatchObject({ ...request, amount: "0.250000", destinationChain: "Arc_Testnet", token: "USDC" })
    expect(Object.isFrozen(plan)).toBe(true)
  })
  it.each(["Base", "base_sepolia", "Ethereum", 5042002, undefined])("refuses source %s", sourceChain => {
    expect(() => captureUnifiedFundingPlan({ ...request, sourceChain })).toThrow()
  })
  it.each(["0", "-1", "01", "1e-2", "0.0000001", " 0.25", "0.25\n", 0.25, "9".repeat(79)])("refuses amount %s", amount => {
    expect(() => captureUnifiedFundingPlan({ ...request, amount })).toThrow()
  })
  it.each(["0x" + "00".repeat(20), "0x123", owner])("requires a distinct nonzero delegate %s", recipient => {
    expect(() => captureUnifiedFundingPlan({ ...request, recipient })).toThrow()
  })
  it("does not run getters/coercion or accept unrelated flags", () => {
    const get = vi.fn(() => owner)
    expect(() => captureUnifiedFundingPlan({ ...request, get owner() { return get() } })).toThrow()
    expect(get).not.toHaveBeenCalled()
    expect(() => captureUnifiedFundingPlan({ ...request, maxTimeoutSeconds: 2592000 })).toThrow()
  })
  it.each(["Arc_Testnet", "Base_Sepolia"])("builds the pinned kit allocation shape for %s", sourceChain => {
    const adapter = Object.freeze({ fixture: true })
    const plan = captureUnifiedFundingPlan({ ...request, sourceChain })
    const params = unifiedSpendParams(plan, adapter)
    expect(params).toEqual({ token: "USDC", amount: "0.250000",
      from: { adapter, sourceAccount: owner, allocations: { chain: sourceChain, amount: "0.250000" } },
      to: { adapter, chain: "Arc_Testnet", recipientAddress: delegate } })
    expect(Object.isFrozen(params.from.allocations)).toBe(true)
    expect(params).not.toHaveProperty("config.retry")
    expect(params.to).not.toHaveProperty("useForwarder")
  })
  it.each(["none", "pending"])("does not spend while delegate is %s", async status => {
    const { deps, events } = setup(status)
    expect(await run(spendFromOwner(request, deps))).toMatchObject({ _tag: "Right", right: { status, plan: { owner } } })
    expect(deps.spend).not.toHaveBeenCalled()
    expect(events.map(e => e.stage)).toEqual(["planned", `delegate_${status}`])
  })
  it("checks source/owner/delegate explicitly with no spend", async () => {
    const read = vi.fn(async () => "ready")
    expect(await run(delegateStatus(owner, delegate, "Base_Sepolia", read))).toMatchObject({ _tag: "Right", right: "ready" })
    expect(read).toHaveBeenCalledExactlyOnceWith({ owner, delegate, sourceChain: "Base_Sepolia" })
  })
  it.each(["unknown", null, { status: "ready" }])("fails closed on malformed status %s", async status => {
    const { deps } = setup(status)
    expect(await run(spendFromOwner(request, deps))).toMatchObject({ _tag: "Left", left: { code: "read_unavailable" } })
    expect(deps.spend).not.toHaveBeenCalled()
  })
  it("journals intent before exactly one kit call; SDK return is not independent evidence", async () => {
    const { deps, events } = setup()
    const result = await run(spendFromOwner(request, { ...deps, spend: async plan => {
      expect(events.at(-1)).toMatchObject({ stage: "spend_intent", plan })
      return deps.spend(plan)
    } }))
    expect(result).toMatchObject({ _tag: "Right", right: { status: "sdk_returned", txHash } })
    expect(events.map(e => e.stage)).toEqual(["planned", "spend_intent", "sdk_returned"])
    expect(deps.spend).toHaveBeenCalledTimes(1)
  })
  it("refuses before any status read or spend when initial journal write fails", async () => {
    const { deps, journal } = setup()
    journal.append.mockRejectedValueOnce(new Error("private-provider-detail"))
    expect(await run(spendFromOwner(request, deps))).toMatchObject({ _tag: "Left", left: { code: "journal_unavailable" } })
    expect(deps.delegateStatus).not.toHaveBeenCalled()
    expect(deps.spend).not.toHaveBeenCalled()
  })
  it("refuses if intent cannot be durably recorded", async () => {
    const { deps, journal } = setup()
    journal.append.mockImplementation(async event => { if (event.stage === "spend_intent") throw new Error("secret") })
    expect(await run(spendFromOwner(request, deps))).toMatchObject({ _tag: "Left", left: { code: "journal_unavailable" } })
    expect(deps.spend).not.toHaveBeenCalled()
  })
  it("never retries after a thrown spend, and redacts the underlying error", async () => {
    const { deps, events } = setup()
    vi.mocked(deps.spend).mockRejectedValue(new Error("private-provider-detail"))
    const effect = spendFromOwner(request, deps)
    const first = await run(effect), second = await run(effect)
    expect(first).toMatchObject({ _tag: "Left", left: { code: "outcome_uncertain" } })
    expect(JSON.stringify(first)).not.toContain("private-provider-detail")
    expect(second).toMatchObject({ _tag: "Left", left: { code: "journal_consumed" } })
    expect(deps.spend).toHaveBeenCalledTimes(1)
    expect(events.at(-1)?.stage).toBe("uncertain")
  })
  it("serializes competing operations sharing a journal", async () => {
    const { deps } = setup()
    const results = await Promise.all([run(spendFromOwner(request, deps)), run(spendFromOwner(request, deps))])
    expect(results.filter(r => r._tag === "Right")).toHaveLength(1)
    expect(deps.spend).toHaveBeenCalledTimes(1)
  })
  it.each([
    { destinationChain: "Base" }, { recipientAddress: owner }, { txHash: "0x123" },
    { allocations: [{ amount: "0.3", chain: "Arc_Testnet", sourceAccount: owner }] },
    { allocations: [{ amount: "0.25", chain: "Base_Sepolia", sourceAccount: owner }] },
    { allocations: [] }
  ])("treats a mismatched SDK return as uncertain %s", async change => {
    const { deps, events } = setup()
    const base = await deps.spend(captureUnifiedFundingPlan(request))
    vi.mocked(deps.spend).mockResolvedValue({ ...base as object, ...change })
    expect(await run(spendFromOwner(request, deps))).toMatchObject({ _tag: "Left", left: { code: "outcome_uncertain" } })
    expect(events.at(-1)?.stage).toBe("uncertain")
  })
  it("projects only whitelisted public return fields", async () => {
    const { deps, events } = setup()
    const base = await deps.spend(captureUnifiedFundingPlan(request))
    vi.mocked(deps.spend).mockResolvedValue({ ...base as object, steps: [{ signature: "SECRET" }], secret: "SECRET" })
    const result = await run(spendFromOwner(request, deps))
    expect(result._tag).toBe("Right")
    expect(JSON.stringify({ result, events })).not.toContain("SECRET")
  })
  it("captures input before effect evaluation", async () => {
    const { deps } = setup(), mutable = { ...request }
    const effect = spendFromOwner(mutable, deps)
    mutable.amount = "100"
    expect(await run(effect)).toMatchObject({ _tag: "Right", right: { plan: { amount: "0.250000" } } })
  })
  it("keeps a successful SDK call uncertain when recording its result fails", async () => {
    const { deps, journal } = setup()
    journal.append.mockImplementation(async event => { if (event.stage === "sdk_returned") throw new Error("secret") })
    expect(await run(spendFromOwner(request, deps))).toMatchObject({ _tag: "Left", left: { code: "outcome_uncertain" } })
    expect(deps.spend).toHaveBeenCalledTimes(1)
  })
  it("returns a typed refusal for invalid input without invoking dependencies", async () => {
    const { deps } = setup()
    expect(await run(spendFromOwner({ ...request, amount: 0.25 }, deps))).toMatchObject({ _tag: "Left", left: { code: "input_invalid" } })
    expect(deps.journal.append).not.toHaveBeenCalled()
    expect(deps.delegateStatus).not.toHaveBeenCalled()
  })
})
