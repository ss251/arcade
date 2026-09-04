import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { ListToolsResultSchema, ToolSchema } from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { link, lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises"
import { basename, dirname, join, parse, resolve, sep } from "node:path"
import { SERVICE_NAME_MAX, SkillManifest } from "@arcade/core"
import { Schema } from "effect"
import { transportFor } from "./engines/mcp.ts"

export interface McpSource {
  readonly url?: string
  readonly command?: ReadonlyArray<string>
}

export interface McpTool {
  readonly name: string
  readonly title?: string
  readonly description?: string
  readonly inputSchema: Record<string, unknown>
  readonly outputSchema?: Record<string, unknown>
  readonly annotations?: {
    readonly title?: string
    readonly readOnlyHint?: boolean
    readonly destructiveHint?: boolean
  }
}

/** A tool without a declared output schema is sold as the adapter's text projection. */
export const TEXT_OUTPUT_SCHEMA = {
  type: "object", required: ["text"], properties: { text: { type: "string" } }
} as const

class IntrospectionError extends Error {}
function refuse(message: string): never { throw new IntrospectionError(message) }

/** Shared by MCP tools and the OpenAPI operation generator. */
export const toSkillId = (name: string): string => {
  const id = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64)
  if (id.length === 0) refuse("Cannot derive a listing id; use a name containing ASCII letters or digits")
  return id.length === 1 ? `${id}-tool` : id
}

const validateSource = (src: McpSource): void => {
  if ((src.url === undefined) === (src.command === undefined)) {
    refuse("MCP source needs exactly one HTTPS URL or stdio command")
  }
  if (src.command !== undefined && (!Array.isArray(src.command) ||
    src.command.some((arg) => typeof arg !== "string") || !src.command[0]?.trim())) {
    refuse("MCP stdio source needs a non-empty command after --")
  }
  if (src.url !== undefined) {
    try {
      const url = new URL(src.url)
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error()
    } catch { refuse("MCP source needs a valid HTTPS URL without inline credentials") }
  }
}

const sourceFields = (src: McpSource): McpSource =>
  src.url === undefined ? { command: [...src.command!] } : { url: src.url }

export const parseMcpTarget = (target: string, rest: ReadonlyArray<string>): McpSource => {
  if (!target.startsWith("mcp://")) refuse("MCP target must start with mcp://")
  const after = target.slice("mcp://".length)
  if (!after) {
    const src: McpSource = { command: [...rest] }
    validateSource(src)
    return src
  }
  // Do not let URL's permissive parser repair a missing authority or nested scheme.
  if (rest.length > 0 || /^[\/\\\s]/.test(after) || after.includes("://") || /[\s\\]/.test(after)) {
    refuse("MCP target needs one URL or a bare mcp:// followed by -- and server argv")
  }
  const src: McpSource = { url: `https://${after}` }
  validateSource(src)
  return src
}

/** Discovery uses one 30-second budget, at most 20 pages and 1,000 tools. */
export const listMcpTools = async (src: McpSource): Promise<ReadonlyArray<McpTool>> => {
  validateSource(src)
  let client: Client | undefined
  let transport: Transport | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = Date.now() + 30_000
  const remaining = () => {
    const timeout = deadline - Date.now()
    if (timeout <= 0) refuse("MCP discovery exceeded its time limit")
    return timeout
  }
  const discover = async (): Promise<ReadonlyArray<McpTool>> => {
    transport = transportFor({ adapter: "mcp", ...sourceFields(src) }, process.cwd())
    client = new Client({ name: "arcade-publish", version: "0.1.0" }, { capabilities: {} })
    await client.connect(transport, { timeout: remaining() })
    const tools: McpTool[] = []
    const cursors = new Set<string>()
    const ids = new Set<string>()
    let cursor: string | undefined
    for (let page = 0; page < 20; page++) {
      const parsed = ListToolsResultSchema.safeParse(await client.listTools(
        cursor === undefined ? undefined : { cursor }, { timeout: remaining() }
      ))
      if (!parsed.success) refuse("MCP server returned invalid tool metadata")
      for (const tool of parsed.data.tools) {
        const id = toSkillId(tool.name)
        if (ids.has(id)) refuse("MCP tools produce duplicate listing ids; choose distinct tool names")
        ids.add(id)
        // Wire metadata is JSON. Normalize SDK optional-undefined properties to the
        // exact-optional public interface while retaining all server annotations.
        tools.push(JSON.parse(JSON.stringify(tool)) as McpTool)
        if (tools.length > 1_000) refuse("MCP discovery exceeded its tool limit")
      }
      if (parsed.data.nextCursor === undefined) return tools
      cursor = parsed.data.nextCursor
      if (cursor === "" || cursors.has(cursor)) refuse("MCP discovery returned invalid pagination")
      cursors.add(cursor)
    }
    refuse("MCP discovery exceeded its page limit")
  }
  try {
    // Client.connect starts the transport before the SDK request timeout begins.
    // A separate wall-clock race also bounds that startup path.
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new IntrospectionError("MCP discovery exceeded its time limit")), remaining())
    })
    return await Promise.race([discover(), timedOut])
  } catch (error) {
    if (error instanceof IntrospectionError) throw error
    refuse("MCP discovery failed; verify the server configuration and try again")
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    // SDK connect may fail before taking ownership of a started transport.
    await client?.close().catch(() => {})
    await transport?.close().catch(() => {})
  }
}

/** Third-party writes remain an explicit seller choice, never the default. */
export const publishableTools = (tools: ReadonlyArray<McpTool>, includeWrites: boolean): ReadonlyArray<McpTool> =>
  includeWrites ? tools : tools.filter((tool) => tool.annotations?.readOnlyHint === true)

const serviceNameFor = (tool: McpTool): string => {
  const candidate = tool.title ?? tool.annotations?.title ?? tool.name
  return candidate.trim() && candidate.length <= SERVICE_NAME_MAX && !/[^\x20-\x7e]/.test(candidate)
    ? candidate : toSkillId(tool.name).slice(0, SERVICE_NAME_MAX)
}

const validateManifest = (manifest: Record<string, unknown>): void => {
  try { Schema.decodeUnknownSync(SkillManifest)(manifest) }
  catch { refuse("Generated manifest is invalid; check its id, price, timeout, and engine configuration") }
}

export const manifestFromMcpTool = (
  src: McpSource,
  tool: McpTool,
  opts: { readonly price: string; readonly timeoutSec?: number }
): Record<string, unknown> => {
  validateSource(src)
  const parsed = ToolSchema.safeParse(tool)
  if (!parsed.success) refuse("MCP tool metadata must declare valid object input and output schemas")
  if (parsed.data.execution?.taskSupport === "required") refuse("MCP task-required tools are not supported by the ordinary tool-call adapter")
  const manifest: Record<string, unknown> = {
    id: toSkillId(tool.name), version: "0.1.0", serviceName: serviceNameFor(tool),
    description: (tool.description ?? tool.name).slice(0, 500), tags: ["mcp"], price: opts.price,
    bounds: { timeoutSec: opts.timeoutSec ?? 60 },
    // Preserve the supplied schemas rather than trying to reconstruct their constraints.
    inputSchema: tool.inputSchema, outputSchema: tool.outputSchema ?? TEXT_OUTPUT_SCHEMA,
    egress: src.url === undefined ? [] : [new URL(src.url).hostname],
    engine: { adapter: "mcp", credential: "none", ...sourceFields(src), tool: tool.name }
  }
  validateManifest(manifest)
  return manifest
}

const inspect = async (path: string) => {
  try { return await lstat(path) }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

/** Refuse ancestor links too; only exact, verified macOS system aliases are trusted. */
const outputRoot = async (outDir: string): Promise<string> => {
  if (!outDir.trim()) refuse("Generated skills need an output directory")
  const requested = resolve(outDir)
  let componentPath = parse(requested).root
  for (const component of requested.slice(componentPath.length).split(sep).filter(Boolean)) {
    componentPath = join(componentPath, component)
    const componentInfo = await inspect(componentPath)
    if (componentInfo === undefined) break
    if (componentInfo.isSymbolicLink()) {
      const canonical = await realpath(componentPath)
      const systemAlias = process.platform === "darwin" && (
        (componentPath === "/var" && canonical === "/private/var") ||
        (componentPath === "/tmp" && canonical === "/private/tmp")
      )
      if (!systemAlias) refuse("Generated output cannot traverse symlink ancestors; use a canonical directory path")
    } else if (!componentInfo.isDirectory()) {
      refuse("Generated output and its ancestors must be directories, not files")
    }
  }
  const missing: string[] = []
  let parent = requested
  let info = await inspect(parent)
  while (info === undefined) {
    missing.unshift(basename(parent))
    parent = dirname(parent)
    info = await inspect(parent)
  }
  const canonical = await realpath(parent)
  const parentInfo = await lstat(canonical)
  if (!parentInfo.isDirectory()) refuse("Generated output parent must be a directory")
  return join(canonical, ...missing)
}

const checkDirectory = async (path: string): Promise<void> => {
  const info = await inspect(path)
  if (info !== undefined && (info.isSymbolicLink() || !info.isDirectory())) {
    refuse("Generated listing destination must be a directory, not a file or symlink")
  }
}

const checkFile = async (path: string, force: boolean): Promise<void> => {
  const info = await inspect(path)
  if (info === undefined) return
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
    (process.getuid !== undefined && info.uid !== process.getuid())) {
    refuse("Generated file destination must be an owned regular file, not a link or directory")
  }
  if (!force) refuse("A generated target already exists; pass --force to overwrite it")
}

/** Per-file staging protects an existing seller-edited file if serialization or writing fails. */
const writeStaged = async (path: string, content: string, force: boolean): Promise<void> => {
  const staged = join(dirname(path), `.arcade-generated-${randomUUID()}`)
  const file = await open(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    try { await file.writeFile(content, "utf8") } finally { await file.close() }
    await checkDirectory(dirname(path))
    await checkFile(path, force)
    if (force) await rename(staged, path)
    else await link(staged, path) // Exclusive creation: a concurrent new target is never overwritten.
  } finally { await unlink(staged).catch(() => {}) }
}

/** Preflight the entire batch before creating directories or replacing any seller files. */
export const writeGeneratedSkills = async (
  outDir: string,
  manifests: ReadonlyArray<Record<string, unknown>>,
  extraFiles: ReadonlyArray<{ readonly id: string; readonly name: string; readonly content: string }> = [],
  force = false
): Promise<ReadonlyArray<string>> => {
  try {
    const ids = new Set<string>()
    const entries: Array<{ id: string; name: string; content: string }> = []
    for (const manifest of manifests) {
      validateManifest(manifest)
      const id = manifest.id as string
      if (ids.has(id)) refuse("Generated manifests have duplicate listing ids")
      ids.add(id)
      entries.push({ id, name: "arcade.json", content: `${JSON.stringify(manifest, null, 2)}\n` })
    }
    const targets = new Set(entries.map(({ id, name }) => `${id}/${name}`))
    for (const extra of extraFiles) {
      if (!ids.has(extra.id) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(extra.name) ||
        typeof extra.content !== "string") refuse("Generated extra files need a known listing id and a safe basename")
      const target = `${extra.id}/${extra.name.toLowerCase()}`
      if (targets.has(target)) refuse("Generated extra files collide with another output target")
      targets.add(target)
      entries.push(extra)
    }
    const root = await outputRoot(outDir)
    for (const id of ids) await checkDirectory(join(root, id))
    for (const entry of entries) await checkFile(join(root, entry.id, entry.name), force)
    const written: string[] = []
    for (const id of ids) {
      const dir = join(root, id)
      await mkdir(dir, { recursive: true, mode: 0o700 })
      for (const entry of entries.filter((value) => value.id === id)) {
        const path = join(dir, entry.name)
        await writeStaged(path, entry.content, force)
        written.push(path)
      }
    }
    return written
  } catch (error) {
    if (error instanceof IntrospectionError) throw error
    refuse("Could not write generated skills; check the output configuration and directory permissions")
  }
}
