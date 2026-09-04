import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { engineFor } from "../src/engines/harness.js"
import type { JobEnvelope } from "../src/engines/types.js"

describe("MCP harness integration", () => {
  it("registers an engine that grants no additional environment", () => {
    const engine = engineFor("mcp")
    expect(engine.adapter).toBe("mcp")
    expect(engine.envGrants({ systemPrompt: "" })).toEqual([])
  })

  it.each(["success", "error", "empty", "malformed"] as const)("runs a real local stdio tool: %s", (outcome) => {
    const dir = mkdtempSync(join(tmpdir(), "arcade-mcp-harness-"))
    try {
      const resolve = createRequire(import.meta.url).resolve
      const entry = join(dir, "server.ts")
      writeFileSync(entry, `
import { Server } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/server/index.js"))};
import { StdioServerTransport } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/server/stdio.js"))};
import { CallToolRequestSchema } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/types.js"))};
const server = new Server({ name: "local-fixture", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  console.error("PRIVATE_UPSTREAM_STDERR_CANARY");
  if (${JSON.stringify(outcome)} === "error") return { isError: true, content: [{ type: "text", text: "PRIVATE_UPSTREAM_ERROR_CANARY" }] };
  if (${JSON.stringify(outcome)} === "empty") return { content: [] };
  if (${JSON.stringify(outcome)} === "malformed") return { structuredContent: null, content: [] };
  return { structuredContent: { tool: params.name, input: params.arguments, credentialPresent: process.env.FIXTURE_UPSTREAM_KEY === "LOCAL_ONLY_FAKE_KEY", cwd: process.cwd() }, content: [] };
});
await server.connect(new StdioServerTransport());
`)
      const run = spawnSync("bun", ["run", "packages/runner/src/engines/harness.ts", "-"], {
        cwd: new URL("../../..", import.meta.url),
        env: { PATH: process.env["PATH"] ?? "", HOME: dir, FIXTURE_UPSTREAM_KEY: "LOCAL_ONLY_FAKE_KEY" },
        input: JSON.stringify({
          jobId: "local-mcp", input: { name: "not-a-tool-selector", query: "fixture" },
          skillDir: dir, adapter: "mcp", bounds: { timeoutSec: 3 }, outputSchema: {},
          engineConfig: { adapter: "mcp", command: ["bun", "run", entry], tool: "fixture-tool" }
        }),
        encoding: "utf8", timeout: 5_000
      })
      expect(run.status, run.stderr).toBe(0)
      const envelope = JSON.parse(run.stdout) as JobEnvelope
      expect(envelope.costUsd).toBe(0)
      expect(envelope.usage.toolCalls).toBe(1)
      if (outcome === "success") {
        expect(envelope.stopReason).toBe("end_turn")
        expect(envelope.output).toMatchObject({ tool: "fixture-tool", input: { name: "not-a-tool-selector", query: "fixture" }, credentialPresent: true })
        expect(realpathSync((envelope.output as { cwd: string }).cwd)).toBe(realpathSync(dir))
      } else {
        expect(envelope.stopReason).toBe(outcome === "empty" ? "incomplete" : "error")
        expect(envelope.output).toBeUndefined()
      }
      expect(run.stdout + run.stderr).not.toContain("PRIVATE_UPSTREAM_")
      expect(run.stdout + run.stderr).not.toContain("LOCAL_ONLY_FAKE_KEY")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each(["call", "close"])("terminates its stdio child when %s stalls past the execSkill timeout", async (phase) => {
    const dir = mkdtempSync(join(tmpdir(), "arcade-mcp-timeout-"))
    const pidFile = join(dir, "child.pid")
    let pid: number | undefined
    const alive = () => {
      if (pid === undefined) return false
      try { process.kill(pid, 0); return true } catch { return false }
    }
    try {
      const resolve = createRequire(import.meta.url).resolve
      const serverFile = join(dir, "server.ts")
      writeFileSync(serverFile, `
import { Server } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/server/index.js"))};
import { StdioServerTransport } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/server/stdio.js"))};
import { CallToolRequestSchema } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/types.js"))};
await Bun.write(${JSON.stringify(pidFile)}, String(process.pid));
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
const server = new Server({ name: "stalled-fixture", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(CallToolRequestSchema, async () => ${JSON.stringify(phase)} === "call"
  ? new Promise(() => {}) : { content: [{ type: "text", text: "done" }] });
await server.connect(new StdioServerTransport());
`)
      const driver = join(dir, "driver.ts")
      writeFileSync(driver, `
import { Effect, Schema } from ${JSON.stringify(resolve("effect"))};
import { SkillManifest } from ${JSON.stringify(resolve("@arcade/core"))};
import { execSkill } from ${JSON.stringify(new URL("../src/exec.ts", import.meta.url).pathname)};
const manifest = Schema.decodeUnknownSync(SkillManifest)({
  id: "stalled-mcp", version: "1.0.0", serviceName: "Stalled fixture", description: "Local test", tags: [],
  price: "$0.01", bounds: { timeoutSec: 2 }, inputSchema: {}, outputSchema: {},
  engine: { adapter: "mcp", command: ["bun", "run", ${JSON.stringify(serverFile)}], tool: "stall" }
});
const outcome = await Effect.runPromise(execSkill({ manifest, skillDir: ${JSON.stringify(dir)}, jobId: "timeout-fixture", input: {} }));
process.stdout.write(JSON.stringify(outcome));
`)
      const run = spawnSync("bun", ["run", driver], {
        cwd: new URL("../../..", import.meta.url),
        env: { PATH: process.env["PATH"] ?? "", HOME: dir },
        encoding: "utf8", timeout: 7_000
      })
      expect(run.status, run.stderr).toBe(0)
      expect(JSON.parse(run.stdout).status).toBe("timeout")
      pid = Number(readFileSync(pidFile, "utf8"))
      expect(Number.isSafeInteger(pid) && pid > 0).toBe(true)
      for (let attempt = 0; attempt < 50 && alive(); attempt++) await delay(20)
      expect(alive()).toBe(false)
    } finally {
      // Reap only this test's recorded child if the regression is still present.
      if (pid === undefined) {
        try { pid = Number(readFileSync(pidFile, "utf8")) } catch { /* not started */ }
      }
      if (pid !== undefined && Number.isSafeInteger(pid) && pid > 0 && alive()) process.kill(pid, "SIGKILL")
      rmSync(dir, { recursive: true, force: true })
    }
  }, 10_000)
})
