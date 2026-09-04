import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { isReservedEnvName } from "@arcade/core"
import type { Engine, EngineConfig, HarnessJob, JobEnvelope, SkillAgent } from "./types.js"

/** Only this listing's fixed tool is callable; buyer input supplies arguments, never a selector. */
export interface McpClient {
  readonly callTool: (params: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>
  readonly close: () => Promise<void>
}

const MALFORMED = "mcp adapter: the tool returned a malformed result"
const TOOL_ERROR = "mcp adapter: the upstream tool reported an error"
const EMPTY = "mcp adapter: the tool returned an empty result; nothing to settle"

export const textOf = (result: unknown): string => {
  const parsed = CallToolResultSchema.safeParse(result)
  if (!parsed.success) return ""
  return parsed.data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n").trim()
}

export const outputFor = (result: unknown): { output?: unknown; error?: string } => {
  const parsed = CallToolResultSchema.safeParse(result)
  if (!parsed.success) return { error: MALFORMED }
  if (parsed.data.isError === true) return { error: TOOL_ERROR }
  if (parsed.data.structuredContent !== undefined) return { output: parsed.data.structuredContent }
  const text = textOf(parsed.data)
  return text === "" ? { error: EMPTY } : { output: { text } }
}

/** Runtime checks also protect callers that construct config directly, such as discovery. */
const transportIssue = (config: EngineConfig): string | undefined => {
  if (config.adapter !== "mcp") return "mcp adapter: invalid adapter configuration"
  if ((config.url === undefined) === (config.command === undefined)) {
    return "mcp adapter: declare exactly one command or url transport"
  }
  if (config.url !== undefined) {
    try {
      const url = new URL(config.url)
      if (url.protocol !== "https:") return "mcp adapter: engine.url must be https"
      if (url.username !== "" || url.password !== "") return "mcp adapter: use an upstream credential binding instead of URL credentials"
    } catch { return "mcp adapter: engine.url must be a valid https URL" }
  }
  if (config.command !== undefined && !config.command[0]?.trim()) {
    return "mcp adapter: command requires a non-empty executable"
  }
  const auth = config.auth
  if (auth !== undefined && (
    config.url === undefined || !["header", "query"].includes(auth.in) ||
    auth.name.length === 0 || auth.name.length > 128 ||
    (auth.in === "header" && /[^!#$%&'*+.^_`|~0-9A-Za-z-]/.test(auth.name)) ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(auth.env) || isReservedEnvName(auth.env)
  )) return "mcp adapter: invalid upstream credential binding"
  return undefined
}

/** The harness owns this one child, including while the SDK is gracefully closing it. */
const ownedStdio = (transport: StdioClientTransport): Transport => {
  const start = transport.start.bind(transport)
  const close = transport.close.bind(transport)
  let ownedPid: number | undefined
  let armed = false
  const killOwned = () => {
    if (!armed) return
    // SDK close clears its public pid before the child exits. Keep our captured pid
    // until its close event or the close promise settles; never signal a process group.
    const pid = transport.pid ?? ownedPid
    if (pid === undefined || !Number.isInteger(pid) || pid <= 0 || pid === process.pid) return
    try { process.kill(pid, "SIGKILL") } catch { /* Already exited. */ }
  }
  const release = () => {
    process.off("SIGTERM", terminate)
    process.off("SIGINT", interrupt)
    process.off("exit", killOwned)
    armed = false
    ownedPid = undefined
  }
  const stop = (code: number) => {
    killOwned()
    release()
    process.exit(code)
  }
  const terminate = () => stop(143)
  const interrupt = () => stop(130)
  const previousOnclose = transport.onclose
  transport.onclose = () => { release(); previousOnclose?.() }
  transport.start = async () => {
    if (armed) throw new Error("mcp adapter: stdio transport is already started")
    armed = true
    process.on("SIGTERM", terminate)
    process.on("SIGINT", interrupt)
    process.on("exit", killOwned)
    try {
      await start()
      ownedPid = transport.pid ?? undefined
    } catch {
      killOwned()
      release()
      throw new Error("mcp adapter: stdio server could not start")
    }
  }
  transport.close = async () => {
    try { await close() }
    catch { throw new Error("mcp adapter: stdio server could not close") }
    finally { killOwned(); release() }
  }
  return transport
}

export const transportFor = (config: EngineConfig, skillDir: string): Transport => {
  const issue = transportIssue(config)
  if (issue !== undefined) throw new Error(issue)
  try {
    if (config.url !== undefined) {
      const url = new URL(config.url)
      const headers = new Headers()
      if (config.auth !== undefined) {
        const value = process.env[config.auth.env]
        if (value === undefined || value === "") throw new Error("missing credential")
        if (config.auth.in === "header") headers.set(config.auth.name, value)
        else url.searchParams.set(config.auth.name, value)
      }
      return new StreamableHTTPClientTransport(url, {
        requestInit: { headers, redirect: "error" },
        // The SDK's SSE GET does not inherit requestInit.redirect. Enforce it at fetch
        // so no method can forward a header or query credential through a redirect.
        fetch: (url, init) => globalThis.fetch(url, { ...init, redirect: "error" })
      // SDK's getter returns undefined before a session exists, while Transport declares
      // an optional string. This is the same runtime contract under exactOptional types.
      }) as Transport
    }
    const [command, ...args] = config.command!
    const env: Record<string, string> = {}
    for (const [name, value] of Object.entries(process.env)) if (value !== undefined) env[name] = value
    return ownedStdio(new StdioClientTransport({ command: command!, args, env, cwd: skillDir, stderr: "ignore" }))
  } catch {
    // Raw URL, header and spawn exceptions can contain the seller's upstream secrets.
    throw new Error("mcp adapter: transport or upstream credential configuration is unavailable")
  }
}

const connectDefault = async (config: EngineConfig, job: HarnessJob): Promise<McpClient> => {
  const transport = transportFor(config, job.skillDir)
  const client = new Client({ name: "arcade-runner", version: "0.1.0" }, { capabilities: {} })
  const timeout = job.bounds.timeoutSec * 1000
  try {
    await client.connect(transport, { timeout })
    return {
      callTool: (params) => client.callTool(params, undefined, { timeout }),
      close: () => client.close()
    }
  } catch {
    // SDK start failures may occur before its own cleanup block. We own both objects.
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
    throw new Error("mcp adapter: connection failed")
  }
}

export const runMcp = async (
  _agent: SkillAgent,
  job: HarnessJob,
  _prompt: string,
  connect: (config: EngineConfig, job: HarnessJob) => Promise<McpClient> = connectDefault
): Promise<JobEnvelope> => {
  let usage = { turns: 0, tokens: 0, toolCalls: 0 }
  const config = job.engineConfig
  if (config?.tool === undefined || config.tool.trim() === "") {
    return { stopReason: "error", usage, costUsd: 0, error: "mcp adapter: engine.tool is not set" }
  }
  const issue = transportIssue(config)
  if (issue !== undefined) return { stopReason: "error", usage, costUsd: 0, error: issue }
  if (typeof job.input !== "object" || job.input === null || Array.isArray(job.input)) {
    return { stopReason: "rejected", usage, costUsd: 0, error: "mcp adapter: input must be a JSON object" }
  }

  let client: McpClient | undefined
  try {
    client = await connect(config, job)
    usage = { turns: 1, tokens: 0, toolCalls: 1 }
    const result = await client.callTool({ name: config.tool, arguments: job.input as Record<string, unknown> })
    const projected = outputFor(result)
    if (projected.output === undefined) {
      return { stopReason: projected.error === EMPTY ? "incomplete" : "error", usage, costUsd: 0,
        error: projected.error ?? MALFORMED }
    }
    return { output: projected.output, stopReason: "end_turn", usage, costUsd: 0 }
  } catch {
    return { stopReason: "error", usage, costUsd: 0, error: "mcp adapter: connection or tool call failed" }
  } finally {
    if (client !== undefined) await client.close().catch(() => {})
  }
}

export const mcpEngine: Engine = {
  adapter: "mcp",
  run: (agent, job, prompt) => runMcp(agent, job, prompt),
  envGrants: () => [],
  doctor: async () => ({ ok: true, detail: "mcp adapter: use arcade publish to check server reachability" })
}
