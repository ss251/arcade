import { query } from "@anthropic-ai/claude-agent-sdk"
import { homedir } from "node:os"
import { resolve } from "node:path"
import type { Capability } from "@arcade/core"
import type { Engine, HarnessJob, JobEnvelope, SkillAgent } from "./types.js"

/**
 * Claude Agent SDK engine.
 *
 * The Agent SDK is Claude Code as a library, and it authenticates against **either** an
 * API key or a personal subscription seat. That fork is the whole reason `credential` is
 * a first-class field rather than an implementation detail:
 *
 *   `api-key`       commercial terms — may power a product sold to end users. Publishable.
 *   `subscription`  consumer terms — forbid resale, forbid making the account available to
 *                   others, and forbid non-interactive access outside an API key. Runs
 *                   locally for the seller's own agents; `assertPublishable` refuses to
 *                   list it.
 *
 * Everything else about the engine is identical between the two, which is what makes the
 * restriction tolerable: a seller who starts on their seat and later wants to sell changes
 * one field, not their agent.
 *
 * ## Three measured facts this file encodes
 *
 * 1. **`allowedTools: []` does not mean "no tools".** The default toolset still loads —
 *    Bash, Read, Write, Edit included — leaving safety to rest on the permission mode
 *    refusing each call. `disallowedTools` removes them from the request instead. On one
 *    job this also cut the per-call cache write from 34,481 tokens to 619.
 *
 * 2. **Omitting `settingSources` loads everything.** The seller's settings, the project's,
 *    any CLAUDE.md, and the MCP servers declared by whatever directory the runner started
 *    in — network egress nobody granted, at five times the cost (17,338 cache-write tokens
 *    against 843). Isolation mode is `[]`.
 *
 * 3. **`claude` on PATH may be a wrapper.** Editor and multiplexer integrations install a
 *    shim that depends on their environment and reports "Not logged in" under a scrubbed
 *    one. Omitting `pathToClaudeCodeExecutable` uses the SDK's bundled binary, which is
 *    the safe default.
 */

// ── seat resolution (subscription mode only) ────────────────────────────────

/**
 * The marketplace seat, deliberately separate from the seller's everyday config directory:
 * credentials are keyed per config directory, and that directory also carries hooks, MCP
 * servers and skills that have no business inside a job.
 */
export const seatDir = (): string =>
  process.env["ARCADE_SEAT_DIR"] ?? resolve(homedir(), ".arcade", "seat")

export const claudeBinary = (): string | undefined => process.env["ARCADE_CLAUDE_BIN"]

export const resolveClaudeBinary = async (): Promise<string> => {
  const pinned = claudeBinary()
  if (pinned !== undefined) return pinned
  const canonical = resolve(homedir(), ".local", "bin", "claude")
  return (await Bun.file(canonical).exists()) ? canonical : "claude"
}

/**
 * Whether the marketplace seat has a credential.
 *
 * Runs a real one-turn prompt: the credential lives in the OS keychain under a service
 * name derived from the config directory, so neither a file check nor a keychain scan can
 * answer it honestly.
 */
export const seatIsLoggedIn = async (): Promise<boolean> => {
  const bin = await resolveClaudeBinary()
  const proc = Bun.spawn([bin, "-p", "ok", "--max-turns", "1"], {
    env: {
      PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      HOME: process.env["HOME"] ?? homedir(),
      ...(process.env["USER"] === undefined ? {} : { USER: process.env["USER"] }),
      CLAUDE_CONFIG_DIR: seatDir()
    },
    stdout: "pipe",
    stderr: "pipe"
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  await proc.exited
  return !/not logged in|\/login/i.test(`${out}${err}`)
}

// ── tool surface ────────────────────────────────────────────────────────────

/**
 * Claude Code's built-in tools, denied unless a capability asks for them.
 *
 * Over-specifying is free — denying a tool that does not exist is a no-op — so this list
 * errs long. It can still go stale in the other direction, which is what
 * `unexpectedTools` reports.
 */
export const BUILT_IN_TOOLS = [
  "Agent", "Bash", "BashOutput", "CronCreate", "CronDelete", "CronList", "DesignSync",
  "Edit", "EnterPlanMode", "EnterWorktree", "ExitPlanMode", "ExitWorktree", "Glob",
  "Grep", "KillShell", "LSP", "ListMcpResourcesTool", "Monitor", "MultiEdit",
  "NotebookEdit", "NotebookRead", "PushNotification", "Read", "ReadMcpResourceTool",
  "RemoteTrigger", "ReportFindings", "ScheduleWakeup", "SendMessage", "SendUserFile",
  "Skill", "SlashCommand", "Task", "TaskCreate", "TaskGet", "TaskList", "TaskOutput",
  "TaskStop", "TaskUpdate", "TodoWrite", "ToolSearch", "WebFetch", "WebSearch",
  "Workflow", "Write"
] as const

/** The tool that delivers `outputFormat`. Denying it would break the output contract. */
const OUTPUT_TOOL = "StructuredOutput"

/** Portable capabilities to Claude Code tool names. A closed mapping, by design. */
const CAPABILITY_TOOLS: Record<Capability, ReadonlyArray<string>> = {
  "web-search": ["WebSearch"],
  "web-fetch": ["WebFetch"],
  "read-workdir": ["Read", "Glob", "Grep"],
  "write-workdir": ["Read", "Glob", "Grep", "Write", "Edit"],
  "run-code": ["Bash", "BashOutput", "KillShell"],
  // Deliberately empty. Hiring is not a built-in tool: it is `hire()` from
  // `@arcade/buyer`, supplied by the seller's own agent module as a client-side tool. The
  // capability still has to be declared, because that is what makes the runner grant the
  // sub-purchase wallet into the sandbox and what shows a buyer, in the published
  // listing, that this skill subcontracts.
  "hire-skills": []
}

export const toolsForCapabilities = (
  capabilities: ReadonlyArray<Capability>
): Array<string> => [...new Set(capabilities.flatMap((c) => CAPABILITY_TOOLS[c] ?? []))]

export const denyList = (allowed: ReadonlyArray<string>): Array<string> => {
  const keep = new Set<string>([...allowed, OUTPUT_TOOL])
  return BUILT_IN_TOOLS.filter((t) => !keep.has(t))
}

/**
 * Tools that loaded without being asked for.
 *
 * The deny list is a snapshot and a future release can add a tool it does not name. This
 * turns that from a silent widening into a line in the seller's job log.
 */
export const unexpectedTools = (
  loaded: ReadonlyArray<string>,
  allowed: ReadonlyArray<string>
): Array<string> => {
  const expected = new Set<string>([...allowed, OUTPUT_TOOL])
  return loaded.filter((t) => !expected.has(t))
}

// ── the run ─────────────────────────────────────────────────────────────────

interface SeatResult {
  type?: string
  subtype?: string
  tools?: Array<string>
  structured_output?: unknown
  stop_reason?: string | null
  num_turns?: number
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number }
  errors?: Array<string>
}

const BOUNDS_SUBTYPES: Record<string, string> = {
  error_max_turns: "maxTurns",
  error_max_budget_usd: "maxCostUsd"
}

export const runClaudeAgent = async (
  agent: SkillAgent,
  job: HarnessJob,
  prompt: string,
  runQuery: typeof query = query
): Promise<JobEnvelope> => {
  const { bounds } = job
  const totals = { turns: 0, tokens: 0, toolCalls: 0 }
  const allowed = toolsForCapabilities(agent.capabilities ?? [])

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), bounds.timeoutSec * 1000)

  // Subscription mode needs the real HOME to reach the keychain; API-key mode needs
  // neither that nor a seat directory, which is one more reason it is the default.
  const seatEnv =
    agent.credential === "subscription" ? { CLAUDE_CONFIG_DIR: seatDir() } : {}

  try {
    const stream = runQuery({
      prompt,
      options: {
        systemPrompt: agent.systemPrompt,
        ...(agent.model === undefined ? {} : { model: agent.model }),

        // The manifest's own schema is the output contract, so "the agent finished" and
        // "the buyer got the shape they paid for" are the same event.
        outputFormat: { type: "json_schema", schema: job.outputSchema as Record<string, unknown> },

        // Both ceilings are the SDK's to enforce, against real cost rather than an
        // estimate. A breach returns as a terminal subtype — or, sometimes, throws.
        ...(bounds.maxTurns === undefined ? {} : { maxTurns: bounds.maxTurns }),
        ...(bounds.maxCostUsd === undefined ? {} : { maxBudgetUsd: bounds.maxCostUsd }),

        // Default-deny by absence, not refusal.
        permissionMode: "dontAsk",
        allowedTools: allowed,
        disallowedTools: denyList(allowed),

        // Isolation mode: no seller settings, no CLAUDE.md, no ambient MCP servers.
        settingSources: [],

        // Pin the working directory to the skill so a job's tool surface never depends on
        // where the seller happened to launch the runner.
        cwd: agent.workdir === undefined ? job.skillDir : resolve(job.skillDir, agent.workdir),

        env: { ...process.env, ...seatEnv },
        ...(claudeBinary() === undefined ? {} : { pathToClaudeCodeExecutable: claudeBinary()! }),

        abortController: abort
      }
    })

    let result: SeatResult | undefined
    for await (const message of stream as AsyncIterable<SeatResult>) {
      if (message.type === "system" && message.subtype === "init") {
        const extra = unexpectedTools(message.tools ?? [], allowed)
        if (extra.length > 0) {
          process.stderr.write(`sandbox: unexpected tools loaded: ${extra.join(", ")}\n`)
        }
      }
      if (message.type === "result") result = message
    }

    if (result === undefined) {
      return { stopReason: "error", usage: totals, costUsd: 0, error: "engine produced no result" }
    }

    totals.turns = result.num_turns ?? 0
    totals.tokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0)
    const costUsd = result.total_cost_usd ?? 0

    // Before the subtype: a refusal is the model declining, not the harness failing.
    if (result.stop_reason === "refusal") {
      return { stopReason: "refusal", usage: totals, costUsd }
    }

    const bound = result.subtype === undefined ? undefined : BOUNDS_SUBTYPES[result.subtype]
    if (bound !== undefined) {
      return {
        stopReason: "bounds_exceeded",
        usage: totals,
        costUsd,
        error: `${bound} reached (spent $${costUsd.toFixed(4)})`
      }
    }

    if (result.subtype !== "success") {
      return {
        stopReason: "error",
        usage: totals,
        costUsd,
        error: result.errors?.join("; ") ?? result.subtype ?? "run failed"
      }
    }

    // An agent that finished without structured output has not produced the thing the
    // listing sells. Falling back to its prose would settle a near-miss.
    if (result.structured_output === undefined) {
      return {
        stopReason: "incomplete",
        usage: totals,
        costUsd,
        error: "run completed without structured output"
      }
    }

    return { output: result.structured_output, stopReason: "end_turn", usage: totals, costUsd }
  } catch (e) {
    if (abort.signal.aborted) {
      return { stopReason: "timeout", usage: totals, costUsd: 0, error: `exceeded ${bounds.timeoutSec}s` }
    }
    // A ceiling can arrive as a thrown error rather than a terminal subtype. Reporting
    // that as a generic failure would hide the one outcome a seller most needs to see.
    const message = String((e as Error)?.message ?? e)
    if (/maximum budget|max budget/i.test(message)) {
      return { stopReason: "bounds_exceeded", usage: totals, costUsd: bounds.maxCostUsd ?? 0, error: message }
    }
    if (/maximum number of turns|max turns/i.test(message)) {
      return { stopReason: "bounds_exceeded", usage: totals, costUsd: 0, error: message }
    }
    return { stopReason: "error", usage: totals, costUsd: 0, error: message }
  } finally {
    clearTimeout(timer)
  }
}

export const claudeAgentEngine: Engine = {
  adapter: "claude-agent",
  run: (agent, job, prompt) => runClaudeAgent(agent, job, prompt),
  envGrants: (agent) =>
    agent.credential === "subscription"
      ? // The seat credential is in the login keychain, reachable only with the real HOME.
        // This lane widens the environment; what makes that safe is that the tool surface
        // is closed, so a job with a readable filesystem has nothing to read it with.
        // These are mechanics, not credentials — an API key still arrives via `secrets`.
        ["HOME", "USER", "ARCADE_SEAT_DIR", "ARCADE_CLAUDE_BIN"]
      : [],
  doctor: async (agent) => {
    if (agent.credential === "subscription") {
      const ok = await seatIsLoggedIn()
      return {
        ok,
        detail: ok
          ? `seat ${seatDir()} is logged in (local use only — not publishable)`
          : `seat ${seatDir()} has no credential: CLAUDE_CONFIG_DIR=${seatDir()} claude, then /login`
      }
    }
    const has =
      process.env["ANTHROPIC_API_KEY"] !== undefined ||
      process.env["ANTHROPIC_AUTH_TOKEN"] !== undefined
    return {
      ok: has,
      detail: has ? "ANTHROPIC_API_KEY present" : "no ANTHROPIC_API_KEY in the sandbox environment"
    }
  }
}
