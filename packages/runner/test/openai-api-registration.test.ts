import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { EngineAdapter, ENGINE_TERMS, SkillManifest, toPublicListing } from "@arcade/core"
import { engineFor } from "../src/engines/harness.ts"

describe("openai-api registration", () => {
  it("accepts the new API wire adapter", () => {
    expect(Schema.decodeUnknownSync(EngineAdapter)("openai-api")).toBe("openai-api")
  })

  it("registers an API-key-only engine without ambient environment grants", () => {
    const adapter = "openai-api" as EngineAdapter
    const engine = engineFor(adapter)
    expect(engine.adapter).toBe(adapter)
    expect(ENGINE_TERMS[adapter]).toEqual(["api-key"])
    expect(engine.envGrants({ systemPrompt: "" })).toEqual([])
  })

  it("keeps provider selection and secret names out of the public listing", () => {
    const manifest = Schema.decodeUnknownSync(SkillManifest)({
      id: "api-fixture", version: "1.0.0", serviceName: "API fixture", description: "Fixture",
      tags: [], price: "$0.01", bounds: { timeoutSec: 30 }, inputSchema: {}, outputSchema: {},
      engine: { adapter: "openai-api", entry: "SKILL.md", model: "glm-5.3-flash" },
      secrets: ["OPENAI_API_KEY", "OPENAI_BASE_URL"], egress: ["api.b.ai"]
    })
    const listing = toPublicListing(manifest)
    expect(listing.id).toBe("api-fixture")
    for (const value of ["openai-api", "glm-5.3-flash", "OPENAI_API_KEY", "api.b.ai", "SKILL.md"]) {
      expect(JSON.stringify(listing)).not.toContain(value)
    }
  })
})
