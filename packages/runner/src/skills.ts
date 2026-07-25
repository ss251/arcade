import { Effect } from "effect"
import { decodeManifest, type SkillManifest } from "@arcade/core"
import { readdir } from "node:fs/promises"

export interface LoadedSkill {
  readonly dir: string
  readonly manifest: SkillManifest
}

/**
 * Load every `<skillsDir>/<id>/arcade.json`.
 *
 * Validation happens HERE, on the seller's machine, at publish/start time — so Bazaar limits
 * (serviceName ≤32, ≤5 tags, https icon) surface as a local error the seller can fix rather
 * than being silently dropped by a facilitator later.
 */
export const loadSkills = (skillsDir: string) =>
  Effect.gen(function* () {
    const entries = yield* Effect.tryPromise({
      try: () => readdir(skillsDir, { withFileTypes: true }),
      catch: (e) => new Error(`cannot read ${skillsDir}: ${String((e as Error)?.message ?? e)}`)
    })

    const loaded: Array<LoadedSkill> = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = `${skillsDir}/${entry.name}`
      const file = Bun.file(`${dir}/arcade.json`)
      if (!(yield* Effect.promise(() => file.exists()))) continue

      const raw = yield* Effect.tryPromise({
        try: () => file.json(),
        catch: (e) => new Error(`${dir}/arcade.json is not valid JSON: ${String((e as Error)?.message ?? e)}`)
      })

      const manifest = yield* decodeManifest(raw).pipe(
        Effect.mapError(
          (e) => new Error(`${dir}/arcade.json failed validation:\n${String(e)}`)
        )
      )
      loaded.push({ dir, manifest })
    }
    return loaded
  })
