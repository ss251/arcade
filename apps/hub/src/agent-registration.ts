import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_MISS_LIMIT, buildAgentRegistration, type AgentRegistrationDoc } from "@arcade/core"
import type { ListingRecord, RunnerRecord } from "./store.ts"

/** Liveness belongs to this listing's current runner, and canary delisting overrides it. */
export const agentRegistrationFor = (a: {
  rec: ListingRecord
  runner: RunnerRecord | undefined
  origin: string
  chainId: number
  identityRegistry: string
  nowMs: number
}): AgentRegistrationDoc => {
  const current = a.runner
  const active = a.rec.delisted !== true && current !== undefined &&
    current.runnerId === a.rec.runnerId && current.seller.toLowerCase() === a.rec.seller.toLowerCase() &&
    current.skillIds.includes(a.rec.listing.id) && Number.isSafeInteger(a.nowMs) && a.nowMs >= 0 &&
    Number.isSafeInteger(current.lastSeenMs) && current.lastSeenMs >= 0 &&
    a.nowMs >= current.lastSeenMs && a.nowMs - current.lastSeenMs < HEARTBEAT_INTERVAL_MS * HEARTBEAT_MISS_LIMIT
  return buildAgentRegistration({
    origin: a.origin,
    skillId: a.rec.listing.id,
    serviceName: a.rec.listing.serviceName,
    description: a.rec.listing.description,
    seller: a.rec.seller,
    chainId: a.chainId,
    identityRegistry: a.identityRegistry,
    active,
    agentId: a.rec.agentId,
    ens: a.rec.ensName
  })
}
