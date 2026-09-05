import { query } from "@anthropic-ai/claude-agent-sdk"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { Capability } from "@arcade/core"
import type { Engine, HarnessJob, JobEnvelope, SkillAgent } from "./types.js"
import { openAgentRelay } from "./agent-relay.js"

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
  message?: { content?: Array<{ type?: string; name?: string }> }
}

const BOUNDS_SUBTYPES: Record<string, string> = {
  error_max_turns: "maxTurns",
  error_max_budget_usd: "maxCostUsd"
}

const own = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const property = Object.getOwnPropertyDescriptor(value, key)
  return property !== undefined && "value" in property ? property.value : undefined
}
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const accounting = (result: SeatResult) => {
  const turns = own(result, "num_turns"), costUsd = own(result, "total_cost_usd"), usage = own(result, "usage")
  const input = own(usage, "input_tokens"), output = own(usage, "output_tokens")
  const created = own(usage, "cache_creation_input_tokens") ?? 0, cached = own(usage, "cache_read_input_tokens") ?? 0
  if (!count(turns) || !count(input) || !count(output) || !count(created) || !count(cached) ||
    typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd < 0 || costUsd > Number.MAX_SAFE_INTEGER) return undefined
  const tokens = input + output + created + cached
  if (!count(tokens)) return undefined
  const server = own(usage, "server_tool_use")
  let serverCalls = 0
  if (server != null) {
    if (typeof server !== "object" || Array.isArray(server)) return undefined
    for (const key of Object.keys(server)) {
      const value = own(server, key)
      if (!count(value)) return undefined
      serverCalls += value
    }
  }
  if (!count(serverCalls)) return undefined
  return { turns, tokens, costUsd, serverCalls }
}

export const runClaudeAgent = async (
  agent: SkillAgent,
  job: HarnessJob,
  prompt: string,
  runQuery: typeof query = query,
  runRelay: typeof openAgentRelay = openAgentRelay
): Promise<JobEnvelope> => {
  const { bounds } = job
  const totals = { turns: 0, tokens: 0, toolCalls: 0 }
  const allowed = toolsForCapabilities(agent.capabilities ?? [])
  let observedStructuredOutput = false

  const abort = new AbortController()
  const startedAt = Date.now()
  const timer = setTimeout(() => abort.abort(), bounds.timeoutSec * 1000)
  let scratch: string | undefined
  let stream: ReturnType<typeof query> | undefined
  let relay: Awaited<ReturnType<typeof openAgentRelay>> | undefined
  const children: Array<{ process: ChildProcess; closed: Promise<void>; done: boolean }> = []
  const killTimers: Array<ReturnType<typeof setTimeout>> = []
  let cleanupFailed = false
  const signalOwned = (child: ChildProcess, signal: NodeJS.Signals) => {
    try { child.kill(signal) } catch { cleanupFailed = true }
  }
  const stopOwned = () => {
    for (const child of children) {
      if (child.done || child.process.pid === undefined || child.process.pid <= 1) continue
      signalOwned(child.process, "SIGTERM")
      killTimers.push(setTimeout(() => { if (!child.done) signalOwned(child.process, "SIGKILL") }, 100))
    }
  }
  const cancel = () => abort.abort()
  abort.signal.addEventListener("abort", stopOwned, { once: true })
  process.once("SIGTERM", cancel)
  process.once("SIGINT", cancel)
  const aborted = new Promise<never>((_resolve, reject) => {
    abort.signal.addEventListener("abort", () => reject(new Error("engine cancelled")), { once: true })
  })
  // A timeout during scratch creation must not produce an unhandled rejection.
  void aborted.catch(() => {})

  try {
    // The bundled CLI writes config even with settingSources: []. Never let API-key
    // jobs discover a seller's personal config, seat or keychain through that fallback.
    // This is an owned config directory, not a HOME override.
    if (agent.credential !== "subscription") scratch = await mkdtemp(join(tmpdir(), "arcade-agent-config-"))
    if (abort.signal.aborted) throw new Error("engine cancelled")
    const nativeEnv = { ...process.env }
    const customBase = process.env["ANTHROPIC_BASE_URL"]
    if (scratch !== undefined && customBase !== undefined && customBase !== "") {
      if (agent.model === undefined) throw Error("custom engine requires an explicit model")
      relay = await runRelay({
        baseUrl: customBase, model: agent.model,
        ...(process.env["ANTHROPIC_API_KEY"] === undefined ? {} : { apiKey: process.env["ANTHROPIC_API_KEY"] }),
        ...(process.env["ANTHROPIC_AUTH_TOKEN"] === undefined ? {} : { authToken: process.env["ANTHROPIC_AUTH_TOKEN"] }),
        allowedTools: [...allowed, OUTPUT_TOOL], signal: abort.signal,
        timeoutMs: Math.max(1, bounds.timeoutSec * 1000 - (Date.now() - startedAt)),
        requestLimit: Math.min(256, Math.max(4, (bounds.maxTurns ?? 8) * 2 + 2))
      })
      // Native receives a job-scoped local capability, never upstream credentials or
      // custom headers. Alternate native provider/auth modes cannot bypass this relay.
      for (const key of Object.keys(nativeEnv)) if (key.startsWith("ANTHROPIC_") || key.startsWith("CLAUDE_CODE_OAUTH") || key.startsWith("CLAUDE_CODE_USE_")) delete nativeEnv[key]
      for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]) delete nativeEnv[key]
      nativeEnv["ANTHROPIC_BASE_URL"] = relay.baseUrl
      nativeEnv["ANTHROPIC_API_KEY"] = relay.capability
    }
    if (abort.signal.aborted) throw new Error("engine cancelled")
    stream = runQuery({
      prompt,
      options: {
        systemPrompt: agent.systemPrompt,
        ...(agent.model === undefined ? {} : { model: agent.model }),

        // The manifest's own schema is the output contract, so "the agent finished" and
        // "the buyer got the shape they paid for" are the same event.
        outputFormat: { type: "json_schema", schema: job.outputSchema as Record<string, unknown> },

        // Keep the SDK's budget ceiling. Its cost figure is SDK-reported accounting,
        // not independently verified provider billing (especially for custom models).
        ...(bounds.maxTurns === undefined ? {} : { maxTurns: bounds.maxTurns }),
        ...(bounds.maxCostUsd === undefined ? {} : { maxBudgetUsd: bounds.maxCostUsd }),

        // Default-deny by absence, not refusal.
        permissionMode: "dontAsk",
        tools: allowed,
        allowedTools: allowed,
        disallowedTools: denyList(allowed),

        // Isolation mode: no seller settings, no CLAUDE.md, no ambient MCP servers.
        settingSources: [],
        ...(scratch === undefined ? {} : { persistSession: false }),

        // Pin the working directory to the skill so a job's tool surface never depends on
        // where the seller happened to launch the runner.
        cwd: agent.workdir === undefined ? job.skillDir : resolve(job.skillDir, agent.workdir),

        env: {
          ...nativeEnv,
          CLAUDE_CONFIG_DIR: scratch ?? seatDir(),
          // The bundled CLI otherwise prefetches macOS Keychain credentials before
          // choosing API-key authentication. Bare mode suppresses that ambient read.
          ...(scratch === undefined ? {} : { CLAUDE_CODE_SIMPLE: "1" }),
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          DISABLE_TELEMETRY: "1",
          DISABLE_ERROR_REPORTING: "1",
          DISABLE_AUTOUPDATER: "1"
        },
        ...(scratch === undefined && claudeBinary() !== undefined ? { pathToClaudeCodeExecutable: claudeBinary()! } : {}),
        spawnClaudeCodeProcess: (options) => {
          if (abort.signal.aborted) throw new Error("engine cancelled")
          const child = spawn(options.command, options.args, {
            cwd: options.cwd,
            env: options.env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true
          })
          // Custom SDK spawners own stderr consumption. Discard private CLI diagnostics
          // incrementally; an unread pipe can deadlock the child before its result.
          child.stderr?.resume()
          const owned = { process: child, done: false, closed: Promise.resolve() }
          owned.closed = new Promise<void>((resolveClose) => {
            child.once("close", () => { owned.done = true; resolveClose() })
            // A spawn failure has no live PID. A signal error on a running process is
            // not exit evidence; only close may release that owned process.
            child.once("error", () => {
              cleanupFailed = true
              if (child.pid === undefined) { owned.done = true; resolveClose() }
            })
          })
          children.push(owned)
          return child
        },
        abortController: abort
      }
    })

    let result: SeatResult | undefined
    const iterator = (stream as AsyncIterable<SeatResult>)[Symbol.asyncIterator]()
    while (true) {
      const next = await Promise.race([iterator.next(), aborted])
      if (next.done) break
      const message = next.value
      if (message.type === "system" && message.subtype === "init") {
        const extra = unexpectedTools(message.tools ?? [], allowed)
        if (extra.length > 0) {
          return { stopReason: "error", usage: totals, costUsd: 0, error: "engine loaded undeclared tools" }
        }
      }
      if (message.type === "assistant") {
        for (const block of message.message?.content ?? []) if (block.type === "tool_use") {
          if (block.name !== OUTPUT_TOOL && !allowed.includes(block.name ?? "")) {
            return { stopReason: "error", usage: totals, costUsd: 0, error: "engine requested an undeclared tool" }
          }
          totals.toolCalls++
          if (block.name === OUTPUT_TOOL) observedStructuredOutput = true
        }
      }
      // Terminal result is the protocol outcome. Installed SDK may subsequently throw
      // its private error prose on process exit; that must not erase a typed refusal.
      if (message.type === "result") { result = message; break }
    }

    if (result === undefined) {
      return { stopReason: "error", usage: totals, costUsd: 0, error: "engine produced no result" }
    }

    const measured = accounting(result)
    if (measured === undefined || !count(totals.toolCalls + measured.serverCalls)) {
      return { stopReason: "error", usage: totals, costUsd: 0, error: "invalid engine accounting" }
    }
    totals.turns = measured.turns
    totals.tokens = measured.tokens
    totals.toolCalls += measured.serverCalls
    const costUsd = measured.costUsd

    // Before the subtype: a refusal is the model declining, not the harness failing.
    if (result.stop_reason === "refusal") {
      return { stopReason: "refusal", usage: totals, costUsd }
    }

    if (bounds.maxCostUsd !== undefined && costUsd > bounds.maxCostUsd) {
      return { stopReason: "bounds_exceeded", usage: totals, costUsd, error: `maxCostUsd reached (SDK reported $${costUsd.toFixed(4)})` }
    }

    const exceeded = bounds.maxTurns !== undefined && totals.turns > bounds.maxTurns ? "maxTurns" :
      bounds.maxTokens !== undefined && totals.tokens > bounds.maxTokens ? "maxTokens" :
      bounds.maxToolCalls !== undefined && totals.toolCalls > bounds.maxToolCalls ? "maxToolCalls" : undefined
    if (exceeded !== undefined) return { stopReason: "bounds_exceeded", usage: totals, costUsd, error: `${exceeded} reached` }

    const bound = result.subtype !== undefined && Object.hasOwn(BOUNDS_SUBTYPES, result.subtype) ? BOUNDS_SUBTYPES[result.subtype] : undefined
    if (bound !== undefined) {
      return {
        stopReason: "bounds_exceeded",
        usage: totals,
        costUsd,
        error: `${bound} reached (spent $${costUsd.toFixed(4)})`
      }
    }

    if (result.subtype !== "success" || own(result, "is_error") !== false) {
      return {
        stopReason: "error",
        usage: totals,
        costUsd,
        error: "engine execution failed"
      }
    }

    if (result.stop_reason !== "end_turn" && !(result.stop_reason === "tool_use" && observedStructuredOutput)) {
      return { stopReason: "incomplete", usage: totals, costUsd, error: "engine did not complete the output contract" }
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
    const message = typeof own(e, "message") === "string" ? own(e, "message") as string : ""
    if (/maximum budget|max budget/i.test(message)) {
      return { stopReason: "bounds_exceeded", usage: totals, costUsd: 0, error: "maxCostUsd reached" }
    }
    if (/maximum number of turns|max turns/i.test(message)) {
      return { stopReason: "bounds_exceeded", usage: totals, costUsd: 0, error: "maxTurns reached" }
    }
    return { stopReason: "error", usage: totals, costUsd: 0, error: "engine execution failed" }
  } finally {
    clearTimeout(timer)
    // Query.close() is external synchronous code. Its failure must not bypass abort,
    // owned-process reaping, handler removal or private scratch cleanup.
    try { stream?.close?.() } catch { cleanupFailed = true }
    abort.abort()
    process.removeListener("SIGTERM", cancel)
    process.removeListener("SIGINT", cancel)
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    const closed = await Promise.race([
      Promise.all(children.map((child) => child.closed)).then(() => true),
      new Promise<false>((resolveTimeout) => { cleanupTimer = setTimeout(() => resolveTimeout(false), 3_000) })
    ])
    clearTimeout(cleanupTimer)
    for (const killTimer of killTimers) clearTimeout(killTimer)
    if (!closed) {
      try { await relay?.close() } catch { /* failure already refuses the result */ }
      return { stopReason: "error", usage: totals, costUsd: 0, error: "owned engine process cleanup could not be confirmed" }
    }
    try { await relay?.close() } catch { cleanupFailed = true }
    if (scratch !== undefined) {
      try { await rm(scratch, { recursive: true, force: true }) } catch { cleanupFailed = true }
    }
    if (cleanupFailed) {
      return { stopReason: "error", usage: totals, costUsd: 0, error: "owned engine cleanup failed" }
    }
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
