import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { flagAll, publishTargetKind, runPublishIntrospection } from "../src/cli.ts"
import { listMcpTools, writeGeneratedSkills, type McpTool } from "../src/publish-introspect.ts"

vi.mock("../src/publish-introspect.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/publish-introspect.ts")>(),
  listMcpTools: vi.fn(),
  writeGeneratedSkills: vi.fn()
}))

const tool = (name: string, readOnly = true): McpTool => ({
  name, inputSchema: { type: "object" }, annotations: { readOnlyHint: readOnly }
})
const fixturePath = new URL("./fixtures/frankfurter.json", import.meta.url).pathname
const fixtureText = readFileSync(fixturePath, "utf8")
const source = "https://api.example.test/openapi.json"
const discover = vi.mocked(listMcpTools)
const write = vi.mocked(writeGeneratedSkills)
let output: string[] = []

beforeEach(() => {
  output = []
  vi.spyOn(console, "log").mockImplementation((...values: unknown[]) => { output.push(values.join(" ")) })
  discover.mockReset().mockResolvedValue([tool("search_docs"), tool("write_docs", false)])
  write.mockReset().mockResolvedValue([])
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe("publishTargetKind", () => {
  it.each(["mcp://docs.arc.io/mcp", "mcp://"])("routes %s to MCP", (target) => {
    expect(publishTargetKind(target)).toBe("mcp")
  })
  it.each([fixturePath, "./spec.yaml", "./spec.YML", source, `${source}?version=1`])(
    "routes document %s to OpenAPI", (target) => { expect(publishTargetKind(target)).toBe("openapi") }
  )
  it.each(["skills/diff-triage", "skills/diff-triage/"])("keeps %s as a directory", (target) => {
    expect(publishTargetKind(target)).toBe("dir")
  })
})

describe("flagAll", () => {
  it("collects repeated flags in order and stops before literal server argv", () => {
    expect(flagAll(["publish", "mcp://", "--tool", "a", "--tool", "b", "--", "server", "--tool", "c"], "--tool"))
      .toEqual(["a", "b"])
  })
  it("does not recognize a flag after the separator", () => {
    expect(flagAll(["publish", "mcp://", "--", "server", "--price", "$900"], "--price")).toEqual([])
    expect(flagAll(["publish", "x"], "--tool")).toEqual([])
  })
  it.each([["--tool"], ["--tool", "--yes"], ["--tool", "--", "name"], ["--tool", ""]])(
    "refuses a missing selector value in %j", (...argv) => { expect(() => flagAll(argv, "--tool")).toThrow(/value/i) }
  )
})

describe("MCP publishing", () => {
  it("emits one canonical unwritten JSON batch and reports skipped tools without executing or writing", async () => {
    await runPublishIntrospection("mcp://docs.arc.io/mcp", ["--json", "--out", "generated"])
    expect(output).toHaveLength(1)
    const batch = JSON.parse(output[0]!)
    expect(batch).toMatchObject({ version: 1, kind: "generated", source: "mcp", written: false,
      target: "mcp://docs.arc.io/mcp", skipped: [{ name: "write_docs", reason: "not-marked-read-only" }] })
    expect(batch.entries).toHaveLength(1)
    expect(batch.entries[0]).toMatchObject({ target: "generated/search-docs", skillId: "search-docs",
      engine: { adapter: "mcp", credential: "none" }, grants: [],
      public: { id: "search-docs", price: "$0.05" },
      private: { engine: { url: "https://docs.arc.io/mcp", tool: "search_docs" }, secrets: [], egress: ["docs.arc.io"] } })
    expect(batch.entries[0].public).not.toHaveProperty("engine")
    expect(batch.entries[0].public).not.toHaveProperty("secrets")
    expect(discover).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled()
  })
  it("keeps literal stdio argv private in JSON without promoting server write flags", async () => {
    const command = ["server", "PRIVATE_LITERAL_ARGUMENT", "--yes", "--json", "--force"]
    await runPublishIntrospection("mcp://", ["--json", "--", ...command])
    const batch = JSON.parse(output[0]!)
    expect(batch.written).toBe(false)
    expect(batch.entries[0].private.engine.command).toEqual(command)
    expect(JSON.stringify(batch.entries[0].public)).not.toContain("PRIVATE_LITERAL_ARGUMENT")
    expect(write).not.toHaveBeenCalled()
  })
  it("does not emit a partial JSON batch when a later generated manifest is invalid", async () => {
    discover.mockResolvedValueOnce([tool("valid"), { ...tool("invalid"), inputSchema: {} }])
    await expect(runPublishIntrospection("mcp://docs.arc.io/mcp", ["--json"])).rejects.toThrow()
    expect(discover).toHaveBeenCalledOnce()
    expect(output).toEqual([]); expect(write).not.toHaveBeenCalled()
  })
  it("previews only read-only tools and keeps server arguments literal and private", async () => {
    const serverArgs = ["server", "PRIVATE_TOKEN", "--yes", "--price", "$900", "--help", "-h"]
    await runPublishIntrospection("mcp://", ["--", ...serverArgs])
    expect(discover).toHaveBeenCalledWith({ command: serverArgs })
    expect(write).not.toHaveBeenCalled()
    expect(output.join("\n")).toContain("search-docs  $0.05")
    expect(output.join("\n")).toContain("skipped write_docs")
    expect(output.join("\n")).not.toContain("PRIVATE_TOKEN")
  })
  it("writes only selected tools when explicitly enabled", async () => {
    await runPublishIntrospection("mcp://docs.arc.io/mcp", ["--tool", "write_docs", "--include-writes", "--price", "$0.02", "--out", "generated", "--yes", "--force"])
    expect(write).toHaveBeenCalledWith("generated", [expect.objectContaining({ id: "write-docs", price: "$0.02" })], [], true)
  })
  it.each([
    ["--price", "PRIVATE_BAD_PRICE"], ["--tool"], ["--tool", ""], ["--price", "$0.01", "--price", "$0.02"],
    ["--operation", "search_docs"], ["--auth", "header:X-Key=PRIVATE_TOKEN"], ["--unknown"]
  ])("refuses invalid options before discovery: %j", async (...argv) => {
    await expect(runPublishIntrospection("mcp://docs.arc.io/mcp", argv)).rejects.toThrow()
    expect(discover).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(output).toEqual([])
  })
  it.each([[], ["--yes"]])("refuses unknown or ineligible selectors without a partial preview: %j", async (...flags) => {
    for (const name of ["missing", "write_docs"]) {
      await expect(runPublishIntrospection("mcp://docs.arc.io/mcp", ["--tool", "search_docs", "--tool", name, ...flags]))
        .rejects.toThrow(/tool|read-only/i)
    }
    expect(output).toEqual([])
    expect(write).not.toHaveBeenCalled()
  })
  it("refuses empty discovery and invalid later manifests before preview", async () => {
    for (const tools of [[], [tool("write_docs", false)], [tool("valid"), { ...tool("invalid"), inputSchema: {} }],
      [tool("same_name"), tool("same-name")]]) {
      discover.mockResolvedValueOnce(tools)
      await expect(runPublishIntrospection("mcp://docs.arc.io/mcp", [])).rejects.toThrow()
    }
    expect(output).toEqual([])
    expect(write).not.toHaveBeenCalled()
  })
  it("does not expose third-party discovery errors", async () => {
    discover.mockRejectedValueOnce(new Error("PRIVATE_TOKEN"))
    const error = await runPublishIntrospection("mcp://docs.arc.io/mcp?key=PRIVATE_TOKEN", []).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/could not introspect/i)
    expect((error as Error).message).not.toContain("PRIVATE_TOKEN")
    expect(output.join("\n")).not.toContain("PRIVATE_TOKEN")
  })
})

describe("OpenAPI publishing", () => {
  it("uses actual public/private projection for local OpenAPI JSON without claiming generated files exist", async () => {
    await runPublishIntrospection(fixturePath, ["--json", "--out", "generated", "--auth", "header:X-Key=UPSTREAM_KEY"])
    expect(output).toHaveLength(1)
    const batch = JSON.parse(output[0]!)
    expect(batch).toMatchObject({ version: 1, kind: "generated", source: "openapi", written: false, skipped: [] })
    expect(batch.entries).toHaveLength(1)
    expect(batch.entries[0]).toMatchObject({ target: "generated/fx-rate", skillId: "fx-rate",
      public: { id: "fx-rate" }, private: { secrets: ["UPSTREAM_KEY"],
        engine: { adapter: "openapi", spec: "openapi.json", operationId: "fxRate", auth: { env: "UPSTREAM_KEY" } } } })
    for (const key of ["engine", "secrets", "egress", "workdir", "systemPrompt"]) expect(batch.entries[0].public).not.toHaveProperty(key)
    expect(write).not.toHaveBeenCalled(); expect(discover).not.toHaveBeenCalled()
  })
  it.each(["mcp://docs.arc.io/mcp", source])("refuses a zero price before reading or introspecting %s", async (target) => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    await expect(runPublishIntrospection(target, ["--price", "$0", "--yes"])).rejects.toThrow(/price/i)
    expect(fetcher).not.toHaveBeenCalled()
    expect(discover).not.toHaveBeenCalled()
    expect(output).toEqual([])
    expect(write).not.toHaveBeenCalled()
  })
  it("previews a local JSON document without writing", async () => {
    await runPublishIntrospection(fixturePath, ["--operation", "fxRate"])
    expect(output.join("\n")).toContain("fx-rate  $0.05")
    expect(output.join("\n")).toContain("Nothing written")
    expect(write).not.toHaveBeenCalled()
  })
  it("writes a self-contained spec and an environment-name auth binding", async () => {
    await runPublishIntrospection(fixturePath, ["--auth", "header:X-Key=UPSTREAM_KEY", "--yes", "--out", "generated"])
    expect(write).toHaveBeenCalledWith("generated", [expect.objectContaining({ id: "fx-rate", secrets: ["UPSTREAM_KEY"],
      engine: expect.objectContaining({ spec: "openapi.json", auth: { in: "header", name: "X-Key", env: "UPSTREAM_KEY" } }) })],
    [{ id: "fx-rate", name: "openapi.json", content: `${JSON.stringify(JSON.parse(fixtureText), null, 2)}\n` }], false)
  })
  it.each([false, true])("refuses empty or invalid batches before any preview or write (write: %s)", async (yes) => {
    const fixture = JSON.parse(fixtureText) as Record<string, unknown>
    for (const paths of [{}, { ...fixture["paths"] as object, "/unsupported": { get: {
      operationId: "unsupported", responses: { "200": { description: "No JSON response" } }
    } } }]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...fixture, paths })))
      await expect(runPublishIntrospection(source, yes ? ["--yes"] : [])).rejects.toThrow()
    }
    expect(output).toEqual([])
    expect(write).not.toHaveBeenCalled()
  })
  it.each(["mcp://docs.arc.io/mcp", source])("refuses conflicting or duplicate JSON flags before introspecting %s", async (target) => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    for (const flags of [["--json", "--yes"], ["--json", "--force"], ["--json", "--json"]]) {
      await expect(runPublishIntrospection(target, flags)).rejects.toThrow(/preview-only|once/)
    }
    expect(fetcher).not.toHaveBeenCalled()
    expect(discover).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })
  it.each([["--operation", "missing"], ["--operation", "fxRate", "--operation", "missing"],
    ["--auth", "header:X-Key=HOME"], ["--price", "PRIVATE_BAD_PRICE"], ["--tool", "fxRate"]])(
    "refuses invalid options and selectors without a preview: %j", async (...argv) => {
      await expect(runPublishIntrospection(fixturePath, argv)).rejects.toThrow()
      expect(output).toEqual([])
      expect(write).not.toHaveBeenCalled()
    }
  )
  it.each(["/missing/PRIVATE_TOKEN.yaml", "https://api.example.test/spec.yml?key=PRIVATE_TOKEN"])(
    "refuses YAML before reading or fetching %s", async (target) => {
      const fetcher = vi.fn()
      vi.stubGlobal("fetch", fetcher)
      await expect(runPublishIntrospection(target, [])).rejects.toThrow(/YAML.*JSON/i)
      expect(fetcher).not.toHaveBeenCalled()
      expect(output).toEqual([])
    }
  )
  it.each(["http://api.example.test/spec.json", "https://user:PRIVATE_TOKEN@api.example.test/spec.json", "file:///tmp/spec.json"])(
    "refuses unsafe document URL %s before fetching", async (target) => {
      const fetcher = vi.fn()
      vi.stubGlobal("fetch", fetcher)
      const error = await runPublishIntrospection(target, []).catch((value: unknown) => value)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(/HTTPS/)
      expect((error as Error).message).not.toContain("PRIVATE_TOKEN")
      expect(fetcher).not.toHaveBeenCalled()
    }
  )
  it("fetches HTTPS JSON with redirect refusal and a cancellation signal", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(fixtureText))
    vi.stubGlobal("fetch", fetcher)
    await runPublishIntrospection(`${source}?key=PRIVATE_TOKEN`, [])
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }))
    expect(output.join("\n")).not.toContain("PRIVATE_TOKEN")
  })
  it.each([302, 404, 500])("refuses HTTP status %s without printing response content", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("PRIVATE_TOKEN", { status })))
    await expect(runPublishIntrospection(source, [])).rejects.toThrow(/status|redirect/i)
    expect(output).toEqual([])
  })
  it("refuses a redirected response even if its final status is successful", async () => {
    const response = new Response(fixtureText)
    Object.defineProperty(response, "redirected", { value: true })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    await expect(runPublishIntrospection(source, [])).rejects.toThrow(/redirect/i)
  })
  it.each([true, false])("bounds document bytes with a declared length: %s", async (declared) => {
    const response = new Response(declared ? fixtureText : "x".repeat(5 * 1024 * 1024 + 1),
      declared ? { headers: { "content-length": String(5 * 1024 * 1024 + 1) } } : undefined)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    await expect(runPublishIntrospection(source, [])).rejects.toThrow(/size|large|limit/i)
    expect(output).toEqual([])
  })
  it.each(["request", "body"])("bounds a stalled %s with the same deadline", async (where) => {
    vi.useFakeTimers()
    const stalled = where === "request" ? new Promise<Response>(() => {}) :
      Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start() {} })))
    const fetcher = vi.fn().mockReturnValue(stalled)
    vi.stubGlobal("fetch", fetcher)
    const result = runPublishIntrospection(source, []).catch((value: unknown) => value)
    await vi.advanceTimersByTimeAsync(30_001)
    const error = await result
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/time|deadline/i)
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true)
    expect(output).toEqual([])
  })
  it("sanitizes malformed JSON and network errors", async () => {
    for (const response of [() => Promise.resolve(new Response('{"PRIVATE_TOKEN"')), () => Promise.reject(new Error("PRIVATE_TOKEN"))]) {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(response))
      const error = await runPublishIntrospection(source, []).catch((value: unknown) => value)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).not.toContain("PRIVATE_TOKEN")
    }
    expect(output).toEqual([])
  })
})
