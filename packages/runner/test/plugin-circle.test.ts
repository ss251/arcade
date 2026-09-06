import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it, vi } from "vitest"
import { loadPluginBundle } from "../src/plugin-load.js"
import { collectPluginSkillFiles } from "../src/plugin-files.js"
import { pluginPublishOptions, preparePluginPublish } from "../src/publish-plugin.js"

const root = new URL("../../..", import.meta.url).pathname
const fixture = new URL("./fixtures/circle/", import.meta.url).pathname
const revision = "26dc09ea0746a038c969c6f197feee1267f834b5"
const homes: string[] = []
const home = () => { const path = mkdtempSync(join(tmpdir(), "arcade-circle-fixture-")); homes.push(path); return path }
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  for (const path of homes.splice(0)) rmSync(path, { recursive: true, force: true })
})
const run = (dir: string, args: string[]) => spawnSync("bun", ["--no-env-file", "--no-install",
  "packages/runner/src/cli.ts", ...args], {
  cwd: root, env: { PATH: process.env["PATH"] ?? "", HOME: dir }, encoding: "utf8",
  timeout: 15000, maxBuffer: 524288
})

describe("pinned Circle compatibility fixture", () => {
  it("verifies every original Git blob, including documented final-newline normalization", () => {
    const record = JSON.parse(readFileSync(join(fixture, "source-records.json"), "utf8")) as {
      revision: string; upstreamSkillCount: number; includedSkills: string[];
      files: Array<{ path: string; sourceBytes: number; sourceGitBlobSha1: string; normalization: string }>
    }
    expect(record.revision).toBe(revision)
    expect(record.upstreamSkillCount).toBe(18)
    expect(record.includedSkills).toEqual(["pay-via-agent-wallet", "use-gateway"])
    expect(record.files).toHaveLength(25)
    let normalized = 0
    for (const item of record.files) {
      const content = readFileSync(join(fixture, item.path))
      let original = content
      if (item.normalization === "append-final-lf") {
        expect(content.at(-1)).toBe(10); original = content.subarray(0, -1); normalized++
      } else expect(item.normalization).toBe("none")
      expect(original.length, item.path).toBe(item.sourceBytes)
      expect(createHash("sha1").update("blob " + original.length + "\0").update(original).digest("hex"), item.path)
        .toBe(item.sourceGitBlobSha1)
    }
    expect(normalized).toBe(4)
    expect(readFileSync(join(fixture, "NOTICE.md"), "utf8")).toContain("two-skill excerpt")
  })
  it("recognizes the original manifest and headerless MCP descriptor without calling any service", async () => {
    const fetcher = vi.fn(() => { throw new Error("network forbidden") })
    vi.stubGlobal("fetch", fetcher)
    const bundle = (await loadPluginBundle(fixture))!
    expect(bundle).toMatchObject({ format: "codex-compat", name: "circle", issues: [],
      servers: [{ name: "circle", url: "https://api.circle.com/v1/codegen/mcp" }] })
    expect(bundle.skills.map(s => s.name)).toEqual(["pay-via-agent-wallet", "use-gateway"])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("retains all references and attribution while ignoring execution frontmatter", async () => {
    const fetcher = vi.fn(() => { throw new Error("network forbidden") })
    vi.stubGlobal("fetch", fetcher)
    const bundle = (await loadPluginBundle(fixture))!
    for (const skill of bundle.skills) {
      const files = await collectPluginSkillFiles(bundle, skill)
      expect(files.filter(f => f.name.startsWith("references/"))).toHaveLength(skill.name === "use-gateway" ? 16 : 1)
      expect(files.map(f => f.name)).toEqual(expect.arrayContaining(["LICENSE", "NOTICE.md", "SKILL.md"]))
      expect(new TextDecoder().decode(files.find(f => f.name === "SKILL.md")!.content)).toBe(skill.text)
      expect(new TextDecoder().decode(files.find(f => f.name === "LICENSE")!.content)).toContain("Apache License")
    }
    const prepared = await preparePluginPublish(bundle, pluginPublishOptions([
      "--skill", "pay-via-agent-wallet", "--skill", "use-gateway"
    ]))
    expect(prepared.entries).toHaveLength(2)
    for (const entry of prepared.entries) {
      expect(entry.grants).toEqual([])
      expect(entry.private.engine).toMatchObject({ adapter: "skill", credential: "api-key", capabilities: [] })
      expect(entry.private.engine).not.toHaveProperty("model")
      expect(entry.private.secrets).toEqual([])
      expect(entry.public.description.length).toBeLessThanOrEqual(500)
      expect(JSON.stringify(entry.public)).not.toMatch(/allowed-tools|systemPrompt|SKILL.md|references\//)
    }
    expect(prepared.warnings.join(" ")).toContain("descriptions")
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("uses the real CLI to preview, copy and read back both selected skills without connecting a server or serving them", () => {
    const dir = home(), out = join(dir, "generated")
    const args = ["publish", fixture, "--skill", "pay-via-agent-wallet", "--skill", "use-gateway", "--out", out]
    const preview = run(dir, [...args, "--json"])
    expect(preview.status, preview.stderr).toBe(0)
    const batch = JSON.parse(preview.stdout)
    expect(batch.entries).toHaveLength(2)
    expect(batch.skipped).toEqual([])
    expect(existsSync(out)).toBe(false)
    const generated = run(dir, [...args, "--yes"])
    expect(generated.status, generated.stderr).toBe(0)
    for (const entry of batch.entries) {
      const path = join(out, entry.skillId)
      const readback = run(dir, ["publish", path, "--json"])
      expect(readback.status, readback.stderr).toBe(0)
      expect(JSON.parse(readback.stdout).public).toEqual(entry.public)
      const skill = entry.public.serviceName
      expect(readFileSync(join(path, "SKILL.md"))).toEqual(readFileSync(join(fixture, "skills", skill, "SKILL.md")))
      expect(readFileSync(join(path, "LICENSE"), "utf8")).toContain("Apache License")
      expect(readFileSync(join(path, "NOTICE.md"), "utf8")).toContain(revision)
    }
    expect(existsSync(join(dir, ".arcade"))).toBe(false)
  }, 20000)
})

