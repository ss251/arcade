import { Address, BigInt, Bytes, crypto, ethereum, store, ValueKind } from "@graphprotocol/graph-ts"
import { afterEach, assert, clearStore, describe, newMockEvent, test } from "matchstick-as/assembly/index"
import { Registered } from "../generated/templates/IdentityRegistry/IdentityRegistry"
import { FeedbackRevoked, NewFeedback } from "../generated/templates/ReputationRegistry/ReputationRegistry"
import { Agent } from "../generated/schema"
import { handleRegistered } from "../src/identity"
import { handleFeedbackRevoked, handleNewFeedback } from "../src/reputation"

const IDENTITY = "0x8004a818bfb912233c491871b3d84c89a494bd9e"
const REGISTRY = "0x8004b663056a597dffe9eccc1965a193b7388713"
const CLIENT = "0x1111111111111111111111111111111111111111"
const TX = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const MAX_INDEX = "18446744073709551615"
const MIN_VALUE = "-170141183460469231731687303715884105728"
const MAX_VALUE = "170141183460469231731687303715884105727"
function base(log: i32): ethereum.Event {
  const e = newMockEvent(); e.address = Address.fromString(REGISTRY); e.transaction.hash = Bytes.fromHexString(TX)
  e.logIndex = BigInt.fromI32(log); e.block.number = BigInt.fromI32(900); e.block.timestamp = BigInt.fromI32(1700000000 + log); return e
}
function register(log: i32 = 1): void {
  const e = changetype<Registered>(base(log)); e.address = Address.fromString(IDENTITY)
  e.parameters = [new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))), new ethereum.EventParam("agentURI", ethereum.Value.fromString("")), new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(CLIENT)))]
  handleRegistered(e)
}
function feedback(log: i32, index: string = MAX_INDEX, value: string = MIN_VALUE, tag: string = "paid"): NewFeedback {
  const e = changetype<NewFeedback>(base(log))
  e.parameters = [
    new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))),
    new ethereum.EventParam("clientAddress", ethereum.Value.fromAddress(Address.fromString(CLIENT))),
    new ethereum.EventParam("feedbackIndex", ethereum.Value.fromUnsignedBigInt(BigInt.fromString(index))),
    new ethereum.EventParam("value", ethereum.Value.fromSignedBigInt(BigInt.fromString(value))),
    new ethereum.EventParam("valueDecimals", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(255))),
    new ethereum.EventParam("indexedTag1", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(crypto.keccak256(Bytes.fromUTF8(tag))))),
    new ethereum.EventParam("tag1", ethereum.Value.fromString(tag)),
    new ethereum.EventParam("tag2", ethereum.Value.fromString("bad\u0000tag")),
    new ethereum.EventParam("endpoint", ethereum.Value.fromString("opaque:新")),
    new ethereum.EventParam("feedbackURI", ethereum.Value.fromString("x".repeat(2049))),
    new ethereum.EventParam("feedbackHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString(TX)))
  ]; return e
}
function revoked(log: i32, index: string = MAX_INDEX): FeedbackRevoked {
  const e = changetype<FeedbackRevoked>(base(log)); e.parameters = [new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))), new ethereum.EventParam("clientAddress", ethereum.Value.fromAddress(Address.fromString(CLIENT))), new ethereum.EventParam("feedbackIndex", ethereum.Value.fromUnsignedBigInt(BigInt.fromString(index)))]; return e
}
function id(index: string = MAX_INDEX): string { return "5042002:7:" + CLIENT + ":" + index }
function absent(field: string): void { const row = store.get("Feedback", id())!; const v = row.get(field); if (v != null) assert.i32Equals(v.kind, ValueKind.NULL) }

describe("reputation registry behavior", () => {
  afterEach(() => {
    assert.entityCount("Marketplace", 0); assert.entityCount("Listing", 0); assert.entityCount("Splitter", 0)
    assert.dataSourceCount("FeeSplitterV2", 0); assert.dataSourceCount("IdentityRegistry", 0)
    assert.dataSourceCount("ReputationRegistry", 0); assert.dataSourceCount("ValidationRegistry", 0); clearStore()
  })
  test("preserves signed values, full index and independently optional text", () => {
    register(); handleNewFeedback(feedback(2)); handleNewFeedback(feedback(3, "0", MAX_VALUE, ""))
    assert.fieldEquals("Feedback", id(), "value", MIN_VALUE); assert.fieldEquals("Feedback", id("0"), "value", MAX_VALUE)
    assert.fieldEquals("Feedback", id(), "valueDecimals", "255"); assert.fieldEquals("Feedback", id(), "feedbackIndex", MAX_INDEX)
    assert.fieldEquals("Feedback", id(), "endpoint", "opaque:新"); assert.fieldEquals("Feedback", id(), "feedbackHash", TX)
    absent("tag2"); absent("feedbackURI"); assert.fieldEquals("Agent", "5042002:7", "feedbackCount", "2")
  })
  test("duplicates and logical conflicts never replace original feedback", () => {
    register(); handleNewFeedback(feedback(2)); handleNewFeedback(feedback(2)); handleNewFeedback(feedback(3, MAX_INDEX, "42"))
    assert.entityCount("Feedback", 1); assert.fieldEquals("Feedback", id(), "value", MIN_VALUE); assert.fieldEquals("Agent", "5042002:7", "feedbackCount", "1")
    assert.entityCount("RegistryEvent", 3)
  })
  test("revocation decrements once and old/new duplicate feedback cannot resurrect", () => {
    register(); handleNewFeedback(feedback(2)); handleFeedbackRevoked(revoked(3)); handleFeedbackRevoked(revoked(3)); handleFeedbackRevoked(revoked(4)); handleNewFeedback(feedback(2)); handleNewFeedback(feedback(5))
    assert.fieldEquals("Feedback", id(), "isRevoked", "true"); assert.fieldEquals("Feedback", id(), "revokedAt", "1700000003")
    assert.fieldEquals("Agent", "5042002:7", "feedbackCount", "0"); assert.entityCount("Feedback", 1)
  })
  test("unknown-agent feedback and missing-feedback revoke stay skipped on replay", () => {
    handleNewFeedback(feedback(1)); register(2); handleNewFeedback(feedback(1)); handleFeedbackRevoked(revoked(3)); handleNewFeedback(feedback(4)); handleFeedbackRevoked(revoked(3))
    assert.fieldEquals("Agent", "5042002:7", "feedbackCount", "1"); assert.fieldEquals("Feedback", id(), "isRevoked", "false")
  })
  test("wrong indexed tag or invalid/oversized tag1 is a remembered skip", () => {
    register(); const bad = feedback(2); bad.parameters[5] = new ethereum.EventParam("indexedTag1", ethereum.Value.fromFixedBytes(Bytes.fromHexString(TX)))
    handleNewFeedback(bad); handleNewFeedback(feedback(3, "2", "0", "bad\u0000tag")); handleNewFeedback(feedback(4, "3", "0", "新".repeat(683)))
    assert.entityCount("Feedback", 0); assert.fieldEquals("Agent", "5042002:7", "feedbackCount", "0"); assert.entityCount("RegistryEvent", 4)
    assert.fieldEquals("RegistryEvent", Bytes.fromHexString(TX).concatI32(3).toHexString(), "disposition", "invalid_tag")
  })
  test("counter corruption refuses revocation instead of clamping", () => {
    register(); handleNewFeedback(feedback(2)); const a = Agent.load("5042002:7")!; a.feedbackCount = BigInt.zero(); a.save(); handleFeedbackRevoked(revoked(3))
  }, true)
  test("rejects synthetic signed-value overflow", () => { register(); handleNewFeedback(feedback(2, "1", "170141183460469231731687303715884105728")) }, true)
  test("rejects synthetic feedback-index overflow", () => { register(); handleNewFeedback(feedback(2, "18446744073709551616")) }, true)
  test("rejects decoded valueDecimals256 before generated narrowing", () => {
    register(); const e = feedback(2); e.parameters[4] = new ethereum.EventParam("valueDecimals", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(256))); handleNewFeedback(e)
  }, true)
  test("rejects decoded negative valueDecimals before generated narrowing", () => {
    register(); const e = feedback(2); e.parameters[4] = new ethereum.EventParam("valueDecimals", ethereum.Value.fromSignedBigInt(BigInt.fromI32(-1))); handleNewFeedback(e)
  }, true)
  test("changed retained optional feedback text is conflict, never exact duplicate", () => {
    register(); handleNewFeedback(feedback(2))
    const fields = [7, 8, 9]
    for (let i = 0; i < fields.length; i++) {
      const e = feedback(i + 3)
      e.parameters[fields[i]] = new ethereum.EventParam("changed", ethereum.Value.fromString("different:retained-text"))
      handleNewFeedback(e)
      assert.fieldEquals("RegistryEvent", Bytes.fromHexString(TX).concatI32(i + 3).toHexString(), "disposition", "ignored_conflict")
    }
    assert.fieldEquals("Feedback", id(), "endpoint", "opaque:新")
    absent("tag2"); absent("feedbackURI")
    assert.fieldEquals("Agent", "5042002:7", "feedbackCount", "1")
  })
})
