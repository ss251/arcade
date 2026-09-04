import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mcpEngine, outputFor, runMcp, textOf, transportFor } from "../src/engines/mcp.ts"
import type { EngineConfig, HarnessJob, SkillAgent } from "../src/engines/types.ts"

const sdk = vi.hoisted(() => ({
  connect: vi.fn(), callTool: vi.fn(), close: vi.fn(),
  httpConstructor: vi.fn(), httpClose: vi.fn(), stdioConstructor: vi.fn(), stdioClose: vi.fn(),
  stdioStart: vi.fn(), stdioPid: null as number | null
}))
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({ Client: class {
  connect = sdk.connect
  callTool = sdk.callTool
  close = sdk.close
} }))
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({ StreamableHTTPClientTransport: class {
  constructor(...args: unknown[]) { sdk.httpConstructor(...args) }
  close = sdk.httpClose
} }))
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({ StdioClientTransport: class {
  constructor(...args: unknown[]) { sdk.stdioConstructor(...args) }
  onclose?: () => void
  get pid() { return sdk.stdioPid }
  start = sdk.stdioStart
  close = async () => { await sdk.stdioClose(); sdk.stdioPid = null; this.onclose?.() }
} }))

beforeEach(() => {
  vi.resetAllMocks()
  sdk.connect.mockResolvedValue(undefined)
  sdk.callTool.mockResolvedValue({ content: [{ type: "text", text: "success" }] })
  sdk.close.mockResolvedValue(undefined)
  sdk.httpClose.mockResolvedValue(undefined)
  sdk.stdioClose.mockResolvedValue(undefined)
  sdk.stdioPid = null
  sdk.stdioStart.mockImplementation(async () => { sdk.stdioPid = 321000 })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const agent: SkillAgent = { systemPrompt: "" }
const config: EngineConfig = { adapter: "mcp", url: "https://private.example/mcp", tool: "private_tool" }
const job = (over: Partial<HarnessJob> = {}): HarnessJob => ({
  jobId: "job-1", input: { query: "gateway" }, skillDir: "/private/skill",
  bounds: { timeoutSec: 30 }, outputSchema: { type: "object" }, engineConfig: config, ...over
})
const client = (result: unknown) => ({
  callTool: vi.fn(async () => result), close: vi.fn(async () => {})
})
const withEnv = <T>(env: Record<string, string>, run: () => T): T => {
  const previous = process.env
  process.env = env
  try { return run() } finally { process.env = previous }
}

describe("textOf and outputFor", () => {
  it("joins text blocks and ignores other content", () => {
    expect(textOf({ content: [
      { type: "text", text: "one" }, { type: "image", data: "AA==", mimeType: "image/png" },
      { type: "text", text: "two" }
    ] })).toBe("one\ntwo")
    expect(textOf({})).toBe("")
  })

  it("prefers structured content and otherwise wraps text", () => {
    expect(outputFor({ structuredContent: { rate: 1.2 }, content: [{ type: "text", text: "other" }] }))
      .toEqual({ output: { rate: 1.2 } })
    expect(outputFor({ content: [{ type: "text", text: "hello" }] })).toEqual({ output: { text: "hello" } })
  })

  it("reports an empty result instead of an output", () => {
    expect(outputFor({ content: [] }).output).toBeUndefined()
    expect(outputFor({ content: [] }).error).toMatch(/empty/i)
  })

  it.each([null, undefined, 1, [], { content: "bad" }, { content: [null] },
    { content: [{ type: "text", text: 3 }] }, { structuredContent: null }, { structuredContent: 1 },
    { isError: "yes" }].map((result) => [result]))("rejects malformed results without throwing", (result) => {
    expect(outputFor(result).output).toBeUndefined()
    expect(outputFor(result).error).toMatch(/malformed/i)
  })

  it("does not return error content as paid output or expose upstream diagnostics", () => {
    const result = outputFor({ isError: true, content: [{ type: "text", text: "CANARY_PRIVATE_TOKEN" }] })
    expect(result.output).toBeUndefined()
    expect(result.error).toMatch(/error/)
    expect(result.error).not.toContain("CANARY_PRIVATE_TOKEN")
  })
})

describe("transportFor", () => {
  it.each([
    { adapter: "mcp", tool: "t" },
    { adapter: "mcp", command: [], tool: "t" },
    { adapter: "mcp", command: ["  "], tool: "t" },
    { ...config, command: ["private-command"] },
    { ...config, url: "http://private.example/mcp" },
    { ...config, url: "https://" },
    { ...config, url: "https://private-user:private-password@private.example/mcp" }
  ] as EngineConfig[])("refuses unusable or ambiguous transport configuration", (input) => {
    expect(() => transportFor(input, "/private/skill")).toThrow()
    expect(sdk.httpConstructor).not.toHaveBeenCalled()
    expect(sdk.stdioConstructor).not.toHaveBeenCalled()
  })

  it("allows tool discovery before a tool is selected", () => {
    transportFor({ adapter: "mcp", url: "https://private.example/mcp" }, "/private/skill")
    expect(sdk.httpConstructor).toHaveBeenCalledOnce()
  })

  it("binds a header credential from the scrubbed environment", () => {
    withEnv({ UPSTREAM_KEY: "CANARY_SECRET" }, () => transportFor({ ...config,
      auth: { in: "header", name: "X-Api-Key", env: "UPSTREAM_KEY" }
    }, "/private/skill"))
    const [url, options] = sdk.httpConstructor.mock.calls[0] as [URL, { requestInit: RequestInit }]
    expect(url.toString()).toBe(config.url)
    expect(new Headers(options.requestInit.headers).get("X-Api-Key")).toBe("CANARY_SECRET")
    expect(url.toString()).not.toContain("CANARY_SECRET")
  })

  it("binds and escapes query auth without mutating the private config", () => {
    const input: EngineConfig = { ...config, url: "https://private.example/mcp?api_key=old&x=1",
      auth: { in: "query", name: "api_key", env: "UPSTREAM_KEY" } }
    withEnv({ UPSTREAM_KEY: "CANARY +&?" }, () => transportFor(input, "/private/skill"))
    const url = sdk.httpConstructor.mock.calls[0]?.[0] as URL
    expect(url.searchParams.getAll("api_key")).toEqual(["CANARY +&?"])
    expect(url.searchParams.get("x")).toBe("1")
    expect(input.url).toContain("api_key=old")
  })

  it.each(["GET", "POST", "DELETE"])("forbids redirects through the transport fetch for %s", async (method) => {
    const fetch = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetch)
    transportFor(config, "/private/skill")
    const options = sdk.httpConstructor.mock.calls[0]?.[1] as {
      fetch: (url: URL, init: RequestInit) => Promise<Response>
    }
    await options.fetch(new URL(config.url!), { method, redirect: "follow" })
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method, redirect: "error" })
  })

  it("refuses absent or reserved credential bindings without exposing their names", () => {
    for (const env of ["MISSING_PRIVATE_KEY", "HOME"]) {
      const error = withEnv({ HOME: "/private/home" }, () => {
        try { return transportFor({ ...config, auth: { in: "header", name: "X-Key", env } }, "/private/skill") }
        catch (e) { return e }
      })
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).not.toContain(env)
      expect((error as Error).message).not.toContain("/private")
    }
  })

  it("rejects a trailing newline in an auth environment name before reading credentials", () => {
    withEnv({ "UPSTREAM_KEY\n": "CANARY_SECRET" }, () => {
      expect(() => transportFor({ ...config,
        auth: { in: "header", name: "X-Key", env: "UPSTREAM_KEY\n" }
      }, "/private/skill")).toThrow(/credential binding/)
    })
    expect(sdk.httpConstructor).not.toHaveBeenCalled()
  })

  it("passes only the current scrubbed environment to stdio and suppresses private stderr", () => {
    withEnv({ HOME: "/sandbox", PATH: "/bin", UPSTREAM_KEY: "CANARY_SECRET" }, () =>
      transportFor({ adapter: "mcp", command: ["private-command", "--arg"] }, "/private/skill"))
    const args = sdk.stdioConstructor.mock.calls[0]?.[0] as Record<string, unknown>
    expect(args).toMatchObject({
      command: "private-command", args: ["--arg"], cwd: "/private/skill", stderr: "ignore",
      env: { HOME: "/sandbox", PATH: "/bin", UPSTREAM_KEY: "CANARY_SECRET" }
    })
  })

  it.each([["SIGTERM", 143], ["SIGINT", 130]] as const)("kills only its owned child on %s and releases listeners", async (signal, code) => {
    const previous = process.listeners(signal)
    const kill = vi.spyOn(process, "kill").mockReturnValue(true)
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("MOCK_EXIT") })
    const transport = withEnv({}, () => transportFor({ adapter: "mcp", command: ["private-command"] }, "/private/skill"))
    try {
      await transport.start()
      const terminate = process.listeners(signal).find((handler) => !previous.includes(handler))
      expect(terminate).toBeTypeOf("function")
      expect(() => terminate?.(signal)).toThrow("MOCK_EXIT")
      expect(kill).toHaveBeenCalledWith(321000, "SIGKILL")
      expect(exit).toHaveBeenCalledWith(code)
    } finally { await transport.close() }
    expect(process.listeners(signal)).toEqual(previous)
  })

  it("retains child ownership while SDK close has cleared its public pid", async () => {
    const previous = process.listeners("SIGTERM")
    const kill = vi.spyOn(process, "kill").mockReturnValue(true)
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("MOCK_EXIT") })
    let finishClose!: () => void
    sdk.stdioClose.mockImplementation(() => {
      sdk.stdioPid = null
      return new Promise<void>((resolve) => { finishClose = resolve })
    })
    const transport = withEnv({}, () => transportFor({ adapter: "mcp", command: ["private-command"] }, "/private/skill"))
    await transport.start()
    const closing = transport.close()
    try {
      const terminate = process.listeners("SIGTERM").find((handler) => !previous.includes(handler))
      expect(terminate).toBeTypeOf("function")
      expect(() => terminate?.("SIGTERM")).toThrow("MOCK_EXIT")
      expect(kill).toHaveBeenCalledWith(321000, "SIGKILL")
    } finally { finishClose(); await closing }
    expect(process.listeners("SIGTERM")).toEqual(previous)
  })

  it("releases listeners and sanitizes failed close while killing its owned child", async () => {
    const before = ["SIGTERM", "SIGINT", "exit"].map((event) => process.listenerCount(event))
    const kill = vi.spyOn(process, "kill").mockReturnValue(true)
    sdk.stdioClose.mockRejectedValue(new Error("CANARY_PRIVATE_CLOSE"))
    const transport = withEnv({}, () => transportFor({ adapter: "mcp", command: ["private-command"] }, "/private/skill"))
    await transport.start()
    const error = await transport.close().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain("CANARY_PRIVATE_CLOSE")
    expect(kill).toHaveBeenCalledWith(321000, "SIGKILL")
    expect(["SIGTERM", "SIGINT", "exit"].map((event) => process.listenerCount(event))).toEqual(before)
  })

  it("releases cancellation listeners and partial ownership when stdio startup rejects", async () => {
    const before = ["SIGTERM", "SIGINT", "exit"].map((event) => process.listenerCount(event))
    vi.spyOn(process, "kill").mockReturnValue(true)
    sdk.stdioStart.mockImplementation(async () => {
      sdk.stdioPid = 321000
      throw new Error("CANARY_PRIVATE_START")
    })
    const transport = withEnv({}, () => transportFor({ adapter: "mcp", command: ["private-command"] }, "/private/skill"))
    const error = await transport.start().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain("CANARY_PRIVATE_START")
    expect(["SIGTERM", "SIGINT", "exit"].map((event) => process.listenerCount(event))).toEqual(before)
  })
})

describe("runMcp", () => {
  it("calls only the listing's tool with unchanged object arguments, then closes", async () => {
    const connected = client({ structuredContent: { ok: true } })
    const input = { tool: "buyer-controlled", query: "gateway" }
    const result = await runMcp(agent, job({ input }), "", async () => connected)
    expect(connected.callTool).toHaveBeenCalledWith({ name: "private_tool", arguments: input })
    expect(result).toMatchObject({ output: { ok: true }, stopReason: "end_turn", costUsd: 0,
      usage: { turns: 1, tokens: 0, toolCalls: 1 } })
    expect(connected.close).toHaveBeenCalledOnce()
  })

  it.each(["string", null, []])("rejects non-object tool arguments before connecting", async (input) => {
    const connect = vi.fn(async () => client({ content: [] }))
    const result = await runMcp(agent, job({ input }), "", connect)
    expect(result.stopReason).toBe("rejected")
    expect(result.costUsd).toBe(0)
    expect(connect).not.toHaveBeenCalled()
  })

  it("refuses a missing tool before connecting", async () => {
    const connect = vi.fn(async () => client({ content: [] }))
    const result = await runMcp(agent, job({ engineConfig: { adapter: "mcp", url: config.url! } }), "", connect)
    expect(result.stopReason).toBe("error")
    expect(result.error).toContain("tool")
    expect(connect).not.toHaveBeenCalled()
  })

  it.each([
    [{ isError: true, content: [{ type: "text", text: "CANARY_PRIVATE_ERROR" }] }, "error"],
    [{ content: [] }, "incomplete"],
    [null, "error"],
    [{ structuredContent: "not an object" }, "error"]
  ])("does not settle failed or malformed results and always closes", async (response, reason) => {
    const connected = client(response)
    const result = await runMcp(agent, job(), "", async () => connected)
    expect(result.stopReason).toBe(reason)
    expect(result.output).toBeUndefined()
    expect(result.costUsd).toBe(0)
    expect(result.error).not.toContain("CANARY_PRIVATE_ERROR")
    expect(connected.close).toHaveBeenCalledOnce()
  })

  it("sanitizes raw connect and call failures including private config and auth details", async () => {
    const raw = "https://private.example/mcp private-command private_tool UPSTREAM_KEY CANARY_SECRET"
    const failedConnect = await runMcp(agent, job(), "", async () => { throw new Error(raw) })
    const connected = client({})
    connected.callTool.mockRejectedValue(new Error(raw))
    const failedCall = await runMcp(agent, job(), "", async () => connected)
    for (const result of [failedConnect, failedCall]) {
      expect(result.stopReason).toBe("error")
      expect(result.output).toBeUndefined()
      expect(result.costUsd).toBe(0)
      for (const part of raw.split(" ")) expect(result.error).not.toContain(part)
    }
    expect(connected.close).toHaveBeenCalledOnce()
  })

  it("closes both partially initialized SDK resources when the default connect rejects", async () => {
    sdk.connect.mockRejectedValue(new Error("CANARY_PRIVATE_CONNECT"))
    const result = await runMcp(agent, job(), "")
    expect(result.stopReason).toBe("error")
    expect(result.error).not.toContain("CANARY_PRIVATE_CONNECT")
    expect(sdk.close).toHaveBeenCalledOnce()
    expect(sdk.httpClose).toHaveBeenCalledOnce()
    expect(sdk.callTool).not.toHaveBeenCalled()
  })

  it("does not replace a valid result with a private cleanup failure", async () => {
    const connected = client({ structuredContent: { ok: true } })
    connected.close.mockRejectedValue(new Error("CANARY_PRIVATE_CLOSE"))
    const result = await runMcp(agent, job(), "", async () => connected)
    expect(result.stopReason).toBe("end_turn")
    expect(JSON.stringify(result)).not.toContain("CANARY_PRIVATE_CLOSE")
  })

  it("declares no ambient environment grants", () => {
    expect(mcpEngine.adapter).toBe("mcp")
    expect(mcpEngine.envGrants(agent)).toEqual([])
  })
})
