import { describe, expect, it } from "vitest"
import { Session, SessionCall, SessionReceipt, SESSION_HEADER } from "../src/session.ts"

const fields = { id: `ses_${"1".repeat(32)}`, buyer: `0x${"1".repeat(40)}`, budgetAtomic: 100n, spentAtomic: 0n,
  rail: "gateway" as const, network: "eip155:5042002", openedAtMs: 1 }
const call = { jobId: `job_${"1".repeat(20)}`, skillId: "fixture", priceAtomic: 50n,
  state: "released" as const, settled: false, createdAtMs: 2 }
const receipt = { sessionId: fields.id, buyer: fields.buyer, rail: fields.rail, network: fields.network,
  budgetAtomic: 100n, spentAtomic: 0n, heldAtomic: 0n, calls: [SessionCall.make(call)], settledCalls: 0,
  settlementRefs: [], complete: true as const, openedAtMs: 1, closedAtMs: 3 }
describe("session public schemas are budgets, not financial proofs", () => {
  it("does not expand session schemas when ordinary receipts reserve the escrow rail", () => {
    expect(() => Session.make({ ...fields, rail: "erc8183" })).toThrow()
    expect(() => SessionReceipt.make({ ...receipt, rail: "erc8183" })).toThrow()
  })
  it("retains the exact header and bigint amounts without selecting environment or doing IO", () => {
    expect(SESSION_HEADER).toBe("x-arcade-session")
    expect(Session.make({ ...fields, budgetAtomic: 9007199254740993n }).budgetAtomic).toBe(9007199254740993n)
  })
  it.each([{ budgetAtomic: 0n }, { budgetAtomic: 1n << 256n }, { buyer: `0x${"0".repeat(40)}` },
    { id: "ses_invalid" }, { openedAtMs: NaN }, { openedAtMs: 1.5 }, { network: "eip155:05042002" }])("rejects noncanonical fields %#", extra => {
    expect(() => Session.make({ ...fields, ...extra })).toThrow()
  })
  it("rejects spend above budget and a close before opening", () => {
    expect(() => Session.make({ ...fields, spentAtomic: 101n })).toThrow()
    expect(() => Session.make({ ...fields, closedAtMs: 0 })).toThrow()
  })
  it("rejects contradictory call state and fabricated reference on a release", () => {
    expect(() => SessionCall.make({ ...call, settled: true })).toThrow()
    expect(() => SessionCall.make({ ...call, settleRef: "invented" })).toThrow()
  })
  it("closed receipts refuse pending holds, duplicate jobs and invented settled totals", () => {
    expect(() => SessionReceipt.make({ ...receipt, heldAtomic: 1n })).toThrow()
    expect(() => SessionReceipt.make({ ...receipt, settledCalls: 1 })).toThrow()
    expect(() => SessionReceipt.make({ ...receipt, calls: [SessionCall.make(call), SessionCall.make(call)] })).toThrow()
    expect(() => SessionReceipt.make({ ...receipt, closedAtMs: 0 })).toThrow()
  })
  it("accepts a complete exact closed artifact without inventing a close timestamp", () => {
    expect(SessionReceipt.make(receipt).closedAtMs).toBe(3)
  })
  const refs = { onchain: `0x${"2".repeat(64)}`, "gateway-transfer": "12345678-1234-4234-8234-000000000001", test: "0xtest11111111110000" }
  it.each(["eip3009", "gateway", "test"] as const)("correlates each closed %s call with its actual reference category", rail => {
    const kind = rail === "eip3009" ? "onchain" : rail === "gateway" ? "gateway-transfer" : "test"
    for (const category of ["onchain", "gateway-transfer", "test"] as const) {
      const reference = refs[category]
      const settledCall = SessionCall.make({ ...call, state: "settled", settled: true, settleRef: reference, settleRefKind: category })
      const fields = { ...receipt, rail, spentAtomic: 50n, calls: [settledCall], settledCalls: 1, settlementRefs: [reference] }
      if (kind === category) expect(SessionReceipt.make(fields).settledCalls).toBe(1)
      else expect(() => SessionReceipt.make(fields)).toThrow()
    }
  })
  it("keeps the future Gateway batch category unavailable to closed current sessions", () => {
    const settledCall = SessionCall.make({ ...call, state: "settled", settled: true, settleRef: refs.onchain, settleRefKind: "gateway-batch" })
    expect(() => SessionReceipt.make({ ...receipt, spentAtomic: 50n, calls: [settledCall], settledCalls: 1, settlementRefs: [refs.onchain] })).toThrow()
  })
  it.each(["12345678-1234-0234-8234-000000000001", "12345678-1234-4234-0234-000000000001", "12345678-1234-9234-8234-000000000001"])("refuses a noncanonical Gateway UUID %s", reference => {
    expect(() => SessionCall.make({ ...call, state: "settled", settled: true, settleRef: reference, settleRefKind: "gateway-transfer" })).toThrow()
  })
  it("bounds simulated reference syntax without labeling it as a chain hash", () => {
    const make = (reference: string) => SessionCall.make({ ...call, state: "settled", settled: true, settleRef: reference, settleRefKind: "test" })
    expect(make("0xtest" + "a".repeat(14)).settleRefKind).toBe("test")
    expect(make("0xtest" + "a".repeat(122)).settleRef?.length).toBe(128)
    for (const reference of ["0xtest" + "a".repeat(13), "0xtest" + "a".repeat(123), "0xTEST11111111110000", "0xtest1111111111zzzz", refs.onchain]) expect(() => make(reference)).toThrow()
  })
})
