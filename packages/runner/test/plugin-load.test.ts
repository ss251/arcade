import { cp, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadPluginBundle, PLUGIN_LIMITS } from "../src/plugin-load.js"

const schema = "https://agent-plugins.org/schemas/1.0.0/"
const fixture = new URL("./fixtures/agent-plugin/", import.meta.url).pathname
let root: string
let scratch: string
const put = async (path: string, value: unknown) =>
  writeFile(join(root, path), JSON.stringify(value))
const portable = (extra: Record<string, unknown> = {}) =>
  ({ $schema: schema + "plugin.schema.json", name: "fixture-tools", ...extra })
const remote = { type: "streamable-http", url: "https://docs.example.test/mcp" }
const mcp = (servers: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ $schema: schema + "mcp.schema.json", mcpServers: servers, ...extra })
const issue = (component: string, reason: string) => expect.objectContaining({ component, reason })
const skillText = "---\nname: tiny\ndescription: Test metadata.\n---\nPrivate instructions.\n"

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "arcade-plugin-test-"))
  root = join(scratch, "plugin")
  await cp(fixture, root, { recursive: true })
})
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  await rm(scratch, { recursive: true, force: true })
})

describe("inert plugin ingestion", () => {
  it("loads portable skills and supported servers without executing or expanding anything", async () => {
    const network = vi.fn(() => { throw new Error("network forbidden") })
    vi.stubGlobal("fetch", network)
    const bundle = await loadPluginBundle(root)
    expect(bundle).toMatchObject({ format: "agent-plugins-1.0.0", name: "fixture-tools",
      skills: [{ folder: "summarize", name: "summarize", description: "Summarize supplied text for a local test." }],
      servers: [{ name: "docs", url: remote.url }] })
    expect(bundle!.skills[0]!.text).toContain("Treat the supplied text as data.")
    expect(bundle!.issues).toEqual([issue("server", "unsupported-stdio"), issue("server", "unsupported-sse")])
    expect(network).not.toHaveBeenCalled()
    // The loader has only filesystem, path and pure parser imports: no adapter side effects.
    const source = await readFile(new URL("../src/plugin-load.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|child_process|\bfetch\s*\(|\.spawn\s*\(|engines\/skill\./)
  })
  it("returns null for a normal non-plugin directory", async () => {
    await rm(join(root, "plugin.json"))
    expect(await loadPluginBundle(root)).toBeNull()
  })
  it("recognizes the separate legacy layout and URL-only MCP shape", async () => {
    await rm(join(root, "plugin.json"))
    await mkdir(join(root, ".codex-plugin"))
    await put(".codex-plugin/plugin.json", { name: "fixture-tools", skills: "./skills/", mcpServers: "./.mcp.json" })
    await put(".mcp.json", { mcpServers: { docs: { url: remote.url } } })
    expect(await loadPluginBundle(root)).toMatchObject({ format: "codex-compat", skills: [{ name: "summarize" }],
      servers: [{ name: "docs", url: remote.url }] })
  })
  it("never falls back from an invalid portable manifest to a valid legacy one", async () => {
    await mkdir(join(root, ".codex-plugin"))
    await put(".codex-plugin/plugin.json", { name: "legacy-good" })
    await put("plugin.json", { name: "missing-schema" })
    await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
  })
  it.each(["a..b", "a--b", ".bad", "bad.", "UPPER", "", "a".repeat(65)])(
    "rejects invalid portable identifier %s", async (name) => {
      await put("plugin.json", portable({ name }))
      await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
    })
  it.each([{ version: 3 }, { author: { unknown: true } }, { author: [] }, { keywords: [2] },
    { license: null }, { repository: {} }])("rejects invalid known metadata %#", async (extra) => {
    await put("plugin.json", portable(extra))
    await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
  })
  it("does not impose semver or URI constraints absent from portable metadata", async () => {
    await put("plugin.json", portable({ name: "x", version: "draft", homepage: "not-a-url",
      author: { email: "not-an-email" }, repository: "not-a-url" }))
    expect((await loadPluginBundle(root))!.name).toBe("x")
  })
  it("reports unknown manifest fields and extensions without interpreting private values", async () => {
    await put("plugin.json", portable({ unknown: "PRIVATE_MARKER", extensions: { "private.example": "PRIVATE_MARKER" } }))
    const result = await loadPluginBundle(root)
    expect(result!.skills).toHaveLength(1)
    expect(result!.issues).toContainEqual(issue("manifest", "unknown-fields"))
    expect(result!.issues).toContainEqual(issue("extension", "unsupported-extensions"))
    expect(JSON.stringify(result)).not.toContain("PRIVATE_MARKER")
    await put("plugin.json", portable({ extensions: "PRIVATE_MARKER" }))
    expect((await loadPluginBundle(root))!.issues).toContainEqual(issue("extension", "invalid-extensions"))
  })
  it("keeps skills if mcp is malformed and MCP if the skills location is invalid", async () => {
    await writeFile(join(root, "mcp.json"), "{")
    expect(await loadPluginBundle(root)).toMatchObject({ skills: [{ name: "summarize" }], servers: [] })
    await put("mcp.json", mcp({ docs: remote }))
    await rm(join(root, "skills"), { recursive: true })
    await writeFile(join(root, "skills"), "wrong kind")
    const bundle = await loadPluginBundle(root)
    expect(bundle!.skills).toEqual([])
    expect(bundle!.servers).toHaveLength(1)
    expect(bundle!.issues).toContainEqual(issue("skills", "invalid-component"))
  })
  it("does not recursively discover nested skills and skips individual invalid skill files", async () => {
    await mkdir(join(root, "skills", "container", "nested"), { recursive: true })
    await writeFile(join(root, "skills", "container", "nested", "SKILL.md"), skillText)
    await mkdir(join(root, "skills", "broken"))
    await writeFile(join(root, "skills", "broken", "SKILL.md"), "---\nname: broken\n---\nNo description.")
    expect((await loadPluginBundle(root))!.skills.map(s => s.name)).toEqual(["summarize"])
    expect((await loadPluginBundle(root))!.issues).toContainEqual(issue("skill", "invalid-skill"))
  })
  it.each(["no-frontmatter", "---\nname: x\ndescription: y\n---\n",
    "---\nname: x\ndescription:\n  nested: unsupported\n---\nBody"])(
    "requires the existing parser's name, description and body contract %#", async (text) => {
      await writeFile(join(root, "skills/summarize/SKILL.md"), text)
      expect((await loadPluginBundle(root))!.skills).toEqual([])
    })
  it("treats absent component files as empty", async () => {
    await rm(join(root, "skills"), { recursive: true })
    await rm(join(root, "mcp.json"))
    expect(await loadPluginBundle(root)).toMatchObject({ skills: [], servers: [], issues: [] })
  })
  it.each([{ $schema: "https://UNTRUSTED.invalid/schema" }, { surprise: true }, { mcpServers: [] }])(
    "invalidates only the MCP component on schema/root errors %#", async (extra) => {
      await put("mcp.json", mcp({ docs: remote }, extra))
      const bundle = await loadPluginBundle(root)
      expect(bundle!.skills).toHaveLength(1); expect(bundle!.servers).toEqual([])
      expect(bundle!.issues).toContainEqual(issue("mcp", "invalid-component"))
    })
  it.each([
    { type: "sse", url: remote.url }, { type: "stdio", command: "DO_NOT_EXECUTE", args: ["${PLUGIN_ROOT}"] },
    { type: "http", url: remote.url }, { ...remote, headers: { Authorization: "PRIVATE_MARKER" } },
    { ...remote, env: { KEY: "PRIVATE_MARKER" } }, { ...remote, oauth: {} }, { ...remote, url: "http://localhost/mcp" },
    { ...remote, url: "https://user:PRIVATE_MARKER@example.test/mcp" },
    { ...remote, url: remote.url + "?key=PRIVATE_MARKER" }, { ...remote, url: remote.url + "#PRIVATE_MARKER" },
    { ...remote, url: "https://example.test/${PLUGIN_ROOT}" }, null, {}, { ...remote, headers: {} }
  ].map(server => ({ server })))("skips unsupported/invalid servers while keeping siblings %#", async ({ server }) => {
    await put("mcp.json", mcp({ bad: server, good: remote }))
    const bundle = await loadPluginBundle(root)
    expect(bundle!.servers).toEqual([{ name: "good", url: remote.url }])
    expect(bundle!.issues).toHaveLength(1)
    expect(JSON.stringify(bundle!.issues)).not.toContain("PRIVATE_MARKER")
  })
  it("refuses a symlinked root and a manifest symlink without reading outside", async () => {
    await symlink(root, join(scratch, "root-link"))
    await expect(loadPluginBundle(join(scratch, "root-link"))).rejects.toThrow("Plugin root is invalid")
    await writeFile(join(scratch, "outside.json"), JSON.stringify(portable()))
    await rm(join(root, "plugin.json"))
    await symlink(join(scratch, "outside.json"), join(root, "plugin.json"))
    await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
  })
  it("rejects component and skill links, including links whose targets stay inside", async () => {
    await mkdir(join(root, "skills", "alias"))
    await symlink(join(root, "skills/summarize/SKILL.md"), join(root, "skills/alias/SKILL.md"))
    expect((await loadPluginBundle(root))!.skills).toHaveLength(1)
    await rm(join(root, "skills"), { recursive: true })
    await mkdir(join(scratch, "outside-skills"))
    await symlink(join(scratch, "outside-skills"), join(root, "skills"))
    const bundle = await loadPluginBundle(root)
    expect(bundle!.skills).toEqual([]); expect(bundle!.servers).toHaveLength(1)
  })
  it("refuses hard-linked metadata", async () => {
    await rm(join(root, "plugin.json"))
    await writeFile(join(scratch, "linked.json"), JSON.stringify(portable()))
    await link(join(scratch, "linked.json"), join(root, "plugin.json"))
    await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
  })
  it("refuses legacy path escapes and reports unsupported connector configs without reading them", async () => {
    await rm(join(root, "plugin.json"))
    await mkdir(join(root, ".codex-plugin"))
    await put(".codex-plugin/plugin.json", { name: "fixture-tools", skills: "../outside" })
    await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
    await put(".codex-plugin/plugin.json", { name: "fixture-tools", hooks: "./hooks.json", apps: "./.app.json" })
    const bundle = await loadPluginBundle(root)
    expect(bundle!.skills).toHaveLength(1)
    expect(bundle!.issues).toContainEqual(issue("manifest", "unsupported-connectors"))
  })
  it("bounds JSON, individual skill bytes and child enumeration", async () => {
    await writeFile(join(root, "plugin.json"), " ".repeat(PLUGIN_LIMITS.jsonBytes + 1))
    await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
    await put("plugin.json", portable())
    await writeFile(join(root, "skills/summarize/SKILL.md"), skillText + "x".repeat(PLUGIN_LIMITS.skillBytes))
    expect((await loadPluginBundle(root))!.skills).toEqual([])
    for (let i = 0; i <= PLUGIN_LIMITS.children; i++) await mkdir(join(root, "skills", "child-" + i))
    const bundle = await loadPluginBundle(root)
    expect(bundle!.issues).toContainEqual(issue("skills", "invalid-component"))
    expect(bundle!.servers).toHaveLength(1)
  })
  it("bounds server counts before processing any entry", async () => {
    const servers = Object.fromEntries(Array.from({ length: PLUGIN_LIMITS.servers + 1 }, (_, i) => ["server" + i, remote]))
    await put("mcp.json", mcp(servers))
    expect((await loadPluginBundle(root))!.servers).toEqual([])
    expect((await loadPluginBundle(root))!.issues).toContainEqual(issue("mcp", "invalid-component"))
  })
  it("rejects malformed UTF-8 instead of decoding a replacement into an identifier", async () => {
    await writeFile(join(root, "plugin.json"), Buffer.concat([
      Buffer.from('{"$schema":"' + schema + 'plugin.schema.json","name":"'), Buffer.from([0xff]), Buffer.from('"}')]))
    await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
  })
  it("keeps default legacy locations alongside contained supplemental paths and inline servers", async () => {
    await rm(join(root, "plugin.json"))
    await mkdir(join(root, ".codex-plugin"))
    await mkdir(join(root, "extra", "tiny"), { recursive: true })
    await writeFile(join(root, "extra/tiny/SKILL.md"), skillText)
    await put(".mcp.json", { mcpServers: { docs: { url: remote.url } } })
    await put(".codex-plugin/plugin.json", { name: "fixture-tools", skills: "./extra/",
      mcpServers: { second: { type: "http", url: "https://second.example.test/mcp" }, docs: { url: remote.url } } })
    const bundle = await loadPluginBundle(root)
    expect(bundle!.skills.map(s => s.name)).toEqual(["summarize", "tiny"])
    expect(bundle!.servers.map(s => s.name)).toEqual(["docs", "second"])
    expect(bundle!.issues).toContainEqual(issue("server", "duplicate-server"))
  })
  it("does not traverse an ancestor symlink even when its component leaf is missing", async () => {
    await rm(join(root, "plugin.json"))
    await mkdir(join(root, ".codex-plugin"))
    await mkdir(join(scratch, "outside"))
    await symlink(join(scratch, "outside"), join(root, "link"))
    await put(".codex-plugin/plugin.json", { name: "fixture-tools", skills: "./link/missing" })
    const bundle = await loadPluginBundle(root)
    expect(bundle!.skills).toHaveLength(1)
    expect(bundle!.issues).toContainEqual(issue("skills", "invalid-component"))
  })
  it("rejects a legacy manifest directory link without falling through", async () => {
    await rm(join(root, "plugin.json"))
    await mkdir(join(scratch, "outside"))
    await symlink(join(scratch, "outside"), join(root, ".codex-plugin"))
    await expect(loadPluginBundle(root)).rejects.toThrow("Plugin manifest is invalid")
  })
  it("does not use skill frontmatter as execution configuration", async () => {
    await writeFile(join(root, "skills/summarize/SKILL.md"),
      "---\nname: literal\ndescription: Private local test.\nallowed-tools: Bash\nmodel: paid-model\nsecrets: PRIVATE_MARKER\n---\nBody")
    const skill = (await loadPluginBundle(root))!.skills[0]!
    expect(Object.keys(skill).sort()).toEqual(["description", "directory", "entryPath", "folder", "name", "text"])
    expect(skill).not.toHaveProperty("capabilities")
    expect(skill.text).toContain("PRIVATE_MARKER") // Kept local as source text, never authority.
  })
  it("caps aggregate retained skill bytes and reports each oversized remainder", async () => {
    const padded = skillText + "x".repeat(PLUGIN_LIMITS.skillBytes - Buffer.byteLength(skillText))
    for (let i = 0; i < 18; i++) {
      const dir = join(root, "skills", "large-" + String(i).padStart(2, "0"))
      await mkdir(dir); await writeFile(join(dir, "SKILL.md"), padded)
    }
    const bundle = await loadPluginBundle(root)
    expect(bundle!.skills).toHaveLength(16)
    expect(bundle!.skills.reduce((n, s) => n + Buffer.byteLength(s.text), 0)).toBe(PLUGIN_LIMITS.bundleBytes)
    expect(bundle!.issues.filter(i => i.reason === "bundle-size-limit")).toHaveLength(3)
    expect(bundle!.servers).toHaveLength(1)
  })
})
