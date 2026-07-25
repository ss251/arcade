#!/usr/bin/env bun
/**
 * Lane B engine harness — the seller's own Claude Code seat.
 *
 * This is the lane the product was named for: idle subscription capacity, sold per call.
 * It is spawned as a child process by `exec.ts`, same as lane A.
 *
 * ## Why the Agent SDK here, and not in lane A
 *
 * The Claude Agent SDK is Claude Code packaged as a library, so it authenticates against a
 * subscription seat rather than API credits. That makes it wrong for lane A — which wants
 * a strict schema and an API-billed ceiling — and exactly right here. It also enforces
 * both ceilings natively and more accurately than lane A can: `maxBudgetUsd` is checked
 * against the SDK's own cost accounting, not an estimate derived from a pricing table.
 *
 * ## Three things that are not obvious, and each of which breaks this silently
 *
 * 1. **`claude` on PATH may be a wrapper.** Editor and multiplexer integrations install a
 *    shim that depends on their own environment and reports "Not logged in" under a
 *    scrubbed one. A sandboxed job has to reach the real binary.
 *
 * 2. **Credentials are keyed per config directory.** The macOS keychain service is
 *    `Claude Code-credentials-<hash of config dir>`, so a fresh `CLAUDE_CONFIG_DIR` is not
 *    a view onto the existing login — it is a separate seat that must be logged into once.
 *
 * 3. **The config directory carries far more than credentials.** Pointing this at the
 *    seller's everyday `~/.claude` would execute their personal hooks and load their MCP
 *    servers and skills inside a stranger's paid job. The seat is deliberately its own
 *    directory for that reason, not for tidiness.
 *
 * ## The isolation trade, stated plainly
 *
 * Lane B is weaker than lane A here, and it is better to say so than to imply otherwise.
 * The seat credential lives in the login keychain, which the child can only reach with the
 * real `HOME` — so unlike lane A, the sandbox environment is widened rather than built
 * from nothing. The mitigation is that the widening is inert: `permissionMode: "dontAsk"`
 * denies every tool the seller has not named, so an agent with a readable filesystem has
 * no tool with which to read it. A seat skill that declares no tools cannot touch the disk
 * at all.
 *
 * protocol — stdin:  {jobId, input, bounds, outputSchema}
 *            stdout: {output, stopReason, usage:{turns,tokens,toolCalls}, costUsd}
 */

import { query } from "@anthropic-ai/claude-agent-sdk"
import { homedir } from "node:os"
import { resolve } from "node:path"
import type { HarnessEnvelope, HarnessInput } from "./claude-api.js"

// ── the seller's half ───────────────────────────────────────────────────────

/** What a lane-B skill's entry module must default-export. Never leaves this machine. */
export interface SeatAgentDefinition {
  readonly systemPrompt: string
  /** Defaults to the seat's own default model. */
  readonly model?: string
  /**
   * Tools the job may use. Empty — the default — means none: with `dontAsk`, anything not
   * named here is denied. Name only what the skill genuinely needs; every entry widens
   * what a prompt-injected input could reach.
   */
  readonly allowedTools?: ReadonlyArray<string>
  /** Working directory for the job, relative to the skill dir. Defaults to the skill dir. */
  readonly workdir?: string
}

// ── seat resolution ─────────────────────────────────────────────────────────

/**
 * The marketplace seat. Separate from the seller's everyday config directory on purpose:
 * separate credentials, and none of their hooks, MCP servers or skills.
 */
export const seatDir = (): string =>
  process.env["ARCADE_SEAT_DIR"] ?? resolve(homedir(), ".arcade", "seat")

/**
 * The real Claude Code binary.
 *
 * `which claude` is not trustworthy inside a sandbox: editor and multiplexer integrations
 * put a wrapper on PATH that needs their environment and fails closed without it. Omitting
 * this lets the SDK use its own bundled executable, which is the safest default; the
 * override exists for sellers who pin a specific install.
 */
export const claudeBinary = (): string | undefined => process.env["ARCADE_CLAUDE_BIN"]

/**
 * Best-effort path to a real (unwrapped) Claude Code binary, for setup checks.
 *
 * Prefers the canonical install location over whatever `claude` resolves to on PATH,
 * because a wrapper there will report "Not logged in" under a clean environment and turn
 * a working seat into a confusing setup failure.
 */
export const resolveClaudeBinary = async (): Promise<string> => {
  const pinned = claudeBinary()
  if (pinned !== undefined) return pinned
  const canonical = resolve(homedir(), ".local", "bin", "claude")
  return (await Bun.file(canonical).exists()) ? canonical : "claude"
}

/**
 * Whether the marketplace seat has a credential.
 *
 * This runs a real one-turn prompt, because there is no free way to ask: the credential
 * lives in the OS keychain under a service name derived from the config directory, so
 * neither a file check nor a keychain scan can answer it honestly. The cost is a fraction
 * of a cent on a command sellers run at setup.
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

// ── the run ─────────────────────────────────────────────────────────────────

interface SeatResult {
  type?: string
  subtype?: string
  tools?: Array<string>
  structured_output?: unknown
  result?: string
  stop_reason?: string | null
  num_turns?: number
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number }
  errors?: Array<string>
}

/** SDK terminal subtypes that mean a declared ceiling stopped the run. */
const BOUNDS_SUBTYPES: Record<string, string> = {
  error_max_turns: "maxTurns",
  error_max_budget_usd: "maxCostUsd"
}

/**
 * Claude Code's built-in tools, denied unless the seller names them.
 *
 * `allowedTools: []` does NOT produce a tool-free run — measured, it still loads the full
 * default toolset including Bash, Read, Write and Edit, leaving safety to depend on the
 * permission mode refusing them at call time. `disallowedTools` removes them from the
 * request instead, which is a stronger guarantee and a much cheaper one: on a trivial job
 * this cut the per-call cache write from 34,481 tokens to 619 and the cost from $0.356 to
 * $0.016. Loading a marketplace endpoint with an IDE's worth of tool schemas is pure waste
 * — the buyer pays for none of it and the seller pays for all of it.
 *
 * Glob and Grep are listed explicitly because they are NOT covered by the SDK's own
 * default-deny handling, and both read the filesystem.
 *
 * Denying a tool that does not exist is a no-op, so this list is safe to over-specify. It
 * can still go stale in the other direction, which is why `warnOnUnexpectedTools` reports
 * anything that loads despite not being asked for.
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

export const denyList = (allowed: ReadonlyArray<string>): Array<string> => {
  const keep = new Set<string>([...allowed, OUTPUT_TOOL])
  return BUILT_IN_TOOLS.filter((t) => !keep.has(t))
}

/**
 * Report any tool that loaded without being asked for.
 *
 * The deny list is a snapshot, and a future release can add a tool it does not name. This
 * turns that from a silent widening of the sandbox into a line in the seller's job log.
 */
export const unexpectedTools = (
  loaded: ReadonlyArray<string>,
  allowed: ReadonlyArray<string>
): Array<string> => {
  const expected = new Set<string>([...allowed, OUTPUT_TOOL])
  return loaded.filter((t) => !expected.has(t))
}

export const runSeatAgent = async (
  agent: SeatAgentDefinition,
  job: HarnessInput,
  runQuery: typeof query = query
): Promise<HarnessEnvelope> => {
  const { bounds } = job
  const totals = { turns: 0, tokens: 0, toolCalls: 0 }

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), bounds.timeoutSec * 1000)

  try {
    const stream = runQuery({
      prompt: JSON.stringify(job.input),
      options: {
        systemPrompt: agent.systemPrompt,
        ...(agent.model === undefined ? {} : { model: agent.model }),

        // The output contract is the manifest's own schema, so "the agent finished" and
        // "the buyer got the shape they paid for" are the same event.
        outputFormat: { type: "json_schema", schema: job.outputSchema as Record<string, unknown> },

        // Both ceilings are the SDK's to enforce, and it does so against real cost rather
        // than an estimate. A breach comes back as a terminal result subtype.
        ...(bounds.maxTurns === undefined ? {} : { maxTurns: bounds.maxTurns }),
        ...(bounds.maxCostUsd === undefined ? {} : { maxBudgetUsd: bounds.maxCostUsd }),

        // Default-deny, by absence rather than refusal. `allowedTools` alone still loads
        // the whole built-in toolset, so the deny list is what actually keeps Bash, Read
        // and Write out of a job whose input came from a stranger.
        permissionMode: "dontAsk",
        allowedTools: [...(agent.allowedTools ?? [])],
        disallowedTools: denyList(agent.allowedTools ?? []),

        // Isolation mode. Omitting this loads every filesystem settings source — the
        // seller's settings, the project's, and any CLAUDE.md — into a stranger's paid
        // job. Measured, that also loaded the MCP servers declared by whatever directory
        // the runner happened to start in, which is both an egress path nobody granted
        // and a five-fold cost increase: 17,338 cache-write tokens against 843.
        settingSources: [],

        // Pin the working directory to the skill. Inheriting the daemon's would make a
        // job's tool surface and settings depend on where the seller launched the runner.
        cwd: agent.workdir === undefined ? job.skillDir : resolve(job.skillDir, agent.workdir),

        // The marketplace seat, never the seller's everyday config directory.
        env: { ...process.env, CLAUDE_CONFIG_DIR: seatDir() },
        ...(claudeBinary() === undefined ? {} : { pathToClaudeCodeExecutable: claudeBinary()! }),

        abortController: abort
      }
    })

    let result: SeatResult | undefined
    for await (const message of stream as AsyncIterable<SeatResult>) {
      if (message.type === "system" && message.subtype === "init") {
        const extra = unexpectedTools(message.tools ?? [], agent.allowedTools ?? [])
        if (extra.length > 0) {
          // Not fatal — the permission mode still refuses them — but the seller should
          // know their sandbox got wider than the deny list expected.
          process.stderr.write(`sandbox: unexpected tools loaded: ${extra.join(", ")}\n`)
        }
      }
      if (message.type === "result") result = message
    }

    if (result === undefined) {
      return {
        stopReason: "error",
        usage: totals,
        costUsd: 0,
        error: "the seat produced no result message"
      }
    }

    totals.turns = result.num_turns ?? 0
    totals.tokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0)
    const costUsd = result.total_cost_usd ?? 0

    // Checked before the subtype: a refusal is the model declining, not the harness
    // failing, and D2 must not settle it as an answer.
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
        error: result.errors?.join("; ") ?? result.subtype ?? "seat run failed"
      }
    }

    // An agent that finished without emitting structured output has not produced the
    // thing the listing sells. Falling back to its prose here would settle a near-miss.
    if (result.structured_output === undefined) {
      return {
        stopReason: "incomplete",
        usage: totals,
        costUsd,
        error: "run completed without structured output"
      }
    }

    return {
      output: result.structured_output,
      stopReason: "end_turn",
      usage: totals,
      costUsd
    }
  } catch (e) {
    if (abort.signal.aborted) {
      return {
        stopReason: "timeout",
        usage: totals,
        costUsd: 0,
        error: `exceeded ${bounds.timeoutSec}s`
      }
    }

    // A ceiling can arrive as a thrown error rather than a terminal result subtype — the
    // SDK surfaces it whichever way the run happened to end. Reporting that as a generic
    // failure would hide the one outcome the seller most needs to see, so both shapes map
    // to the same place.
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

// ── entry point ─────────────────────────────────────────────────────────────

const main = async () => {
  const arg = process.argv[2]
  if (arg === undefined) throw new Error("usage: claude-seat.ts <entry-module>")
  const entry = resolve(process.cwd(), arg)

  const raw = await new Response(Bun.stdin.stream()).text()
  const job = JSON.parse(raw) as HarnessInput

  const mod = (await import(entry)) as { default?: SeatAgentDefinition }
  const agent = mod.default
  if (agent === undefined || typeof agent.systemPrompt !== "string") {
    throw new Error(`${entry} must default-export a SeatAgentDefinition with a systemPrompt`)
  }

  const envelope = await runSeatAgent(agent, job)
  process.stdout.write(JSON.stringify(envelope))
}

if (import.meta.main) {
  main().catch((e: unknown) => {
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
