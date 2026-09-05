import { afterEach, describe, expect, it, vi } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { JobOutcome, SkillManifest } from "@arcade/core"
import { Schema } from "effect"
import { runPublishAdaptersEvidence } from "../src/publish-adapters-evidence.ts"

const repo = fileURLToPath(new URL("../../../", import.meta.url))
const ids = ["diff-triage", "search-arc-docs", "fx-rate"]
const listings = ids.map((id) => ({ dir: join(repo, "skills", id), manifest: Schema.decodeUnknownSync(SkillManifest)(
  JSON.parse(readFileSync(join(repo, "skills", id, "arcade.json"), "utf8"))) }))
const success = () => JobOutcome.make({ status: "succeeded", stopReason: "end_turn", output: { ok: true }, startedAtMs: 1, finishedAtMs: 2 })
const setup = () => ({ load: vi.fn().mockResolvedValue(listings), execute: vi.fn().mockResolvedValue(success()), log: vi.fn() })
const text = (deps: ReturnType<typeof setup>) => deps.log.mock.calls.flat().join("\n")
const dirs: string[] = []
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), "arcade-adapter-evidence-")); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe("publish adapter evidence", () => {
  it("runs all three adapters by default and reports the full result", async () => {
    const deps = setup()
    expect(await runPublishAdaptersEvidence([], deps)).toBe(0)
    expect(deps.load).toHaveBeenCalledWith(join(repo, "skills"))
    expect(deps.execute.mock.calls.map(([args]) => args.manifest.id)).toEqual(ids)
    expect(deps.execute.mock.calls.map(([args]) => args.input)).toEqual([
      { diff: "--- a/x.ts\n+++ b/x.ts\n-const a = 1\n+const a = 2" },
      { query: "gateway nanopayments" }, { base: "USD", symbols: "EUR" }
    ])
    expect(text(deps)).toMatch(/FULL.*3\/3/)
    expect(text(deps)).toMatch(/3 succeeded, 0 failed/)
    expect(text(deps)).toContain("Local execution only; no hub or payment settlement is exercised")
  })

  it("labels an explicit repeated selection as partial and names excluded cases", async () => {
    const deps = setup()
    expect(await runPublishAdaptersEvidence(["--only", "fx-rate", "--only", "search-arc-docs", "--only", "fx-rate"], deps)).toBe(0)
    expect(deps.execute.mock.calls.map(([args]) => args.manifest.id)).toEqual(["search-arc-docs", "fx-rate"])
    expect(text(deps)).toMatch(/PARTIAL.*2\/3/)
    expect(text(deps)).toContain("Not selected: diff-triage")
    expect(text(deps)).toMatch(/2 succeeded, 0 failed/)
  })

  it.each([["--yes"], ["--only"], ["--only", "PRIVATE_UNKNOWN"], ["--only", "--help"]])(
    "refuses invalid selectors before any loading or execution", async (...argv) => {
      const deps = setup()
      expect(await runPublishAdaptersEvidence(argv, deps)).not.toBe(0)
      expect(deps.load).not.toHaveBeenCalled()
      expect(deps.execute).not.toHaveBeenCalled()
      expect(text(deps)).not.toContain("PRIVATE_UNKNOWN")
    })

  it("reports missing listings as failures and still attempts available cases", async () => {
    const deps = setup()
    deps.load.mockResolvedValue(listings.slice(1))
    expect(await runPublishAdaptersEvidence([], deps)).toBe(1)
    expect(deps.execute.mock.calls.map(([args]) => args.manifest.id)).toEqual(["search-arc-docs", "fx-rate"])
    expect(text(deps)).toMatch(/diff-triage\s+MISSING/)
    expect(text(deps)).toMatch(/2 succeeded, 1 failed/)
  })

  it.each(["failed", "invalid", "refused", "timeout", "bounds_exceeded", "rejected", "runner_lost"] as const)(
    "returns failure for %s while continuing independent cases", async (status) => {
      const deps = setup()
      deps.execute.mockResolvedValueOnce(JobOutcome.make({ ...success(), status, error: "PRIVATE_CREDENTIAL" }))
      expect(await runPublishAdaptersEvidence([], deps)).toBe(1)
      expect(deps.execute).toHaveBeenCalledTimes(3)
      expect(text(deps)).toMatch(/2 succeeded, 1 failed/)
      expect(text(deps)).not.toContain("PRIVATE_CREDENTIAL")
    })

  it.each([undefined, "incomplete", "refusal:PRIVATE_DIAGNOSTIC"])("requires an explicit end_turn, received %s", async (stopReason) => {
    const deps = setup()
    deps.execute.mockResolvedValueOnce(JobOutcome.make({ status: "succeeded", output: { ok: true }, startedAtMs: 1, finishedAtMs: 2,
      ...(stopReason === undefined ? {} : { stopReason }) }))
    expect(await runPublishAdaptersEvidence([], deps)).toBe(1)
    expect(deps.execute).toHaveBeenCalledTimes(3)
    expect(text(deps)).not.toContain("PRIVATE_DIAGNOSTIC")
  })

  it.each([undefined, null, "", " ", [], {}])("refuses empty output despite succeeded/end_turn", async (output) => {
    const deps = setup()
    deps.execute.mockResolvedValueOnce(JobOutcome.make({ ...success(), output }))
    expect(await runPublishAdaptersEvidence([], deps)).toBe(1)
    expect(text(deps)).toMatch(/2 succeeded, 1 failed/)
  })

  it("summarizes an execution exception without printing private diagnostics or output", async () => {
    const deps = setup()
    deps.execute.mockRejectedValueOnce(new Error("PRIVATE_URL PRIVATE_TOKEN"))
      .mockResolvedValue(JobOutcome.make({ ...success(), output: { text: "PRIVATE_OUTPUT" } }))
    expect(await runPublishAdaptersEvidence([], deps)).toBe(1)
    expect(deps.execute).toHaveBeenCalledTimes(3)
    expect(text(deps)).toMatch(/2 succeeded, 1 failed/)
    expect(text(deps)).not.toMatch(/PRIVATE_/)
  })

  it("refuses a substituted adapter without executing it", async () => {
    const deps = setup()
    deps.load.mockResolvedValue([{ ...listings[0], manifest: { ...listings[0]!.manifest, engine: listings[1]!.manifest.engine } }])
    expect(await runPublishAdaptersEvidence(["--only", "diff-triage"], deps)).toBe(1)
    expect(deps.execute).not.toHaveBeenCalled()
  })

  it("summarizes a loader failure as incomplete evidence without leaking details", async () => {
    const deps = setup()
    deps.load.mockRejectedValue(new Error("PRIVATE_FILESYSTEM_PATH"))
    expect(await runPublishAdaptersEvidence([], deps)).toBe(1)
    expect(deps.execute).not.toHaveBeenCalled()
    expect(text(deps)).toMatch(/0 succeeded, 3 failed/)
    expect(text(deps)).not.toContain("PRIVATE_FILESYSTEM_PATH")
  })

})

describe("evidence entry points", () => {
  it("the real shell never reloads repository dotenv through a nested package script", () => {
    const dir = scratch()
    mkdirSync(join(dir, "scripts"), { recursive: true })
    mkdirSync(join(dir, "packages/runner/src"), { recursive: true })
    writeFileSync(join(dir, "scripts/e2e-publish-adapters.sh"), readFileSync(join(repo, "scripts/e2e-publish-adapters.sh")))
    const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { scripts: { arcade: string } }
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { arcade: pkg.scripts.arcade } }))
    writeFileSync(join(dir, ".env"), "EVIDENCE_UNDECLARED=DOTENV_SENTINEL\nANTHROPIC_AUTH_TOKEN=DOTENV_SENTINEL\n")
    const fixture = `if (process.env.EVIDENCE_UNDECLARED || process.env.ANTHROPIC_AUTH_TOKEN) { console.error("dotenv reloaded"); process.exit(71); } console.log("isolated fixture");\n`
    writeFileSync(join(dir, "packages/runner/src/cli.ts"), fixture)
    writeFileSync(join(dir, "scripts/e2e-publish-adapters.ts"), fixture)
    const result = spawnSync("/bin/bash", [join(dir, "scripts/e2e-publish-adapters.sh")], {
      cwd: dir, env: { PATH: process.env["PATH"] ?? "", HOME: dir }, encoding: "utf8", timeout: 10_000
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.match(/isolated fixture/g)).toHaveLength(6)
    expect(result.stderr).not.toContain("dotenv reloaded")
  })

  it.each(["missing", "failed", "incomplete"])("the real wrapper exits nonzero for %s from any cwd", (mode) => {
    const dir = scratch()
    const resolver = createRequire(import.meta.url).resolve
    const preload = join(dir, "offline.ts")
    writeFileSync(preload, `
import { mock } from "bun:test";
import { Effect } from ${JSON.stringify(resolver("effect"))};
const listings = ${JSON.stringify(listings)};
mock.module(${JSON.stringify(fileURLToPath(new URL("../src/skills.ts", import.meta.url)))}, () => ({ loadSkills: (dir) => {
  if (dir !== ${JSON.stringify(join(repo, "skills"))}) throw new Error("wrong skill directory");
  return Effect.succeed(${JSON.stringify(mode)} === "missing" ? listings.slice(1) : listings);
} }));
mock.module(${JSON.stringify(fileURLToPath(new URL("../src/exec.ts", import.meta.url)))}, () => ({ execSkill: ({ manifest }) =>
  Effect.succeed({ status: manifest.id === "diff-triage" && ${JSON.stringify(mode)} === "failed" ? "failed" : "succeeded",
    stopReason: manifest.id === "diff-triage" && ${JSON.stringify(mode)} === "incomplete" ? "incomplete" : "end_turn",
    output: { ok: true }, error: "PRIVATE_WRAPPER_ERROR", startedAtMs: 1, finishedAtMs: 2 })
}));
`)
    const result = spawnSync("bun", ["run", `--preload=${preload}`, join(repo, "scripts/e2e-publish-adapters.ts")], {
      cwd: dir, env: { PATH: process.env["PATH"] ?? "", HOME: dir }, encoding: "utf8", timeout: 10_000
    })
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout, result.stderr).toMatch(/FULL.*3\/3/)
    expect(result.stdout).toMatch(/2 succeeded, 1 failed/)
    expect(result.stdout + result.stderr).not.toContain("PRIVATE_WRAPPER_ERROR")
  })

  it.each([false, true])("the actual shell forwards selection and preserves pipeline failures (fail: %s)", (fail) => {
    const dir = scratch()
    const calls = join(dir, "calls")
    writeFileSync(join(dir, "bun"), `#!/bin/sh
printf '%s\\n' "cwd=$PWD" "$*" >> "$EVIDENCE_CALLS_FILE"
if [ "\${1-}" = "--no-env-file" ]; then shift; fi
if [ "$EVIDENCE_FAIL_PREVIEW" = "yes" ] && [ "$*" = "run packages/runner/src/cli.ts publish skills/diff-triage" ]; then
  exit 23
fi
printf '%s\\n' 'offline command fixture'
`, { mode: 0o755 })
    const result = spawnSync(join(repo, "scripts/e2e-publish-adapters.sh"), ["--only", "search-arc-docs", "--only", "fx-rate"], {
      cwd: dir, env: { PATH: `${dir}:${process.env["PATH"] ?? ""}`, HOME: dir,
        EVIDENCE_CALLS_FILE: calls, EVIDENCE_FAIL_PREVIEW: fail ? "yes" : "no" },
      encoding: "utf8", timeout: 10_000
    })
    const commands = readFileSync(calls, "utf8")
    const invocations = commands.split("\n").filter((line) => line !== "" && !line.startsWith("cwd="))
    expect(invocations.length).toBeGreaterThan(0)
    expect(invocations.every((line) => line.startsWith("--no-env-file run "))).toBe(true)
    expect(commands.split("\n").filter((line) => line.startsWith("cwd="))).not.toHaveLength(0)
    expect(commands.split("\n").filter((line) => line.startsWith("cwd=")).every((line) => line === `cwd=${repo.replace(/\/$/, "")}`)).toBe(true)
    if (fail) {
      expect(result.status, result.stderr).toBe(23)
      expect(commands).not.toContain("run scripts/e2e-publish-adapters.ts")
    } else {
      expect(result.status, result.stderr).toBe(0)
      expect(commands).toContain("run scripts/e2e-publish-adapters.ts --only search-arc-docs --only fx-rate")
    }
  })
})
