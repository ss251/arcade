import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { checkReadmeSections, checkShotTimeline, checkVideoProbe, readPackagingAsset, type PackagingReport } from "./packaging-evidence.ts"

const root = resolve(import.meta.dir, "..")
const video = () => ({ format: { duration: "225" }, streams: [
  { codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1", nb_read_frames: "6750" },
  { codec_type: "audio" }
] })
function fixture(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "arcade-packaging-test-"))
  try { fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}
test("the actual seven README sections are exact, not merely scattered headings", () => {
  const text = readFileSync(join(root, "README.md"), "utf8")
  expect(() => checkReadmeSections(text)).not.toThrow()
  for (const bad of [text.replace("### Mainnet", "### Mainnet\n### Extra"),
    text.replace("### AI assistance", "### Other"), text + "\n## ETHOnline 2026\n"]) {
    expect(() => checkReadmeSections(bad)).toThrow()
  }
})
test("shot windows require eight numbered contiguous beats, not only a 225 sum", () => {
  const text = readFileSync(join(root, "docs/video/ethonline-2026-shotlist.md"), "utf8")
  expect(checkShotTimeline(text)).toBe(225)
  for (const bad of [text.replace("0:30 → 0:52", "0:31 → 0:53"),
    text.replace("| 1 | 30s", "| 2 | 30s"), text + "\n| 9 | 0s | 3:45 → 3:45 | extra |\n"]) {
    expect(() => checkShotTimeline(bad)).toThrow()
  }
})
test("decoded-count metadata accepts a healthy target without asserting human voice", () => {
  expect(checkVideoProbe(video())).toEqual({ duration: 225, width: 1920, height: 1080, fps: 30, frames: 6750 })
})
test("media refuses missing/multiple audio, wrong geometry and broken frame counts", () => {
  for (const streams of [video().streams.slice(0, 1), [...video().streams, { codec_type: "audio" }],
    [{ ...video().streams[0], width: 1864 }, video().streams[1]],
    [{ ...video().streams[0], nb_read_frames: "48" }, video().streams[1]],
    [{ ...video().streams[0], avg_frame_rate: "30/0" }, video().streams[1]],
    [{ ...video().streams[0], height: 640 }, video().streams[1]]]) {
    expect(() => checkVideoProbe({ ...video(), streams })).toThrow()
  }
})
test("malformed probes and nonfinite or out-of-window durations refuse", () => {
  for (const value of [null, [], {}, { streams: [] }, ...["119", "241", "NaN", "Infinity", "225junk", 225].map(duration => ({ ...video(), format: { duration } }))]) {
    expect(() => checkVideoProbe(value)).toThrow()
  }
})
test("bounded asset reads reject aliases, traversal and oversized files", () => fixture(dir => {
  writeFileSync(join(dir, "proof.txt"), "unchanged")
  expect(readPackagingAsset(dir, "proof.txt", 32).toString()).toBe("unchanged")
  expect(() => readPackagingAsset(dir, "proof.txt", 4)).toThrow()
  symlinkSync(join(dir, "proof.txt"), join(dir, "linked.txt"))
  expect(() => readPackagingAsset(dir, "linked.txt", 32)).toThrow()
  mkdirSync(join(dir, "sub")); symlinkSync(join(dir, "sub"), join(dir, "alias"))
  expect(() => readPackagingAsset(dir, "alias/absent.txt", 32)).toThrow()
  expect(() => readPackagingAsset(dir, "../proof.txt", 32)).toThrow()
  linkSync(join(dir, "proof.txt"), join(dir, "hard.txt"))
  expect(() => readPackagingAsset(dir, "proof.txt", 32)).toThrow()
  expect(readFileSync(join(dir, "proof.txt"), "utf8")).toBe("unchanged")
}))
test("native import/help/unknown flags do not need external commands or a repository cwd", () => {
  const source = resolve(import.meta.dir, "packaging-evidence.ts")
  const run = (...args: string[]) => spawnSync(process.execPath, ["--no-env-file", ...args], { cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 32768 })
  const imported = run("-e", `await import(${JSON.stringify(source)})`)
  expect(imported.status).toBe(0); expect(imported.stdout).toBe("")
  const help = run(source, "--help")
  expect(help.status).toBe(0); expect(help.stdout).toContain("No live calls or nested full gate")
  const unknown = run(source, "--live")
  expect(unknown.status).toBe(2); expect(unknown.stdout).toBe("")
  expect(unknown.stderr.trim()).toBe("packaging_arguments_invalid")
})
test("actual workspace evidence stays incomplete and leaves diagram/readme bytes untouched", () => {
  const paths = ["README.md", "docs/architecture.excalidraw", "docs/architecture-dark.excalidraw", "docs/architecture.mmd"]
  const before = paths.map(path => readFileSync(join(root, path)))
  const child = spawnSync("/bin/sh", [resolve(import.meta.dir, "packaging-evidence.sh"), "--json"], {
    cwd: tmpdir(), env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8", timeout: 35000, maxBuffer: 32768
  })
  expect(child.status).toBe(1); expect(child.stderr).toBe("")
  expect(child.stdout).not.toContain(root)
  const result = JSON.parse(child.stdout) as PackagingReport
  expect(result.submissionReady).toBe(false)
  expect(result.status).toBe("incomplete")
  expect(result.checks.find(row => row.id === "circle-cli-live-capture")?.status).toBe("not_checked")
  expect(result.fullGate).toBe("not_run")
  for (const id of ["continuity", "readme-sections", "private-paths", "diagram-source", "diagram-record", "narration", "shot-timeline", "partner-rows"]) {
    expect(result.checks.find(row => row.id === id)?.status).toBe("pass")
  }
  paths.forEach((path, i) => expect(readFileSync(join(root, path))).toEqual(before[i]!))
}, 40000)
test("shell invalid flags refuse before Bun or any external command is needed", () => {
  for (const args of [["--live"], ["--json", "--json"]]) {
    const child = spawnSync("/bin/sh", [resolve(import.meta.dir, "packaging-evidence.sh"), ...args], {
      cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 2000, maxBuffer: 32768
    })
    expect(child.status).toBe(2); expect(child.stdout).toBe("")
    expect(child.stderr.trim()).toBe("packaging_arguments_invalid")
  }
})
