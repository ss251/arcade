import { BigInt, Bytes, crypto } from "@graphprotocol/graph-ts"
import { FeedbackRevoked, NewFeedback } from "../generated/templates/ReputationRegistry/ReputationRegistry"
import { Feedback } from "../generated/schema"
import { ARC_CHAIN_ID, agentEntityId } from "./ids"
import { APPLIED, CONFLICT, DUPLICATE, FEEDBACK_REVOKED, INT128_MAX, INT128_MIN, INVALID_TAG, INVALID_TOPIC, MISSING_AGENT, MISSING_FEEDBACK, NEW_FEEDBACK, REPUTATION_REGISTRY, UINT64_MAX, beginRegistryEvent, boundedText, finishRegistryEvent, knownAgent, requireAddress, requireHash, requireUint, uint8 } from "./registry"

function feedbackId(agentId: BigInt, client: Bytes, index: BigInt): string {
  requireUint(agentId)
  requireUint(index, UINT64_MAX)
  requireAddress(client)
  return agentEntityId(ARC_CHAIN_ID, agentId) + ":" + client.toHexString() + ":" + index.toString()
}

export function handleNewFeedback(event: NewFeedback): void {
  const id = beginRegistryEvent(event, REPUTATION_REGISTRY, NEW_FEEDBACK)
  if (id === null) return
  const params = event.params
  const logicalId = feedbackId(params.agentId, params.clientAddress, params.feedbackIndex)
  assert(params.value.ge(INT128_MIN) && params.value.le(INT128_MAX), "Invalid registry signed value")
  // Validate the full stored integer before the generated uint8 getter narrows it.
  const decimals = uint8(event.parameters[4].value.toBigInt())
  requireHash(params.feedbackHash)
  const tag = boundedText(params.tag1, true)
  if (tag === null) { finishRegistryEvent(event, id, NEW_FEEDBACK, INVALID_TAG); return }
  if (!params.indexedTag1.equals(Bytes.fromByteArray(crypto.keccak256(Bytes.fromUTF8(tag))))) {
    finishRegistryEvent(event, id, NEW_FEEDBACK, INVALID_TOPIC); return
  }
  const agent = knownAgent(params.agentId)
  if (agent == null) { finishRegistryEvent(event, id, NEW_FEEDBACK, MISSING_AGENT); return }
  const tag2 = boundedText(params.tag2)
  const endpoint = boundedText(params.endpoint)
  const feedbackURI = boundedText(params.feedbackURI)
  const old = Feedback.load(logicalId)
  if (old != null) {
    const same = old.agent == agent.id && old.clientAddress.equals(params.clientAddress) && old.feedbackIndex.equals(params.feedbackIndex) &&
      old.value.equals(params.value) && old.valueDecimals == decimals && old.tag1 == tag && old.tag2 == tag2 &&
      old.endpoint == endpoint && old.feedbackURI == feedbackURI && old.feedbackHash !== null && old.feedbackHash!.equals(params.feedbackHash)
    finishRegistryEvent(event, id, NEW_FEEDBACK, same ? DUPLICATE : CONFLICT)
    return
  }
  const feedback = new Feedback(logicalId)
  feedback.agent = agent.id
  feedback.clientAddress = params.clientAddress
  feedback.feedbackIndex = params.feedbackIndex
  feedback.value = params.value
  feedback.valueDecimals = decimals
  feedback.tag1 = tag
  feedback.tag2 = tag2
  feedback.endpoint = endpoint
  feedback.feedbackURI = feedbackURI
  feedback.feedbackHash = params.feedbackHash
  feedback.isRevoked = false
  feedback.createdAt = event.block.timestamp
  feedback.txHash = event.transaction.hash
  agent.feedbackCount = agent.feedbackCount.plus(BigInt.fromI32(1))
  agent.updatedAt = event.block.timestamp
  feedback.save()
  agent.save()
  finishRegistryEvent(event, id, NEW_FEEDBACK, APPLIED)
}

export function handleFeedbackRevoked(event: FeedbackRevoked): void {
  const id = beginRegistryEvent(event, REPUTATION_REGISTRY, FEEDBACK_REVOKED)
  if (id === null) return
  const params = event.params
  const logicalId = feedbackId(params.agentId, params.clientAddress, params.feedbackIndex)
  const agent = knownAgent(params.agentId)
  if (agent == null) { finishRegistryEvent(event, id, FEEDBACK_REVOKED, MISSING_AGENT); return }
  const feedback = Feedback.load(logicalId)
  if (feedback == null) { finishRegistryEvent(event, id, FEEDBACK_REVOKED, MISSING_FEEDBACK); return }
  assert(feedback.agent == agent.id && feedback.clientAddress.equals(params.clientAddress) && feedback.feedbackIndex.equals(params.feedbackIndex), "Conflicting registry feedback")
  if (feedback.isRevoked) { finishRegistryEvent(event, id, FEEDBACK_REVOKED, DUPLICATE); return }
  assert(agent.feedbackCount.gt(BigInt.zero()), "Invalid registry counters")
  const nextCount = agent.feedbackCount.minus(BigInt.fromI32(1))
  feedback.isRevoked = true
  feedback.revokedAt = event.block.timestamp
  agent.feedbackCount = nextCount
  agent.updatedAt = event.block.timestamp
  feedback.save()
  agent.save()
  finishRegistryEvent(event, id, FEEDBACK_REVOKED, APPLIED)
}
