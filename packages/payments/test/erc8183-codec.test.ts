import { describe, expect, it } from "vitest"
import { decodeAbiParameters, decodeFunctionResult, encodeFunctionResult, parseAbiParameters, type Hex } from "viem"
import { ERC8183_ABI } from "../src/erc8183-abi.ts"
import { assertFundedEscrowJob, captureEscrowJob, encodeEscrowCommitment, escrowFeeQuote, ERC8183_ZERO,
  ERC8183_ZERO_HASH, type ExpectedEscrowJob } from "../src/erc8183-codec.ts"
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
const hash = ("0x" + "ab".repeat(32)) as Hex
const expected: ExpectedEscrowJob = { provider: addr(2), evaluator: addr(3), hook: addr(4), token: addr(5), amount: 300000n,
  providerAgentId: 8n, description: "request-bound", timeoutSeconds: 60 }
const job = () => ({ client: addr(1), status: 1, provider: expected.provider, expiredAt: 1660,
  evaluator: expected.evaluator, submittedAt: 0, budget: expected.amount, hook: expected.hook,
  paymentToken: expected.token, providerAgentId: 8n, description: expected.description, settledAmount: 0n, payoutReceiver: ERC8183_ZERO })
describe("pinned escrow facts and commitment codecs", () => {
  it("round-trips the actual named Job tuple and exact expiry boundary", () => {
    const decoded = decodeFunctionResult({ abi: ERC8183_ABI, functionName: "getJob",
      data: encodeFunctionResult({ abi: ERC8183_ABI, functionName: "getJob", result: job() }) })
    const result = captureEscrowJob(decoded)
    expect(result).toEqual(job())
    expect(() => assertFundedEscrowJob(result, ERC8183_ZERO_HASH, expected, 1000)).not.toThrow()
    expect(() => assertFundedEscrowJob(result, ERC8183_ZERO_HASH, expected, 1001)).toThrow("escrow_facts_refused")
  })
  it.each([
    { status: 0 }, { status: 2 }, { status: 3 }, { status: 4 }, { status: 5 },
    { client: ERC8183_ZERO }, { provider: addr(7) }, { evaluator: addr(7) }, { hook: addr(7) },
    { paymentToken: addr(7) }, { budget: 299999n }, { providerAgentId: 9n },
    { description: "other-request" }, { settledAmount: 1n }, { submittedAt: 1 }, { payoutReceiver: addr(7) }
  ])("refuses unsupported or mismatched chain facts", delta => {
    expect(() => assertFundedEscrowJob(captureEscrowJob({ ...job(), ...delta }), ERC8183_ZERO_HASH, expected, 1000))
      .toThrow("escrow_facts_refused")
  })
  it("refuses pending claims but allows an explicit provider-as-payout receiver", () => {
    expect(() => assertFundedEscrowJob(captureEscrowJob(job()), hash, expected, 1000)).toThrow("escrow_facts_refused")
    expect(() => assertFundedEscrowJob(captureEscrowJob({ ...job(), payoutReceiver: expected.provider }),
      ERC8183_ZERO_HASH, expected, 1000)).not.toThrow()
  })
  it("rejects numeric/string uint256s, bad uint48/status, unknown fields and getters without invoking them", () => {
    for (const delta of [{ budget: 300000 }, { budget: "300000" }, { settledAmount: -1n },
      { providerAgentId: 1n << 256n }, { expiredAt: 2 ** 48 }, { status: 1.5 }, { extra: true }, { description: "x".repeat(4097) }]) {
      expect(() => captureEscrowJob({ ...job(), ...delta })).toThrow("escrow_facts_refused")
    }
    let reads = 0; const hostile = Object.defineProperty(job(), "budget", { get() { reads++; return 300000n } })
    expect(() => captureEscrowJob(hostile)).toThrow("escrow_facts_refused")
    expect(reads).toBe(0)
  })
  it("uses source-accurate fee floor and conservation", () => {
    expect(escrowFeeQuote(300000n)).toEqual({ feeAtomic: 15000n, sellerAtomic: 285000n })
    expect(escrowFeeQuote(19n)).toEqual({ feeAtomic: 0n, sellerAtomic: 19n })
    expect(() => escrowFeeQuote(-1n)).toThrow("escrow_facts_refused")
    expect(() => escrowFeeQuote(((1n << 256n) - 1n) / 500n + 1n)).toThrow("escrow_facts_refused")
  })
  it("encodes the exact four-field hook tuple, with a nonzero receipt commitment even for no children", () => {
    const input = { treeHash: hash, childCount: 2, childTotalAtomic: 100000n, receiptHash: hash }
    expect(decodeAbiParameters(parseAbiParameters("bytes32,uint32,uint256,bytes32"), encodeEscrowCommitment(input)))
      .toEqual([hash, 2, 100000n, hash])
    expect(encodeEscrowCommitment({ treeHash: ERC8183_ZERO_HASH, childCount: 0, childTotalAtomic: 0n, receiptHash: hash })).toHaveLength(258)
    for (const delta of [{ childCount: 2 ** 32 }, { childCount: -1 }, { childCount: 0 },
      { treeHash: ERC8183_ZERO_HASH }, { childTotalAtomic: -1n }, { receiptHash: ERC8183_ZERO_HASH }]) {
      expect(() => encodeEscrowCommitment({ ...input, ...delta })).toThrow("escrow_facts_refused")
    }
  })
})
