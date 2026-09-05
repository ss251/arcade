import { describe, expect, it, vi } from "vitest"
import { existsSync, statSync } from "node:fs"
import { rm } from "node:fs/promises"
import type { ChildProcess } from "node:child_process"
import {
  denyList,
  runClaudeAgent,
  toolsForCapabilities,
  unexpectedTools
} from "../src/engines/claude-agent.js"
import type { HarnessJob, SkillAgent } from "../src/engines/types.js"

/**
 * The Agent SDK engine delegates both ceilings to the SDK, so what needs proving here is
 * the translation — every terminal shape maps onto the right D1/D2 outcome — and that the
 * sandbox posture we claim in the docs is the one actually requested.
 */

interface FakeQuery {
  options?: Record<string, unknown> | undefined
  prompt?: unknown
}

const fakeQuery = (messages: ReadonlyArray<unknown>, spy: FakeQuery) =>
  ((params: { prompt: unknown; options?: Record<string, unknown> }) => {
    spy.prompt = params.prompt
    spy.options = params.options
    return {
      async *[Symbol.asyncIterator]() {
        for (const m of messages) yield m
      }
    }
  }) as never

const result = (over: Record<string, unknown> = {}) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 3,
  stop_reason: "end_turn",
  total_cost_usd: 0.031,
  usage: { input_tokens: 4000, output_tokens: 900 },
  structured_output: { ok: true },
  ...over
})

const agent = (over: Partial<SkillAgent> = {}): SkillAgent => ({ systemPrompt: "test", ...over })

const job = (bounds: Partial<HarnessJob["bounds"]> = {}): HarnessJob => ({
  jobId: "job-1",
  skillDir: "/tmp/skill",
  input: { company: "Acme" },
  bounds: { timeoutSec: 60, ...bounds },
  outputSchema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } }
})

const PROMPT = "fenced prompt"

// ── terminal shapes → job outcomes ──────────────────────────────────────────

describe("result translation", () => {
  it("keeps the structured terminal refusal even if SDK teardown would throw", async () => {
    const q = (() => ({ async *[Symbol.asyncIterator]() {
      yield result({ stop_reason: "refusal", structured_output: undefined })
      throw Error("private provider refusal diagnostic")
    } })) as never
    const out = await runClaudeAgent(agent(), job(), PROMPT, q)
    expect(out.stopReason).toBe("refusal")
    expect(out.output).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain("private provider")
  })
  it("returns structured output and the SDK's own cost figure", async () => {
    const spy: FakeQuery = {}
    const out = await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result()], spy))

    expect(out.output).toEqual({ ok: true })
    expect(out.stopReason).toBe("end_turn")
    expect(out.usage.turns).toBe(3)
    // SDK-reported accounting, not independently verified provider billing.
    expect(out.costUsd).toBe(0.031)
  })

  it("maps the turn ceiling onto bounds_exceeded", async () => {
    const spy: FakeQuery = {}
    const out = await runClaudeAgent(
      agent(),
      job({ maxTurns: 4 }),
      PROMPT,
      fakeQuery([result({ subtype: "error_max_turns", structured_output: undefined })], spy)
    )
    expect(out.stopReason).toBe("bounds_exceeded")
    expect(out.error).toMatch(/maxTurns/)
    expect(out.output).toBeUndefined()
  })

  it("maps the budget ceiling onto bounds_exceeded and reports the spend", async () => {
    const spy: FakeQuery = {}
    const out = await runClaudeAgent(
      agent(),
      job({ maxCostUsd: 0.1 }),
      PROMPT,
      fakeQuery(
        [result({ subtype: "error_max_budget_usd", total_cost_usd: 0.1042, structured_output: undefined })],
        spy
      )
    )
    expect(out.stopReason).toBe("bounds_exceeded")
    expect(out.error).toMatch(/maxCostUsd.*0\.1042/)
  })

  it("maps a ceiling that arrives as a thrown error, not a subtype", async () => {
    // Measured live: the SDK surfaces a budget breach whichever way the run happened to
    // end. Reporting one shape as bounds and the other as a generic failure would hide the
    // outcome a seller most needs to see.
    const throwing = (() => {
      throw new Error("Claude Code returned an error result: Reached maximum budget ($0.4)")
    }) as never
    const out = await runClaudeAgent(agent(), job({ maxCostUsd: 0.4 }), PROMPT, throwing)
    expect(out.stopReason).toBe("bounds_exceeded")
  })

  it("treats a refusal as a refusal even when the run reports success", async () => {
    const spy: FakeQuery = {}
    const out = await runClaudeAgent(
      agent(),
      job(),
      PROMPT,
      fakeQuery([result({ stop_reason: "refusal", structured_output: { ok: true } })], spy)
    )
    expect(out.stopReason).toBe("refusal")
    expect(out.output).toBeUndefined()
  })

  it("does not settle a run that finished without structured output", async () => {
    const spy: FakeQuery = {}
    const out = await runClaudeAgent(
      agent(),
      job(),
      PROMPT,
      fakeQuery([result({ structured_output: undefined })], spy)
    )
    expect(out.output).toBeUndefined()
    expect(out.stopReason).toBe("incomplete")
  })

  it("surfaces execution errors rather than settling them", async () => {
    const spy: FakeQuery = {}
    const out = await runClaudeAgent(
      agent(),
      job(),
      PROMPT,
      fakeQuery(
        [result({ subtype: "error_during_execution", structured_output: undefined, errors: ["boom"] })],
        spy
      )
    )
    expect(out.stopReason).toBe("error")
    expect(out.error).toBe("engine execution failed")
  })

  it.each([
    { num_turns: undefined }, { num_turns: -1 }, { num_turns: NaN }, { num_turns: Number.MAX_SAFE_INTEGER + 1 },
    { total_cost_usd: undefined }, { total_cost_usd: -1 }, { total_cost_usd: NaN }, { total_cost_usd: Infinity },
    { usage: undefined }, { usage: { input_tokens: 1 } }, { usage: { input_tokens: -1, output_tokens: 1 } },
    { usage: { input_tokens: 1, output_tokens: NaN } },
    { usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 } },
    { usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: -1 } },
    { usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: "1" } },
    { usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: -1 } } }
  ])("rejects malformed or absent SDK accounting %# without inventing cost", async (over) => {
    const out = await runClaudeAgent(agent(), job({ maxCostUsd: 0.05 }), PROMPT, fakeQuery([result(over)], {}))
    expect(out.stopReason).toBe("error")
    expect(out.output).toBeUndefined()
    expect(out.error).toBe("invalid engine accounting")
    expect(Number.isFinite(out.costUsd)).toBe(true)
    expect(out.costUsd).toBeGreaterThanOrEqual(0)
  })

  it.each(["max_tokens", "stop_sequence", "pause_turn", "tool_use", "unknown-private-reason", undefined, null])("does not accept non-terminal success reason %s", async (stop_reason) => {
    const out = await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result({ stop_reason })], {}))
    expect(out.output).toBeUndefined()
    expect(out.stopReason).toBe("incomplete")
    expect(out.error).toBe("engine did not complete the output contract")
  })

  it("accepts the native structured-output tool terminal only after its observed tool call", async () => {
    const out = await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([
      { type: "assistant", message: { content: [{ type: "tool_use", name: "StructuredOutput" }] } },
      result({ stop_reason: "tool_use" })
    ], {}))
    expect(out.stopReason).toBe("end_turn")
    expect(out.output).toEqual({ ok: true })
    expect(out.usage.toolCalls).toBe(1)
  })

  it.each(["private provider key=secret", "Reached maximum budget private-secret", "maximum number of turns private-secret"])("redacts thrown SDK diagnostics %s", async (message) => {
    const out = await runClaudeAgent(agent(), job({ maxCostUsd: 0.05 }), PROMPT, (() => { throw Error(message) }) as never)
    expect(out.output).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain("private")
    expect(out.costUsd).toBe(0)
  })

  it("does not interpret inherited bounds subtype properties as bounds metadata", async () => {
    const out = await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result({ subtype: "constructor" })], {}))
    expect(out.stopReason).toBe("error")
    expect(out.error).toBe("engine execution failed")
  })

  it.each([true, undefined, null, "false"])("does not accept a success with contradictory error flag %s", async (is_error) => {
    const out = await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result({ is_error })], {}))
    expect(out.stopReason).toBe("error")
    expect(out.output).toBeUndefined()
    expect(out.error).toBe("engine execution failed")
  })

  it.each([
    { bounds: { maxTurns: 2 }, over: {}, messages: [] },
    { bounds: { maxTokens: 5000 }, over: { usage: { input_tokens: 4000, output_tokens: 900, cache_read_input_tokens: 200 } }, messages: [] },
    { bounds: { maxToolCalls: 0 }, over: {}, messages: [{ type: "assistant", message: { content: [{ type: "tool_use", name: "StructuredOutput" }] } }] }
  ])("checks all declared ceilings before accepting final structured output %#", async ({ bounds, over, messages }) => {
    const out = await runClaudeAgent(agent(), job(bounds), PROMPT, fakeQuery([...messages, result(over)], {}))
    expect(out.stopReason).toBe("bounds_exceeded")
    expect(out.output).toBeUndefined()
  })
})

// ── the sandbox posture we claim ────────────────────────────────────────────

describe("sandbox posture", () => {
  it("gives the custom API native process only its relay capability, never upstream credentials", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://provider.fixture.invalid")
    vi.stubEnv("ANTHROPIC_API_KEY", "private-synthetic-upstream-key")
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", undefined)
    vi.stubEnv("ANTHROPIC_CUSTOM_HEADERS", "x-sensitive: private-synthetic-header")
    vi.stubEnv("HTTPS_PROXY", "http://private-synthetic-proxy.invalid")
    vi.stubEnv("https_proxy", "http://private-synthetic-proxy.invalid")
    let args: Record<string, unknown> | undefined, closes = 0
    const factory = (async (options: Record<string, unknown>) => {
      args = options
      return { baseUrl: "http://127.0.0.1:12345", capability: "per-job-random-capability", close: async () => { closes++ } }
    }) as never
    const spy: FakeQuery = {}
    try {
      const out = await runClaudeAgent(agent({ credential: "api-key", model: "glm-5.3-flash" }), job({ maxTurns: 3 }), PROMPT, fakeQuery([result()], spy), factory)
      expect(out.stopReason).toBe("end_turn")
      expect(args?.["baseUrl"]).toBe("https://provider.fixture.invalid")
      expect(args?.["apiKey"]).toBe("private-synthetic-upstream-key")
      expect(args?.["model"]).toBe("glm-5.3-flash")
      expect(args?.["allowedTools"]).toEqual(["StructuredOutput"])
      const env = spy.options?.["env"] as Record<string, unknown>
      expect(env["ANTHROPIC_BASE_URL"]).toBe("http://127.0.0.1:12345")
      expect(env["ANTHROPIC_API_KEY"]).toBe("per-job-random-capability")
      expect(env["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined()
      expect(env["ANTHROPIC_CUSTOM_HEADERS"]).toBeUndefined()
      expect(env["HTTPS_PROXY"]).toBeUndefined()
      expect(env["https_proxy"]).toBeUndefined()
      expect(JSON.stringify(env)).not.toContain("private-synthetic")
      expect(closes).toBe(1)
    } finally { vi.unstubAllEnvs() }
  })

  it("never substitutes an ambient seat wrapper for the bundled API-key binary", async () => {
    vi.stubEnv("ARCADE_CLAUDE_BIN", "/private-fixture-seat-wrapper")
    const spy: FakeQuery = {}
    try {
      await runClaudeAgent(agent({ credential: "api-key" }), job(), PROMPT, fakeQuery([result()], spy))
      expect(spy.options?.["pathToClaudeCodeExecutable"]).toBeUndefined()
    } finally { vi.unstubAllEnvs() }
  })

  it("does not claim a result when its owned relay close fails", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://provider.fixture.invalid")
    vi.stubEnv("ANTHROPIC_API_KEY", "private-synthetic-key")
    const factory = (async () => ({ baseUrl: "http://127.0.0.1:12345", capability: "cap", close: async () => { throw Error("private-close") } })) as never
    try {
      const out = await runClaudeAgent(agent({ model: "glm-5.3-flash" }), job(), PROMPT, fakeQuery([result()], {}), factory)
      expect(out.stopReason).toBe("error")
      expect(out.output).toBeUndefined()
      expect(out.error).toBe("owned engine cleanup failed")
    } finally { vi.unstubAllEnvs() }
  })

  it("fails closed with fixed diagnostics on undeclared initialization tools", async () => {
    const out = await runClaudeAgent(agent(), job(), PROMPT,
      fakeQuery([{ type: "system", subtype: "init", tools: ["private-tool-name"] }, result()], {}))
    expect(out.stopReason).toBe("error")
    expect(out.output).toBeUndefined()
    expect(out.error).toBe("engine loaded undeclared tools")
  })
  it("requests no tools at all when the skill declares no capabilities", async () => {
    const spy: FakeQuery = {}
    await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result()], spy))
    expect(spy.options?.["allowedTools"]).toEqual([])
    expect(spy.options?.["tools"]).toEqual([])
    expect(spy.options?.["permissionMode"]).toBe("dontAsk")
  })

  it("strips the built-in tools from the request rather than refusing them later", async () => {
    // Measured: `allowedTools: []` alone still loads Bash, Read, Write and Edit. Absence
    // is the guarantee; the permission mode is only the second line.
    const spy: FakeQuery = {}
    await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result()], spy))
    const denied = spy.options?.["disallowedTools"] as Array<string>
    for (const dangerous of ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch"]) {
      expect(denied).toContain(dangerous)
    }
  })

  it("never denies the tool that delivers the output contract", async () => {
    const spy: FakeQuery = {}
    await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result()], spy))
    expect(spy.options?.["disallowedTools"]).not.toContain("StructuredOutput")
  })

  it("loads no filesystem settings at all", async () => {
    // Omitting this loads the seller's settings, the project's, any CLAUDE.md — and,
    // measured, the MCP servers of whatever directory the runner started in: egress nobody
    // granted, at five times the cost.
    const spy: FakeQuery = {}
    await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result()], spy))
    expect(spy.options?.["settingSources"]).toEqual([])
  })

  it("pins the working directory to the skill, not the daemon's", async () => {
    const spy: FakeQuery = {}
    await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result()], spy))
    expect(spy.options?.["cwd"]).toBe("/tmp/skill")
  })

  it("points at the marketplace seat only in subscription mode", async () => {
    const seat: FakeQuery = {}
    await runClaudeAgent(agent({ credential: "subscription" }), job(), PROMPT, fakeQuery([result()], seat))
    expect((seat.options?.["env"] as Record<string, string>)["CLAUDE_CONFIG_DIR"]).toMatch(
      /\.arcade\/seat$/
    )

    const key: FakeQuery = {}
    await runClaudeAgent(agent({ credential: "api-key" }), job(), PROMPT, fakeQuery([result()], key))
    expect((key.options?.["env"] as Record<string, string>)["CLAUDE_CONFIG_DIR"]).toMatch(/arcade-agent-config-/)
  })

  it("gives API jobs unique private scratch config and removes it after completion without changing HOME", async () => {
    const paths: string[] = []
    const home = process.env["HOME"]
    const inspect = ((params: { options: Record<string, unknown> }) => {
      const env = params.options["env"] as Record<string, string | undefined>
      const config = env["CLAUDE_CONFIG_DIR"]
      expect(config).toMatch(/arcade-agent-config-/)
      expect(config).not.toBe(process.env["CLAUDE_CONFIG_DIR"])
      expect(env["HOME"]).toBe(home)
      expect(statSync(config!).mode & 0o777).toBe(0o700)
      expect(params.options["persistSession"]).toBe(false)
      expect(env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"]).toBe("1")
      expect(env["CLAUDE_CODE_SIMPLE"]).toBe("1")
      paths.push(config!)
      return { async *[Symbol.asyncIterator]() { yield result() } }
    }) as never
    const first = await runClaudeAgent(agent({ credential: "api-key" }), job(), PROMPT, inspect)
    const second = await runClaudeAgent(agent({ credential: "api-key" }), job(), PROMPT, inspect)
    expect(first.stopReason).toBe("end_turn")
    expect(second.stopReason).toBe("end_turn")
    expect(new Set(paths).size).toBe(2)
    expect(paths.every((path) => !existsSync(path))).toBe(true)
    expect(process.env["HOME"]).toBe(home)
  })

  it("closes a failed query and removes only its owned scratch config", async () => {
    let config = "", closed = false
    const failing = ((params: { options: Record<string, unknown> }) => {
      config = (params.options["env"] as Record<string, string>)["CLAUDE_CONFIG_DIR"]!
      return {
        close() { closed = true },
        async *[Symbol.asyncIterator]() { throw Error("fixture failure") }
      }
    }) as never
    const out = await runClaudeAgent(agent({ credential: "api-key" }), job(), PROMPT, failing)
    expect(out.stopReason).toBe("error")
    expect(closed).toBe(true)
    expect(config).toMatch(/arcade-agent-config-/)
    expect(existsSync(config)).toBe(false)
  })

  it("bounds an uncooperative query and closes it after the deadline", async () => {
    let closed = false
    const hanging = (() => ({
      close() { closed = true },
      [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}) } }
    })) as never
    const out = await runClaudeAgent(agent({ credential: "api-key" }), job({ timeoutSec: 0.02 }), PROMPT, hanging)
    expect(out.stopReason).toBe("timeout")
    expect(closed).toBe(true)
  }, 1_000)

  it("still aborts, reaps its owned child and removes scratch when query close throws", async () => {
    let config = "", controller: AbortController | undefined, child: ChildProcess | undefined
    let closed: Promise<void> | undefined, reaped = false
    const termListeners = process.listenerCount("SIGTERM"), intListeners = process.listenerCount("SIGINT")
    const throwingClose = ((params: { options: Record<string, unknown> }) => {
      config = (params.options["env"] as Record<string, string>)["CLAUDE_CONFIG_DIR"]!
      controller = params.options["abortController"] as AbortController
      const start = params.options["spawnClaudeCodeProcess"] as (options: {
        command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv
      }) => ChildProcess
      child = start({ command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], cwd: config, env: {} })
      closed = new Promise<void>((resolveClose) => child!.once("close", () => { reaped = true; resolveClose() }))
      return {
        close() { throw Error("private close diagnostic must not escape") },
        async *[Symbol.asyncIterator]() { yield result() }
      }
    }) as never
    try {
      const out = await runClaudeAgent(agent({ credential: "api-key" }), job({ timeoutSec: 2 }), PROMPT, throwingClose)
      expect(out.stopReason).toBe("error")
      expect(out.output).toBeUndefined()
      expect(out.error).not.toContain("private close diagnostic")
      expect(controller?.signal.aborted).toBe(true)
      expect(reaped).toBe(true)
      expect(existsSync(config)).toBe(false)
      expect(process.listenerCount("SIGTERM")).toBe(termListeners)
      expect(process.listenerCount("SIGINT")).toBe(intListeners)
    } finally {
      // The Red implementation leaks this child; the test must still clean its own fixture.
      if (child !== undefined && !reaped) { child.kill("SIGKILL"); await closed }
      controller?.abort()
      if (config !== "" && existsSync(config)) await rm(config, { recursive: true, force: true })
    }
  }, 5_000)

  it("drains private native stderr so a full pipe cannot stall an otherwise finished child", async () => {
    const noisy = ((params: { options: Record<string, unknown> }) => {
      const start = params.options["spawnClaudeCodeProcess"] as (options: {
        command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv
      }) => ChildProcess
      const config = (params.options["env"] as Record<string, string>)["CLAUDE_CONFIG_DIR"]!
      const child = start({ command: process.execPath, args: ["-e", "process.stderr.write('private fixture '.repeat(300000),()=>process.exit(0))"], cwd: config, env: {} })
      const closed = new Promise<void>((done) => child.once("close", () => done()))
      return { async *[Symbol.asyncIterator]() { await closed; yield result() } }
    }) as never
    const out = await runClaudeAgent(agent(), job({ timeoutSec: 2 }), PROMPT, noisy)
    expect(out.stopReason).toBe("end_turn")
    expect(JSON.stringify(out)).not.toContain("private fixture")
  }, 4_000)

  it("refuses a successful SDK result whose reported cost exceeds the declared cap", async () => {
    const out = await runClaudeAgent(agent({ model: "glm-5.3-flash" }), job({ maxCostUsd: 0.07 }), PROMPT,
      fakeQuery([result({ total_cost_usd: 0.08 })], {}))
    expect(out.stopReason).toBe("bounds_exceeded")
    expect(out.output).toBeUndefined()
    expect(out.costUsd).toBe(0.08)
  })
})

// ── capability mapping ──────────────────────────────────────────────────────

describe("capabilities", () => {
  it("grants exactly the tools a capability implies, and no more", async () => {
    expect(toolsForCapabilities(["web-search"])).toEqual(["WebSearch"])
    expect(toolsForCapabilities(["read-workdir"]).sort()).toEqual(["Glob", "Grep", "Read"])
  })

  it("does not smuggle a write tool in behind a read capability", async () => {
    const read = toolsForCapabilities(["read-workdir"])
    expect(read).not.toContain("Write")
    expect(read).not.toContain("Edit")
    expect(read).not.toContain("Bash")
  })

  it("de-duplicates overlapping capabilities", async () => {
    const both = toolsForCapabilities(["read-workdir", "write-workdir"])
    expect(new Set(both).size).toBe(both.length)
  })

  it("stops denying a tool a capability asked for", async () => {
    const spy: FakeQuery = {}
    await runClaudeAgent(agent({ capabilities: ["web-search"] }), job(), PROMPT, fakeQuery([result()], spy))
    const denied = spy.options?.["disallowedTools"] as Array<string>
    expect(spy.options?.["allowedTools"]).toContain("WebSearch")
    expect(denied).not.toContain("WebSearch")
    // and everything else stays shut
    expect(denied).toContain("Bash")
  })
})

describe("deny-list drift", () => {
  it("flags a tool that loaded without being asked for", async () => {
    expect(unexpectedTools(["StructuredOutput", "NewShinyTool"], [])).toEqual(["NewShinyTool"])
  })

  it("stays quiet when only expected tools load", async () => {
    expect(unexpectedTools(["StructuredOutput", "WebSearch"], ["WebSearch"])).toEqual([])
  })

  it("keeps the output tool out of the deny list at any allow-list size", async () => {
    expect(denyList([])).not.toContain("StructuredOutput")
    expect(denyList(["Bash"])).not.toContain("StructuredOutput")
  })
})
