#!/usr/bin/env bun
/**
 * The engine harness — one process, one dispatcher, every model engine.
 *
 * `exec.ts` spawns this with a scrubbed environment and an adapter name. Everything an
 * engine used to repeat — reading stdin, loading the seller's module, fencing the buyer's
 * input, sizing the output, shaping errors so stdout is always parseable JSON — happens
 * here exactly once. Adding a provider is a `run` function and a registry entry, which is
 * the point: the third and fourth engines should cost a fraction of the first.
 *
 * It is spawned rather than imported so the seller's agent module inherits the scrubbed
 * environment rather than the daemon's, and so a runaway engine dies with its process.
 *
 * `script` is deliberately not here: it has no model, no prompt and no fence, and
 * `exec.ts` runs the seller's executable directly.
 *
 * protocol — stdin:  {jobId, input, skillDir, bounds, outputSchema, adapter}
 *            stdout: {output, stopReason, usage, costUsd, error?} — always valid JSON
 *            stderr: job logs, relayed to the hub; never secrets
 */

import { resolve } from "node:path"
import {
  assertOutputSize,
  fence,
  looksLikeFenceEscape,
  OutputTooLarge,
  UntrustedTooLarge,
  type EngineAdapter
} from "@arcade/core"
import { claudeApiEngine } from "./claude-api.js"
import { claudeAgentEngine } from "./claude-agent.js"
import type { Engine, HarnessJob, JobEnvelope, SkillAgent } from "./types.js"

export const ENGINES: Partial<Record<EngineAdapter, Engine>> = {
  "claude-api": claudeApiEngine,
  "claude-agent": claudeAgentEngine
}

export const engineFor = (adapter: EngineAdapter): Engine => {
  const engine = ENGINES[adapter]
  if (engine === undefined) {
    throw new Error(
      `no engine registered for adapter "${adapter}" — known: ${Object.keys(ENGINES).join(", ")}`
    )
  }
  return engine
}

export interface HarnessRequest extends HarnessJob {
  readonly adapter: EngineAdapter
}

/**
 * Build the user turn.
 *
 * The buyer's input is fenced rather than interpolated. Interpolation is what makes a
 * marketplace endpoint injectable: a stranger's text arrives in the same position as the
 * seller's own instructions, and the model has no way to tell which is which. The fence
 * nonce is random per job so it cannot be closed from inside the payload.
 */
export const buildPrompt = (job: HarnessJob): { prompt: string; suspected: boolean } => {
  const serialised = typeof job.input === "string" ? job.input : JSON.stringify(job.input, null, 2)
  const suspected = looksLikeFenceEscape(serialised)
  const { text } = fence(serialised, { label: "the caller's request payload" })
  return {
    prompt: `${text}\n\nProduce the result this skill exists to produce, for the payload above.`,
    suspected
  }
}

export const runJob = async (
  agent: SkillAgent,
  request: HarnessRequest,
  engine: Engine = engineFor(request.adapter)
): Promise<JobEnvelope> => {
  let prompt: string
  let suspected = false
  try {
    const built = buildPrompt(request)
    prompt = built.prompt
    suspected = built.suspected
  } catch (e) {
    if (e instanceof UntrustedTooLarge) {
      // Refused before a token is spent: an oversized payload is both a cost attack on the
      // seller and the standard way to push operator instructions out of attention.
      return { stopReason: "rejected", usage: { turns: 0, tokens: 0, toolCalls: 0 }, costUsd: 0, error: e.message }
    }
    throw e
  }

  if (suspected) {
    // Logged, never fatal. The fence holds regardless — this exists so abuse is visible in
    // ratings rather than silent. Treating it as a filter would be the mistake the fencing
    // design exists to avoid.
    process.stderr.write("security: caller payload contained forged fence markers\n")
  }

  const envelope = await engine.run(agent, request, prompt)

  if (envelope.output !== undefined) {
    try {
      assertOutputSize(envelope.output)
    } catch (e) {
      if (e instanceof OutputTooLarge) {
        return { ...envelope, output: undefined, stopReason: "rejected", error: e.message }
      }
      throw e
    }
  }

  return suspected ? { ...envelope, suspectedInjection: true } : envelope
}

// ── entry point ─────────────────────────────────────────────────────────────

const main = async () => {
  const arg = process.argv[2]
  if (arg === undefined) throw new Error("usage: harness.ts <entry-module>")
  // `import()` resolves a bare relative path against THIS module, not the working
  // directory, which would look for the seller's agent inside the runner package.
  const entry = resolve(process.cwd(), arg)

  const raw = await new Response(Bun.stdin.stream()).text()
  const request = JSON.parse(raw) as HarnessRequest

  const mod = (await import(entry)) as { default?: SkillAgent }
  const agent = mod.default
  if (agent === undefined || typeof agent.systemPrompt !== "string") {
    throw new Error(`${entry} must default-export an agent with a systemPrompt (see defineAgent)`)
  }

  const envelope = await runJob(agent, request)
  process.stdout.write(JSON.stringify(envelope))
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    // stdout stays parseable so the parent can always read an outcome; diagnostics go to
    // stderr, which the hub relays as job logs.
    process.stderr.write(`${String((e as Error)?.stack ?? e)}\n`)
    process.stdout.write(
      JSON.stringify({
        stopReason: "error",
        usage: { turns: 0, tokens: 0, toolCalls: 0 },
        costUsd: 0,
        error: String((e as Error)?.message ?? e)
      } satisfies JobEnvelope)
    )
    process.exit(1)
  })
}
