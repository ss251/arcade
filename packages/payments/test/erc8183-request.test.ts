import { describe, expect, it } from "vitest"
import { hashJson } from "@arcade/core"
import { type Hex } from "viem"
import { captureEscrowProof, escrowRequestDescription, newEscrowCapability, verifyEscrowRequest,
  verifyEscrowBudgetRequest } from "../src/erc8183-request.ts"
import { captureEscrowJob, ERC8183_ZERO, ERC8183_ZERO_HASH } from "../src/erc8183-codec.ts"
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
const capability = ("0x" + "ac".repeat(32)) as Hex
const call = { chainId: 5042002, escrow: addr(10), hook: addr(4), evaluator: addr(3),
  token: "0x3600000000000000000000000000000000000000" as Hex, provider: addr(2), providerAgentId: 8n,
  amount: 300000n, resource: "https://example.test/x/seller/skill", method: "POST", skillId: "seller/skill",
  skillVersion: "1.0.0", inputHash: hashJson({ task: "original" }), timeoutSeconds: 60 }
const description = () => escrowRequestDescription(call, addr(1), 1660, capability)
const snapshot = () => ({ chainId: 5042002, escrow: call.escrow, blockNumber: 50n,
  blockHash: ("0x" + "bd".repeat(32)) as Hex, timestamp: 1000,
  jobId: 7n, pendingClaimHash: ERC8183_ZERO_HASH, job: captureEscrowJob({ client: addr(1), status: 1,
    provider: call.provider, expiredAt: 1660, evaluator: call.evaluator, submittedAt: 0, budget: call.amount,
    hook: call.hook, paymentToken: call.token, providerAgentId: call.providerAgentId, description: description(),
    settledAmount: 0n, payoutReceiver: ERC8183_ZERO }) })
const proof = () => ({ jobId: "7", capability })
describe("escrow request capability binding (offline)", () => {
  it("requires the same secret for an unbudgeted Open job and rejects already-budgeted/funded retries", () => {
    const s = snapshot(), open = { ...s, job: { ...s.job, status: 0, budget: 0n, paymentToken: ERC8183_ZERO } }
    expect(verifyEscrowBudgetRequest(open, call, proof(), 1000)).toMatchObject({ stage: "budget", jobId: 7n, payer: addr(1) })
    expect(() => verifyEscrowRequest(open, call, proof(), 1000)).toThrow("escrow_facts_refused")
    expect(() => verifyEscrowBudgetRequest(s, call, proof(), 1000)).toThrow("escrow_facts_refused")
    for (const delta of [{ budget: 1n }, { paymentToken: call.token }, { description: "copied" }, { status: 2 }]) {
      expect(() => verifyEscrowBudgetRequest({ ...open, job: { ...open.job, ...delta } }, call, proof(), 1000))
        .toThrow("escrow_facts_refused")
    }
    expect(() => verifyEscrowBudgetRequest(open, call, { ...proof(), capability: ERC8183_ZERO_HASH }, 1000))
      .toThrow("escrow_facts_refused")
  })
  it("commits a versioned request and verifies without retaining the secret", () => {
    expect(description()).toMatch(/^arcade:erc8183:request:v1:0x[0-9a-f]{64}$/)
    const verified = verifyEscrowRequest(snapshot(), call, proof(), 1000)
    expect(verified).toMatchObject({ rail: "erc8183", stage: "funded", jobId: 7n, payer: addr(1), amountAtomic: 300000n })
    expect(Object.isFrozen(verified)).toBe(true)
    expect(JSON.stringify(verified, (_, value) => typeof value === "bigint" ? String(value) : value)).not.toContain(capability)
  })
  it("refuses a copied public job id and public description without possession", () => {
    for (const p of [{ jobId: "7" }, { ...proof(), capability: description() },
      { ...proof(), capability: ERC8183_ZERO_HASH }, { ...proof(), capability: "0x" + "bb".repeat(32) }]) {
      expect(() => verifyEscrowRequest(snapshot(), call, p, 1000)).toThrow("escrow_facts_refused")
    }
  })
  it.each([
    { escrow: addr(9) }, { hook: addr(9) }, { evaluator: addr(9) }, { provider: addr(9) },
    { providerAgentId: 9n }, { amount: 1n }, { resource: "https://example.test/x/other" },
    { skillId: "other" }, { skillVersion: "2.0.0" }, { inputHash: hashJson({ task: "changed" }) },
    { timeoutSeconds: 59 }
  ])("refuses a changed trusted listing or request context", delta => {
    expect(() => verifyEscrowRequest(snapshot(), { ...call, ...delta }, proof(), 1000)).toThrow("escrow_facts_refused")
  })
  it("binds client and expiry, and requires the exact finalized job id and freshness", () => {
    for (const delta of [{ client: addr(6) }, { expiredAt: 1661 }]) {
      const s = snapshot()
      expect(() => verifyEscrowRequest({ ...s, job: { ...s.job, ...delta } }, call, proof(), 1000)).toThrow("escrow_facts_refused")
    }
    for (const delta of [{ jobId: 8n }, { chainId: 1 }, { escrow: addr(9) }, { blockNumber: 0n },
      { timestamp: 969 }, { timestamp: 1006 }, { pendingClaimHash: capability }]) {
      expect(() => verifyEscrowRequest({ ...snapshot(), ...delta }, call, proof(), 1000)).toThrow("escrow_facts_refused")
    }
  })
  it("uses canonical positive decimal job ids and strict getter-free proof capture", () => {
    expect(captureEscrowProof(proof())).toEqual({ jobId: 7n, capability })
    for (const id of [7, 7n, "0", "07", "-1", "1e3", (1n << 256n).toString(), "9".repeat(1000)]) {
      expect(() => captureEscrowProof({ ...proof(), jobId: id })).toThrow("escrow_facts_refused")
    }
    let reads = 0
    const p = Object.defineProperty(proof(), "capability", { get() { reads++; throw Error("private") } })
    expect(() => captureEscrowProof(p)).toThrow("escrow_facts_refused")
    expect(reads).toBe(0)
    expect(() => captureEscrowProof({ ...proof(), payer: addr(1) })).toThrow("escrow_facts_refused")
  })
  it("generates exactly 32 CSPRNG bytes and rejects malformed generation", () => {
    expect(newEscrowCapability(bytes => { expect(bytes.length).toBe(32); bytes.fill(0xac); return bytes })).toBe(capability)
    expect(() => newEscrowCapability(bytes => bytes)).toThrow("escrow_facts_refused")
    expect(() => newEscrowCapability(() => new Uint8Array(32).fill(1))).toThrow("escrow_facts_refused")
  })
  it("normalizes address case but never coerces or drops invalid request fields", () => {
    const lower = "0x" + "ab".repeat(20), upper = "0x" + "AB".repeat(20)
    expect(escrowRequestDescription({ ...call, provider: upper }, addr(1), 1660, capability))
      .toBe(escrowRequestDescription({ ...call, provider: lower }, addr(1), 1660, capability))
    for (const delta of [{ chainId: 1 }, { method: "GET" }, { token: addr(8) }, { amount: 0n },
      { timeoutSeconds: 901 }, { resource: "" }, { skillVersion: "x".repeat(129) }, { extra: true }]) {
      expect(() => escrowRequestDescription({ ...call, ...delta }, addr(1), 1660, capability)).toThrow("escrow_facts_refused")
    }
    const hostile = new Proxy({}, { ownKeys() { throw Error("private") } })
    expect(() => escrowRequestDescription(hostile, addr(1), 1660, capability)).toThrow(/^escrow_facts_refused$/)
  })
})
