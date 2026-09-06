import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Schema } from "effect"
import { NotPublishable, PRIVATE_FIELDS, SkillManifest, toPublicListing } from "@arcade/core"
import { createPublishPreview } from "../src/publish-preview.ts"

const raw = JSON.parse(readFileSync(new URL("../../../skills/diff-triage/arcade.json", import.meta.url), "utf8"))
const decode = (value: unknown) => Schema.decodeUnknownSync(SkillManifest)(value)
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe("canonical local CLI preview", () => {
  it("uses the core public projection and retains exactly the prior singular directory shape", () => {
    const manifest = decode(raw), preview = createPublishPreview("skills/diff-triage", manifest)
    expect(preview).toEqual({
      target: "skills/diff-triage", skillId: manifest.id,
      engine: { adapter: manifest.engine.adapter, credential: "api-key" },
      grants: [...manifest.engine.capabilities], public: toPublicListing(manifest),
      private: { engine: manifest.engine, secrets: manifest.secrets, egress: manifest.egress, workdir: manifest.workdir }
    })
    for (const key of PRIVATE_FIELDS) expect(preview.public).not.toHaveProperty(key)
  })
  it("never resolves declared secret names or sends a request while projecting local configuration", () => {
    const manifest = decode(raw), fetcher = vi.fn(() => { throw Error("unexpected network") })
    vi.stubGlobal("fetch", fetcher)
    for (const name of manifest.secrets) vi.stubEnv(name, "PRIVATE_ENV_VALUE")
    const text = JSON.stringify(createPublishPreview("unwritten/future-skill", manifest))
    expect(text).not.toContain("PRIVATE_ENV_VALUE")
    expect(fetcher).not.toHaveBeenCalled()
    expect(JSON.parse(text).private.secrets).toEqual(manifest.secrets)
  })
  it("refuses a subscription-backed manifest before producing a preview", () => {
    const manifest = decode({ ...raw, engine: { adapter: "claude-agent", credential: "subscription", entry: "agent.ts" } })
    expect(() => createPublishPreview("private-seat", manifest)).toThrow(NotPublishable)
  })
  it("does not move private prompts or transport arguments into public schema fields", () => {
    const manifest = decode({ ...raw, engine: { adapter: "claude-api", credential: "api-key", entry: "agent.ts",
      systemPrompt: "PRIVATE_SYSTEM_PROMPT", args: ["PRIVATE_ARGUMENT"], capabilities: ["read-workdir"] } })
    const preview = createPublishPreview("future", manifest)
    expect(preview.grants).toEqual(["read-workdir"])
    expect(JSON.stringify(preview.public)).not.toContain("PRIVATE_")
    expect(preview.private.engine.systemPrompt).toBe("PRIVATE_SYSTEM_PROMPT")
    expect(preview.private.engine.args).toEqual(["PRIVATE_ARGUMENT"])
  })
})
