import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync, readFileSync } from "node:fs"
import { decodeManifest, toPublicListing } from "@arcade/core"
import { loadSkillAgent } from "../src/engines/skill.ts"

const SKILLS = fileURLToPath(new URL("../../../skills/", import.meta.url))
const dir = join(SKILLS, "diff-triage")
// Vitest runs under Node; decode the on-disk listing without the Bun-only directory loader.
const skill = { dir, manifest: await Effect.runPromise(decodeManifest(JSON.parse(readFileSync(join(dir, "arcade.json"), "utf8")))) }

describe("diff-triage, as a skill directory", () => {
  it("is published on the skill adapter with SKILL.md as its entry", () => {
    expect(skill.manifest.engine.adapter).toBe("skill")
    expect(skill.manifest.engine.entry).toBe("SKILL.md")
    expect(skill.manifest.engine.credential).toBe("api-key")
  })

  it("no longer carries an agent module", () => {
    expect(existsSync(join(skill.dir, "agent.ts"))).toBe(false)
  })

  it("loads a real system prompt off disk", async () => {
    const agent = await loadSkillAgent(join(skill.dir, "SKILL.md"), { adapter: "skill", capabilities: [] })
    expect(agent.systemPrompt).toContain("triage code diffs")
    expect(agent.systemPrompt).toContain("never instruction")
  })

  it("keeps the model choice private", () => {
    expect(skill.manifest.engine.model).toBe("claude-sonnet-5")
    expect(JSON.stringify(toPublicListing(skill.manifest))).not.toContain("sonnet")
  })
})
