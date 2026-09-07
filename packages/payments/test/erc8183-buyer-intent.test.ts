import { describe, expect, it } from "vitest"
import { hashJson } from "@arcade/core"
import { decodeFunctionData, erc20Abi, getAddress, keccak256, type Hex } from "viem"
import { ERC8183_ABI } from "../src/erc8183-abi.ts"
import { ERC8183_ZERO, ERC8183_ZERO_HASH } from "../src/erc8183-codec.ts"
import { buildEscrowRequirements } from "../src/erc8183-wire.ts"
import { createEscrowBuyerIntent, assertEscrowBuyerReserve, prepareEscrowBuyerAction } from "../src/erc8183-buyer-intent.ts"
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
const hash = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex
function fixture() {
  const identity = { chainId: 5042002, escrow: addr(10), implementation: addr(11), hook: addr(12), evaluator: addr(3),
    treasury: addr(4), token: "0x3600000000000000000000000000000000000000", proxyCodeHash: keccak256("0x01"),
    implementationCodeHash: keccak256("0x02"), hookCodeHash: keccak256("0x03") }
  const call = { chainId: 5042002, escrow: identity.escrow, hook: identity.hook, evaluator: identity.evaluator,
    token: identity.token, provider: addr(2), providerAgentId: 8n, amount: 300000n,
    resource: "https://example.test/x/" + addr(2) + "/skill", method: "POST", skillId: "skill", skillVersion: "1.0.0",
    inputHash: hashJson({ message: "fixture" }), timeoutSeconds: 60 }
  const requirements = buildEscrowRequirements(identity, { priceAtomic: call.amount, resource: call.resource, payTo: call.provider,
    escrow: { skillId: call.skillId, skillVersion: call.skillVersion, inputHash: call.inputHash,
      providerAgentId: call.providerAgentId, timeoutSeconds: call.timeoutSeconds } }, 1800)
  const input = { identity, call, requirements, client: addr(1), issuedAt: 1000, expiresInSeconds: 1800,
    capability: hash(77), maxAmountAtomic: 300000n, gasBudgetWei: 3000000n }
  const intent = createEscrowBuyerIntent(input)
  const deployment = { identity: intent.identity, chainId: 5042002 as const, escrow: identity.escrow,
    blockNumber: 50n, blockHash: hash(50), timestamp: 1000 }
  const job = { client: addr(1), provider: addr(2), evaluator: addr(3), hook: addr(12), providerAgentId: 8n,
    expiredAt: 2800, submittedAt: 0, settledAmount: 0n, payoutReceiver: ERC8183_ZERO, status: 0,
    budget: 300000n, paymentToken: identity.token, description: intent.description }
  const snapshot = { chainId: 5042002, escrow: identity.escrow, blockNumber: 50n, blockHash: hash(50), timestamp: 1000,
    jobId: 7n, pendingClaimHash: ERC8183_ZERO_HASH, job }
  return { input, intent, deployment, snapshot }
}
describe("offline buyer escrow intent (no key, RPC, journal or send)", () => {
  it("binds pinned challenge, principal, expiry and gas without retaining the capability", () => {
    const f = fixture()
    expect(f.intent).toMatchObject({ client: addr(1), issuedAt: 1000, expiredAt: 2800, fundBy: 2140,
      maxAmountAtomic: 300000n, gasBudgetWei: 3000000n })
    expect(Object.isFrozen(f.intent)).toBe(true); expect(Object.isFrozen(f.intent.call)).toBe(true)
    const text = JSON.stringify(f.intent, (_, v) => typeof v === "bigint" ? v.toString() : v)
    expect(text).not.toContain(f.input.capability); expect(text).not.toContain('"capability"')
    expect(f.intent.description).toMatch(/^arcade:erc8183:request:v1:0x[0-9a-f]{64}$/)
    expect(createEscrowBuyerIntent({ ...f.input, capability: hash(78) }).id).not.toBe(f.intent.id)
    f.input.call.amount = 1n; f.input.identity.hook = addr(99)
    expect(f.intent.call.amount).toBe(300000n); expect(f.intent.identity.hook).toBe(addr(12))
  })
  it.each(["escrow", "hook", "evaluator", "token"])("rejects a challenge not matching local %s", field => {
    const f = fixture(), call = { ...f.input.call, [field]: addr(99) }
    expect(() => createEscrowBuyerIntent({ ...f.input, call })).toThrow("escrow_facts_refused")
  })
  it.each(["amount", "provider", "providerAgentId", "skillId", "skillVersion", "inputHash", "timeoutSeconds", "resource"])
    ("rejects changed local request %s instead of trusting header metadata", field => {
      const f = fixture(), changes: Record<string, unknown> = { amount: 1n, provider: addr(9), providerAgentId: 9n,
        skillId: "different", skillVersion: "2", inputHash: hash(8), timeoutSeconds: 61, resource: f.input.call.resource + "?x=1" }
      expect(() => createEscrowBuyerIntent({ ...f.input, call: { ...f.input.call, [field]: changes[field] } }))
        .toThrow("escrow_facts_refused")
    })
  it.each([
    { maxAmountAtomic: 299999n }, { maxAmountAtomic: 0n }, { gasBudgetWei: 0n }, { gasBudgetWei: 1n << 256n },
    { expiresInSeconds: 1801 }, { issuedAt: 2 ** 48 - 100 }, { client: addr(2) }, { capability: ERC8183_ZERO_HASH }
  ])("rejects unsafe caps, different approved expiry, self-payment or invalid secret: %o", patch => {
    const f = fixture(); expect(() => createEscrowBuyerIntent({ ...f.input, ...patch })).toThrow("escrow_facts_refused")
  })
  it("does not invoke accessors, accept unknown authority, or accept copied intents", () => {
    const f = fixture(); let reads = 0
    expect(() => createEscrowBuyerIntent({ ...f.input, get client() { reads++; return addr(1) } })).toThrow("escrow_facts_refused")
    expect(reads).toBe(0)
    expect(() => createEscrowBuyerIntent({ ...f.input, authorizationWindow: 999999 })).toThrow("escrow_facts_refused")
    expect(() => prepareEscrowBuyerAction({ ...f.intent }, f.deployment, { kind: "create" }, 1000)).toThrow("escrow_facts_refused")
  })
  it("reserves ONE native-USDC balance for six-decimal principal plus total remaining gas", () => {
    const f = fixture(), principalWei = 300000n * 10n ** 12n, balance = principalWei + 3000000n
    expect(assertEscrowBuyerReserve(f.intent, balance, 0n)).toEqual({ principalWei, remainingGasWei: 3000000n, requiredWei: balance })
    expect(() => assertEscrowBuyerReserve(f.intent, balance - 1n, 0n)).toThrow("escrow_facts_refused")
    expect(assertEscrowBuyerReserve(f.intent, balance - 1000000n, 1000000n).remainingGasWei).toBe(2000000n)
    expect(() => assertEscrowBuyerReserve(f.intent, balance, 3000001n)).toThrow("escrow_facts_refused")
    expect(() => assertEscrowBuyerReserve(f.intent, -1n, 0n)).toThrow("escrow_facts_refused")
    expect(() => createEscrowBuyerIntent({ ...f.input, gasBudgetWei: (1n << 256n) - 1n })).toThrow("escrow_facts_refused")
  })
  it("prepares exact buyer create calldata only after full deployment facts", () => {
    const f = fixture(), a = prepareEscrowBuyerAction(f.intent, f.deployment, { kind: "create" }, 1000)
    expect(a).toMatchObject({ kind: "create", chainId: 5042002, sender: addr(1), to: addr(10), value: 0n, jobId: null })
    expect(decodeFunctionData({ abi: ERC8183_ABI, data: a.data })).toEqual({ functionName: "createJob",
      args: [addr(2), addr(3), 2800, f.intent.description, getAddress(addr(12)), 8n] })
    expect(Object.isFrozen(a)).toBe(true)
    for (const patch of [{ identity: { ...f.intent.identity, treasury: addr(99) } }, { timestamp: 969 },
      { blockNumber: 0n }, { chainId: 1 }, { blockHash: ERC8183_ZERO_HASH }, { escrow: addr(99) }]) {
      expect(() => prepareEscrowBuyerAction(f.intent, { ...f.deployment, ...patch }, { kind: "create" }, 1000)).toThrow("escrow_facts_refused")
    }
  })
  it("approves exactly the principal from zero allowance; funding cannot bypass a matching bounded allowance", () => {
    const f = fixture(), approve = prepareEscrowBuyerAction(f.intent, f.snapshot, { kind: "approve", jobId: 7n, allowanceAtomic: 0n }, 1000)
    expect(approve).toMatchObject({ sender: addr(1), to: f.intent.call.token, value: 0n, jobId: 7n })
    expect(decodeFunctionData({ abi: erc20Abi, data: approve.data })).toEqual({ functionName: "approve", args: [getAddress(addr(10)), 300000n] })
    const fund = prepareEscrowBuyerAction(f.intent, f.snapshot, { kind: "fund", jobId: 7n, allowanceAtomic: 300000n }, 1000)
    expect(decodeFunctionData({ abi: ERC8183_ABI, data: fund.data })).toEqual({ functionName: "fund", args: [7n, f.intent.call.token, 300000n, "0x"] })
    for (const allowanceAtomic of [0n, 299999n, 300001n, (1n << 256n) - 1n]) {
      expect(() => prepareEscrowBuyerAction(f.intent, f.snapshot, { kind: "fund", jobId: 7n, allowanceAtomic }, 1000)).toThrow("escrow_facts_refused")
    }
    expect(() => prepareEscrowBuyerAction(f.intent, f.snapshot, { kind: "approve", jobId: 7n, allowanceAtomic: 1n }, 1000)).toThrow("escrow_facts_refused")
  })
  it.each([
    { status: 1 }, { budget: 1n }, { paymentToken: addr(99) }, { client: addr(99) }, { provider: addr(99) },
    { evaluator: addr(99) }, { hook: addr(99) }, { providerAgentId: 9n }, { description: "other" },
    { expiredAt: 2801 }, { submittedAt: 1 }, { settledAmount: 1n }, { payoutReceiver: addr(99) }
  ])("refuses changed budgeted job facts before allowance or funding: %o", patch => {
    const f = fixture(), snapshot = { ...f.snapshot, job: { ...f.snapshot.job, ...patch } }
    for (const kind of ["approve", "fund"] as const) expect(() => prepareEscrowBuyerAction(f.intent, snapshot,
      { kind, jobId: 7n, allowanceAtomic: kind === "approve" ? 0n : 300000n }, 1000)).toThrow("escrow_facts_refused")
  })
  it("preserves the existing funding margin, snapshot freshness, job and pending-claim fences", () => {
    const f = fixture(), operation = { kind: "fund", jobId: 7n, allowanceAtomic: 300000n }
    expect(() => prepareEscrowBuyerAction(f.intent, { ...f.snapshot, timestamp: 2140 }, operation, 2140)).not.toThrow()
    expect(() => prepareEscrowBuyerAction(f.intent, { ...f.snapshot, timestamp: 2141 }, operation, 2141)).toThrow("escrow_facts_refused")
    for (const patch of [{ jobId: 8n }, { pendingClaimHash: hash(99) }, { timestamp: 969 }, { timestamp: 1006 }]) {
      expect(() => prepareEscrowBuyerAction(f.intent, { ...f.snapshot, ...patch }, operation, 1000)).toThrow("escrow_facts_refused")
    }
    expect(() => prepareEscrowBuyerAction(f.intent, f.snapshot, { ...operation, optParams: "0x01" }, 1000)).toThrow("escrow_facts_refused")
    expect(() => prepareEscrowBuyerAction(f.intent, f.snapshot, operation, 999)).toThrow("escrow_facts_refused")
  })
  it.each(["?query=1", "#fragment", "/extra"])("refuses even locally matching non-root resource suffix %s", suffix => {
    const f = fixture(), resource = f.input.call.resource + suffix
    expect(() => createEscrowBuyerIntent({ ...f.input, call: { ...f.input.call, resource },
      requirements: { ...f.input.requirements, resource } })).toThrow("escrow_facts_refused")
  })
  it("refuses credential URLs, unknown schemes, missing agent identity and overflow principal reserve", () => {
    const f = fixture()
    for (const resource of [f.input.call.resource.replace("https://", "https://private@example."),
      f.input.call.resource.replace("https://", "file://"), f.input.call.resource.replace("/skill", "/other")]) {
      expect(() => createEscrowBuyerIntent({ ...f.input, call: { ...f.input.call, resource },
        requirements: { ...f.input.requirements, resource } })).toThrow("escrow_facts_refused")
    }
    for (const providerAgentId of [0n, 1n << 256n]) {
      expect(() => createEscrowBuyerIntent({ ...f.input, call: { ...f.input.call, providerAgentId }, requirements: {
        ...f.input.requirements, extra: { ...f.input.requirements.extra, providerAgentId: providerAgentId.toString() }
      } })).toThrow("escrow_facts_refused")
    }
    const amount = ((1n << 256n) - 1n) / 500n
    expect(() => createEscrowBuyerIntent({ ...f.input, call: { ...f.input.call, amount }, maxAmountAtomic: amount,
      requirements: { ...f.input.requirements, amount: amount.toString() } })).toThrow("escrow_facts_refused")
  })
  it("does not invoke nested deployment/job/operation getters", () => {
    const f = fixture(); let reads = 0
    const create = { kind: "create" }, fund = { kind: "fund", jobId: 7n, allowanceAtomic: 300000n }
    for (const [snapshot, op] of [
      [{ ...f.deployment, get identity() { reads++; return f.intent.identity } }, create],
      [{ ...f.snapshot, job: { ...f.snapshot.job, get budget() { reads++; return 300000n } } }, fund],
      [f.snapshot, { ...fund, get allowanceAtomic() { reads++; return 300000n } }]
    ]) expect(() => prepareEscrowBuyerAction(f.intent, snapshot, op, 1000)).toThrow("escrow_facts_refused")
    expect(reads).toBe(0)
  })
})
