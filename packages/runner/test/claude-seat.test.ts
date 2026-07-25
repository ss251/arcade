import { describe, expect, it } from "vitest"
import {
  denyList,
  runSeatAgent,
  unexpectedTools,
  type SeatAgentDefinition
} from "../src/engines/claude-seat.js"
import type { HarnessInput } from "../src/engines/claude-api.js"

/**
 * Lane B delegates both ceilings to the Agent SDK, so what needs proving here is the
 * translation: that every terminal shape the SDK can return maps onto the right D1/D2
 * outcome, and that the sandbox posture we claim is the one actually requested.
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

const agent = (over: Partial<SeatAgentDefinition> = {}): SeatAgentDefinition => ({
  systemPrompt: "test",
  ...over
})

const job = (bounds: Partial<HarnessInput["bounds"]> = {}): HarnessInput => ({
  jobId: "job-1",
  skillDir: "/tmp/skill",
  input: { company: "Acme" },
  bounds: { timeoutSec: 60, ...bounds },
  outputSchema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } }
})

// ── terminal shapes → job outcomes ──────────────────────────────────────────

describe("result translation", () => {
  it("returns structured output, and the seat's own cost figure", async () => {
    const spy: FakeQuery = {}
    const out = await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    expect(out.output).toEqual({ ok: true })
    expect(out.stopReason).toBe("end_turn")
    expect(out.usage.turns).toBe(3)
    expect(out.usage.tokens).toBe(4900)
    // Real spend from the SDK, not a figure derived from a pricing table.
    expect(out.costUsd).toBe(0.031)
  })

  it("maps the turn ceiling onto bounds_exceeded", async () => {
    const spy: FakeQuery = {}
    const out = await runSeatAgent(
      agent(),
      job({ maxTurns: 4 }),
      fakeQuery([result({ subtype: "error_max_turns", structured_output: undefined })], spy)
    )

    expect(out.stopReason).toBe("bounds_exceeded")
    expect(out.error).toMatch(/maxTurns/)
    expect(out.output).toBeUndefined()
  })

  it("maps the budget ceiling onto bounds_exceeded and reports the spend", async () => {
    const spy: FakeQuery = {}
    const out = await runSeatAgent(
      agent(),
      job({ maxCostUsd: 0.1 }),
      fakeQuery(
        [result({ subtype: "error_max_budget_usd", total_cost_usd: 0.1042, structured_output: undefined })],
        spy
      )
    )

    expect(out.stopReason).toBe("bounds_exceeded")
    expect(out.error).toMatch(/maxCostUsd.*0\.1042/)
  })

  it("treats a refusal as a refusal even when the run reports success", async () => {
    // The subtype describes how the harness terminated; stop_reason describes what the
    // model did. Reading only the first would settle a decline as an answer.
    const spy: FakeQuery = {}
    const out = await runSeatAgent(
      agent(),
      job(),
      fakeQuery([result({ stop_reason: "refusal", structured_output: { ok: true } })], spy)
    )

    expect(out.stopReason).toBe("refusal")
    expect(out.output).toBeUndefined()
  })

  it("does not settle a run that finished without structured output", async () => {
    const spy: FakeQuery = {}
    const out = await runSeatAgent(
      agent(),
      job(),
      fakeQuery([result({ structured_output: undefined, result: "here is my answer in prose" })], spy)
    )

    expect(out.output).toBeUndefined()
    expect(out.stopReason).toBe("incomplete")
  })

  it("reports an error when no result message ever arrives", async () => {
    const spy: FakeQuery = {}
    const out = await runSeatAgent(agent(), job(), fakeQuery([{ type: "assistant" }], spy))

    expect(out.stopReason).toBe("error")
    expect(out.output).toBeUndefined()
  })

  it("surfaces execution errors rather than settling them", async () => {
    const spy: FakeQuery = {}
    const out = await runSeatAgent(
      agent(),
      job(),
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
  it("requests no tools at all by default", async () => {
    // Lane B widens the environment to reach the seat credential. That is only safe
    // because the tool surface is closed: a skill that names no tools cannot act on it.
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    expect(spy.options?.["allowedTools"]).toEqual([])
    expect(spy.options?.["permissionMode"]).toBe("dontAsk")
  })

  it("grants only what the seller named", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent({ allowedTools: ["WebSearch"] }), job(), fakeQuery([result()], spy))

    expect(spy.options?.["allowedTools"]).toEqual(["WebSearch"])
  })

  it("points at the marketplace seat, not the seller's everyday config", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    const env = spy.options?.["env"] as Record<string, string>
    expect(env["CLAUDE_CONFIG_DIR"]).toMatch(/\.arcade\/seat$/)
  })

  it("strips the built-in tools from the request rather than refusing them later", async () => {
    // Measured: `allowedTools: []` alone still loads Bash, Read, Write and Edit. Absence
    // is the guarantee; the permission mode is only the second line.
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    const denied = spy.options?.["disallowedTools"] as Array<string>
    for (const dangerous of ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch"]) {
      expect(denied).toContain(dangerous)
    }
  })

  it("never denies the tool that delivers the output contract", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    expect(spy.options?.["disallowedTools"]).not.toContain("StructuredOutput")
  })

  it("stops denying a tool the seller opted into", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent({ allowedTools: ["WebSearch"] }), job(), fakeQuery([result()], spy))

    const denied = spy.options?.["disallowedTools"] as Array<string>
    expect(denied).not.toContain("WebSearch")
    expect(denied).toContain("Bash")
  })

  it("loads no filesystem settings at all", async () => {
    // Omitting this loads the seller's settings, the project's, and any CLAUDE.md into a
    // stranger's job — and, measured, the MCP servers of whatever directory the runner
    // started in: an egress path nobody granted, at five times the cost.
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    expect(spy.options?.["settingSources"]).toEqual([])
  })

  it("pins the working directory to the skill, not the daemon's", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    expect(spy.options?.["cwd"]).toBe("/tmp/skill")
  })

  it("resolves a seller's workdir relative to the skill", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent({ workdir: "sub" }), job(), fakeQuery([result()], spy))

    expect(spy.options?.["cwd"]).toBe("/tmp/skill/sub")
  })
})

describe("deny-list drift", () => {
  it("flags a tool that loaded without being asked for", async () => {
    // The deny list is a snapshot. A future release can add a tool it does not name, and
    // that should be a line in the seller's log rather than a silent widening.
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

// ── bounds and output contract reach the SDK ────────────────────────────────

describe("options", () => {
  it("hands both ceilings to the SDK", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job({ maxTurns: 6, maxCostUsd: 0.09 }), fakeQuery([result()], spy))

    expect(spy.options?.["maxTurns"]).toBe(6)
    expect(spy.options?.["maxBudgetUsd"]).toBe(0.09)
  })

  it("omits ceilings the seller did not declare", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    expect(spy.options).not.toHaveProperty("maxTurns")
    expect(spy.options).not.toHaveProperty("maxBudgetUsd")
  })

  it("makes the manifest's output schema the output contract", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    expect(spy.options?.["outputFormat"]).toEqual({
      type: "json_schema",
      schema: job().outputSchema
    })
  })

  it("passes the buyer's input as the prompt", async () => {
    const spy: FakeQuery = {}
    await runSeatAgent(agent(), job(), fakeQuery([result()], spy))

    expect(spy.prompt).toBe(JSON.stringify({ company: "Acme" }))
  })
})
