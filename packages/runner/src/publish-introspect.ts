import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { ListToolsResultSchema, ToolSchema } from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { link, lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path"
import { EngineAuth as EngineAuthSchema, SERVICE_NAME_MAX, SkillManifest } from "@arcade/core"
import { Schema } from "effect"
import { transportFor } from "./engines/mcp.ts"
import { findOperation, parametersOf, resolveRefs, type OperationRef } from "./engines/openapi.ts"
import type { EngineAuth } from "./engines/types.ts"

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

// OpenAPI generation deliberately follows the runtime's scalar-parameter / JSON-body lane.
type Json = Record<string, unknown>
const METHODS = ["get", "put", "post", "delete", "patch", "head", "options", "trace"] as const
const record = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)
const own = (value: Json, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const ROUTING_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding", "upgrade",
  "proxy-authorization", "proxy-connection", "keep-alive", "te", "trailer"])
const safeHeader = (name: string): boolean => HEADER_TOKEN.test(name) && !ROUTING_HEADERS.has(name.toLowerCase())

export interface NamedOperation extends OperationRef { readonly operationId: string }

/** Resolve only the path-item pointer, leaving unrelated operation schemas untouched. */
const operationItem = (spec: Json, path: string): Json => {
  const paths = own(spec, "paths")
  if (!record(paths)) refuse("OpenAPI paths must be an object")
  let item = own(paths, path)
  const seen = new Set<string>()
  while (record(item) && own(item, "$ref") !== undefined) {
    const pointer = own(item, "$ref")
    if (typeof pointer !== "string" || !pointer.startsWith("#/") || seen.has(pointer) || seen.size >= 20 ||
      Object.keys(item).some((key) => key !== "$ref")) refuse("OpenAPI path reference is unsupported")
    seen.add(pointer)
    item = spec
    for (const segment of pointer.slice(2).split("/")) {
      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~")
      if ((!record(item) && !Array.isArray(item)) || !Object.hasOwn(item, key)) refuse("OpenAPI path reference cannot be resolved")
      item = (item as Json)[key]
    }
  }
  if (!record(item)) refuse("OpenAPI path item must be an object")
  return item
}

export const operationsOf = (spec: Json): ReadonlyArray<NamedOperation> => {
  if (!record(spec) || typeof own(spec, "openapi") !== "string" || !/^3\.[01]\.\d+$/.test(own(spec, "openapi") as string)) {
    refuse("OpenAPI document must be a supported version 3 JSON object")
  }
  const paths = own(spec, "paths")
  if (paths === undefined) return []
  if (!record(paths)) refuse("OpenAPI paths must be an object")
  const operations: NamedOperation[] = []
  const ids = new Set<string>()
  const listingIds = new Set<string>()
  for (const path of Object.keys(paths)) {
    const item = operationItem(spec, path)
    for (const method of METHODS) {
      const op = own(item, method)
      if (op === undefined) continue
      if (!record(op)) refuse("OpenAPI operation must be an object")
      const operationId = own(op, "operationId")
      if (operationId === undefined || operationId === "") continue
      if (typeof operationId !== "string" || !operationId.trim()) refuse("OpenAPI operation identifier must be a non-empty string")
      if (ids.has(operationId)) refuse("OpenAPI operation identifier is duplicated or ambiguous")
      ids.add(operationId)
      const listingId = toSkillId(operationId)
      if (listingIds.has(listingId)) refuse("OpenAPI operations produce duplicate listing ids")
      listingIds.add(listingId)
      operations.push({ path, method, op, operationId })
    }
  }
  return operations
}

const authUsage = "usage: --auth header:X-Api-Key=UPSTREAM_KEY (or query:apikey=UPSTREAM_KEY). Use an environment variable NAME, never a key value."
const checkedAuth = (value: unknown): EngineAuth => {
  try {
    const auth = Schema.decodeUnknownSync(EngineAuthSchema)(value)
    if (!auth.name.trim() || /[\r\n\0]/.test(auth.name) || (auth.in === "header" && !safeHeader(auth.name))) throw new Error()
    return { in: auth.in, name: auth.name, env: auth.env }
  } catch { refuse(authUsage) }
}

export const parseAuthFlag = (value: string): EngineAuth => {
  const match = /^(header|query):([^=]+)=([^=]+)$/.exec(value.trim())
  if (match === null) refuse(authUsage)
  return checkedAuth({ in: match[1], name: match[2]!.trim(), env: match[3]!.trim() })
}

/** Structural guard, not a full JSON Schema validator; the hub enforces its documented subset. */
const schemaFor = (spec: Json, raw: unknown): Json => {
  const schema = resolveRefs(spec, raw)
  const hasRef = (node: unknown): boolean => Array.isArray(node) ? node.some(hasRef) :
    record(node) && (Object.hasOwn(node, "$ref") || Object.values(node).some(hasRef))
  if (hasRef(schema)) refuse("OpenAPI schema contains an unsupported reference")
  const check = (node: unknown): void => {
    if (!record(node) || own(node, "$ref") !== undefined) refuse("OpenAPI schema must be an object with supported local references")
    if (["oneOf", "anyOf", "allOf", "not", "if", "then", "else", "discriminator", "contains", "prefixItems", "dependentSchemas"].some((key) => own(node, key) !== undefined) ||
      own(node, "nullable") === true) refuse("OpenAPI schema composition or nullable forms are unsupported")
    const type = own(node, "type")
    if (type !== undefined && (typeof type !== "string" || !["object", "array", "string", "number", "integer", "boolean", "null"].includes(type))) {
      refuse("OpenAPI schema type is unsupported")
    }
    const properties = own(node, "properties")
    if (properties !== undefined) {
      if (!record(properties)) refuse("OpenAPI schema properties must be an object")
      for (const property of Object.values(properties)) check(property)
    }
    const required = own(node, "required")
    if (required !== undefined && (!Array.isArray(required) || required.some((key) => typeof key !== "string"))) {
      refuse("OpenAPI schema required keys must be strings")
    }
    const items = own(node, "items")
    if (items !== undefined) check(items)
    const additional = own(node, "additionalProperties")
    if (additional !== undefined && typeof additional !== "boolean") check(additional)
    const values = own(node, "enum")
    if (values !== undefined && (!Array.isArray(values) || values.length === 0 || values.some((value) => value !== null && typeof value === "object"))) {
      refuse("OpenAPI schema enum must contain supported scalar values")
    }
  }
  check(schema)
  return schema as Json
}

export const inputSchemaFor = (spec: Json, ref: OperationRef, auth?: EngineAuth): Json => {
  const binding = auth === undefined ? undefined : checkedAuth(auth)
  const properties: Json = Object.create(null)
  const required = new Set<string>()
  const parameters = parametersOf(spec, ref)
  const claimed = new Set(parameters.map((parameter) => parameter.name))
  if (binding !== undefined) claimed.add(binding.name)
  for (const parameter of parameters) {
    if (binding !== undefined && binding.in === parameter.in &&
      (binding.in === "header" ? binding.name.toLowerCase() === parameter.name.toLowerCase() : binding.name === parameter.name)) continue
    if (Object.hasOwn(properties, parameter.name)) refuse("OpenAPI parameter names collide in the flat buyer input")
    if (parameter.in === "header" && !safeHeader(parameter.name)) refuse("OpenAPI parameter header controls routing or is invalid")
    const schema = schemaFor(spec, parameter.schema === undefined ? { type: "string" } : parameter.schema)
    if (!["string", "number", "integer", "boolean"].includes(String(own(schema, "type"))) ||
      (Array.isArray(own(schema, "enum")) && (own(schema, "enum") as unknown[]).includes(null))) refuse("OpenAPI parameter schema must describe JSON scalars")
    properties[parameter.name] = { ...schema,
      ...(typeof own(parameter, "description") === "string" ? { description: own(parameter, "description") } : {}) }
    if (parameter.required === true || parameter.in === "path") required.add(parameter.name)
  }
  if (own(ref.op, "requestBody") !== undefined) {
    if (ref.method === "get" || ref.method === "head") refuse("OpenAPI GET/HEAD request bodies are unsupported")
    const body = resolveRefs(spec, own(ref.op, "requestBody"))
    const content = record(body) ? own(body, "content") : undefined
    const media = record(content) ? own(content, "application/json") : undefined
    if (!record(media) || own(media, "$ref") !== undefined || own(media, "encoding") !== undefined) refuse("OpenAPI request body requires supported JSON content")
    const rawSchema = own(media, "schema")
    const schema = schemaFor(spec, rawSchema === undefined ? { type: "object" } : rawSchema)
    if (own(schema, "type") !== "object" && !(own(schema, "type") === undefined && record(own(schema, "properties")))) {
      refuse("OpenAPI request body schema must describe an object")
    }
    const bodyProperties = (own(schema, "properties") ?? {}) as Json
    for (const [key, value] of Object.entries(bodyProperties)) {
      if (claimed.has(key) || (binding?.in === "header" && key.toLowerCase() === binding.name.toLowerCase())) {
        refuse("OpenAPI body field collides with a parameter or credential")
      }
      properties[key] = value
    }
    for (const key of (own(schema, "required") ?? []) as string[]) {
      if (!Object.hasOwn(bodyProperties, key)) refuse("OpenAPI required body field needs a declared schema property")
      required.add(key)
    }
  }
  return { type: "object", ...(required.size === 0 ? {} : { required: [...required] }), properties }
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  return JSON.stringify(value)
}

export const outputSchemaFor = (spec: Json, ref: OperationRef): Json => {
  if (ref.method === "head" || ref.method === "trace") refuse("OpenAPI HEAD/TRACE cannot provide a supported JSON success result")
  const responses = own(ref.op, "responses")
  if (!record(responses)) refuse("OpenAPI operation needs a declared JSON success response")
  let selected: Json | undefined
  for (const [code, value] of Object.entries(responses)) {
    if (!/^2(?:\d{2}|XX)$/.test(code) || code === "204" || code === "205") continue
    const response = resolveRefs(spec, value)
    const content = record(response) ? own(response, "content") : undefined
    const media = record(content) ? own(content, "application/json") : undefined
    if (!record(media) || own(media, "$ref") !== undefined) refuse("OpenAPI success response must declare supported JSON content")
    const rawSchema = own(media, "schema")
    const schema = schemaFor(spec, rawSchema === undefined ? { type: "object" } : rawSchema)
    const values = own(schema, "enum")
    if (own(schema, "type") === "null" || (Array.isArray(values) && values.every((value) => value === null))) {
      refuse("OpenAPI success schema cannot require an empty JSON result")
    }
    if (selected !== undefined && canonical(selected) !== canonical(schema)) refuse("OpenAPI success response schemas are incompatible")
    selected = schema
  }
  if (selected === undefined) refuse("OpenAPI operation needs a declared JSON success response")
  return selected
}

const serverFor = (spec: Json, ref: OperationRef): URL => {
  const item = operationItem(spec, ref.path)
  const servers = own(ref.op, "servers") ?? own(item, "servers") ?? own(spec, "servers")
  if (!Array.isArray(servers) || !record(servers[0]) || typeof own(servers[0], "url") !== "string") refuse("OpenAPI server URL is missing")
  const base = own(servers[0], "url") as string
  try {
    const url = new URL(base)
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash || /[{}]/.test(base)) throw new Error()
    return url
  } catch { refuse("OpenAPI server must use valid HTTPS without userinfo, variables, query or fragment") }
}

export const manifestFromOperation = (
  spec: Json,
  ref: NamedOperation,
  opts: { readonly specFile: string; readonly price: string; readonly auth?: EngineAuth; readonly timeoutSec?: number }
): Record<string, unknown> => {
  if (typeof opts.specFile !== "string" || !opts.specFile.trim() || isAbsolute(opts.specFile) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(opts.specFile) || /[\0\\]/.test(opts.specFile)) {
    refuse("OpenAPI spec file must be a relative path inside the listing directory")
  }
  const specPath = relative(process.cwd(), resolve(opts.specFile))
  if (!specPath || specPath === ".." || specPath.startsWith(`..${sep}`) || isAbsolute(specPath)) {
    refuse("OpenAPI spec file must stay inside the listing directory")
  }
  // Validate all identifiers before selection, and use document metadata rather than an opaque supplied op.
  operationsOf(spec)
  const operation = findOperation(spec, ref.operationId)
  if (operation === undefined || operation.path !== ref.path || operation.method !== ref.method) refuse("OpenAPI operation is not present at the selected path and method")
  const auth = opts.auth === undefined ? undefined : checkedAuth(opts.auth)
  const server = serverFor(spec, operation)
  if (!operation.path.startsWith("/") || /[?#\\]/.test(operation.path)) refuse("OpenAPI operation path is unsupported")
  const pathParameters = parametersOf(spec, operation).filter((parameter) => parameter.in === "path")
  let path = operation.path
  for (const parameter of pathParameters) {
    const placeholder = `{${parameter.name}}`
    if (!path.includes(placeholder)) refuse("OpenAPI path parameter has no matching placeholder")
    path = path.split(placeholder).join("value")
  }
  const pathname = `${server.pathname.replace(/\/$/, "")}${path}`
  if (/[{}]/.test(path) || new URL(`${server.origin}${pathname}`).pathname !== pathname) refuse("OpenAPI path would change operation routing")
  const summary = own(operation.op, "summary")
  const description = own(operation.op, "description")
  const manifest: Json = {
    id: toSkillId(ref.operationId), version: "0.1.0",
    serviceName: serviceNameFor({ name: ref.operationId, inputSchema: {}, ...(typeof summary === "string" ? { title: summary } : {}) }),
    description: (typeof description === "string" ? description : typeof summary === "string" && summary.trim() ? summary : ref.operationId).slice(0, 500),
    tags: ["openapi"], price: opts.price, bounds: { timeoutSec: opts.timeoutSec ?? 60 },
    inputSchema: inputSchemaFor(spec, operation, auth), outputSchema: outputSchemaFor(spec, operation),
    engine: { adapter: "openapi", credential: "none", spec: opts.specFile, operationId: ref.operationId,
      ...(auth === undefined ? {} : { auth }) },
    ...(auth === undefined ? {} : { secrets: [auth.env] }), egress: [server.hostname]
  }
  if (own(operation.op, "requestBody") !== undefined && (auth?.in === "header" && auth.name.toLowerCase() === "content-type" ||
    parametersOf(spec, operation).some((parameter) => parameter.in === "header" && parameter.name.toLowerCase() === "content-type"))) {
    refuse("OpenAPI JSON body content-type cannot be overridden")
  }
  validateManifest(manifest)
  return manifest
}
