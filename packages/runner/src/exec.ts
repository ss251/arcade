import { Effect, Scope } from "effect"
import { resolve } from "node:path"
import {
  BoundsExceeded,
  EngineRefused,
  JobOutcome,
  type SkillManifest
} from "@arcade/core"

/**
 * Sandboxed skill execution.
 *
 * Two guarantees this file exists to provide:
 *
 *  1. **Nothing undeclared leaks in.** The child's environment is built from scratch and
 *     contains ONLY the variables the manifest names in `secrets`. The seller's other
 *     credentials — their Anthropic key, their shell history, their AWS profile — are not
 *     merely unused, they are absent.
 *
 *  2. **Nothing outlives its bounds.** The process is acquired in a `Scope`, so it is killed
 *     on success, failure, timeout AND interrupt. A leaked agent process would spend the
 *     seller's money after the job stopped earning.
 */

export interface ExecArgs {
  readonly manifest: SkillManifest
  readonly skillDir: string
  readonly jobId: string
  readonly input: unknown
  readonly onLog?: (line: string) => void
}

/** Minimal base env. Notably absent: everything the seller has in their real environment. */
const BASE_ENV = (skillDir: string): Record<string, string> => ({
  PATH: process.env["PATH"] ?? "/usr/bin:/bin",
  HOME: skillDir,
  LANG: process.env["LANG"] ?? "en_US.UTF-8",
  ARCADE_SANDBOX: "1"
})

export const buildEnv = (manifest: SkillManifest, skillDir: string): Record<string, string> => {
  const env = BASE_ENV(skillDir)
  for (const name of manifest.secrets) {
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }
  return env
}

const spawnScoped = (
  cmd: ReadonlyArray<string>,
  env: Record<string, string>,
  cwd: string
) =>
  Effect.acquireRelease(
    Effect.sync(() =>
      Bun.spawn(cmd as Array<string>, {
        cwd,
        env,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe"
      })
    ),
    // Runs on EVERY exit path — success, failure, timeout, interrupt.
    (proc) =>
      Effect.sync(() => {
        try {
          proc.kill()
        } catch {
          /* already gone */
        }
      })
  )

/** The lane-A harness, resolved relative to this module so it survives any cwd. */
const CLAUDE_API_HARNESS = new URL("./engines/claude-api.ts", import.meta.url).pathname

const commandFor = (manifest: SkillManifest, skillDir: string): ReadonlyArray<string> => {
  // Absolute, because the child is spawned with `cwd: skillDir`. A relative skills
  // directory would otherwise be applied twice — once as the cwd and again inside the
  // path — and the entry would resolve to a directory that does not exist.
  const entry = resolve(skillDir, manifest.engine.entry)
  const extra = manifest.engine.args ?? []
  switch (manifest.engine.adapter) {
    case "script":
      return entry.endsWith(".ts") || entry.endsWith(".js")
        ? ["bun", "run", entry, ...extra]
        : [entry, ...extra]
    case "claude-api":
      // Lane A: the harness runs the Claude API tool runner and enforces the token and
      // tool-call ceilings mid-loop. It is spawned rather than imported so the seller's
      // agent module inherits the scrubbed environment, not the daemon's.
      return ["bun", "run", CLAUDE_API_HARNESS, entry, ...extra]
    case "claude-cli":
      return ["claude", "-p", ...extra]
    case "codex-cli":
      return ["codex", "exec", ...extra]
    case "grok-cli":
      return ["grok", "-p", ...extra]
  }
}

export const execSkill = (args: ExecArgs) =>
  Effect.gen(function* () {
    const startedAtMs = Date.now()
    const { manifest, skillDir } = args
    const env = buildEnv(manifest, skillDir)
    const cmd = commandFor(manifest, skillDir)

    const proc = yield* spawnScoped(cmd, env, skillDir)

    // The envelope carries only the PUBLIC half of the manifest. Bounds and outputSchema
    // are already published in the listing, so an engine harness can enforce and satisfy
    // them without the sandbox ever being handed anything a buyer couldn't already read.
    proc.stdin.write(
      JSON.stringify({
        jobId: args.jobId,
        input: args.input,
        bounds: manifest.bounds,
        outputSchema: manifest.outputSchema
      })
    )
    proc.stdin.end()

    const [stdout, stderr, exitCode] = yield* Effect.promise(() =>
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited
      ])
    )

    if (stderr.trim() !== "" && args.onLog !== undefined) {
      for (const line of stderr.trim().split("\n")) args.onLog(line)
    }

    const finishedAtMs = Date.now()

    let parsed: unknown
    try {
      parsed = JSON.parse(stdout)
    } catch {
      return JobOutcome.make({
        status: "invalid",
        startedAtMs,
        finishedAtMs,
        error: `stdout was not JSON (exit ${exitCode}): ${stdout.slice(0, 200)}`
      })
    }

    const envelope = parsed as {
      output?: unknown
      stopReason?: string
      usage?: { turns?: number; tokens?: number; toolCalls?: number }
      costUsd?: number
      error?: string
    }

    // D2: refusal is read from stop_reason, NEVER the exit code. A refusing agent
    // frequently exits 0 — treating that as success would charge for a non-answer.
    //
    // Matched by prefix: the Claude API reports a refusal category alongside the reason
    // (`refusal:cyber`), and an exact-match list would silently let a categorised refusal
    // through as a successful answer.
    if (envelope.stopReason !== undefined && envelope.stopReason !== "end_turn") {
      const refusalish = ["refusal", "reasoning_extraction", "content_filter"]
      if (refusalish.some((r) => envelope.stopReason === r || envelope.stopReason!.startsWith(`${r}:`))) {
        yield* Effect.fail(
          new EngineRefused({ skillId: manifest.id, stopReason: envelope.stopReason })
        ).pipe(Effect.catchAll(() => Effect.void))
        return JobOutcome.make({
          status: "refused",
          stopReason: envelope.stopReason,
          startedAtMs,
          finishedAtMs
        })
      }

      // An engine that enforces its own ceilings mid-run reports the breach directly.
      // Trusting it is what makes in-loop enforcement possible at all: by the time the
      // caller could measure usage, the seller has already paid for the overage.
      if (envelope.stopReason === "bounds_exceeded") {
        yield* Effect.fail(
          new BoundsExceeded({
            skillId: manifest.id,
            bound: "maxTokens",
            limit: manifest.bounds.maxTokens ?? 0
          })
        ).pipe(Effect.catchAll(() => Effect.void))
        return JobOutcome.make({
          status: "bounds_exceeded",
          startedAtMs,
          finishedAtMs,
          error: envelope.error ?? "engine reported a bounds breach"
        })
      }
    }

    // D1: bounded work. Exceeding a declared bound is a seller-side failure, not a
    // buyer-side charge.
    const usage = envelope.usage ?? {}
    const bounds = manifest.bounds
    const breach =
      bounds.maxTurns !== undefined && (usage.turns ?? 0) > bounds.maxTurns
        ? { bound: "maxTurns" as const, limit: bounds.maxTurns }
        : bounds.maxTokens !== undefined && (usage.tokens ?? 0) > bounds.maxTokens
          ? { bound: "maxTokens" as const, limit: bounds.maxTokens }
          : bounds.maxToolCalls !== undefined && (usage.toolCalls ?? 0) > bounds.maxToolCalls
            ? { bound: "maxToolCalls" as const, limit: bounds.maxToolCalls }
            : undefined

    if (breach !== undefined) {
      yield* Effect.fail(
        new BoundsExceeded({ skillId: manifest.id, bound: breach.bound, limit: breach.limit })
      ).pipe(Effect.catchAll(() => Effect.void))
      return JobOutcome.make({
        status: "bounds_exceeded",
        startedAtMs,
        finishedAtMs,
        error: `${breach.bound} > ${breach.limit}`
      })
    }

    if (exitCode !== 0) {
      return JobOutcome.make({
        status: "failed",
        startedAtMs,
        finishedAtMs,
        error: `exit ${exitCode}`
      })
    }

    return JobOutcome.make({
      status: "succeeded",
      ...(envelope.stopReason === undefined ? {} : { stopReason: envelope.stopReason }),
      output: envelope.output ?? parsed,
      startedAtMs,
      finishedAtMs
    })
  }).pipe(
    Effect.scoped,
    // Hard wall-clock ceiling. `Scope` guarantees the child dies with it.
    Effect.timeoutTo({
      duration: `${args.manifest.bounds.timeoutSec} seconds`,
      onTimeout: () =>
        JobOutcome.make({
          status: "timeout",
          startedAtMs: Date.now(),
          finishedAtMs: Date.now(),
          error: `exceeded ${args.manifest.bounds.timeoutSec}s`
        }),
      onSuccess: (o) => o
    })
  )
