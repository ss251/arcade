import { afterEach, describe, expect, it, vi } from "vitest"
import { generateText, stepCountIs } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { READ_ONLY_TOOLS } from "../src/lib/tools.ts"

/**
 * The half `createChat` structurally cannot cover.
 *
 * Scripted conversations prove the UI renders, streams and anchors. They prove nothing
 * about whether a model can SELECT the right tool, whether its arguments decode, or
 * whether a tool result produces a follow-up answer instead of silence — all of which
 * need a model that actually emits tool calls. `MockLanguageModelV4` is one, without a
 * network or a key.
 *
 * The distinction matters because "we verified the chat works" would otherwise be read as
 * covering both, and the two halves fail differently: a render bug is visible, a wiring
 * bug looks like a model being unhelpful.
 */

const HUB = "http://hub.test"
process.env["ARCADE_HUB"] = HUB

const LISTING = {
  id: "diff-triage",
  serviceName: "Diff Triage",
  description: "Triage a code diff.",
  price: "$0.12",
  seller: "0x1111111111111111111111111111111111111111"
}

const stubHub = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const body = url.includes("/listings/")
        ? { ...LISTING, inputSchema: {}, outputSchema: {} }
        : [LISTING]
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )

afterEach(() => vi.unstubAllGlobals())

/** A model that calls one tool on its first turn, then answers with text. */
const modelCalling = (toolName: string, input: unknown) => {
  let turn = 0
  return new MockLanguageModelV4({
    doGenerate: async () => {
      turn += 1
      return turn === 1
        ? {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call_1",
                toolName,
                input: JSON.stringify(input)
              }
            ],
            finishReason: "tool-calls" as const,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            warnings: []
          }
        : {
            content: [{ type: "text" as const, text: "Two skills are listed." }],
            finishReason: "stop" as const,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            warnings: []
          }
    }
  })
}

const run = (model: MockLanguageModelV4) =>
  generateText({
    model,
    prompt: "what's for sale?",
    tools: READ_ONLY_TOOLS,
    stopWhen: stepCountIs(6)
  })

describe("tool calls — a model that actually selects a tool", () => {
  it("executes the selected tool and reaches the hub", async () => {
    stubHub()
    const model = modelCalling("arcade_list_skills", {})
    const result = await run(model)

    const calls = result.steps.flatMap((s) => s.toolCalls)
    expect(calls.map((c) => c.toolName)).toContain("arcade_list_skills")
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled()
  })

  /**
   * `stopWhen` defaults to stopping after one step, which reads to a user as the model
   * going silent immediately after a lookup — the tool result arrives and nothing is said
   * about it. This asserts the configured multi-step behaviour, not the default.
   */
  it("produces a follow-up answer after the tool result, rather than going quiet", async () => {
    stubHub()
    const model = modelCalling("arcade_list_skills", {})
    const result = await run(model)

    expect(result.steps.length).toBeGreaterThan(1)
    expect(result.text).toContain("Two skills are listed.")
    // Two model turns: one to call, one to answer. A single turn means it stopped early.
    expect(model.doGenerateCalls.length).toBeGreaterThan(1)
  })

  it("carries the fenced catalogue into the tool result", async () => {
    // The security property, verified through the real tool-execution path rather than by
    // calling `execute` directly: whatever a model receives after selecting this tool must
    // have the seller's prose inside a fence.
    stubHub()
    const result = await run(modelCalling("arcade_list_skills", {}))
    const outputs = result.steps.flatMap((s) => s.toolResults).map((r) => JSON.stringify(r.output))
    expect(outputs.join("\n")).toMatch(/<<<UNTRUSTED:[0-9a-f]+>>>/)
  })

  it("decodes arguments and refuses a malformed one", async () => {
    // `skillId` is a string. A model emitting a number must not have it coerced silently
    // into a URL path — the schema is the contract, and this is the path where a wrong
    // argument would otherwise become a 404 the agent has to guess at.
    stubHub()
    const result = await run(modelCalling("arcade_describe_skill", { skillId: 42 }))
    const errored = result.steps.flatMap((s) => s.content).filter((c) => c.type === "tool-error")
    expect(errored.length).toBeGreaterThan(0)
  })

  it("passes a well-formed argument through to the hub", async () => {
    // The inverse — a validator that rejected everything would pass the test above.
    stubHub()
    const result = await run(modelCalling("arcade_describe_skill", { skillId: "diff-triage" }))
    const errored = result.steps.flatMap((s) => s.content).filter((c) => c.type === "tool-error")
    expect(errored).toHaveLength(0)
    const urls = vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes("/listings/diff-triage"))).toBe(true)
  })
})
