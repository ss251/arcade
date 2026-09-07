import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { Receipt } from "../src/receipt.ts"
const hash = "0x" + "1".repeat(64)
const base = { protocol: "arcade:erc8183:terminal:v1", chainId: 5042002,
  escrow: "0x" + "2".repeat(40), jobId: "7", requestHash: hash, amountAtomic: "10001" }
const proof = { txHash: hash, blockHash: "0x" + "3".repeat(64), blockNumber: "50", blockTimestamp: 1000,
  submittedAt: 900, gasWei: "100", sellerAtomic: "9501", feeAtomic: "500", refundAtomic: "0" }
const raw = (escrow?: unknown) => ({ jobId: "job_" + "a".repeat(32), skillId: "skill", skillVersion: "1.0.0",
  buyer: "0x" + "4".repeat(40), seller: "0x" + "5".repeat(40), priceAtomic: 10001n, sellerAtomic: 9501n,
  feeAtomic: 500n, feeBps: 500, rail: "erc8183", network: "eip155:5042002", latencyMs: 1, settled: true,
  reason: "ok", createdAtMs: 1000000, ...(escrow === undefined ? {} : { escrow }) })
const decode = Schema.decodeUnknownSync(Receipt)
describe("closed escrow terminal receipt metadata", () => {
  it("retains confirmed movement separately from quoted receipt allocation", () => {
    const metadata = { ...base, state: "settled", ...proof }
    expect(decode(raw(metadata))).toHaveProperty("escrow", metadata)
  })
  it("does not silently strip forged uncertainty proof or malformed financial facts", () => {
    for (const metadata of [
      { ...base, state: "uncertain", txHash: hash },
      { ...base, state: "settled", ...proof, feeAtomic: "501", sellerAtomic: "9500" },
      { ...base, state: "refunded", ...proof, refundAtomic: "10001" },
      { ...base, state: "uncertain", private: "unexpected" },
      { ...base, state: "settled", ...proof, jobId: "07" },
      { ...base, state: "settled", ...proof, submittedAt: 1001 }
    ]) expect(() => decode(raw(metadata))).toThrow()
  })
  it("preserves honest refund and uncertainty without changing the quoted price", () => {
    for (const metadata of [{ ...base, state: "uncertain" },
      { ...base, ...proof, state: "refunded", submittedAt: 0, sellerAtomic: "0", feeAtomic: "0", refundAtomic: "10001" }]) {
      const receipt = decode({ ...raw(metadata), settled: false })
      expect(receipt.escrow).toEqual(metadata)
      expect(receipt.priceAtomic).toBe(10001n)
    }
  })
  it("does not execute metadata getters, even discriminators", () => {
    let calls = 0
    for (const key of ["state", "amountAtomic", "private"]) {
      const metadata = { ...base, state: "uncertain" }
      Object.defineProperty(metadata, key, { enumerable: true, get() { calls++; return "uncertain" } })
      expect(() => decode(raw(metadata))).toThrow()
    }
    expect(calls).toBe(0)
  })
  it.each(["negative", "overflow", "zero principal", "fractional time", "uppercase", "prototype", "symbol", "hidden"])("refuses %s", mode => {
    const metadata = { ...base, ...proof, state: "settled" }
    if (mode === "negative") metadata.gasWei = "-1"
    if (mode === "overflow") metadata.amountAtomic = String(2n ** 256n)
    if (mode === "zero principal") metadata.amountAtomic = "0"
    if (mode === "fractional time") metadata.blockTimestamp = 1.5
    if (mode === "uppercase") metadata.txHash = "0x" + "A".repeat(64)
    if (mode === "prototype") Object.setPrototypeOf(metadata, { hidden: true })
    if (mode === "symbol") Object.defineProperty(metadata, Symbol(), { value: 1 })
    if (mode === "hidden") Object.defineProperty(metadata, "hidden", { value: 1 })
    expect(() => decode(raw(metadata))).toThrow()
  })
})
