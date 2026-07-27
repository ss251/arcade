import { afterEach, describe, expect, it } from "vitest"
import { Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { buildEnv } from "../src/exec.ts"

/**
 * What a hiring skill receives — and, more importantly, what it does not.
 *
 * An earlier version put `ARCADE_SUBBUY_KEY` in the sandbox and enforced the budget there.
 * That made the budget advisory: the code holding the key was the code being bounded, so a
 * prompt injection reaching the agent could spend past the ceiling and the real cap was the
 * wallet balance. The sandbox now gets a socket and a per-job token; the runner keeps the
 * key and does the buying.
 *
 * `never leaks the sub-purchase key` is the regression guard for that.
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

const hiring = (over: Record<string, unknown> = {}) =>
  manifest({
    engine: { adapter: "claude-api", entry: "agent.ts", capabilities: ["hire-skills"] },
    bounds: { timeoutSec: 60, maxSubSpendUsd: 0.05 },
    ...over
  })

const GRANT = { socketPath: "/tmp/arcade-hire-test.sock", jobId: "job_1", token: "tok_abc" }

const saved = process.env["ARCADE_SUBBUY_KEY"]
afterEach(() => {
  if (saved === undefined) delete process.env["ARCADE_SUBBUY_KEY"]
  else process.env["ARCADE_SUBBUY_KEY"] = saved
})

describe("hire-skills grant", () => {
  it("never leaks the sub-purchase key into the sandbox — THE regression guard", () => {
    // Even with a key present in the runner's own environment and the capability declared,
    // the sandbox must receive a token, never a credential. If this ever fails, the budget
    // has silently gone back to being advisory.
    process.env["ARCADE_SUBBUY_KEY"] =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

    const env = buildEnv(hiring(), "/tmp/skill", GRANT)

    expect(env["ARCADE_SUBBUY_KEY"]).toBeUndefined()
    expect(Object.values(env)).not.toContain(process.env["ARCADE_SUBBUY_KEY"])
  })

  it("grants socket, job id and token when the capability is declared", () => {
    const env = buildEnv(hiring(), "/tmp/skill", GRANT)

    expect(env["ARCADE_HIRE_SOCKET"]).toBe(GRANT.socketPath)
    expect(env["ARCADE_JOB_ID"]).toBe(GRANT.jobId)
    expect(env["ARCADE_JOB_TOKEN"]).toBe(GRANT.token)
  })

  it("grants nothing to a skill that did not declare the capability", () => {
    // The default. Most skills never hire, and the ability to spend must not be ambient.
    const env = buildEnv(manifest(), "/tmp/skill", GRANT)

    expect(env["ARCADE_HIRE_SOCKET"]).toBeUndefined()
    expect(env["ARCADE_JOB_TOKEN"]).toBeUndefined()
  })

  it("grants nothing when the runner has no broker running", () => {
    // A declared capability on a runner with no sub-purchase key: the skill still runs, and
    // `hire` refuses with a message naming what is missing.
    const env = buildEnv(hiring(), "/tmp/skill", undefined)

    expect(env["ARCADE_HIRE_SOCKET"]).toBeUndefined()
    expect(env["ARCADE_JOB_TOKEN"]).toBeUndefined()
  })

  it("cannot be obtained through `secrets`, because ARCADE_ is reserved", () => {
    for (const name of ["ARCADE_SUBBUY_KEY", "ARCADE_JOB_TOKEN", "ARCADE_HIRE_SOCKET"]) {
      expect(() => manifest({ secrets: [name] })).toThrow()
    }
  })
})
