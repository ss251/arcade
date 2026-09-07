import { Address, BigInt, Bytes, DataSourceContext, ethereum, store, ValueKind } from "@graphprotocol/graph-ts"
import { afterEach, beforeEach, assert, clearStore, dataSourceMock, describe, newMockEvent, test } from "matchstick-as/assembly/index"
import { JobCreated, ProviderSet, PayoutReceiverSet, BudgetSet, JobFunded, JobSubmitted,
  JobCompleted, JobRejected, JobExpired, PaymentReleased, PlatformFeePaid, EvaluatorFeePaid,
  Refunded, Settled } from "../generated/templates/ERC8183/ERC8183"
import { ArcadeSettled, ArcadeRefused } from "../generated/templates/ArcadeJobHook/ArcadeJobHook"
import { handleJobCreated, handleProviderSet, handlePayoutReceiverSet, handleBudgetSet, handleJobFunded,
  handleJobSubmitted, handleJobCompleted, handleJobRejected, handleJobExpired, handlePaymentReleased,
  handlePlatformFeePaid, handleEvaluatorFeePaid, handleRefunded, handleSettled } from "../src/escrow"
import { handleArcadeSettled, handleArcadeRefused } from "../src/escrow-hook"

const PROXY = "0x1111111111111111111111111111111111111111"
const HOOK = "0x2222222222222222222222222222222222222222"
const EVALUATOR = "0x3333333333333333333333333333333333333333"
const CLIENT = "0x4444444444444444444444444444444444444444"
const PROVIDER = "0x5555555555555555555555555555555555555555"
const TOKEN = "0x3600000000000000000000000000000000000000"
const TX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const HASH = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const JOB = "5042002:" + PROXY + ":1"
const MAX = "115792089237316195423570985008687907853269984665640564039457584007913129639935"
function context(): DataSourceContext {
  const ctx = new DataSourceContext()
  ctx.setBytes("escrow", Bytes.fromHexString(PROXY)); ctx.setBytes("hook", Bytes.fromHexString(HOOK))
  ctx.setBytes("evaluator", Bytes.fromHexString(EVALUATOR)); return ctx
}
function source(hook: bool = false): void { dataSourceMock.setReturnValues(hook ? HOOK : PROXY, "arc-testnet", context()) }
function address(value: string): ethereum.Value { return ethereum.Value.fromAddress(Address.fromString(value)) }
function uint(value: string): ethereum.Value { return ethereum.Value.fromUnsignedBigInt(BigInt.fromString(value)) }
function hash(): ethereum.Value { return ethereum.Value.fromFixedBytes(Bytes.fromHexString(HASH)) }
function event(log: i32, values: Array<ethereum.Value>, hook: bool = false, job: string = "1"): ethereum.Event {
  const e = newMockEvent(); e.address = Address.fromString(hook ? HOOK : PROXY)
  e.transaction.hash = Bytes.fromHexString(TX); e.logIndex = BigInt.fromI32(log)
  e.block.number = BigInt.fromI32(1000); e.block.timestamp = BigInt.fromI32(1000)
  e.parameters = [new ethereum.EventParam("jobId", uint(job))]
  for (let i = 0; i < values.length; i++) e.parameters.push(new ethereum.EventParam("field" + i.toString(), values[i]))
  return e
}
function created(log: i32 = 1, job: string = "1"): JobCreated {
  return changetype<JobCreated>(event(log, [address(CLIENT), address(PROVIDER), address(EVALUATOR), uint("2000"), address(HOOK)], false, job))
}
function funded(log: i32 = 3, amount: string = "300000"): JobFunded {
  return changetype<JobFunded>(event(log, [address(CLIENT), uint(amount)]))
}
function id(log: i32): string { return Bytes.fromHexString(TX).concatI32(log).toHexString() }
function absent(entity: string, key: string, field: string): void {
  const row = store.get(entity, key); assert.assertNotNull(row)
  if (row != null) { const value = row.get(field); if (value != null) assert.i32Equals(value.kind, ValueKind.NULL) }
}
describe("inactive escrow observations, not terminal payment proof", () => {
  beforeEach(() => source())
  test("equal job IDs on distinct bound proxies remain distinct", () => {
    handleJobCreated(created())
    const other = "0x6666666666666666666666666666666666666666", ctx = context()
    ctx.setBytes("escrow", Bytes.fromHexString(other)); dataSourceMock.setReturnValues(other, "arc-testnet", ctx)
    const e = created(2); e.address = Address.fromString(other); handleJobCreated(e)
    assert.entityCount("EscrowJob", 2)
    assert.fieldEquals("EscrowJob", "5042002:" + other + ":1", "escrow", other)
    assert.fieldEquals("EscrowJob", JOB, "escrow", PROXY)
  })
  test("wrongly typed local binding cannot be used as an address", () => {
    const ctx = context(); ctx.setString("hook", HOOK)
    dataSourceMock.setReturnValues(PROXY, "arc-testnet", ctx); handleJobCreated(created())
    assert.entityCount("EscrowEvent", 0)
  })
  test("decreasing observed timestamp cannot update the summary", () => {
    handleJobCreated(created()); const e = funded(); e.block.number = BigInt.fromI32(1001)
    e.block.timestamp = BigInt.fromI32(999); handleJobFunded(e)
  }, true)
  test("a hook observation cannot be emitted through the proxy data source", () => {
    handleArcadeRefused(changetype<ArcadeRefused>(event(1, [hash()], true)))
  }, true)
  test("unconfigured or non-Arc source context creates no evidence", () => {
    dataSourceMock.setReturnValues(PROXY, "arc-testnet", new DataSourceContext()); handleJobCreated(created())
    dataSourceMock.setReturnValues(PROXY, "base", context()); handleJobCreated(created())
    assert.entityCount("EscrowJob", 0); assert.entityCount("EscrowEvent", 0)
  })
  test("zero or overlapping binding addresses cannot authorize handlers", () => {
    const ctx = context(); ctx.setBytes("hook", Bytes.fromHexString(PROXY))
    dataSourceMock.setReturnValues(PROXY, "arc-testnet", ctx); handleJobCreated(created())
    ctx.setBytes("hook", Bytes.fromHexString("0x0000000000000000000000000000000000000000"))
    dataSourceMock.setReturnValues(PROXY, "arc-testnet", ctx); handleJobCreated(created())
    assert.entityCount("EscrowEvent", 0)
  })
  test("an actual emitter mismatch is rejected", () => {
    const e = created(); e.address = Address.fromString(PROVIDER); handleJobCreated(e)
  }, true)
  test("a data-source address mismatch is rejected", () => {
    dataSourceMock.setReturnValues(PROVIDER, "arc-testnet", context()); handleJobCreated(created())
  }, true)
  test("missing creation stays unlinked even after a later observed creation", () => {
    handleJobFunded(funded(1)); assert.entityCount("EscrowJob", 0)
    absent("EscrowEvent", id(1), "job"); assert.fieldEquals("EscrowEvent", id(1), "amountAtomic", "300000")
    handleJobCreated(created(2)); absent("EscrowEvent", id(1), "job")
    absent("EscrowJob", JOB, "fundedAtomic")
  })
  test("a different hook creation remains an observation, not an ARCADE job summary", () => {
    const e = created(); e.parameters[5] = new ethereum.EventParam("hook", address(PROVIDER))
    handleJobCreated(e); assert.entityCount("EscrowJob", 0); absent("EscrowEvent", id(1), "job")
  })
  test("exact old replays cannot revert later observed state or duplicate occurrences", () => {
    handleJobCreated(created()); handleJobFunded(funded()); handleJobCreated(created()); handleJobFunded(funded())
    assert.entityCount("EscrowEvent", 2); assert.fieldEquals("EscrowJob", JOB, "status", "FUNDED")
    assert.fieldEquals("EscrowJob", JOB, "updatedLogIndex", "3")
  })
  test("same occurrence with a different amount is a conflicting replay", () => {
    handleJobCreated(created()); handleJobFunded(funded()); handleJobFunded(funded(3, "1"))
  }, true)
  test("same occurrence with different block coordinates is a conflicting replay", () => {
    handleJobCreated(created()); const e = created(); e.block.number = BigInt.fromI32(1001); handleJobCreated(e)
  }, true)
  test("a second creation occurrence cannot overwrite an existing job", () => {
    handleJobCreated(created()); handleJobCreated(created(2))
  }, true)
  test("new but older observations cannot roll a job summary backward", () => {
    handleJobCreated(created()); handleJobFunded(funded(5))
    handleJobRejected(changetype<JobRejected>(event(4, [address(EVALUATOR), hash()])))
  }, true)
  test("zero job identity is refused", () => { handleJobCreated(created(1, "0")) }, true)
  test("full uint256 identity stays exact", () => {
    handleJobCreated(created(1, MAX)); assert.fieldEquals("EscrowJob", "5042002:" + PROXY + ":" + MAX, "jobId", MAX)
  })
  test("negative amounts are refused rather than coerced", () => { handleJobFunded(funded(1, "-1")) }, true)
  test("oversized synthetic log indices do not alias an earlier event", () => {
    const e = created(); e.logIndex = BigInt.fromString("2147483648"); handleJobCreated(e)
  }, true)
  test("uint48 expiry overflow is refused", () => {
    const e = created(); e.parameters[4] = new ethereum.EventParam("expiredAt", uint("281474976710656")); handleJobCreated(e)
  }, true)
  test("uint32 hook child-count overflow is refused", () => {
    source(true); handleArcadeSettled(changetype<ArcadeSettled>(event(1, [hash(), uint("4294967296"), uint("0"), hash()], true)))
  }, true)
  test("malformed hook hashes are refused", () => {
    source(true); handleArcadeRefused(changetype<ArcadeRefused>(event(1, [ethereum.Value.fromFixedBytes(Bytes.fromHexString("0x01"))], true)))
  }, true)
  test("complete path preserves separate funding, fee, payout and hook observations", () => {
    handleJobCreated(created())
    handleBudgetSet(changetype<BudgetSet>(event(2, [address(TOKEN), uint("300000")])))
    handleJobFunded(funded())
    handleJobSubmitted(changetype<JobSubmitted>(event(4, [address(PROVIDER), hash()])))
    handlePlatformFeePaid(changetype<PlatformFeePaid>(event(5, [address(EVALUATOR), uint("15000")])))
    handlePaymentReleased(changetype<PaymentReleased>(event(6, [address(PROVIDER), uint("285000")])))
    handleJobCompleted(changetype<JobCompleted>(event(7, [address(EVALUATOR), hash()])))
    source(true)
    handleArcadeSettled(changetype<ArcadeSettled>(event(8, [hash(), uint("4294967295"), uint(MAX), hash()], true)))
    assert.entityCount("EscrowEvent", 8); assert.fieldEquals("EscrowJob", JOB, "status", "COMPLETED")
    assert.fieldEquals("EscrowJob", JOB, "budgetAtomic", "300000"); assert.fieldEquals("EscrowJob", JOB, "fundedAtomic", "300000")
    assert.fieldEquals("EscrowEvent", id(5), "amountAtomic", "15000")
    assert.fieldEquals("EscrowEvent", id(6), "amountAtomic", "285000")
    assert.fieldEquals("EscrowEvent", id(8), "childCount", "4294967295")
    assert.fieldEquals("EscrowEvent", id(8), "childTotalAtomic", MAX)
    assert.fieldEquals("EscrowEvent", id(8), "emitter", HOOK); assert.fieldEquals("EscrowEvent", id(8), "escrow", PROXY)
    absent("EscrowEvent", id(7), "amountAtomic"); absent("EscrowEvent", id(8), "amountAtomic")
  })
  test("rejection and hook refusal cannot invent a refund", () => {
    handleJobCreated(created()); handleJobFunded(funded())
    handleJobRejected(changetype<JobRejected>(event(4, [address(EVALUATOR), hash()])))
    source(true); handleArcadeRefused(changetype<ArcadeRefused>(event(5, [hash()], true)))
    assert.fieldEquals("EscrowJob", JOB, "status", "REJECTED")
    assert.entityCount("EscrowEvent", 4)
    absent("EscrowEvent", id(4), "amountAtomic"); absent("EscrowEvent", id(5), "amountAtomic")
  })
  test("actual refunded amount remains separate from expiry status", () => {
    handleJobCreated(created()); handleJobFunded(funded())
    handleRefunded(changetype<Refunded>(event(4, [address(CLIENT), uint("300000")])))
    handleJobExpired(changetype<JobExpired>(event(5, [])))
    assert.fieldEquals("EscrowEvent", id(4), "kind", "refunded")
    assert.fieldEquals("EscrowEvent", id(4), "amountAtomic", "300000")
    assert.fieldEquals("EscrowJob", JOB, "status", "EXPIRED"); absent("EscrowEvent", id(5), "amountAtomic")
  })
  test("provider, payout receiver, partial settlement and evaluator fee are explicit events", () => {
    handleJobCreated(created())
    handleProviderSet(changetype<ProviderSet>(event(2, [address(CLIENT), uint(MAX)])))
    handlePayoutReceiverSet(changetype<PayoutReceiverSet>(event(3, [address(PROVIDER)])))
    handleSettled(changetype<Settled>(event(4, [uint(MAX), uint("1234")])))
    handleEvaluatorFeePaid(changetype<EvaluatorFeePaid>(event(5, [address(EVALUATOR), uint("7")])))
    assert.fieldEquals("EscrowJob", JOB, "provider", CLIENT)
    assert.fieldEquals("EscrowEvent", id(2), "agentId", MAX); assert.fieldEquals("EscrowEvent", id(3), "actor", PROVIDER)
    assert.fieldEquals("EscrowEvent", id(4), "cumulativeAtomic", MAX); assert.fieldEquals("EscrowEvent", id(4), "amountAtomic", "1234")
    assert.fieldEquals("EscrowEvent", id(5), "amountAtomic", "7"); assert.fieldEquals("EscrowJob", JOB, "status", "OPEN")
    absent("EscrowJob", JOB, "fundedAtomic")
  })
  afterEach(() => {
    assert.entityCount("Settlement", 0); assert.entityCount("Tree", 0); assert.entityCount("Listing", 0)
    assert.dataSourceCount("ERC8183", 0); assert.dataSourceCount("ArcadeJobHook", 0)
    clearStore(); dataSourceMock.resetValues()
  })
  test("creation preserves public roles and nullable unknown monetary observations", () => {
    handleJobCreated(created()); assert.entityCount("EscrowJob", 1); assert.entityCount("EscrowEvent", 1)
    assert.fieldEquals("EscrowJob", JOB, "client", CLIENT); assert.fieldEquals("EscrowJob", JOB, "provider", PROVIDER)
    assert.fieldEquals("EscrowJob", JOB, "evaluator", EVALUATOR); assert.fieldEquals("EscrowJob", JOB, "hook", HOOK)
    assert.fieldEquals("EscrowJob", JOB, "status", "OPEN"); assert.fieldEquals("EscrowJob", JOB, "expiredAt", "2000")
    assert.fieldEquals("EscrowEvent", id(1), "job", JOB); assert.fieldEquals("EscrowEvent", id(1), "kind", "job_created")
    absent("EscrowJob", JOB, "budgetAtomic"); absent("EscrowJob", JOB, "fundedAtomic")
    absent("EscrowJob", JOB, "paymentToken"); absent("EscrowJob", JOB, "deliverable")
    absent("EscrowEvent", id(1), "amountAtomic")
  })
})
