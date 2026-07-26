import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { buildEnv } from "../src/exec.ts"

/**
 * THE ENV SCRUB IS A SECURITY BOUNDARY.
 *
 * A seller runs untrusted-to-them marketplace jobs against their own machine, holding their
 * real credentials. The promise is that a skill sees ONLY the variables its manifest names.
 * Everything else — their Anthropic key, AWS profile, shell history, GitHub token — must be
 * absent from the child process, not merely unused.
 *
 * These tests deliberately pollute `process.env` with realistic secrets and assert none of
 * them survive.
 */

const manifest = (over: Partial<Parameters<typeof SkillManifest.make>[0]> = {}) =>
  Schema.decodeUnknownSync(SkillManifest)({
    id: "test-skill",
    version: "1.0.0",
    serviceName: "T",
    description: "d",
    tags: [],
    price: "$0.01",
    bounds: { timeoutSec: 10 },
    inputSchema: {},
    outputSchema: {},
    engine: { adapter: "script", entry: "run.ts" },
    secrets: [],
    egress: [],
    ...over
  })

const POLLUTANTS = {
  ANTHROPIC_API_KEY: "sk-ant-REAL-SECRET",
  OPENAI_API_KEY: "sk-REAL-SECRET",
  AWS_SECRET_ACCESS_KEY: "aws-REAL-SECRET",
  GITHUB_TOKEN: "ghp_REAL_SECRET",
  CIRCLE_API_KEY: "TEST_API_KEY:REAL:SECRET",
  ARCADE_FACILITATOR_KEY: "0xREALPRIVATEKEY",
  ARCADE_BUYER_KEY: "0xREALPRIVATEKEY"
}

const withPollutedEnv = <T>(fn: () => T): T => {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(POLLUTANTS)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  try {
    return fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe("runner env scrub", () => {
  it("passes NO seller secret through when the manifest declares none", () => {
    withPollutedEnv(() => {
      const env = buildEnv(manifest(), "/tmp/skill")
      for (const name of Object.keys(POLLUTANTS)) {
        expect(env[name]).toBeUndefined()
      }
      // And no VALUE leaks under a different key either.
      const serialized = JSON.stringify(env)
      for (const value of Object.values(POLLUTANTS)) {
        expect(serialized).not.toContain(value)
      }
    })
  })

  it("passes ONLY the declared secret, not its neighbours", () => {
    withPollutedEnv(() => {
      const env = buildEnv(manifest({ secrets: ["ANTHROPIC_API_KEY"] }), "/tmp/skill")
      expect(env["ANTHROPIC_API_KEY"]).toBe("sk-ant-REAL-SECRET")
      // Declaring one must not open the floodgates.
      expect(env["OPENAI_API_KEY"]).toBeUndefined()
      expect(env["AWS_SECRET_ACCESS_KEY"]).toBeUndefined()
      expect(env["GITHUB_TOKEN"]).toBeUndefined()
      expect(env["ARCADE_FACILITATOR_KEY"]).toBeUndefined()
    })
  })

  it("refuses to load a manifest that names a platform variable at all", () => {
    // This used to be allowed-but-harmless: the platform never sets its own keys on a
    // seller's box, so naming one got you nothing. It is now rejected at decode time,
    // because the same passthrough could name HOME — which would restore the seller's real
    // home directory and, with it, reach of a subscription seat's keychain.
    expect(() => manifest({ secrets: ["ARCADE_FACILITATOR_KEY"] })).toThrow()
  })

  it("adds nothing beyond the sandbox base and the declared allowlist", () => {
    withPollutedEnv(() => {
      const env = buildEnv(manifest({ secrets: ["ANTHROPIC_API_KEY"] }), "/tmp/skill")
      const allowed = new Set(["PATH", "HOME", "LANG", "ARCADE_SANDBOX", "ANTHROPIC_API_KEY"])
      for (const key of Object.keys(env)) expect(allowed.has(key)).toBe(true)
    })
  })

  it("keeps the sandbox's own HOME even if a reserved name reaches buildEnv directly", () => {
    // Defence in depth. `SecretName` should mean this can never happen, so the assertion is
    // about the ordering surviving independently of the validation — two rules that fail
    // separately are worth more than one rule asserted twice.
    const forged = { ...manifest(), secrets: ["HOME", "USER"] } as never
    const env = buildEnv(forged, "/tmp/skill")
    expect(env["HOME"]).toBe("/tmp/skill")
    expect(env["USER"]).toBeUndefined()
  })

  it("builds a minimal base env, not a copy of process.env", () => {
    const env = buildEnv(manifest(), "/tmp/skill")
    expect(Object.keys(env).sort()).toEqual(["ARCADE_SANDBOX", "HOME", "LANG", "PATH"])
    // HOME is redirected into the skill dir so a skill cannot read the seller's ~/.ssh,
    // ~/.aws, ~/.circle-cli, or shell history by relative path.
    expect(env["HOME"]).toBe("/tmp/skill")
    expect(env["ARCADE_SANDBOX"]).toBe("1")
  })

  it("silently omits a declared secret that is not set, rather than passing empty", () => {
    const env = buildEnv(manifest({ secrets: ["DEFINITELY_NOT_SET_12345"] }), "/tmp/skill")
    expect("DEFINITELY_NOT_SET_12345" in env).toBe(false)
  })

  it("scrubs identically across every adapter that does not need a seat", () => {
    withPollutedEnv(() => {
      for (const adapter of ["script", "claude-api", "codex", "grok"] as const) {
        const env = buildEnv(
          manifest({ engine: { adapter, entry: "run.ts" }, secrets: [] }),
          "/tmp/skill"
        )
        expect(env["ANTHROPIC_API_KEY"]).toBeUndefined()
        expect(Object.keys(env).sort()).toEqual(["ARCADE_SANDBOX", "HOME", "LANG", "PATH"])
      }
    })
  })

  describe("subscription-backed engines", () => {
    // A seat credential lives in the OS login keychain and is reachable only with the
    // seller's real HOME, so this configuration genuinely does widen the environment. The
    // point of these tests is to pin exactly how far, so the widening cannot quietly grow.
    //
    // Note the widening follows the CREDENTIAL, not the engine: the same adapter on an API
    // key gets the ordinary scrub, which the last test here asserts.
    const seat = () =>
      manifest({
        engine: { adapter: "claude-agent", entry: "agent.ts", credential: "subscription" },
        secrets: []
      })

    it("widens by exactly HOME and USER, and nothing else", () => {
      withPollutedEnv(() => {
        const env = buildEnv(seat(), "/tmp/skill")
        expect(Object.keys(env).sort()).toEqual([
          "ARCADE_SANDBOX",
          "HOME",
          "LANG",
          "PATH",
          "USER"
        ])
      })
    })

    it("uses the seller's real HOME, because the keychain is only reachable there", () => {
      const env = buildEnv(seat(), "/tmp/skill")
      expect(env["HOME"]).toBe(process.env["HOME"])
      expect(env["HOME"]).not.toBe("/tmp/skill")
    })

    it("still passes no undeclared secret, despite the wider environment", () => {
      // The whole safety argument for lane B rests on this: the environment is wider, but
      // it is not a copy of the seller's. A credential they never declared stays absent.
      withPollutedEnv(() => {
        const env = buildEnv(seat(), "/tmp/skill")
        expect(env["ANTHROPIC_API_KEY"]).toBeUndefined()
        expect(env["AWS_SECRET_ACCESS_KEY"]).toBeUndefined()
        expect(env["CIRCLE_API_KEY"]).toBeUndefined()
      })
    })

    it("never passes the Claude Code OAuth token as an environment variable", () => {
      // Injecting it does not select an account — the seat is chosen by config directory —
      // and it would put a live subscription credential into the job's environment for
      // nothing. The seat directory is the whole mechanism.
      const prev = process.env["CLAUDE_CODE_OAUTH_TOKEN"]
      process.env["CLAUDE_CODE_OAUTH_TOKEN"] = "sk-ant-oat-should-never-appear"
      try {
        const env = buildEnv(seat(), "/tmp/skill")
        expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined()
        expect(Object.values(env)).not.toContain("sk-ant-oat-should-never-appear")
      } finally {
        if (prev === undefined) delete process.env["CLAUDE_CODE_OAUTH_TOKEN"]
        else process.env["CLAUDE_CODE_OAUTH_TOKEN"] = prev
      }
    })

    it("gives the same engine on an API key the ordinary scrub", () => {
      // The one that matters for the marketplace: publishable skills get no widening.
      withPollutedEnv(() => {
        const env = buildEnv(
          manifest({ engine: { adapter: "claude-agent", entry: "agent.ts" }, secrets: [] }),
          "/tmp/skill"
        )
        expect(Object.keys(env).sort()).toEqual(["ARCADE_SANDBOX", "HOME", "LANG", "PATH"])
        expect(env["HOME"]).toBe("/tmp/skill")
      })
    })

    it("forwards the seat directory override so the runner and harness agree", () => {
      const prev = process.env["ARCADE_SEAT_DIR"]
      process.env["ARCADE_SEAT_DIR"] = "/tmp/custom-seat"
      try {
        expect(buildEnv(seat(), "/tmp/skill")["ARCADE_SEAT_DIR"]).toBe("/tmp/custom-seat")
        // and a non-seat adapter has no business knowing about it
        const script = buildEnv(manifest({ secrets: [] }), "/tmp/skill")
        expect(script["ARCADE_SEAT_DIR"]).toBeUndefined()
      } finally {
        if (prev === undefined) delete process.env["ARCADE_SEAT_DIR"]
        else process.env["ARCADE_SEAT_DIR"] = prev
      }
    })
  })
})
