import { Address, BigInt, Bytes, crypto, DataSourceContext, ethereum, store, ValueKind, Wrapped } from "@graphprotocol/graph-ts"
import { afterEach, assert, clearStore, dataSourceMock, describe, newMockEvent, test } from "matchstick-as/assembly/index"
import { JobCreated, BudgetSet, JobFunded, JobSubmitted, JobCompleted, PlatformFeePaid, PaymentReleased } from "../generated/templates/ERC8183/ERC8183"
import { ArcadeSettled } from "../generated/templates/ArcadeJobHook/ArcadeJobHook"
import { handleJobCreated, handleBudgetSet, handleJobFunded, handleJobSubmitted, handleJobCompleted,
  handlePlatformFeePaid, handlePaymentReleased } from "../src/escrow"
import { handleArcadeSettled } from "../src/escrow-hook"

const PROXY = "0x1111111111111111111111111111111111111111", HOOK = "0x2222222222222222222222222222222222222222"
const EVAL = "0x3333333333333333333333333333333333333333", CLIENT = "0x4444444444444444444444444444444444444444"
const PROVIDER = "0x5555555555555555555555555555555555555555", TREASURY = "0x7777777777777777777777777777777777777777"
const TOKEN = "0x3600000000000000000000000000000000000000"
const TX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const PRETX = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
const HASH = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const BLOCK = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
const JOB = "5042002:" + PROXY + ":1"
function a(s: string): ethereum.Value { return ethereum.Value.fromAddress(Address.fromString(s)) }
function u(s: string): ethereum.Value { return ethereum.Value.fromUnsignedBigInt(BigInt.fromString(s)) }
function h(): ethereum.Value { return ethereum.Value.fromFixedBytes(Bytes.fromHexString(HASH)) }
function encode(v: ethereum.Value): Bytes { return ethereum.encode(v)! }
function tuple(values: Array<ethereum.Value>): Bytes {
  const t = new ethereum.Tuple(); for (let i = 0; i < values.length; i++) t.push(values[i])
  return encode(ethereum.Value.fromTuple(t))
}
function topic(s: string): Bytes { return Bytes.fromByteArray(crypto.keccak256(Bytes.fromUTF8(s))) }
function source(hook: bool = false, treasury: string = TREASURY): void {
  const ctx = new DataSourceContext(); ctx.setBytes("escrow", Bytes.fromHexString(PROXY))
  ctx.setBytes("hook", Bytes.fromHexString(HOOK)); ctx.setBytes("evaluator", Bytes.fromHexString(EVAL))
  if (treasury.length > 0) ctx.setBytes("treasury", Bytes.fromHexString(treasury))
  dataSourceMock.setReturnValues(hook ? HOOK : PROXY, "arc-testnet", ctx)
}
function event(log: i32, values: Array<ethereum.Value>, terminal: bool = false): ethereum.Event {
  const e = newMockEvent(); e.address = Address.fromString(PROXY); e.logIndex = BigInt.fromI32(log)
  e.transactionLogIndex = BigInt.fromI32(log); e.transaction.index = BigInt.zero()
  e.transaction.hash = Bytes.fromHexString(terminal ? TX : PRETX)
  e.block.hash = Bytes.fromHexString(BLOCK); e.block.number = BigInt.fromI32(terminal ? 1001 : 1000)
  e.block.timestamp = BigInt.fromI32(terminal ? 1001 : 1000)
  e.parameters = [new ethereum.EventParam("jobId", u("1"))]
  for (let i = 0; i < values.length; i++) e.parameters.push(new ethereum.EventParam("field" + i.toString(), values[i]))
  return e
}
function seed(token: string = TOKEN, fundAmount: string = "300000", submitter: string = PROVIDER, fundClient: string = CLIENT): void {
  source()
  handleJobCreated(changetype<JobCreated>(event(0, [a(CLIENT), a(PROVIDER), a(EVAL), u("2000"), a(HOOK)])))
  handleBudgetSet(changetype<BudgetSet>(event(1, [a(token), u("300000")])))
  handleJobFunded(changetype<JobFunded>(event(2, [a(fundClient), u(fundAmount)])))
  handleJobSubmitted(changetype<JobSubmitted>(event(3, [a(submitter), h()])))
}
function log(index: i32, emitter: string, topics: Array<Bytes>, data: Bytes): ethereum.Log {
  return new ethereum.Log(Address.fromString(emitter), topics, data, Bytes.fromHexString(BLOCK),
    Bytes.fromHexString("0x03e9"), Bytes.fromHexString(TX), BigInt.zero(), BigInt.fromI32(index),
    BigInt.fromI32(index), "mined", null)
}
function receiptLogs(treasury: string = TREASURY): Array<ethereum.Log> {
  return [
    log(0, TOKEN, [topic("Transfer(address,address,uint256)"), encode(a(PROXY)), encode(a(treasury))], encode(u("15000"))),
    log(1, PROXY, [topic("PlatformFeePaid(uint256,address,uint256)"), encode(u("1")), encode(a(treasury))], encode(u("15000"))),
    log(2, TOKEN, [topic("Transfer(address,address,uint256)"), encode(a(PROXY)), encode(a(PROVIDER))], encode(u("285000"))),
    log(3, PROXY, [topic("PaymentReleased(uint256,address,uint256)"), encode(u("1")), encode(a(PROVIDER))], encode(u("285000"))),
    log(4, PROXY, [topic("JobCompleted(uint256,address,bytes32)"), encode(u("1")), encode(a(EVAL))], encode(h())),
    log(5, HOOK, [topic("ArcadeSettled(uint256,bytes32,uint32,uint256,bytes32)"), encode(u("1"))], tuple([h(), u("2"), u("10000"), h()]))
  ]
}
function ready(treasury: string = TREASURY, token: string = TOKEN, fundAmount: string = "300000", submitter: string = PROVIDER, fundClient: string = CLIENT, repeated: bool = false): ArcadeSettled {
  seed(token, fundAmount, submitter, fundClient); source(false, treasury)
  if (repeated) {
    handleJobFunded(changetype<JobFunded>(event(4, [a(CLIENT), u("300000")])))
    handleJobSubmitted(changetype<JobSubmitted>(event(5, [a(PROVIDER), h()])))
  }
  handlePlatformFeePaid(changetype<PlatformFeePaid>(event(1, [a(treasury.length > 0 ? treasury : TREASURY), u("15000")], true)))
  handlePaymentReleased(changetype<PaymentReleased>(event(3, [a(PROVIDER), u("285000")], true)))
  handleJobCompleted(changetype<JobCompleted>(event(4, [a(EVAL), h()], true)))
  source(true, treasury)
  const e = changetype<ArcadeSettled>(event(5, [h(), u("2"), u("10000"), h()], true)); e.address = Address.fromString(HOOK)
  e.receipt = new ethereum.TransactionReceipt(Bytes.fromHexString(TX), BigInt.zero(), Bytes.fromHexString(BLOCK),
    BigInt.fromI32(1001), BigInt.fromI32(10000), BigInt.fromI32(10000), Address.zero(),
    receiptLogs(treasury.length > 0 ? treasury : TREASURY), BigInt.fromI32(1), Bytes.empty(), Bytes.empty())
  return e
}
function absent(entity: string, key: string, field: string): void {
  const row = store.get(entity, key); assert.assertNotNull(row)
  if (row != null) { const value = row.get(field); if (value != null) assert.i32Equals(value.kind, ValueKind.NULL) }
}
const ID = Bytes.fromHexString(TX).concatI32(5).toHexString()
function refuse(e: ArcadeSettled): void {
  handleArcadeSettled(e); assert.entityCount("Settlement", 0)
  absent("EscrowJob", JOB, "completeTx"); absent("EscrowJob", JOB, "completedAt")
  absent("EscrowJob", JOB, "treeHash"); assert.fieldEquals("EscrowEvent", ID, "kind", "arcade_settled")
}
describe("inactive full-receipt paid footprint", () => {
  afterEach(() => { assert.entityCount("Tree", 0); assert.entityCount("Listing", 0); clearStore(); dataSourceMock.resetValues() })
  test("missing receipt preserves the raw observation without closure", () => { const e = ready(); e.receipt = null; refuse(e) })
  test("wrong funding client remains ineligible", () => { refuse(ready(TREASURY, TOKEN, "300000", PROVIDER, PROVIDER)) })
  test("distinct repeated funding cannot become single-funding evidence", () => { refuse(ready(TREASURY, TOKEN, "300000", PROVIDER, CLIENT, true)) })
  test("removed receipt log is not classified", () => { const e = ready(); e.receipt!.logs[0].removed = new Wrapped<bool>(true); refuse(e) })
  test("coherently empty block hashes are still invalid", () => {
    const e = ready(); e.block.hash = Bytes.empty(); e.receipt!.blockHash = Bytes.empty()
    for (let i = 0; i < e.receipt!.logs.length; i++) e.receipt!.logs[i].blockHash = Bytes.empty()
    refuse(e)
  })
  test("one transfer cannot pay both seller and treasury even when they coincide", () => {
    const e = ready(PROVIDER); e.receipt!.logs[2].address = Address.fromString(CLIENT); refuse(e)
  })
  test("a later duplicate hook anywhere in the receipt prevents classification", () => {
    const e = ready(); e.receipt!.logs.push(log(6, HOOK,
      [topic("ArcadeSettled(uint256,bytes32,uint32,uint256,bytes32)"), encode(u("1"))], tuple([h(), u("2"), u("10000"), h()])))
    refuse(e)
  })
  test("failed receipt is not a settlement", () => {
    const e = ready(); e.receipt!.status = BigInt.zero(); refuse(e)
  })
  test("wrong receipt transaction is refused", () => {
    const e = ready(); e.receipt!.transactionHash = Bytes.fromHexString(PRETX); refuse(e)
  })
  test("wrong receipt block hash is refused", () => {
    const e = ready(); e.receipt!.blockHash = Bytes.fromHexString(HASH); refuse(e)
  })
  test("wrong receipt block number is refused", () => {
    const e = ready(); e.receipt!.blockNumber = BigInt.fromI32(999); refuse(e)
  })
  test("wrong receipt transaction index is refused", () => {
    const e = ready(); e.receipt!.transactionIndex = BigInt.fromI32(1); refuse(e)
  })
  test("foreign log transaction is refused", () => {
    const e = ready(); e.receipt!.logs[1].transactionHash = Bytes.fromHexString(PRETX); refuse(e)
  })
  test("repeated log coordinates are refused", () => {
    const e = ready(); e.receipt!.logs[2].logIndex = BigInt.fromI32(1); refuse(e)
  })
  test("current hook transaction-log identity must match", () => {
    const e = ready(); e.transactionLogIndex = BigInt.fromI32(4); refuse(e)
  })
  test("different hook metadata cannot attach to current event", () => {
    const e = ready(); e.receipt!.logs[5].data = tuple([h(), u("2"), u("999"), h()]); refuse(e)
  })
  test("different completed job cannot supply payout", () => {
    const e = ready(); e.receipt!.logs[4].topics[1] = encode(u("2")); refuse(e)
  })
  test("different completion evaluator is refused", () => {
    const e = ready(); e.receipt!.logs[4].topics[2] = encode(a(CLIENT)); refuse(e)
  })
  test("nonzero indexed address padding is refused", () => {
    const e = ready(); e.receipt!.logs[3].topics[2] = Bytes.fromHexString(HASH); refuse(e)
  })
  test("payout plus fee must equal observed funding", () => {
    const e = ready(); e.receipt!.logs[0].data = encode(u("14999")); e.receipt!.logs[1].data = encode(u("14999")); refuse(e)
  })
  test("wrong transfer recipient is refused", () => {
    const e = ready(); e.receipt!.logs[2].topics[2] = encode(a(CLIENT)); refuse(e)
  })
  test("wrong fee treasury is refused", () => {
    const e = ready(); e.receipt!.logs[1].topics[2] = encode(a(PROVIDER)); refuse(e)
  })
  test("other token logs do not prove USDC", () => {
    const e = ready(); e.receipt!.logs[0].address = Address.fromString(CLIENT); e.receipt!.logs[2].address = Address.fromString(CLIENT); refuse(e)
  })
  test("payout events without USDC transfers are insufficient", () => {
    const e = ready(); e.receipt!.logs[2].topics[0] = topic("SomethingElse(address,address,uint256)"); refuse(e)
  })
  test("missing fee event does not imply zero or recomputed fee", () => {
    const e = ready(); e.receipt!.logs[1].address = Address.fromString(CLIENT); refuse(e)
  })
  test("oversized receipts are not scanned", () => {
    const e = ready(); for (let i = 6; i < 129; i++) e.receipt!.logs.push(log(i, CLIENT, [], Bytes.empty())); refuse(e)
  })
  test("aggregate receipt byte limit is enforced", () => {
    const e = ready(); e.receipt!.logs.push(log(6, CLIENT, [], changetype<Bytes>(new Uint8Array(65536)))); refuse(e)
  })
  test("missing local treasury never picks a default", () => { refuse(ready("")) })
  test("non-USDC observed budget is ineligible", () => { refuse(ready(TREASURY, PROVIDER)) })
  test("mismatched funding is ineligible", () => { refuse(ready(TREASURY, TOKEN, "299999")) })
  test("wrong provider submission is ineligible", () => { refuse(ready(TREASURY, TOKEN, "300000", CLIENT)) })
  test("seller and treasury may coincide but still need two separate transfers", () => {
    handleArcadeSettled(ready(PROVIDER)); assert.entityCount("Settlement", 1)
    assert.fieldEquals("Settlement", ID, "sellerAtomic", "285000"); assert.fieldEquals("Settlement", ID, "feeAtomic", "15000")
  })
  test("a later duplicate payout anywhere in the receipt prevents classification", () => {
    const e = ready(); e.receipt!.logs.push(log(6, PROXY,
      [topic("PaymentReleased(uint256,address,uint256)"), encode(u("1")), encode(a(PROVIDER))], encode(u("285000"))))
    refuse(e)
  })
  test("a later contradictory refund anywhere in the receipt prevents classification", () => {
    const e = ready(); e.receipt!.logs.push(log(6, PROXY,
      [topic("Refunded(uint256,address,uint256)"), encode(u("1")), encode(a(CLIENT))], encode(u("300000"))))
    refuse(e)
  })
  test("an additional outgoing USDC payment after the hook is not hidden", () => {
    const e = ready(); e.receipt!.logs.push(log(6, TOKEN,
      [topic("Transfer(address,address,uint256)"), encode(a(PROXY)), encode(a(PROVIDER))], encode(u("1"))))
    refuse(e)
  })
  test("multi-job proxy batches are left unclassified", () => {
    const e = ready(); e.receipt!.logs.push(log(6, PROXY,
      [topic("PaymentReleased(uint256,address,uint256)"), encode(u("2")), encode(a(PROVIDER))], encode(u("285000"))))
    refuse(e)
  })
  test("correlates exact USDC transfers, fee, payout, completion and hook without a fake splitter", () => {
    const e = ready(); handleArcadeSettled(e)
    assert.entityCount("Settlement", 1); assert.fieldEquals("Settlement", ID, "rail", "erc8183")
    assert.fieldEquals("Settlement", ID, "escrowJob", JOB); assert.fieldEquals("Settlement", ID, "buyer", CLIENT)
    assert.fieldEquals("Settlement", ID, "totalAtomic", "300000"); assert.fieldEquals("Settlement", ID, "sellerAtomic", "285000")
    assert.fieldEquals("Settlement", ID, "feeAtomic", "15000"); assert.fieldEquals("EscrowJob", JOB, "completeTx", TX)
    assert.fieldEquals("EscrowJob", JOB, "completedAt", "1001"); assert.fieldEquals("EscrowJob", JOB, "fundedAt", "1000")
    assert.fieldEquals("EscrowJob", JOB, "fundTx", PRETX); assert.fieldEquals("EscrowJob", JOB, "treeHash", HASH)
    absent("Settlement", ID, "splitter"); absent("Settlement", ID, "nonce"); absent("Settlement", ID, "tree")
    handleArcadeSettled(e); assert.entityCount("Settlement", 1)
  })
})
