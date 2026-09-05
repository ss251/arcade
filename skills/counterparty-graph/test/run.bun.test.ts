import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { SkillManifest, type JobOutcome } from "@arcade/core"
import { execSkill } from "../../../packages/runner/src/exec.ts"

// Effect belongs to the existing package workspace, not the root skill package.
const requireCore = createRequire(new URL("../../../packages/core/package.json", import.meta.url))
const { Effect, Schema } = requireCore("effect") as {
  Effect: { scoped(work: ReturnType<typeof execSkill>): unknown; runPromise(work: unknown): Promise<JobOutcome> }
  Schema: { decodeUnknownSync(schema: typeof SkillManifest): (raw: unknown) => SkillManifest }
}

const entry = new URL("../run.ts", import.meta.url).pathname
const skillDir = new URL("../", import.meta.url).pathname
const launch = async (script: string[], input = "") => {
  const child = Bun.spawn([process.execPath, "--no-env-file", ...script], {
    env: { PATH: process.env.PATH!, LANG: "en_US.UTF-8" }, stdin: "pipe", stdout: "pipe", stderr: "pipe",
    timeout: 3000, killSignal: "SIGKILL"
  })
  child.stdin.write(input); child.stdin.end()
  const [exit, stdout, stderr] = await Promise.all([child.exited,
    new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { exit, stdout, stderr }
}
describe("G12 actual script process, empty credential environment", () => {
  it("import does not read stdin, keys, documents or fetch", async () => {
    const out = await launch(["-e", `globalThis.fetch=()=>{throw new Error('UNEXPECTED_FETCH')};
      await import(${JSON.stringify(entry)}); console.log('IMPORTED_ONLY')`])
    expect(out).toEqual({ exit: 0, stdout: "IMPORTED_ONLY\n", stderr: "" })
  })
  it("returns one fixed JSON refusal for malformed or oversized stdin", async () => {
    for (const raw of ["{", JSON.stringify({ input: { address: "bad" } }), "x".repeat(65537)]) {
      const out = await launch([entry], raw)
      expect(out.exit).toBe(0); expect(out.stderr).toBe("")
      expect(JSON.parse(out.stdout)).toEqual({ stopReason: "refusal", error: "Counterparty Graph input refused" })
    }
  })
  it("refuses absent explicit payer configuration without a fallback Keychain attempt", async () => {
    const out = await launch([entry], JSON.stringify({ jobId: "fixture", input: { address: "0x1111111111111111111111111111111111111111" } }))
    expect(out.exit).toBe(0); expect(out.stderr).toBe("")
    expect(JSON.parse(out.stdout)).toEqual({ stopReason: "refusal", error: "Graph payer key unavailable" })
  })
  it("the real execSkill adapter treats exit-zero protocol refusal as refused, never succeeded", async () => {
    const raw: Record<string, unknown> = JSON.parse(readFileSync(new URL("../arcade.json", import.meta.url), "utf8"))
    // No real environment credential name is consulted; production manifest bytes stay unchanged.
    const manifest = Schema.decodeUnknownSync(SkillManifest)({ ...raw, secrets: [], bounds: { timeoutSec: 5 } })
    const logs: string[] = []
    const outcome = await Effect.runPromise(Effect.scoped(execSkill({ manifest, skillDir,
      jobId: "job_graph_refusal_fixture", input: { address: "0x1111111111111111111111111111111111111111" },
      onLog: value => logs.push(value) })))
    expect(outcome.status).toBe("refused"); expect(outcome.stopReason).toBe("refusal")
    expect(outcome.output).toBeUndefined(); expect(logs).toEqual([])
  })
})
