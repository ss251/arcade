import { afterEach, describe, expect, it } from "vitest"
import { constants, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { previewLocal } from "../src/lib/publish-runtime.ts"
import { PublishDisabled, PublishFailed } from "../src/lib/publish-preview.ts"
import { createPublishPreview } from "../../../packages/runner/src/publish-preview.ts"
import { SkillManifest } from "../../../packages/core/src/manifest.ts"
import { Schema } from "effect"

const repo = realpathSync(new URL("../../..", import.meta.url).pathname)
const bunProbe = spawnSync("bun", ["--no-env-file", "-e", "console.log(process.execPath)"], {
  env: { PATH: process.env["PATH"] ?? "" }, encoding: "utf8", timeout: 6000, maxBuffer: 4096
})
if (bunProbe.status !== 0) throw Error("Bun test prerequisite unavailable")
const bun = bunProbe.stdout.trim()
const env = { ARCADE_PUBLISH_LOCAL: "1", ARCADE_REPO_ROOT: repo, ARCADE_PUBLISH_BUN: bun }
const request = (signal?: AbortSignal) => new Request("http://127.0.0.1:3000/preview", {
  method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }, ...(signal ? { signal } : {})
})
const homes: string[] = []
const fresh = () => { const p = realpathSync(mkdtempSync(join(tmpdir(), "arcade-web-publish-test-"))); homes.push(p); return p }
afterEach(() => { for (const p of homes.splice(0)) rmSync(p, { recursive: true, force: true }) })

describe("local publishing runtime", () => {
  it("refuses absent flags, hosted markers and external requests before looking for files", async () => {
    for (const settings of [{}, { ...env, VERCEL: "1" }])
      await expect(previewLocal({ target: "missing" }, request(), settings)).rejects.toBeInstanceOf(PublishDisabled)
    await expect(previewLocal({ target: "missing" }, new Request("https://external.example"), env)).rejects.toBeInstanceOf(PublishDisabled)
  })
  it("runs the actual directory CLI on a snapshot without writing source or owner configuration", async () => {
    const path = join(repo, "skills/diff-triage/arcade.json"), before = readFileSync(path)
    const doc = await previewLocal({ target: "skills/diff-triage" }, request(), {
      ...env, ANTHROPIC_API_KEY: "PRIVATE_FIXTURE", ARCADE_NETWORK: "invalid-fixture", ARCADE_CONFIG_PATH: "/invalid/private/config"
    })
    expect(doc).toMatchObject({ kind: "directory", target: "skills/diff-triage", entries: [{ skillId: "diff-triage" }] })
    expect(readFileSync(path)).toEqual(before)
    expect(JSON.stringify(doc)).not.toContain("PRIVATE_FIXTURE")
    expect(JSON.stringify(doc)).not.toContain("arcade-web-preview-")
  })
  it("runs actual OpenAPI generation as an unwritten batch with stable relative listing paths", async () => {
    const target = "packages/runner/test/fixtures/frankfurter.json", before = readFileSync(join(repo, target))
    const existing = readFileSync(join(repo, "skills/fx-rate/arcade.json"))
    const doc = await previewLocal({ target }, request(), env)
    expect(doc).toMatchObject({ kind: "generated", source: "openapi", written: false, target,
      entries: [{ target: "skills/fx-rate", skillId: "fx-rate" }] })
    expect(readFileSync(join(repo, target))).toEqual(before)
    expect(readFileSync(join(repo, "skills/fx-rate/arcade.json"))).toEqual(existing)
  })
  it("refuses unsafe targets and configurations with fixed diagnostics", async () => {
    for (const target of ["../outside", ".env", "mcp://", "https://example.test", "missing"])
      await expect(previewLocal({ target }, request(), env)).rejects.toBeInstanceOf(PublishFailed)
    for (const change of [{ ARCADE_REPO_ROOT: "." }, { ARCADE_PUBLISH_BUN: "bun" }, { ARCADE_REPO_ROOT: "/" }])
      await expect(previewLocal({ target: "skills/diff-triage" }, request(), { ...env, ...change })).rejects.toBeInstanceOf(PublishFailed)
  })
  it("rejects symlink ancestors and non-regular or oversized source files without following them", async () => {
    const root = fresh(), settings = { ...env, ARCADE_REPO_ROOT: root }
    // A trusted fixture root uses the actual CLI file path only through its own repo layout.
    mkdirSync(join(root, "packages/runner/src"), { recursive: true })
    const marker = join(root, "executed")
    writeFileSync(join(root, "packages/runner/src/cli.ts"), "import{writeFileSync}from'node:fs';writeFileSync(" + JSON.stringify(marker) + ",'BAD');throw Error('must not execute')")
    mkdirSync(join(root, "apps/web/src/lib"), { recursive: true })
    writeFileSync(join(root, "apps/web/src/lib/publish-discovery-guard.ts"), readFileSync(join(repo, "apps/web/src/lib/publish-discovery-guard.ts")))
    writeFileSync(join(root, "package.json"), '{"name":"arcade"}')
    symlinkSync(join(repo, "skills"), join(root, "linked"))
    symlinkSync(join(repo, "packages/runner/test/fixtures/frankfurter.json"), join(root, "link.json"))
    mkdirSync(join(root, "directory.json"))
    writeFileSync(join(root, "oversize.json"), Buffer.alloc(5 * 1024 * 1024 + 1))
    for (const target of ["linked/diff-triage", "link.json", "directory.json", "oversize.json"])
      await expect(previewLocal({ target }, request(), settings)).rejects.toEqual(new PublishFailed())
    expect(constants.O_NOFOLLOW).not.toBeUndefined()
    expect(existsSync(marker)).toBe(false)
  })
  it("owns only one call and refuses a pre-aborted request", async () => {
    const controller = new AbortController(); controller.abort("PRIVATE_REASON")
    await expect(previewLocal({ target: "skills/diff-triage" }, request(controller.signal), env)).rejects.toEqual(new PublishFailed())
    const first = previewLocal({ target: "skills/diff-triage" }, request(), env)
    await expect(previewLocal({ target: "skills/diff-triage" }, request(), env)).rejects.toEqual(new PublishFailed())
    await expect(first).resolves.toMatchObject({ kind: "directory" })
  })
  it("binds child JSON to its requested target and cleans snapshots on parse failure as well as success", async () => {
    const manifest = Schema.decodeUnknownSync(SkillManifest)(JSON.parse(readFileSync(join(repo, "skills/diff-triage/arcade.json"), "utf8")))
    for (const [output, pass] of [[JSON.stringify(createPublishPreview("sample", manifest)), true],
      [JSON.stringify(createPublishPreview("different", manifest)), false], ['{"partial":', false]] as const) {
      const root = fresh(), marker = join(root, "observed.json")
      mkdirSync(join(root, "packages/runner/src"), { recursive: true })
      mkdirSync(join(root, "apps/web/src/lib"), { recursive: true })
      mkdirSync(join(root, "sample"))
      writeFileSync(join(root, "package.json"), '{"name":"arcade"}')
      writeFileSync(join(root, "sample/arcade.json"), "{}")
      writeFileSync(join(root, "apps/web/src/lib/publish-discovery-guard.ts"), readFileSync(join(repo, "apps/web/src/lib/publish-discovery-guard.ts")))
      writeFileSync(join(root, "packages/runner/src/cli.ts"), 'import{writeFileSync}from"node:fs";writeFileSync(' + JSON.stringify(marker) +
        ',JSON.stringify({cwd:process.cwd(),home:process.env.HOME,pid:process.pid}));console.log(' + JSON.stringify(output) + ')')
      const result = previewLocal({ target: "sample" }, request(), { ...env, ARCADE_REPO_ROOT: root })
      if (pass) await expect(result).resolves.toMatchObject({ kind: "directory", target: "sample" })
      else await expect(result).rejects.toEqual(new PublishFailed())
      const observed = JSON.parse(readFileSync(marker, "utf8"))
      expect(existsSync(observed.cwd)).toBe(false); expect(existsSync(observed.home)).toBe(false)
      expect(() => process.kill(observed.pid, 0)).toThrow()
    }
  })
})
