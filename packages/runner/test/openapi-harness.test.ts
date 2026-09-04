import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { engineFor } from "../src/engines/harness.js"
import type { JobEnvelope } from "../src/engines/types.js"

describe("OpenAPI harness integration", () => {
  it("registers an engine with no implicit environment grants", () => {
    const engine = engineFor("openapi")
    expect(engine.adapter).toBe("openapi")
    expect(engine.envGrants({ systemPrompt: "" })).toEqual([])
  })

  it.each(["success", "http-error", "throw", "invalid-json"])("executes a local spec through the real harness: %s", (outcome) => {
    const dir = mkdtempSync(join(tmpdir(), "PRIVATE_OPENAPI_HARNESS_"))
    try {
      mkdirSync(join(dir, "nested"))
      writeFileSync(join(dir, "nested", "openapi.json"), JSON.stringify({
        openapi: "3.0.3", info: { title: "Private fixture", version: "1" },
        servers: [{ url: "https://PRIVATE_UPSTREAM.example/v1" }],
        paths: { "/fixed/{base}": { get: {
          operationId: "PRIVATE_OPERATION",
          parameters: [
            { name: "base", in: "path", required: true, schema: { type: "string" } },
            { name: "api_key", in: "query", required: true, schema: { type: "string" } }
          ], responses: { "200": { description: "result" } }
        } } }
      }))
      const preload = join(dir, "fetch-fixture.ts")
      writeFileSync(preload, `
globalThis.fetch = async (input, init) => {
  const url = new URL(input);
  if (url.pathname !== "/v1/fixed/USD" || url.searchParams.get("api_key") !== "FAKE_UPSTREAM_SECRET" || init.method !== "GET" || init.redirect !== "error") {
    throw new Error("PRIVATE_BAD_BINDING");
  }
  if (${JSON.stringify(outcome)} === "throw") throw new Error("PRIVATE_OPERATION https://PRIVATE_UPSTREAM.example/v1 FAKE_UPSTREAM_SECRET");
  if (${JSON.stringify(outcome)} === "http-error") return new Response("PRIVATE_RESPONSE", { status: 503 });
  if (${JSON.stringify(outcome)} === "invalid-json") return new Response("PRIVATE_INVALID_JSON");
  return Response.json({ bound: true });
};
`)
      const run = spawnSync("bun", ["run", `--preload=${preload}`, "packages/runner/src/engines/harness.ts", "-"], {
        cwd: new URL("../../..", import.meta.url),
        env: { PATH: process.env["PATH"] ?? "", HOME: dir, UPSTREAM_KEY: "FAKE_UPSTREAM_SECRET" },
        input: JSON.stringify({
          jobId: "local-openapi", input: { base: "USD", api_key: "buyer-cannot-override" },
          skillDir: dir, adapter: "openapi", bounds: { timeoutSec: 3 }, outputSchema: {},
          engineConfig: { adapter: "openapi", spec: "nested/openapi.json", operationId: "PRIVATE_OPERATION",
            auth: { in: "query", name: "api_key", env: "UPSTREAM_KEY" } }
        }),
        encoding: "utf8", timeout: 5_000
      })
      expect(run.status, run.stderr).toBe(0)
      const envelope = JSON.parse(run.stdout) as JobEnvelope
      expect(envelope.costUsd).toBe(0)
      expect(envelope.usage.toolCalls).toBe(1)
      expect(envelope.stopReason).toBe(outcome === "success" ? "end_turn" : "error")
      if (outcome === "success") expect(envelope.output).toEqual({ bound: true })
      else expect(envelope.output).toBeUndefined()
      if (outcome === "http-error") expect(envelope.error).toContain("503")
      expect(run.stdout + run.stderr).not.toMatch(/PRIVATE_|FAKE_UPSTREAM_SECRET|buyer-cannot-override/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
