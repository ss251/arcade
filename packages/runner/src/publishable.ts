import { assertManifestPublishable, NotPublishable } from "@arcade/core"
import type { LoadedSkill } from "./skills.ts"

/**
 * The publish gate, applied to a set of loaded skills.
 *
 * Extracted from the daemon for one reason: it was inline, `daemon.ts` has no test
 * coverage, and the gate was consequently only half-applied. The daemon filtered the
 * *listings* it announced but built its dispatch map from every skill on disk — so a
 * seat-backed skill was unlisted and still executable. A hub that named its id (a malicious
 * hub, or a stale one) got it run on the seller's subscription and settled.
 *
 * `docs/threat-model.md` claimed the gate "refuses on both routes to the hub". It refused
 * one. Anything derived from a skill set now derives from `sellable`, and it is testable.
 */

export interface Gated {
  /** Skills that may be listed AND executed. */
  readonly sellable: ReadonlyArray<LoadedSkill>
  /** Skills refused, with the reason, so the daemon can say so once at startup. */
  readonly refused: ReadonlyArray<{ readonly skillId: string; readonly reason: string }>
}

export const gate = (skills: ReadonlyArray<LoadedSkill>): Gated => {
  const sellable: Array<LoadedSkill> = []
  const refused: Array<{ skillId: string; reason: string }> = []

  for (const s of skills) {
    try {
      assertManifestPublishable(s.manifest)
      sellable.push(s)
    } catch (e) {
      if (e instanceof NotPublishable) {
        refused.push({ skillId: e.skillId, reason: e.reason })
        continue
      }
      throw e
    }
  }
  return { sellable, refused }
}

/**
 * The dispatch map. Built from `sellable` only — a refused skill is not merely unadvertised,
 * it is unreachable, so no message from the hub can cause it to run.
 */
export const dispatchMap = (g: Gated): Map<string, LoadedSkill> =>
  new Map(g.sellable.map((s) => [s.manifest.id, s]))
