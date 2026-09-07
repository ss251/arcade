#!/usr/bin/env bun
/** Git-only continuity snapshots. No live service or wallet is contacted. */
import { execFileSync } from "node:child_process"
import {
  constants, openSync, closeSync, fstatSync, readSync, lstatSync,
  mkdtempSync, writeFileSync, chmodSync, renameSync, unlinkSync, rmdirSync
} from "node:fs"
import { join, posix } from "node:path"

export const START = "<!-- continuity:start -->"
export const END = "<!-- continuity:end -->"
const SHA = /^[a-f0-9]{40}$/
const PRIOR = "57183dbab5769d18af8c7077a9b6fd6d4dee78da"
const BASELINE = "6f38178567d89a522a2d67e9ea947273bbc91d58"
const REPO = "https://github.com/ss251/arcade"
const PLANS = "docs/superpowers/plans"
const ROOTS = new Set(["apps", "packages", "scripts", "docs", "skills", "contracts", "config", "subgraph", "lib"])
const ROOT_FILES = new Set(["README.md", "package.json", "vitest.config.ts", "bun.lock", ".gitignore", ".dockerignore"])
const fail = (code: string): never => { throw new Error(code) }

function braces(path: string): string[] {
  if (!/[{}]/.test(path)) return [path]
  const m = /^([^{}]*)\{([^{}]+)\}([^{}]*)$/.exec(path)
  if (!m) return fail("continuity_plan_invalid")
  const parts = m[2]!.split(",")
  if (parts.length < 2 || parts.length > 32 || parts.some(p => p.length === 0)) return fail("continuity_plan_invalid")
  return parts.map(p => m[1]! + p + m[3]!)
}

/** Only the table's path column is interpreted. No Git pathspec magic is accepted. */
export function parsePlanPaths(body: string): string[] {
  const sections = body.split(/^## File structure\r?$/m)
  if (sections.length !== 2) return fail("continuity_plan_invalid")
  const section = sections[1]!.split(/^(?:---|## |### )/m)[0]!
  const paths = new Set<string>()
  for (const line of section.split("\n")) {
    if (!/^\|\s*\x60/.test(line)) continue
    let cell = line.split("|")[1]!.replace(/\([^)]*\)/g, "")
    cell = cell.replace(/\x60([^\x60]+?)(\d+)(\.[^\x60]+)\x60\s*…\s*\x60([^\x60]*?)(\d+)\3\x60/g, (_all, a: string, start: string, ext: string, b: string, end: string) => {
      const first = Number(start), last = Number(end)
      if (posix.basename(a) !== b || last < first || last - first > 32) return fail("continuity_plan_invalid")
      return Array.from({ length: last - first + 1 }, (_, i) => "\u0060" + a + (first + i) + ext + "\u0060").join(", ")
    })
    // Any remaining ellipsis must be the explicit directory suffix inside a path.
    if (cell.replace(/\x60[^\x60]*\/…\x60/g, "").includes("…")) return fail("continuity_plan_invalid")
    let base: string | undefined
    for (const match of cell.matchAll(/\x60([^\x60]+)\x60/g)) {
      for (let path of braces(match[1]!.replace(/:\d+(?:-\d+)?$/, "").replace(/\/…$/, "/"))) {
        if (!/^[A-Za-z0-9_.$/*-]+$/.test(path) || path.startsWith("/") ||
            path.split("/").some(p => p === ".." || p === "." || p === "...")) return fail("continuity_plan_invalid")
        if (!ROOTS.has(path.split("/")[0]!) && !ROOT_FILES.has(path)) {
          if (!base) return fail("continuity_plan_invalid")
          const prefix = base.split("/"), relative = path.split("/")
          let overlap = Math.min(prefix.length, relative.length - 1)
          while (overlap > 0 && prefix.slice(-overlap).join("/") !== relative.slice(0, overlap).join("/")) overlap--
          path = [...prefix.slice(0, prefix.length - overlap), ...relative].join("/")
        }
        if (path.includes("//")) return fail("continuity_plan_invalid")
        base ??= path.endsWith("/") ? path.slice(0, -1) : posix.dirname(path)
        paths.add(path.endsWith("/") ? path + "**" : path)
      }
    }
  }
  if (!paths.size || paths.size > 1024) return fail("continuity_plan_invalid")
  return [...paths].sort()
}

function reader(root: string) {
  const deadline = Date.now() + 30_000
  return (...args: string[]): string => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return fail("continuity_git_timeout")
    try {
      return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: root, encoding: "utf8", timeout: Math.min(5000, remaining), maxBuffer: 4 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C", TZ: "UTC" }
      }).trim()
    } catch { return fail("continuity_git_failed") }
  }
}
const lines = (text: string) => text.split("\n").filter(Boolean)
const commit = (git: ReturnType<typeof reader>, ref: string): string => {
  if (ref !== "HEAD" && !SHA.test(ref)) return fail("continuity_revision_invalid")
  const sha = git("rev-parse", "--verify", ref + "^{commit}")
  return SHA.test(sha) ? sha : fail("continuity_revision_invalid")
}
const count = (git: ReturnType<typeof reader>, range: string) => {
  const n = Number(git("rev-list", "--count", range))
  return Number.isSafeInteger(n) && n >= 0 ? n : fail("continuity_git_invalid")
}
export interface ContinuityOptions { readonly prior?: string; readonly baseline?: string; readonly revision?: string }
export interface ContinuitySnapshot {
  readonly prior: string; readonly baseline: string; readonly revision: string
  readonly priorCount: number; readonly planningCount: number
  readonly afterBaselineCount: number; readonly eventCount: number
  readonly priorDate: string; readonly baselineDate: string
  readonly plans: readonly { readonly letter: string; readonly file: string; readonly paths: readonly string[]; readonly commits: readonly string[] }[]
}
export function generateContinuity(root: string, options: ContinuityOptions = {}): ContinuitySnapshot {
  const git = reader(root)
  const prior = commit(git, options.prior ?? PRIOR), baseline = commit(git, options.baseline ?? BASELINE)
  const revision = commit(git, options.revision ?? "HEAD")
  if (git("merge-base", prior, baseline) !== prior || git("merge-base", baseline, revision) !== baseline)
    return fail("continuity_ancestry_invalid")
  const files = lines(git("ls-tree", "-r", "--name-only", revision, "--", PLANS))
    .filter(file => /\/\d{4}-\d{2}-\d{2}-[A-J]-[a-z0-9-]+\.md$/.test(file)).sort()
  if (!files.length) return fail("continuity_plans_missing")
  const letters = new Set<string>()
  const plans = files.map(file => {
    const letter = /-\d{2}-([A-J])-/.exec(file)![1]!
    if (letters.has(letter)) return fail("continuity_plan_duplicate")
    letters.add(letter)
    const paths = parsePlanPaths(git("show", revision + ":" + file))
    const commits = [...new Set(lines(git("log", "--no-merges", "--full-history", "--topo-order", "--format=%H",
      baseline + ".." + revision, "--", ...paths.map(p => (p.includes("*") ? ":(top,glob)" : ":(top,literal)") + p))))]
    if (commits.some(c => !SHA.test(c))) return fail("continuity_git_invalid")
    return { letter, file, paths, commits }
  }).sort((a, b) => a.letter.localeCompare(b.letter))
  return {
    prior, baseline, revision, priorCount: count(git, prior),
    planningCount: count(git, prior + ".." + baseline),
    afterBaselineCount: count(git, baseline + ".." + revision), eventCount: count(git, prior + ".." + revision),
    priorDate: git("show", "-s", "--format=%aI", prior), baselineDate: git("show", "-s", "--format=%aI", baseline), plans
  }
}
export function renderContinuity(s: ContinuitySnapshot): string {
  const link = (sha: string) => "[\u0060" + sha.slice(0, 7) + "\u0060](" + REPO + "/commit/" + sha + ")"
  const rows = s.plans.map(p => {
    const first = p.commits.at(-1), last = p.commits[0]
    return "| [" + p.letter + "](" + REPO + "/blob/" + s.revision + "/" + p.file + ") | " + p.paths.length + " | " +
      p.commits.length + " | " + (first && last ? link(first) + " → " + link(last) : "no matching path activity") + " |"
  })
  return [
    START, "<!-- continuity:revision " + s.revision + " -->", "",
    "**Snapshot:** " + link(s.revision) + ". Later commits are not included; this is history, not a completion or live-deployment claim.", "",
    "**Pre-existing:** " + s.priorCount + " reachable commits through " + link(s.prior) + " (" + s.priorDate + "), the prior Arc hackathon build.", "",
    "**Planning baseline:** " + link(s.baseline) + " (" + s.baselineDate + "), " + s.planningCount + " commit(s) after the inherited build.", "",
    "**ETHOnline history:** " + s.eventCount + " reachable commits after the prior build, including planning; " + s.afterBaselineCount +
      " after the execution baseline. [Full comparison](" + REPO + "/compare/" + s.prior + "..." + s.revision + ").", "",
    "| Plan | Declared path patterns | Matching non-merge commits | First → last matching commit |",
    "|---|---:|---:|---|", ...rows, "",
    "Counts measure commits touching the plans' declared paths, not exclusive plan ownership, authorship, added lines or completion. They overlap and cannot be summed. Shared files, broad directories and later edits can count in several rows; unlisted implementation paths are not counted. The endpoint links do not define contiguous plan ranges.",
    "Paths come from every first-column entry in the committed File structure tables at this snapshot; sibling paths, braces, numeric ranges, wildcards and directory ellipses are expanded. No current worktree edits enter the result.", "", END
  ].join("\n")
}
function bounds(text: string) {
  const start = text.indexOf(START), end = text.indexOf(END)
  if (start < 0 || end < start || text.indexOf(START, start + 1) >= 0 || text.indexOf(END, end + 1) >= 0)
    return fail("continuity_markers_invalid")
  return { start, end: end + END.length }
}
export function continuityBlock(text: string): { start: number; end: number; text: string; revision: string } {
  const b = bounds(text), block = text.slice(b.start, b.end)
  const pins = [...block.matchAll(/^<!-- continuity:revision ([a-f0-9]{40}) -->$/gm)]
  if (pins.length !== 1 || block.split("<!-- continuity:revision").length !== 2) return fail("continuity_revision_invalid")
  return { ...b, text: block, revision: pins[0]![1]! }
}
type Args = { mode: "print" | "write" | "check" | "help"; revision?: string }
export function parseContinuityArgs(args: readonly string[]): Args {
  const out: Args = { mode: "print" }, seen = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (seen.has(arg)) return fail("continuity_usage")
    seen.add(arg)
    if (arg === "--revision") {
      const revision = args[++i]
      if (!revision || !SHA.test(revision)) return fail("continuity_usage")
      out.revision = revision
    } else if (arg === "--write" || arg === "--check" || arg === "--help") {
      if (out.mode !== "print") return fail("continuity_usage")
      out.mode = arg.slice(2) as "write" | "check" | "help"
    } else return fail("continuity_usage")
  }
  if ((out.mode === "check" || out.mode === "help") && out.revision) return fail("continuity_usage")
  return out
}
function readReadme(root: string) {
  const path = join(root, "README.md")
  let fd: number | undefined
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024) return fail("continuity_readme_invalid")
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1)
    let length = 0
    while (length < buffer.length) {
      const n = readSync(fd, buffer, length, buffer.length - length, null)
      if (n === 0) break
      length += n
    }
    const bytes = buffer.subarray(0, length), text = bytes.toString("utf8")
    if (length !== stat.size || !Buffer.from(text).equals(bytes)) return fail("continuity_readme_invalid")
    return { path, stat, text }
  } catch { return fail("continuity_readme_invalid") }
  finally { if (fd !== undefined) closeSync(fd) }
}
function replaceReadme(root: string, original: ReturnType<typeof readReadme>, next: string) {
  const dir = mkdtempSync(join(root, ".continuity-write-")), temp = join(dir, "README.md")
  try {
    writeFileSync(temp, next, { flag: "wx", mode: 0o600 })
    chmodSync(temp, original.stat.mode & 0o777)
    const current = readReadme(root), stat = lstatSync(original.path)
    if (stat.dev !== original.stat.dev || stat.ino !== original.stat.ino || current.text !== original.text)
      return fail("continuity_readme_changed")
    renameSync(temp, original.path)
  } finally {
    try { unlinkSync(temp) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    rmdirSync(dir)
  }
}
export function runContinuity(root: string, args: readonly string[], options: Omit<ContinuityOptions, "revision"> = {}): string {
  const flags = parseContinuityArgs(args)
  if (flags.mode === "help") return "continuity [--revision FULL_SHA] [--write] | --check | --help\nPrint a Git snapshot; write only an existing README block; check its pinned snapshot, reporting newer excluded commits. No network or Git mutation."
  const selected = { ...options, ...(flags.revision ? { revision: flags.revision } : {}) }
  if (flags.mode === "print") return renderContinuity(generateContinuity(root, selected))
  const original = readReadme(root)
  if (flags.mode === "check") {
    const b = continuityBlock(original.text), snapshot = generateContinuity(root, { ...options, revision: b.revision })
    if (renderContinuity(snapshot) !== b.text) return fail("continuity_stale")
    const git = reader(root), head = commit(git, "HEAD")
    if (git("merge-base", b.revision, head) !== b.revision) return fail("continuity_ancestry_invalid")
    return "continuity matches recorded snapshot " + b.revision + "; " + count(git, b.revision + ".." + head) + " newer commit(s) excluded"
  }
  const b = bounds(original.text), next = renderContinuity(generateContinuity(root, selected))
  replaceReadme(root, original, original.text.slice(0, b.start) + next + original.text.slice(b.end))
  return "README continuity snapshot updated; unrelated bytes preserved"
}
if (import.meta.main) {
  try { console.log(runContinuity(process.cwd(), process.argv.slice(2))) }
  catch (error) {
    console.error(error instanceof Error && /^continuity_[a-z_]+$/.test(error.message) ? error.message : "continuity_failed")
    process.exitCode = 1
  }
}
