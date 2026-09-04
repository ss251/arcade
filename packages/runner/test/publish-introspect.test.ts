import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SERVICE_NAME_MAX, decodeManifest, toPublicListing } from "@arcade/core"
import { Effect } from "effect"
import {
  listMcpTools, manifestFromMcpTool, parseMcpTarget, publishableTools, toSkillId,
  writeGeneratedSkills, inputSchemaFor, outputSchemaFor, operationsOf, parseAuthFlag,
  manifestFromOperation, type McpTool, type McpSource
} from "../src/publish-introspect.ts"
import { findOperation } from "../src/engines/openapi.ts"

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

type Json = Record<string, unknown>
const fx = JSON.parse(readFileSync(new URL("./fixtures/frankfurter.json", import.meta.url), "utf8")) as Json
const jsonResponse = (schema: unknown = { type: "object", properties: { ok: { type: "boolean" } } }) =>
  ({ description: "Success", content: { "application/json": { schema } } })
const apiSpec = (op: Json = {}, item: Json = {}, path = "/items") => ({
  openapi: "3.0.3", servers: [{ url: "https://root.example/v1" }],
  paths: { [path]: { ...item, post: { operationId: "createItem", responses: { "200": jsonResponse() }, ...op } } }
})
const apiRef = (spec: Json) => findOperation(spec, "createItem")!
const apiManifest = (spec: Json, opts: Parameters<typeof manifestFromOperation>[2] = { specFile: "openapi.json", price: "$0.01" }) =>
  manifestFromOperation(spec, { ...apiRef(spec), operationId: "createItem" }, opts)
const bodyFor = (schema: unknown) => ({ content: { "application/json": { schema } } })

describe("parseAuthFlag", () => {
  it.each([["header:X-Api-Key=UPSTREAM_KEY", "header", "X-Api-Key"], ["query:apikey=UPSTREAM_KEY", "query", "apikey"]])(
    "parses %s as a seller environment binding", (flag, location, name) => {
      expect(parseAuthFlag(flag)).toEqual({ in: location, name, env: "UPSTREAM_KEY" })
    })
  it.each(["X-Api-Key", "header:X-Key=HOME", "query:key=ARCADE_TOKEN", "header:X-Key=abc-def",
    "query:key=1TOKEN", "header:Bad Header=KEY", "header:Host=KEY", "header:X-Key=KEY=VALUE", "query: =KEY"])(
    "refuses invalid or reserved auth flag %s without echoing credentials", (flag) => {
      expect(() => parseAuthFlag(flag)).toThrow(/header:|query:/)
    })
})

describe("operationsOf", () => {
  it("lists named operations, skips unnamed operations, and resolves local path items", () => {
    expect(operationsOf(fx).map((op) => op.operationId)).toEqual(["fxRate"])
    const spec = { ...apiSpec(), paths: { "/items": { $ref: "#/components/pathItems/Items" } },
      components: { pathItems: { Items: { get: { operationId: "getItems" }, post: {} } } } }
    expect(operationsOf(spec)).toEqual([{ path: "/items", method: "get", op: { operationId: "getItems" }, operationId: "getItems" }])
  })
  it("rejects duplicate identifiers before any operation can be selected", () => {
    const spec = apiSpec({}, { get: { operationId: "duplicate" }, delete: { operationId: "duplicate" } })
    expect(() => operationsOf(spec)).toThrow(/duplicat|ambiguous/i)
    expect(() => apiManifest(spec)).toThrow(/duplicat|ambiguous/i)
  })
  it.each([["fooBar", "foo-bar"], ["x".repeat(65), "x".repeat(66)]])("refuses operation ids that normalize to the same listing id", (first, second) => {
    const spec = apiSpec({}, { get: { operationId: first }, delete: { operationId: second } })
    expect(() => operationsOf(spec)).toThrow(/duplicat|collid|collision/i)
  })
  it.each(["2.0", "3.2.0", "3.0", "wrong"])("refuses unsupported version %s", (openapi) => {
    expect(() => operationsOf({ ...apiSpec(), openapi })).toThrow(/version|OpenAPI/i)
  })
  it.each([{ $ref: "https://private.example/path.json" }, { $ref: "#/missing" }, []])(
    "refuses unresolved or invalid path items", (item) => {
      expect(() => operationsOf({ ...apiSpec(), paths: { "/items": item } })).toThrow()
    })
})

describe("inputSchemaFor", () => {
  it("generates the fixture's described and required scalar inputs", () => {
    expect(inputSchemaFor(fx, findOperation(fx, "fxRate")!)).toEqual({ type: "object", required: ["base", "symbols"],
      properties: { base: { type: "string", description: "ISO 4217 base currency, e.g. USD" },
        symbols: { type: "string", description: "Comma-separated target currencies, e.g. EUR,GBP" } } })
  })
  it("inherits parameters, applies operation overrides, and always requires path values", () => {
    const spec = apiSpec({ parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }] }, {
      parameters: [{ name: "id", in: "path", schema: { type: "string" } },
        { name: "limit", in: "query", required: true, schema: { type: "number" } }]
    }, "/items/{id}")
    expect(inputSchemaFor(spec, apiRef(spec))).toEqual({ type: "object", required: ["id"],
      properties: { id: { type: "string" }, limit: { type: "integer" } } })
  })
  it("matches auth by location and header case without removing unrelated buyer fields", () => {
    const spec = apiSpec({ parameters: [{ name: "x-key", in: "header", required: true, schema: { type: "string" } },
      { name: "X-Key", in: "query", required: true, schema: { type: "string" } }] })
    expect(inputSchemaFor(spec, apiRef(spec), { in: "header", name: "X-Key", env: "KEY" })).toEqual({
      type: "object", required: ["X-Key"], properties: { "X-Key": { type: "string" } }
    })
  })
  it("resolves whole request bodies and schema refs, retaining own prototype-named fields", () => {
    const properties = JSON.parse('{"__proto__":{"type":"string"},"constructor":{"type":"number"}}') as Json
    const spec = { ...apiSpec({ requestBody: { $ref: "#/components/requestBodies/Item" } }), components: {
      requestBodies: { Item: bodyFor({ $ref: "#/components/schemas/Item" }) },
      schemas: { Item: { type: "object", required: ["__proto__", "__proto__"], properties } }
    } }
    const generated = inputSchemaFor(spec, apiRef(spec))
    expect(generated).toEqual({ type: "object", required: ["__proto__"], properties })
    expect(Object.hasOwn(generated.properties as Json, "__proto__")).toBe(true)
  })
  it.each([
    [{ name: "id", in: "query", schema: { type: "string" } }, "id", undefined],
    [{ name: "token", in: "query", schema: { type: "string" } }, "token", { in: "query", name: "token", env: "KEY" }],
    [undefined, "x-key", { in: "header", name: "X-Key", env: "KEY" }]
  ] as const)("refuses body fields the runtime would remove as parameters or credentials", (parameter, name, auth) => {
    const spec = apiSpec({ parameters: parameter ? [parameter] : [],
      requestBody: bodyFor({ type: "object", properties: { [name]: { type: "string" } } }) })
    expect(() => inputSchemaFor(spec, apiRef(spec), auth)).toThrow(/collid|collision/i)
  })
  it("refuses different parameter locations that cannot share a flat buyer field", () => {
    const spec = apiSpec({ parameters: ["query", "header"].map((location) => ({ name: "id", in: location, schema: { type: "string" } })) })
    expect(() => inputSchemaFor(spec, apiRef(spec))).toThrow(/collid|collision/i)
  })
  it.each([{ type: "array", items: { type: "string" } }, { type: "object" }, { $ref: "https://private.example/schema" },
    true, null, { type: ["string"] }, { oneOf: [{ type: "string" }, { type: "number" }] }])("refuses unsupported parameter schema %j", (schema) => {
    const spec = apiSpec({ parameters: [{ name: "value", in: "query", schema }] })
    expect(() => inputSchemaFor(spec, apiRef(spec))).toThrow(/schema|reference|scalar/i)
  })
  it.each([{ content: { "multipart/form-data": {} } }, bodyFor(null), bodyFor({ type: "array" }), bodyFor({ $ref: "https://private.example/body" })])(
    "refuses unsupported body encodings and schemas", (requestBody) => {
      const spec = apiSpec({ requestBody })
      expect(() => inputSchemaFor(spec, apiRef(spec))).toThrow(/body|schema|reference/i)
    })
})

describe("outputSchemaFor", () => {
  it("takes the fixture's successful JSON schema", () => {
    expect(outputSchemaFor(fx, findOperation(fx, "fxRate")!)).toMatchObject({ required: ["base", "date", "rates"] })
  })
  it.each(["202", "206", "2XX"])("resolves whole response refs at status %s", (code) => {
    const schema = { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } }
    const spec = { ...apiSpec({ responses: { [code]: { $ref: "#/components/responses/Success" } } }),
      components: { responses: { Success: jsonResponse(schema) } } }
    expect(outputSchemaFor(spec, apiRef(spec))).toEqual(schema)
  })
  it("accepts matching success contracts even when property ordering differs", () => {
    const spec = apiSpec({ responses: { "200": jsonResponse({ type: "object", properties: { ok: { type: "boolean" } } }),
      "201": jsonResponse({ properties: { ok: { type: "boolean" } }, type: "object" }) } })
    expect(outputSchemaFor(spec, apiRef(spec))).toMatchObject({ type: "object" })
  })
  it.each([{ default: jsonResponse() }, { "204": { description: "No body" } },
    { "200": { content: { "text/plain": { schema: { type: "string" } } } } },
    { "200": jsonResponse({ type: "string" }), "201": jsonResponse({ type: "object" }) },
    { "200": jsonResponse({ oneOf: [{ type: "string" }, { type: "object" }] }) },
    { "200": jsonResponse(null) },
    { "200": jsonResponse({ enum: [null] }) },
    { "200": jsonResponse({ type: "object", $defs: { nested: { $ref: "https://private.example/output" } } }) },
    { "200": jsonResponse({ $ref: "https://private.example/output" }) }])("refuses unsupported or ambiguous success contracts", (responses) => {
    const spec = apiSpec({ responses })
    expect(() => outputSchemaFor(spec, apiRef(spec))).toThrow(/success|JSON|schema|reference/i)
  })
})

describe("manifestFromOperation", () => {
  it("generates a decoded private fixture manifest", async () => {
    const generated = manifestFromOperation(fx, { ...findOperation(fx, "fxRate")!, operationId: "fxRate" }, {
      specFile: "openapi.json", price: "$0.01", auth: { in: "header", name: "X-Key", env: "UPSTREAM_KEY" }
    })
    const decoded = await Effect.runPromise(decodeManifest(generated))
    expect(decoded).toMatchObject({ id: "fx-rate", serviceName: "FX reference rates", egress: ["api.frankfurter.dev"],
      secrets: ["UPSTREAM_KEY"], engine: { adapter: "openapi", credential: "none", spec: "openapi.json", operationId: "fxRate" } })
    expect(JSON.stringify(toPublicListing(decoded))).not.toMatch(/api\.frankfurter|UPSTREAM_KEY|openapi\.json|fxRate/)
  })
  it("follows operation then path then root server precedence with hostname-only egress", () => {
    expect(apiManifest(apiSpec()).egress).toEqual(["root.example"])
    expect(apiManifest(apiSpec({}, { servers: [{ url: "https://path.example:8443/v2" }] })).egress).toEqual(["path.example"])
    expect(apiManifest(apiSpec({ servers: [{ url: "https://operation.example:9443/v3" }] },
      { servers: [{ url: "https://path.example/v2" }] })).egress).toEqual(["operation.example"])
  })
  it.each(["http://private.example", "https://user:PRIVATE_TOKEN@private.example", "https://private.example/{version}",
    "https://private.example?key=PRIVATE_TOKEN", "https://private.example#fragment", "wrong"])("refuses unusable server %s", (url) => {
    expect(() => apiManifest(apiSpec({ servers: [{ url }] }))).toThrow(/server|HTTPS/i)
  })
  it.each(["head", "trace"])("refuses JSON-impossible %s operations", (method) => {
    const spec = { ...apiSpec(), paths: { "/items": { [method]: { operationId: "createItem", responses: { "200": jsonResponse() } } } } }
    expect(() => apiManifest(spec)).toThrow(/method|JSON|HEAD|TRACE/i)
  })
  it.each(["☃ private title", "x".repeat(80), "", "line\nbreak"])("uses a valid service name for %s", async (summary) => {
    const generated = apiManifest(apiSpec({ summary }))
    expect(generated.serviceName).toBe("create-item")
    await Effect.runPromise(decodeManifest(generated))
  })
  it.each([{ price: "wrong" }, { price: "$0.01", timeoutSec: 0 }, { price: "$0.01", timeoutSec: 901 },
    { price: "$0.01", auth: { in: "header", name: "X-Key", env: "HOME" } } ] as const)("validates every manifest before returning", (opts) => {
    expect(() => apiManifest(apiSpec(), { specFile: "openapi.json", ...opts })).toThrow()
  })
  it.each(["/tmp/private.json", "../private.json", "nested/../../private.json", "https://private.example/spec.json", "", "private\0.json"])(
    "refuses a spec file that cannot be loaded inside a listing: %s", (specFile) => {
      expect(() => apiManifest(apiSpec(), { specFile, price: "$0.01" })).toThrow(/spec|document|directory/i)
    })
  it("projects auth fields and cannot let opaque options override the adapter", () => {
    const generated = apiManifest(apiSpec(), { specFile: "openapi.json", price: "$0.01",
      auth: { in: "header", name: "X-Key", env: "KEY", adapter: "script", credential: "subscription" } } as Parameters<typeof manifestFromOperation>[2])
    expect(generated.engine).toEqual({ adapter: "openapi", credential: "none", spec: "openapi.json", operationId: "createItem",
      auth: { in: "header", name: "X-Key", env: "KEY" } })
  })
})
