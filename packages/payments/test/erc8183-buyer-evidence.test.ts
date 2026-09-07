import { describe, expect, it } from "vitest"
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, keccak256, parseAbiParameters, type Hex } from "viem"
import { ERC8183_ABI } from "../src/erc8183-abi.ts"
import { setBudgetAuthorization } from "../src/erc8183-auth.ts"
import { assertEscrowSignedTransaction } from "../src/erc8183-evidence.ts"
import { assertEscrowBuyerReceipt, assertEscrowBuyerSigned, escrowBuyerCreatedJobId, assertEscrowBuyerBudgetReceipt } from "../src/erc8183-buyer-evidence.ts"
import { buyerFixture, buyer, evaluator, provider, addr, hash } from "./fixtures/erc8183-buyer.ts"
describe("buyer escrow transaction proofs (synthetic chain, ephemeral keys)", () => {
  it.each(["create", "approve", "fund"] as const)("proves %s without claiming settlement or retaining raw secrets", async kind => {
    const f = await buyerFixture(kind), proof = assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, f.receipt, f.after, f.allowanceAtomic)
    expect(proof).toMatchObject({ kind, txHash: keccak256(f.raw), jobId: 7n, gasWei: 200000n,
      fundedAtomic: kind === "fund" ? 300000n : 0n, gasPayer: f.intent.client })
    const publicJson = JSON.stringify(proof, (_, v) => typeof v === "bigint" ? v.toString() : v)
    expect(publicJson).not.toContain(f.input.capability); expect(publicJson).not.toContain(f.raw)
    expect("settled" in proof).toBe(false); expect("sellerAtomic" in proof).toBe(false); expect(Object.isFrozen(proof)).toBe(true)
  })
  it("treats created job ID as a lookup hint until full readback verifies description and agent", async () => {
    const f = await buyerFixture()
    expect(escrowBuyerCreatedJobId(f.action!, f.signed!, f.receipt)).toBe(7n)
    for (const job of [{ ...f.after.job, description: "other" }, { ...f.after.job, providerAgentId: 9n }]) {
      expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, f.receipt, { ...f.after, job })).toThrow("escrow_facts_refused")
    }
  })
  it("verifies a separately mined provider-authorized budget relay, not only its HTTP hash", async () => {
    const f = await buyerFixture("budget")
    await expect(assertEscrowBuyerBudgetReceipt(f.intent, 7n, f.raw, f.tx, f.receipt, f.after)).resolves.toMatchObject({
      kind: "budget", jobId: 7n, txHash: f.tx.hash, gasPayer: f.intent.call.evaluator, fundedAtomic: 0n, gasWei: 200000n
    })
  })
  it.each([
    { chainId: 1 }, { nonce: 4 }, { value: 1n }, { to: addr(99) }, { data: "0x1234" },
    { gas: 1000001n }, { maxFeePerGas: 3n }, { maxPriorityFeePerGas: 1n }, { accessList: [{ address: addr(99), storageKeys: [] }] }
  ])("refuses a signed transaction differing from prepared buyer intent: %o", async patch => {
    const f = await buyerFixture(), raw = await buyer.signTransaction({ ...f.transaction, ...patch } as typeof f.transaction)
    await expect(assertEscrowBuyerSigned(f.action!, raw, f.terms)).rejects.toThrow("escrow_facts_refused")
  })
  it("rejects wrong signer, copied authority and a gas term beyond total buyer budget", async () => {
    const f = await buyerFixture(), raw = await evaluator.signTransaction(f.transaction)
    await expect(assertEscrowBuyerSigned(f.action!, raw, f.terms)).rejects.toThrow("escrow_facts_refused")
    await expect(assertEscrowBuyerSigned({ ...f.action! }, f.raw, f.terms)).rejects.toThrow("escrow_facts_refused")
    expect(() => assertEscrowBuyerReceipt(f.action!, { ...f.signed! }, f.tx, f.receipt, f.after)).toThrow("escrow_facts_refused")
    await expect(assertEscrowBuyerSigned(f.action!, f.raw, { ...f.terms, gasCapWei: 6000001n })).rejects.toThrow("escrow_facts_refused")
  })
  it.each([
    { status: "reverted" }, { transactionHash: hash(99) }, { blockHash: hash(99) }, { blockNumber: 52n }, { type: "legacy" },
    { from: addr(99) }, { to: addr(99) }, { contractAddress: addr(99) }, { gasUsed: 1000001n }, { effectiveGasPrice: 3n }
  ])("rejects mismatched receipt facts: %o", async patch => {
    const f = await buyerFixture()
    expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, { ...f.receipt, ...patch } as typeof f.receipt, f.after))
      .toThrow("escrow_facts_refused")
  })
  it.each(["create", "approve", "fund"] as const)("checks separately fetched mined transaction and full %s job", async kind => {
    const f = await buyerFixture(kind)
    for (const patch of [{ chainId: 1 }, { hash: hash(99) }, { from: addr(99) }, { to: addr(99) }, { input: "0x1234" },
      { value: 1n }, { nonce: 4 }, { blockHash: hash(99) }, { blockNumber: 52n }]) {
      expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, { ...f.tx, ...patch }, f.receipt, f.after, f.allowanceAtomic))
        .toThrow("escrow_facts_refused")
    }
    for (const patch of [{ chainId: 1 }, { escrow: addr(99) }, { jobId: 8n }, { blockNumber: 52n }, { blockHash: hash(99) },
      { pendingClaimHash: hash(99) }, { timestamp: 999 }, { timestamp: 2141 }]) {
      expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, f.receipt, { ...f.after, ...patch }, f.allowanceAtomic))
        .toThrow("escrow_facts_refused")
    }
    for (const patch of [{ client: addr(99) }, { provider: addr(99) }, { evaluator: addr(99) }, { hook: addr(99) },
      { providerAgentId: 99n }, { description: "changed" }, { budget: 1n }, { paymentToken: addr(99) }, { status: 4 },
      { expiredAt: 2801 }, { submittedAt: 1 }, { settledAmount: 1n }, { payoutReceiver: addr(99) }]) {
      expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, f.receipt, { ...f.after, job: { ...f.after.job, ...patch } }, f.allowanceAtomic))
        .toThrow("escrow_facts_refused")
    }
  })
  it.each(["create", "approve", "fund"] as const)("rejects wrong or duplicate %s logs and log metadata", async kind => {
    const f = await buyerFixture(kind)
    for (const patch of [{ address: addr(99) }, { data: "0x" }, { topics: [hash(99)] }, { removed: true },
      { transactionHash: hash(99) }, { blockHash: hash(99) }, { blockNumber: 52n }, { transactionIndex: 1 }, { logIndex: -1 }]) {
      const logs = f.receipt.logs.map((log, i) => i ? log : { ...log, ...patch })
      expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, { ...f.receipt, logs }, f.after, f.allowanceAtomic))
        .toThrow("escrow_facts_refused")
    }
    for (const logs of [[], [...f.receipt.logs, { ...f.receipt.logs[0]!, logIndex: 3 }], Array(129).fill(f.receipt.logs[0])]) {
      expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, { ...f.receipt, logs }, f.after, f.allowanceAtomic))
        .toThrow("escrow_facts_refused")
    }
  })
  it("accepts only an optional exact consumed-allowance event before JobFunded, never unlimited or duplicate events", async () => {
    const f = await buyerFixture("fund"), approval = f.approval(0n), [transfer, funded] = f.receipt.logs
    const reindex = (logs: typeof f.receipt.logs) => logs.map((log, logIndex) => ({ ...log, logIndex }))
    for (const logs of [[approval, transfer!, funded!], [transfer!, approval, funded!]]) {
      expect(assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, { ...f.receipt, logs: reindex(logs) }, f.after, 0n).fundedAtomic).toBe(300000n)
    }
    for (const logs of [[transfer!, funded!, approval], [f.approval(1n), transfer!, funded!],
      [approval, approval, transfer!, funded!], [funded!, transfer!]]) {
      expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, { ...f.receipt, logs: reindex(logs) }, f.after, 0n))
        .toThrow("escrow_facts_refused")
    }
    for (const allowance of [undefined, 1n, 300000n, (1n << 256n) - 1n]) {
      expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, f.receipt, f.after, allowance)).toThrow("escrow_facts_refused")
    }
    const a = await buyerFixture("approve")
    for (const allowance of [undefined, 0n, 299999n, 300001n]) {
      expect(() => assertEscrowBuyerReceipt(a.action!, a.signed!, a.tx, a.receipt, a.after, allowance)).toThrow("escrow_facts_refused")
    }
  })
  it("does not substitute native/system-emitter transfers for six-decimal ERC-20 principal", async () => {
    const f = await buyerFixture("fund"), native = { ...f.receipt.logs[0]!, address: addr(99), logIndex: 2,
      data: encodeAbiParameters(parseAbiParameters("uint256"), [300000n * 10n ** 12n]) }
    const withNative = { ...f.receipt, logs: [...f.receipt.logs, native] }
    expect(assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, withNative, f.after, 0n).fundedAtomic).toBe(300000n)
    expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, { ...f.receipt,
      logs: [{ ...native, logIndex: 0 }, f.receipt.logs[1]!] }, f.after, 0n)).toThrow("escrow_facts_refused")
  })
  it("rejects getter-bearing receipts, logs, snapshots and sparse topic arrays without invoking accessors", async () => {
    const f = await buyerFixture(); let reads = 0
    const hostile = { ...f.receipt, get gasUsed() { reads++; return 100000n } }
    expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, hostile, f.after)).toThrow("escrow_facts_refused")
    const log = { ...f.receipt.logs[0]!, get data() { reads++; return "0x" } }
    expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, { ...f.receipt, logs: [log] }, f.after)).toThrow("escrow_facts_refused")
    expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, { ...f.tx, get nonce() { reads++; return 3 } }, f.receipt, f.after))
      .toThrow("escrow_facts_refused")
    expect(() => assertEscrowBuyerReceipt(f.action!, f.signed!, f.tx, f.receipt,
      { ...f.after, job: { ...f.after.job, get description() { reads++; return "changed" } } })).toThrow("escrow_facts_refused")
    const topics = [...f.receipt.logs[0]!.topics]; delete topics[1]
    expect(() => escrowBuyerCreatedJobId(f.action!, f.signed!, { ...f.receipt, logs: [{ ...f.receipt.logs[0], topics }] }))
      .toThrow("escrow_facts_refused")
    expect(reads).toBe(0)
  })
  it("captures mutable signing intent before recovery and refuses signing getters without invoking them", async () => {
    const f = await buyerFixture(), intent = { sender: f.action!.sender, to: f.action!.to, data: f.action!.data }
    const pending = assertEscrowSignedTransaction(intent, f.raw, f.terms)
    intent.sender = addr(99); intent.data = "0x1234"
    await expect(pending).resolves.toMatchObject({ hash: f.tx.hash })
    let reads = 0
    await expect(assertEscrowSignedTransaction({ ...intent, get sender() { reads++; return buyer.address } }, f.raw, f.terms))
      .rejects.toThrow(/^escrow_facts_refused$/)
    expect(reads).toBe(0)
  })
  it("captures budget proof facts before async signature verification", async () => {
    const f = await buyerFixture("budget"), pending = assertEscrowBuyerBudgetReceipt(f.intent, 7n, f.raw, f.tx, f.receipt, f.after)
    f.after.job.description = "changed after invocation"; f.tx.input = "0x1234"; f.receipt.logs[0]!.data = "0x1234"
    await expect(pending).resolves.toMatchObject({ jobId: 7n, fundedAtomic: 0n, gasWei: 200000n })
  })
  it.each(["amount", "token", "job", "opts", "signature", "signer", "deadline_expired", "deadline_too_long", "relayer"])
    ("rejects a mined budget with changed %s even if receipt and raw hash agree", async problem => {
      const f = await buyerFixture("budget"), decoded = decodeFunctionData({ abi: ERC8183_ABI, data: f.transaction.data })
      if (decoded.functionName !== "setBudgetWithAuthorization") throw Error("fixture")
      const [jobId, token, amount, opts, auth] = decoded.args
      const changed = { ...auth }
      if (problem === "signature") changed.sig = await buyer.signTypedData(setBudgetAuthorization(f.auth, 1000))
      if (problem === "signer") changed.signer = buyer.address
      if (problem.startsWith("deadline")) {
        changed.deadline = problem === "deadline_expired" ? 1001n : 1602n
        changed.sig = await provider.signTypedData(setBudgetAuthorization({ ...f.auth, deadline: changed.deadline }, Number(changed.deadline - 600n)))
      }
      const data = encodeFunctionData({ abi: ERC8183_ABI, functionName: "setBudgetWithAuthorization", args: [
        problem === "job" ? 8n : jobId, problem === "token" ? addr(99) : token, problem === "amount" ? 300001n : amount,
        problem === "opts" ? "0x01" : opts, changed
      ] }), signer = problem === "relayer" ? buyer : evaluator
      const raw = await signer.signTransaction({ ...f.transaction, data }), hash = keccak256(raw)
      const tx = { ...f.tx, input: data, hash, from: signer.address }, receipt = { ...f.receipt, transactionHash: hash,
        from: signer.address, logs: f.receipt.logs.map(l => ({ ...l, transactionHash: hash })) }
      await expect(assertEscrowBuyerBudgetReceipt(f.intent, 7n, raw, tx, receipt, f.after)).rejects.toThrow("escrow_facts_refused")
    })
  it("binds budget authorization nonce log, ordering, current job and canonical receipt", async () => {
    const f = await buyerFixture("budget")
    for (const logs of [f.receipt.logs.slice(1), [...f.receipt.logs].reverse().map((l, logIndex) => ({ ...l, logIndex })),
      [{ ...f.receipt.logs[0]!, topics: [f.receipt.logs[0]!.topics[0]!, f.receipt.logs[0]!.topics[1]!, hash(99)] }, f.receipt.logs[1]!]]) {
      await expect(assertEscrowBuyerBudgetReceipt(f.intent, 7n, f.raw, f.tx, { ...f.receipt, logs }, f.after)).rejects.toThrow("escrow_facts_refused")
    }
    for (const patch of [{ jobId: 8n }, { blockHash: hash(99) }, { job: { ...f.after.job, budget: 1n } },
      { job: { ...f.after.job, description: "other" } }, { timestamp: 999 }]) {
      await expect(assertEscrowBuyerBudgetReceipt(f.intent, 7n, f.raw, f.tx, f.receipt, { ...f.after, ...patch })).rejects.toThrow("escrow_facts_refused")
    }
    await expect(assertEscrowBuyerBudgetReceipt({ ...f.intent }, 7n, f.raw, f.tx, f.receipt, f.after)).rejects.toThrow("escrow_facts_refused")
  })
})
