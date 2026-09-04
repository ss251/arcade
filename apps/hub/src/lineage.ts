import { Effect } from "effect"
import {
  DEFAULT_MAX_HOP,
  Lineage, LineageCycle, LineageDepth, LineageInvalid, ROOT_LINEAGE, childLineage, parsePrice, verifyHireCapability
} from "@arcade/core"
import type { Store } from "./store.ts"

/**
 * The tree ceiling, guarded against a seller-controlled `maxSubSpendUsd` that `parsePrice`
 * cannot parse.
 *
 * `Bounds.maxSubSpendUsd` is `Schema.Number.pipe(Schema.positive())` — it accepts any
 * positive finite JS number, including `0.0000005` (stringifies to `"5e-7"`), `0.1234567`
 * (seven decimal places, one more than `parsePrice` allows) and `1e21` (stringifies with an
 * exponent). Every one of those throws inside `parsePrice(String(...))`, and the paid
 * branch that called it directly had no try/catch — a seller could 500 every sub-hire under
 * their own listing after the buyer's payment was already verified. Zero is the safe
 * reading of "could not be parsed as a price": it makes `reserveTree` refuse with
 * `tree_budget_exceeded` (a 402 the buyer can act on) rather than crash the request.
 */
export const ceilingAtomicFor = (maxSubSpendUsd: number | undefined): bigint => {
  if (maxSubSpendUsd === undefined || !Number.isFinite(maxSubSpendUsd) || maxSubSpendUsd <= 0) return 0n
  try {
    return parsePrice(String(maxSubSpendUsd))
  } catch {
    return 0n
  }
}

/**
 * `ARCADE_MAX_HOP`, parsed defensively.
 *
 * `Number(garbage)` is `NaN`, and `NaN` fails every `>` comparison — `lineage.hop > NaN` is
 * always `false`, so a garbage value silently disabled the depth check it was supposed to
 * configure rather than falling back to it. Unset, blank, non-numeric and negative all read
 * as "not a valid override" and fall back to `DEFAULT_MAX_HOP`; only a non-negative integer
 * is accepted.
 */
export const maxHopFromEnv = (value: string | undefined): number => {
  if (value === undefined || value.trim() === "") return DEFAULT_MAX_HOP
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_MAX_HOP
}

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
