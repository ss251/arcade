import { Effect, Scope } from "effect"
import { resolve } from "node:path"
import {
  BoundsExceeded,
  EngineRefused,
  isRefusal,
  isReservedEnvName,
  JobOutcome,
  type SkillManifest
} from "@arcade/core"
import { ENGINES } from "./engines/harness.ts"
import type { SkillAgent } from "./engines/types.ts"

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

/**
 * The environment a job actually gets.
 *
 * Two sources of widening, both explicit and both narrow:
 *
 *  - the `secrets` the manifest names, which is the seller declaring what their own code
 *    needs, and
 *  - the engine's `envGrants`, which is the engine declaring what it cannot run without.
 *
 * The second exists because engines differ in what they need and pretending otherwise
 * would mean granting the union to everyone. An API-key engine needs one variable. A
 * subscription engine needs the real `HOME`, because its credential lives in the OS login
 * keychain and is unreachable without it — so that lane genuinely does widen the
 * environment, and its safety rests on the tool surface being closed instead: a job with a
 * readable filesystem has no instrument to read it with.
 *
 * Grants are names, never values, and a name that is not set in the parent is simply
 * absent rather than passed as empty.
 */
export const buildEnv = (manifest: SkillManifest, skillDir: string): Record<string, string> => {
  const env: Record<string, string> = {}

  // Seller secrets FIRST, so the sandbox's own variables and the engine's grants overwrite
  // them rather than the other way round. `SecretName` already rejects a manifest that
  // names a reserved variable, so this ordering should never matter — which is exactly why
  // it is worth having. A validation rule and an ordering rule fail independently, and the
  // thing they jointly protect is that a job cannot get the seller's real `HOME` back: that
  // would undo the scrub and, separately, put a subscription seat's keychain in reach of a
  // skill that publishes as `api-key`.
  for (const name of manifest.secrets) {
    if (isReservedEnvName(name)) continue
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }

  // Then the sandbox's own definition, which a seller can never displace.
  Object.assign(env, BASE_ENV(skillDir))

  // The one capability that spends money. Granted only when the manifest declares
  // `hire-skills`, so the ability to buy is visible in `arcade publish` next to everything
  // else a skill can reach — and never requestable through `secrets`, because `ARCADE_` is
  // a reserved prefix.
  //
  // The budget comes from the manifest, not the environment, so it is per-skill and
  // published. Absent means zero rather than unlimited: a seller who declares the
  // capability but forgets `maxSubSpendUsd` gets a skill that cannot spend, which is the
  // safe way round to be wrong.
  if (manifest.engine.capabilities.includes("hire-skills")) {
    const hub = process.env["ARCADE_HUB"]
    const subKey = process.env["ARCADE_SUBBUY_KEY"]
    if (hub !== undefined) env["ARCADE_HUB"] = hub
    if (subKey !== undefined) env["ARCADE_SUBBUY_KEY"] = subKey
    env["ARCADE_SUB_BUDGET_USD"] = String(manifest.bounds.maxSubSpendUsd ?? 0)
  }

  // Engine grants last, because an engine CAN legitimately need to override a sandbox
  // variable — a subscription-backed engine needs the real `HOME` to reach the login
  // keychain. That widening is declared by the engine, visible in one place, and asserted
  // in tests; the seller cannot request it, which is the distinction that matters.
  const engine = ENGINES[manifest.engine.adapter]
  if (engine !== undefined) {
    const agent: SkillAgent = {
      systemPrompt: "",
      ...(manifest.engine.credential === undefined
        ? {}
        : { credential: manifest.engine.credential })
    }
    for (const name of engine.envGrants(agent)) {
      const value = process.env[name]
      if (value !== undefined) env[name] = value
    }
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

/** The one engine harness, resolved relative to this module so it survives any cwd. */
const HARNESS = new URL("./engines/harness.ts", import.meta.url).pathname

/**
 * `script` runs the seller's executable directly; every model engine runs through the one
 * harness, which fences the buyer's input and dispatches by adapter. That split is the
 * whole reason a third or fourth provider is a `run` function rather than another copy of
 * the plumbing.
 */
const commandFor = (manifest: SkillManifest, skillDir: string): ReadonlyArray<string> => {
  // Absolute, because the child is spawned with `cwd: skillDir`. A relative skills
  // directory would otherwise be applied twice — once as the cwd and again inside the
  // path — and the entry would resolve to a directory that does not exist.
  const entry = resolve(skillDir, manifest.engine.entry)
  const extra = manifest.engine.args ?? []
  if (manifest.engine.adapter === "script") {
    return entry.endsWith(".ts") || entry.endsWith(".js")
      ? ["bun", "run", entry, ...extra]
      : [entry, ...extra]
  }
  return ["bun", "run", HARNESS, entry, ...extra]
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
        skillDir: resolve(skillDir),
        adapter: manifest.engine.adapter,
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
      suspectedInjection?: boolean
    }

    /** Everything an engine reports about what a call cost and how it behaved. */
    const telemetry = {
      ...(envelope.costUsd === undefined ? {} : { costUsd: envelope.costUsd }),
      ...(envelope.suspectedInjection === true ? { suspectedInjection: true } : {})
    }

    // D2: refusal is read from stop_reason, NEVER the exit code. A refusing agent
    // frequently exits 0 — treating that as success would charge for a non-answer.
    // `isRefusal` matches categorised reasons (`refusal:cyber`) by prefix.
    if (envelope.stopReason !== undefined && envelope.stopReason !== "end_turn") {
      if (isRefusal(envelope.stopReason)) {
        yield* Effect.fail(
          new EngineRefused({ skillId: manifest.id, stopReason: envelope.stopReason })
        ).pipe(Effect.catchAll(() => Effect.void))
        return JobOutcome.make({
          status: "refused",
          stopReason: envelope.stopReason,
          startedAtMs,
          finishedAtMs,
          ...telemetry
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
          error: envelope.error ?? "engine reported a bounds breach",
          ...telemetry
        })
      }

      // A protocol limit — oversized input or output — refused before or instead of
      // producing an answer. Distinct from a failure so ratings can tell "this seller is
      // unreliable" from "that caller sent a megabyte".
      if (envelope.stopReason === "rejected") {
        return JobOutcome.make({
          status: "rejected",
          startedAtMs,
          finishedAtMs,
          error: envelope.error ?? "rejected by a protocol limit",
          ...telemetry
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
        error: `${breach.bound} > ${breach.limit}`,
        ...telemetry
      })
    }

    if (exitCode !== 0) {
      return JobOutcome.make({
        status: "failed",
        startedAtMs,
        finishedAtMs,
        error: `exit ${exitCode}`,
        ...telemetry
      })
    }

    // An engine that reports its own failure exits 0 — it ran correctly and is telling us
    // the job did not. Without this the fallback below would hand the error envelope back
    // as the job's output, and a settled receipt would be issued for a failure.
    if (envelope.stopReason === "error" || envelope.stopReason === "incomplete") {
      return JobOutcome.make({
        status: "failed",
        startedAtMs,
        finishedAtMs,
        error: envelope.error ?? `engine reported ${envelope.stopReason}`,
        ...telemetry
      })
    }
    if (envelope.stopReason === "timeout") {
      return JobOutcome.make({
        status: "timeout",
        startedAtMs,
        finishedAtMs,
        error: envelope.error ?? "engine reported a timeout",
        ...telemetry
      })
    }

    // Bare scripts may write their result directly instead of wrapping it, so an
    // unwrapped body is still valid. But only treat it as one when it is genuinely not an
    // envelope — otherwise an engine whose `output` is legitimately absent gets its own
    // bookkeeping returned to the buyer as the answer.
    const looksLikeEnvelope =
      typeof parsed === "object" &&
      parsed !== null &&
      ("stopReason" in parsed || "usage" in parsed || "costUsd" in parsed)

    if (envelope.output === undefined && looksLikeEnvelope) {
      return JobOutcome.make({
        status: "failed",
        startedAtMs,
        finishedAtMs,
        error: envelope.error ?? "engine returned no output",
        ...telemetry
      })
    }

    return JobOutcome.make({
      status: "succeeded",
      ...(envelope.stopReason === undefined ? {} : { stopReason: envelope.stopReason }),
      output: envelope.output ?? parsed,
      startedAtMs,
      finishedAtMs,
      ...telemetry
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
