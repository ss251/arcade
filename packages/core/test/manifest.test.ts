import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import {
  MAX_TAGS,
  SERVICE_NAME_MAX,
  SkillManifest,
  decodeManifest,
  isReservedEnvName,
  toPublicListing
} from "../src/manifest.ts"

/**
 * Publish-time validation.
 *
 * Bazaar silently DROPS metadata that violates its limits — a 40-char serviceName or a 6th
 * tag just disappears downstream, and the seller never finds out. Enforcing here turns a
 * silent truncation into a local error the seller can actually fix.
 */

const base = {
  id: "demo-skill",
  version: "1.0.0",
  serviceName: "Demo",
  description: "d",
  tags: ["a"],
  price: "$0.01",
  bounds: { timeoutSec: 30 },
  inputSchema: {},
  outputSchema: {},
  engine: { adapter: "script", entry: "run.ts" },
  secrets: [],
  egress: []
}

const decode = (over: Record<string, unknown> = {}) =>
  Effect_runSyncExit(() => Schema.decodeUnknownSync(SkillManifest)({ ...base, ...over }))

/** Small helper so each case reads as pass/fail rather than try/catch noise. */
function Effect_runSyncExit(f: () => unknown): { ok: boolean } {
  try {
    f()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

describe("manifest validation", () => {
  it("accepts a well-formed manifest", () => {
    expect(decode().ok).toBe(true)
  })

  describe("Bazaar limits — enforced locally so nothing is silently dropped", () => {
    it(`rejects a serviceName longer than ${SERVICE_NAME_MAX}`, () => {
      expect(decode({ serviceName: "x".repeat(SERVICE_NAME_MAX) }).ok).toBe(true)
      expect(decode({ serviceName: "x".repeat(SERVICE_NAME_MAX + 1) }).ok).toBe(false)
    })

    it("rejects a non-ASCII serviceName", () => {
      // Bazaar's field is printable ASCII; emoji would be mangled downstream.
      expect(decode({ serviceName: "Demo 🚀" }).ok).toBe(false)
    })

    it(`rejects more than ${MAX_TAGS} tags`, () => {
      expect(decode({ tags: ["a", "b", "c", "d", "e"] }).ok).toBe(true)
      expect(decode({ tags: ["a", "b", "c", "d", "e", "f"] }).ok).toBe(false)
    })

    it("rejects a non-https iconUrl", () => {
      expect(decode({ iconUrl: "https://x.test/i.png" }).ok).toBe(true)
      expect(decode({ iconUrl: "http://x.test/i.png" }).ok).toBe(false)
    })

    it("rejects an empty serviceName", () => {
      expect(decode({ serviceName: "" }).ok).toBe(false)
    })
  })

  describe("identity and price", () => {
    it.each([
      ["demo-skill", true],
      ["a1", true],
      ["Demo", false], // uppercase
      ["a", false], // too short
      ["-lead", false], // leading dash
      ["has space", false]
    ])("id %s -> %s", (id, ok) => {
      expect(decode({ id }).ok).toBe(ok)
    })

    it.each([
      ["$0.01", true],
      ["0.01", true],
      ["$1", true],
      ["$0.000001", true],
      ["$0.0000001", false], // sub-atomic
      ["free", false],
      ["$-1", false]
    ])("price %s -> %s", (price, ok) => {
      expect(decode({ price }).ok).toBe(ok)
    })
  })

  describe("bounds — the seller's margin guard", () => {
    it("requires timeoutSec", () => {
      expect(decode({ bounds: {} }).ok).toBe(false)
    })

    it("rejects a non-positive or absurd timeout", () => {
      expect(decode({ bounds: { timeoutSec: 0 } }).ok).toBe(false)
      expect(decode({ bounds: { timeoutSec: -1 } }).ok).toBe(false)
      expect(decode({ bounds: { timeoutSec: 901 } }).ok).toBe(false)
      expect(decode({ bounds: { timeoutSec: 900 } }).ok).toBe(true)
    })

    it("accepts optional agent bounds", () => {
      expect(
        decode({ bounds: { timeoutSec: 60, maxTurns: 8, maxTokens: 60_000, maxToolCalls: 20 } }).ok
      ).toBe(true)
      expect(decode({ bounds: { timeoutSec: 60, maxTurns: 0 } }).ok).toBe(false)
    })
  })

  describe("engine", () => {
    it("rejects an unknown adapter", () => {
      expect(decode({ engine: { adapter: "wat", entry: "run.ts" } }).ok).toBe(false)
    })

    it.each(["script", "claude-api", "claude-agent", "codex", "grok"])(
      "accepts adapter %s",
      (adapter) => {
        expect(decode({ engine: { adapter, entry: "run.ts" } }).ok).toBe(true)
      }
    )

    it("requires an entry point", () => {
      expect(decode({ engine: { adapter: "script" } }).ok).toBe(false)
    })
  })

  describe("defaults", () => {
    it("defaults secrets and egress to empty — a manifest cannot accidentally inherit access", () => {
      const m = Schema.decodeUnknownSync(SkillManifest)({
        ...base,
        secrets: undefined,
        egress: undefined
      })
      expect(m.secrets).toEqual([])
      expect(m.egress).toEqual([])
    })
  })

  describe("the real usdc-flow-check manifest", () => {
    it("decodes and projects cleanly", async () => {
      // node:fs, not Bun.file — vitest runs under Node.
      const { readFile } = await import("node:fs/promises")
      const raw = JSON.parse(
        await readFile(
          new URL("../../../skills/usdc-flow-check/arcade.json", import.meta.url),
          "utf8"
        )
      )
      const m = Schema.decodeUnknownSync(SkillManifest)(raw)
      const pub = toPublicListing(m)
      expect(pub.id).toBe("usdc-flow-check")
      expect(Object.keys(pub)).not.toContain("engine")
      expect(Object.keys(pub)).not.toContain("egress")
      // The shipped skill must satisfy its own published contract.
      expect(m.engine.entry).toBe("run.ts")
      expect(m.egress).toContain("rpc.testnet.arc.network")
    })
  })

  it("decodeManifest surfaces a failure as an Effect error, not a throw", async () => {
    const { Effect } = await import("effect")
    const exit = await Effect.runPromiseExit(decodeManifest({ ...base, id: "BAD" }))
    expect(exit._tag).toBe("Failure")
  })
})

describe("reserved environment names", () => {
  /**
   * `secrets` is how a seller hands their own credentials to their own code. It is not a
   * general passthrough, and treating it as one collapsed two guarantees at once: naming
   * `HOME` restored the seller's real home directory — undoing the scrub that stops a job
   * reading `~/.ssh` by relative path — and separately put the OS login keychain back in
   * reach, so a skill could authenticate against a subscription seat while declaring
   * `credential: "api-key"` and publishing normally.
   */

  const withSecrets = (secrets: ReadonlyArray<string>) =>
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
      engine: { adapter: "claude-agent", credential: "api-key", entry: "agent.ts" },
      secrets,
      egress: []
    })

  it("refuses HOME, which is the one that reopens the seat", () => {
    expect(() => withSecrets(["HOME"])).toThrow()
  })

  it("refuses the rest of the sandbox's own definition", () => {
    for (const name of ["PATH", "LANG", "USER", "LOGNAME", "SHELL", "TMPDIR"]) {
      expect(() => withSecrets([name])).toThrow()
    }
  })

  it("refuses the variables an engine grants for itself", () => {
    for (const name of ["CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "XDG_CONFIG_HOME"]) {
      expect(() => withSecrets([name])).toThrow()
    }
  })

  it("refuses anything the runner reserves by prefix", () => {
    for (const name of ["ARCADE_SANDBOX", "ARCADE_SEAT_DIR", "ARCADE_CLAUDE_BIN", "ARCADE_ANYTHING"]) {
      expect(() => withSecrets([name])).toThrow()
    }
  })

  it("refuses a reserved name hidden among legitimate ones", () => {
    expect(() => withSecrets(["ANTHROPIC_API_KEY", "HOME", "MY_TOKEN"])).toThrow()
  })

  it("still accepts ordinary credentials", () => {
    expect(() => withSecrets(["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "MY_SERVICE_TOKEN"])).not.toThrow()
  })

  it("classifies names without needing a manifest", () => {
    expect(isReservedEnvName("HOME")).toBe(true)
    expect(isReservedEnvName("ARCADE_WHATEVER")).toBe(true)
    expect(isReservedEnvName("ANTHROPIC_API_KEY")).toBe(false)
    // Case matters: env vars are case-sensitive, and `home` is not `HOME`.
    expect(isReservedEnvName("home")).toBe(false)
  })
})
