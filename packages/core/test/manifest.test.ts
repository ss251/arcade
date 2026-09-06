import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import {
  MAX_TAGS,
  PublicListing,
  SERVICE_NAME_MAX,
  SkillManifest,
  decodeManifest,
  isReservedEnvName,
  toPublicListing
} from "../src/manifest.ts"

/**
 * Publish-time validation.
 *
 * ARCADE enforces public metadata locally. Plan J allows ten lowercase slug tags;
 * the retained service-name and icon limits do not imply older Bazaar conformance.
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

  describe("public metadata limits — enforced locally so nothing is silently dropped", () => {
    it(`rejects a serviceName longer than ${SERVICE_NAME_MAX}`, () => {
      expect(decode({ serviceName: "x".repeat(SERVICE_NAME_MAX) }).ok).toBe(true)
      expect(decode({ serviceName: "x".repeat(SERVICE_NAME_MAX + 1) }).ok).toBe(false)
    })

    it("rejects a non-ASCII serviceName", () => {
      // Bazaar's field is printable ASCII; emoji would be mangled downstream.
      expect(decode({ serviceName: "Demo 🚀" }).ok).toBe(false)
    })

    it(`rejects more than ${MAX_TAGS} tags`, () => {
      const tags = Array.from({ length: MAX_TAGS }, (_, index) => `tag-${index}`)
      expect(decode({ tags }).ok).toBe(true)
      expect(decode({ tags: [...tags, "extra"] }).ok).toBe(false)
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
      expect(decode({ engine: { adapter: "telepathy", entry: "run.ts" } }).ok).toBe(false)
    })

    it.each(["script", "claude-api", "claude-agent", "codex", "grok", "skill"])(
      "requires an entry point for the %s adapter that runs seller code",
      (adapter) => {
        expect(decode({ engine: { adapter } }).ok).toBe(false)
        expect(decode({ engine: { adapter, entry: "run.ts" } }).ok).toBe(true)
      }
    )

    it("needs a transport and a tool for mcp, without requiring an entry module", () => {
      expect(decode({ engine: { adapter: "mcp", url: "https://docs.arc.io/mcp" } }).ok).toBe(false)
      expect(decode({ engine: { adapter: "mcp", tool: "search" } }).ok).toBe(false)
      expect(decode({ engine: { adapter: "mcp", url: "https://docs.arc.io/mcp", tool: "search" } }).ok).toBe(true)
      expect(decode({ engine: { adapter: "mcp", command: ["bunx", "some-server"], tool: "search" } }).ok).toBe(true)
    })

    it("refuses an mcp listing that declares both a command and a url", () => {
      expect(decode({ engine: {
        adapter: "mcp", command: ["bunx", "s"], url: "https://x.example/mcp", tool: "t"
      } }).ok).toBe(false)
    })

    it("refuses a plaintext mcp url carrying paid results or upstream credentials", () => {
      expect(decode({ engine: { adapter: "mcp", url: "http://x.example/mcp", tool: "t" } }).ok).toBe(false)
    })

    it.each(["https://", "https:// bad.example/mcp", "https://[invalid/mcp", "https://x.example:bad/mcp"])(
      "refuses malformed HTTPS endpoint %s",
      (url) => expect(decode({ engine: { adapter: "mcp", url, tool: "search" } }).ok).toBe(false)
    )

    it("refuses empty required entry, tool, spec and operation names", () => {
      for (const empty of ["", "   "]) {
        for (const adapter of ["script", "claude-api", "claude-agent", "codex", "grok", "skill"]) {
          expect(decode({ engine: { adapter, entry: empty } }).ok).toBe(false)
        }
        expect(decode({ engine: { adapter: "mcp", command: ["bunx", "server"], tool: empty } }).ok).toBe(false)
        expect(decode({ engine: { adapter: "openapi", spec: empty, operationId: "fxRate" } }).ok).toBe(false)
        expect(decode({ engine: { adapter: "openapi", spec: "openapi.json", operationId: empty } }).ok).toBe(false)
      }
    })

    it("requires a non-empty MCP executable while preserving valid empty command arguments", () => {
      for (const command of [[], [""], ["   "]]) {
        expect(decode({ engine: { adapter: "mcp", command, tool: "search" } }).ok).toBe(false)
      }
      expect(decode({ engine: { adapter: "mcp", command: ["bunx", "server", "--value", ""], tool: "search" } }).ok).toBe(true)
    })

    it("needs a spec and one operationId for openapi", () => {
      expect(decode({ engine: { adapter: "openapi", spec: "openapi.json" } }).ok).toBe(false)
      expect(decode({ engine: { adapter: "openapi", operationId: "fxRate" } }).ok).toBe(false)
      expect(decode({ engine: { adapter: "openapi", spec: "openapi.json", operationId: "fxRate" } }).ok).toBe(true)
    })

    it("refuses reserved environment names in upstream auth bindings", () => {
      for (const env of ["HOME", "PATH", "CLAUDE_CODE_OAUTH_TOKEN", "ARCADE_SUBBUY_KEY"]) {
        expect(decode({ engine: {
          adapter: "openapi", spec: "openapi.json", operationId: "fxRate",
          auth: { in: "header", name: "Authorization", env }
        } }).ok).toBe(false)
      }
      expect(decode({ engine: {
        adapter: "openapi", spec: "openapi.json", operationId: "fxRate",
        auth: { in: "header", name: "X-Api-Key", env: "UPSTREAM_KEY" }
      } }).ok).toBe(true)
    })

    it("validates auth binding placement and name", () => {
      const engine = { adapter: "mcp", url: "https://x.example/mcp", tool: "search" }
      expect(decode({ engine: { ...engine, auth: { in: "query", name: "key", env: "UPSTREAM_KEY" } } }).ok).toBe(true)
      for (const auth of [
        { in: "body", name: "key", env: "UPSTREAM_KEY" },
        { in: "header", name: "", env: "UPSTREAM_KEY" },
        { in: "header", name: "x".repeat(129), env: "UPSTREAM_KEY" }
      ]) {
        expect(decode({ engine: { ...engine, auth } }).ok).toBe(false)
      }
    })

    it("requires HTTP-token header names without imposing that syntax on query names", () => {
      const engine = { adapter: "mcp", url: "https://x.example/mcp", tool: "search" }
      for (const name of ["X-Api-Key\r\nInjected", "X:Api-Key", "X Api Key", "X-Key\n"]) {
        expect(decode({ engine: { ...engine, auth: { in: "header", name, env: "UPSTREAM_KEY" } } }).ok).toBe(false)
      }
      expect(decode({ engine: { ...engine, auth: { in: "query", name: "api.key[0]", env: "UPSTREAM_KEY" } } }).ok).toBe(true)
    })

    it("requires a usable environment variable name for an auth binding", () => {
      const engine = { adapter: "openapi", spec: "openapi.json", operationId: "fxRate" }
      for (const env of ["", "   ", "BAD-NAME", "=VALUE", "1KEY", "KEY\nVALUE", "UPSTREAM_KEY\n"]) {
        expect(decode({ engine: { ...engine, auth: { in: "header", name: "X-Key", env } } }).ok).toBe(false)
      }
      expect(decode({ engine: { ...engine, auth: { in: "header", name: "X-Key", env: "service_key2" } } }).ok).toBe(true)
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

describe("canaryInput — deliberate public input for paid checks", () => {
  it.each([
    { label: "object", value: { address: "0x3600000000000000000000000000000000000000" } },
    { label: "null", value: null },
    { label: "false", value: false },
    { label: "zero", value: 0 },
    { label: "string", value: "representative input" },
    { label: "array", value: ["one", "two"] }
  ])("preserves a declared $label through both schemas and the public wire", ({ value: canaryInput }) => {
    const manifest = Schema.decodeUnknownSync(SkillManifest)({ ...base, canaryInput })
    expect(manifest.canaryInput).toEqual(canaryInput)
    const pub = toPublicListing(manifest)
    expect(pub.canaryInput).toEqual(canaryInput)
    const encoded = Schema.encodeSync(PublicListing)(pub)
    const decoded = Schema.decodeUnknownSync(PublicListing)(JSON.parse(JSON.stringify(encoded)))
    expect(decoded.canaryInput).toEqual(canaryInput)
  })

  it("remains optional and does not add an absent input to the public wire", () => {
    for (const raw of [base, { ...base, canaryInput: undefined }]) {
      const manifest = Schema.decodeUnknownSync(SkillManifest)(raw)
      expect(manifest.canaryInput).toBeUndefined()
      expect(toPublicListing(manifest)).not.toHaveProperty("canaryInput")
      expect(Schema.encodeSync(PublicListing)(toPublicListing(manifest))).not.toHaveProperty("canaryInput")
    }
  })

  it("every shipped manifest declares a public canaryInput", async () => {
    const { readdir, readFile } = await import("node:fs/promises")
    const skillsDir = new URL("../../../skills/", import.meta.url)
    const dirs = (await readdir(skillsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory())
    expect(dirs.length).toBeGreaterThan(0)
    for (const dir of dirs) {
      const raw = JSON.parse(await readFile(new URL(`${dir.name}/arcade.json`, skillsDir), "utf8")) as Record<string, unknown>
      expect(raw.canaryInput, `${dir.name} has no canaryInput`).toBeDefined()
      const manifest = Schema.decodeUnknownSync(SkillManifest)(raw)
      expect(toPublicListing(manifest).canaryInput, `${dir.name} must publish its canaryInput`).toEqual(raw.canaryInput)
    }
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
