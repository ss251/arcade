import { Effect, Exit, Fiber, Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { execSkill } from "../src/exec.ts"

const MODEL = "glm-5.3-flash"
const DUMMY_KEY = "dummy-agent-loopback-only"
const ROOT = resolve(import.meta.dir, "../../..")
const OUTPUT_SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }
type Mode = "success" | "refusal" | "provider-error" | "timeout" | "interrupt" | "redirect" | "retryable-error"

// An actual execSkill worker, not a mock SDK or replacement native executable.
if (process.argv[2] === "--agent-fixture-worker") {
  const raw = await new Response(Bun.stdin.stream()).text()
  if (raw.length > 4096) throw Error("fixture request too large")
  const input = JSON.parse(raw) as { dir: string; timeoutSec: number }
  if (!input.dir.includes("/arcade-native-agent-fixture-") || process.env["ANTHROPIC_API_KEY"] !== DUMMY_KEY) throw Error("fixture refused")
  const manifest = Schema.decodeUnknownSync(SkillManifest)({
    id: "native-agent-fixture", version: "1.0.0", serviceName: "Native fixture", description: "Simulated provider only",
    tags: [], price: "$0.01", bounds: { timeoutSec: input.timeoutSec, maxTurns: 3, maxTokens: 5000, maxToolCalls: 3, maxCostUsd: 0.05 },
    inputSchema: {}, outputSchema: OUTPUT_SCHEMA,
    engine: { adapter: "claude-agent", entry: "agent.ts", credential: "api-key", model: MODEL, capabilities: [] },
    secrets: ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"], egress: ["127.0.0.1"]
  })
  const fiber = Effect.runFork(execSkill({ manifest, skillDir: input.dir, jobId: "native-fixture", input: { ok: true } }))
  let interrupting = false
  const interrupt = setInterval(async () => {
    if (!interrupting && await Bun.file(join(input.dir, "interrupt")).exists()) {
      interrupting = true
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  }, 10)
  const exit = await Effect.runPromise(Fiber.await(fiber))
  clearInterval(interrupt)
  process.stdout.write(JSON.stringify(Exit.isSuccess(exit) ? exit.value : { status: "interrupted" }))
} else {
  const { describe, expect, it } = await import("bun:test")
  const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
  const bounded = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("fixture deadline")), ms) })]) }
    finally { clearTimeout(timer) }
  }
  const capture = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
    const reader = stream.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 65536) throw Error("fixture output limit"); chunks.push(next.value) } }
    finally { reader.releaseLock() }
    return Buffer.concat(chunks).toString("utf8")
  }
  const processInfo = async (pid: number): Promise<string> => {
    const proc = Bun.spawn(["/bin/ps", "-p", String(pid), "-o", "lstart=", "-o", "comm="], { env: {}, stdout: "pipe", stderr: "ignore" })
    const out = await new Response(proc.stdout).text(); await proc.exited
    return out.trim()
  }
  const descendants = async (parent: number, depth = 0): Promise<Array<{ pid: number; identity: string }>> => {
    if (parent <= 1 || depth > 3) return []
    const proc = Bun.spawn(["/usr/bin/pgrep", "-P", String(parent)], { env: {}, stdout: "pipe", stderr: "ignore" })
    const out = await new Response(proc.stdout).text(); await proc.exited
    const found: Array<{ pid: number; identity: string }> = []
    for (const value of out.trim().split(/\s+/)) {
      const pid = Number(value)
      if (!Number.isSafeInteger(pid) || pid <= 1) continue
      const identity = await processInfo(pid)
      if (identity !== "") found.push({ pid, identity }, ...await descendants(pid, depth + 1))
    }
    return found
  }
  const event = (type: string, payload: unknown) => `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
  const response = (mode: Mode, ordinal: number): Response => {
    const refusal = mode === "refusal", tool = !refusal && ordinal === 1
    const start = { type: "message_start", message: { id: `msg_fixture_${ordinal}`, type: "message", role: "assistant", model: MODEL,
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }
    const content = tool ? { type: "tool_use", id: "tool_fixture", name: "StructuredOutput", input: {} } : { type: "text", text: "" }
    const delta = tool ? { type: "input_json_delta", partial_json: '{"ok":true}' } : { type: "text_delta", text: refusal ? "Fixture refusal." : "Done." }
    const body = event("message_start", start) + event("content_block_start", { type: "content_block_start", index: 0, content_block: content }) +
      event("content_block_delta", { type: "content_block_delta", index: 0, delta }) + event("content_block_stop", { type: "content_block_stop", index: 0 }) +
      event("message_delta", { type: "message_delta", delta: { stop_reason: refusal ? "refusal" : tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 8 } }) +
      event("message_stop", { type: "message_stop" })
    return new Response(body, { headers: { "content-type": "text/event-stream" } })
  }

  // This OS sandbox is test-only: it constrains the REAL bundled CLI and descendants,
  // not just the simulated server. Other OSes do not claim this macOS isolation proof.
  describe.skipIf(process.platform !== "darwin")("bundled Agent SDK against an owned simulated Messages provider", () => {
    it.each(["success", "refusal", "provider-error", "timeout", "interrupt", "redirect", "retryable-error"] as const)("keeps real %s execution isolated and stops native descendants", async (mode) => {
      const requests: Array<{ path: string; model: unknown; tools: string[]; key: string | null; agent: string | null }> = []
      const violations: string[] = []
      const warmups: Array<{ method: string; key: string | null; auth: string | null }> = []
      const cancelResponses: Array<() => void> = []
      const redirected: Array<string | null> = []
      const redirectTarget = mode === "redirect" ? Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
        redirected.push(req.headers.get("x-api-key"))
        return Response.json({ type: "error", error: { type: "invalid_request_error", message: "untrusted redirect origin" } }, { status: 400 })
      } }) : undefined
      let release: (() => void) | undefined, seen: (() => void) | undefined
      const first = new Promise<void>((done) => { seen = done }), gate = new Promise<void>((done) => { release = done })
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
        const path = new URL(req.url).pathname
        // Installed CLI performs an unauthenticated same-origin connection warm-up.
        if (path === "/api/hello") {
          warmups.push({ method: req.method, key: req.headers.get("x-api-key"), auth: req.headers.get("authorization") })
          return new Response(null, { status: 204 })
        }
        if (path !== "/v1/messages" && path !== "/v1/messages/count_tokens") { violations.push(`unexpected endpoint ${path}`); return new Response(null, { status: 400 }) }
        const body = await req.json() as { model?: unknown; tools?: Array<{ name?: string }> }
        requests.push({ path, model: body.model, tools: body.tools?.flatMap(t => typeof t.name === "string" ? [t.name] : []) ?? [],
          key: req.headers.get("x-api-key"), agent: req.headers.get("user-agent") })
        if (path.endsWith("count_tokens")) return Response.json({ input_tokens: 12 })
        seen?.(); await gate
        if (mode === "timeout" || mode === "interrupt") return new Promise<Response>((done) => {
          const finish = () => done(new Response(null, { status: 499 }))
          cancelResponses.push(finish)
          if (req.signal.aborted) finish()
          else req.signal.addEventListener("abort", finish, { once: true })
        })
        if (mode === "provider-error") return Response.json({ type: "error", error: { type: "invalid_request_error", message: "simulated provider refuses" } }, { status: 400 })
        if (mode === "retryable-error") return Response.json({ type: "error", error: { type: "overloaded_error", message: "simulated retryable failure" } }, { status: 503 })
        if (mode === "redirect") return new Response(null, { status: 302, headers: { location: `${redirectTarget!.url.origin}/v1/messages` } })
        return response(mode, requests.filter(r => r.path === "/v1/messages").length)
      } })
      const dir = await mkdtemp(join(tmpdir(), "arcade-native-agent-fixture-"))
      let worker: Bun.Subprocess<"pipe", "pipe", "pipe"> | undefined
      let owned: Array<{ pid: number; identity: string }> = []
      try {
        await writeFile(join(dir, "agent.ts"), `export default {systemPrompt:"Use StructuredOutput to return the supplied fixture result.",credential:"api-key",model:${JSON.stringify(MODEL)},capabilities:[]};\n`)
        const executable = await realpath(process.execPath)
        // No access to the real personal HOME/config/keychain; only installed repository
        // inputs and the Bun executable are exceptions to the personal-home deny rule.
        // The real per-job relay binds an ephemeral port inside the worker. This is
        // loopback-only OS isolation, not an exact-port firewall; exact upstream paths,
        // models and credentials are independently asserted by the owned providers.
        const profile = `(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))` +
          `(deny file-read* (subpath ${JSON.stringify(homedir())}))(allow file-read* (subpath ${JSON.stringify(ROOT)}) (literal ${JSON.stringify(executable)}))` +
          `(deny file-write* (subpath ${JSON.stringify(homedir())}))` +
          `(deny process-exec (literal "/usr/bin/security"))(deny mach-lookup (global-name "com.apple.securityd"))`
        worker = Bun.spawn(["/usr/bin/sandbox-exec", "-p", profile, executable, "--no-env-file", import.meta.path, "--agent-fixture-worker"], {
          cwd: ROOT, env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", ANTHROPIC_API_KEY: DUMMY_KEY, ANTHROPIC_BASE_URL: server.url.origin },
          stdin: "pipe", stdout: "pipe", stderr: "pipe"
        })
        worker.stdin.write(JSON.stringify({ dir, timeoutSec: mode === "timeout" ? 8 : 15 })); worker.stdin.end()
        const stdout = capture(worker.stdout), stderr = capture(worker.stderr)
        await bounded(Promise.race([first, worker.exited.then(async () => { throw Error(`worker ended before Messages: ${await stdout} ${await stderr}`) })]), 12_000)
        owned = await descendants(worker.pid)
        expect(owned.some(p => p.identity.includes("claude-agent-sdk-darwin-") && p.identity.endsWith("/claude"))).toBe(true)
        if (mode === "interrupt") await writeFile(join(dir, "interrupt"), "interrupt")
        release?.()
        await bounded(worker.exited, 20_000)
        const text = await stdout, diagnostic = await stderr
        expect(worker.exitCode, diagnostic).toBe(0)
        const result = JSON.parse(text) as { status: string; output?: unknown; stopReason?: string }
        expect(result.status, text).toBe(mode === "success" ? "succeeded" : mode === "refusal" ? "refused" : mode === "provider-error" || mode === "redirect" || mode === "retryable-error" ? "failed" : mode === "interrupt" ? "interrupted" : "timeout")
        if (mode === "success") expect(result.output).toEqual({ ok: true })
        else expect(result.output).toBeUndefined()
        expect(violations).toEqual([])
        expect(warmups.every(w => w.method === "HEAD" && w.key === null && w.auth === null)).toBe(true)
        expect(redirected).toEqual([])
        expect(requests.length).toBeGreaterThan(0)
        if (mode === "retryable-error" || mode === "redirect") expect(requests.filter(r => r.path === "/v1/messages")).toHaveLength(1)
        expect(requests.every(r => r.model === MODEL && r.key === DUMMY_KEY)).toBe(true)
        expect(requests.filter(r => r.path === "/v1/messages").every(r => r.tools.every(t => t === "StructuredOutput"))).toBe(true)
        const count = requests.length
        await pause(250)
        expect(requests).toHaveLength(count)
        for (const child of owned) expect(await processInfo(child.pid)).not.toBe(child.identity)
      } finally {
        release?.()
        for (const cancel of cancelResponses) cancel()
        if (worker !== undefined && worker.exitCode === null) { worker.kill("SIGKILL"); await bounded(worker.exited, 2000) }
        // Only previously observed children of this owned worker may be cleaned after a
        // genuine Red; a changed PID identity must never be signaled.
        for (const child of owned) if (await processInfo(child.pid) === child.identity) {
          try { process.kill(child.pid, "SIGKILL") } catch { /* already exited */ }
        }
        await server.stop(true)
        await redirectTarget?.stop(true)
        await rm(dir, { recursive: true, force: true })
      }
    }, 35_000)
  })
}
