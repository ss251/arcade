#!/usr/bin/env bun
/**
 * Lane A engine harness — the Claude API, running on the seller's own machine.
 *
 * This file is SPAWNED AS A CHILD PROCESS by `exec.ts`, never imported into the daemon.
 * That is deliberate and load-bearing: the child's environment is built from scratch and
 * contains only the variables the manifest declares in `secrets`, so the seller's other
 * credentials are absent rather than merely unused. Running the SDK in-process would hand
 * every job the daemon's full environment and quietly void that guarantee.
 *
 * ## Why the Claude API and not the Claude Agent SDK
 *
 * The Agent SDK is Claude Code packaged as a library: it ships Bash, Read, Write and Edit.
 * A paid marketplace endpoint needs the opposite of that — a bounded run that returns one
 * schema-valid object — and handing filesystem and shell access to a sandboxed job is a
 * liability, not a feature. The API's tool runner gives us what the product actually
 * requires: `max_iterations`, per-turn usage accounting, strict tool schemas, and a
 * `stop_reason` that distinguishes a refusal from an answer.
 *
 * ## Why bounds are enforced here rather than in the caller
 *
 * D1 exists so a variable-cost agent run cannot go margin-negative. Checking usage after
 * the process exits detects the breach only once the seller has already paid for every
 * token — full API bill, and (per D2) no settlement to offset it. So the ceiling is applied
 * mid-loop: token and tool-call budgets abort the run through an `AbortSignal`, and turns
 * are capped by the runner itself.
 *
 * ## Completion contract
 *
 * The agent finishes by calling `submit`, whose input schema IS the manifest's
 * `outputSchema`. `strict: true` makes the API guarantee those arguments validate, so
 * "the agent decided it was done" and "the output has the shape the buyer paid for" are
 * the same event. Running out of turns without calling `submit` is an incomplete job, not
 * a cheap answer — and D2 declines to settle it.
 *
 * protocol — stdin:  {jobId, input, bounds, outputSchema}
 *            stdout: {output, stopReason, usage:{turns,tokens,toolCalls}, costUsd}
 *            stderr: logs (relayed to the hub; never contains secrets)
 */

import Anthropic from "@anthropic-ai/sdk"
import { resolve } from "node:path"

// ── the seller's half ───────────────────────────────────────────────────────

/**
 * What a lane-A skill's entry module must default-export. Every field here stays on the
 * seller's machine: `PublicListing` has nowhere to put a system prompt or a tool.
 */
export interface AgentDefinition {
  /** Defaults to Claude Opus 5 — the most capable model, and the seller pays for it. */
  readonly model?: string
  /**
   * Thinking depth. Defaults to "medium": on Opus 5 the low and medium levels are
   * unusually strong, and a per-call endpoint priced in cents is exactly the case where
   * that matters. Sellers running harder skills can raise it.
   */
  readonly effort?: "low" | "medium" | "high" | "xhigh" | "max"
  readonly systemPrompt: string
  /** Per-response output ceiling. Note this caps thinking + text together on Opus 5. */
  readonly maxTokensPerTurn?: number
  /** Server-side web search. Omit for skills that must not reach the network. */
  readonly webSearch?: {
    readonly maxUses?: number
    readonly allowedDomains?: ReadonlyArray<string>
  }
  /** Client-side tools, built with `betaTool`. These run in this sandbox, on this machine. */
  readonly tools?: ReadonlyArray<unknown>
  /**
   * Set false when the output schema uses keywords strict mode rejects (`minLength`,
   * numeric bounds). The hub still validates the output against the full schema, so this
   * trades an API-level guarantee for schema expressiveness — it never weakens D2.
   */
  readonly strictOutput?: boolean
}

// ── pricing (for the receipt, not for the bound) ────────────────────────────

/** USD per million tokens. Cache reads bill at 0.1x input, cache writes at 1.25x. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 }
}

interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

const estimateCostUsd = (model: string, u: Usage): number => {
  const p = PRICING[model]
  if (p === undefined) return 0
  const input = u.input_tokens ?? 0
  const write = u.cache_creation_input_tokens ?? 0
  const read = u.cache_read_input_tokens ?? 0
  const output = u.output_tokens ?? 0
  return (input * p.input + write * p.input * 1.25 + read * p.input * 0.1 + output * p.output) / 1e6
}

/**
 * Every token the request was billed for. Summing raw counts over-states cost slightly
 * (cache reads bill at a tenth), which is the correct direction for a margin guard: the
 * bound trips early rather than late.
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

// ── the run ─────────────────────────────────────────────────────────────────

export interface HarnessInput {
  readonly jobId: string
  readonly input: unknown
  readonly bounds: {
    readonly maxTurns?: number
    readonly maxTokens?: number
    readonly maxToolCalls?: number
    readonly maxCostUsd?: number
    readonly timeoutSec: number
  }
  readonly outputSchema: unknown
}

export interface HarnessEnvelope {
  readonly output?: unknown
  readonly stopReason?: string
  readonly usage: { turns: number; tokens: number; toolCalls: number }
  readonly costUsd: number
  readonly error?: string
}

/** Refusal categories that mean "the model declined", as distinct from "the model failed". */
const REFUSAL_STOP_REASONS = new Set(["refusal"])

export const runAgent = async (
  agent: AgentDefinition,
  job: HarnessInput,
  client: Anthropic
): Promise<HarnessEnvelope> => {
  const model = agent.model ?? "claude-opus-5"
  const { bounds } = job

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

  const tools: Array<unknown> = [submitTool, ...(agent.tools ?? [])]
  if (agent.webSearch !== undefined) {
    // The _20260209 variant filters results with code execution internally — declaring a
    // separate code_execution tool alongside it gives the model two sandboxes and confuses it.
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      ...(agent.webSearch.maxUses === undefined ? {} : { max_uses: agent.webSearch.maxUses }),
      ...(agent.webSearch.allowedDomains === undefined
        ? {}
        : { allowed_domains: [...agent.webSearch.allowedDomains] })
    })
  }

  const runner = client.beta.messages.toolRunner({
    model,
    // Per-response ceiling. On Opus 5 thinking is on by default and shares this budget with
    // the response text, so a tight value truncates mid-answer rather than saving money.
    max_tokens: agent.maxTokensPerTurn ?? 16000,
    output_config: { effort: agent.effort ?? "medium" },
    system: agent.systemPrompt,
    tools: tools as never,
    ...(bounds.maxTurns === undefined ? {} : { max_iterations: bounds.maxTurns }),
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: JSON.stringify(job.input) }]
      }
    ]
  })
  runner.setRequestOptions({ signal: abort.signal })

  let lastStopReason: string | undefined

  try {
    for await (const message of runner as AsyncIterable<Anthropic.Beta.BetaMessage>) {
      totals.turns += 1
      const u = (message.usage ?? {}) as Usage
      totals.tokens += billableTokens(u)
      costUsd += estimateCostUsd(model, u)
      lastStopReason = message.stop_reason ?? undefined

      // A declined request is a 200 with an empty or partial body — checking stop_reason
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
        if (block.name === "submit") {
          submitted = block.input
        }
      }

      if (submitted !== undefined) break

      // Checked before the cheaper ceilings because it is the one that actually protects
      // the seller: a run can sit comfortably under every token bound and still cost more
      // than the call earns.
      if (bounds.maxCostUsd !== undefined && costUsd > bounds.maxCostUsd) {
        breach = `maxCostUsd > $${bounds.maxCostUsd} (spent $${costUsd.toFixed(4)})`
        abort.abort()
        break
      }
      if (bounds.maxTokens !== undefined && totals.tokens > bounds.maxTokens) {
        breach = `maxTokens > ${bounds.maxTokens}`
        abort.abort()
        break
      }
      if (bounds.maxToolCalls !== undefined && totals.toolCalls > bounds.maxToolCalls) {
        breach = `maxToolCalls > ${bounds.maxToolCalls}`
        abort.abort()
        break
      }

      // A server-side tool that exhausts its internal iteration budget stops the turn with
      // `pause_turn`. The runner does not resume it on its own: without this the loop ends
      // quietly and a half-finished answer looks like a complete one.
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
      stopReason: lastStopReason ?? "incomplete",
      usage: totals,
      costUsd,
      error: "agent ended without calling submit"
    }
  }
  return { output: submitted, stopReason: "end_turn", usage: totals, costUsd }
}

// ── entry point ─────────────────────────────────────────────────────────────

const main = async () => {
  const arg = process.argv[2]
  if (arg === undefined) throw new Error("usage: claude-api.ts <entry-module>")
  // `import()` resolves a bare relative path against THIS module, not the working
  // directory, which would look for the seller's agent inside the runner package.
  const entry = resolve(process.cwd(), arg)

  const raw = await new Response(Bun.stdin.stream()).text()
  const job = JSON.parse(raw) as HarnessInput

  const mod = (await import(entry)) as { default?: AgentDefinition }
  const agent = mod.default
  if (agent === undefined || typeof agent.systemPrompt !== "string") {
    throw new Error(`${entry} must default-export an AgentDefinition with a systemPrompt`)
  }

  if (!process.env["ANTHROPIC_API_KEY"] && !process.env["ANTHROPIC_AUTH_TOKEN"]) {
    throw new Error(
      "no Anthropic credential in the sandbox environment — declare ANTHROPIC_API_KEY in " +
        "the manifest's `secrets` so the runner passes it through"
    )
  }

  const envelope = await runAgent(agent, job, new Anthropic())
  process.stdout.write(JSON.stringify(envelope))
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    // stdout stays pure JSON so the parent can always parse an outcome; diagnostics go to
    // stderr, which the hub relays as job logs.
    process.stderr.write(`${String((e as Error)?.stack ?? e)}\n`)
    process.stdout.write(
      JSON.stringify({
        stopReason: "error",
        usage: { turns: 0, tokens: 0, toolCalls: 0 },
        costUsd: 0,
        error: String((e as Error)?.message ?? e)
      } satisfies HarnessEnvelope)
    )
    process.exit(1)
  })
}
