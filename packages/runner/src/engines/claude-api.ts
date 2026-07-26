import Anthropic from "@anthropic-ai/sdk"
import type { Capability } from "@arcade/core"
import type { Engine, HarnessJob, JobEnvelope, SkillAgent } from "./types.js"

/**
 * Claude API engine — the seller's own API key, via the Messages tool runner.
 *
 * Commercial terms §A.1 permit using the API "to power products and services Customer
 * makes available to its own customers and end users", which is exactly what a paid skill
 * is: the buyer receives a work product, never model access.
 *
 * The completion contract is a `submit` tool whose input schema IS the manifest's
 * `outputSchema`, marked strict. "The agent decided it was done" and "the output has the
 * shape the buyer paid for" become the same event, and a run that ends without calling it
 * is an incomplete job rather than a cheap answer.
 */

// ── pricing, for the receipt ────────────────────────────────────────────────

/** USD per million tokens. Cache reads bill at 0.1x input, writes at 1.25x. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 }
}

/**
 * Server-side tool pricing, per call.
 *
 * These were unaccounted entirely, and they are not a rounding error: a skill permitting
 * 12 searches carries about $0.12 of invisible cost, which on `counterparty-brief` equalled
 * its ENTIRE cost ceiling and half its revenue. The seller's ceiling could not trip because
 * the spend it was meant to bound was not being measured.
 */
const SERVER_TOOL_USD: Record<string, number> = {
  web_search_requests: 0.01,
  web_fetch_requests: 0.01
}

interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  server_tool_use?: Record<string, number> | null
}

/** Raised when a model's price is unknown, so the ceiling fails closed rather than open. */
export class UnpricedModel extends Error {
  readonly _tag = "UnpricedModel"
  constructor(readonly model: string) {
    super(
      `no price known for "${model}", so maxCostUsd cannot be enforced. Add it to PRICING ` +
        `or remove the model override. Refusing to run a job whose cost ceiling would be ` +
        `silently inert.`
    )
  }
}

export const estimateCostUsd = (model: string, u: Usage): number => {
  const p = PRICING[model]
  // Fail closed. Returning 0 for an unknown model disabled `maxCostUsd` entirely — the
  // seller guide calls it "the bound that actually protects your margin", and a typo in a
  // model name silently removed it.
  if (p === undefined) throw new UnpricedModel(model)

  const tokens =
    ((u.input_tokens ?? 0) * p.input +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.input * 0.1 +
      (u.output_tokens ?? 0) * p.output) /
    1e6

  let tools = 0
  for (const [k, n] of Object.entries(u.server_tool_use ?? {})) {
    // An unknown server tool is priced at the highest known rate rather than zero: the
    // ceiling should over-estimate an unfamiliar cost, never ignore it.
    tools += (n ?? 0) * (SERVER_TOOL_USD[k] ?? Math.max(...Object.values(SERVER_TOOL_USD)))
  }

  return tokens + tools
}

/**
 * Every token the request was billed for. Summing raw counts slightly over-states cost —
 * cache reads bill at a tenth — which is the right direction for a margin guard: the bound
 * trips early rather than late.
 */
const billableTokens = (u: Usage): number =>
  (u.input_tokens ?? 0) +
  (u.output_tokens ?? 0) +
  (u.cache_creation_input_tokens ?? 0) +
  (u.cache_read_input_tokens ?? 0)

// ── strict-mode schema preparation ──────────────────────────────────────────

/**
 * Strict tool use requires `additionalProperties: false` on every object node. Sellers
 * write plain JSON Schema, so we add it rather than making them remember to.
 */
export const strictify = (schema: unknown): unknown => {
  if (schema === null || typeof schema !== "object") return schema
  if (Array.isArray(schema)) return schema.map(strictify)
  const node = schema as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) out[k] = strictify(v)
  if (node["type"] === "object" && out["additionalProperties"] === undefined) {
    out["additionalProperties"] = false
  }
  return out
}

// ── capability mapping ──────────────────────────────────────────────────────

/**
 * Portable capabilities to Claude API server tools.
 *
 * A closed mapping is a security property, not a convenience: a seller can only obtain a
 * tool by naming a capability, and capabilities this engine cannot satisfy safely are
 * simply absent rather than silently approximated.
 */
const toolsForCapabilities = (
  capabilities: ReadonlyArray<Capability>,
  allowedDomains: ReadonlyArray<string>,
  maxToolCalls: number | undefined
): Array<unknown> => {
  const tools: Array<unknown> = []
  const domains = allowedDomains.length > 0 ? { allowed_domains: [...allowedDomains] } : {}

  if (capabilities.includes("web-search")) {
    // The _20260209 variant filters results with code execution internally; declaring a
    // separate code_execution tool alongside it hands the model two sandboxes.
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      ...(maxToolCalls === undefined ? {} : { max_uses: maxToolCalls }),
      ...domains
    })
  }
  if (capabilities.includes("web-fetch")) {
    tools.push({
      type: "web_fetch_20260209",
      name: "web_fetch",
      ...(maxToolCalls === undefined ? {} : { max_uses: maxToolCalls }),
      ...domains
    })
  }
  if (capabilities.includes("run-code")) {
    tools.push({ type: "code_execution_20260521", name: "code_execution" })
  }
  // read-workdir / write-workdir have no server-side equivalent on this engine. They are
  // deliberately unmapped rather than approximated with code execution, which would grant
  // far more than the capability names.
  return tools
}

// ── the run ─────────────────────────────────────────────────────────────────

const REFUSAL_STOP_REASONS = new Set(["refusal"])

export const runClaudeApi = async (
  agent: SkillAgent,
  job: HarnessJob,
  prompt: string,
  client: Anthropic = new Anthropic()
): Promise<JobEnvelope> => {
  const model = agent.model ?? "claude-opus-5"
  const { bounds } = job

  // Checked before a token is spent: if the ceiling cannot be enforced, the job must not
  // start. A bound that silently does nothing is worse than no bound, because the seller
  // priced their listing believing it was there.
  if (bounds.maxCostUsd !== undefined && PRICING[model] === undefined) {
    return {
      stopReason: "rejected",
      usage: { turns: 0, tokens: 0, toolCalls: 0 },
      costUsd: 0,
      error: new UnpricedModel(model).message
    }
  }
  const totals = { turns: 0, tokens: 0, toolCalls: 0 }
  let costUsd = 0
  let submitted: unknown
  let breach: string | undefined

  const abort = new AbortController()

  const submitTool = {
    type: "custom" as const,
    name: "submit",
    description:
      "Return the final result. Call this exactly once, when the answer is complete. " +
      "The arguments are the result the caller receives.",
    input_schema: (agent.strictOutput === false
      ? job.outputSchema
      : strictify(job.outputSchema)) as Anthropic.Beta.BetaTool["input_schema"],
    ...(agent.strictOutput === false ? {} : { strict: true })
  }

  const tools = [
    submitTool,
    ...toolsForCapabilities(
      agent.capabilities ?? [],
      agent.allowedDomains ?? [],
      bounds.maxToolCalls
    )
  ]

  const runner = client.beta.messages.toolRunner({
    model,
    // Per-response ceiling. Thinking shares this budget with the response text, so a tight
    // value truncates mid-answer rather than saving money.
    max_tokens: agent.maxTokensPerTurn ?? 16000,
    output_config: { effort: agent.effort ?? "medium" },
    system: agent.systemPrompt,
    tools: tools as never,
    ...(bounds.maxTurns === undefined ? {} : { max_iterations: bounds.maxTurns }),
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
  })
  runner.setRequestOptions({ signal: abort.signal })

  let lastStopReason: string | undefined

  try {
    for await (const message of runner as AsyncIterable<Anthropic.Beta.BetaMessage>) {
      totals.turns += 1
      const u = (message.usage ?? {}) as unknown as Usage
      totals.tokens += billableTokens(u)
      costUsd += estimateCostUsd(model, u)
      lastStopReason = message.stop_reason ?? undefined

      // A declined request is a 200 with an empty or partial body. Checking stop_reason
      // before reading content is the difference between reporting a refusal and charging
      // for one.
      if (message.stop_reason !== null && REFUSAL_STOP_REASONS.has(message.stop_reason)) {
        const details = message.stop_details as { category?: string } | null | undefined
        return {
          stopReason: details?.category ? `refusal:${details.category}` : "refusal",
          usage: totals,
          costUsd
        }
      }

      for (const block of message.content) {
        if (block.type !== "tool_use") continue
        totals.toolCalls += 1
        if (block.name === "submit") submitted = block.input
      }

      if (submitted !== undefined) break

      // Cost first: a run can sit under every token bound and still cost more than the
      // call earns.
      if (bounds.maxCostUsd !== undefined && costUsd > bounds.maxCostUsd) {
        breach = `maxCostUsd > $${bounds.maxCostUsd} (spent $${costUsd.toFixed(4)})`
      } else if (bounds.maxTokens !== undefined && totals.tokens > bounds.maxTokens) {
        breach = `maxTokens > ${bounds.maxTokens}`
      } else if (bounds.maxToolCalls !== undefined && totals.toolCalls > bounds.maxToolCalls) {
        breach = `maxToolCalls > ${bounds.maxToolCalls}`
      }
      if (breach !== undefined) {
        abort.abort()
        break
      }

      // A server tool that exhausts its internal iteration budget stops the turn with
      // `pause_turn`. The runner does not resume it: without this the loop ends quietly
      // and a half-finished answer looks like a complete one.
      if (message.stop_reason === "pause_turn") {
        runner.pushMessages({ role: "assistant", content: message.content })
      }
    }
  } catch (e) {
    if (breach === undefined) {
      return {
        stopReason: "error",
        usage: totals,
        costUsd,
        error: String((e as Error)?.message ?? e)
      }
    }
  }

  if (breach !== undefined) {
    return { stopReason: "bounds_exceeded", usage: totals, costUsd, error: breach }
  }
  if (submitted === undefined) {
    return {
      stopReason: lastStopReason === "end_turn" ? "incomplete" : (lastStopReason ?? "incomplete"),
      usage: totals,
      costUsd,
      error: "agent ended without calling submit"
    }
  }
  return { output: submitted, stopReason: "end_turn", usage: totals, costUsd }
}

export const claudeApiEngine: Engine = {
  adapter: "claude-api",
  run: (agent, job, prompt) => runClaudeApi(agent, job, prompt),
  // Nothing. Calling an HTTP API needs no part of the seller's machine, and the key
  // itself arrives through the manifest's `secrets` like every other credential — one
  // rule, visible in `arcade publish`, rather than an engine quietly widening the
  // environment on the seller's behalf.
  envGrants: () => [],
  doctor: async (agent) => {
    if (agent.credential === "subscription") {
      return {
        ok: false,
        detail: "claude-api authenticates with an API key; it has no subscription mode"
      }
    }
    const has =
      process.env["ANTHROPIC_API_KEY"] !== undefined ||
      process.env["ANTHROPIC_AUTH_TOKEN"] !== undefined
    return {
      ok: has,
      detail: has
        ? "ANTHROPIC_API_KEY present"
        : "no ANTHROPIC_API_KEY — declare it in the manifest's `secrets` and export it"
    }
  }
}
