import { describe, expect, it } from "vitest"
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Abi, type Hex, type TransactionReceipt } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ERC8183_ABI, ARCADE_JOB_HOOK_ABI } from "../src/erc8183-abi.ts"
import { parseAbi } from "viem"
import { ERC8183_ZERO, ERC8183_ZERO_HASH } from "../src/erc8183-codec.ts"
import { escrowActionContext, prepareEscrowAction, type PreparedEscrowAction } from "../src/erc8183-actions.ts"
import { assertEscrowActionReceipt, assertEscrowSignedAction } from "../src/erc8183-evidence.ts"
import { setBudgetAuthorization, submitAuthorization } from "../src/erc8183-auth.ts"
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
const hash = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex
const evaluator = privateKeyToAccount(generatePrivateKey()), provider = privateKeyToAccount(generatePrivateKey())
const tokenAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"])
const amountData = (n: bigint) => encodeAbiParameters(parseAbiParameters("uint256"), [n])
async function fixture(kind: PreparedEscrowAction["kind"] = "complete", amount = 300000n) {
  const context = escrowActionContext({ call: { chainId: 5042002, escrow: addr(10), hook: addr(4), evaluator: evaluator.address,
    token: "0x3600000000000000000000000000000000000000", provider: provider.address, providerAgentId: 8n,
    amount, resource: "https://example.test/x/seller/skill", method: "POST", skillId: "skill",
    skillVersion: "1.0.0", inputHash: hash(99), timeoutSeconds: 60 },
    jobId: 7n, client: addr(1), expiredAt: 2000, requestHash: hash(88), treasury: addr(5) })
  const c = context.call
  const snapshot = { chainId: 5042002, escrow: c.escrow, blockNumber: 50n, blockHash: hash(50), timestamp: 1000,
    jobId: 7n, pendingClaimHash: ERC8183_ZERO_HASH, job: { client: context.client, status: kind === "budget" ? 0 : kind === "complete" ? 2 : 1,
      provider: c.provider, expiredAt: 2000, evaluator: c.evaluator, submittedAt: kind === "complete" ? 900 : 0,
      budget: kind === "budget" ? 0n : amount, hook: c.hook, paymentToken: kind === "budget" ? ERC8183_ZERO : c.token,
      providerAgentId: 8n, description: "arcade:erc8183:request:v1:" + hash(88), settledAmount: 0n, payoutReceiver: ERC8183_ZERO } }
  const base = { chainId: 5042002, escrow: c.escrow, signer: provider.address, jobId: 7n, nonce: 2n, deadline: 1600n }
  const input = kind === "budget" ? { kind, nonce: 2n, deadline: 1600n,
    signature: await provider.signTypedData(setBudgetAuthorization({ ...base, token: c.token, amount }, 1000)) } :
    kind === "submit" ? { kind, nonce: 2n, deadline: 1600n, outputHash: hash(9),
      signature: await provider.signTypedData(submitAuthorization({ ...base, deliverable: hash(9) }, 1000)) } :
    kind === "reject" ? { kind, reason: "output_invalid" } : { kind, receipt: { hubJobId: "job_" + "a".repeat(32),
      outputHash: hash(9), treeHash: ERC8183_ZERO_HASH, childCount: 0, childTotalAtomic: 0n } }
  const action = await prepareEscrowAction(context, snapshot, input, 1000)
  const transaction = { type: "eip1559" as const, chainId: 5042002, to: c.escrow, value: 0n,
    data: action.data, nonce: 3, gas: 1000000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 0n }
  const terms = { nonce: 3, gas: 1000000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 0n, gasCapWei: 2000000n }
  const raw = await evaluator.signTransaction(transaction), signed = await assertEscrowSignedAction(action, raw, terms)
  const logs: TransactionReceipt["logs"] = []
  const event = (address: Hex, abi: Abi, eventName: string, args: Record<string, unknown>, data: Hex) => logs.push({
    address, topics: encodeEventTopics({ abi, eventName, args }) as [Hex, ...Hex[]], data, logIndex: logs.length,
    blockNumber: 51n, blockHash: hash(51), transactionHash: signed.hash, transactionIndex: 0, removed: false
  })
  const transfer = (to: Hex, n: bigint) => event(c.token, tokenAbi, "Transfer", { from: c.escrow, to }, amountData(n))
  if (kind === "budget" || kind === "submit") {
    event(c.escrow, ERC8183_ABI, "AuthorizationUsed", { signer: c.provider, nonce: action.providerNonce }, "0x")
    if (kind === "budget") event(c.escrow, ERC8183_ABI, "BudgetSet", { jobId: 7n, token: c.token }, amountData(amount))
    else event(c.escrow, ERC8183_ABI, "JobSubmitted", { jobId: 7n, provider: c.provider }, hash(9))
  } else if (kind === "reject") {
    transfer(context.client, amount)
    event(c.escrow, ERC8183_ABI, "Refunded", { jobId: 7n, client: context.client }, amountData(amount))
    event(c.escrow, ERC8183_ABI, "JobRejected", { jobId: 7n, rejector: c.evaluator }, action.reason!)
    event(c.hook, ARCADE_JOB_HOOK_ABI, "ArcadeRefused", { jobId: 7n }, action.reason!)
  } else {
    const fee = amount * 500n / 10000n
    if (fee > 0n) {
      transfer(context.treasury, fee)
      event(c.escrow, ERC8183_ABI, "PlatformFeePaid", { jobId: 7n, treasury: context.treasury }, amountData(fee))
    }
    transfer(c.provider, amount - fee)
    event(c.escrow, ERC8183_ABI, "PaymentReleased", { jobId: 7n, recipient: c.provider }, amountData(amount - fee))
    event(c.escrow, ERC8183_ABI, "JobCompleted", { jobId: 7n, evaluator: c.evaluator }, action.reason!)
    event(c.hook, ARCADE_JOB_HOOK_ABI, "ArcadeSettled", { jobId: 7n },
      encodeAbiParameters(parseAbiParameters("bytes32,uint32,uint256,bytes32"), [ERC8183_ZERO_HASH, 0, 0n, action.receipt!.hash]))
  }
  const receipt: TransactionReceipt = { transactionHash: signed.hash, blockNumber: 51n, blockHash: hash(51), transactionIndex: 0,
    from: c.evaluator, to: c.escrow, status: "success", type: "eip1559", gasUsed: 100000n, effectiveGasPrice: 2n,
    cumulativeGasUsed: 100000n, contractAddress: null, logsBloom: "0x", logs }
  const mined = { hash: signed.hash, from: c.evaluator, to: c.escrow, input: action.data, value: 0n, nonce: 3,
    chainId: 5042002, blockNumber: 51n, blockHash: hash(51) }
  const after = { ...snapshot, blockNumber: 51n, blockHash: hash(51), timestamp: 1001,
    job: { ...snapshot.job, budget: amount, paymentToken: c.token,
      status: ({ budget: 0, submit: 2, complete: 3, reject: 4 } as const)[kind],
      submittedAt: kind === "submit" ? 1001 : snapshot.job.submittedAt } }
  return { context, action, transaction, terms, raw, signed, logs, receipt, mined, after }
}
describe("escrow signed-intent and independent receipt proofs (offline)", () => {
  it.each(["budget", "submit", "complete", "reject"] as const)("checks real local transaction signature and exact %s logs/state", async kind => {
    const f = await fixture(kind)
    expect(assertEscrowActionReceipt(f.action, f.signed, f.mined, f.receipt, f.after)).toMatchObject({ kind, txHash: f.signed.hash,
      feeAtomic: kind === "complete" ? 15000n : 0n, sellerAtomic: kind === "complete" ? 285000n : 0n,
      refundAtomic: kind === "reject" ? 300000n : 0n })
  })
  it("accepts source-accurate zero rounded platform fee without inventing a fee event", async () => {
    const f = await fixture("complete", 19n)
    expect(f.logs).toHaveLength(4)
    expect(assertEscrowActionReceipt(f.action, f.signed, f.mined, f.receipt, f.after))
      .toMatchObject({ feeAtomic: 0n, sellerAtomic: 19n })
  })
  it("refuses changed signed transaction destination, input, value, chain, nonce, gas/fees or signer", async () => {
    const f = await fixture()
    for (const delta of [{ to: addr(9) }, { data: "0x" as Hex }, { value: 1n }, { chainId: 1 },
      { nonce: 4 }, { gas: 1000001n }, { maxFeePerGas: 3n }, { maxPriorityFeePerGas: 1n }]) {
      const raw = await evaluator.signTransaction({ ...f.transaction, ...delta })
      await expect(assertEscrowSignedAction(f.action, raw, f.terms)).rejects.toThrow("escrow_facts_refused")
    }
    await expect(assertEscrowSignedAction(f.action, await provider.signTransaction(f.transaction), f.terms))
      .rejects.toThrow("escrow_facts_refused")
    await expect(assertEscrowSignedAction(f.action, f.raw, { ...f.terms, gasCapWei: 1999999n }))
      .rejects.toThrow("escrow_facts_refused")
  })
  it("refuses receipt success/hash alone when monetary or hook evidence is absent, duplicated or changed", async () => {
    const f = await fixture()
    for (let index = 0; index < f.logs.length; index++) {
      const logs = f.logs.filter((_, i) => i !== index)
      expect(() => assertEscrowActionReceipt(f.action, f.signed, f.mined, { ...f.receipt, logs }, f.after))
        .toThrow("escrow_facts_refused")
    }
    const changed = f.logs.map((log, i) => i === 0 ? { ...log, data: amountData(1n) } : log)
    expect(() => assertEscrowActionReceipt(f.action, f.signed, f.mined, { ...f.receipt, logs: changed }, f.after))
      .toThrow("escrow_facts_refused")
    const duplicate = [...f.logs, { ...f.logs.at(-1)!, logIndex: f.logs.length }]
    expect(() => assertEscrowActionReceipt(f.action, f.signed, f.mined, { ...f.receipt, logs: duplicate }, f.after))
      .toThrow("escrow_facts_refused")
  })
  it("refuses reverted, untyped, misidentified or over-cap receipts and invalid snapshot time", async () => {
    const f = await fixture()
    const changes: Partial<TransactionReceipt>[] = [{ status: "reverted" }, { type: "legacy" },
      { transactionHash: hash(9) }, { transactionIndex: -1 }, { transactionIndex: NaN },
      { gasUsed: 1000001n }, { effectiveGasPrice: 3n }, { blockHash: hash(9) }]
    for (const delta of changes) {
      expect(() => assertEscrowActionReceipt(f.action, f.signed, f.mined, { ...f.receipt, ...delta }, f.after))
        .toThrow("escrow_facts_refused")
    }
    expect(() => assertEscrowActionReceipt(f.action, f.signed, f.mined, f.receipt, { ...f.after, timestamp: NaN }))
      .toThrow("escrow_facts_refused")
  })
  it("rejects removed/reordered/wrong-block logs, a wrong fetched transaction and wrong on-chain poststate", async () => {
    const f = await fixture()
    for (const delta of [{ removed: true }, { blockHash: hash(9) }, { transactionHash: hash(9) }, { transactionIndex: 1 }]) {
      const logs = f.logs.map((log, i) => i === 0 ? { ...log, ...delta } : log)
      expect(() => assertEscrowActionReceipt(f.action, f.signed, f.mined, { ...f.receipt, logs }, f.after))
        .toThrow("escrow_facts_refused")
    }
    for (const delta of [{ nonce: 9 }, { input: "0x" as Hex }, { from: addr(9) }, { value: 1n }]) {
      expect(() => assertEscrowActionReceipt(f.action, f.signed, { ...f.mined, ...delta }, f.receipt, f.after))
        .toThrow("escrow_facts_refused")
    }
    for (const delta of [{ status: 2 }, { settledAmount: 300000n }, { budget: 1n }, { payoutReceiver: addr(9) }]) {
      expect(() => assertEscrowActionReceipt(f.action, f.signed, f.mined, f.receipt, { ...f.after, job: { ...f.after.job, ...delta } }))
        .toThrow("escrow_facts_refused")
    }
    expect(() => assertEscrowActionReceipt(f.action, f.signed, f.mined, f.receipt, { ...f.after, blockHash: hash(9) }))
      .toThrow("escrow_facts_refused")
  })
})
