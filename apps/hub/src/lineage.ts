import { Effect } from "effect"
import {
  Lineage, LineageCycle, LineageDepth, LineageInvalid, ROOT_LINEAGE, childLineage, verifyHireCapability
} from "@arcade/core"
import type { Store } from "./store.ts"

/**
 * The hub derives lineage; the client only names its parent through a capability the hub
 * minted. Everything a forged header could claim is recomputed from persisted jobs.
 */
export const resolveLineage = (
  store: Store,
  secret: string,
  header: string | null,
  listing: { readonly id: string },
  nowMs: number,
  maxHop: number
): Effect.Effect<Lineage, LineageInvalid | LineageCycle | LineageDepth> =>
  Effect.gen(function* () {
    if (header === null) return ROOT_LINEAGE("") // rootJobId is filled once the job id exists
    const v = verifyHireCapability(secret, header, nowMs)
    if (v instanceof LineageInvalid) return yield* v
    const parent = yield* store.getJob(v.parentJobId)
    if (parent === undefined) return yield* new LineageInvalid({ reason: "unknown parent job" })
    if (parent.status !== "running" && parent.status !== "queued") {
      return yield* new LineageInvalid({ reason: `parent job is ${parent.status}` })
    }
    const lineage = childLineage(
      { rootJobId: parent.rootJobId ?? parent.id, hop: parent.hop ?? 0, ancestors: parent.ancestors ?? [], skillId: parent.skillId },
      parent.id
    )
    if (lineage.ancestors.includes(listing.id)) return yield* new LineageCycle({ skillId: listing.id })
    if (lineage.hop > maxHop) return yield* new LineageDepth({ hop: lineage.hop, max: maxHop })
    return lineage
  })
