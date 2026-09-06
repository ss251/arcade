import { afterEach, describe, expect, it, vi } from "vitest"
import chain from "../../../config/chains/arc-testnet.json"
import { capturePurchasePart, createPurchaseConversation } from "../src/lib/purchase-conversation.ts"
import type { PurchaseView, runPurchase } from "../src/lib/purchase-run.ts"

const BUYER = `0x${"1".repeat(40)}`, SELLER = `0x${"3".repeat(40)}`
const resource = `/x/${SELLER}/diff-triage`
const context = () => ({ hubOrigin: "https://hub.example", skillId: "diff-triage", seller: SELLER, resource,
  amountAtomic: "10000", payTo: SELLER, asset: chain.usdc.address, network: chain.caip2, rail: "eip3009",
  requirements: { scheme: "exact", network: chain.caip2, amount: "10000", asset: chain.usdc.address,
    payTo: SELLER, resource: "https://hub.example" + resource, maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" } } })
const part = (id = "call_1", state = "approval-requested") => ({ type: "tool-arcade_call_skill", toolCallId: id, state,
  input: { skillId: "diff-triage", maxAmountUsd: "$0.02", input: '{"diff":"private input"}' },
  approval: { id: "approval_" + id, ...(state === "approval-requested" ? {} : { approved: true }) },
  ...(state === "output-available" ? { output: { awaitingSignature: true, toolCallId: id, skillId: "diff-triage" } } : {}) })
const wallet = () => ({ buyer: BUYER, provider: { request: vi.fn(async () => undefined) } })
const setup = (initial: unknown = []) => {
  const updates: { id: string; view: Readonly<PurchaseView> }[] = []
  const run = vi.fn<typeof runPurchase>(async (scope, token, binding, _wallet, _options, update) => {
    expect(scope.consume(token, binding)).toMatchObject({ skillId: "diff-triage", inputJson: '{"diff":"private input"}' })
    const result = { phase: "unconfirmed" as const, message: "Fixed fixture result" }
    update?.(result); return result
  })
  const owner = createPurchaseConversation(initial, (id, view) => updates.push({ id, view }), run)
  return { owner, run, updates }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe("private conversation approval lifecycle", () => {
  it("captures the original input and IDs, never signing coordinates from tool output", () => {
    const p = part("call_1", "output-available"), call = capturePurchasePart(p)!
    expect(call.binding).toEqual({ approvalId: "approval_call_1", toolCallId: "call_1", toolName: "arcade_call_skill",
      skillId: "diff-triage", maxAmountUsd: "$0.02", input: '{"diff":"private input"}' })
    expect(call.ready).toBe(true); expect(Object.isFrozen(call.binding)).toBe(true)
    p.input.input = "{}"; expect(call.binding.input).toBe('{"diff":"private input"}')
  })
  it.each([{ type: "tool-other" }, { toolCallId: "" }, { input: {} }, { approval: {} },
    { input: { ...part().input, input: "[]" } }, { input: { ...part().input, maxAmountUsd: "bad" } }])("refuses malformed original binding %j", change => {
    expect(capturePurchasePart({ ...part(), ...change })).toBeUndefined()
  })
  it("never consumes forged or restored output and has no IO at construction", async () => {
    const f = setup()
    await f.owner.receive(part("call_1", "output-available"))
    expect(f.run).not.toHaveBeenCalled(); expect(f.updates).toEqual([])
    const restored = setup([{ parts: [part()] }])
    expect(restored.owner.canConfirm(part())).toBe(false)
    expect(restored.owner.approve(part(), context(), wallet())).toBe(false)
    await restored.owner.receive(part("call_1", "output-available")); expect(restored.run).not.toHaveBeenCalled()
  })
  it("allows one live confirmation then consumes once on matching actual SDK output", async () => {
    const f = setup(), p = part()
    expect(f.owner.canConfirm(p)).toBe(true)
    expect(f.owner.approve(p, context(), wallet())).toBe(true)
    expect(f.owner.canConfirm(p)).toBe(false)
    await f.owner.receive(part("call_1", "approval-responded")); expect(f.run).not.toHaveBeenCalled()
    await f.owner.receive(part("call_1", "output-available"))
    await f.owner.receive(part("call_1", "output-available"))
    expect(f.run).toHaveBeenCalledTimes(1)
    expect(f.owner.approve({ ...p, approval: { id: "another_approval" } }, context(), wallet())).toBe(false)
    expect(JSON.stringify(f.updates)).not.toContain("private input")
  })
  it.each([true, false])("cannot mint from an already answered approval-requested part (%s)", approved => {
    const f = setup(), p = { ...part(), approval: { ...part().approval, approved } }
    expect(f.owner.canConfirm(p)).toBe(false)
    expect(f.owner.approve(p, context(), wallet())).toBe(false)
  })
  it("burns a pending decision when a malformed requested state carries a denial", async () => {
    const f = setup(); f.owner.approve(part(), context(), wallet())
    await f.owner.receive({ ...part(), approval: { ...part().approval, approved: false } })
    await f.owner.receive(part("call_1", "output-available"))
    expect(f.run).not.toHaveBeenCalled()
  })
  it.each(["input", "approval", "output", "denied", "error"])("burns an approved pending call on %s mismatch/refusal", async kind => {
    const f = setup(); expect(f.owner.approve(part(), context(), wallet())).toBe(true)
    const p = part("call_1", "output-available")
    const changed = kind === "input" ? { ...p, input: { ...p.input, input: "{}" } }
      : kind === "approval" ? { ...p, approval: { id: "different", approved: true } }
      : kind === "output" ? { ...p, output: { ...p.output, toolCallId: "different" } }
      : kind === "denied" ? { ...p, approval: { ...p.approval, approved: false } }
      : { ...p, state: "output-error", errorText: "PRIVATE_ERROR" }
    await f.owner.receive(changed); await f.owner.receive(p)
    expect(f.run).not.toHaveBeenCalled()
    expect(JSON.stringify(f.updates)).not.toContain("PRIVATE_ERROR")
  })
  it("denies once and never re-arms from subsequent output or changed approval ID", async () => {
    const f = setup()
    expect(f.owner.deny(part())).toBe(true); expect(f.owner.deny(part())).toBe(false)
    expect(f.owner.approve(part(), context(), wallet())).toBe(false)
    await f.owner.receive(part("call_1", "output-available")); expect(f.run).not.toHaveBeenCalled()
  })
  it("drops a permit after SDK dispatch failure without re-arming it", async () => {
    const f = setup(); f.owner.approve(part(), context(), wallet()); f.owner.discard("call_1")
    await f.owner.receive(part("call_1", "output-available")); expect(f.run).not.toHaveBeenCalled()
    expect(f.owner.approve(part(), context(), wallet())).toBe(false)
  })
  it("burns all pending permits on a failed SDK request without serializing diagnostics", async () => {
    const f = setup()
    f.owner.approve(part("one"), context(), wallet()); f.owner.approve(part("two"), context(), wallet())
    f.owner.cancelPending()
    await f.owner.receive(part("one", "output-available")); await f.owner.receive(part("two", "output-available"))
    expect(f.run).not.toHaveBeenCalled()
    expect(f.owner.canConfirm(part("one"))).toBe(false)
  })
  it("does not start from a preliminary tool result, even when a final result follows", async () => {
    const f = setup(); f.owner.approve(part(), context(), wallet())
    await f.owner.receive({ ...part("call_1", "output-available"), preliminary: true })
    await f.owner.receive(part("call_1", "output-available"))
    expect(f.run).not.toHaveBeenCalled()
  })
  it("serializes approved runs, with no duplicate while a prior run is active", async () => {
    const f = setup(); let release!: () => void
    f.run.mockImplementationOnce(async (scope, token, binding) => {
      expect(scope.consume(token, binding)).toBeDefined()
      await new Promise<void>(resolve => { release = resolve })
      return { phase: "unconfirmed", message: "Fixture" }
    })
    f.owner.approve(part("first"), context(), wallet()); f.owner.approve(part("second"), context(), wallet())
    const first = f.owner.receive(part("first", "output-available")), second = f.owner.receive(part("second", "output-available"))
    await Promise.resolve(); expect(f.run).toHaveBeenCalledTimes(1)
    await f.owner.receive(part("second", "output-available")); expect(f.run).toHaveBeenCalledTimes(1)
    release(); await first; await second; expect(f.run).toHaveBeenCalledTimes(2)
  })
  it("closes unused and active work, suppresses late updates and does not run queued work", async () => {
    const f = setup(); let signal: AbortSignal | undefined, update: ((v: PurchaseView) => void) | undefined, release!: () => void
    f.run.mockImplementationOnce(async (_scope, _token, _binding, _wallet, options, callback) => {
      signal = options?.signal; update = callback
      await new Promise<void>(resolve => { release = resolve })
      return { phase: "unconfirmed", message: "Fixture" }
    })
    f.owner.approve(part("first"), context(), wallet()); f.owner.approve(part("second"), context(), wallet())
    const first = f.owner.receive(part("first", "output-available")), second = f.owner.receive(part("second", "output-available"))
    await Promise.resolve(); f.owner.close(); f.owner.close()
    expect(signal?.aborted).toBe(true)
    update?.({ phase: "unconfirmed", message: "late" }); release(); await first; await second
    expect(f.run).toHaveBeenCalledTimes(1); expect(f.updates).toEqual([])
    expect(f.owner.approve(part("third"), context(), wallet())).toBe(false)
  })
  it("contains a failed runner and observer without repeating the action", async () => {
    const f = setup(); f.run.mockRejectedValue(Error("PRIVATE_RUNNER"))
    f.owner.approve(part(), context(), wallet()); await f.owner.receive(part("call_1", "output-available"))
    expect(f.run).toHaveBeenCalledTimes(1); expect(JSON.stringify(f.updates)).not.toContain("PRIVATE_RUNNER")
  })
  it("refuses over-cap or malformed initial history and bounds retained decisions", () => {
    for (const initial of [null, {}, new Array(257).fill({ parts: [] })]) expect(setup(initial).owner.canConfirm(part())).toBe(false)
    const f = setup()
    for (let i = 0; i < 128; i++) expect(f.owner.deny(part("call_" + i))).toBe(true)
    expect(f.owner.canConfirm(part("new_call"))).toBe(false)
  })
})
