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
const ROOT_TX = `0x${"a".repeat(64)}`
const CHILD_TX = `0x${"b".repeat(64)}`

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
  settleTx: ROOT_TX,
  rail: "eip3009",
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
      settleTx: CHILD_TX
    })
  ]
})

describe("publicReceipt", () => {
  it("excludes the private session identifier while preserving existing public evidence", () => {
    const sessionId = `ses_${"a".repeat(32)}`
    const pub = publicReceipt(Receipt.make({ ...receipt, sessionId }))
    expect(JSON.stringify(pub)).not.toContain(sessionId)
    expect(pub).not.toHaveProperty("sessionId")
    expect(pub).toHaveProperty("session", true)
    expect(pub).toMatchObject({ skillId: "parent", rail: "test", network: "eip155:5042002", priceAtomic: "250000" })
  })

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

  it("keeps tree shape and opaque simulated references without inventing explorer links", () => {
    const pub = publicReceipt(receipt)
    expect(pub.treeCeilingAtomic).toBe("50000")
    expect(pub.treeCommittedAtomic).toBe("10000")
    expect(pub.children).toEqual([
      {
        skillId: "child",
        priceAtomic: "10000",
        price: "$0.01",
        settled: true,
        settleTx: CHILD_TX,
        explorer: `https://testnet.arcscan.app/tx/${CHILD_TX}`
      }
    ])
  })

  it("stringifies atomic fields but does not link a simulated malformed reference", () => {
    const pub = publicReceipt(receipt)
    expect(pub.priceAtomic).toBe("250000")
    expect(pub.sellerAtomic).toBe("237500")
    expect(pub.feeAtomic).toBe("12500")
    expect(pub.explorer).toBe(`https://testnet.arcscan.app/tx/${ROOT_TX}`)
  })

  it("keeps empty children and omits absent tree budgets (a plain child receipt)", () => {
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
    expect(pub.children).toEqual([])
    expect(pub).not.toHaveProperty("treeCeilingAtomic")
    expect(pub).not.toHaveProperty("treeCommittedAtomic")
    expect(pub).not.toHaveProperty("jobId")
  })

  it("preserves legacy EIP root and child reference inspection on the recorded network", () => {
    const tx = `0x${"A1".repeat(32)}`, childTx = `0x${"b2".repeat(32)}`
    const pub = publicReceipt(Receipt.make({ ...receipt, rail: "eip3009", settleTx: tx,
      children: [ReceiptChild.make({ ...receipt.children![0]!, settleTx: childTx })] }))
    expect(pub.explorer).toBe(`https://testnet.arcscan.app/tx/${tx}`)
    expect(pub.children?.[0]?.explorer).toBe(`https://testnet.arcscan.app/tx/${childTx}`)
  })

  it.each(["00000000-0000-4000-8000-000000000001", `0x${"a".repeat(64)}`])(
    "keeps a Gateway transfer reference opaque: %s", settleTx => {
      const pub = publicReceipt(Receipt.make({ ...receipt, rail: "gateway", settleRefKind: "gateway-transfer", settleTx }))
      expect(pub.explorer).toBeNull()
      expect(pub.settleTx).toBe(settleTx)
      expect(pub.children?.[0]?.explorer).toBeNull()
    })

  it("does not let a released root erase a separately settled EIP child reference", () => {
    const childTx = `0x${"b".repeat(64)}`
    const pub = publicReceipt(Receipt.make({ ...receipt, rail: "eip3009", settled: false, settleTx: `0x${"a".repeat(64)}`,
      children: [ReceiptChild.make({ ...receipt.children![0]!, settleTx: childTx })] }))
    expect(pub.explorer).toBeNull()
    expect(pub.children?.[0]?.explorer).toBe(`https://testnet.arcscan.app/tx/${childTx}`)
  })

  it("scrubs the pipeline child-job fallback alias without changing monetary evidence", () => {
    const pub = publicReceipt(Receipt.make({ ...receipt,
      children: [ReceiptChild.make({ ...receipt.children![0]!, skillId: CHILD_JOB_ID })] }))
    expect(pub.children?.[0]).toMatchObject({ skillId: "unknown-skill", priceAtomic: "10000", settled: true })
    expect(JSON.stringify(pub)).not.toContain(CHILD_JOB_ID)
  })

  it.each([undefined, `ses_${"A".repeat(32)}`, `ses_${"a".repeat(31)}`, `ses_${"a".repeat(32)}\n`])(
    "overwrites forged public session provenance when the private ID is not canonical", sessionId => {
      const raw = Receipt.make({ ...receipt, ...(sessionId === undefined ? {} : { sessionId }) })
      const pub = publicReceipt(Object.assign(raw, { session: true }))
      expect(pub).toHaveProperty("session", false)
      expect(pub).not.toHaveProperty("sessionId")
      expect(pub.children?.[0]).not.toHaveProperty("session")
    })

  it("preserves canary and session provenance independently without exposing the session ID", () => {
    const sessionId = `ses_${"a".repeat(32)}`
    const pub = publicReceipt(Receipt.make({ ...receipt, canary: true, settled: false, sessionId }))
    expect(pub).toMatchObject({ canary: true, session: true, settled: false })
    expect(JSON.stringify(pub)).not.toContain(sessionId)
  })

  it.each([undefined, "gateway-batch"] as const)("keeps a present ineligible kind from becoming eligible legacy absence", settleRefKind => {
    const raw = Receipt.make({ ...receipt, rail: "eip3009", settleTx: `0x${"a".repeat(64)}`, settleRefKind })
    const pub = publicReceipt(raw)
    expect(Object.hasOwn(raw, "settleRefKind")).toBe(true)
    expect(pub).toHaveProperty("settleRefKind", "unrecognized")
    expect(pub.explorer).toBeNull()
    expect(JSON.parse(JSON.stringify(pub))).toHaveProperty("settleRefKind", "unrecognized")
  })

  it("preserves true legacy kind absence in public JSON", () => {
    const pub = publicReceipt(receipt)
    expect(pub).not.toHaveProperty("settleRefKind")
  })

  it.each(["onchain", "gateway-transfer", "test"] as const)("retains the safe present reference kind %s", settleRefKind => {
    const pub = publicReceipt(Receipt.make({ ...receipt, settleRefKind }))
    expect(pub).toHaveProperty("settleRefKind", settleRefKind)
  })

  it.each(["unknown-kind", null, { privateDiagnostic: "do-not-project-fixture" }])(
    "normalizes a malformed runtime kind without retaining its private value", settleRefKind => {
      const pub = publicReceipt(Object.assign(Receipt.make({ ...receipt, rail: "eip3009", settleTx: `0x${"a".repeat(64)}` }), { settleRefKind }))
      expect(pub.explorer).toBeNull()
      expect(pub).toHaveProperty("settleRefKind", "unrecognized")
      expect(JSON.stringify(pub)).not.toContain("do-not-project-fixture")
      expect(JSON.stringify(pub)).not.toContain("unknown-kind")
    })

  it("does not mutate the trusted root or compact child records", () => {
    const child = Object.freeze(ReceiptChild.make({ ...receipt.children![0]! }))
    const raw = Object.freeze(Receipt.make({ ...receipt, children: [child], sessionId: `ses_${"a".repeat(32)}` }))
    expect(() => publicReceipt(raw)).not.toThrow()
    expect(raw).not.toHaveProperty("session")
    expect(child.skillId).toBe("child")
    expect(child).not.toHaveProperty("explorer")
  })
})
