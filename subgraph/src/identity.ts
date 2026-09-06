import { BigInt, Bytes, crypto } from "@graphprotocol/graph-ts"
import { MetadataSet, Registered, Transfer, URIUpdated } from "../generated/templates/IdentityRegistry/IdentityRegistry"
import { Agent, ListingClaim } from "../generated/schema"
import { ARC_CHAIN_ID, agentEntityId } from "./ids"
import { APPLIED, CONFLICT, DUPLICATE, IDENTITY_REGISTRY, INVALID_CLAIM, INVALID_TOPIC, METADATA_SET, MISSING_AGENT, REGISTERED, TRANSFER, URI_UPDATED, addressClaim, beginRegistryEvent, boundedText, finishRegistryEvent, knownAgent, listingIdClaim, metadataText, requireAddress, uintClaim } from "./registry"

export function handleRegistered(event: Registered): void {
  const id = beginRegistryEvent(event, IDENTITY_REGISTRY, REGISTERED)
  if (id === null) return
  const params = event.params
  requireAddress(params.owner, true)
  const previous = knownAgent(params.agentId)
  if (previous != null) {
    finishRegistryEvent(event, id, REGISTERED, previous.owner.equals(params.owner) ? DUPLICATE : CONFLICT)
    return
  }
  const agent = new Agent(agentEntityId(ARC_CHAIN_ID, params.agentId))
  agent.chainId = ARC_CHAIN_ID
  agent.agentId = params.agentId
  agent.registry = event.address
  agent.owner = params.owner
  agent.agentURI = boundedText(params.agentURI)
  agent.createdAt = event.block.timestamp
  agent.updatedAt = event.block.timestamp
  agent.feedbackCount = BigInt.zero()
  agent.validationRequestCount = BigInt.zero()
  agent.validationPassCount = BigInt.zero()
  agent.save()
  finishRegistryEvent(event, id, REGISTERED, APPLIED)
}

export function handleTransfer(event: Transfer): void {
  const id = beginRegistryEvent(event, IDENTITY_REGISTRY, TRANSFER)
  if (id === null) return
  const agent = knownAgent(event.params.tokenId)
  if (agent == null) { finishRegistryEvent(event, id, TRANSFER, MISSING_AGENT); return }
  // Actual recipient wins even if the observed `from` predates our partial history.
  // Required owner cannot truthfully represent a known burn; refuse before writes.
  requireAddress(event.params.to, true)
  agent.owner = event.params.to
  agent.agentWallet = null
  agent.updatedAt = event.block.timestamp
  agent.save()
  finishRegistryEvent(event, id, TRANSFER, APPLIED)
}

export function handleURIUpdated(event: URIUpdated): void {
  const id = beginRegistryEvent(event, IDENTITY_REGISTRY, URI_UPDATED)
  if (id === null) return
  const agent = knownAgent(event.params.agentId)
  if (agent == null) { finishRegistryEvent(event, id, URI_UPDATED, MISSING_AGENT); return }
  agent.agentURI = boundedText(event.params.newURI)
  agent.updatedAt = event.block.timestamp
  agent.save()
  finishRegistryEvent(event, id, URI_UPDATED, APPLIED)
}

export function handleMetadataSet(event: MetadataSet): void {
  const id = beginRegistryEvent(event, IDENTITY_REGISTRY, METADATA_SET)
  if (id === null) return
  const params = event.params
  const key = params.metadataKey
  if (key != "arcade.listingId" && key != "arcade.feeSplitter" && key != "arcade.priceAtomic" && key != "arcade.endpoint") return
  if (!params.indexedMetadataKey.equals(Bytes.fromByteArray(crypto.keccak256(Bytes.fromUTF8(key))))) {
    finishRegistryEvent(event, id, METADATA_SET, INVALID_TOPIC); return
  }
  const agent = knownAgent(params.agentId)
  if (agent == null) { finishRegistryEvent(event, id, METADATA_SET, MISSING_AGENT); return }
  const value = metadataText(params.metadataValue)
  if (value === null) { finishRegistryEvent(event, id, METADATA_SET, INVALID_CLAIM); return }
  const claim = new ListingClaim(id)
  if (key == "arcade.listingId") {
    if (!listingIdClaim(value)) { finishRegistryEvent(event, id, METADATA_SET, INVALID_CLAIM); return }
    claim.claimedListingId = value
  } else if (key == "arcade.feeSplitter") {
    const address = addressClaim(value)
    if (address === null) { finishRegistryEvent(event, id, METADATA_SET, INVALID_CLAIM); return }
    claim.claimedSplitter = address
  } else if (key == "arcade.priceAtomic") {
    const amount = uintClaim(value)
    if (amount === null) { finishRegistryEvent(event, id, METADATA_SET, INVALID_CLAIM); return }
    claim.claimedPriceAtomic = amount
  } else claim.claimedEndpoint = value
  claim.agent = agent.id
  claim.registry = event.address
  claim.metadataKey = key
  claim.blockNumber = event.block.number
  claim.timestamp = event.block.timestamp
  claim.txHash = event.transaction.hash
  claim.logIndex = event.logIndex
  claim.save()
  finishRegistryEvent(event, id, METADATA_SET, APPLIED)
}
