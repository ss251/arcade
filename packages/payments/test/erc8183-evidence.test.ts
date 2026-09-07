import { describe, expect, it } from "vitest"
import type { Hex, TransactionReceipt } from "viem"
import { assertEscrowActionReceipt, assertEscrowSignedAction, captureEscrowTransactionTerms } from "../src/erc8183-evidence.ts"
import { fixture, addr, hash, evaluator, provider, amountData } from "./fixtures/erc8183-action.ts"

describe("escrow signed-intent and independent receipt proofs (offline)", () => {
  it("captures a closed gas policy without evaluating accessors or retaining mutations", async () => {
    const f = await fixture(), mutable = { ...f.terms }, captured = captureEscrowTransactionTerms(mutable)
    mutable.gasCapWei = 1n
    expect(captured.gasCapWei).toBe(2000000n); expect(Object.isFrozen(captured)).toBe(true)
    let invoked = false
    expect(() => captureEscrowTransactionTerms({ ...f.terms, get gas() { invoked = true; return 1000000n } }))
      .toThrow("escrow_facts_refused")
    expect(invoked).toBe(false)
    for (const changed of [{ nonce: -1 }, { gas: 0n }, { maxPriorityFeePerGas: 3n }, { gasCapWei: 1999999n }, { extra: true }]) {
      expect(() => captureEscrowTransactionTerms({ ...f.terms, ...changed })).toThrow("escrow_facts_refused")
    }
  })
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
