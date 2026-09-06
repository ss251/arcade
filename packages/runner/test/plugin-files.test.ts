import { cp, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadPluginBundle } from "../src/plugin-load.js"
import { collectPluginSkillFiles, writePluginListings, PLUGIN_COPY_LIMITS } from "../src/plugin-files.js"

const disk = vi.hoisted(() => ({ failWrite: false }))
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>()
  return { ...fs, open: async (...args: Parameters<typeof fs.open>) => {
    const handle = await fs.open(...args)
    if (disk.failWrite) handle.writeFile = async () => { throw new Error("PRIVATE_DISK_MARKER") }
    return handle
  } }
})

const fixture = new URL("./fixtures/agent-plugin/", import.meta.url).pathname
let root: string, scratch: string, source: string
const manifest = (id = "fixture-summary") => ({
  id, version: "0.1.0", serviceName: "Fixture summary", description: "Local test.", tags: ["agent-skill"],
  price: "$0.01", bounds: { timeoutSec: 60 }, inputSchema: { type: "object" }, outputSchema: { type: "object" },
  engine: { adapter: "skill", entry: "SKILL.md", credential: "api-key", capabilities: [] }, secrets: [], egress: []
})
const file = (name = "SKILL.md", content = "local") => ({ name, content: new TextEncoder().encode(content) })
const listing = (id = "fixture-summary") => ({ manifest: manifest(id), files: [file()] })
const snapshot = async () => {
  const bundle = (await loadPluginBundle(root))!
  return collectPluginSkillFiles(bundle, bundle.skills[0]!)
}
beforeEach(async () => {
  disk.failWrite = false
  scratch = await mkdtemp(join(await realpath(tmpdir()), "arcade-plugin-copy-"))
  root = join(scratch, "plugin")
  await cp(fixture, root, { recursive: true })
  source = join(root, "skills/summarize")
})
afterEach(async () => { await rm(scratch, { recursive: true, force: true }) })

describe("bounded self-contained plugin source snapshot", () => {
  it("preserves nested references and binary bytes without writing to the source", async () => {
    await mkdir(join(source, "assets", "deep"), { recursive: true })
    const bytes = Uint8Array.from([0, 255, 8, 0, 128])
    await writeFile(join(source, "assets/deep/fixture.bin"), bytes)
    const files = await snapshot()
    expect(files.map(f => f.name)).toEqual(["SKILL.md", "assets/deep/fixture.bin", "references/format.md"])
    expect(files.find(f => f.name.endsWith(".bin"))!.content).toEqual(bytes)
    expect((await readFile(join(source, "assets/deep/fixture.bin"))).equals(Buffer.from(bytes))).toBe(true)
  })
  it("rejects a changed SKILL.md snapshot before creating any output", async () => {
    const bundle = (await loadPluginBundle(root))!
    await writeFile(join(source, "SKILL.md"), "changed")
    await expect(collectPluginSkillFiles(bundle, bundle.skills[0]!)).rejects.toThrow(/source files/i)
  })
  it.each(["file", "directory", "hardlink"])("rejects %s links in reference trees", async (kind) => {
    await writeFile(join(scratch, "outside"), "PRIVATE_MARKER")
    if (kind === "file") await symlink(join(scratch, "outside"), join(source, "references/linked"))
    else if (kind === "directory") await symlink(scratch, join(source, "references/linked"))
    else await link(join(scratch, "outside"), join(source, "references/linked"))
    await expect(snapshot()).rejects.toThrow(/source files/i)
  })
  it.each([".env", "arcade.json", "ARCADE.JSON", "bad name.md", "trailing.", "bad:port"])(
    "refuses hidden, reserved or nonportable source names %s", async (name) => {
      await writeFile(join(source, name), "PRIVATE_MARKER")
      const error = await snapshot().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).not.toContain("PRIVATE_MARKER")
      expect((error as Error).message).not.toContain(source)
    })
  it("bounds a single file, aggregate bytes and nesting depth", async () => {
    await writeFile(join(source, "oversized"), new Uint8Array(PLUGIN_COPY_LIMITS.fileBytes + 1))
    await expect(snapshot()).rejects.toThrow(/source files/i)
    await rm(join(source, "oversized"))
    const bytes = new Uint8Array(PLUGIN_COPY_LIMITS.fileBytes)
    for (let i = 0; i <= PLUGIN_COPY_LIMITS.treeBytes / bytes.length; i++)
      await writeFile(join(source, "large-" + i), bytes)
    await expect(snapshot()).rejects.toThrow(/source files/i)
    for (let i = 0; i <= PLUGIN_COPY_LIMITS.treeBytes / bytes.length; i++)
      await rm(join(source, "large-" + i))
    await mkdir(join(source, ...Array.from({ length: PLUGIN_COPY_LIMITS.depth + 1 }, () => "deep")), { recursive: true })
    await expect(snapshot()).rejects.toThrow(/source files/i)
  })
  it("refuses descriptors whose entry or directory escaped their bundle", async () => {
    const bundle = (await loadPluginBundle(root))!
    await expect(collectPluginSkillFiles(bundle, { ...bundle.skills[0]!, directory: scratch }))
      .rejects.toThrow(/source files/i)
    await expect(collectPluginSkillFiles(bundle, { ...bundle.skills[0]!, entryPath: join(scratch, "SKILL.md") }))
      .rejects.toThrow(/source files/i)
  })
  it("bounds aggregate tree nodes across otherwise small directories", async () => {
    for (let directory = 0; directory < 17; directory++) {
      const parent = join(source, "many-" + directory)
      await mkdir(parent)
      for (let i = 0; i < 32; i++) await writeFile(join(parent, "f-" + i), "x")
    }
    await expect(snapshot()).rejects.toThrow(/source files/i)
  })
})

describe("exclusive plugin listing generation", () => {
  it("writes an actual self-contained tree and private manifest with restrictive modes", async () => {
    const files = await snapshot(), out = join(scratch, "generated")
    const paths = await writePluginListings(out, [{ manifest: manifest(), files }], root)
    expect(paths.map(p => p.slice(out.length + 1))).toEqual([
      "fixture-summary/arcade.json", "fixture-summary/SKILL.md", "fixture-summary/references/format.md"])
    expect(JSON.parse(await readFile(paths[0]!, "utf8"))).toEqual(manifest())
    expect(await readFile(join(out, "fixture-summary/references/format.md"), "utf8"))
      .toBe(await readFile(join(source, "references/format.md"), "utf8"))
    expect((await lstat(join(out, "fixture-summary"))).mode & 0o777).toBe(0o700)
    for (const path of paths) expect((await lstat(path)).mode & 0o777).toBe(0o600)
  })
  it("preflights a late existing target before creating the first listing and never overwrites edits", async () => {
    const out = join(scratch, "generated")
    await mkdir(join(out, "second"), { recursive: true })
    await writeFile(join(out, "second", "arcade.json"), "SELLER_EDITS")
    await expect(writePluginListings(out, [listing("first"), listing("second")], root)).rejects.toThrow(/already exists/i)
    expect(await readdir(out)).toEqual(["second"])
    expect(await readFile(join(out, "second/arcade.json"), "utf8")).toBe("SELLER_EDITS")
  })
  it("refuses even an existing empty listing directory", async () => {
    const out = join(scratch, "generated")
    await mkdir(join(out, "fixture-summary"), { recursive: true })
    await expect(writePluginListings(out, [listing()], root)).rejects.toThrow(/already exists/i)
    expect(await readdir(join(out, "fixture-summary"))).toEqual([])
  })
  it.each(["../escape", "/escape", "references/../../escape", ".env", "arcade.json", "ARCADE.JSON",
    "references//double", "references/./dot", "references/../parent", "x\\y", "x:port"])(
    "refuses unsafe or reserved output path %s before any write", async (name) => {
      const out = join(scratch, "generated")
      await expect(writePluginListings(out, [{ manifest: manifest(), files: [file(name)] }], root)).rejects.toThrow()
      await expect(lstat(out)).rejects.toMatchObject({ code: "ENOENT" })
    })
  it("rejects path collisions, including parent-file and case-folded directory collisions", async () => {
    for (const files of [
      [file("x"), file("x/y")], [file("Ref/a"), file("ref/b")], [file("x"), file("X")],
      [file("references/a"), file("references/a")]]) {
      const out = join(scratch, "generated")
      await expect(writePluginListings(out, [{ manifest: manifest(), files }], root)).rejects.toThrow()
      await expect(lstat(out)).rejects.toMatchObject({ code: "ENOENT" })
    }
  })
  it("rejects duplicate/invalid manifests across the batch without creating output", async () => {
    for (const entries of [[listing(), listing()], [listing("first"), { ...listing("second"), manifest: { invalid: true } }]]) {
      const out = join(scratch, "generated")
      await expect(writePluginListings(out, entries, root)).rejects.toThrow()
      await expect(lstat(out)).rejects.toMatchObject({ code: "ENOENT" })
    }
  })
  it("refuses a nonpublishable subscription listing", async () => {
    const out = join(scratch, "generated")
    const data = manifest()
    await expect(writePluginListings(out, [{ manifest: { ...data,
      engine: { ...data.engine, credential: "subscription" } }, files: [] }], root)).rejects.toThrow()
    await expect(lstat(out)).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("refuses destination symlinks and source overlap without changing either tree", async () => {
    await symlink(root, join(scratch, "alias"))
    await expect(writePluginListings(join(scratch, "alias", "generated"), [listing()], root)).rejects.toThrow()
    await expect(writePluginListings(join(root, "generated"), [listing()], root)).rejects.toThrow(/source/i)
    await expect(lstat(join(root, "generated"))).rejects.toMatchObject({ code: "ENOENT" })
    const out = join(scratch, "generated")
    await mkdir(out)
    await symlink(source, join(out, "fixture-summary"))
    await expect(writePluginListings(out, [listing()], root)).rejects.toThrow()
    expect(await readdir(source)).toEqual(expect.arrayContaining(["SKILL.md", "references"]))
  })
  it("rejects excessive batches and byte totals before creating output", async () => {
    const out = join(scratch, "generated")
    await expect(writePluginListings(out, Array.from({ length: PLUGIN_COPY_LIMITS.listings + 1 }, (_, i) => listing("s-" + i)), root))
      .rejects.toThrow()
    const bytes = new Uint8Array(PLUGIN_COPY_LIMITS.fileBytes)
    const entries = Array.from({ length: PLUGIN_COPY_LIMITS.batchBytes / bytes.length + 1 }, (_, i) => ({
      manifest: manifest("s-" + i), files: [{ name: "SKILL.md", content: bytes }]
    }))
    await expect(writePluginListings(out, entries, root)).rejects.toThrow()
    await expect(lstat(out)).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("snapshots mutable manifest and file data before asynchronous writes", async () => {
    const entry = listing(), out = join(scratch, "generated")
    const pending = writePluginListings(out, [entry], root)
    entry.files[0]!.content.fill(42)
    entry.manifest.description = "MUTATED_LATER"
    await pending
    expect(await readFile(join(out, "fixture-summary/SKILL.md"), "utf8")).toBe("local")
    expect(JSON.parse(await readFile(join(out, "fixture-summary/arcade.json"), "utf8")).description).toBe("Local test.")
  })
  it("bounds output directory nodes and aggregate zero-byte files, not just retained bytes", async () => {
    const out = join(scratch, "generated")
    const nested = Array.from({ length: 256 }, (_, i) => file("d-" + i + "/empty", ""))
    await expect(writePluginListings(out, [{ manifest: manifest(), files: [file(), ...nested] }], root))
      .rejects.toThrow(/file count/i)
    const files = [file(), ...Array.from({ length: 499 }, (_, i) => file("empty-" + i, ""))]
    await expect(writePluginListings(out, Array.from({ length: 9 }, (_, i) => ({
      manifest: manifest("s-" + i), files
    })), root)).rejects.toThrow(/file count/i)
    await expect(lstat(out)).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("reports possible partial new output on disk failure, without leaking the cause or deleting seller files", async () => {
    const out = join(scratch, "generated")
    await mkdir(out)
    await writeFile(join(out, "seller-notes.md"), "SELLER_EDITS")
    disk.failWrite = true
    const error = await writePluginListings(out, [listing()], root).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/partial new files/i)
    expect((error as Error).message).not.toContain("PRIVATE_DISK_MARKER")
    expect(await readFile(join(out, "seller-notes.md"), "utf8")).toBe("SELLER_EDITS")
    expect(await readdir(join(out, "fixture-summary"))).toEqual(["arcade.json"])
  })
})
