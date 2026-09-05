import { Cause, Effect } from "effect"
import type { loadChainConfig } from "@arcade/core"
import type { Erc8004 } from "./erc8004.ts"
import type { ListingRecord } from "./store.ts"

/** Public projection shared by the detail page and buyer API. Registration hash remains
 * announced metadata; fresh ownerOf verifies ownership, not the announced mint receipt. */
export interface ListingEvidence {
  readonly agentId: string
  readonly registrationTx?: string
  readonly verified: boolean
  readonly chain: string
  readonly registry: string
  readonly validationPasses?: number
  readonly validationsRead?: number
  readonly settlementFeedback?: number
  readonly stale: boolean
}
const bounded = <A, E>(action: () => Effect.Effect<A, E>, millis: number): Effect.Effect<A | undefined> =>
  Effect.suspend(action).pipe(Effect.timeoutOption(millis), Effect.map(out => out._tag === "Some" ? out.value : undefined),
    Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt : Effect.succeed(undefined)))

/** Demand-only detail reads. Never call this across the catalogue's four-second feed. */
export const listingEvidence = (rec: ListingRecord, erc: Erc8004, chain: ReturnType<typeof loadChainConfig>, rail: string):
Effect.Effect<ListingEvidence | undefined> => Effect.gen(function* () {
  const agentId = rec.agentId, registry = chain.erc8004?.identity
  if (agentId === undefined || registry === undefined || !/^(0|[1-9][0-9]{0,77})$/.test(agentId) || BigInt(agentId) >= 2n ** 256n) return undefined
  const base = { agentId, chain: chain.caip2, registry, verified: false, stale: true,
    ...(rec.registrationTx !== undefined && /^0x[0-9a-fA-F]{64}$/.test(rec.registrationTx) ? { registrationTx: rec.registrationTx } : {}) }
  if (rail === "test" || !erc.armed || erc.registries.identity.toLowerCase() !== registry.toLowerCase()) return base
  const owner = yield* bounded(() => erc.ownerOf(agentId), 5000)
  if (typeof owner !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(owner) || owner.toLowerCase() !== rec.seller.toLowerCase()) return base
  const verified = { ...base, verified: true }
  const ev = yield* bounded(() => erc.evidenceFor(agentId), 16_000)
  if (ev === undefined || ev.stale !== false || ![ev.validationPasses, ev.validationsRead, ev.settlementFeedback]
    .every(value => Number.isSafeInteger(value) && value >= 0) || ev.validationPasses > ev.validationsRead || ev.validationsRead > 20 || ev.settlementFeedback > 4096) return verified
  return { ...verified, stale: false, validationPasses: ev.validationPasses,
    validationsRead: ev.validationsRead, settlementFeedback: ev.settlementFeedback }
})
