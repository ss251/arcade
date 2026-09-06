import { constants } from "node:fs"
import { lstat, mkdir, open, realpath } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path"
import { Schema } from "effect"
import { assertManifestPublishable, parsePrice, SkillManifest } from "@arcade/core"
import { pluginDirectoryNames, pluginPathInfo, readPluginFileBytes,
  type PluginBundle, type PluginSkill } from "./plugin-load.js"

export const PLUGIN_COPY_LIMITS = {
  fileBytes: 2 * 1024 * 1024, treeBytes: 16 * 1024 * 1024, batchBytes: 32 * 1024 * 1024,
  manifestBytes: 256 * 1024, nodes: 512, batchNodes: 4096, depth: 8, listings: 256
} as const
export interface PluginFile {
  readonly name: string
  readonly content: Uint8Array
}
export interface PluginListingFiles {
  readonly manifest: Record<string, unknown>
  readonly files: ReadonlyArray<PluginFile>
}
class PluginFileError extends Error {}
const refuse = (message: string): never => { throw new PluginFileError(message) }
const inside = (parent: string, child: string): boolean => child === parent || child.startsWith(parent + sep)
const safeName = (name: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(name) && !name.endsWith(".")
const safeFilePath = (name: string): string[] => {
  const parts = name.split("/")
  if (!parts.every(safeName) || parts.length > PLUGIN_COPY_LIMITS.depth + 1 ||
    parts[0]!.toLowerCase() === "arcade.json")
    return refuse("Plugin files need contained portable paths and cannot replace arcade.json")
  return parts
}

/** Reject case-insensitive aliases and file/directory prefix collisions even on
 * case-sensitive hosts, so the same batch is safe on macOS and Linux. */
const pathInventory = (files: ReadonlyArray<PluginFile>): string[] => {
  const paths = new Map<string, { name: string; directory: boolean }>()
  for (const file of files) {
    const parts = safeFilePath(file.name)
    for (let i = 1; i <= parts.length; i++) {
      const name = parts.slice(0, i).join("/"), key = name.toLowerCase(), directory = i < parts.length
      const previous = paths.get(key)
      if (previous && (previous.name !== name || !previous.directory || !directory))
        return refuse("Plugin files have colliding paths")
      paths.set(key, { name, directory })
    }
  }
  return [...paths.values()].filter(v => v.directory).map(v => v.name)
    .sort((a, b) => a.split("/").length - b.split("/").length || (a < b ? -1 : a > b ? 1 : 0))
}

/** Snapshot regular files, including nested references and binary assets. A
 * refused hidden/nonportable/link entry invalidates the skill, never vanishes
 * silently from a supposedly self-contained copy. No execution or env access. */
export const collectPluginSkillFiles = async (
  bundle: PluginBundle, skill: PluginSkill
): Promise<ReadonlyArray<PluginFile>> => {
  try {
    const base = relative(bundle.root, skill.directory).split(sep).join("/")
    if (!inside(bundle.root, skill.directory) || skill.directory === bundle.root ||
      skill.entryPath !== join(skill.directory, "SKILL.md")) throw new Error()
    await pluginPathInfo(bundle.root, base, "directory")
    const files: PluginFile[] = []
    let bytes = 0, nodes = 0
    const walk = async (rel: string, depth: number): Promise<void> => {
      if (depth > PLUGIN_COPY_LIMITS.depth) throw new Error()
      const path = rel ? base + "/" + rel : base
      for (const name of await pluginDirectoryNames(bundle.root, path)) {
        if (++nodes > PLUGIN_COPY_LIMITS.nodes || !safeName(name)) throw new Error()
        const fileName = rel ? rel + "/" + name : name
        safeFilePath(fileName)
        const full = base + "/" + fileName
        const info = await lstat(join(bundle.root, full))
        if (info.isDirectory() && !info.isSymbolicLink()) await walk(fileName, depth + 1)
        else {
          if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
            info.size > PLUGIN_COPY_LIMITS.fileBytes || bytes + info.size > PLUGIN_COPY_LIMITS.treeBytes) throw new Error()
          const content = await readPluginFileBytes(bundle.root, full, PLUGIN_COPY_LIMITS.fileBytes)
          bytes += content.byteLength
          if (bytes > PLUGIN_COPY_LIMITS.treeBytes) throw new Error()
          files.push({ name: fileName, content })
        }
      }
    }
    await walk("", 0)
    pathInventory(files)
    const entry = files.find(f => f.name === "SKILL.md")
    if (!entry || new TextDecoder("utf-8", { fatal: true }).decode(entry.content) !== skill.text) throw new Error()
    return files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  } catch { throw new PluginFileError("Plugin source files are unsafe, changed or exceed copy limits; review that skill locally.") }
}

const inspect = async (path: string) => {
  try { return await lstat(path) } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT") return undefined
    throw e
  }
}
/** No arbitrary ancestor aliases. Only the two verified macOS system aliases
 * supported by the existing generator are allowed. No directories are created. */
const outputRoot = async (out: string): Promise<string> => {
  if (!out.trim()) return refuse("Plugin output needs a directory")
  const requested = resolve(out)
  let current = parse(requested).root
  for (const part of requested.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    const stat = await inspect(current)
    if (!stat) break
    if (stat.isSymbolicLink()) {
      const canonical = await realpath(current)
      if (!(process.platform === "darwin" && ((current === "/tmp" && canonical === "/private/tmp") ||
        (current === "/var" && canonical === "/private/var"))))
        return refuse("Plugin output cannot traverse symlink ancestors")
    } else if (!stat.isDirectory()) return refuse("Plugin output and its ancestors must be directories")
  }
  const suffix: string[] = []
  let existing = requested
  while (!await inspect(existing)) { suffix.unshift(basename(existing)); existing = dirname(existing) }
  const canonical = await realpath(existing)
  if (!(await lstat(canonical)).isDirectory()) return refuse("Plugin output needs a directory")
  return join(canonical, ...suffix)
}

/** Full preflight, then exclusive creation. No --force mode: every listing
 * directory must be new, including for MCP entries. Validation errors write
 * nothing; later I/O races/failures may leave partial new output, never trigger
 * a retry, and never cause existing seller files to be overwritten or deleted. */
export const writePluginListings = async (
  outDir: string, listings: ReadonlyArray<PluginListingFiles>, sourceRoot: string
): Promise<ReadonlyArray<string>> => {
  try {
    if (listings.length === 0 || listings.length > PLUGIN_COPY_LIMITS.listings)
      return refuse("Plugin batch size is invalid")
    const ids = new Set<string>()
    let total = 0, totalNodes = 0
    const planned: Array<{ id: string; files: PluginFile[]; directories: string[] }> = []
    for (const listing of listings) {
      const decoded = Schema.decodeUnknownSync(SkillManifest)(listing.manifest)
      assertManifestPublishable(decoded)
      parsePrice(decoded.price)
      if (ids.has(decoded.id)) return refuse("Plugin listings have colliding ids")
      ids.add(decoded.id)
      if (listing.files.length > PLUGIN_COPY_LIMITS.nodes) return refuse("Plugin file count exceeds copy limits")
      const manifestContent = new TextEncoder().encode(JSON.stringify(listing.manifest, null, 2) + "\n")
      if (manifestContent.byteLength > PLUGIN_COPY_LIMITS.manifestBytes) return refuse("Plugin manifest exceeds copy limits")
      total += manifestContent.byteLength
      let treeBytes = 0
      const files: PluginFile[] = []
      for (const file of listing.files) {
        safeFilePath(file.name)
        if (!(file.content instanceof Uint8Array) || file.content.byteLength > PLUGIN_COPY_LIMITS.fileBytes)
          return refuse("Plugin file exceeds copy limits")
        treeBytes += file.content.byteLength; total += file.content.byteLength
        if (treeBytes > PLUGIN_COPY_LIMITS.treeBytes || total > PLUGIN_COPY_LIMITS.batchBytes)
          return refuse("Plugin batch exceeds copy limits")
        // Snapshot callers' mutable bytes before the first filesystem await.
        files.push({ name: file.name, content: Uint8Array.from(file.content) })
      }
      if (total > PLUGIN_COPY_LIMITS.batchBytes) return refuse("Plugin batch exceeds copy limits")
      const directories = pathInventory(files)
      const nodes = files.length + directories.length + 1 // Include the generated manifest.
      totalNodes += nodes
      if (nodes > PLUGIN_COPY_LIMITS.nodes || totalNodes > PLUGIN_COPY_LIMITS.batchNodes)
        return refuse("Plugin file count exceeds copy limits")
      if (decoded.engine.entry !== undefined && !files.some(f => f.name === decoded.engine.entry))
        return refuse("Plugin entry file is absent from its generated tree")
      planned.push({ id: decoded.id, directories, files: [{ name: "arcade.json", content: manifestContent }, ...files] })
    }
    const root = await outputRoot(outDir)
    const original = await realpath(sourceRoot)
    if (inside(original, root)) return refuse("Plugin output cannot be inside the source plugin")
    for (const { id } of planned) {
      if (await inspect(join(root, id))) return refuse("Plugin output target already exists; choose a fresh --out directory")
    }
    await mkdir(root, { recursive: true, mode: 0o700 })
    if (await outputRoot(root) !== root) return refuse("Plugin output changed during generation")
    const rootInfo = await lstat(root)
    if (process.getuid && rootInfo.uid !== process.getuid()) return refuse("Plugin output must be owned by the current user")
    const written: string[] = []
    for (const plan of planned) {
      // Nonrecursive mkdir is an exclusive claim. A new concurrent directory is
      // never adopted, even if it happens to be empty.
      if (await outputRoot(root) !== root) return refuse("Plugin output changed during generation")
      const directory = join(root, plan.id)
      await mkdir(directory, { mode: 0o700 })
      for (const nested of plan.directories) {
        if (await outputRoot(directory) !== directory) return refuse("Plugin output changed during generation")
        const destination = join(directory, nested)
        if (await outputRoot(dirname(destination)) !== dirname(destination))
          return refuse("Plugin output changed during generation")
        await mkdir(destination, { mode: 0o700 })
      }
      for (const file of plan.files) {
        const destination = join(directory, file.name)
        if (await outputRoot(dirname(destination)) !== dirname(destination))
          return refuse("Plugin output changed during generation")
        const handle = await open(destination,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
        try { await handle.writeFile(file.content) } finally { await handle.close() }
        written.push(destination)
      }
    }
    return written
  } catch (error) {
    if (error instanceof PluginFileError) throw error
    throw new PluginFileError("Could not generate plugin files; inspect the selected output for partial new files before retrying.")
  }
}
