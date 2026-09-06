import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path"
import { capturePublishTarget, localPublishRequestAllowed } from "./publish-policy.ts"
import { parsePreview, PublishDisabled, PublishFailed, type PublishPreviewDocument } from "./publish-preview.ts"
import { PublishUnreaped, runPublishChild } from "./publish-child.ts"

const ownerKey = Symbol.for("arcade.local-publish.owner")
const registry = globalThis as typeof globalThis & { [ownerKey]?: { busy: boolean; poisoned: boolean } }
const owner = registry[ownerKey] ??= { busy: false, poisoned: false }

/** Trusted root is explicit; browser targets cannot change it. Descendants must
 * not be symlinks. This is not an OS sandbox against a malicious local owner. */
const checkedFile = async (root: string, target: string, maxBytes: number) => {
  const path = resolve(root, target), rel = relative(root, path)
  if (!rel || isAbsolute(rel) || rel.split(sep).some(p => p === "..")) throw 0
  let part = root
  const components = rel.split(sep)
  for (let i = 0; i < components.length; i++) {
    part = join(part, components[i]!)
    const info = await lstat(part)
    if (info.isSymbolicLink() || (i < components.length - 1 ? !info.isDirectory() : !info.isFile())) throw 0
  }
  if (await realpath(path) !== path) throw 0
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.nlink !== 1 || before.size > maxBytes) throw 0
    const buffer = Buffer.alloc(Math.min(before.size + 1, maxBytes + 1))
    let bytes = 0
    while (bytes < buffer.length) {
      const read = await handle.read(buffer, bytes, buffer.length - bytes, bytes)
      if (read.bytesRead === 0) break
      bytes += read.bytesRead
    }
    const after = await handle.stat()
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw 0
    return buffer.subarray(0, bytes)
  } finally { await handle.close() }
}

/** Metadata-guarded, one-shot local snapshot preview. Only a server route may
 * call this; the supported entrypoint must already have enforced loopback binding. */
export const previewLocal = async (input: unknown, request: Request,
  env: Record<string, string | undefined> = process.env): Promise<PublishPreviewDocument> => {
  if (!localPublishRequestAllowed(request, env)) throw new PublishDisabled()
  if (owner.busy || owner.poisoned || request.signal.aborted) throw new PublishFailed()
  owner.busy = true
  const started = performance.now()
  let snapshot: string | undefined
  try {
    const target = capturePublishTarget(input)
    const repoInput = env["ARCADE_REPO_ROOT"], bunInput = env["ARCADE_PUBLISH_BUN"]
    if (!repoInput || !bunInput || !isAbsolute(repoInput) || !isAbsolute(bunInput) ||
      resolve(repoInput) === parse(repoInput).root) throw 0
    const root = await realpath(repoInput), bun = await realpath(bunInput)
    if (!(["bun", "bun.exe"].includes(basename(bun))) || !(await lstat(bun)).isFile()) throw 0
    const cli = join(root, "packages/runner/src/cli.ts"), preload = join(root, "apps/web/src/lib/publish-discovery-guard.ts")
    if (JSON.parse((await checkedFile(root, "package.json", 65536)).toString("utf8")).name !== "arcade") throw 0
    await checkedFile(root, "packages/runner/src/cli.ts", 1048576)
    await checkedFile(root, "apps/web/src/lib/publish-discovery-guard.ts", 65536)
    const source = target.kind === "mcp" ? undefined : {
      path: target.kind === "directory" ? join(target.target, "arcade.json") : target.target,
      limit: target.kind === "directory" ? 1048576 : 5 * 1048576
    }
    const bytes = source ? await checkedFile(root, source.path, source.limit) : undefined
    if (request.signal.aborted || performance.now() - started >= 35000) throw 0
    snapshot = await mkdtemp(join(tmpdir(), "arcade-web-preview-"))
    const cwd = join(snapshot, "workspace"), home = join(snapshot, "home")
    await mkdir(cwd, { mode: 0o700 }); await mkdir(home, { mode: 0o700 })
    if (source && bytes) {
      const destination = join(cwd, source.path)
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      await writeFile(destination, bytes, { flag: "wx", mode: 0o600 })
    }
    const stdout = await runPublishChild({ bun, cli, preload, cwd, home, target: target.target,
      generated: target.kind !== "directory" }, request.signal, 35000 - (performance.now() - started))
    const doc = parsePreview(stdout)
    if (doc.target !== target.target || (target.kind === "directory" ? doc.kind !== "directory" :
      doc.kind !== "generated" || doc.source !== target.kind || doc.entries.some(e => e.target !== join("skills", e.skillId)))) throw 0
    return doc
  } catch (error) {
    if (error instanceof PublishUnreaped) owner.poisoned = true
    throw new PublishFailed()
  } finally {
    if (!owner.poisoned && snapshot) {
      try { await rm(snapshot, { recursive: true, force: false }) }
      catch { owner.poisoned = true; throw new PublishFailed() }
    }
    owner.busy = false
  }
}
