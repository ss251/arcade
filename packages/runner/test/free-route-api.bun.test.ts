import { describe, expect, it } from "bun:test"
import Anthropic from "@anthropic-ai/sdk"
import { Effect, Schema } from "effect"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SkillManifest } from "@arcade/core"
import { execSkill } from "../src/exec.ts"
import { runClaudeApi } from "../src/engines/claude-api.ts"

// Real SDK transport with a simulated provider; this is not live model evidence.
describe("free route transport and launch boundaries", () => {
  it("does not reload undeclared secrets from a skill's .env in the actual child", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arcade-dotenv-boundary-"))
    try {
      await writeFile(join(dir, ".env"), "UNDECLARED_DOTENV_CANARY=private-fixture-only\nANTHROPIC_BASE_URL=http://127.0.0.1:1\n")
      await writeFile(join(dir, "run.ts"), 'console.log(JSON.stringify({ output: { canary: process.env.UNDECLARED_DOTENV_CANARY ?? null, base: process.env.ANTHROPIC_BASE_URL ?? null }, stopReason: "end_turn" }));')
      const manifest = Schema.decodeUnknownSync(SkillManifest)({
        id: "dotenv-fixture", version: "1.0.0", serviceName: "Fixture", description: "Offline fixture",
        tags: [], price: "$0.01", bounds: { timeoutSec: 3 }, inputSchema: {}, outputSchema: {},
        engine: { adapter: "script", entry: "run.ts" }, secrets: [], egress: []
      })
      const result = await Effect.runPromise(Effect.scoped(execSkill({ manifest, skillDir: dir, jobId: "dotenv", input: {} })))
      expect(result.status).toBe("succeeded")
      expect(result.output).toEqual({ canary: null, base: null })
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it.each(["submit", "refusal", "provider-error"] as const)("uses the real Messages SDK and retains %s semantics", async (mode) => {
    const requests: Array<Record<string, unknown>> = []
    const keys: Array<string | null> = []
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
      expect(new URL(req.url).pathname).toBe("/v1/messages")
      keys.push(req.headers.get("x-api-key"))
      requests.push(await req.json() as Record<string, unknown>)
      if (mode === "provider-error") return Response.json({ type: "error", error: { type: "invalid_request_error", message: "fixture provider refuses request" } }, { status: 400 })
      return Response.json({ id: "msg_fixture", type: "message", role: "assistant", model: "glm-5.3-flash",
        content: [{ type: "tool_use", id: "tool_fixture", name: "submit", input: { ok: true } }],
        stop_reason: mode === "refusal" ? "refusal" : "tool_use", stop_sequence: null,
        usage: { input_tokens: 12, output_tokens: 8 } })
    } })
    try {
      const client = new Anthropic({ apiKey: "dummy-loopback-only", authToken: null, baseURL: server.url.origin, maxRetries: 0 })
      const result = await runClaudeApi({ model: "glm-5.3-flash", systemPrompt: "fixture" }, {
        jobId: "api-transport", skillDir: "/tmp", input: {}, bounds: { timeoutSec: 3, maxCostUsd: 0.01, maxTurns: 2 },
        outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
      }, "fenced fixture input", client)
      expect(requests).toHaveLength(1)
      expect(keys).toEqual(["dummy-loopback-only"])
      expect(requests[0]?.["model"]).toBe("glm-5.3-flash")
      expect(requests[0]?.["tools"]).toEqual([expect.objectContaining({ name: "submit", strict: true })])
      if (mode === "submit") {
        expect(result.stopReason).toBe("end_turn")
        expect(result.output).toEqual({ ok: true })
        expect(result.costUsd).toBe(0)
        expect(result.usage.tokens).toBe(20)
      } else {
        expect(result.stopReason).toBe(mode === "refusal" ? "refusal" : "error")
        expect(result.output).toBeUndefined()
        if (mode === "provider-error") expect(result.error).toBe("provider request failed")
      }
    } finally { await server.stop(true) }
  })

  it("refuses an actual cross-origin redirect before a credential-bearing second request", async () => {
    let sourceHits = 0
    let foreignHits = 0
    const foreign = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      foreignHits += 1
      return Response.json({ id: "msg_fixture", type: "message", role: "assistant", model: "glm-5.3-flash",
        content: [{ type: "tool_use", id: "tool_fixture", name: "submit", input: { ok: true } }],
        stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } })
    } })
    const source = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      sourceHits += 1
      return new Response(null, { status: 307, headers: { location: `${foreign.url.origin}/v1/messages` } })
    } })
    try {
      const fetchOptions: Array<{ redirect: RequestRedirect | undefined; credentials: RequestCredentials | undefined }> = []
      const client = new Anthropic({ apiKey: "dummy-loopback-only", authToken: null,
        baseURL: source.url.origin, maxRetries: 2, timeout: 1000,
        fetchOptions: { redirect: "follow", credentials: "include" },
        fetch: async (input, init) => {
          fetchOptions.push({ redirect: init?.redirect, credentials: init?.credentials })
          return fetch(input, init)
        }
      })
      const result = await runClaudeApi({ model: "glm-5.3-flash", systemPrompt: "fixture" }, {
        jobId: "redirect", skillDir: "/tmp", input: {}, bounds: { timeoutSec: 3, maxCostUsd: 0.01 }, outputSchema: {}
      }, "fenced fixture input", client)
      expect(foreignHits).toBe(0)
      expect(sourceHits).toBe(1)
      expect(fetchOptions).toEqual([{ redirect: "error", credentials: "omit" }])
      expect(result.stopReason).toBe("error")
      expect(result.error).toBe("provider request failed")
      expect(result.output).toBeUndefined()
    } finally { await Promise.all([source.stop(true), foreign.stop(true)]) }
  })

  it("never repeats a real provider POST after a retryable server error", async () => {
    let hits = 0
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      hits += 1
      return Response.json({ type: "error", error: { type: "api_error", message: "PRIVATE_PROVIDER_FIXTURE" } },
        { status: 500, headers: { "retry-after-ms": "1" } })
    } })
    try {
      const client = new Anthropic({ apiKey: "dummy-loopback-only", authToken: null,
        baseURL: server.url.origin, maxRetries: 2, timeout: 1000 })
      const result = await runClaudeApi({ model: "glm-5.3-flash", systemPrompt: "fixture" }, {
        jobId: "no-repeat", skillDir: "/tmp", input: {}, bounds: { timeoutSec: 3, maxCostUsd: 0.01 }, outputSchema: {}
      }, "fenced fixture input", client)
      expect(hits).toBe(1)
      expect(result.stopReason).toBe("error")
      expect(result.error).toBe("provider request failed")
      expect(result.output).toBeUndefined()
    } finally { await server.stop(true) }
  })

  it("rejects malformed real provider usage even when a submit output is present", async () => {
    let hits = 0
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      hits += 1
      return Response.json({ id: "msg_fixture", type: "message", role: "assistant", model: "glm-5.3-flash",
        content: [{ type: "tool_use", id: "tool_fixture", name: "submit", input: { ok: true } }],
        stop_reason: "tool_use", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: -2 } } })
    } })
    try {
      const client = new Anthropic({ apiKey: "dummy-loopback-only", authToken: null, baseURL: server.url.origin })
      const result = await runClaudeApi({ model: "glm-5.3-flash", systemPrompt: "fixture" }, {
        jobId: "bad-usage", skillDir: "/tmp", input: {}, bounds: { timeoutSec: 3, maxCostUsd: 0.01 }, outputSchema: {}
      }, "fenced fixture input", client)
      expect(hits).toBe(1)
      expect(result.stopReason).toBe("error")
      expect(result.error).toBe("provider returned invalid usage accounting")
      expect(result.costUsd).toBe(0)
      expect(result.output).toBeUndefined()
    } finally { await server.stop(true) }
  })
})
