import { describe, expect, it } from "vitest"
import { hashJson } from "@arcade/core"
import { decodeAbiParameters, decodeFunctionData, parseAbiParameters, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ERC8183_ABI } from "../src/erc8183-abi.ts"
import { ERC8183_ZERO, ERC8183_ZERO_HASH } from "../src/erc8183-codec.ts"
import { escrowRequestDescription } from "../src/erc8183-request.ts"
import { setBudgetAuthorization, submitAuthorization } from "../src/erc8183-auth.ts"
import { escrowActionContext, escrowCompletionProjection, prepareEscrowAction } from "../src/erc8183-actions.ts"
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
const hash = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex
const provider = privateKeyToAccount(generatePrivateKey())
const call = { chainId: 5042002, escrow: addr(10), hook: addr(4), evaluator: addr(3),
  token: "0x3600000000000000000000000000000000000000", provider: provider.address, providerAgentId: 8n, amount: 300000n,
  resource: "https://example.test/x/seller/skill", method: "POST", skillId: "skill", skillVersion: "1.0.0",
  inputHash: hashJson({ task: "original" }), timeoutSeconds: 60 }
const context = () => escrowActionContext({ call, jobId: 7n, client: addr(1), expiredAt: 2000,
  requestHash: escrowRequestDescription(call, addr(1), 2000, hash(88)).split(":").at(-1), treasury: addr(5) })
const snapshot = (status = 1) => ({ chainId: 5042002, escrow: addr(10), blockNumber: 50n, blockHash: hash(50),
  timestamp: 1000, jobId: 7n, pendingClaimHash: ERC8183_ZERO_HASH, job: {
    client: addr(1), status, provider: provider.address.toLowerCase() as Hex, expiredAt: 2000,
    evaluator: addr(3), submittedAt: status === 2 ? 990 : 0, budget: status === 0 ? 0n : 300000n,
    hook: addr(4), paymentToken: status === 0 ? ERC8183_ZERO : call.token as Hex,
    providerAgentId: 8n, description: escrowRequestDescription(call, addr(1), 2000, hash(88)),
    settledAmount: 0n, payoutReceiver: ERC8183_ZERO } })
const success = () => ({ hubJobId: "job_" + "a".repeat(32), outputHash: hashJson({ ok: true }),
  treeHash: ERC8183_ZERO_HASH, childCount: 0, childTotalAtomic: 0n })
describe("escrow action preparation and pre-settlement receipt projection", () => {
  it("creates stable versioned bytes without a circular settleTx or private capability", () => {
    const p = escrowCompletionProjection(context(), success())
    expect(p.hash).toBe(hashJson(JSON.parse(p.bytes)))
    expect(JSON.parse(p.bytes)).toMatchObject({ protocol: "arcade:erc8183:receipt:v1", decision: "validated-success",
      priceAtomic: "300000", sellerAtomic: "285000", feeAtomic: "15000", escrowJobId: "7" })
    expect(p.bytes).not.toMatch(/settleTx|signature|capability|latency|createdAt/)
    expect(Object.isFrozen(p)).toBe(true)
    expect(escrowCompletionProjection(context(), { ...success(), outputHash: hash(99) }).hash).not.toBe(p.hash)
    expect(escrowCompletionProjection({ ...context(), treasury: addr(6) }, success()).hash).not.toBe(p.hash)
    expect(() => escrowCompletionProjection(context(), { ...success(), settleTx: hash(9) })).toThrow("escrow_facts_refused")
  })
  it("encodes real provider-signed budget and submit actions with no IO", async () => {
    const base = { chainId: 5042002, escrow: addr(10), signer: provider.address, jobId: 7n, nonce: 4n, deadline: 1600n }
    const budgetSig = await provider.signTypedData(setBudgetAuthorization({ ...base, token: call.token as Hex, amount: 300000n }, 1000))
    const budget = await prepareEscrowAction(context(), snapshot(0), { kind: "budget", nonce: 4n,
      deadline: 1600n, signature: budgetSig }, 1000)
    expect(decodeFunctionData({ abi: ERC8183_ABI, data: budget.data }).functionName).toBe("setBudgetWithAuthorization")
    expect(budget).toMatchObject({ sender: addr(3), to: addr(10), value: 0n, kind: "budget" })
    expect(budget.providerNonce).toBeDefined()
    const signature = await provider.signTypedData(submitAuthorization({ ...base, deliverable: success().outputHash }, 1000))
    const submit = await prepareEscrowAction(context(), snapshot(), { kind: "submit", nonce: 4n, deadline: 1600n,
      signature, outputHash: success().outputHash }, 1000)
    expect(decodeFunctionData({ abi: ERC8183_ABI, data: submit.data }).args?.[1]).toBe(success().outputHash)
    await expect(prepareEscrowAction(context(), snapshot(), { kind: "submit", nonce: 5n, deadline: 1600n,
      signature, outputHash: success().outputHash }, 1000)).rejects.toThrow("escrow_facts_refused")
  })
  it("requires Submitted before complete and encodes the exact noncircular receipt commitment", async () => {
    const p = escrowCompletionProjection(context(), success())
    const action = await prepareEscrowAction(context(), snapshot(2), { kind: "complete", receipt: success() }, 1000)
    const decoded = decodeFunctionData({ abi: ERC8183_ABI, data: action.data })
    expect(decoded.functionName).toBe("complete")
    expect(decodeAbiParameters(parseAbiParameters("bytes32,uint32,uint256,bytes32"), decoded.args![2] as Hex))
      .toEqual([ERC8183_ZERO_HASH, 0, 0n, p.hash])
    expect(action.receipt).toEqual(p)
    await expect(prepareEscrowAction(context(), snapshot(), { kind: "complete", receipt: success() }, 1000))
      .rejects.toThrow("escrow_facts_refused")
  })
  it("rejects Funded or Submitted, including after expiry, but never substitutes reject for Open/terminal states", async () => {
    for (const status of [1, 2]) {
      const s = { ...snapshot(status), timestamp: 6000 }
      const action = await prepareEscrowAction(context(), s, { kind: "reject", reason: "runner_lost" }, 6000)
      expect(decodeFunctionData({ abi: ERC8183_ABI, data: action.data }).functionName).toBe("reject")
    }
    for (const status of [0, 3, 4, 5]) {
      await expect(prepareEscrowAction(context(), snapshot(status), { kind: "reject", reason: "runner_lost" }, 1000))
        .rejects.toThrow("escrow_facts_refused")
    }
    await expect(prepareEscrowAction(context(), snapshot(), { kind: "reject", reason: "raw private upstream error" }, 1000))
      .rejects.toThrow(/^escrow_facts_refused$/)
  })
  it("allows Submitted completion during the existing grace period and refuses at permissionless-refund time", async () => {
    const before = { ...snapshot(2), timestamp: 5599 }
    await expect(prepareEscrowAction(context(), before, { kind: "complete", receipt: success() }, 5599))
      .resolves.toMatchObject({ kind: "complete" })
    await expect(prepareEscrowAction(context(), { ...before, timestamp: 5600 }, { kind: "complete", receipt: success() }, 5600))
      .rejects.toThrow("escrow_facts_refused")
  })
  it.each([{ settledAmount: 1n }, { payoutReceiver: addr(9) }, { budget: 1n }, { paymentToken: addr(9) },
    { description: "other" }, { client: addr(9) }, { evaluator: addr(9) }, { expiredAt: 1999 }, { providerAgentId: 9n }])
  ("refuses changed full-job identity or accounting", async delta => {
    const s = snapshot(2)
    await expect(prepareEscrowAction(context(), { ...s, job: { ...s.job, ...delta } },
      { kind: "complete", receipt: success() }, 1000)).rejects.toThrow("escrow_facts_refused")
  })
  it("refuses pending claims, stale facts, unknown action fields and getters before signing", async () => {
    await expect(prepareEscrowAction(context(), { ...snapshot(2), pendingClaimHash: hash(8) },
      { kind: "complete", receipt: success() }, 1000)).rejects.toThrow("escrow_facts_refused")
    await expect(prepareEscrowAction(context(), snapshot(2), { kind: "complete", receipt: success() }, 1031))
      .rejects.toThrow("escrow_facts_refused")
    await expect(prepareEscrowAction(context(), snapshot(2), { kind: "complete", receipt: success(), extra: true }, 1000))
      .rejects.toThrow("escrow_facts_refused")
    let invoked = 0
    const action = Object.defineProperty({}, "kind", { get() { invoked++; return "complete" } })
    await expect(prepareEscrowAction(context(), snapshot(2), action, 1000)).rejects.toThrow("escrow_facts_refused")
    expect(invoked).toBe(0)
  })
})
