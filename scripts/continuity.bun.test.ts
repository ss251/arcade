import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  parsePlanPaths, generateContinuity, renderContinuity, continuityBlock,
  parseContinuityArgs, runContinuity, START, END
} from "./continuity.ts"

const table = (cell: string) => "## File structure\n\n| path | purpose |\n|---|---|\n| " + cell + " | test |\n\n---\n"
describe("continuity declared paths", () => {
  test("collects every path and sibling abbreviation, not responsibility code", () => {
    expect(parsePlanPaths(table("\u0060packages/core/test/a.ts\u0060, \u0060b.ts\u0060, \u0060fixtures/c.json\u0060"))).toEqual([
      "packages/core/test/a.ts", "packages/core/test/b.ts", "packages/core/test/fixtures/c.json"
    ])
    expect(parsePlanPaths(table("\u0060scripts/a.ts\u0060, \u0060package.json\u0060"))).toEqual(["package.json", "scripts/a.ts"])
  })
  test("resolves an overlapping relative directory without duplicating it", () => {
    expect(parsePlanPaths(table("\u0060packages/runner/test/fixtures/a.json\u0060, \u0060fixtures/b.json\u0060"))).toEqual([
      "packages/runner/test/fixtures/a.json", "packages/runner/test/fixtures/b.json"
    ])
  })
  test("expands braces, numeric ranges, globs and directory ellipses", () => {
    expect(parsePlanPaths(table("\u0060skills/fx/{arcade.json,openapi.json}\u0060"))).toEqual(["skills/fx/arcade.json", "skills/fx/openapi.json"])
    expect(parsePlanPaths(table("\u0060docs/narration/README.md\u0060, \u0060beat-1.txt\u0060 … \u0060beat-3.txt\u0060"))).toEqual([
      "docs/narration/README.md", "docs/narration/beat-1.txt", "docs/narration/beat-2.txt", "docs/narration/beat-3.txt"
    ])
    expect(parsePlanPaths(table("\u0060subgraph/…\u0060, \u0060skills/*/arcade.json\u0060"))).toEqual(["skills/*/arcade.json", "subgraph/**"])
    expect(parsePlanPaths(table("\u0060contracts/vendor/erc8183/\u0060 (or under \u0060lib/\u0060)"))).toEqual(["contracts/vendor/erc8183/**"])
  })
  test.each(["../secret", "/absolute", "apps/../secret", "apps/a.ts:evil", "bare.ts", "apps/{a,{b,c}}", "apps/.../x"])("refuses unsupported path %s", p => {
    expect(() => parsePlanPaths(table("\u0060" + p + "\u0060"))).toThrow("continuity_plan_invalid")
  })
  test("refuses absent/empty tables and unreasonable ranges", () => {
    for (const t of ["", "## File structure\n\n---\n", table("\u0060docs/b1.txt\u0060 … \u0060b999.txt\u0060")])
      expect(() => parsePlanPaths(t)).toThrow("continuity_plan_invalid")
  })
})

function fixture(fn: (root: string, refs: { prior: string; baseline: string; revision: string }, record: (path: string, body: string) => string) => void) {
  const root = mkdtempSync(join(tmpdir(), "arcade-continuity-test-"))
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }
  }).trim()
  const put = (p: string, body: string) => { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), body) }
  const commit = (msg: string) => { git("add", "--all"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", msg); return git("rev-parse", "HEAD") }
  try {
    git("init", "-b", "main")
    put("README.md", "before\n" + START + "\nplaceholder\n" + END + "\nafter\n")
    put("apps/shared.ts", "old\n")
    const prior = commit("prior")
    put("docs/superpowers/plans/2026-09-04-A-test.md", table("\u0060apps/shared.ts\u0060"))
    put("docs/superpowers/plans/2026-09-04-I-test.md", table("\u0060README.md\u0060"))
    const baseline = commit("planning")
    put("apps/shared.ts", "new\n")
    commit("shared change")
    put("docs/superpowers/plans/2026-09-06-J-test.md", table("\u0060apps/shared.ts\u0060"))
    const revision = commit("new dated plan")
    fn(root, { prior, baseline, revision }, (p, body) => { put(p, body); return commit("later fixture") })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

describe("continuity real Git history and snapshot", () => {
  test("separates the two boundaries and includes J with overlapping activity", () => fixture((root, refs) => {
    const s = generateContinuity(root, refs)
    expect(s.priorCount).toBe(1)
    expect(s.planningCount).toBe(1)
    expect(s.afterBaselineCount).toBe(2)
    expect(s.eventCount).toBe(3)
    expect(s.plans.map(p => p.letter)).toEqual(["A", "I", "J"])
    expect(s.plans.map(p => p.commits.length)).toEqual([1, 0, 1])
    expect(renderContinuity(s)).toContain("cannot be summed")
    expect(renderContinuity(s)).not.toContain("not started")
  }))
  test("reads committed plans rather than dirty copies and resolves a fixed snapshot", () => fixture((root, refs) => {
    const before = renderContinuity(generateContinuity(root, refs))
    writeFileSync(join(root, "docs/superpowers/plans/2026-09-04-A-test.md"), "uncommitted invalid")
    expect(renderContinuity(generateContinuity(root, refs))).toBe(before)
    expect(continuityBlock(before).revision).toBe(refs.revision)
  }))
  test("write preserves unrelated README bytes, check is read-only, repeat is deterministic", () => fixture((root, refs) => {
    const options = { prior: refs.prior, baseline: refs.baseline }
    runContinuity(root, ["--write", "--revision", refs.revision], options)
    const content = readFileSync(join(root, "README.md"), "utf8")
    expect(content.startsWith("before\n" + START)).toBe(true)
    expect(content.endsWith(END + "\nafter\n")).toBe(true)
    expect(runContinuity(root, ["--check"], options)).toContain("matches recorded snapshot")
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe(content)
    runContinuity(root, ["--write", "--revision", refs.revision], options)
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe(content)
    writeFileSync(join(root, "README.md"), content.replace("cannot be summed", "can be summed"))
    expect(() => runContinuity(root, ["--check"], options)).toThrow("continuity_stale")
  }))
  test("a recorded snapshot survives its own commit and reports newer excluded history", () => fixture((root, refs, record) => {
    runContinuity(root, ["--write", "--revision", refs.revision], refs)
    const text = readFileSync(join(root, "README.md"), "utf8")
    record("README.md", text)
    expect(runContinuity(root, ["--check"], refs)).toContain("1 newer commit(s) excluded")
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe(text)
    expect(readdirSync(root).some(p => p.startsWith(".continuity-write-"))).toBe(false)
  }))
  test("duplicate plan letters fail instead of silently replacing a row", () => fixture((root, refs, record) => {
    const revision = record("docs/superpowers/plans/2026-09-08-A-duplicate.md", table("\u0060apps/shared.ts\u0060"))
    expect(() => generateContinuity(root, { ...refs, revision })).toThrow("continuity_plan_duplicate")
  }))
  test("refuses hardlinks and non-UTF8 input without changing unrelated bytes", () => fixture((root, refs) => {
    const path = join(root, "README.md"), other = join(root, "other.md")
    linkSync(path, other)
    const original = readFileSync(other)
    expect(() => runContinuity(root, ["--write"], refs)).toThrow("continuity_readme_invalid")
    expect(readFileSync(other)).toEqual(original)
    rmSync(other)
    const invalid = Buffer.from([255, 254, 0, 97])
    writeFileSync(path, invalid)
    expect(() => runContinuity(root, ["--write"], refs)).toThrow("continuity_readme_invalid")
    expect(readFileSync(path)).toEqual(invalid)
  }))
  test("refuses wrong ancestry, missing markers and a symlink without touching its target", () => fixture((root, refs) => {
    expect(() => generateContinuity(root, { ...refs, prior: refs.revision })).toThrow("continuity_ancestry_invalid")
    const path = join(root, "README.md"), other = join(root, "other.md")
    writeFileSync(path, "no markers\n")
    expect(() => runContinuity(root, ["--write"], refs)).toThrow("continuity_markers_invalid")
    expect(readFileSync(path, "utf8")).toBe("no markers\n")
    writeFileSync(other, "private unrelated\n")
    rmSync(path)
    symlinkSync(other, path)
    expect(() => runContinuity(root, ["--write"], refs)).toThrow("continuity_readme_invalid")
    expect(readFileSync(other, "utf8")).toBe("private unrelated\n")
  }))
})

describe("continuity strict command and block boundaries", () => {
  test.each([["--wat"], ["--check", "--write"], ["--revision"], ["--revision", "HEAD"], ["--revision", "--help"], ["--help", "--write"], ["--check", "--revision", "a".repeat(40)], ["--write", "--write"]].map(args => ({ args })))("refuses ambiguous flags %j", ({ args }) => {
    expect(() => parseContinuityArgs(args)).toThrow("continuity_usage")
  })
  test("allows only the documented command modes", () => {
    expect(parseContinuityArgs([])).toEqual({ mode: "print" })
    expect(parseContinuityArgs(["--check"])).toEqual({ mode: "check" })
    expect(parseContinuityArgs(["--help"])).toEqual({ mode: "help" })
    expect(parseContinuityArgs(["--revision", "a".repeat(40), "--write"])).toEqual({ mode: "write", revision: "a".repeat(40) })
  })
  test.each([
    "", END + START, START + START + END,
    START + "\n<!-- continuity:revision " + "a".repeat(40) + " -->\n" + END + END,
    START + "\n<!-- continuity:revision " + "a".repeat(40) + " -->\n<!-- continuity:revision " + "b".repeat(40) + " -->\n" + END
  ])("rejects malformed or duplicate marker blocks", text => {
    expect(() => continuityBlock(text)).toThrow()
  })
})
