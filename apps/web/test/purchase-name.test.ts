import { describe, expect, it, vi } from "vitest"
import chain from "../../../config/chains/arc-testnet.json"
import { createPurchaseApprovalScope } from "../src/lib/purchase-approval.ts"
import { capturePurchasePart, createPurchaseConversation } from "../src/lib/purchase-conversation.ts"
import { createPurchaseRunner, type PurchaseRuntime, type runPurchase } from "../src/lib/purchase-run.ts"

const ID = "diff-triage", NAME = "diff-triage.seller.arcade.eth", ALIAS = "alias.seller.arcade.eth"
const SELLER = "0x" + "1".repeat(40), BUYER = "0x" + "2".repeat(40), HUB = "https://hub.example"
const resource = "/x/" + SELLER + "/" + ID, input = '{"diff":"private actual input"}'
const context = () => ({ hubOrigin: HUB, skillId: ID, seller: SELLER, resource, amountAtomic: "10000",
  payTo: SELLER, asset: chain.usdc.address, network: chain.caip2, rail: "eip3009" as const, ensName: NAME,
  requirements: { scheme: "exact" as const, network: chain.caip2, amount: "10000", asset: chain.usdc.address,
    payTo: SELLER, resource: HUB + resource, maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" } } })
const binding = () => ({ approvalId: "approval_name", toolCallId: "call_name", toolName: "arcade_call_skill" as const,
  name: NAME, maxAmountUsd: "$0.02", input })
const part = (state = "approval-requested") => ({ type: "tool-arcade_call_skill", toolCallId: "call_name", state,
  input: { name: NAME, maxAmountUsd: "$0.02", input }, approval: { id: "approval_name", ...(state === "approval-requested" ? {} : { approved: true }) },
  ...(state === "output-available" ? { output: { awaitingSignature: true, toolCallId: "call_name", skillId: ID, name: NAME, ensName: NAME } } : {}) })
const wallet = () => ({ buyer: BUYER, provider: { request: vi.fn(async () => undefined) } })

describe("original name in private one-use browser authority", () => {
  it("captures name separately from the resolved skill and consumes only that original binding", () => {
    const scope = createPurchaseApprovalScope(), token = scope.approve({ ...binding(), context: context() })
    expect(token).toBeDefined()
    expect(scope.consume(token, binding())).toMatchObject({ name: NAME, skillId: ID, inputJson: input, context: context() })
    expect(scope.consume(token, binding())).toBeUndefined()
  })
  it.each(["id", "alias", "both"])("burns instead of rebinding an approved name to %s", mode => {
    const scope = createPurchaseApprovalScope(), token = scope.approve({ ...binding(), context: context() })
    expect(token).toBeDefined()
    const { name, ...base } = binding()
    const other = mode === "id" ? { ...base, skillId: ID } : mode === "alias" ? { ...base, name: ALIAS } : { ...base, name, skillId: ID }
    expect(scope.consume(token, other)).toBeUndefined()
    expect(scope.consume(token, binding())).toBeUndefined()
  })
  it.each([undefined, ALIAS])("cannot approve a name without its exact verified name (%s)", ensName => {
    const scope = createPurchaseApprovalScope(), { ensName: ignored, ...base } = context()
    expect(scope.approve({ ...binding(), context: { ...base, ...(ensName ? { ensName } : {}) } })).toBeUndefined()
  })
  it("captures original SDK name without accepting output coordinates as authority", () => {
    const p = capturePurchasePart(part("output-available"))
    expect(p?.binding).toEqual(binding()); expect(p?.ready).toBe(true)
  })
  it("runs once only after a matching live name approval and resolved-id readiness", async () => {
    const run = vi.fn<typeof runPurchase>(async (scope, token, b) => {
      expect(scope.consume(token, b)).toMatchObject({ name: NAME, skillId: ID })
      return { phase: "refused", message: "Fixture stopped before IO" }
    })
    const owner = createPurchaseConversation([], () => {}, run)
    expect(owner.approve(part(), context(), wallet())).toBe(true)
    await owner.receive(part("output-available")); await owner.receive(part("output-available"))
    expect(run).toHaveBeenCalledTimes(1)
    owner.close()
  })
  it.each([{ name: ALIAS }, { name: undefined }, { skillId: "different-skill" }, { ensName: ALIAS }])("burns changed readiness %j", change => {
    return (async () => {
      const run = vi.fn<typeof runPurchase>(async () => ({ phase: "refused", message: "Must not run" }))
      const owner = createPurchaseConversation([], () => {}, run)
      expect(owner.approve(part(), context(), wallet())).toBe(true)
      const output = part("output-available")
      await owner.receive({ ...output, output: { ...output.output, ...change } })
      await owner.receive(output)
      expect(run).not.toHaveBeenCalled(); owner.close()
    })()
  })
  it("keeps restored name approvals inert", async () => {
    const run = vi.fn<typeof runPurchase>(async () => ({ phase: "refused", message: "Must not run" }))
    const p = part(), owner = createPurchaseConversation([{ parts: [p] }], () => {}, run)
    expect(owner.canConfirm(p)).toBe(false); expect(owner.approve(p, context(), wallet())).toBe(false)
    await owner.receive(part("output-available")); expect(run).not.toHaveBeenCalled()
  })
  it.each(["unchanged", "before", "after"])("requotes the original name around signing: %s", mode => {
    return (async () => {
      let calls = 0
      const quote = vi.fn(async (target: unknown, actualInput: unknown) => {
        expect(target).toEqual({ name: NAME }); expect(actualInput).toBe(input)
        calls++
        return { ...context(), ensName: mode === "before" || mode === "after" && calls === 2 ? ALIAS : NAME }
      })
      const runtime: PurchaseRuntime = { quote,
        sign: vi.fn(async () => ({ from: BUYER, to: SELLER, value: "10000", validAfter: "0", validBefore: "1800604900",
          nonce: "0x" + "1".repeat(64), signature: "0x" + "2".repeat(130) })),
        submit: vi.fn(async () => { throw Error("Synthetic stop; never a real submit") }),
        remember: vi.fn(() => ({ status: "unavailable" as const })), read: vi.fn(async () => { throw 0 }) }
      const scope = createPurchaseApprovalScope(), token = scope.approve({ ...binding(), context: context() })
      expect(token).toBeDefined()
      const result = await createPurchaseRunner(runtime)(scope, token, binding(), wallet())
      expect(result.phase).toBe(mode === "before" ? "refused" : "unconfirmed")
      expect(runtime.sign).toHaveBeenCalledTimes(mode === "before" ? 0 : 1)
      expect(runtime.submit).toHaveBeenCalledTimes(mode === "unchanged" ? 1 : 0)
      expect(quote).toHaveBeenCalledTimes(mode === "before" ? 1 : 2)
    })()
  })
})
