import { describe, expect, it } from "vitest"
import { Receipt, ReceiptChild } from "@arcade/core"
import { publicReceipt } from "../src/receipts-feed.ts"

/**
 * `/receipts` is the PUBLIC feed — unauthenticated, anyone can fetch it. `publicReceipt` is
 * what keeps it from doubling as a way to read someone else's job (`jobId` is the
 * capability `/jobs/:id/result` gates on) or their settlement's authorization nonce.
 */

const ROOT_JOB_ID = "job_root000000000000"
const CHILD_JOB_ID = "job_child00000000000"

const receipt = Receipt.make({
  jobId: ROOT_JOB_ID,
  skillId: "parent",
  skillVersion: "1.0.0",
  buyer: "0xbuyer0000000000000000000000000000000000",
  seller: "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF",
  priceAtomic: 250_000n,
  sellerAtomic: 237_500n,
  feeAtomic: 12_500n,
  feeBps: 500,
  settleTx: "0xdeadbeef",
  rail: "test",
  network: "eip155:5042002",
  latencyMs: 42,
  settled: true,
  reason: "ok",
  createdAtMs: 0,
  rootJobId: ROOT_JOB_ID,
  hop: 0,
  ancestors: [],
  authorizationNonce: "0xnoncenoncenonce",
  treeCeilingAtomic: 50_000n,
  treeCommittedAtomic: 10_000n,
  children: [
    ReceiptChild.make({
      jobId: CHILD_JOB_ID,
      skillId: "child",
      priceAtomic: 10_000n,
      settled: true,
      settleTx: "0xchildtx"
    })
  ]
})

describe("publicReceipt", () => {
  it("carries no jobId, buyer, or authorizationNonce at any depth", () => {
    const pub = publicReceipt(receipt)
    const json = JSON.stringify(pub, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    expect(json).not.toContain(ROOT_JOB_ID)
    expect(json).not.toContain(CHILD_JOB_ID)
    expect(json).not.toContain("authorizationNonce")
    expect(json).not.toContain(receipt.authorizationNonce)
    expect(json).not.toContain(receipt.buyer)
    expect(pub).not.toHaveProperty("jobId")
    expect(pub).not.toHaveProperty("buyer")
    expect(pub).not.toHaveProperty("authorizationNonce")
  })

  it("keeps the tree shape a public reader needs: skillId, price, settled, tx, explorer", () => {
    const pub = publicReceipt(receipt)
    expect(pub.treeCeilingAtomic).toBe("50000")
    expect(pub.treeCommittedAtomic).toBe("10000")
    expect(pub.children).toEqual([
      {
        skillId: "child",
        priceAtomic: "10000",
        settled: true,
        settleTx: "0xchildtx",
        explorer: expect.stringContaining("0xchildtx")
      }
    ])
  })

  it("stringifies the top-level atomic fields and still computes price/explorer", () => {
    const pub = publicReceipt(receipt)
    expect(pub.priceAtomic).toBe("250000")
    expect(pub.sellerAtomic).toBe("237500")
    expect(pub.feeAtomic).toBe("12500")
    expect(pub.explorer).toContain("0xdeadbeef")
  })

  it("omits children/treeCeilingAtomic/treeCommittedAtomic when the receipt has none (a plain child receipt)", () => {
    const child = Receipt.make({
      jobId: CHILD_JOB_ID,
      skillId: "child",
      skillVersion: "1.0.0",
      buyer: "0xbuyer0000000000000000000000000000000000",
      seller: "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF",
      priceAtomic: 10_000n,
      sellerAtomic: 9_500n,
      feeAtomic: 500n,
      feeBps: 500,
      rail: "test",
      network: "eip155:5042002",
      latencyMs: 10,
      settled: false,
      reason: "refused",
      createdAtMs: 0,
      rootJobId: ROOT_JOB_ID,
      parentJobId: ROOT_JOB_ID,
      hop: 1,
      ancestors: ["parent"]
    })
    const pub = publicReceipt(child)
    expect(pub).not.toHaveProperty("children")
    expect(pub).not.toHaveProperty("treeCeilingAtomic")
    expect(pub).not.toHaveProperty("treeCommittedAtomic")
    expect(pub).not.toHaveProperty("jobId")
  })
})
