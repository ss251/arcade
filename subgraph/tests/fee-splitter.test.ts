import { Address, BigInt, Bytes, DataSourceContext, ethereum, store, ValueKind } from "@graphprotocol/graph-ts"
import { afterEach, assert, clearStore, dataSourceMock, describe, newMockEvent, test } from "matchstick-as/assembly/index"
import { Settled } from "../generated/FeeSplitterSmoke/FeeSplitter"
import { SettledTree } from "../generated/templates/FeeSplitterV2/FeeSplitterV2"
import { handleSettled, handleSettledTree } from "../src/fee-splitter"
import { ARC_CHAIN_ID, agentEntityId, splitterFor } from "../src/ids"

const SPLITTER = "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206"
const BUYER = "0x3333333333333333333333333333333333333333"
const NONCE = "0x1111111111111111111111111111111111111111111111111111111111111111"
const TX = "0x2222222222222222222222222222222222222222222222222222222222222222"
const OTHER_TX = "0x4444444444444444444444444444444444444444444444444444444444444444"
const THIRD_TX = "0x5555555555555555555555555555555555555555555555555555555555555555"
const TREE = "0x6666666666666666666666666666666666666666666666666666666666666666"
const OTHER_TREE = "0x7777777777777777777777777777777777777777777777777777777777777777"
const OTHER_SPLITTER = "0x8888888888888888888888888888888888888888"

function settledEvent(log: string = "7", tx: string = TX, total: string = "10000"): Settled {
  const event = changetype<Settled>(newMockEvent())
  event.address = Address.fromString(SPLITTER)
  event.transaction.hash = Bytes.fromHexString(tx)
  event.logIndex = BigInt.fromString(log)
  event.block.number = BigInt.fromString("1000")
  event.block.timestamp = BigInt.fromString("1757000000")
  event.parameters = [
    new ethereum.EventParam("buyer", ethereum.Value.fromAddress(Address.fromString(BUYER))),
    new ethereum.EventParam("total", ethereum.Value.fromUnsignedBigInt(BigInt.fromString(total))),
    new ethereum.EventParam("sellerAmount", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("9500"))),
    new ethereum.EventParam("feeAmount", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("500"))),
    new ethereum.EventParam("nonce", ethereum.Value.fromFixedBytes(Bytes.fromHexString(NONCE)))
  ]
  return event
}

function id(log: i32 = 7, tx: string = TX): string {
  return Bytes.fromHexString(tx).concatI32(log).toHexString()
}

function treeEvent(
  count: string = "2", log: string = "7", tx: string = TX,
  tree: string = TREE, children: string = "40000"
): SettledTree {
  const event = changetype<SettledTree>(newMockEvent())
  const plain = settledEvent(log, tx)
  event.address = plain.address
  event.transaction.hash = plain.transaction.hash
  event.logIndex = plain.logIndex
  event.block.number = plain.block.number
  event.block.timestamp = plain.block.timestamp
  event.parameters = plain.parameters
  event.parameters.push(new ethereum.EventParam("treeHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString(tree))))
  event.parameters.push(new ethereum.EventParam("childCount", ethereum.Value.fromUnsignedBigInt(BigInt.fromString(count))))
  event.parameters.push(new ethereum.EventParam("childTotalAtomic", ethereum.Value.fromUnsignedBigInt(BigInt.fromString(children))))
  return event
}

function absent(entity: string, entityId: string, field: string): void {
  const value = store.get(entity, entityId)
  assert.assertNotNull(value)
  if (value != null) {
    const stored = value.get(field)
    // The actual host may normalize an unset schema field to an explicit Graph Null.
    if (stored != null) assert.i32Equals(stored.kind, ValueKind.NULL)
  }
}

function boundary(count: string, summary: bool): void {
  handleSettledTree(treeEvent(count))
  assert.fieldEquals("TreeOccurrence", id(), "childCount", count)
  if (summary) assert.fieldEquals("Tree", TREE, "childCount", count)
  else absent("Tree", TREE, "childCount")
  assert.fieldEquals("Tree", TREE, "root", id())
  assert.fieldEquals("Tree", TREE, "ambiguous", "false")
}

describe("settlement mapping behavior", () => {
  afterEach(() => {
    assert.entityCount("Marketplace", 0)
    assert.entityCount("Agent", 0)
    assert.entityCount("Listing", 0)
    assert.dataSourceCount("FeeSplitterV2", 0)
    clearStore()
    dataSourceMock.resetValues()
  })

  test("persists exact emitted fields and no invented coverage", () => {
    handleSettled(settledEvent())
    assert.entityCount("Settlement", 1)
    assert.fieldEquals("Settlement", id(), "rail", "eip3009")
    absent("Settlement", id(), "escrowJob")
    assert.fieldEquals("Settlement", id(), "splitter", SPLITTER)
    assert.fieldEquals("Settlement", id(), "buyer", BUYER)
    assert.fieldEquals("Settlement", id(), "totalAtomic", "10000")
    assert.fieldEquals("Settlement", id(), "sellerAtomic", "9500")
    assert.fieldEquals("Settlement", id(), "feeAtomic", "500")
    assert.fieldEquals("Settlement", id(), "nonce", NONCE)
    assert.fieldEquals("Settlement", id(), "txHash", TX)
    assert.fieldEquals("Settlement", id(), "blockNumber", "1000")
    assert.fieldEquals("Settlement", id(), "timestamp", "1757000000")
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "1")
    assert.fieldEquals("Splitter", SPLITTER, "settledVolumeAtomic", "10000")
    assert.entityCount("Marketplace", 0)
    assert.entityCount("Agent", 0)
    assert.entityCount("Listing", 0)
    assert.entityCount("Tree", 0)
    assert.entityCount("TreeOccurrence", 0)
    absent("Settlement", id(), "tree")
    absent("Splitter", SPLITTER, "listing")
    assert.fieldEquals("Splitter", SPLITTER, "firstSeenBlock", "1000")
    assert.fieldEquals("Splitter", SPLITTER, "source", "static")
  })

  test("replayed occurrence never increases emitter counters", () => {
    handleSettled(settledEvent())
    handleSettled(settledEvent())
    assert.entityCount("Settlement", 1)
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "1")
    assert.fieldEquals("Splitter", SPLITTER, "settledVolumeAtomic", "10000")
  })

  test("different log or transaction remains distinct despite equal nonce", () => {
    handleSettled(settledEvent())
    handleSettled(settledEvent("8"))
    handleSettled(settledEvent("7", OTHER_TX))
    assert.entityCount("Settlement", 3)
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "3")
    assert.fieldEquals("Splitter", SPLITTER, "settledVolumeAtomic", "30000")
  })

  test("preserves large atomic totals rather than scaling native gas", () => {
    handleSettled(settledEvent("7", TX, "9007199254740993123456789"))
    assert.fieldEquals("Settlement", id(), "totalAtomic", "9007199254740993123456789")
    assert.fieldEquals("Splitter", SPLITTER, "settledVolumeAtomic", "9007199254740993123456789")
  })

  test("rejects a negative synthetic log index", () => {
    handleSettled(settledEvent("-1"))
  }, true)

  test("rejects a log index above signed Int instead of aliasing", () => {
    handleSettled(settledEvent("2147483648"))
  }, true)

  test("retains concatI32 identity at the maximum supported log index", () => {
    handleSettled(settledEvent("2147483647"))
    assert.fieldEquals("Settlement", id(2147483647), "totalAtomic", "10000")
    assert.entityCount("Settlement", 1)
  })

  test("source-context overlap cannot count an occurrence twice or bind a listing", () => {
    dataSourceMock.setReturnValues(SPLITTER, "arc-testnet", new DataSourceContext())
    handleSettled(settledEvent())
    const context = new DataSourceContext()
    context.setString("listingId", "untrusted")
    dataSourceMock.setReturnValues(SPLITTER, "arc-testnet", context)
    handleSettled(settledEvent())
    assert.entityCount("Settlement", 1)
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "1")
    absent("Splitter", SPLITTER, "listing")
  })

  test("preserves prior first discovery and listing reference without creating its target", () => {
    const prior = splitterFor(Bytes.fromHexString(SPLITTER), "metadata", BigInt.fromString("800"))
    prior.listing = "existing-trusted-binding"
    prior.save()
    handleSettled(settledEvent())
    const later = settledEvent("8")
    later.block.number = BigInt.fromString("2000")
    handleSettled(later)
    assert.fieldEquals("Splitter", SPLITTER, "firstSeenBlock", "800")
    assert.fieldEquals("Splitter", SPLITTER, "source", "metadata")
    assert.fieldEquals("Splitter", SPLITTER, "listing", "existing-trusted-binding")
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "2")
    assert.fieldEquals("Splitter", SPLITTER, "settledVolumeAtomic", "20000")
  })

  test("constructs exact chain-scoped agent identifiers without persisting agents", () => {
    assert.stringEquals(agentEntityId(ARC_CHAIN_ID, BigInt.fromString("900719925474099312345")), "5042002:900719925474099312345")
  })

  test("stores a tree occurrence with exact event facts and settlement linkage", () => {
    handleSettledTree(treeEvent())
    assert.entityCount("Settlement", 1)
    assert.entityCount("Tree", 1)
    assert.entityCount("TreeOccurrence", 1)
    assert.fieldEquals("Settlement", id(), "tree", TREE)
    assert.fieldEquals("Settlement", id(), "buyer", BUYER)
    assert.fieldEquals("Settlement", id(), "totalAtomic", "10000")
    assert.fieldEquals("Settlement", id(), "sellerAtomic", "9500")
    assert.fieldEquals("Settlement", id(), "feeAtomic", "500")
    assert.fieldEquals("Settlement", id(), "nonce", NONCE)
    assert.fieldEquals("TreeOccurrence", id(), "treeHash", TREE)
    assert.fieldEquals("TreeOccurrence", id(), "root", id())
    assert.fieldEquals("TreeOccurrence", id(), "splitter", SPLITTER)
    assert.fieldEquals("TreeOccurrence", id(), "childCount", "2")
    assert.fieldEquals("TreeOccurrence", id(), "childTotalAtomic", "40000")
    assert.fieldEquals("TreeOccurrence", id(), "blockNumber", "1000")
    assert.fieldEquals("TreeOccurrence", id(), "timestamp", "1757000000")
    assert.fieldEquals("TreeOccurrence", id(), "txHash", TX)
    assert.fieldEquals("TreeOccurrence", id(), "logIndex", "7")
    assert.fieldEquals("Tree", TREE, "root", id())
    assert.fieldEquals("Tree", TREE, "occurrenceCount", "1")
    assert.fieldEquals("Tree", TREE, "ambiguous", "false")
    assert.fieldEquals("Tree", TREE, "childTotalAtomic", "40000")
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "1")
    assert.fieldEquals("Splitter", SPLITTER, "settledVolumeAtomic", "10000")
  })

  test("tree replay preserves one occurrence and never makes the summary ambiguous", () => {
    handleSettledTree(treeEvent())
    handleSettledTree(treeEvent())
    assert.entityCount("Settlement", 1)
    assert.entityCount("TreeOccurrence", 1)
    assert.fieldEquals("Tree", TREE, "root", id())
    assert.fieldEquals("Tree", TREE, "ambiguous", "false")
    assert.fieldEquals("Tree", TREE, "occurrenceCount", "1")
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "1")
  })

  test("second and third cross-emitter collisions retain first facts and permanently clear root", () => {
    handleSettledTree(treeEvent())
    const second = treeEvent("3", "8", OTHER_TX, TREE, "99999")
    second.block.number = BigInt.fromString("2000")
    second.block.timestamp = BigInt.fromString("1757001000")
    handleSettledTree(second)
    absent("Tree", TREE, "root")
    assert.fieldEquals("Tree", TREE, "occurrenceCount", "2")
    const third = treeEvent("4294967295", "9", THIRD_TX, TREE, "900719925474099300000")
    third.address = Address.fromString(OTHER_SPLITTER)
    third.block.number = BigInt.fromString("3000")
    third.block.timestamp = BigInt.fromString("1757002000")
    handleSettledTree(third)
    handleSettledTree(treeEvent())
    handleSettledTree(second)
    handleSettledTree(third)
    absent("Tree", TREE, "root")
    assert.entityCount("Settlement", 3)
    assert.entityCount("TreeOccurrence", 3)
    assert.entityCount("Tree", 1)
    assert.fieldEquals("Tree", TREE, "occurrenceCount", "3")
    assert.fieldEquals("Tree", TREE, "ambiguous", "true")
    assert.fieldEquals("Tree", TREE, "childCount", "2")
    assert.fieldEquals("Tree", TREE, "childTotalAtomic", "40000")
    assert.fieldEquals("Tree", TREE, "blockNumber", "1000")
    assert.fieldEquals("Tree", TREE, "timestamp", "1757000000")
    assert.fieldEquals("Tree", TREE, "txHash", TX)
    assert.fieldEquals("TreeOccurrence", id(9, THIRD_TX), "childCount", "4294967295")
    assert.fieldEquals("TreeOccurrence", id(9, THIRD_TX), "childTotalAtomic", "900719925474099300000")
    assert.fieldEquals("TreeOccurrence", id(9, THIRD_TX), "splitter", OTHER_SPLITTER)
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "2")
    assert.fieldEquals("Splitter", OTHER_SPLITTER, "settlementCount", "1")
  })

  test("same transaction with distinct tree log indices is two occurrences", () => {
    handleSettledTree(treeEvent())
    handleSettledTree(treeEvent("2", "8"))
    assert.entityCount("TreeOccurrence", 2)
    assert.fieldEquals("Tree", TREE, "occurrenceCount", "2")
    absent("Tree", TREE, "root")
  })

  test("distinct hashes preserve independent summaries", () => {
    handleSettledTree(treeEvent())
    handleSettledTree(treeEvent("3", "8", TX, OTHER_TREE))
    assert.entityCount("Tree", 2)
    assert.fieldEquals("Tree", TREE, "root", id())
    assert.fieldEquals("Tree", OTHER_TREE, "root", id(8))
  })

  test("plain and tree delivery share one immutable occurrence owner", () => {
    handleSettled(settledEvent())
    handleSettledTree(treeEvent())
    assert.entityCount("Tree", 0)
    assert.entityCount("TreeOccurrence", 0)
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "1")
    absent("Settlement", id(), "tree")
  })

  test("a plain replay cannot remove a prior tree association", () => {
    handleSettledTree(treeEvent())
    handleSettled(settledEvent())
    assert.fieldEquals("Settlement", id(), "tree", TREE)
    assert.fieldEquals("Tree", TREE, "occurrenceCount", "1")
    assert.fieldEquals("Splitter", SPLITTER, "settlementCount", "1")
  })

  test("zero count is an actual value, not an unknown field", () => { boundary("0", true) })
  test("max signed Int count is preserved on summary and occurrence", () => { boundary("2147483647", true) })
  test("max signed Int plus one stays exact only on the occurrence", () => { boundary("2147483648", false) })
  test("max uint32 count stays exact only on the occurrence", () => { boundary("4294967295", false) })

  test("stored-null assertion never accepts a measured zero", () => {
    handleSettledTree(treeEvent("0"))
    absent("Tree", TREE, "childCount")
  }, true)

  test("stored-null assertion never accepts a chosen root", () => {
    handleSettledTree(treeEvent())
    absent("Tree", TREE, "root")
  }, true)

  test("a later small count never replaces the first overflow or restores a root", () => {
    handleSettledTree(treeEvent("4294967295"))
    handleSettledTree(treeEvent("1", "8"))
    absent("Tree", TREE, "childCount")
    absent("Tree", TREE, "root")
    assert.fieldEquals("Tree", TREE, "occurrenceCount", "2")
    assert.fieldEquals("Tree", TREE, "ambiguous", "true")
    assert.fieldEquals("TreeOccurrence", id(), "childCount", "4294967295")
    assert.fieldEquals("TreeOccurrence", id(8), "childCount", "1")
  })

  test("tree money and time remain emitted values rather than recomputed policy", () => {
    const event = treeEvent("0", "7", TX, TREE, "900719925474099399999999")
    event.parameters[1] = new ethereum.EventParam("total", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("9007199254740993123456789")))
    event.parameters[2] = new ethereum.EventParam("sellerAmount", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("8007199254740993123456789")))
    event.parameters[3] = new ethereum.EventParam("feeAmount", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000000000000000000000")))
    event.block.number = BigInt.fromString("9007199254740993")
    event.block.timestamp = BigInt.fromString("1757999999")
    handleSettledTree(event)
    assert.fieldEquals("Settlement", id(), "totalAtomic", "9007199254740993123456789")
    assert.fieldEquals("Settlement", id(), "sellerAtomic", "8007199254740993123456789")
    assert.fieldEquals("Settlement", id(), "feeAtomic", "1000000000000000000000000")
    assert.fieldEquals("TreeOccurrence", id(), "blockNumber", "9007199254740993")
    assert.fieldEquals("Tree", TREE, "timestamp", "1757999999")
    assert.fieldEquals("Tree", TREE, "childCount", "0")
    assert.fieldEquals("Tree", TREE, "childTotalAtomic", "900719925474099399999999")
  })

  test("tree handler rejects a negative synthetic log index", () => {
    handleSettledTree(treeEvent("2", "-1"))
  }, true)

  test("tree handler rejects an oversized synthetic log index", () => {
    handleSettledTree(treeEvent("2", "2147483648"))
  }, true)
})
