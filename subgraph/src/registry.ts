import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import { Agent, RegistryEvent } from "../generated/schema"
import { ARC_CHAIN_ID, agentEntityId, occurrenceId } from "./ids"

// One explicitly pinned registry of each role; never selected by event metadata.
export const IDENTITY_REGISTRY = Address.fromString("0x8004a818bfb912233c491871b3d84c89a494bd9e")
export const REPUTATION_REGISTRY = Address.fromString("0x8004b663056a597dffe9eccc1965a193b7388713")
export const VALIDATION_REGISTRY = Address.fromString("0x8004cb1bf31daf7788923b405b754f57aceb4272")
export const REGISTERED = "registered"
export const TRANSFER = "transfer"
export const URI_UPDATED = "uri_updated"
export const METADATA_SET = "metadata_set"
export const NEW_FEEDBACK = "new_feedback"
export const FEEDBACK_REVOKED = "feedback_revoked"
export const VALIDATION_REQUEST = "validation_request"
export const VALIDATION_RESPONSE = "validation_response"
export const APPLIED = "applied"
export const MISSING_AGENT = "missing_agent"
export const MISSING_FEEDBACK = "missing_feedback"
export const MISSING_REQUEST = "missing_request"
export const DUPLICATE = "ignored_duplicate"
export const CONFLICT = "ignored_conflict"
export const INVALID_CLAIM = "invalid_claim"
export const INVALID_TOPIC = "invalid_topic"
export const INVALID_TAG = "invalid_tag"

export const UINT256_MAX = BigInt.fromString("115792089237316195423570985008687907853269984665640564039457584007913129639935")
export const UINT64_MAX = BigInt.fromString("18446744073709551615")
export const INT128_MIN = BigInt.fromString("-170141183460469231731687303715884105728")
export const INT128_MAX = BigInt.fromString("170141183460469231731687303715884105727")

export function requireUint(value: BigInt, max: BigInt = UINT256_MAX): void {
  assert(value.ge(BigInt.zero()) && value.le(max), "Invalid registry integer")
}
export function requireAddress(value: Bytes, nonzero: bool = false): void {
  assert(value.length == 20, "Invalid registry address")
  if (nonzero) {
    let present = false
    for (let i = 0; i < value.length; i++) if (value[i] != 0) present = true
    assert(present, "Unsupported zero registry owner")
  }
}
export function requireHash(value: Bytes): void { assert(value.length == 32, "Invalid registry hash") }
export function uint8(value: BigInt): i32 { requireUint(value, BigInt.fromI32(255)); return value.toI32() }

/** Canonical Graph order plus arbitrary exact replay, not a reorder/backfill buffer. */
export function beginRegistryEvent(event: ethereum.Event, expected: Address, kind: string): Bytes | null {
  assert(event.address.equals(expected), "Unexpected registry emitter")
  requireHash(event.transaction.hash)
  assert(event.block.number.ge(BigInt.zero()) && event.block.timestamp.ge(BigInt.zero()), "Invalid registry event coordinates")
  const id = occurrenceId(event.transaction.hash, event.logIndex)
  const old = RegistryEvent.load(id)
  if (old != null) {
    assert(old.registry.equals(event.address) && old.kind == kind && old.txHash.equals(event.transaction.hash) &&
      old.blockNumber.equals(event.block.number) && old.timestamp.equals(event.block.timestamp) && old.logIndex.equals(event.logIndex), "Conflicting registry occurrence")
    return null
  }
  return id
}

/** Callers pass only closed constants, after all transition validation and writes. */
export function finishRegistryEvent(event: ethereum.Event, id: Bytes, kind: string, disposition: string): void {
  const marker = new RegistryEvent(id)
  marker.registry = event.address
  marker.kind = kind
  marker.disposition = disposition
  marker.txHash = event.transaction.hash
  marker.blockNumber = event.block.number
  marker.timestamp = event.block.timestamp
  marker.logIndex = event.logIndex
  marker.save()
}

export function validateCounters(agent: Agent): void {
  assert(agent.feedbackCount.ge(BigInt.zero()) && agent.validationRequestCount.ge(BigInt.zero()) &&
    agent.validationPassCount.ge(BigInt.zero()) && agent.validationPassCount.le(agent.validationRequestCount), "Invalid registry counters")
}
export function knownAgent(number: BigInt): Agent | null {
  requireUint(number)
  const agent = Agent.load(agentEntityId(ARC_CHAIN_ID, number))
  if (agent != null) {
    assert(agent.chainId.equals(ARC_CHAIN_ID) && agent.agentId.equals(number) && agent.registry.equals(IDENTITY_REGISTRY), "Conflicting registry agent")
    requireAddress(agent.owner, true)
    validateCounters(agent)
  }
  return agent
}

/** Validate scalar text and byte budget before allocating its UTF8 encoding. */
export function boundedText(value: string, empty: bool = false): string | null {
  if (value.length > 2048 || (!empty && value.length == 0)) return null
  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 32 || code == 127) return null
    if (code <= 127) bytes += 1
    else if (code <= 2047) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      if (++i >= value.length) return null
      const low = value.charCodeAt(i)
      if (low < 0xdc00 || low > 0xdfff) return null
      bytes += 4
    } else if (code >= 0xdc00 && code <= 0xdfff) return null
    else bytes += 3
    if (bytes > 2048) return null
  }
  return value
}

/** Fatal UTF8 validation before host bytesToString, including scalar restrictions. */
export function metadataText(value: Bytes): string | null {
  if (value.length == 0 || value.length > 2048) return null
  let i = 0
  while (i < value.length) {
    const first = value[i]
    if (first <= 0x7f) {
      if (first < 32 || first == 127) return null
      i++; continue
    }
    let count = 0
    let lower: u8 = 0x80
    let upper: u8 = 0xbf
    if (first >= 0xc2 && first <= 0xdf) count = 2
    else if (first >= 0xe0 && first <= 0xef) {
      count = 3
      if (first == 0xe0) lower = 0xa0
      if (first == 0xed) upper = 0x9f
    } else if (first >= 0xf0 && first <= 0xf4) {
      count = 4
      if (first == 0xf0) lower = 0x90
      if (first == 0xf4) upper = 0x8f
    } else return null
    if (i + count > value.length || value[i + 1] < lower || value[i + 1] > upper) return null
    for (let j = 2; j < count; j++) if (value[i + j] < 0x80 || value[i + j] > 0xbf) return null
    i += count
  }
  return value.toString()
}

export function listingIdClaim(value: string): bool {
  if (value.length < 2 || value.length > 64) return false
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || (i > 0 && c == 45))) return false
  }
  return true
}
export function addressClaim(value: string): Bytes | null {
  if (value.length != 42 || value.slice(0, 2) != "0x") return null
  let nonzero = false
  for (let i = 2; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102))) return null
    if (c != 48) nonzero = true
  }
  return nonzero ? Bytes.fromHexString(value) : null
}
export function uintClaim(value: string): BigInt | null {
  if (value.length == 0 || value.length > 78 || (value.length > 1 && value.charCodeAt(0) == 48)) return null
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) < 48 || value.charCodeAt(i) > 57) return null
  const parsed = BigInt.fromString(value)
  return parsed.le(UINT256_MAX) ? parsed : null
}
