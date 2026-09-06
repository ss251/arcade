import { describe, expect, it, vi } from "vitest"
import { JobOutcome, shouldSettle } from "@arcade/core"
import { validateJson } from "../../../apps/hub/src/validate.ts"
import { doctorOpenAi, estimateOpenAiCostUsd, runOpenAiApi } from "../src/engines/openai-api.ts"
import type { HarnessJob, SkillAgent } from "../src/engines/types.ts"

const env = { OPENAI_API_KEY: "TEST_ONLY_KEY", OPENAI_BASE_URL: "https://api.b.ai/v1" }
const agent = (over: Partial<SkillAgent> = {}): SkillAgent => ({ systemPrompt: "operator", model: "glm-5.3-flash", ...over })
const job = (bounds: Partial<HarnessJob["bounds"]> = {}): HarnessJob => ({
  jobId: "api-test", input: {}, skillDir: "/unused",
  outputSchema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
  bounds: { timeoutSec: 5, ...bounds }
})
const call = (name = "submit", args: unknown = { ok: true }, id = "call_1") => ({
  id, type: "function", function: { name, arguments: JSON.stringify(args) }
})
const message = (over: Record<string, unknown> = {}) => ({
  role: "assistant", content: null, refusal: null, tool_calls: [call()], ...over
})
const response = (msg = message(), finish: unknown = "tool_calls", usage: unknown = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }) => ({
  model: "glm-5.3-flash", choices: [{ index: 0, finish_reason: finish, message: msg }], usage
})
const fixture = (bodies: unknown[]) => {
  const requests: RequestInit[] = []
  const urls: string[] = []
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    urls.push(url); requests.push(init)
    if (bodies.length === 0) throw new Error("unexpected retry")
    return Response.json(bodies.shift())
  })
  const hire = vi.fn(async () => ({ skillId: "child", jobId: "child-1", settled: true,
    result: { ok: true }, fenced: "<untrusted>child result</untrusted>", costUsd: 0.01 }))
  return { requests, urls, fetch, hire, deps: { env, fetch, hire, subSpendUsd: () => 0 } }
}

describe("Chat Completions completion contract", () => {
  it("sends a non-streaming function tool request and accepts only its final submit", async () => {
    const f = fixture([response()])
    const out = await runOpenAiApi(agent(), job(), "FENCED INPUT", f.deps)
    expect(out).toMatchObject({ output: { ok: true }, stopReason: "end_turn",
      usage: { turns: 1, tokens: 120, toolCalls: 1 }, costUsd: 0 })
    expect(f.urls).toEqual(["https://api.b.ai/v1/chat/completions"])
    expect(f.requests[0]).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" })
    const body = JSON.parse(String(f.requests[0]?.body))
    expect(body).toMatchObject({ model: "glm-5.3-flash", max_tokens: 16000, enable_thinking: false,
      stream: false, parallel_tool_calls: false, messages: [
        { role: "system", content: "operator" }, { role: "user", content: "FENCED INPUT" }
      ] })
    expect(body.tools).toEqual([{ type: "function", function: {
      name: "submit", description: expect.any(String), parameters: job().outputSchema
    } }])
    expect(f.hire).not.toHaveBeenCalled()
  })

  it.each(["stop", "length", "content_filter", "function_call", "refusal", "unknown", null])(
    "never accepts submit on finish_reason %s", async (finish) => {
      const f = fixture([response(message(), finish)])
      const out = await runOpenAiApi(agent(), job(), "input", f.deps)
      expect(out.stopReason).not.toBe("end_turn")
      expect(out.output).toBeUndefined()
      expect(f.fetch).toHaveBeenCalledTimes(1)
    })

  it.each([
    message({ refusal: "PRIVATE_REFUSAL" }),
    message({ content: [{ type: "refusal", refusal: "PRIVATE_REFUSAL" }] }),
    message({ refusal: {} })
  ])("gives refusals priority over a valid submit", async (msg) => {
    const f = fixture([response(msg)])
    const out = await runOpenAiApi(agent(), job(), "input", f.deps)
    expect(out.stopReason).toBe("refusal")
    expect(out.output).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain("PRIVATE_REFUSAL")
  })

  it("does not settle plain text or a schema-shaped assistant string", async () => {
    const f = fixture([response(message({ content: '{"ok":true}', tool_calls: [] }), "stop")])
    const out = await runOpenAiApi(agent(), job(), "input", f.deps)
    expect(out.stopReason).toBe("incomplete")
    expect(out.output).toBeUndefined()
  })

  it.each([{}, [], null, "", "answer", 7, false].map(value => ({ value })))("rejects empty or non-object submit $value", async ({ value }) => {
    const f = fixture([response(message({ tool_calls: [call("submit", value)] }))])
    expect((await runOpenAiApi(agent(), job(), "input", f.deps)).stopReason).not.toBe("end_turn")
  })

  it.each([
    [call(), call("submit", { ok: false }, "call_2")],
    [call("hire_skill", { skillId: "child", input: {} }), call("submit", { ok: true }, "call_2")],
    [call("unknown")],
    [{ ...call(), function: { name: "submit", arguments: "PRIVATE_BAD_JSON{" } }],
    [{ ...call(), type: "custom" }],
    [{ ...call(), id: "" }]
  ].map(tool_calls => ({ tool_calls })))("rejects malformed or ambiguous tool batches before side effects", async ({ tool_calls }) => {
    const f = fixture([response(message({ tool_calls }))])
    const out = await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job(), "input", f.deps)
    expect(out.stopReason).toBe("error")
    expect(out.output).toBeUndefined()
    expect(f.hire).not.toHaveBeenCalled()
    expect(JSON.stringify(out)).not.toContain("PRIVATE_BAD_JSON")
  })
})

describe("validated pricing and bounds", () => {
  it("prices cached prompt tokens once and includes reasoning in completion counts", () => {
    expect(estimateOpenAiCostUsd("https://api.openai.com/v1", "gpt-4.1-mini", {
      prompt_tokens: 1000, completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 400 }, completion_tokens_details: { reasoning_tokens: 150 }
    })).toBeCloseTo(0.0006)
  })

  it.each([undefined, null, {}, { prompt_tokens: 1 }, { prompt_tokens: -1, completion_tokens: 2 },
    { prompt_tokens: 1, completion_tokens: 0.5 }, { prompt_tokens: 1, completion_tokens: "2" },
    { prompt_tokens: Number.MAX_SAFE_INTEGER, completion_tokens: 1 },
    { prompt_tokens: 2, completion_tokens: 1, total_tokens: 9 },
    { prompt_tokens: 2, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 3 } },
    { prompt_tokens: 2, completion_tokens: 1, completion_tokens_details: { reasoning_tokens: 2 } }
  ])("refuses malformed usage even for a free model: %j", async (usage) => {
    const body = response(); body.usage = usage as typeof body.usage
    const f = fixture([body])
    const out = await runOpenAiApi(agent(), job(), "input", f.deps)
    expect(out.stopReason).toBe("error")
    expect(out.output).toBeUndefined()
  })

  it.each([
    { maxTokens: 100 }, { maxToolCalls: 0 }, { maxCostUsd: 0.00001 }
  ])("checks final-turn bounds before accepting output: %j", async (bounds) => {
    const f = fixture([response()])
    const deps = { ...f.deps, env: { ...env, OPENAI_BASE_URL: "https://api.openai.com/v1" } }
    const out = await runOpenAiApi(agent({ model: "gpt-4.1-mini" }), job(bounds), "input", deps)
    expect(out.stopReason).toBe("bounds_exceeded")
    expect(out.output).toBeUndefined()
    expect(f.fetch).toHaveBeenCalledTimes("maxToolCalls" in bounds ? 0 : 1)
  })

  it.each([
    { model: "unknown", base: env.OPENAI_BASE_URL },
    { model: "glm-5.3-flash", base: "https://api.openai.com/v1" },
    { model: "glm-5.3-flash", base: "https://api.b.ai.evil.example/v1" },
    { model: "glm-5.3-flash", base: "https://PRIVATE_KEY@api.b.ai/v1" },
    { model: "glm-5.3-flash", base: "https://api.b.ai/v1?key=PRIVATE_KEY" },
    { model: "glm-5.3-flash", base: "http://api.b.ai/v1" },
    { model: undefined, base: env.OPENAI_BASE_URL }
  ])("refuses an unpriced/invalid configuration before any POST: $base $model", async ({ model, base }) => {
    const f = fixture([])
    const a: SkillAgent = model === undefined ? { systemPrompt: "" } : agent({ model })
    const out = await runOpenAiApi(a, job(), "input", {
      ...f.deps, env: { ...env, OPENAI_BASE_URL: base }
    })
    expect(out.stopReason).toBe("error")
    expect(f.fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(out)).not.toContain("PRIVATE_KEY")
  })

  it("caps generated tokens by the remaining job token allowance", async () => {
    const f = fixture([response()])
    await runOpenAiApi(agent(), job({ maxTokens: 500 }), "input", f.deps)
    expect(JSON.parse(String(f.requests[0]?.body)).max_tokens).toBe(500)
  })
})

describe("bounded hiring without retries", () => {
  it("returns fenced child data using Chat tool messages and accounts for child spend", async () => {
    const f = fixture([
      response(message({ tool_calls: [call("hire_skill", { skillId: "child", input: { q: "x" } })] })),
      response(message({ tool_calls: [call("submit", { ok: true }, "call_2")] }))
    ])
    const out = await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job(), "input",
      { ...f.deps, subSpendUsd: () => f.hire.mock.calls.length ? 0.01 : 0 })
    expect(out).toMatchObject({ stopReason: "end_turn", costUsd: 0.01,
      usage: { turns: 2, tokens: 240, toolCalls: 2 } })
    expect(f.hire).toHaveBeenCalledWith("child", { q: "x" })
    const body = JSON.parse(String(f.requests[1]?.body))
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: "<untrusted>child result</untrusted>" })
  })

  it.each([
    [call("hire_skill", { skillId: "child", input: {} }), call("bad", {}, "call_2")],
    [call("hire_skill", { skillId: "child", input: {} }), call("hire_skill", { skillId: "other", input: {} })],
    [call("hire_skill", { skillId: "child", input: {}, hubUrl: "https://evil.example" })]
  ].map(tool_calls => ({ tool_calls })))("validates the entire hire batch before its first purchase", async ({ tool_calls }) => {
    const f = fixture([response(message({ tool_calls }))])
    expect((await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job(), "input", f.deps)).stopReason).toBe("error")
    expect(f.hire).not.toHaveBeenCalled()
  })

  it("never buys without a declared capability", async () => {
    const f = fixture([response(message({ tool_calls: [call("hire_skill", { skillId: "child", input: {} })] }))])
    expect((await runOpenAiApi(agent(), job(), "input", f.deps)).stopReason).toBe("error")
    expect(f.hire).not.toHaveBeenCalled()
  })

  it("does not buy if no continuation turn remains", async () => {
    const f = fixture([response(message({ tool_calls: [call("hire_skill", { skillId: "child", input: {} })] }))])
    expect((await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job({ maxTurns: 1 }), "input", f.deps)).stopReason).toBe("bounds_exceeded")
    expect(f.hire).not.toHaveBeenCalled()
  })

  it("does not retry an uncertain purchase or expose its exception", async () => {
    const f = fixture([response(message({ tool_calls: [call("hire_skill", { skillId: "child", input: {} })] }))])
    f.hire.mockRejectedValueOnce(new Error("PRIVATE_BROKER_TOKEN"))
    const out = await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job(), "input", f.deps)
    expect(out.stopReason).toBe("error")
    expect(f.hire).toHaveBeenCalledTimes(1)
    expect(f.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(out)).not.toContain("PRIVATE_BROKER_TOKEN")
  })

  it("checks the child-spend ceiling before a subsequent model turn", async () => {
    const f = fixture([response(message({ tool_calls: [call("hire_skill", { skillId: "child", input: {} })] }))])
    const out = await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job({ maxCostUsd: 0.005 }), "input",
      { ...f.deps, subSpendUsd: () => f.hire.mock.calls.length ? 0.01 : 0 })
    expect(out.stopReason).toBe("bounds_exceeded")
    expect(f.fetch).toHaveBeenCalledTimes(1)
    expect(out.costUsd).toBe(0.01)
  })
})

describe("offline configuration and transport safety", () => {
  it("leaves schema validation with the actual hub settlement gate", async () => {
    const f = fixture([response(message({ tool_calls: [call("submit", { ok: "not a boolean" })] }))])
    const out = await runOpenAiApi(agent(), job(), "input", f.deps)
    expect(out.stopReason).toBe("end_turn")
    const schemaValid = validateJson(out.output, job().outputSchema)
    expect(schemaValid).toBe(false)
    const outcome = JobOutcome.make({ status: "succeeded", startedAtMs: 0, finishedAtMs: 1,
      output: out.output, stopReason: out.stopReason! })
    expect(shouldSettle(outcome, schemaValid).settle).toBe(false)
  })

  it("does not claim an unsettled child was free or ask the model to repeat it", async () => {
    const f = fixture([response(message({ tool_calls: [call("hire_skill", { skillId: "child", input: {} })] }))])
    f.hire.mockResolvedValueOnce({ skillId: "child", jobId: "child-1", settled: false,
      result: { ok: false }, fenced: "", costUsd: 0.01 })
    const out = await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job(), "input",
      { ...f.deps, subSpendUsd: () => f.hire.mock.calls.length ? 0.01 : 0 })
    expect(out).toMatchObject({ stopReason: "error", costUsd: 0.01 })
    expect(f.fetch).toHaveBeenCalledTimes(1)
    expect(f.hire).toHaveBeenCalledTimes(1)
    expect(out.error).not.toMatch(/nothing was charged|free|continue/i)
  })

  it("rejects a repeated hire call ID across turns before a second purchase", async () => {
    const repeated = response(message({ tool_calls: [call("hire_skill", { skillId: "child", input: {} })] }))
    const f = fixture([repeated, repeated])
    const out = await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job(), "input", f.deps)
    expect(out.stopReason).toBe("error")
    expect(f.hire).toHaveBeenCalledTimes(1)
    expect(f.fetch).toHaveBeenCalledTimes(2)
  })

  it("checks final tool count before a multi-hire batch can buy anything", async () => {
    const f = fixture([response(message({ tool_calls: [
      call("hire_skill", { skillId: "child", input: {} }),
      call("hire_skill", { skillId: "other", input: {} }, "call_2")
    ] }))])
    const out = await runOpenAiApi(agent({ capabilities: ["hire-skills"] }), job({ maxToolCalls: 1 }), "input", f.deps)
    expect(out.stopReason).toBe("bounds_exceeded")
    expect(f.hire).not.toHaveBeenCalled()
    expect(out.usage.toolCalls).toBe(2)
  })

  it("bounds an oversized request before contacting a provider", async () => {
    const f = fixture([])
    const out = await runOpenAiApi(agent(), job(), "x".repeat(2 * 1024 * 1024), f.deps)
    expect(out.stopReason).toBe("error")
    expect(f.fetch).not.toHaveBeenCalled()
  })

  it("cancels a stalled response body when the job deadline expires", async () => {
    vi.useFakeTimers()
    try {
      const f = fixture([])
      const cancel = vi.fn()
      f.fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })))
      const result = runOpenAiApi(agent(), job({ timeoutSec: 1 }), "input", f.deps)
      await vi.advanceTimersByTimeAsync(1001)
      expect(await result).toMatchObject({ stopReason: "timeout" })
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(f.fetch).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it("doctor needs a manifest-granted key and never echoes it", async () => {
    expect(doctorOpenAi(agent(), {})).toMatchObject({ ok: false })
    expect(doctorOpenAi(agent(), env)).toMatchObject({ ok: true })
    expect(JSON.stringify(doctorOpenAi(agent(), env))).not.toContain(env.OPENAI_API_KEY)
  })

  it.each(["web-search", "web-fetch", "read-workdir", "write-workdir", "run-code"] as const)(
    "refuses unsupported %s before network access", async (capability) => {
      const f = fixture([])
      const out = await runOpenAiApi(agent({ capabilities: [capability] }), job(), "input", f.deps)
      expect(out.stopReason).toBe("error"); expect(f.fetch).not.toHaveBeenCalled()
      expect(doctorOpenAi(agent({ capabilities: [capability] }), env).ok).toBe(false)
    })

  it("refuses a subscription or an absent key before a request", async () => {
    for (const override of [{ credential: "subscription" as const }, {}]) {
      const f = fixture([])
      const out = await runOpenAiApi(agent(override), job(), "input", {
        ...f.deps, env: override.credential ? env : {}
      })
      expect(out.stopReason).toBe("error"); expect(f.fetch).not.toHaveBeenCalled()
    }
  })

  it.each([401, 429, 500, 302])("does not retry HTTP %s or return its body", async (status) => {
    const f = fixture([])
    f.fetch.mockResolvedValueOnce(new Response("PRIVATE_PROVIDER_ERROR", { status }))
    const out = await runOpenAiApi(agent(), job(), "input", f.deps)
    expect(out.stopReason).toBe("error"); expect(f.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(out)).not.toContain("PRIVATE_PROVIDER_ERROR")
  })

  it("bounds response bytes without returning raw response text", async () => {
    const f = fixture([])
    f.fetch.mockResolvedValueOnce(new Response("x".repeat(2 * 1024 * 1024 + 1)))
    const out = await runOpenAiApi(agent(), job(), "input", f.deps)
    expect(out.stopReason).toBe("error"); expect(out.output).toBeUndefined()
  })

  it("aborts a stalled request at the job deadline without a retry", async () => {
    vi.useFakeTimers()
    try {
      const f = fixture([])
      f.fetch.mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("PRIVATE_TIMEOUT")), { once: true })
      }))
      const result = runOpenAiApi(agent(), job({ timeoutSec: 1 }), "input", f.deps)
      await vi.advanceTimersByTimeAsync(1001)
      expect(await result).toMatchObject({ stopReason: "timeout" })
      expect(f.fetch).toHaveBeenCalledTimes(1)
      expect(f.requests).toHaveLength(0)
    } finally { vi.useRealTimers() }
  })
})
