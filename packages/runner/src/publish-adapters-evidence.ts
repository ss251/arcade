import { Effect } from "effect"
import { shouldSettle, type JobOutcome } from "@arcade/core"
import { fileURLToPath } from "node:url"
import { execSkill, type ExecArgs } from "./exec.ts"
import { loadSkills, type LoadedSkill } from "./skills.ts"

const CASES = [
  { id: "diff-triage", adapter: "skill", input: { diff: "--- a/x.ts\n+++ b/x.ts\n-const a = 1\n+const a = 2" } },
  { id: "search-arc-docs", adapter: "mcp", input: { query: "gateway nanopayments" } },
  { id: "fx-rate", adapter: "openapi", input: { base: "USD", symbols: "EUR" } }
] as const

export interface EvidenceDependencies {
  readonly load: (skillsDir: string) => Promise<ReadonlyArray<LoadedSkill>>
  readonly execute: (args: ExecArgs) => Promise<JobOutcome>
  readonly log: (line: string) => void
}

// Effect resolves from the runner's declared dependency, regardless of the wrapper's cwd.
const defaults: EvidenceDependencies = {
  load: (skillsDir) => Effect.runPromise(loadSkills(skillsDir)),
  execute: (args) => Effect.runPromise(execSkill(args)),
  log: (line) => console.log(line)
}
const SKILLS = fileURLToPath(new URL("../../../skills", import.meta.url))
const USAGE = "usage: e2e-publish-adapters.ts [--only diff-triage|search-arc-docs|fx-rate] (repeatable; default: all three)"

const selectedCases = (argv: ReadonlyArray<string>): ReadonlyArray<typeof CASES[number]> => {
  const ids = new Set<string>()
  for (let index = 0; index < argv.length; index += 2) {
    const id = argv[index + 1]
    if (argv[index] !== "--only" || id === undefined || !CASES.some((entry) => entry.id === id)) throw new Error(USAGE)
    ids.add(id)
  }
  return ids.size === 0 ? CASES : CASES.filter((entry) => ids.has(entry.id))
}

/** Report only known stop categories; provider diagnostics and result bodies stay private. */
const stopLabel = (reason: string | undefined): string => {
  if (reason === undefined) return "missing"
  if (["end_turn", "error", "timeout", "incomplete", "bounds_exceeded", "rejected", "refusal", "reasoning_extraction", "content_filter"].includes(reason)) return reason
  if (reason.startsWith("refusal:")) return "refusal"
  return "other"
}

/**
 * Local execution evidence, not settlement evidence. All selected cases are attempted.
 * A non-empty succeeded/end_turn result passes; the hub's schema/payment gates are not run.
 */
export const runPublishAdaptersEvidence = async (
  argv: ReadonlyArray<string>, deps: EvidenceDependencies = defaults
): Promise<number> => {
  let selected: ReadonlyArray<typeof CASES[number]>
  try { selected = selectedCases(argv) }
  catch { deps.log(USAGE); return 1 }
  const partial = selected.length !== CASES.length
  deps.log(`${partial ? "PARTIAL" : "FULL"} local adapter evidence (${selected.length}/${CASES.length} selected)`)
  if (partial) deps.log(`Not selected: ${CASES.filter((entry) => !selected.includes(entry)).map((entry) => entry.id).join(", ")}`)
  deps.log("Local execution only; no hub or payment settlement is exercised. Output schemas are not validated here.")
  deps.log(`${"listing".padEnd(24)} ${"adapter".padEnd(10)} ${"status".padEnd(14)} ${"stop".padEnd(14)} output`)
  const summary = (succeeded: number) => deps.log(`Summary: ${succeeded} succeeded, ${selected.length - succeeded} failed (${partial ? "partial" : "full"} evidence).`)
  let skills: ReadonlyArray<LoadedSkill>
  try { skills = await deps.load(SKILLS) }
  catch {
    for (const entry of selected) deps.log(`${entry.id.padEnd(24)} LOAD_FAILED`)
    summary(0)
    return 1
  }
  let succeeded = 0
  for (const entry of selected) {
    const matches = skills.filter((skill) => skill.manifest.id === entry.id)
    const skill = matches[0]
    if (skill === undefined || matches.length !== 1 || skill.manifest.engine.adapter !== entry.adapter) {
      const status = skill === undefined ? "MISSING" : matches.length !== 1 ? "AMBIGUOUS" : "WRONG_ADAPTER"
      deps.log(`${entry.id.padEnd(24)} ${status}`)
      continue
    }
    try {
      const outcome = await deps.execute({ manifest: skill.manifest, skillDir: skill.dir,
        jobId: `evidence-${entry.id}`, input: entry.input })
      // Reuse core's non-empty/refusal rules, without implying we ran the hub's schema gate.
      const passed = outcome.status === "succeeded" && outcome.stopReason === "end_turn" && shouldSettle(outcome, true).settle
      const size = Buffer.byteLength(JSON.stringify(outcome.output ?? null), "utf8")
      if (passed) succeeded += 1
      deps.log(`${entry.id.padEnd(24)} ${entry.adapter.padEnd(10)} ${outcome.status.padEnd(14)} ` +
        `${stopLabel(outcome.stopReason).padEnd(14)} ${size}B${passed ? "" : " FAIL"}`)
    } catch {
      deps.log(`${entry.id.padEnd(24)} ${entry.adapter.padEnd(10)} ERROR          -              FAIL`)
    }
  }
  summary(succeeded)
  return succeeded === selected.length ? 0 : 1
}
