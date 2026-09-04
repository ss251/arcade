import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { Receipt, ReceiptChild, treeHashOf } from "../src/receipt.ts"
import { Job } from "../src/job.ts"
import { JobAssignment } from "../src/protocol.ts"

describe("receipt tree fields", () => {
  const child = ReceiptChild.make({ jobId: "job_child00000000000", skillId: "usdc-flow-check", priceAtomic: 10000n, settled: true, settleTx: "0xabc" })
  it("hashes deterministically regardless of child order", () => {
    const a = ReceiptChild.make({ ...child, jobId: "job_a0000000000000000" })
    const b = ReceiptChild.make({ ...child, jobId: "job_b0000000000000000" })
    expect(treeHashOf("job_root000000000000", [a, b])).toBe(treeHashOf("job_root000000000000", [b, a]))
    expect(treeHashOf("job_root000000000000", [a, b])).toMatch(/^0x[0-9a-f]{64}$/)
  })
  it("old receipts without tree fields still decode", () => {
    const r = Schema.decodeUnknownSync(Receipt)({
      jobId: "job_x000000000000000", skillId: "s", skillVersion: "1", buyer: "0xb", seller: "0xs",
      priceAtomic: 1n, sellerAtomic: 1n, feeAtomic: 0n, feeBps: 0, rail: "test", network: "eip155:1",
      latencyMs: 1, settled: false, reason: "r", createdAtMs: 1
    })
    expect(r.children).toBeUndefined()
  })
  it("Job and JobAssignment accept lineage fields", () => {
    const j = Job.make({ id: "job_x000000000000000", skillId: "s", seller: "0xs", buyer: "0xb", priceAtomic: 1n, input: {}, status: "queued", createdAtMs: 1, rootJobId: "job_x000000000000000", hop: 0, ancestors: [] })
    expect(j.hop).toBe(0)
    const a = JobAssignment.make({ jobId: "job_x000000000000000", skillId: "s", skillVersion: "1", input: {}, timeoutSec: 5, parentJobId: "job_p000000000000000", hireCapability: "a.b" })
    expect(a.hireCapability).toBe("a.b")
  })
})
