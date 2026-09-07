#!/usr/bin/env bun
/** Local, read-only checks of trusted checkout artifacts. Never a submission or live-proof certificate. */
import { constants, openSync, closeSync, fstatSync, readSync, lstatSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { join, resolve } from "node:path"
import { runContinuity } from "./continuity.ts"
import { renderInputs } from "./render-diagram.ts"

const bad = (): never => { throw new Error("packaging_evidence_invalid") }
function requireThat(value: unknown): asserts value { if (!value) bad() }
const hash = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex")
const record = (value: unknown): Record<string, unknown> => {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value))
  return value as Record<string, unknown>
}

/** Only regular, single-link local assets. This is not an adversarial-filesystem sandbox. */
function openAsset(root: string, path: string, max: number): number {
  requireThat(Number.isSafeInteger(max) && max > 0 && max <= 2_147_483_648)
  requireThat(/^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith("/") && !path.split("/").some(p => !p || p === "." || p === ".."))
  const parts = path.split("/")
  for (let count = 0; count < parts.length; count++) {
    const stat = lstatSync(join(root, ...parts.slice(0, count)))
    requireThat(stat.isDirectory() && !stat.isSymbolicLink())
  }
  const fd = openSync(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    requireThat(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= max)
    return fd
  } catch (error) { closeSync(fd); throw error }
}
export function readPackagingAsset(root: string, path: string, max: number): Buffer {
  const fd = openAsset(root, path, max)
  try {
    const size = fstatSync(fd).size, bytes = Buffer.alloc(size + 1)
    let count = 0
    while (count < bytes.length) {
      const n = readSync(fd, bytes, count, bytes.length - count, count)
      if (!n) break
      count += n
    }
    requireThat(count === size && fstatSync(fd).size === size)
    return bytes.subarray(0, count)
  } finally { closeSync(fd) }
}
function textAsset(root: string, path: string): string {
  const bytes = readPackagingAsset(root, path, 2 * 1024 * 1024), text = bytes.toString("utf8")
  requireThat(Buffer.from(text).equals(bytes))
  return text
}
export function checkReadmeSections(text: string): void {
  const pieces = text.split(/^## ETHOnline 2026\r?$/m)
  requireThat(pieces.length === 2)
  const section = pieces[1]!.split(/^## /m)[0]!
  const headings = [...section.matchAll(/^### ([^\r\n]+)\r?$/gm)].map(m => m[1])
  requireThat(isDeepStrictEqual(headings, ["Continuity declaration", "Reused unchanged", "AI assistance", "Tests", "Partner prizes", "Guarantees, and what is not guaranteed", "Mainnet"]))
}
export function checkShotTimeline(text: string): number {
  const rows = text.split("\n").filter(line => /^\|\s*\d+\s*\|/.test(line))
  const windows = [30, 22, 45, 23, 32, 20, 23, 30]
  requireThat(rows.length === windows.length)
  let seconds = 0
  rows.forEach((line, index) => {
    const m = /^\| ([1-8]) \| (\d+)s \| (\d+):([0-5]\d) → (\d+):([0-5]\d) \|/.exec(line)
    requireThat(m && Number(m[1]) === index + 1 && Number(m[2]) === windows[index])
    requireThat(Number(m[3]) * 60 + Number(m[4]) === seconds)
    seconds += Number(m[2])
    requireThat(Number(m[5]) * 60 + Number(m[6]) === seconds)
  })
  requireThat(seconds === 225)
  return seconds
}
export function checkVideoProbe(value: unknown): { duration: number; width: number; height: number; fps: number; frames: number } {
  const data = record(value), durationText = record(data.format).duration
  requireThat(typeof durationText === "string" && /^\d{1,3}(?:\.\d{1,9})?$/.test(durationText))
  const duration = Number(durationText)
  requireThat(duration >= 120 && duration <= 240 && Array.isArray(data.streams) && data.streams.length === 2)
  const streams = data.streams.map(record), videos = streams.filter(s => s.codec_type === "video"), audios = streams.filter(s => s.codec_type === "audio")
  requireThat(videos.length === 1 && audios.length === 1)
  const v = videos[0]!, width = v.width, height = v.height
  requireThat(typeof width === "number" && Number.isSafeInteger(width) && typeof height === "number" && Number.isSafeInteger(height))
  requireThat(height >= 720 && height <= 2160 && width * 9 === height * 16)
  requireThat(typeof v.avg_frame_rate === "string" && /^\d{1,8}\/\d{1,8}$/.test(v.avg_frame_rate))
  const [n, d] = v.avg_frame_rate.split("/").map(Number), fps = n! / d!
  requireThat(Number.isFinite(fps) && fps >= 24 && fps <= 60)
  requireThat(typeof v.nb_read_frames === "string" && /^[1-9]\d{0,5}$/.test(v.nb_read_frames))
  const frames = Number(v.nb_read_frames)
  requireThat(Math.abs(frames - duration * fps) <= Math.max(2, duration * fps * 0.1))
  return { duration, width, height, fps, frames }
}

export interface PackagingCheck { readonly id: string; readonly status: "pass" | "fail" | "missing" | "not_checked"; readonly detail: string }
export interface PackagingReport {
  readonly version: 1; readonly mode: "local-read-only"; readonly status: "incomplete";
  readonly submissionReady: false; readonly fullGate: "not_run"; readonly liveEvidence: "not_verified";
  readonly checks: readonly PackagingCheck[]
}
function command(root: string, file: string, args: readonly string[], timeout: number, fd?: number): string {
  return execFileSync(file, [...args], {
    cwd: root, encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: "C", PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" },
    stdio: fd === undefined ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe", fd]
  })
}

export function runPackagingEvidence(root: string): PackagingReport {
  const checks: PackagingCheck[] = []
  const check = (id: string, fn: () => string) => {
    try { checks.push({ id, status: "pass", detail: fn() }) }
    catch (error) { checks.push({ id, status: (error as NodeJS.ErrnoException)?.code === "ENOENT" ? "missing" : "fail", detail: `${id}_unavailable` }) }
  }
  check("continuity", () => runContinuity(root, ["--check"]))
  check("readme-sections", () => { checkReadmeSections(textAsset(root, "README.md")); return "exact seven ETHOnline headings" })
  check("private-paths", () => {
    requireThat(command(root, "git", ["-c", "core.hooksPath=/dev/null", "ls-files", "-z", "--", "internal", "handoff"], 5000) === "")
    return "zero tracked internal/handoff paths; not a comprehensive secret scan"
  })
  check("diagram-source", () => {
    const generated: unknown = JSON.parse(command(root, "python3", ["-I", "-B", "-c", `import json,runpy,sys
out=[]
for dark in [False,True]:
    sys.argv=["diagram.py"]+(["--dark"] if dark else [])
    module=runpy.run_path("scripts/diagram.py")
    out.append({"scene":module["scene"](),"mermaid":module["mermaid_source"]()})
print(json.dumps(out))`], 10000))
    requireThat(Array.isArray(generated) && generated.length === 2)
    for (const [index, path] of ["docs/architecture.excalidraw", "docs/architecture-dark.excalidraw"].entries()) {
      requireThat(isDeepStrictEqual(record(generated[index]).scene, JSON.parse(textAsset(root, path))))
      requireThat(record(generated[index]).mermaid === textAsset(root, "docs/architecture.mmd"))
    }
    return "both scenes and Mermaid regenerated in memory; no artifact writes"
  })
  check("diagram-record", () => {
    const doc = record(JSON.parse(textAsset(root, "docs/evidence/I/diagram-render.json")))
    requireThat(doc.complete === true && Array.isArray(doc.inputs) && doc.inputs.length === 5)
    const current = renderInputs(root), expected = doc.inputs.map(record)
    requireThat(isDeepStrictEqual(current.map(i => ({ name: i.name, sha256: hash(i.source) })), expected))
    const results = record(doc.results)
    for (const name of ["architecture", "architecture-dark"]) {
      requireThat(hash(readPackagingAsset(root, `docs/${name}.png`, 12 * 1024 * 1024)) === record(results[name]).pngSha256)
    }
    return "five source hashes and two PNGs match retained DOM record; not a fresh render"
  })
  check("narration", () => {
    const output = command(root, "/bin/bash", ["--noprofile", "--norc", "scripts/narration-budget.sh"], 5000)
    requireThat(output.includes("total window: 225s (3m45s)") && output.includes("actual human voice duration is still unverified"))
    return "eight word budgets pass; actual voice unverified"
  })
  check("shot-timeline", () => `${checkShotTimeline(textAsset(root, "docs/video/ethonline-2026-shotlist.md"))} seconds, eight contiguous windows; not measured footage`)
  check("partner-rows", () => {
    const text = textAsset(root, "docs/submission-checklist.md")
    requireThat(isDeepStrictEqual([...text.matchAll(/^- \[ \] \*\*(Arc \/ Circle|The Graph|ENS)\*\*/gm)].map(m => m[1]), ["Arc / Circle", "The Graph", "ENS"]))
    return "three intended partner rows; dashboard selections unverified"
  })
  check("video", () => {
    const fd = openAsset(root, "design/arcade-ethonline-2026.mp4", 2_147_483_648)
    try {
      const probe: unknown = JSON.parse(command(root, "ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-format_whitelist", "mov", "-threads", "4", "-count_frames", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,nb_read_frames:format=duration", "-of", "json", "-i", "/dev/fd/3"], 30000, fd))
      const result = checkVideoProbe(probe)
      return `${result.duration}s ${result.width}x${result.height} ${result.frames} decoded frames; voice/privacy/content not certified`
    } finally { closeSync(fd) }
  })
  checks.push({ id: "circle-cli-live-capture", status: "not_checked", detail: "no implemented captured-header verifier; J4/I2/I3 paused at this checkpoint; no signing or replay" })
  checks.push({ id: "owner-review", status: "not_checked", detail: "human voice, privacy, current deployment, fresh clone, check-ins and submission need separate evidence" })
  return { version: 1, mode: "local-read-only", status: "incomplete", submissionReady: false, fullGate: "not_run", liveEvidence: "not_verified", checks }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === "--help") {
    console.log("packaging-evidence.sh [--json | --help]\nLocal artifact checks only. No live calls or nested full gate.\nExit 1 while media/live/manual evidence is incomplete; 2 for invalid arguments. No readiness override.")
  } else if (args.length > 1 || (args.length === 1 && args[0] !== "--json")) {
    console.error("packaging_arguments_invalid"); process.exitCode = 2
  } else {
    const report = runPackagingEvidence(resolve(import.meta.dir, ".."))
    if (args[0] === "--json") console.log(JSON.stringify(report, null, 2))
    else {
      console.log("ARCADE packaging — LOCAL READ-ONLY, NOT SUBMISSION READY")
      for (const row of report.checks) console.log(`${row.status.toUpperCase().padEnd(11)} ${row.id}: ${row.detail}`)
      console.log("INCOMPLETE: no live evidence or full gate was run; owner/media/CLI proof remains separate.")
    }
    process.exitCode = 1
  }
}
