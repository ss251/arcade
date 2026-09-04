import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SERVICE_NAME_MAX, decodeManifest, toPublicListing } from "@arcade/core"
import { Effect } from "effect"
import {
  listMcpTools, manifestFromMcpTool, parseMcpTarget, publishableTools, toSkillId,
  writeGeneratedSkills, type McpTool, type McpSource
} from "../src/publish-introspect.ts"

const sdk = vi.hoisted(() => ({ connect: vi.fn(), listTools: vi.fn(), close: vi.fn(),
  transport: vi.fn(), transportClose: vi.fn() }))
const disk = vi.hoisted(() => ({ failWrite: false }))
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>()
  return { ...fs, open: async (...args: Parameters<typeof fs.open>) => {
    const file = await fs.open(...args)
    if (disk.failWrite) file.writeFile = async () => { throw new Error("PRIVATE_DISK_PATH") }
    return file
  } }
})
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({ Client: class {
  connect = sdk.connect
  listTools = sdk.listTools
  close = sdk.close
} }))
vi.mock("../src/engines/mcp.ts", () => ({ transportFor: sdk.transport }))

const tools = JSON.parse(readFileSync(new URL("./fixtures/arc-docs-tools.json", import.meta.url), "utf8")) as ReadonlyArray<McpTool>
const tool = tools.find((value) => value.name === "search_arc_docs")!
const source: McpSource = { url: "https://private.example:8443/mcp?tenant=private" }
const manifest = (name = "search_arc_docs") => manifestFromMcpTool(source, { ...tool, name }, { price: "$0.02" })
const directories: string[] = []
const temp = async () => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), "arcade-introspect-"))
  directories.push(dir)
  return dir
}
beforeEach(() => {
  disk.failWrite = false
  vi.resetAllMocks()
  sdk.connect.mockResolvedValue(undefined)
  sdk.listTools.mockResolvedValue({ tools })
  sdk.close.mockResolvedValue(undefined)
  sdk.transportClose.mockResolvedValue(undefined)
  sdk.transport.mockReturnValue({ close: sdk.transportClose })
})
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("toSkillId", () => {
  it.each([["search_arc_docs", "search-arc-docs"], ["fxRate", "fx-rate"],
    ["latestRates", "latest-rates"], ["__Get  Weather!!", "get-weather"], ["x", "x-tool"]])(
    "normalizes %s to a valid listing id", (name, expected) => expect(toSkillId(name)).toBe(expected))
  it("bounds long names and refuses names without an ASCII id", () => {
    expect(toSkillId("a".repeat(100))).toMatch(/^[a-z0-9][a-z0-9-]{1,63}$/)
    expect(() => toSkillId("☃!!!")).toThrow(/id/i)
  })
})

describe("parseMcpTarget", () => {
  it("maps only the MCP URL scheme onto HTTPS", () => {
    expect(parseMcpTarget("mcp://docs.arc.io/mcp", [])).toEqual({ url: "https://docs.arc.io/mcp" })
  })
  it("preserves raw server argv, including flags and spaces", () => {
    const rest = ["bunx", "-y", "some-server", "--price", "literal space", "--", "x;y"]
    expect(parseMcpTarget("mcp://", rest)).toEqual({ command: rest })
  })
  it.each([
    ["mcp://", []], ["mcp://", [" "]], ["https://private.example/mcp", []],
    ["mcp://private.example/mcp", ["server"]], ["mcp://user:secret@private.example/mcp", []],
    ["mcp://https://private.example/mcp", []], ["mcp:///no-host", []], ["mcp://bad host", []]
  ] as Array<[string, string[]]>)("rejects invalid or ambiguous target %s", (target, rest) => {
    expect(() => parseMcpTarget(target, rest)).toThrow()
  })
})

describe("publishableTools", () => {
  it("selects read-only tools by default and allows explicit writes", () => {
    expect(publishableTools(tools, false).map((value) => value.name)).toEqual([
      "search_arc_docs", "query_docs_filesystem_arc_docs"
    ])
    expect(publishableTools(tools, true)).toEqual(tools)
  })
  it("does not interpret absent read-only annotations as permission", () => {
    expect(publishableTools([{ name: "write_tool", inputSchema: { type: "object" } }], false)).toEqual([])
  })
})

describe("manifestFromMcpTool", () => {
  it("creates an accepted private HTTP manifest with verbatim tool schemas and derived egress", async () => {
    const generated = manifest()
    const decoded = await Effect.runPromise(decodeManifest(generated))
    expect(decoded).toMatchObject({ id: "search-arc-docs", bounds: { timeoutSec: 60 },
      egress: ["private.example"], engine: { adapter: "mcp", credential: "none", tool: tool.name, url: source.url } })
    expect(generated.inputSchema).toEqual(tool.inputSchema)
    expect(generated.outputSchema).toEqual({ type: "object", required: ["text"], properties: { text: { type: "string" } } })
    expect(JSON.stringify(toPublicListing(decoded))).not.toContain("private.example")
  })
  it("preserves explicit output schemas and stdio argv without adding network permission", () => {
    const outputSchema = { type: "object", properties: { ok: { type: "boolean" } } }
    const generated = manifestFromMcpTool({ command: ["server", "--flag", "literal space"] },
      { ...tool, outputSchema }, { price: "$0.03", timeoutSec: 90 })
    expect(generated.outputSchema).toEqual(outputSchema)
    expect(generated.engine).toMatchObject({ command: ["server", "--flag", "literal space"] })
    expect(generated.egress).toEqual([])
    expect(generated.bounds).toEqual({ timeoutSec: 90 })
  })
  it.each(["☃ private title", "x".repeat(80), "", "line\nbreak"])("uses a valid ASCII service name for %s", async (title) => {
    const generated = manifestFromMcpTool(source, { ...tool, title }, { price: "$0.01" })
    expect(String(generated.serviceName)).toMatch(/^[\x20-\x7e]+$/)
    expect(String(generated.serviceName).length).toBeLessThanOrEqual(SERVICE_NAME_MAX)
    await Effect.runPromise(decodeManifest(generated))
  })
  it("bounds fixture descriptions to the public limit", () => {
    for (const value of tools) expect(String(manifestFromMcpTool(source, value, { price: "0.02" }).description).length).toBeLessThanOrEqual(500)
  })
  it.each([{ price: "wrong" }, { price: "-1" }, { price: "$0.1234567" },
    { price: "$0.01", timeoutSec: 0 }, { price: "$0.01", timeoutSec: 901 },
    { price: "$0.01", timeoutSec: 1.5 }])("refuses invalid price or timeout before returning a manifest", (opts) => {
    expect(() => manifestFromMcpTool(source, tool, opts)).toThrow(/manifest/i)
  })
  it("refuses invalid direct source and tool inputs without echoing private data", () => {
    for (const src of [{}, { ...source, command: ["PRIVATE_COMMAND"] },
      { url: "http://PRIVATE_HOST/mcp" }, { url: "https://user:PRIVATE_TOKEN@example.com" }]) {
      expect(() => manifestFromMcpTool(src, tool, { price: "0.01" })).toThrow()
    }
    expect(() => manifestFromMcpTool(source, { ...tool, inputSchema: null } as unknown as McpTool, { price: "0.01" })).toThrow(/tool/i)
  })
  it("refuses tools requiring task execution rather than ordinary calls", () => {
    const taskTool = { ...tool, execution: { taskSupport: "required" } }
    expect(() => manifestFromMcpTool(source, taskTool, { price: "0.01" })).toThrow(/task/i)
  })
  it("does not allow unexpected source properties to override the MCP engine", () => {
    const forged = { ...source, adapter: "script", credential: "subscription", entry: "private.sh" }
    const generated = manifestFromMcpTool(forged, tool, { price: "0.01" })
    expect(generated.engine).toEqual({ adapter: "mcp", credential: "none", url: source.url, tool: tool.name })
  })
})

describe("listMcpTools", () => {
  it("collects bounded pages and closes both initialized resources", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000)
    sdk.listTools.mockResolvedValueOnce({ tools: [tool], nextCursor: "page-two" })
      .mockResolvedValueOnce({ tools: [tools[1]] })
    expect(await listMcpTools(source)).toEqual([tool, tools[1]])
    expect(sdk.transport).toHaveBeenCalledWith({ adapter: "mcp", ...source }, process.cwd())
    expect(sdk.connect).toHaveBeenCalledWith(expect.anything(), { timeout: 30_000 })
    expect(sdk.listTools).toHaveBeenNthCalledWith(2, { cursor: "page-two" }, { timeout: 30_000 })
    expect(sdk.close).toHaveBeenCalledOnce()
    expect(sdk.transportClose).toHaveBeenCalledOnce()
  })
  it.each(["connect", "list"])("closes after a %s failure and hides private diagnostics", async (phase) => {
    sdk[phase === "connect" ? "connect" : "listTools"].mockRejectedValue(new Error("PRIVATE_URL PRIVATE_TOKEN PRIVATE_COMMAND"))
    const error = await listMcpTools(source).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain("PRIVATE_")
    expect(sdk.close).toHaveBeenCalledOnce()
    expect(sdk.transportClose).toHaveBeenCalledOnce()
  })
  it("rejects malformed results and duplicate generated ids", async () => {
    for (const result of [{ tools: "wrong" }, { tools: [{ name: "missing_schema" }] },
      { tools: [tool, { ...tool, name: "search-arc-docs" }] }]) {
      sdk.listTools.mockResolvedValue(result)
      await expect(listMcpTools(source)).rejects.toThrow(/MCP/i)
    }
  })
  it("refuses repeated cursors instead of looping", async () => {
    sdk.listTools.mockResolvedValue({ tools: [], nextCursor: "same" })
    await expect(listMcpTools(source)).rejects.toThrow(/MCP/i)
    expect(sdk.listTools).toHaveBeenCalledTimes(2)
    expect(sdk.close).toHaveBeenCalledOnce()
  })
  it("bounds even a server that keeps issuing new cursors", async () => {
    let page = 0
    sdk.listTools.mockImplementation(async () => ({ tools: [], nextCursor: String(++page) }))
    await expect(listMcpTools(source)).rejects.toThrow(/MCP/i)
    expect(sdk.listTools.mock.calls.length).toBeLessThanOrEqual(20)
    expect(sdk.close).toHaveBeenCalledOnce()
  })
  it("uses one total discovery deadline instead of a new budget for every page", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000)
    sdk.connect.mockImplementation(async () => { now.mockReturnValue(31_001) })
    await expect(listMcpTools(source)).rejects.toThrow(/MCP/i)
    expect(sdk.listTools).not.toHaveBeenCalled()
    expect(sdk.close).toHaveBeenCalledOnce()
  })
  it("bounds transport startup even when connect never settles", async () => {
    vi.useFakeTimers()
    sdk.connect.mockImplementation(() => new Promise<void>(() => {}))
    let settled = false
    const outcome = listMcpTools(source).catch((value: unknown) => { settled = true; return value })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(settled).toBe(true)
    expect(await outcome).toBeInstanceOf(Error)
    expect(sdk.listTools).not.toHaveBeenCalled()
    expect(sdk.close).toHaveBeenCalledOnce()
    expect(sdk.transportClose).toHaveBeenCalledOnce()
  })
  it("projects source transport fields without accepting an adapter override", async () => {
    await listMcpTools({ ...source, adapter: "script" } as McpSource)
    expect(sdk.transport).toHaveBeenCalledWith({ adapter: "mcp", url: source.url }, process.cwd())
  })
})

describe("writeGeneratedSkills", () => {
  it("writes validated manifests and sibling extras with returned paths", async () => {
    const out = join(await temp(), "generated")
    const generated = manifest()
    const paths = await writeGeneratedSkills(out, [generated], [{ id: "search-arc-docs", name: "openapi.json", content: "{}" }])
    expect(paths).toEqual([join(out, "search-arc-docs", "arcade.json"), join(out, "search-arc-docs", "openapi.json")])
    expect(JSON.parse(await readFile(paths[0]!, "utf8"))).toEqual(generated)
    expect(await readFile(paths[1]!, "utf8")).toBe("{}")
  })
  it("refuses existing extras before writing any earlier manifest, unless forced", async () => {
    const out = await temp()
    const existingDir = join(out, "other-tool")
    await mkdir(existingDir)
    await writeFile(join(existingDir, "openapi.json"), "keep me")
    const manifests = [manifest(), manifest("other_tool")]
    const extras = [{ id: "other-tool", name: "openapi.json", content: "replacement" }]
    await expect(writeGeneratedSkills(out, manifests, extras)).rejects.toThrow(/force/)
    expect(await readdir(out)).toEqual(["other-tool"])
    expect(await readdir(existingDir)).toEqual(["openapi.json"])
    expect(await readFile(join(existingDir, "openapi.json"), "utf8")).toBe("keep me")
    await writeGeneratedSkills(out, manifests, extras, true)
    expect(await readFile(join(existingDir, "openapi.json"), "utf8")).toBe("replacement")
    await expect(writeGeneratedSkills(out, manifests)).rejects.toThrow(/force/)
  })
  it("rejects duplicate ids and invalid later manifests without creating the output root", async () => {
    const parent = await temp()
    const out = join(parent, "absent")
    for (const manifests of [[manifest(), manifest()], [manifest(), { ...manifest("second_tool"), price: "invalid" }],
      [manifest(), { ...manifest(), id: "../escape" }]]) {
      await expect(writeGeneratedSkills(out, manifests)).rejects.toThrow()
      expect(await readdir(parent)).toEqual([])
    }
  })
  it.each(["../escape", "/absolute", "nested/file.json", "nested\\file.json", "arcade.json", "ARCADE.JSON", ".", ".."])(
    "rejects unsafe or colliding extra basename %s before creating anything", async (name) => {
      const parent = await temp()
      await expect(writeGeneratedSkills(join(parent, "absent"), [manifest()], [
        { id: "search-arc-docs", name, content: "{}" }
      ])).rejects.toThrow()
      expect(await readdir(parent)).toEqual([])
    })
  it("rejects orphan and duplicate extra targets before creating anything", async () => {
    const parent = await temp()
    for (const extras of [[{ id: "../escape", name: "openapi.json", content: "{}" }],
      [{ id: "search-arc-docs", name: "spec.json", content: "{}" }, { id: "search-arc-docs", name: "SPEC.JSON", content: "{}" }]]) {
      await expect(writeGeneratedSkills(join(parent, "absent"), [manifest()], extras)).rejects.toThrow()
      expect(await readdir(parent)).toEqual([])
    }
  })
  it.each(["root", "listing", "manifest", "extra"])("refuses a symlink at the %s even with force", async (kind) => {
    const parent = await temp()
    const outside = join(parent, "outside")
    await mkdir(outside)
    const sentinel = join(outside, "sentinel")
    await writeFile(sentinel, "keep me")
    const out = join(parent, "generated")
    const dir = join(out, "search-arc-docs")
    if (kind === "root") await symlink(outside, out)
    else if (kind === "listing") { await mkdir(out); await symlink(outside, dir) }
    else { await mkdir(dir, { recursive: true }); await symlink(sentinel, join(dir, kind === "manifest" ? "arcade.json" : "spec.json")) }
    await expect(writeGeneratedSkills(out, [manifest()], [{ id: "search-arc-docs", name: "spec.json", content: "replacement" }], true)).rejects.toThrow()
    expect(await readFile(sentinel, "utf8")).toBe("keep me")
    expect(await readdir(outside)).toEqual(["sentinel"])
  })
  it.each([false, true])("refuses symlink ancestors before creating a nested output directory (existing child: %s)", async (existingChild) => {
    const parent = await temp()
    const outside = join(parent, "outside")
    await mkdir(outside)
    if (existingChild) await mkdir(join(outside, "existing"))
    const alias = join(parent, "alias")
    await symlink(outside, alias)
    const out = existingChild ? join(alias, "existing", "new") : join(alias, "new")
    await expect(writeGeneratedSkills(out, [manifest()])).rejects.toThrow(/symlink/i)
    expect(await readdir(outside)).toEqual(existingChild ? ["existing"] : [])
    if (existingChild) expect(await readdir(join(outside, "existing"))).toEqual([])
  })
  it("refuses destination directories and hard links even with force", async () => {
    const out = await temp()
    const dir = join(out, "search-arc-docs")
    await mkdir(join(dir, "arcade.json"), { recursive: true })
    await expect(writeGeneratedSkills(out, [manifest()], [], true)).rejects.toThrow()
    await rm(join(dir, "arcade.json"), { recursive: true })
    await writeFile(join(out, "sentinel"), "keep me")
    await link(join(out, "sentinel"), join(dir, "arcade.json"))
    await expect(writeGeneratedSkills(out, [manifest()], [], true)).rejects.toThrow()
    expect(await readFile(join(out, "sentinel"), "utf8")).toBe("keep me")
  })
  it("preserves seller edits and removes staging files if a forced write fails", async () => {
    const out = await temp()
    await writeGeneratedSkills(out, [manifest()])
    const dir = join(out, "search-arc-docs")
    const path = join(dir, "arcade.json")
    await writeFile(path, "seller edits")
    disk.failWrite = true
    const error = await writeGeneratedSkills(out, [manifest()], [], true).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain("PRIVATE_DISK_PATH")
    expect(await readFile(path, "utf8")).toBe("seller edits")
    expect(await readdir(dir)).toEqual(["arcade.json"])
  })
})
