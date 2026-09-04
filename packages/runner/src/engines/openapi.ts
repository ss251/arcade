import { readFile, realpath, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { isReservedEnvName } from "@arcade/core"
import type { Engine, EngineAuth, HarnessJob, JobEnvelope, SkillAgent } from "./types.js"

type Json = Record<string, unknown>
const METHODS = ["get", "put", "post", "delete", "patch", "head", "options", "trace"] as const
const JSON_MEDIA = "application/json"
const MAX_REF_DEPTH = 20
const MAX_REF_NODES = 10_000
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const ROUTING_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding", "upgrade", "proxy-authorization", "proxy-connection", "keep-alive", "te", "trailer"])

/** Only messages authored here may reach a receipt; fs/fetch/parser errors remain private. */
class OpenapiError extends Error {}
function invalid(message: string): never { throw new OpenapiError(message) }
const record = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)
const own = (value: Json, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined

export interface OperationRef {
  readonly path: string
  readonly method: string
  readonly op: Record<string, unknown>
}

/** Metadata is retained because the publish-time generator consumes these same parameters. */
export interface Parameter extends Json {
  readonly name: string
  readonly in: "path" | "query" | "header"
  readonly required?: boolean
  readonly schema?: unknown
}

const localTarget = (spec: Json, ref: string): unknown => {
  let target: unknown = spec
  for (const segment of ref.slice(2).split("/")) {
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~")
    if (!record(target) && !Array.isArray(target)) invalid("OpenAPI local reference could not be resolved")
    if (!Object.hasOwn(target, key)) invalid("OpenAPI local reference could not be resolved")
    target = (target as Json)[key]
  }
  return target
}

/** Inline local pointers only. Remote references are preserved, never fetched. */
export const resolveRefs = (spec: Json, node: unknown, depth = 0): unknown => {
  let visited = 0
  const walk = (value: unknown, level: number, refs: ReadonlySet<string>): unknown => {
    if (++visited > MAX_REF_NODES || level > MAX_REF_DEPTH) invalid("OpenAPI reference expansion exceeds its depth or size limit")
    if (value === null || typeof value !== "object") return value
    if (Array.isArray(value)) return value.map((item) => walk(item, level + 1, refs))
    const obj = value as Json
    const ref = own(obj, "$ref")
    if (ref !== undefined) {
      if (typeof ref !== "string") invalid("OpenAPI reference must be a string")
      if (!ref.startsWith("#/")) return obj
      if (refs.has(ref)) invalid("OpenAPI cyclic local reference is unsupported")
      if (Object.keys(obj).some((key) => key !== "$ref")) invalid("OpenAPI reference siblings are unsupported")
      return walk(localTarget(spec, ref), level + 1, new Set([...refs, ref]))
    }
    const out: Json = Object.create(null)
    for (const [key, item] of Object.entries(obj)) out[key] = walk(item, level + 1, refs)
    return out
  }
  return walk(node, depth, new Set())
}

// Path-item references need only their own target, not every unrelated operation's schema.
const pathItem = (spec: Json, path: string): Json | undefined => {
  const paths = own(spec, "paths")
  if (paths === undefined) return undefined
  if (!record(paths)) invalid("OpenAPI paths must be an object")
  let item = own(paths, path)
  const seen = new Set<string>()
  while (record(item) && own(item, "$ref") !== undefined) {
    const ref = own(item, "$ref")
    if (typeof ref !== "string" || !ref.startsWith("#/") || seen.has(ref) || seen.size >= MAX_REF_DEPTH) {
      invalid("OpenAPI path reference is unsupported")
    }
    if (Object.keys(item).some((key) => key !== "$ref")) invalid("OpenAPI path reference siblings are unsupported")
    seen.add(ref)
    item = localTarget(spec, ref)
  }
  if (item === undefined) return undefined
  if (!record(item)) invalid("OpenAPI path item must be an object")
  return item
}

export const findOperation = (spec: Json, operationId: string): OperationRef | undefined => {
  const paths = own(spec, "paths")
  if (paths === undefined) return undefined
  if (!record(paths)) invalid("OpenAPI paths must be an object")
  let found: OperationRef | undefined
  for (const path of Object.keys(paths)) {
    const item = pathItem(spec, path)!
    for (const method of METHODS) {
      const op = own(item, method)
      if (op === undefined) continue
      if (!record(op)) invalid("OpenAPI operation must be an object")
      if (own(op, "operationId") === operationId) {
        if (found !== undefined) invalid("OpenAPI operation identifier is ambiguous or duplicated")
        found = { path, method, op }
      }
    }
  }
  return found
}

const hasRef = (node: unknown): boolean => {
  if (Array.isArray(node)) return node.some(hasRef)
  return record(node) && (Object.hasOwn(node, "$ref") || Object.values(node).some(hasRef))
}

/** Path-level parameters are inherited; operation-level entries override by (in, name). */
export const parametersOf = (spec: Json, ref: OperationRef): ReadonlyArray<Parameter> => {
  const merged = new Map<string, Parameter>()
  const shared = pathItem(spec, ref.path)
  for (const raw of [shared === undefined ? undefined : own(shared, "parameters"), own(ref.op, "parameters")]) {
    const parameters = resolveRefs(spec, raw ?? [])
    if (!Array.isArray(parameters)) invalid("OpenAPI parameters must be an array")
    const levelKeys = new Set<string>()
    for (const value of parameters) {
      if (!record(value) || hasRef(value)) invalid("OpenAPI parameter reference or shape is unsupported")
      const name = own(value, "name")
      const location = own(value, "in")
      if (typeof name !== "string" || !name.trim() || !["path", "query", "header"].includes(String(location))) {
        invalid("OpenAPI parameter needs a name and a supported location")
      }
      if (own(value, "required") !== undefined && typeof own(value, "required") !== "boolean") invalid("OpenAPI parameter required flag must be boolean")
      if (own(value, "content") !== undefined) invalid("OpenAPI content-based parameters are unsupported")
      const style = own(value, "style")
      if (style !== undefined && style !== (location === "query" ? "form" : "simple")) invalid("OpenAPI parameter serialization style is unsupported")
      if (own(value, "allowReserved") === true) invalid("OpenAPI reserved parameter serialization is unsupported")
      const key = `${location}:${location === "header" ? name.toLowerCase() : name}`
      if (levelKeys.has(key)) invalid("OpenAPI parameter is duplicated")
      levelKeys.add(key)
      merged.set(key, value as Parameter)
    }
  }
  return [...merged.values()]
}

const scalar = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return String(value)
  return invalid("OpenAPI parameter values must be JSON scalars; arrays and objects are unsupported")
}

const setHeader = (headers: Record<string, string>, name: string, value: string): void => {
  if (!HEADER_TOKEN.test(name) || ROUTING_HEADERS.has(name.toLowerCase()) || /[\r\n\0]/.test(value)) invalid("OpenAPI header is invalid or controls request routing")
  try { new Headers({ [name]: value }) } catch { invalid("OpenAPI header value is invalid") }
  for (const key of Object.keys(headers)) if (key.toLowerCase() === name.toLowerCase()) delete headers[key]
  headers[name] = value
}

const authMatches = (auth: EngineAuth, parameter: Parameter): boolean =>
  auth.in === parameter.in && (auth.in === "header" ? auth.name.toLowerCase() === parameter.name.toLowerCase() : auth.name === parameter.name)

export const buildRequest = (
  spec: Json,
  ref: OperationRef,
  input: Json,
  auth: EngineAuth | undefined,
  env: Record<string, string | undefined>
): { url: string; init: RequestInit } => {
  if (!record(input)) invalid("OpenAPI input must be a JSON object")
  const item = pathItem(spec, ref.path)
  const servers = own(ref.op, "servers") ?? (item === undefined ? undefined : own(item, "servers")) ?? own(spec, "servers")
  if (!Array.isArray(servers) || !record(servers[0]) || typeof own(servers[0], "url") !== "string") invalid("OpenAPI server URL is missing")
  const base = own(servers[0], "url") as string
  let server: URL
  try { server = new URL(base) } catch { return invalid("OpenAPI server must be a valid HTTPS URL") }
  if (server.protocol !== "https:" || server.username || server.password || server.search || server.hash || /[{}]/.test(base)) {
    invalid("OpenAPI server must use HTTPS without userinfo, variables, query or fragment")
  }
  if (!METHODS.includes(ref.method as typeof METHODS[number]) || ref.method === "trace") invalid("OpenAPI HTTP method is unsupported")
  if (!ref.path.startsWith("/") || /[?#\\]/.test(ref.path)) invalid("OpenAPI operation path is unsupported")
  const params = parametersOf(spec, ref)
  const claimed = new Set(params.map((p) => p.name))
  const query = new URLSearchParams()
  const headers: Record<string, string> = Object.create(null)
  let path = ref.path

  let credential: string | undefined
  if (auth !== undefined) {
    if (!["header", "query"].includes(auth.in) || !auth.name?.trim() || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(auth.env) || isReservedEnvName(auth.env)) invalid("OpenAPI credential binding is invalid")
    credential = Object.hasOwn(env, auth.env) ? env[auth.env] : undefined
    if (typeof credential !== "string" || !credential.trim()) invalid("OpenAPI credential is unavailable in the sandbox environment")
    claimed.add(auth.name)
  }

  for (const parameter of params) {
    if (auth !== undefined && authMatches(auth, parameter)) continue
    const value = own(input, parameter.name)
    if (value === undefined) {
      if (parameter.required === true || parameter.in === "path") invalid("OpenAPI input is missing a required parameter")
      continue
    }
    const text = scalar(value)
    if (parameter.in === "path") {
      const placeholder = `{${parameter.name}}`
      if (!path.includes(placeholder) || text === "." || text === "..") invalid("OpenAPI path parameter would change operation routing")
      path = path.split(placeholder).join(encodeURIComponent(text))
    } else if (parameter.in === "query") query.set(parameter.name, text)
    else setHeader(headers, parameter.name, text)
  }
  if (/[{}]/.test(path)) invalid("OpenAPI path contains an unbound parameter")
  if (auth !== undefined && credential !== undefined) {
    if (auth.in === "header") setHeader(headers, auth.name, credential)
    else query.set(auth.name, credential)
  }

  let body: string | undefined
  if (own(ref.op, "requestBody") !== undefined) {
    if (ref.method === "get" || ref.method === "head") invalid("OpenAPI GET/HEAD request bodies are unsupported")
    const requestBody = resolveRefs(spec, own(ref.op, "requestBody"))
    const content = record(requestBody) ? own(requestBody, "content") : undefined
    const media = record(content) ? own(content, JSON_MEDIA) : undefined
    if (!record(media) || hasRef(media)) invalid("OpenAPI request body must use supported local JSON content")
    const schema = own(media, "schema")
    if (schema !== undefined && (!record(schema) || (own(schema, "type") !== undefined && own(schema, "type") !== "object"))) invalid("OpenAPI JSON request body must be an object")
    const rest: Json = Object.create(null)
    for (const [key, value] of Object.entries(input)) {
      if (!claimed.has(key) && !(auth?.in === "header" && key.toLowerCase() === auth.name.toLowerCase())) rest[key] = value
    }
    body = JSON.stringify(rest)
    if (Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) invalid("OpenAPI JSON content-type cannot be overridden")
    setHeader(headers, "content-type", JSON_MEDIA)
  }

  const pathname = `${server.pathname.replace(/\/$/, "")}${path}`
  const url = new URL(`${server.origin}${pathname}`)
  if (url.pathname !== pathname) invalid("OpenAPI path would be normalized to a different operation")
  url.search = query.toString()
  return {
    url: url.toString(),
    init: { method: ref.method.toUpperCase(), headers, redirect: "error", ...(body === undefined ? {} : { body }) }
  }
}

const within = (root: string, path: string): boolean => {
  const rel = relative(root, path)
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

const abortable = <T>(work: Promise<T>, signal: AbortSignal): Promise<T> => new Promise((resolveWork, reject) => {
  const aborted = () => reject(new OpenapiError("OpenAPI operation timed out"))
  signal.addEventListener("abort", aborted, { once: true })
  if (signal.aborted) aborted()
  work.then(resolveWork, reject).finally(() => signal.removeEventListener("abort", aborted))
})

/** One HTTPS JSON operation. The only upstream diagnostic returned is its numeric status. */
export const runOpenapi = async (
  _agent: SkillAgent,
  job: HarnessJob,
  _prompt: string,
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch
): Promise<JobEnvelope> => {
  let usage = { turns: 0, tokens: 0, toolCalls: 0 }
  const fail = (error: string, stopReason = "error"): JobEnvelope => ({ stopReason, usage, costUsd: 0, error })
  const config = job.engineConfig
  if (config?.adapter !== "openapi" || !config.spec?.trim() || !config.operationId?.trim()) return fail("OpenAPI engine.spec and engine.operationId are required")
  if (!record(job.input)) return fail("OpenAPI input must be a JSON object", "rejected")
  if (!Number.isFinite(job.bounds.timeoutSec) || job.bounds.timeoutSec <= 0) return fail("OpenAPI timeout must be positive")
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), job.bounds.timeoutSec * 1000)
  try {
    let text: string
    try {
      if (isAbsolute(config.spec)) invalid("OpenAPI document must stay inside the skill directory")
      const root = await realpath(job.skillDir)
      const candidate = resolve(root, config.spec)
      if (!within(root, candidate)) invalid("OpenAPI document must stay inside the skill directory")
      const specPath = await realpath(candidate)
      if (!within(root, specPath)) invalid("OpenAPI document must stay inside the skill directory")
      if (!(await stat(specPath)).isFile()) invalid("OpenAPI document must be a regular JSON file")
      text = await readFile(specPath, { encoding: "utf8", signal: abort.signal })
    } catch (error) {
      if (error instanceof OpenapiError) throw error
      if (abort.signal.aborted) return fail("OpenAPI operation timed out", "timeout")
      return fail("OpenAPI document could not be read from the skill directory")
    }
    let document: unknown
    try { document = JSON.parse(text) } catch { return fail("OpenAPI document is not valid JSON") }
    if (!record(document) || typeof own(document, "openapi") !== "string" || !/^3\.[01]\.\d+$/.test(own(document, "openapi") as string)) return fail("OpenAPI document must be a supported version 3 JSON object")
    const ref = findOperation(document, config.operationId)
    if (ref === undefined) return fail("OpenAPI operation is not present in the document")
    const { url, init } = buildRequest(document, ref, job.input, config.auth, process.env)
    if (abort.signal.aborted) return fail("OpenAPI operation timed out", "timeout")
    usage = { turns: 1, tokens: 0, toolCalls: 1 }
    const response = await abortable(fetchImpl(url, { ...init, signal: abort.signal }), abort.signal)
    if (!response.ok || response.redirected) {
      // Some streams never acknowledge cancellation. Abort the fetch in finally without
      // allowing that acknowledgement to hold an already-failed paid call open.
      void response.body?.cancel().catch(() => {})
      return fail(response.redirected ? "OpenAPI upstream redirect was refused" : `the upstream operation returned ${response.status}`)
    }
    let output: unknown
    try { output = await abortable(response.json(), abort.signal) } catch {
      if (abort.signal.aborted) return fail("OpenAPI operation timed out", "timeout")
      return fail("the upstream returned a success status with a body that is not JSON")
    }
    if (output === null || output === undefined) return fail("the upstream returned empty JSON, so there is nothing to settle")
    return { output, stopReason: "end_turn", usage, costUsd: 0 }
  } catch (error) {
    if (abort.signal.aborted) return fail("OpenAPI operation timed out", "timeout")
    return fail(error instanceof OpenapiError ? error.message : "OpenAPI upstream request failed")
  } finally {
    clearTimeout(timer)
    abort.abort()
  }
}

export const openapiEngine: Engine = {
  adapter: "openapi",
  run: (agent, job, prompt) => runOpenapi(agent, job, prompt),
  envGrants: () => [],
  doctor: async () => ({ ok: true, detail: "OpenAPI adapter: publish a local JSON document to select an operation" })
}
