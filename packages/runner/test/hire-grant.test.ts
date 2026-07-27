import { afterEach, describe, expect, it } from "vitest"
import { Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { buildEnv } from "../src/exec.ts"

/**
 * `hire-skills` is the only capability that puts a SPENDING KEY inside the sandbox, so the
 * grant needs the same treatment as the environment scrub itself.
 *
 * Two properties: the wallet appears only when the manifest declares the capability, and
 * the budget comes from the manifest rather than the environment — so it is per-skill,
 * published in the listing, and defaults to zero rather than to unlimited.
 */

const manifest = (over: Record<string, unknown> = {}) =>
  Schema.decodeUnknownSync(SkillManifest)({
    id: "hiring-skill",
    version: "1.0.0",
    serviceName: "Hiring Skill",
    description: "d",
    tags: [],
    price: "$0.25",
    bounds: { timeoutSec: 60 },
    inputSchema: {},
    outputSchema: {},
    engine: { adapter: "claude-api", entry: "agent.ts", capabilities: [] },
    secrets: [],
    egress: [],
    ...over
  })

const HUB = "http://hub.test"
const SUB_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

const saved = {
  hub: process.env["ARCADE_HUB"],
  sub: process.env["ARCADE_SUBBUY_KEY"]
}
afterEach(() => {
  if (saved.hub === undefined) delete process.env["ARCADE_HUB"]
  else process.env["ARCADE_HUB"] = saved.hub
  if (saved.sub === undefined) delete process.env["ARCADE_SUBBUY_KEY"]
  else process.env["ARCADE_SUBBUY_KEY"] = saved.sub
})

describe("hire-skills grant", () => {
  it("withholds the sub-purchase wallet from a skill that did not declare it", () => {
    // The default. Most skills never hire, and a spending key must not be ambient.
    process.env["ARCADE_HUB"] = HUB
    process.env["ARCADE_SUBBUY_KEY"] = SUB_KEY

    const env = buildEnv(manifest(), "/tmp/skill")

    expect(env["ARCADE_SUBBUY_KEY"]).toBeUndefined()
    expect(env["ARCADE_HUB"]).toBeUndefined()
    expect(env["ARCADE_SUB_BUDGET_USD"]).toBeUndefined()
  })

  it("grants it when the capability is declared", () => {
    process.env["ARCADE_HUB"] = HUB
    process.env["ARCADE_SUBBUY_KEY"] = SUB_KEY

    const env = buildEnv(
      manifest({
        engine: { adapter: "claude-api", entry: "agent.ts", capabilities: ["hire-skills"] },
        bounds: { timeoutSec: 60, maxSubSpendUsd: 0.05 }
      }),
      "/tmp/skill"
    )

    expect(env["ARCADE_SUBBUY_KEY"]).toBe(SUB_KEY)
    expect(env["ARCADE_HUB"]).toBe(HUB)
    expect(env["ARCADE_SUB_BUDGET_USD"]).toBe("0.05")
  })

  it("defaults the budget to zero when the seller forgot to set one", () => {
    // Absent must mean "cannot spend", never "spend freely". A seller who declares the
    // capability and omits the bound has made a mistake; this is the safe way to be wrong.
    process.env["ARCADE_HUB"] = HUB
    process.env["ARCADE_SUBBUY_KEY"] = SUB_KEY

    const env = buildEnv(
      manifest({
        engine: { adapter: "claude-api", entry: "agent.ts", capabilities: ["hire-skills"] }
      }),
      "/tmp/skill"
    )

    expect(env["ARCADE_SUB_BUDGET_USD"]).toBe("0")
  })

  it("cannot be obtained through `secrets`, because ARCADE_ is reserved", () => {
    // The seller-facing route to widening the environment is `secrets`, and it must not
    // reach this. `SecretName` rejects the name at decode time.
    expect(() =>
      manifest({
        engine: { adapter: "claude-api", entry: "agent.ts", capabilities: [] },
        secrets: ["ARCADE_SUBBUY_KEY"]
      })
    ).toThrow()
  })

  it("still withholds the wallet when the runner has none set", () => {
    delete process.env["ARCADE_SUBBUY_KEY"]
    process.env["ARCADE_HUB"] = HUB

    const env = buildEnv(
      manifest({
        engine: { adapter: "claude-api", entry: "agent.ts", capabilities: ["hire-skills"] },
        bounds: { timeoutSec: 60, maxSubSpendUsd: 0.05 }
      }),
      "/tmp/skill"
    )

    // The budget is still declared, so `hire` fails with "no wallet" rather than silently
    // behaving as though it had one.
    expect(env["ARCADE_SUBBUY_KEY"]).toBeUndefined()
    expect(env["ARCADE_SUB_BUDGET_USD"]).toBe("0.05")
  })
})
