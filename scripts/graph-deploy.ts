import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, writeSync } from "node:fs"
import { dirname, isAbsolute, parse, resolve } from "node:path"
import { createHash } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"

const ENDPOINT = "https://api.studio.thegraph.com/deploy"
const NAME = "arcade-ledger-arc-testnet"
const VERSION = "v0.1.0"
const QUERY = `https://api.studio.thegraph.com/query/1721684/${NAME}/${VERSION}`
const SMOKE_CID = "QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8"
const MAX_BYTES = 16_384
export const Usage = "Usage: bun --no-env-file scripts/graph-deploy.ts --cid REVIEWED_CIDV0 --version v0.1.0 --journal ABSOLUTE_FRESH_FILE\nRequires separate owner approval for this exact deployment. No upload, build, retry or latest alias."
const refusal = () => ({ status: "refused", error: "Studio deployment command refused." } as const)
const unknown = () => ({ status: "unknown", error: "Studio deployment outcome unknown; do not retry." } as const)
function fail(): never { throw Error("Studio deployment command refused.") }
export type DeployOptions = { readonly cid: string; readonly version: typeof VERSION; readonly journal: string }
export type DeploymentResult = ReturnType<typeof refusal> | ReturnType<typeof unknown> |
  { readonly status: "deployed"; readonly cid: string; readonly version: typeof VERSION; readonly queryUrl: typeof QUERY } |
  { readonly status: "rejected"; readonly code: number; readonly message: "Studio rejected deployment" }
type Fetch = (url: string, init: RequestInit) => Promise<Response>
export type JournalIO = {
  readonly write: (fd: number, bytes: Uint8Array, offset: number, length: number) => number
  readonly sync: (fd: number) => void
  readonly close: (fd: number) => void
}
export type DeployDependencies = {
  readonly fetch?: Fetch
  readonly readKey?: (signal: AbortSignal) => Promise<string>
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  /** Trusted synchronous fault-injection seam; never CLI input. */
  readonly journalIO?: Partial<JournalIO>
}

function ownRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return fail()
  const copy: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return fail()
    const d = Object.getOwnPropertyDescriptor(value, key)
    if (!d || !("value" in d)) return fail()
    copy[key] = d.value
  }
  return copy
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail()
}
function validCid(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 46 || !value.startsWith("Qm") || value === SMOKE_CID) return false
  // CIDv0 is base58btc of the complete sha2-256 multihash, not merely a Qm label.
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  let n = 0n
  for (const c of value) { const digit = alphabet.indexOf(c); if (digit < 0) return false; n = n * 58n + BigInt(digit) }
  const bytes: number[] = []
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n }
  return bytes.length === 34 && bytes[0] === 0x12 && bytes[1] === 0x20
}
function captureOptions(value: unknown): DeployOptions {
  try {
    const o = ownRecord(value); keys(o, ["cid", "version", "journal"])
    if (!validCid(o.cid) || o.version !== VERSION || typeof o.journal !== "string" ||
      o.journal.length > 4096 || /[\x00-\x1f\x7f]/.test(o.journal) || !isAbsolute(o.journal) ||
      resolve(o.journal) !== o.journal || dirname(o.journal) === o.journal) return fail()
    return Object.freeze({ cid: o.cid, version: VERSION, journal: o.journal })
  } catch { return fail() }
}
export function parseDeployArgs(value: unknown): { readonly kind: "help" } | ({ readonly kind: "deploy" } & DeployOptions) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail()
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value
    if (length !== 1 && length !== 6) return fail()
    if (Reflect.ownKeys(value).length !== length + 1) return fail()
    const args: string[] = []
    for (let i = 0; i < length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i))
      if (!d || !("value" in d) || typeof d.value !== "string") return fail()
      args.push(d.value)
    }
    if (args.length === 1 && args[0] === "--help") return Object.freeze({ kind: "help" })
    if (args[0] !== "--cid" || args[2] !== "--version" || args[4] !== "--journal") return fail()
    return Object.freeze({ kind: "deploy", ...captureOptions({ cid: args[1], version: args[3], journal: args[5] }) })
  } catch { return fail() }
}

/** Exact argv and empty environment. The injectable spawn is test-only; it cannot
 * be selected through CLI/config. Resolution always follows the child's close. */
export function readDeploymentKey(signal: AbortSignal, spawnKey: typeof spawn = spawn): Promise<string> {
  return new Promise((accept, reject) => {
    if (signal.aborted) { reject(Error("Studio deployment credential unavailable.")); return }
    let child: ChildProcess
    try { child = spawnKey("/usr/bin/security", ["find-generic-password", "-s", "arcade-graph-deploy-key", "-a", "GRAPH_DEPLOY_KEY", "-w"], { env: {}, stdio: ["ignore", "pipe", "ignore"] }) }
    catch { reject(Error("Studio deployment credential unavailable.")); return }
    let bytes = Buffer.alloc(0), failed = false, closed = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      failed = true
      if (closed || killTimer !== undefined) return
      try { child.kill("SIGTERM") } catch {}
      killTimer = setTimeout(() => { if (!closed) { try { child.kill("SIGKILL") } catch {} } }, 100)
    }
    const timer = setTimeout(stop, 2500)
    signal.addEventListener("abort", stop, { once: true })
    child.on("error", () => { failed = true })
    child.stdout?.on("data", (chunk: Buffer) => {
      if (failed) return
      if (!Buffer.isBuffer(chunk) || bytes.length + chunk.length > 64) { stop(); return }
      bytes = Buffer.concat([bytes, chunk])
    })
    child.once("close", code => {
      closed = true; clearTimeout(timer); if (killTimer !== undefined) clearTimeout(killTimer)
      signal.removeEventListener("abort", stop)
      const key = bytes.toString("utf8").replace(/\r?\n$/, ""); bytes.fill(0)
      if (failed || signal.aborted || code !== 0 || !/^[a-fA-F0-9]{32}$/.test(key)) reject(Error("Studio deployment credential unavailable."))
      else accept(key)
    })
    if (!child.stdout || signal.aborted) stop()
  })
}

function privateParent(path: string) {
  const parent = dirname(path), root = parse(parent).root
  let current = root
  for (const part of parent.slice(root.length).split("/").filter(Boolean)) {
    current = resolve(current, part)
    const s = lstatSync(current)
    if (s.isSymbolicLink() || !s.isDirectory()) fail()
  }
  const stat = lstatSync(parent)
  if (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) fail()
  return { path: parent, stat }
}
function synchronous(value: unknown) {
  // Promise-returning injected IO cannot establish a synchronous durable fence.
  if (value instanceof Promise) void Promise.prototype.then.call(value, () => {}, () => {})
  if (value !== undefined) fail()
}
function openJournal(options: DeployOptions, io: JournalIO) {
  const parent = privateParent(options.journal)
  let fd: number | undefined, dirfd: number | undefined, broken = false, count = 0, bytes = 0
  let head = "0".repeat(64)
  const close = () => {
    let error = false
    for (const descriptor of [fd, dirfd]) {
      if (descriptor !== undefined) { try { synchronous(io.close(descriptor)) } catch { error = true } }
    }
    fd = undefined; dirfd = undefined
    if (error) fail()
  }
  try {
    dirfd = openSync(parent.path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const d = fstatSync(dirfd)
    if (!d.isDirectory() || d.dev !== parent.stat.dev || d.ino !== parent.stat.ino) fail()
    fd = openSync(options.journal, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    const policy = Object.freeze({ endpoint: ENDPOINT, name: NAME, cid: options.cid, version: VERSION, queryUrl: QUERY })
    return {
      close,
      append(event: Record<string, unknown>) {
        if (broken || fd === undefined || dirfd === undefined) fail()
        try {
          const current = privateParent(options.journal).stat, file = lstatSync(options.journal), opened = fstatSync(fd), openedDir = fstatSync(dirfd)
          if (current.dev !== parent.stat.dev || current.ino !== parent.stat.ino || openedDir.dev !== current.dev || openedDir.ino !== current.ino ||
            file.isSymbolicLink() || !file.isFile() || file.dev !== opened.dev || file.ino !== opened.ino ||
            file.nlink !== 1 || opened.nlink !== 1 || file.uid !== process.getuid?.() || (file.mode & 0o777) !== 0o600 || opened.size !== bytes) fail()
          const row = { format: "arcade-studio-deploy-v1", sequence: count, previousHash: head, policy, event }
          const hash = createHash("sha256").update(JSON.stringify(row)).digest("hex")
          const encoded = Buffer.from(JSON.stringify({ ...row, hash }) + "\n")
          if (bytes + encoded.length > MAX_BYTES) fail()
          let written = 0
          while (written < encoded.length) {
            const n = io.write(fd, encoded, written, encoded.length - written)
            if (!Number.isSafeInteger(n) || n < 1 || n > encoded.length - written) fail()
            written += n
          }
          synchronous(io.sync(fd)); synchronous(io.sync(dirfd)); bytes += encoded.length; head = hash; count++
        } catch { broken = true; fail() }
      }
    }
  } catch { try { close() } catch {} return fail() }
}

function project(value: unknown, cid: string): DeploymentResult {
  const o = ownRecord(value); keys(o, ["jsonrpc", "id", "result", "error"])
  if (o.jsonrpc !== "2.0" || o.id !== 1 || Object.hasOwn(o, "error") === Object.hasOwn(o, "result")) return fail()
  if (Object.hasOwn(o, "error")) {
    const e = ownRecord(o.error); keys(e, ["code", "message", "data"])
    if (typeof e.code !== "number" || !Number.isInteger(e.code) || e.code < -2147483648 || e.code > 2147483647 ||
      typeof e.message !== "string" || e.message.length < 1 || e.message.length > 4096) return fail()
    // Never reflect provider prose/data: split or encoded secrets cannot be
    // reliably removed by a blacklist. This wording is exclusively local.
    return Object.freeze({ status: "rejected", code: e.code, message: "Studio rejected deployment" })
  }
  const r = ownRecord(o.result)
  if (r.queries !== QUERY) return fail()
  return Object.freeze({ status: "deployed", cid, version: VERSION, queryUrl: QUERY })
}
async function cleanup(action: () => Promise<unknown>, timeoutMs = 100): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Promise.resolve().then(action).then(() => true, () => false),
      new Promise<false>(r => { timer = setTimeout(() => r(false), timeoutMs) })])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}

/** One invocation, one fresh journal, at most one POST. This API is not standing
 * deployment approval; the operator must separately approve the exact CID. */
export function createDeployment(input: unknown, dependencies: DeployDependencies = {}): () => Promise<DeploymentResult> {
  let options: DeployOptions, fetchFn: Fetch, readKey: (signal: AbortSignal) => Promise<string>, external: AbortSignal | undefined, timeout: number, io: JournalIO
  try {
    options = captureOptions(input)
    const deps = ownRecord(dependencies); keys(deps, ["fetch", "readKey", "signal", "timeoutMs", "journalIO"])
    fetchFn = deps.fetch === undefined ? globalThis.fetch : deps.fetch as Fetch
    readKey = deps.readKey === undefined ? readDeploymentKey : deps.readKey as typeof readKey
    external = deps.signal as AbortSignal | undefined
    timeout = deps.timeoutMs === undefined ? 20_000 : deps.timeoutMs as number
    if (typeof fetchFn !== "function" || typeof readKey !== "function" || !Number.isInteger(timeout) || timeout < 1 || timeout > 20_000 ||
      (external !== undefined && !(external instanceof AbortSignal))) return fail()
    const hooks = deps.journalIO === undefined ? {} : ownRecord(deps.journalIO); keys(hooks, ["write", "sync", "close"])
    io = { write: hooks.write === undefined ? (fd, b, o, l) => writeSync(fd, b, o, l) : hooks.write as JournalIO["write"],
      sync: hooks.sync === undefined ? fsyncSync : hooks.sync as JournalIO["sync"], close: hooks.close === undefined ? closeSync : hooks.close as JournalIO["close"] }
    if (Object.values(io).some(v => typeof v !== "function")) return fail()
  } catch { return fail() }
  let attempted = false
  return async () => {
    if (attempted) return refusal()
    attempted = true
    const deadline = performance.now() + timeout, controller = new AbortController()
    const abort = () => controller.abort()
    external?.addEventListener("abort", abort, { once: true })
    if (external?.aborted) abort()
    const timer = setTimeout(abort, timeout)
    const check = () => { if (controller.signal.aborted || performance.now() >= deadline) { abort(); fail() } }
    const bounded = <T>(promise: Promise<T>): Promise<T> => new Promise((resolveValue, reject) => {
      const onAbort = () => reject(Error("Studio deployment unavailable."))
      controller.signal.addEventListener("abort", onAbort, { once: true })
      promise.then(v => { controller.signal.removeEventListener("abort", onAbort); resolveValue(v) }, () => { controller.signal.removeEventListener("abort", onAbort); reject(Error("Studio deployment unavailable.")) })
      if (controller.signal.aborted) onAbort()
    })
    let journal: ReturnType<typeof openJournal> | undefined, dispatched = false, credential = "", active = true
    let keyWork: Promise<string> | undefined
    let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let result: DeploymentResult = refusal()
    try {
      check(); journal = openJournal(options, io)
      journal.append({ phase: "prepared", at: new Date().toISOString() }); check()
      keyWork = Promise.resolve().then(() => { check(); return readKey(controller.signal) })
      credential = await bounded(keyWork); check()
      if (typeof credential !== "string" || !/^[a-fA-F0-9]{32}$/.test(credential)) fail()
      journal.append({ phase: "dispatch_intent", at: new Date().toISOString() }); check()
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "subgraph_deploy", params: { name: NAME, ipfs_hash: options.cid, version_label: VERSION } })
      const pending = Promise.resolve().then(() => {
        check(); dispatched = true
        return fetchFn(ENDPOINT, { method: "POST", body, headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", accept: "application/json", "accept-encoding": "identity" }, redirect: "error", credentials: "omit", signal: controller.signal })
      })
      void pending.then(r => { if (!active && r.body) void cleanup(() => r.body!.cancel()) }, () => {})
      response = await bounded(pending); check()
      if (response.status !== 200 || response.redirected || (response.url !== "" && response.url !== ENDPOINT) || !response.body ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") ||
        ![null, "identity"].includes(response.headers.get("content-encoding")?.toLowerCase() ?? null)) fail()
      const length = response.headers.get("content-length")
      if (length !== null && (!/^(?:0|[1-9][0-9]{0,4})$/.test(length) || Number(length) > MAX_BYTES)) fail()
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []; let size = 0, empty = 0
      while (true) {
        check(); const part = await bounded(reader.read()); check()
        if (part.done) break
        if (!(part.value instanceof Uint8Array)) fail()
        if (part.value.byteLength === 0) { if (++empty > 1024) fail(); continue }
        empty = 0; size += part.value.byteLength
        if (size > MAX_BYTES) fail()
        chunks.push(part.value.slice())
      }
      if (length !== null && size !== Number(length)) fail()
      const buffer = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
      check(); result = project(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)), options.cid); check()
      journal.append({ phase: "completion", at: new Date().toISOString(), result }); check()
    } catch {
      result = dispatched ? unknown() : refusal()
      if (dispatched) { try { journal?.append({ phase: "unknown", at: new Date().toISOString(), status: "unknown" }) } catch {} }
    } finally {
      active = false; credential = ""; abort(); clearTimeout(timer); external?.removeEventListener("abort", abort)
      // Aborting the await does not mean the native credential process closed.
      // Own its settled cleanup through TERM/KILL, while bounding an injected
      // reader that ignores cancellation. A timed-out cleanup is never success.
      const keyCleaned = keyWork ? await cleanup(() => keyWork!.then(() => {}, () => {}), 500) : true
      if (!keyCleaned) result = dispatched ? unknown() : refusal()
      const cleaned = reader ? await cleanup(() => reader!.cancel()) : response?.body ? await cleanup(() => response!.body!.cancel()) : true
      if (!cleaned) result = dispatched ? unknown() : refusal()
      try { journal?.close() } catch { result = dispatched ? unknown() : refusal() }
    }
    return result
  }
}

export async function deployMain(args: unknown, deps: DeployDependencies = {}): Promise<{ exitCode: number; output: string }> {
  try {
    const parsed = parseDeployArgs(args)
    if (parsed.kind === "help") return { exitCode: 0, output: Usage }
    const result = await createDeployment({ cid: parsed.cid, version: parsed.version, journal: parsed.journal }, deps)()
    return { exitCode: result.status === "deployed" ? 0 : result.status === "rejected" ? 2 : 1, output: JSON.stringify(result) }
  } catch { return { exitCode: 2, output: JSON.stringify(refusal()) } }
}
if (import.meta.main) {
  // Keep the owning-process fuse through credential, body and file cleanup.
  // This event-loop fuse is a backstop, not an OS watchdog: it cannot preempt
  // blocked synchronous filesystem calls. The local cooperative filesystem/OS
  // model does not claim arbitrary storage-fault or unkillable-child recovery.
  const fuse = setTimeout(() => { console.log(JSON.stringify(unknown())); process.exit(1) }, 25_000)
  try { const result = await deployMain(process.argv.slice(2)); console.log(result.output); process.exitCode = result.exitCode }
  finally { clearTimeout(fuse) }
}
