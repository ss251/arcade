import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import { afterEach, assert, clearStore, describe, newMockEvent, test } from "matchstick-as/assembly/index"
import { Registered } from "../generated/templates/IdentityRegistry/IdentityRegistry"
import { ValidationRequest, ValidationResponse } from "../generated/templates/ValidationRegistry/ValidationRegistry"
import { Agent } from "../generated/schema"
import { handleRegistered } from "../src/identity"
import { handleValidationRequest, handleValidationResponse } from "../src/validation"

const IDENTITY = "0x8004a818bfb912233c491871b3d84c89a494bd9e"
const REGISTRY = "0x8004cb1bf31daf7788923b405b754f57aceb4272"
const VALIDATOR = "0x1111111111111111111111111111111111111111"
const OTHER = "0x2222222222222222222222222222222222222222"
const TX = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
const HASH = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
function base(log: i32): ethereum.Event {
  const e = newMockEvent(); e.address = Address.fromString(REGISTRY); e.transaction.hash = Bytes.fromHexString(TX)
  e.logIndex = BigInt.fromI32(log); e.block.number = BigInt.fromI32(1000); e.block.timestamp = BigInt.fromI32(1700000000 + log); return e
}
function register(log: i32 = 1, agent: i32 = 7): void {
  const e = changetype<Registered>(base(log)); e.address = Address.fromString(IDENTITY)
  e.parameters = [new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(agent))), new ethereum.EventParam("agentURI", ethereum.Value.fromString("")), new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(OTHER)))]; handleRegistered(e)
}
function request(log: i32, agent: i32 = 7, validator: string = VALIDATOR): ValidationRequest {
  const e = changetype<ValidationRequest>(base(log)); e.parameters = [
    new ethereum.EventParam("validatorAddress", ethereum.Value.fromAddress(Address.fromString(validator))),
    new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(agent))),
    new ethereum.EventParam("requestURI", ethereum.Value.fromString("opaque:request")),
    new ethereum.EventParam("requestHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString(HASH)))
  ]; return e
}
function response(log: i32, value: i32, agent: i32 = 7, validator: string = VALIDATOR): ValidationResponse {
  const e = changetype<ValidationResponse>(base(log)); e.parameters = [
    new ethereum.EventParam("validatorAddress", ethereum.Value.fromAddress(Address.fromString(validator))),
    new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(agent))),
    new ethereum.EventParam("requestHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString(HASH))),
    new ethereum.EventParam("response", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(value))),
    new ethereum.EventParam("responseURI", ethereum.Value.fromString("opaque:response")),
    new ethereum.EventParam("responseHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString(TX))),
    new ethereum.EventParam("tag", ethereum.Value.fromString("tag"))
  ]; return e
}
describe("validation registry behavior", () => {
  afterEach(() => {
    assert.entityCount("Marketplace", 0); assert.entityCount("Listing", 0); assert.entityCount("Splitter", 0)
    assert.dataSourceCount("FeeSplitterV2", 0); assert.dataSourceCount("IdentityRegistry", 0)
    assert.dataSourceCount("ReputationRegistry", 0); assert.dataSourceCount("ValidationRegistry", 0); clearStore()
  })
  test("request records first identity and counts only once", () => {
    register(); handleValidationRequest(request(2)); handleValidationRequest(request(2)); handleValidationRequest(request(3)); handleValidationRequest(request(4, 7, OTHER))
    assert.fieldEquals("Validation", HASH, "agent", "5042002:7"); assert.fieldEquals("Validation", HASH, "validatorAddress", VALIDATOR)
    assert.fieldEquals("Validation", HASH, "createdAt", "1700000002"); assert.fieldEquals("Validation", HASH, "status", "PENDING")
    assert.fieldEquals("Agent", "5042002:7", "validationRequestCount", "1"); assert.entityCount("RegistryEvent", 4)
  })
  test("latest response pass count is a delta and replay cannot rewind", () => {
    register(); handleValidationRequest(request(2)); handleValidationResponse(response(3, 50)); handleValidationResponse(response(4, 100))
    assert.fieldEquals("Agent", "5042002:7", "validationPassCount", "1")
    handleValidationResponse(response(5, 49)); assert.fieldEquals("Agent", "5042002:7", "validationPassCount", "0")
    handleValidationResponse(response(6, 50)); handleValidationResponse(response(5, 49)); handleValidationRequest(request(2)); handleValidationRequest(request(7))
    assert.fieldEquals("Agent", "5042002:7", "validationPassCount", "1"); assert.fieldEquals("Agent", "5042002:7", "validationRequestCount", "1")
    assert.fieldEquals("Validation", HASH, "response", "50"); assert.fieldEquals("Validation", HASH, "updatedAt", "1700000006")
    assert.fieldEquals("Validation", HASH, "createdAt", "1700000002")
  })
  test("classification retains raw 0/49/50/100/101/255 values", () => {
    register(); handleValidationRequest(request(2)); const values = [0, 49, 50, 100, 101, 255]
    for (let i = 0; i < values.length; i++) {
      handleValidationResponse(response(i + 3, values[i])); assert.fieldEquals("Validation", HASH, "response", values[i].toString())
      assert.fieldEquals("Validation", HASH, "status", values[i] >= 50 && values[i] <= 100 ? "PASSED" : "FAILED")
      assert.fieldEquals("Agent", "5042002:7", "validationPassCount", values[i] >= 50 && values[i] <= 100 ? "1" : "0")
    }
  })
  test("missing requests/agents and conflicting responses remain skipped on replay", () => {
    handleValidationRequest(request(1)); register(2); handleValidationRequest(request(1)); assert.entityCount("Validation", 0)
    handleValidationResponse(response(3, 100)); handleValidationRequest(request(4)); handleValidationResponse(response(3, 100))
    register(5, 8); handleValidationResponse(response(6, 100, 8)); handleValidationResponse(response(7, 100, 7, OTHER))
    assert.fieldEquals("Validation", HASH, "status", "PENDING"); assert.fieldEquals("Agent", "5042002:7", "validationPassCount", "0")
    assert.fieldEquals("Agent", "5042002:8", "validationPassCount", "0")
    assert.fieldEquals("RegistryEvent", Bytes.fromHexString(TX).concatI32(3).toHexString(), "disposition", "missing_request")
    assert.fieldEquals("RegistryEvent", Bytes.fromHexString(TX).concatI32(7).toHexString(), "disposition", "ignored_conflict")
  })
  test("response underflow fails rather than mutate counters or fabricate zero", () => {
    register(); handleValidationRequest(request(2)); handleValidationResponse(response(3, 100)); const a = Agent.load("5042002:7")!; a.validationPassCount = BigInt.zero(); a.save(); handleValidationResponse(response(4, 0))
  }, true)
  test("rejects a synthetic response outside uint8", () => { register(); handleValidationRequest(request(2)); handleValidationResponse(response(3, 256)) }, true)
  test("rejects a decoded negative response before generated narrowing", () => { register(); handleValidationRequest(request(2)); handleValidationResponse(response(3, -1)) }, true)
})
