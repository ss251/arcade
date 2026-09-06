import { constants } from "node:fs"
import { lstat, open, opendir, realpath } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseSkillMd } from "./skill-md.js"

export const PLUGIN_LIMITS = {
  jsonBytes: 256 * 1024, skillBytes: 512 * 1024, bundleBytes: 8 * 1024 * 1024,
  children: 128, servers: 64
} as const

export type PluginFormat = "agent-plugins-1.0.0" | "codex-compat"
export interface PluginIssue {
  readonly component: "manifest" | "extension" | "skills" | "skill" | "mcp" | "server"
  /** Fixed diagnostics; never echo paths, commands, headers or arbitrary JSON values. */
  readonly reason: string
  readonly index?: number
}
export interface PluginSkill {
  readonly folder: string
  readonly name: string
  readonly description: string
  /** Local-only seller material. Never spread this descriptor into a public listing. */
  readonly directory: string
  readonly entryPath: string
  readonly text: string
}
export interface PluginServer {
  readonly name: string
  readonly url: string
}
export interface PluginBundle {
  readonly format: PluginFormat
  readonly name: string
  readonly root: string
  readonly skills: ReadonlyArray<PluginSkill>
  readonly servers: ReadonlyArray<PluginServer>
  readonly issues: ReadonlyArray<PluginIssue>
}

const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/"
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const own = (o: Record<string, unknown>, key: string): boolean => Object.hasOwn(o, key)
const missing = (e: unknown): boolean => object(e) && e["code"] === "ENOENT"
const invalid = (): never => { throw new Error("Invalid plugin component") }
const identifier = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/.test(v) &&
  !v.includes("..") && !v.includes("--")

/** Reject links, including in-root links, and noncanonical/escaping relative paths. */
const partsOf = (path: string): string[] => {
  const stripped = path.startsWith("./") ? path.slice(2) : path
  const trimmed = stripped.endsWith("/") ? stripped.slice(0, -1) : stripped
  const parts = trimmed.split("/")
  if (!trimmed || isAbsolute(path) || path.includes("\\") || path.includes("\0") ||
    parts.some(p => !p || p === "." || p === "..")) return invalid()
  return parts
}
const checkedPath = async (root: string, path: string, kind: "file" | "directory") => {
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await realpath(root) !== root) return invalid()
  const parts = partsOf(path)
  let current = root
  let stat = rootStat
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    stat = await lstat(current)
    if (stat.isSymbolicLink() || await realpath(current) !== current) return invalid()
    if (index < parts.length - 1 && !stat.isDirectory()) return invalid()
  }
  if (kind === "directory" ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) return invalid()
  const rel = relative(root, current)
  if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) return invalid()
  return { path: current, stat }
}
const present = async (root: string, path: string): Promise<boolean> => {
  const parts = partsOf(path)
  let current = root
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    try {
      const stat = await lstat(current)
      if (index < parts.length - 1 && (!stat.isDirectory() || stat.isSymbolicLink())) return invalid()
    } catch (e) { if (missing(e)) return false; throw e }
  }
  return true
}

/** A file growing during a read cannot allocate beyond the limit. O_NONBLOCK
 * also prevents a concurrently substituted FIFO from blocking the process. */
const readText = async (root: string, path: string, max: number): Promise<string> => {
  const before = await checkedPath(root, path, "file")
  if (before.stat.size > max) return invalid()
  const handle = await open(before.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== before.stat.dev ||
      stat.ino !== before.stat.ino || stat.size > max) return invalid()
    const buffer = Buffer.alloc(max + 1)
    let size = 0
    while (size <= max) {
      const { bytesRead } = await handle.read(buffer, size, max + 1 - size, null)
      if (bytesRead === 0) break
      size += bytesRead
    }
    if (size > max) return invalid()
    const after = await checkedPath(root, path, "file")
    if (after.stat.dev !== stat.dev || after.stat.ino !== stat.ino ||
      after.stat.size !== stat.size || after.stat.mtimeMs !== stat.mtimeMs) return invalid()
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size))
  } finally { await handle.close() }
}
const readJson = async (root: string, path: string): Promise<Record<string, unknown>> => {
  const value: unknown = JSON.parse(await readText(root, path, PLUGIN_LIMITS.jsonBytes))
  return object(value) ? value : invalid()
}
const childNames = async (root: string, path: string): Promise<string[]> => {
  const before = await checkedPath(root, path, "directory")
  const result: string[] = []
  const dir = await opendir(before.path)
  for await (const entry of dir) {
    result.push(entry.name)
    if (result.length > PLUGIN_LIMITS.children) return invalid()
  }
  const after = await checkedPath(root, path, "directory")
  if (before.stat.dev !== after.stat.dev || before.stat.ino !== after.stat.ino) return invalid()
  return result.sort()
}

const metadataKeys = ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"]
const validateMetadata = (manifest: Record<string, unknown>): void => {
  if (!identifier(manifest["name"])) return invalid()
  for (const key of ["version", "description", "homepage", "repository", "license"]) {
    if (own(manifest, key) && typeof manifest[key] !== "string") return invalid()
  }
  if (own(manifest, "keywords") && (!Array.isArray(manifest["keywords"]) ||
    !manifest["keywords"].every(v => typeof v === "string"))) return invalid()
  if (own(manifest, "author")) {
    const author = manifest["author"]
    if (!object(author) || Object.entries(author).some(([k, v]) =>
      !["name", "email", "url"].includes(k) || typeof v !== "string")) return invalid()
  }
}
const reportManifest = (manifest: Record<string, unknown>, format: PluginFormat, issues: PluginIssue[]): void => {
  const known = new Set([...metadataKeys, ...(format === "agent-plugins-1.0.0"
    ? ["$schema", "extensions"] : ["skills", "mcpServers", "interface", "hooks", "apps", "$schema"])])
  if (Object.keys(manifest).some(k => !known.has(k))) issues.push({ component: "manifest", reason: "unknown-fields" })
  if (format === "agent-plugins-1.0.0" && own(manifest, "extensions")) {
    if (!object(manifest["extensions"])) issues.push({ component: "extension", reason: "invalid-extensions" })
    else if (Object.keys(manifest["extensions"]).length)
      issues.push({ component: "extension", reason: "unsupported-extensions" })
  }
  if (format === "codex-compat" && ["hooks", "apps"].some(k => own(manifest, k)))
    issues.push({ component: "manifest", reason: "unsupported-connectors" })
}

const serverOf = (name: string, value: unknown, format: PluginFormat):
  { server: PluginServer } | { reason: string } => {
  if (!object(value) || !name.trim() || name.length > 128) return { reason: "invalid-server" }
  const type = value["type"] ?? (format === "codex-compat" && own(value, "url") ? "streamable-http" : undefined)
  if (type === "stdio" || own(value, "command")) return { reason: "unsupported-stdio" }
  if (type === "sse") return { reason: "unsupported-sse" }
  if (type !== "streamable-http" && !(format === "codex-compat" && type === "http"))
    return { reason: "unsupported-transport" }
  // Literal headers are valid portable metadata, but the current adapter cannot
  // express them safely as credential bindings. Do not infer one from a string.
  if (["headers", "auth", "oauth", "env"].some(k => own(value, k))) return { reason: "unsupported-auth-or-env" }
  if (Object.keys(value).some(k => !["type", "url"].includes(k))) return { reason: "unsupported-server-fields" }
  if (typeof value["url"] !== "string" || value["url"].includes("${") ||
    /[\u0000-\u0020\u007f\\]/.test(value["url"])) return { reason: "invalid-server-url" }
  try {
    const url = new URL(value["url"])
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash ||
      value["url"].includes("?") || value["url"].includes("#")) return { reason: "unsupported-server-url" }
    return { server: { name, url: url.href } }
  } catch { return { reason: "invalid-server-url" } }
}

/** Inert local inspection. No schema fetching, SDK loading, server connection,
 * subprocess, environment expansion, tool execution or generated-file writes. */
export const loadPluginBundle = async (directory: string): Promise<PluginBundle | null> => {
  let root: string
  try {
    const supplied = resolve(directory)
    const stat = await lstat(supplied)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return invalid()
    root = await realpath(supplied)
  } catch { throw new Error("Plugin root is invalid; use a readable directory without symlinks.") }

  let format: PluginFormat
  let manifest: Record<string, unknown>
  const issues: PluginIssue[] = []
  let skillPaths = ["skills"]
  let mcpPaths: string[] = []
  let inlineServers: Record<string, unknown> | undefined
  try {
    if (await present(root, "plugin.json")) {
      format = "agent-plugins-1.0.0"
      manifest = await readJson(root, "plugin.json")
      if (manifest["$schema"] !== SCHEMA + "plugin.schema.json") return invalid()
      mcpPaths = ["mcp.json"]
    } else {
      if (!await present(root, ".codex-plugin")) return null
      await checkedPath(root, ".codex-plugin", "directory")
      if (!await present(root, ".codex-plugin/plugin.json")) return null
      format = "codex-compat"
      manifest = await readJson(root, ".codex-plugin/plugin.json")
      mcpPaths = [".mcp.json"]
      if (own(manifest, "skills")) {
        if (typeof manifest["skills"] !== "string") return invalid()
        skillPaths.push(partsOf(manifest["skills"]).join("/"))
      }
      if (own(manifest, "mcpServers")) {
        if (typeof manifest["mcpServers"] === "string") mcpPaths.push(partsOf(manifest["mcpServers"]).join("/"))
        else if (object(manifest["mcpServers"])) inlineServers = manifest["mcpServers"]
        else return invalid()
      }
    }
    validateMetadata(manifest)
    reportManifest(manifest, format, issues)
  } catch { throw new Error("Plugin manifest is invalid; check its format, metadata, size and contained regular files.") }

  const skills: PluginSkill[] = []
  let totalBytes = 0
  for (const component of new Set(skillPaths)) {
    try {
      if (!await present(root, component)) continue
      const names = await childNames(root, component)
      for (const [index, folder] of names.entries()) {
        const rel = component + "/" + folder
        try {
          // Immediate child directories only; loose files are not Agent Skills.
          const stat = await lstat(join(root, rel))
          if (stat.isFile()) continue
          await checkedPath(root, rel, "directory")
          const entry = rel + "/SKILL.md"
          if (!await present(root, entry)) continue
          const text = await readText(root, entry, PLUGIN_LIMITS.skillBytes)
          const parsed = parseSkillMd(text)
          const name = parsed.frontmatter["name"]?.trim()
          const description = parsed.frontmatter["description"]?.trim()
          if (!name || !description || !parsed.body) return invalid()
          const bytes = Buffer.byteLength(text)
          if (totalBytes + bytes > PLUGIN_LIMITS.bundleBytes) {
            issues.push({ component: "skill", index, reason: "bundle-size-limit" }); continue
          }
          totalBytes += bytes
          skills.push({ folder, name, description, text, directory: join(root, rel), entryPath: join(root, entry) })
        } catch { issues.push({ component: "skill", index, reason: "invalid-skill" }) }
      }
    } catch { issues.push({ component: "skills", reason: "invalid-component" }) }
  }

  const servers: PluginServer[] = []
  const seen = new Set<string>()
  const collect = (map: Record<string, unknown>): void => {
    const entries = Object.entries(map)
    if (entries.length + seen.size > PLUGIN_LIMITS.servers) return invalid()
    for (const [index, [name, value]] of entries.entries()) {
      if (seen.has(name)) { issues.push({ component: "server", index, reason: "duplicate-server" }); continue }
      seen.add(name)
      const result = serverOf(name, value, format)
      if ("server" in result) servers.push(result.server)
      else issues.push({ component: "server", index, reason: result.reason })
    }
  }
  for (const path of new Set(mcpPaths)) {
    try {
      if (!await present(root, path)) continue
      const doc = await readJson(root, path)
      const allowed = format === "agent-plugins-1.0.0" ? ["$schema", "mcpServers"] : ["mcpServers"]
      if (Object.keys(doc).some(k => !allowed.includes(k)) || !object(doc["mcpServers"]) ||
        (format === "agent-plugins-1.0.0" && doc["$schema"] !== SCHEMA + "mcp.schema.json")) return invalid()
      collect(doc["mcpServers"])
    } catch { issues.push({ component: "mcp", reason: "invalid-component" }) }
  }
  if (inlineServers) {
    try { collect(inlineServers) } catch { issues.push({ component: "mcp", reason: "invalid-component" }) }
  }
  return { format, name: manifest["name"] as string, root, skills, servers, issues }
}
