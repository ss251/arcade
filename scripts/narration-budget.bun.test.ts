import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const script = resolve(import.meta.dir, "narration-budget.sh")
const run = (...args: string[]) => spawnSync("/bin/bash", ["--noprofile", "--norc", script, ...args], {
  cwd: tmpdir(), env: { PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 2000, maxBuffer: 65536
})
function fixture(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "arcade-narration-test-"))
  try {
    for (let beat = 1; beat <= 8; beat++) writeFileSync(join(dir, `beat-${beat}.txt`), "one spoken word\n")
    fn(dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
test("eight exact boundary word counts pass in 225 seconds without claiming measured audio", () => fixture(dir => {
  const budgets = [75, 55, 112, 57, 80, 50, 57, 75]
  budgets.forEach((n, i) => writeFileSync(join(dir, `beat-${i + 1}.txt`), "word ".repeat(n)))
  const result = run(dir)
  expect(result.status).toBe(0)
  expect(result.stdout).toContain("225s (3m45s)")
  expect(result.stdout).toContain("actual human voice duration is still unverified")
  expect(result.stdout.match(/^beat-/gm)).toHaveLength(8)
}))
test("over-budget text refuses without changing it", () => fixture(dir => {
  const path = join(dir, "beat-1.txt"), text = "word ".repeat(76)
  writeFileSync(path, text)
  expect(run(dir).stderr).toContain("narration_over_budget")
  expect(run(dir).status).toBe(1)
  expect(readFileSync(path, "utf8")).toBe(text)
}))
test("missing and extra beats refuse", () => fixture(dir => {
  rmSync(join(dir, "beat-8.txt"))
  expect(run(dir).stderr).toContain("exactly_eight")
  writeFileSync(join(dir, "beat-8.txt"), "eight")
  writeFileSync(join(dir, "beat-9.txt"), "nine")
  expect(run(dir).stderr).toContain("exactly_eight")
}))
test("eight files with a wrong beat name do not pass by count", () => fixture(dir => {
  rmSync(join(dir, "beat-8.txt")); writeFileSync(join(dir, "beat-other.txt"), "other")
  expect(run(dir).stderr).toContain("narration_beat_invalid: beat-8")
}))
test("empty, whitespace-only and oversized beats refuse", () => fixture(dir => {
  for (const text of ["", " \n\t", "a".repeat(8193)]) {
    writeFileSync(join(dir, "beat-2.txt"), text)
    expect(run(dir).status).toBe(1)
  }
}))
test("symlinked beat and directory are not read as the submitted text", () => fixture(dir => {
  const target = join(dir, "target.txt"), beat = join(dir, "beat-1.txt")
  writeFileSync(target, "keep unchanged"); rmSync(beat); symlinkSync(target, beat)
  expect(run(dir).stderr).toContain("narration_beat_invalid")
  const link = join(dir, "linked"); symlinkSync(dir, link)
  expect(run(link).stderr).toContain("narration_directory_invalid")
  expect(readFileSync(target, "utf8")).toBe("keep unchanged")
}))
test("extra arguments refuse", () => {
  expect(run("one", "two").status).toBe(1)
  expect(run("one", "two").stderr).toContain("usage:")
})
test("the actual eight human-voice scripts fit, independent of caller directory", () => {
  expect(run().status).toBe(0)
  expect(run().stdout).toContain("225s (3m45s)")
})
