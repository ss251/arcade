import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { engineConfigOf } from "../src/exec.ts"

const manifest = (engine: Record<string, unknown>) =>
  Schema.decodeUnknownSync(SkillManifest)({
    id: "test-skill",
    version: "1.0.0",
    serviceName: "T",
    description: "d",
    tags: [],
    price: "$0.01",
    bounds: { timeoutSec: 30 },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    engine
  })

describe("engineConfigOf", () => {
  it("carries the mcp transport and tool", () => {
    const config = engineConfigOf(
      manifest({ adapter: "mcp", url: "https://docs.arc.io/mcp", tool: "search_arc_docs" }).engine
    )
    expect(config).toEqual({
      adapter: "mcp", capabilities: [], url: "https://docs.arc.io/mcp", tool: "search_arc_docs"
    })
  })

  it("carries the openapi spec, operation and auth binding", () => {
    const config = engineConfigOf(manifest({
      adapter: "openapi", spec: "openapi.json", operationId: "fxRate",
      auth: { in: "header", name: "X-Api-Key", env: "UPSTREAM_KEY" }
    }).engine)
    expect(config.spec).toBe("openapi.json")
    expect(config.operationId).toBe("fxRate")
    expect(config.auth).toEqual({ in: "header", name: "X-Api-Key", env: "UPSTREAM_KEY" })
  })

  it("omits absent fields entirely rather than sending nulls", () => {
    const config = engineConfigOf(manifest({ adapter: "claude-agent", entry: "agent.ts" }).engine)
    expect(Object.keys(config).sort()).toEqual(["adapter", "capabilities"])
  })

  it("never carries the entry path because the argv already does", () => {
    const config = engineConfigOf(manifest({
      adapter: "skill", entry: "SKILL.md", model: "claude-sonnet-5"
    }).engine)
    expect(config).not.toHaveProperty("entry")
    expect(config.model).toBe("claude-sonnet-5")
  })
})

describe("entryless harness dispatch", () => {
  it.each(["mcp", "openapi"])("does not import the '-' sentinel for %s", (adapter) => {
    const root = new URL("../../..", import.meta.url)
    const run = spawnSync("bun", ["run", "packages/runner/src/engines/harness.ts", "-"], {
      cwd: root,
      env: { PATH: process.env["PATH"] ?? "" },
      // No upstream config or keys: even once these adapters are registered, this test
      // must stop at configuration validation and never contact an external service.
      input: JSON.stringify({
        jobId: "dispatch-test", input: {}, skillDir: root.pathname, adapter,
        bounds: { timeoutSec: 3 }, outputSchema: { type: "object" }
      }),
      encoding: "utf8",
      timeout: 5_000
    })
    const envelope = JSON.parse(run.stdout) as { stopReason: string; error?: string }
    expect(envelope.stopReason).toBe("error")
    expect(envelope.error).toBeTruthy()
    expect(envelope.error).not.toMatch(/Cannot find module|Cannot find package|must default-export/)
  })
})
