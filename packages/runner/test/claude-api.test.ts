import { describe, expect, it } from "vitest"
import { runClaudeApi, strictify } from "../src/engines/claude-api.js"
import type { HarnessJob, SkillAgent } from "../src/engines/types.js"

/**
 * These cover the paths where lane A costs the seller real money: a run that blows past
 * its ceiling, a refusal charged as an answer, and a half-finished brief settled as a
 * complete one. The happy path is the cheapest thing to get right and the least valuable
 * thing to test.
 */

// ── a scriptable stand-in for the SDK's tool runner ─────────────────────────

interface FakeMessage {
  content: Array<Record<string, unknown>>
  stop_reason: string | null
  stop_details?: { category?: string } | null
  usage: Record<string, number>
}

const msg = (over: Partial<FakeMessage> = {}): FakeMessage => ({
  content: [],
  stop_reason: "tool_use",
  usage: { input_tokens: 1000, output_tokens: 500 },
  ...over
})

const toolUse = (name: string, input: unknown) => ({ type: "tool_use", name, input })

/** The harness fences the buyer input; engines receive the finished prompt. */
const PROMPT = "fenced prompt"

/** Records what the harness did to the runner so the tests can assert on control flow. */
interface FakeRunner {
  consumed: number
  pushed: Array<unknown>
  signal?: AbortSignal | undefined
  params?: Record<string, unknown> | undefined
}

const fakeClient = (script: ReadonlyArray<FakeMessage>, spy: FakeRunner) =>
  ({
    beta: {
      messages: {
        toolRunner(params: Record<string, unknown>) {
          spy.params = params
          return {
            setRequestOptions(opts: { signal?: AbortSignal }) {
              spy.signal = opts.signal
            },
            pushMessages(...m: Array<unknown>) {
              spy.pushed.push(...m)
            },
            async *[Symbol.asyncIterator]() {
              for (const m of script) {
                // A real runner would not produce another turn after an abort. Modelling
                // that is the whole point: an enforcement bound that only takes effect
                // after the loop drains has enforced nothing.
                if (spy.signal?.aborted === true) return
                spy.consumed += 1
                yield m
              }
            }
          }
        }
      }
    }
  }) as never

const agent = (over: Partial<SkillAgent> = {}): SkillAgent => ({
  systemPrompt: "test",
  model: "claude-opus-5",
  ...over
})

const job = (bounds: Partial<HarnessJob["bounds"]> = {}): HarnessJob => ({
  jobId: "job-1",
  skillDir: "/tmp/skill",
  input: { company: "Acme" },
  bounds: { timeoutSec: 60, ...bounds },
  outputSchema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } }
})

// ── completion contract ─────────────────────────────────────────────────────

describe("completion", () => {
  it("returns the submit arguments as the job output", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const out = await runClaudeApi(
      agent(),
      job(),
      PROMPT, fakeClient([msg({ content: [toolUse("submit", { ok: true })] })], spy)
    )

    expect(out.output).toEqual({ ok: true })
    expect(out.stopReason).toBe("end_turn")
    expect(out.usage.turns).toBe(1)
  })

  it("stops as soon as submit is seen, without spending another turn", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    await runClaudeApi(
      agent(),
      job(),
      PROMPT, fakeClient(
        [
          msg({ content: [toolUse("web_search", {})] }),
          msg({ content: [toolUse("submit", { ok: true })] }),
          msg({ content: [toolUse("submit", { ok: false })] })
        ],
        spy
      )
    )

    expect(spy.consumed).toBe(2)
  })

  it("reports no output when the agent stops without submitting", async () => {
    // D2 refuses to settle this. The distinction matters: the agent produced text, it just
    // never produced the answer the buyer paid for.
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const out = await runClaudeApi(
      agent(),
      job({ maxTurns: 2 }),
      PROMPT, fakeClient([msg({ content: [{ type: "text", text: "still looking" }], stop_reason: "end_turn" })], spy)
    )

    expect(out.output).toBeUndefined()
    expect(out.error).toMatch(/without calling submit/)
  })
})

// ── refusals ────────────────────────────────────────────────────────────────

describe("refusal", () => {
  it("carries the refusal category through, and returns no output", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const out = await runClaudeApi(
      agent(),
      job(),
      PROMPT, fakeClient(
        [msg({ content: [], stop_reason: "refusal", stop_details: { category: "cyber" } })],
        spy
      )
    )

    expect(out.stopReason).toBe("refusal:cyber")
    expect(out.output).toBeUndefined()
  })

  it("does not read content on a refusal", async () => {
    // A declined request is a 200 whose body may be empty or partial. Treating a partial
    // as an answer is exactly how a buyer gets billed for a non-answer.
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const out = await runClaudeApi(
      agent(),
      job(),
      PROMPT, fakeClient(
        [msg({ content: [toolUse("submit", { ok: true })], stop_reason: "refusal" })],
        spy
      )
    )

    expect(out.output).toBeUndefined()
    expect(out.stopReason).toBe("refusal")
  })
})

// ── bounds are a ceiling, not a postmortem ──────────────────────────────────

describe("bounds enforcement", () => {
  it("aborts mid-run once the cost ceiling is crossed", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    // Each turn bills 20k output tokens = $0.50 on Opus 5. One turn already exceeds the
    // ceiling; without in-loop enforcement all ten would run and bill $5.00.
    const expensive = Array.from({ length: 10 }, () =>
      msg({ usage: { input_tokens: 0, output_tokens: 20_000 } })
    )

    const out = await runClaudeApi(agent(), job({ maxCostUsd: 0.12 }), PROMPT, fakeClient(expensive, spy))

    expect(out.stopReason).toBe("bounds_exceeded")
    expect(spy.consumed).toBe(1)
    expect(spy.signal?.aborted).toBe(true)
    expect(out.costUsd).toBeLessThan(0.6)
  })

  it("stops on the tool-call ceiling", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const searches = Array.from({ length: 10 }, () =>
      msg({ content: [toolUse("web_search", {}), toolUse("web_search", {})] })
    )

    const out = await runClaudeApi(agent(), job({ maxToolCalls: 3 }), PROMPT, fakeClient(searches, spy))

    expect(out.stopReason).toBe("bounds_exceeded")
    expect(out.error).toMatch(/maxToolCalls/)
    expect(spy.consumed).toBe(2)
  })

  it("passes the turn ceiling to the runner rather than counting it locally", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    await runClaudeApi(agent(), job({ maxTurns: 5 }), PROMPT, fakeClient([msg()], spy))

    expect(spy.params?.["max_iterations"]).toBe(5)
  })

  it("lets an unbounded-cost run proceed", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const out = await runClaudeApi(
      agent(),
      job(),
      PROMPT, fakeClient(
        [msg({ usage: { output_tokens: 90_000 } }), msg({ content: [toolUse("submit", { ok: true })] })],
        spy
      )
    )

    expect(out.stopReason).toBe("end_turn")
  })
})

// ── pause_turn ──────────────────────────────────────────────────────────────

describe("pause_turn", () => {
  it("resumes a paused turn instead of ending the run", async () => {
    // The SDK's runner does not resume `pause_turn` on its own: the loop just ends. A
    // half-finished brief that looks complete is the failure mode this prevents.
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const out = await runClaudeApi(
      agent(),
      job(),
      PROMPT, fakeClient(
        [
          msg({ content: [{ type: "text", text: "searching" }], stop_reason: "pause_turn" }),
          msg({ content: [toolUse("submit", { ok: true })] })
        ],
        spy
      )
    )

    expect(spy.pushed).toHaveLength(1)
    expect(out.output).toEqual({ ok: true })
  })
})

// ── request shape ───────────────────────────────────────────────────────────

describe("request construction", () => {
  it("never disables thinking", async () => {
    // On Opus 5, disabling thinking above `high` effort is a 400, and below it the model
    // can emit tool calls as plain text — a call that silently never runs.
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    await runClaudeApi(agent({ effort: "xhigh" }), job(), PROMPT, fakeClient([msg()], spy))

    expect(spy.params?.["thinking"]).toBeUndefined()
  })

  it("defaults to Opus 5 at medium effort", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    await runClaudeApi({ systemPrompt: "x" }, job(), PROMPT, fakeClient([msg()], spy))

    expect(spy.params?.["model"]).toBe("claude-opus-5")
    expect(spy.params?.["output_config"]).toEqual({ effort: "medium" })
  })

  it("declares submit with the manifest's output schema, made strict", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    await runClaudeApi(agent(), job(), PROMPT, fakeClient([msg()], spy))

    const tools = spy.params?.["tools"] as Array<Record<string, unknown>>
    const submit = tools.find((t) => t["name"] === "submit")!
    expect(submit["strict"]).toBe(true)
    expect((submit["input_schema"] as Record<string, unknown>)["additionalProperties"]).toBe(false)
  })

  it("omits web search unless the seller asked for it", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    await runClaudeApi(agent(), job(), PROMPT, fakeClient([msg()], spy))

    const tools = spy.params?.["tools"] as Array<Record<string, unknown>>
    expect(tools.some((t) => t["name"] === "web_search")).toBe(false)
  })

  it("maps the web-search capability to one server tool, not a second sandbox", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    await runClaudeApi(
      agent({ capabilities: ["web-search"] }),
      job({ maxToolCalls: 4 }),
      PROMPT,
      fakeClient([msg()], spy)
    )

    const tools = spy.params?.["tools"] as Array<Record<string, unknown>>
    const search = tools.find((t) => t["name"] === "web_search")!
    expect(search["type"]).toBe("web_search_20260209")
    // The tool budget derives from the manifest's declared bound, so a seller cannot grant
    // themselves more searches than the listing says the job may make.
    expect(search["max_uses"]).toBe(4)
    // Dynamic filtering runs code execution internally; declaring a second sandbox
    // alongside it gives the model two and confuses it.
    expect(tools.some((t) => t["name"] === "code_execution")).toBe(false)
  })
})

// ── schema preparation ──────────────────────────────────────────────────────

describe("strictify", () => {
  it("closes every object in the tree, including inside arrays", async () => {
    const out = strictify({
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object", properties: { a: { type: "string" } } } }
      }
    }) as Record<string, unknown>

    expect(out["additionalProperties"]).toBe(false)
    const props = out["properties"] as Record<string, Record<string, unknown>>
    const items = props["items"]!["items"] as Record<string, unknown>
    expect(items["additionalProperties"]).toBe(false)
  })

  it("leaves a seller's explicit choice alone", async () => {
    const out = strictify({ type: "object", additionalProperties: true }) as Record<string, unknown>
    expect(out["additionalProperties"]).toBe(true)
  })

  it("does not touch non-object nodes", async () => {
    expect(strictify({ type: "string" })).toEqual({ type: "string" })
  })
})

// ── cost accounting ─────────────────────────────────────────────────────────

describe("cost estimate", () => {
  it("prices cache reads well below fresh input", async () => {
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const cached = await runClaudeApi(
      agent(),
      job(),
      PROMPT, fakeClient(
        [msg({ content: [toolUse("submit", {})], usage: { cache_read_input_tokens: 100_000 } })],
        spy
      )
    )

    const spy2: FakeRunner = { consumed: 0, pushed: [] }
    const fresh = await runClaudeApi(
      agent(),
      job(),
      PROMPT, fakeClient(
        [msg({ content: [toolUse("submit", {})], usage: { input_tokens: 100_000 } })],
        spy2
      )
    )

    expect(cached.costUsd).toBeCloseTo(fresh.costUsd * 0.1, 6)
  })

  it("counts cached tokens toward the token ceiling", async () => {
    // Cheap is not free: a run can sit under every cost ceiling and still balloon the
    // context it has to re-read each turn.
    const spy: FakeRunner = { consumed: 0, pushed: [] }
    const out = await runClaudeApi(
      agent(),
      job({ maxTokens: 50_000 }),
      PROMPT, fakeClient(
        Array.from({ length: 5 }, () => msg({ usage: { cache_read_input_tokens: 40_000 } })),
        spy
      )
    )

    expect(out.stopReason).toBe("bounds_exceeded")
  })
})
