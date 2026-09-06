import { BigInt } from "@graphprotocol/graph-ts"
import { ValidationRequest, ValidationResponse } from "../generated/templates/ValidationRegistry/ValidationRegistry"
import { Validation } from "../generated/schema"
import { APPLIED, CONFLICT, DUPLICATE, MISSING_AGENT, MISSING_REQUEST, VALIDATION_REGISTRY, VALIDATION_REQUEST, VALIDATION_RESPONSE, beginRegistryEvent, boundedText, finishRegistryEvent, knownAgent, requireAddress, requireHash, uint8 } from "./registry"

export function handleValidationRequest(event: ValidationRequest): void {
  const id = beginRegistryEvent(event, VALIDATION_REGISTRY, VALIDATION_REQUEST)
  if (id === null) return
  const params = event.params
  requireHash(params.requestHash)
  requireAddress(params.validatorAddress)
  const agent = knownAgent(params.agentId)
  if (agent == null) { finishRegistryEvent(event, id, VALIDATION_REQUEST, MISSING_AGENT); return }
  const old = Validation.load(params.requestHash)
  if (old != null) {
    finishRegistryEvent(event, id, VALIDATION_REQUEST, old.agent == agent.id && old.validatorAddress.equals(params.validatorAddress) ? DUPLICATE : CONFLICT)
    return
  }
  const validation = new Validation(params.requestHash)
  validation.agent = agent.id
  validation.validatorAddress = params.validatorAddress
  validation.requestURI = boundedText(params.requestURI)
  validation.status = "PENDING"
  validation.createdAt = event.block.timestamp
  validation.updatedAt = event.block.timestamp
  validation.requestTxHash = event.transaction.hash
  agent.validationRequestCount = agent.validationRequestCount.plus(BigInt.fromI32(1))
  agent.updatedAt = event.block.timestamp
  validation.save()
  agent.save()
  finishRegistryEvent(event, id, VALIDATION_REQUEST, APPLIED)
}

export function handleValidationResponse(event: ValidationResponse): void {
  const id = beginRegistryEvent(event, VALIDATION_REGISTRY, VALIDATION_RESPONSE)
  if (id === null) return
  const params = event.params
  requireHash(params.requestHash)
  requireHash(params.responseHash)
  requireAddress(params.validatorAddress)
  const response = uint8(event.parameters[3].value.toBigInt())
  const agent = knownAgent(params.agentId)
  if (agent == null) { finishRegistryEvent(event, id, VALIDATION_RESPONSE, MISSING_AGENT); return }
  const validation = Validation.load(params.requestHash)
  if (validation == null) { finishRegistryEvent(event, id, VALIDATION_RESPONSE, MISSING_REQUEST); return }
  if (validation.agent != agent.id || !validation.validatorAddress.equals(params.validatorAddress)) {
    finishRegistryEvent(event, id, VALIDATION_RESPONSE, CONFLICT); return
  }
  const previous = validation.status
  assert(previous == "PENDING" || previous == "PASSED" || previous == "FAILED", "Invalid registry validation state")
  assert(agent.validationRequestCount.gt(BigInt.zero()), "Invalid registry counters")
  const wasPassed = previous == "PASSED"
  if (wasPassed) assert(agent.validationPassCount.gt(BigInt.zero()), "Invalid registry counters")
  // Named local policy, not payment evidence or a claim about all uint8 responses.
  const passed = response >= 50 && response <= 100
  const count = agent.validationPassCount.plus(BigInt.fromI32((passed ? 1 : 0) - (wasPassed ? 1 : 0)))
  assert(count.ge(BigInt.zero()) && count.le(agent.validationRequestCount), "Invalid registry counters")
  validation.response = response
  validation.responseURI = boundedText(params.responseURI)
  validation.responseHash = params.responseHash
  validation.tag = boundedText(params.tag)
  validation.status = passed ? "PASSED" : "FAILED"
  validation.updatedAt = event.block.timestamp
  validation.responseTxHash = event.transaction.hash
  agent.validationPassCount = count
  agent.updatedAt = event.block.timestamp
  validation.save()
  agent.save()
  finishRegistryEvent(event, id, VALIDATION_RESPONSE, APPLIED)
}
