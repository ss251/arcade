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
 * protocol — stdin:  {jobId, input, skillDir, bounds, outputSchema, adapter, engineConfig?}
 *            stdout: {output, stopReason, usage, costUsd, error?} — always valid JSON
 *            stderr: job logs, relayed to the hub; never secrets
 */

import { realpath } from "node:fs/promises"
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"
import {
  assertOutputSize,
  fence,
  looksLikeFenceEscape,
  OutputTooLarge,
  UntrustedTooLarge,
  type EngineAdapter
} from "@arcade/core"
import { claudeApiEngine } from "./claude-api.js"
import { openAiApiEngine } from "./openai-api.js"
import { claudeAgentEngine } from "./claude-agent.js"
import { loadSkillAgent, skillEngine } from "./skill.js"
import { mcpEngine } from "./mcp.js"
import { openapiEngine } from "./openapi.js"
import type { Engine, HarnessJob, JobEnvelope, SkillAgent } from "./types.js"

export const ENGINES: Partial<Record<EngineAdapter, Engine>> = {
  "claude-api": claudeApiEngine,
  "openai-api": openAiApiEngine,
  "claude-agent": claudeAgentEngine,
  skill: skillEngine,
  mcp: mcpEngine,
  openapi: openapiEngine
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

/** Resolve an agent only for adapters that have one; entryless adapters read their config. */
const agentFor = async (request: HarnessRequest, entryArg: string): Promise<SkillAgent> => {
  const config = request.engineConfig
  if (request.adapter === "mcp" || request.adapter === "openapi") {
    return {
      systemPrompt: "",
      ...(config?.credential === undefined ? {} : { credential: config.credential }),
      capabilities: config?.capabilities ?? []
    }
  }

  // `import()` resolves a bare relative path against THIS module, not the working
  // directory, which would look for the seller's agent inside the runner package.
  const entry = resolve(process.cwd(), entryArg)
  if (request.adapter === "skill" || (request.adapter === "openai-api" && basename(entry) === "SKILL.md")) {
    let rootPath: string
    let entryPath: string
    try {
      ;[rootPath, entryPath] = await Promise.all([realpath(request.skillDir), realpath(entry)])
    } catch {
      throw new Error("SKILL.md could not be read. Check engine.entry and file permissions.")
    }
    const workdir = relative(rootPath, dirname(entryPath))
    if (workdir === ".." || workdir.startsWith(`..${sep}`) || isAbsolute(workdir)) {
      throw new Error("SKILL.md must stay inside the skill directory.")
    }
    // Reference paths in the prompt are relative to SKILL.md, including nested skills.
    return { ...await loadSkillAgent(entryPath, config), workdir: workdir || "." }
  }
  const mod = (await import(entry)) as { default?: SkillAgent }
  const agent = mod.default
  if (agent === undefined || typeof agent.systemPrompt !== "string") {
    throw new Error(`${entry} must default-export an agent with a systemPrompt (see defineAgent)`)
  }
  // The private manifest is the operator's model selection. Keep all other module
  // settings intact, including its fallback model when no override was published.
  return config?.model === undefined ? agent : { ...agent, model: config.model }
}

const main = async () => {
  const arg = process.argv[2]
  if (arg === undefined) throw new Error("usage: harness.ts <entry-module|->")
  const raw = await new Response(Bun.stdin.stream()).text()
  const request = JSON.parse(raw) as HarnessRequest
  const agent = await agentFor(request, arg)
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
