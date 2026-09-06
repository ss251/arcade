import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Schema } from "effect"
import { SkillManifest, toPublicListing } from "@arcade/core"
import { loadPluginBundle, type PluginBundle } from "../src/plugin-load.js"
import { listMcpTools, type McpTool } from "../src/publish-introspect.js"
import { manifestFromPluginSkill, pluginListingId, pluginPublishOptions, preparePluginPublish,
  runPublishPlugin } from "../src/publish-plugin.js"

vi.mock("../src/publish-introspect.js", async original => ({
  ...await original<typeof import("../src/publish-introspect.js")>(), listMcpTools: vi.fn()
}))
const fixture = new URL("./fixtures/agent-plugin/", import.meta.url).pathname
const discover = vi.mocked(listMcpTools)
const tool = (name = "read_docs", readOnly = true): McpTool => ({
  name, inputSchema: { type: "object" }, annotations: { readOnlyHint: readOnly }
})
let scratch: string, root: string, bundle: PluginBundle
beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "arcade-plugin-publish-")); root = join(scratch, "plugin")
  await cp(fixture, root, { recursive: true })
  bundle = (await loadPluginBundle(root))!
  discover.mockReset().mockResolvedValue([tool(), tool("write_docs", false)])
})
afterEach(async () => { vi.restoreAllMocks(); await rm(scratch, { recursive: true, force: true }) })

describe("plugin generation adapters", () => {
  it("combines skill and fixed-tool adapters, reporting unsupported components and writes", async () => {
    const prepared = await preparePluginPublish(bundle, pluginPublishOptions([]))
    expect(prepared.entries.map(e => e.engine.adapter)).toEqual(["skill", "mcp"])
    expect(prepared.entries[1]!.private.engine.tool).toBe("read_docs")
    expect(prepared.skipped.map(s => s.reason)).toEqual(["unsupported-stdio", "unsupported-sse", "not-marked-read-only"])
    expect(prepared.skipped[2]).toMatchObject({ component: "tool", serverIndex: 0, index: 1 })
    expect(prepared.warnings.join(" ")).toContain("before serving")
    expect(discover).toHaveBeenCalledOnce()
    expect(discover).toHaveBeenCalledWith({ url: "https://docs.example.test/mcp" })
  })
  it("selects only named kinds and requires explicit inclusion of write-capable tools", async () => {
    const onlySkill = await preparePluginPublish(bundle, pluginPublishOptions(["--skill", "summarize"]))
    expect(onlySkill.entries).toHaveLength(1); expect(discover).not.toHaveBeenCalled()
    const onlyServer = await preparePluginPublish(bundle, pluginPublishOptions(["--server", "docs", "--include-writes"]))
    expect(onlyServer.entries.map(e => e.private.engine.tool)).toEqual(["read_docs", "write_docs"])
    expect(onlyServer.entries.every(e => e.engine.adapter === "mcp")).toBe(true)
  })
  it("retains private prompt files without giving frontmatter tools, model or secret authority", async () => {
    const text = "---\nname: source\ndescription: Public summary.\nallowed-tools: Bash\nmodel: paid-model\nsecrets: PRIVATE_SECRET_NAME\n---\nPRIVATE_BODY"
    await writeFile(join(root, "skills/summarize/SKILL.md"), text)
    bundle = (await loadPluginBundle(root))!
    const prepared = await preparePluginPublish(bundle, pluginPublishOptions(["--skill", "summarize"]))
    const entry = prepared.entries[0]!
    expect(entry.grants).toEqual([])
    expect(entry.private).toMatchObject({ engine: { adapter: "skill", credential: "api-key", entry: "SKILL.md", capabilities: [] },
      secrets: [], egress: [] })
    expect(entry.private.engine).not.toHaveProperty("model")
    expect(JSON.stringify(entry.public)).not.toMatch(/PRIVATE_|SKILL.md|engine|secrets|egress/)
    expect(new TextDecoder().decode(prepared.listings[0]!.files[0]!.content)).toBe(text)
  })
  it("clips only public descriptions, keeps valid Unicode and bounds model cost below price", () => {
    const skill = { ...bundle.skills[0]!, description: "a".repeat(499) + "😀", name: "非ASCII" }
    const raw = manifestFromPluginSkill(bundle, skill, "$0.000001")
    const manifest = Schema.decodeUnknownSync(SkillManifest)(raw)
    expect(manifest.description).toBe("a".repeat(499))
    expect(manifest.serviceName).toMatch(/^[\x20-\x7e]{1,32}$/)
    expect(manifest.bounds.maxCostUsd).toBe(0.0000005)
    expect(manifest.bounds.maxCostUsd).toBeLessThan(0.000001)
    expect(manifestFromPluginSkill(bundle, skill, "$1000").bounds).toMatchObject({ maxCostUsd: 0.02 })
    expect(skill.description).toHaveLength(501)
  })
  it("uses stable location-independent ids and avoids normalization/truncation collisions", () => {
    const ids = [
      pluginListingId(bundle, "skill", "skills/a_b"),
      pluginListingId(bundle, "skill", "skills/a-b"),
      pluginListingId(bundle, "mcp", "server", "a".repeat(100) + "one"),
      pluginListingId(bundle, "mcp", "server", "a".repeat(100) + "two")
    ]
    expect(new Set(ids).size).toBe(4)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{1,63}$/)
    const other = { ...bundle, root: join(scratch, "different") }
    expect(pluginListingId(other, "skill", "skills/a-b")).toBe(ids[1])
  })
  it("rejects unknown selections before contacting any server", async () => {
    for (const flags of [["--skill", "missing"], ["--server", "missing"]]) {
      await expect(preparePluginPublish(bundle, pluginPublishOptions(flags))).rejects.toThrow(/missing/i)
    }
    expect(discover).not.toHaveBeenCalled()
  })
  it("requires a path selector when supplemental skill folder names are ambiguous", async () => {
    await mkdir(join(root, "extra/summarize"), { recursive: true })
    await writeFile(join(root, "extra/summarize/SKILL.md"), await readFile(join(root, "skills/summarize/SKILL.md")))
    const second = { ...bundle.skills[0]!, directory: join(root, "extra/summarize"),
      entryPath: join(root, "extra/summarize/SKILL.md") }
    const duplicate = { ...bundle, skills: [...bundle.skills, second] }
    await expect(preparePluginPublish(duplicate, pluginPublishOptions(["--skill", "summarize"]))).rejects.toThrow(/ambiguous/i)
    const chosen = await preparePluginPublish(duplicate, pluginPublishOptions(["--skill", "skills/summarize"]))
    expect(chosen.entries).toHaveLength(1); expect(discover).not.toHaveBeenCalled()
  })
  it("isolates server failure and unsupported tool metadata from valid siblings", async () => {
    const multiple = { ...bundle, servers: [{ name: "bad", url: "https://bad.example.test/mcp" }, ...bundle.servers] }
    discover.mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_ERROR")).mockResolvedValueOnce([
      { ...tool("bad_tool"), inputSchema: {} }, tool("valid_tool")
    ])
    const prepared = await preparePluginPublish(multiple, pluginPublishOptions([]))
    expect(prepared.entries.map(e => e.engine.adapter)).toEqual(["skill", "mcp"])
    expect(prepared.entries[1]!.private.engine.tool).toBe("valid_tool")
    expect(prepared.skipped).toContainEqual(expect.objectContaining({ reason: "discovery-failed" }))
    expect(prepared.skipped).toContainEqual(expect.objectContaining({ reason: "unsupported-tool" }))
    expect(JSON.stringify(prepared.entries) + JSON.stringify(prepared.skipped)).not.toContain("PRIVATE_PROVIDER_ERROR")
  })
  it("does not hide valid MCP listings when a skill's referenced files cannot be copied", async () => {
    await writeFile(join(root, "skills/summarize/.env"), "PRIVATE_MARKER")
    const prepared = await preparePluginPublish(bundle, pluginPublishOptions([]))
    expect(prepared.entries.map(e => e.engine.adapter)).toEqual(["mcp"])
    expect(prepared.skipped).toContainEqual(expect.objectContaining({ reason: "unsafe-or-unsupported-skill-files" }))
    expect(JSON.stringify(prepared)).not.toContain("PRIVATE_MARKER")
  })
  it("bounds sequential server starts and does not retry failed discovery", async () => {
    const many = { ...bundle, servers: Array.from({ length: 10 }, (_, i) => ({ name: "s-" + i, url: "https://docs.example.test/mcp" })) }
    discover.mockRejectedValue(new Error("offline"))
    const prepared = await preparePluginPublish(many, pluginPublishOptions([]))
    expect(discover).toHaveBeenCalledTimes(8)
    expect(prepared.entries).toHaveLength(1)
    expect(prepared.skipped.filter(s => s.reason === "discovery-budget")).toHaveLength(2)
  })
  it("stops starting servers after the wall-clock budget", async () => {
    let now = 0
    vi.spyOn(Date, "now").mockImplementation(() => now)
    const multiple = { ...bundle, servers: [...bundle.servers, { name: "second", url: "https://second.example.test/mcp" }] }
    discover.mockImplementationOnce(async () => { now = 100000; return [tool()] })
    const prepared = await preparePluginPublish(multiple, pluginPublishOptions([]))
    expect(discover).toHaveBeenCalledOnce()
    expect(prepared.skipped).toContainEqual(expect.objectContaining({ reason: "discovery-budget" }))
  })
  it("limits total listing count and reports excess tools", async () => {
    discover.mockResolvedValue(Array.from({ length: 260 }, (_, i) => tool("tool-" + i)))
    const prepared = await preparePluginPublish(bundle, pluginPublishOptions([]))
    expect(prepared.entries).toHaveLength(256)
    expect(prepared.skipped.filter(s => s.reason === "batch-limit")).toHaveLength(5)
  })
  it("reports excess discovery results before iterating them", async () => {
    discover.mockResolvedValue(Array.from({ length: 1001 }, (_, i) => tool("tool-" + i)))
    const prepared = await preparePluginPublish(bundle, pluginPublishOptions([]))
    expect(prepared.entries).toHaveLength(1)
    expect(prepared.skipped).toContainEqual(expect.objectContaining({ reason: "discovery-limit" }))
  })
  it("fails closed on colliding final ids before any preview is emitted", async () => {
    const duplicate = { ...bundle, skills: [bundle.skills[0]!, bundle.skills[0]!] }
    await expect(preparePluginPublish(duplicate, pluginPublishOptions([]))).rejects.toThrow(/colliding/i)
  })
  it("keeps tool endpoint details out of the actual core public projection", async () => {
    const prepared = await preparePluginPublish(bundle, pluginPublishOptions(["--server", "docs"]))
    const decoded = Schema.decodeUnknownSync(SkillManifest)(prepared.listings[0]!.manifest)
    expect(prepared.entries[0]!.public).toEqual(toPublicListing(decoded))
    expect(JSON.stringify(prepared.entries[0]!.public)).not.toMatch(/https:|engine|egress|secrets/)
    expect(prepared.entries[0]!.public).not.toHaveProperty("tool")
  })
  it("returns false for an ordinary unrecognized directory, with no output or discovery", async () => {
    await rm(join(root, "plugin.json"))
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    expect(await runPublishPlugin(root, ["--json"])).toBe(false)
    expect(log).not.toHaveBeenCalled(); expect(discover).not.toHaveBeenCalled()
  })
})
