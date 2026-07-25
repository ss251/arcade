import { describe, expect, it } from "vitest"
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
  it("returns structured output and the SDK's own cost figure", async () => {
    const spy: FakeQuery = {}
    const out = await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result()], spy))

    expect(out.output).toEqual({ ok: true })
    expect(out.stopReason).toBe("end_turn")
    expect(out.usage.turns).toBe(3)
    // Real spend, not a figure derived from a pricing table.
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
    expect(out.error).toBe("boom")
  })
})

// ── the sandbox posture we claim ────────────────────────────────────────────

describe("sandbox posture", () => {
  it("requests no tools at all when the skill declares no capabilities", async () => {
    const spy: FakeQuery = {}
    await runClaudeAgent(agent(), job(), PROMPT, fakeQuery([result()], spy))
    expect(spy.options?.["allowedTools"]).toEqual([])
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
    expect((key.options?.["env"] as Record<string, string>)["CLAUDE_CONFIG_DIR"]).toBeUndefined()
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
