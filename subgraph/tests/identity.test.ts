import { Address, BigInt, Bytes, crypto, ethereum, store, ValueKind } from "@graphprotocol/graph-ts"
import { afterEach, assert, clearStore, describe, newMockEvent, test } from "matchstick-as/assembly/index"
import { MetadataSet, Registered, Transfer, URIUpdated } from "../generated/templates/IdentityRegistry/IdentityRegistry"
import { Agent } from "../generated/schema"
import { handleMetadataSet, handleRegistered, handleTransfer, handleURIUpdated } from "../src/identity"
import { boundedText } from "../src/registry"

const REGISTRY = "0x8004a818bfb912233c491871b3d84c89a494bd9e"
const OWNER = "0x1111111111111111111111111111111111111111"
const NEXT = "0x2222222222222222222222222222222222222222"
const ZERO = "0x0000000000000000000000000000000000000000"
const TX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const MAX = "115792089237316195423570985008687907853269984665640564039457584007913129639935"

function base(log: i32): ethereum.Event {
  const e = newMockEvent()
  e.address = Address.fromString(REGISTRY)
  e.transaction.hash = Bytes.fromHexString(TX)
  e.logIndex = BigInt.fromI32(log)
  e.block.number = BigInt.fromI32(800)
  e.block.timestamp = BigInt.fromI32(1700000000 + log)
  return e
}
function key(log: i32): string { return Bytes.fromHexString(TX).concatI32(log).toHexString() }
function registered(log: i32 = 1, agent: string = "7", owner: string = OWNER, uri: string = "https://example.invalid/agent"): Registered {
  const e = changetype<Registered>(base(log))
  e.parameters = [
    new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromString(agent))),
    new ethereum.EventParam("agentURI", ethereum.Value.fromString(uri)),
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(owner)))
  ]
  return e
}
function transfer(log: i32 = 2, to: string = NEXT, agent: string = "7"): Transfer {
  const e = changetype<Transfer>(base(log))
  e.parameters = [
    new ethereum.EventParam("from", ethereum.Value.fromAddress(Address.fromString(OWNER))),
    new ethereum.EventParam("to", ethereum.Value.fromAddress(Address.fromString(to))),
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromString(agent)))
  ]
  return e
}
function uri(log: i32, value: string): URIUpdated {
  const e = changetype<URIUpdated>(base(log))
  e.parameters = [
    new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))),
    new ethereum.EventParam("newURI", ethereum.Value.fromString(value)),
    new ethereum.EventParam("updatedBy", ethereum.Value.fromAddress(Address.fromString(NEXT)))
  ]
  return e
}
function metadata(log: i32, name: string, value: Bytes, agent: string = "7"): MetadataSet {
  const e = changetype<MetadataSet>(base(log))
  e.parameters = [
    new ethereum.EventParam("agentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromString(agent))),
    new ethereum.EventParam("indexedMetadataKey", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(crypto.keccak256(Bytes.fromUTF8(name))))),
    new ethereum.EventParam("metadataKey", ethereum.Value.fromString(name)),
    new ethereum.EventParam("metadataValue", ethereum.Value.fromBytes(value))
  ]
  return e
}
function absent(entity: string, id: string, field: string): void {
  const row = store.get(entity, id)
  assert.assertNotNull(row)
  if (row != null) { const v = row.get(field); if (v != null) assert.i32Equals(v.kind, ValueKind.NULL) }
}

describe("identity registry behavior", () => {
  afterEach(() => {
    assert.entityCount("Listing", 0)
    assert.entityCount("Splitter", 0)
    assert.entityCount("Marketplace", 0)
    assert.dataSourceCount("FeeSplitterV2", 0)
    assert.dataSourceCount("IdentityRegistry", 0)
    assert.dataSourceCount("ReputationRegistry", 0)
    assert.dataSourceCount("ValidationRegistry", 0)
    clearStore()
  })

  test("registers exact full-width identity and actual owner once", () => {
    handleRegistered(registered(1, MAX))
    const id = "5042002:" + MAX
    assert.fieldEquals("Agent", id, "owner", OWNER)
    assert.fieldEquals("Agent", id, "agentId", MAX)
    assert.fieldEquals("Agent", id, "registry", REGISTRY)
    assert.fieldEquals("Agent", id, "createdAt", "1700000001")
    assert.fieldEquals("Agent", id, "feedbackCount", "0")
    absent("Agent", id, "listing")
    absent("Agent", id, "agentWallet")
    assert.fieldEquals("RegistryEvent", key(1), "kind", "registered")
    assert.fieldEquals("RegistryEvent", key(1), "registry", REGISTRY)
    assert.fieldEquals("RegistryEvent", key(1), "logIndex", "1")
    assert.fieldEquals("RegistryEvent", key(1), "blockNumber", "800")
    assert.fieldEquals("RegistryEvent", key(1), "timestamp", "1700000001")
    handleRegistered(registered(1, MAX))
    assert.entityCount("Agent", 1)
    assert.entityCount("RegistryEvent", 1)
  })
  test("mint and unknown events cannot fabricate agents or later backfill", () => {
    handleTransfer(transfer(1, OWNER))
    handleURIUpdated(uri(2, "https://example.invalid/skipped"))
    const claim = metadata(3, "arcade.listingId", Bytes.fromUTF8("a-skill"))
    handleMetadataSet(claim)
    assert.entityCount("Agent", 0)
    assert.entityCount("ListingClaim", 0)
    assert.entityCount("RegistryEvent", 3)
    assert.fieldEquals("RegistryEvent", key(3), "disposition", "missing_agent")
    handleRegistered(registered(4))
    handleMetadataSet(claim)
    handleURIUpdated(uri(2, "https://example.invalid/skipped"))
    assert.entityCount("ListingClaim", 0)
    assert.fieldEquals("Agent", "5042002:7", "agentURI", "https://example.invalid/agent")
  })
  test("transfer changes actual owner and clears wallet; old events never rewind", () => {
    handleRegistered(registered())
    const a = Agent.load("5042002:7")!
    a.agentWallet = Bytes.fromHexString(OWNER)
    a.save()
    handleTransfer(transfer())
    handleRegistered(registered())
    handleRegistered(registered(3, "7", OWNER))
    handleTransfer(transfer())
    assert.fieldEquals("Agent", "5042002:7", "owner", NEXT)
    assert.fieldEquals("Agent", "5042002:7", "createdAt", "1700000001")
    assert.fieldEquals("Agent", "5042002:7", "updatedAt", "1700000002")
    absent("Agent", "5042002:7", "agentWallet")
    assert.entityCount("RegistryEvent", 3)
  })
  test("URI operator does not become owner and invalid update clears stale URI", () => {
    handleRegistered(registered())
    handleURIUpdated(uri(2, "https://example.invalid/新"))
    assert.fieldEquals("Agent", "5042002:7", "owner", OWNER)
    assert.fieldEquals("Agent", "5042002:7", "agentURI", "https://example.invalid/新")
    handleURIUpdated(uri(3, "bad\u0000uri"))
    absent("Agent", "5042002:7", "agentURI")
    handleURIUpdated(uri(2, "https://example.invalid/新"))
    absent("Agent", "5042002:7", "agentURI")
  })
  test("invalid optional registration URI does not erase valid registration", () => {
    handleRegistered(registered(1, "7", OWNER, "x".repeat(2049)))
    assert.fieldEquals("Agent", "5042002:7", "owner", OWNER)
    absent("Agent", "5042002:7", "agentURI")
  })
  test("records four immutable claims in arbitrary order without binding", () => {
    handleRegistered(registered())
    handleMetadataSet(metadata(2, "arcade.endpoint", Bytes.fromUTF8("opaque:新/😀")))
    handleMetadataSet(metadata(3, "arcade.priceAtomic", Bytes.fromUTF8(MAX)))
    handleMetadataSet(metadata(4, "arcade.feeSplitter", Bytes.fromUTF8(NEXT)))
    handleMetadataSet(metadata(5, "arcade.listingId", Bytes.fromUTF8("some-skill")))
    assert.entityCount("ListingClaim", 4)
    assert.fieldEquals("ListingClaim", key(2), "claimedEndpoint", "opaque:新/😀")
    assert.fieldEquals("ListingClaim", key(3), "claimedPriceAtomic", MAX)
    assert.fieldEquals("ListingClaim", key(4), "claimedSplitter", NEXT)
    assert.fieldEquals("ListingClaim", key(5), "claimedListingId", "some-skill")
    assert.fieldEquals("ListingClaim", key(5), "agent", "5042002:7")
    absent("ListingClaim", key(2), "claimedListingId")
    absent("Agent", "5042002:7", "listing")
    assert.fieldEquals("Agent", "5042002:7", "updatedAt", "1700000001")
  })
  test("cross-agent same claims and distinct occurrences never imply canonical ownership", () => {
    handleRegistered(registered())
    handleRegistered(registered(2, "8", NEXT))
    const first = metadata(3, "arcade.listingId", Bytes.fromUTF8("same-skill"))
    handleMetadataSet(first)
    handleMetadataSet(first)
    handleMetadataSet(metadata(4, "arcade.listingId", Bytes.fromUTF8("same-skill"), "8"))
    handleMetadataSet(metadata(5, "arcade.listingId", Bytes.fromUTF8("same-skill")))
    assert.entityCount("ListingClaim", 3)
    absent("Agent", "5042002:7", "listing")
    absent("Agent", "5042002:8", "listing")
  })
  test("wrong indexed key, unknown key and agentWallet never become claims", () => {
    handleRegistered(registered())
    const bad = metadata(2, "arcade.listingId", Bytes.fromUTF8("some-skill"))
    bad.parameters[1] = new ethereum.EventParam("indexedMetadataKey", ethereum.Value.fromFixedBytes(Bytes.fromHexString(TX)))
    handleMetadataSet(bad)
    handleMetadataSet(metadata(3, "unknown", Bytes.fromUTF8("some-skill")))
    handleMetadataSet(metadata(4, "agentWallet", Bytes.fromUTF8(OWNER)))
    assert.entityCount("ListingClaim", 0)
    absent("Agent", "5042002:7", "agentWallet")
    assert.fieldEquals("RegistryEvent", key(2), "disposition", "invalid_topic")
  })
  test("rejects malformed UTF8, controls and byte overflows without losing agent", () => {
    handleRegistered(registered())
    const invalid = ["0xc3", "0x80", "0xc080", "0xeda080", "0xf4908080", "0xe228a1", "0x00", "0x7f"]
    for (let i = 0; i < invalid.length; i++) handleMetadataSet(metadata(i + 2, "arcade.endpoint", Bytes.fromHexString(invalid[i])))
    handleMetadataSet(metadata(20, "arcade.endpoint", Bytes.fromUTF8("新".repeat(683))))
    handleMetadataSet(metadata(21, "arcade.endpoint", Bytes.fromUTF8("")))
    assert.entityCount("ListingClaim", 0)
    assert.entityCount("Agent", 1)
    handleMetadataSet(metadata(22, "arcade.endpoint", Bytes.fromUTF8("x".repeat(2048))))
    assert.entityCount("ListingClaim", 1)
  })
  test("claim grammar rejects coercion while preserving zero and full uint256", () => {
    handleRegistered(registered())
    const invalid = ["00", "+1", "-1", " 1", "1\n", "1e3", MAX + "0", "115792089237316195423570985008687907853269984665640564039457584007913129639936"]
    for (let i = 0; i < invalid.length; i++) handleMetadataSet(metadata(i + 2, "arcade.priceAtomic", Bytes.fromUTF8(invalid[i])))
    handleMetadataSet(metadata(20, "arcade.feeSplitter", Bytes.fromUTF8(ZERO)))
    handleMetadataSet(metadata(21, "arcade.feeSplitter", Bytes.fromUTF8("0xgg" + "1".repeat(38))))
    handleMetadataSet(metadata(22, "arcade.listingId", Bytes.fromUTF8("A-skill")))
    handleMetadataSet(metadata(23, "arcade.listingId", Bytes.fromUTF8("a")))
    assert.entityCount("ListingClaim", 0)
    handleMetadataSet(metadata(24, "arcade.priceAtomic", Bytes.fromUTF8("0")))
    assert.fieldEquals("ListingClaim", key(24), "claimedPriceAtomic", "0")
  })
  test("refuses known burn rather than preserve a stale eligible owner", () => { handleRegistered(registered()); handleTransfer(transfer(2, ZERO)) }, true)
  test("refuses zero registration owner", () => { handleRegistered(registered(1, "7", ZERO)) }, true)
  test("refuses an unpinned registry emitter", () => { const e = registered(); e.address = Address.fromString(NEXT); handleRegistered(e) }, true)
  test("refuses invalid event log index before creating marker", () => { const e = registered(); e.logIndex = BigInt.fromString("2147483648"); handleRegistered(e) }, true)

  test("strict scalar helper and metadata enforce exact Unicode byte boundaries", () => {
    assert.booleanEquals(boundedText(String.fromCharCode(0xd800)) === null, true)
    assert.booleanEquals(boundedText(String.fromCharCode(0xdc00)) === null, true)
    assert.booleanEquals(boundedText(String.fromCharCode(0xd800, 65)) === null, true)
    const exact = "新".repeat(682) + "ab"
    assert.booleanEquals(boundedText(exact) !== null, true)
    assert.booleanEquals(boundedText(exact + "c") === null, true)
    assert.stringEquals(boundedText("😀")!, "😀")
    handleRegistered(registered())
    handleMetadataSet(metadata(2, "arcade.endpoint", Bytes.fromUTF8(exact)))
    handleMetadataSet(metadata(3, "arcade.endpoint", Bytes.fromUTF8(exact + "c")))
    assert.entityCount("ListingClaim", 1)
    assert.fieldEquals("RegistryEvent", key(2), "disposition", "applied")
    assert.fieldEquals("RegistryEvent", key(3), "disposition", "invalid_claim")
    assert.fieldEquals("Agent", "5042002:7", "updatedAt", "1700000001")
  })
  test("refuses a duplicate occurrence with conflicting recorded coordinates", () => {
    handleRegistered(registered())
    const conflict = registered()
    conflict.block.number = BigInt.fromI32(801)
    handleRegistered(conflict)
  }, true)
})
