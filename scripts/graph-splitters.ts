/** Current public announcements are candidates, never historical per-skill attribution. */
import { open, lstat, rename, unlink } from "node:fs/promises"
import { constants } from "node:fs"
import { randomUUID } from "node:crypto"
import { approvedSplitterPin, renderManifest } from "../subgraph/build-manifest.ts"

const MAX_BYTES = 1_048_576
const UINT256 = (1n << 256n) - 1n
const PILOT = "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206"
const ASSET = "0x3600000000000000000000000000000000000000"
const CODES = ["configuration_invalid", "discovery_invalid", "discovery_unavailable", "unapproved_splitter", "inventory_invalid", "manifest_invalid", "write_failed", "cancelled"] as const
type Failure = typeof CODES[number]
const failures = new WeakMap<object, Failure>()
class SplitterFailure extends Error { constructor(code: Failure) { super(code); failures.set(this, code) } }
const fail = (code: Failure): never => { throw new SplitterFailure(code) }
const failureCode = (error: unknown, fallback: Failure): Failure => ((typeof error === "object" && error !== null) || typeof error === "function" ? failures.get(error) : undefined) ?? fallback
const normalize = (error: unknown, fallback: Failure): never => fail(failureCode(error, fallback))
type RecordData = Record<string, unknown>
const object = (value: unknown): RecordData => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordData : fail("discovery_invalid")
const keys = (value: RecordData, required: string[], optional: string[] = []) => {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail("discovery_invalid")
}

/** Bounded, getter-free JSON capture also protects direct pure API callers. */
function capture(input: unknown): unknown {
  let nodes = 0, bytes = 0
  const text = (value: string) => {
    if (value.length > MAX_BYTES || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) fail("discovery_invalid")
    bytes += new TextEncoder().encode(value).length
    if (bytes > MAX_BYTES) fail("discovery_invalid")
    return value
  }
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 50_000 || depth > 16) fail("discovery_invalid")
    if (value === null || typeof value === "boolean") return value
    if (typeof value === "string") return text(value)
    if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return value
    if (typeof value !== "object" || value === null) return fail("discovery_invalid")
    const array = Array.isArray(value), proto: unknown = Object.getPrototypeOf(value)
    if (proto !== null && proto !== (array ? Array.prototype : Object.prototype)) return fail("discovery_invalid")
    const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors)
    if (names.length > 1001 || names.some(name => typeof name !== "string") || Object.values(descriptors).some(d => !("value" in d))) return fail("discovery_invalid")
    if (array) {
      const length: unknown = descriptors.length?.value
      if (typeof length !== "number" || !Number.isInteger(length) || length < 0 || length > 1000 || names.length !== length + 1) return fail("discovery_invalid")
      return Array.from({ length }, (_, i) => descriptors[String(i)] ? visit(descriptors[String(i)]!.value, depth + 1) : fail("discovery_invalid"))
    }
    const result: RecordData = Object.create(null)
    for (const name of (names as string[]).sort()) result[text(name)] = visit(descriptors[name]!.value, depth + 1)
    return result
  }
  return visit(input, 0)
}
function origin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return fail("configuration_invalid")
  const url = new URL(value)
  if (url.origin !== value || url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return fail("configuration_invalid")
  return value
}
function address(value: unknown): string {
  if (typeof value !== "string" || value.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) return fail("discovery_invalid")
  return value.toLowerCase()
}
const skill = (value: unknown): string => typeof value === "string" && value.length <= 64 && /^[a-z0-9][a-z0-9-]{1,63}$/.test(value) ? value : fail("discovery_invalid")
function amount(value: unknown): bigint {
  if (typeof value !== "string" || value.length > 78 || !/^[1-9][0-9]*$/.test(value)) return fail("discovery_invalid")
  const n = BigInt(value)
  return n <= UINT256 ? n : fail("discovery_invalid")
}
/** Matches the public Price grammar, not ambient chain selection or a float conversion. */
function price(value: unknown): bigint {
  if (typeof value !== "string" || value.length > 86) return fail("discovery_invalid")
  const match = /^\$?(\d+)(?:\.(\d{1,6}))?$/.exec(value)
  if (!match) return fail("discovery_invalid")
  const n = BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"))
  return n > 0n && n <= UINT256 ? n : fail("discovery_invalid")
}
export type SplitterCandidate = Readonly<{ address: string; seller: string; listingIds: readonly string[] }>
export type SplitterDiscovery = Readonly<{ kind: "empty" | "observed"; candidates: readonly SplitterCandidate[] }>

export function decodeSplitterDiscovery(hubOrigin: string, listings: unknown, wellKnown: unknown): SplitterDiscovery {
  try {
    const hub = origin(hubOrigin), catalogue = capture(listings), doc = object(capture(wellKnown))
    if (!Array.isArray(catalogue)) return fail("discovery_invalid")
    keys(doc, ["x402Version", "rail", "rails", "resources"], ["items"])
    if (doc.x402Version !== 2 || doc.rail !== "eip3009" || !Array.isArray(doc.rails) || doc.rails.length > 4 ||
        !doc.rails.includes("eip3009") || new Set(doc.rails).size !== doc.rails.length ||
        doc.rails.some(rail => typeof rail !== "string" || !["eip3009", "gateway", "test", "erc8183"].includes(rail)) || !Array.isArray(doc.resources) ||
        doc.items !== undefined && !Array.isArray(doc.items)) return fail("discovery_invalid")
    const byPath = new Map<string, RecordData>()
    for (const entry of catalogue) {
      const listing = object(entry)
      keys(listing, ["id", "seller", "price", "version", "serviceName", "description", "tags", "bounds", "inputSchema", "outputSchema"], ["iconUrl", "replaces", "canaryInput", "ensName", "rails", "category"])
      const path = `${hub}/x/${address(listing.seller)}/${skill(listing.id)}`
      if (byPath.has(path) || typeof listing.description !== "string") return fail("discovery_invalid")
      price(listing.price)
      byPath.set(path, listing)
    }
    const seen = new Set<string>(), candidates = new Map<string, { address: string; seller: string; listingIds: string[] }>()
    for (const entry of doc.resources) {
      const resource = object(entry)
      keys(resource, ["resource", "method", "description", "accepts", "outputSchema"], ["type", "x402Version", "metadata"])
      if (typeof resource.resource !== "string" || resource.method !== "POST" || typeof resource.description !== "string" || !Array.isArray(resource.accepts) || resource.accepts.length > 3 ||
          resource.type !== undefined && resource.type !== "http" || resource.x402Version !== undefined && resource.x402Version !== 2) return fail("discovery_invalid")
      const path = resource.resource
      const match = path.startsWith(`${hub}/x/`) ? /^(0x[0-9a-fA-F]{40})\/([a-z0-9][a-z0-9-]{1,63})$/.exec(path.slice(hub.length + 3)) : null
      if (!match) return fail("discovery_invalid")
      const canonicalPath = `${hub}/x/${address(match[1])}/${skill(match[2])}`
      if (seen.has(canonicalPath)) return fail("discovery_invalid")
      seen.add(canonicalPath)
      const listing = byPath.get(canonicalPath)
      const kinds = new Set<string>(); let vanilla: RecordData | undefined
      for (const value of resource.accepts) {
        const accept = object(value)
        keys(accept, ["scheme", "network", "asset", "payTo", "amount", "resource", "description"], ["maxTimeoutSeconds", "mimeType", "extra"])
        if (accept.scheme !== "exact" && accept.scheme !== "erc8183" || accept.network !== "eip155:5042002" || address(accept.asset) !== ASSET || accept.resource !== path || accept.description !== resource.description) return fail("discovery_invalid")
        const atomic = amount(accept.amount); address(accept.payTo)
        if (listing && atomic !== price(listing.price)) return fail("discovery_invalid")
        if (accept.maxTimeoutSeconds !== undefined && (typeof accept.maxTimeoutSeconds !== "number" || !Number.isSafeInteger(accept.maxTimeoutSeconds) || accept.maxTimeoutSeconds <= 0) ||
            accept.mimeType !== undefined && accept.mimeType !== "application/json") return fail("discovery_invalid")
        const extra = accept.extra === undefined ? undefined : object(accept.extra)
        const kind = accept.scheme === "erc8183" ? "erc8183" : extra?.name === "GatewayWalletBatched" ? "gateway" : "eip3009"
        if (kinds.has(kind)) return fail("discovery_invalid")
        kinds.add(kind)
        if (kind !== "eip3009") continue // Neither destination is a FeeSplitter announcement.
        if (extra && (extra.name !== "USDC" || extra.version !== "2" || extra.feeSplitter !== undefined && address(extra.feeSplitter) !== address(accept.payTo))) return fail("discovery_invalid")
        vanilla = accept
      }
      // Discovery currently retains ENS-expired resources that /listings omits.
      if (!listing) continue
      if (resource.description !== listing.description || JSON.stringify(resource.outputSchema) !== JSON.stringify(listing.outputSchema)) return fail("discovery_invalid")
      byPath.delete(canonicalPath)
      if (!vanilla) continue
      const payTo = address(vanilla.payTo)
      const seller = address(listing.seller), pin = approvedSplitterPin(payTo)
      if (!pin || pin.seller !== seller) return fail("unapproved_splitter")
      const candidate = candidates.get(payTo) ?? { address: payTo, seller, listingIds: [] }
      if (candidate.seller !== seller) return fail("unapproved_splitter")
      candidate.listingIds.push(skill(listing.id)); candidates.set(payTo, candidate)
    }
    if (byPath.size !== 0) return fail("discovery_invalid")
    const result = [...candidates.values()].sort((a, b) => a.address < b.address ? -1 : 1).map(candidate => Object.freeze({ ...candidate, listingIds: Object.freeze(candidate.listingIds.sort()) }))
    return Object.freeze({ kind: result.length === 0 ? "empty" : "observed", candidates: Object.freeze(result) })
  } catch (error) { return normalize(error, "discovery_invalid") }
}

export function planSplitterUpdate(existing: unknown, discovery: unknown): Readonly<{ json: string; added: number; total: number }> {
  const pins = new Map<string, { address: string; startBlock: number }>()
  try {
    const list = object(capture(existing)); keys(list, ["splitters"])
    if (!Array.isArray(list.splitters) || list.splitters.length < 1 || list.splitters.length > 2) fail("inventory_invalid")
    for (const entry of list.splitters as unknown[]) {
      const item = object(entry); keys(item, ["address", "startBlock"])
      const key = address(item.address), pin = approvedSplitterPin(key)
      if (!pin || item.startBlock !== pin.startBlock || Object.is(item.startBlock, -0) || pins.has(key)) fail("inventory_invalid")
      pins.set(key, { address: key, startBlock: pin!.startBlock })
    }
    if (!pins.has(PILOT)) fail("inventory_invalid")
  } catch { return fail("inventory_invalid") }
  const before = pins.size
  try {
    const decoded = object(capture(discovery)); keys(decoded, ["kind", "candidates"])
    if (!Array.isArray(decoded.candidates) || decoded.candidates.length > 2 || decoded.kind !== (decoded.candidates.length ? "observed" : "empty")) fail("discovery_invalid")
    const seen = new Set<string>()
    for (const entry of decoded.candidates as unknown[]) {
      const candidate = object(entry); keys(candidate, ["address", "seller", "listingIds"])
      const key = address(candidate.address), pin = approvedSplitterPin(key)
      if (!pin || pin.seller !== address(candidate.seller) || seen.has(key)) fail("unapproved_splitter")
      if (!Array.isArray(candidate.listingIds) || candidate.listingIds.length < 1 || new Set(candidate.listingIds.map(skill)).size !== candidate.listingIds.length) fail("discovery_invalid")
      seen.add(key); pins.set(key, { address: key, startBlock: pin!.startBlock })
    }
    return Object.freeze({ json: JSON.stringify({ splitters: [...pins.values()].sort((a, b) => a.address < b.address ? -1 : 1) }, null, 2) + "\n", added: pins.size - before, total: pins.size })
  } catch (error) { return normalize(error, "discovery_invalid") }
}

export type SplitterFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
export interface SplitterUpdateOptions {
  readonly hubOrigin: string
  readonly output: URL
  readonly template: URL
  readonly chainConfig: URL
  readonly fetchImpl: SplitterFetch
  readonly signal?: AbortSignal
  readonly write: boolean
}
/** Deadline races only read-only transport; local writes are awaited and checked before rename. */
export async function updateSplitterList(options: SplitterUpdateOptions): Promise<Readonly<{ changed: boolean; added: number; total: number }>> {
  let temporary: URL | undefined
  let signal: AbortSignal | undefined
  const controller = new AbortController(), externalAbort = () => controller.abort()
  const deadline = performance.now() + 10_000
  const timer = setTimeout(() => controller.abort(), 10_000)
  const check = () => {
    if (performance.now() >= deadline) controller.abort()
    if (controller.signal.aborted) fail(signal?.aborted ? "cancelled" : "discovery_unavailable")
  }
  const bounded = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const aborted = () => reject(new SplitterFailure(signal?.aborted ? "cancelled" : "discovery_unavailable"))
    controller.signal.addEventListener("abort", aborted, { once: true })
    if (controller.signal.aborted) aborted()
    promise.then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", aborted)).catch(() => undefined)
  })
  const localRead = async (path: URL): Promise<string> => {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.size > 65_536) fail("manifest_invalid")
      const bytes = new Uint8Array(65_537)
      let length = 0
      for (;;) {
        const next = await handle.read(bytes, length, bytes.length - length, length)
        length += next.bytesRead
        if (length > 65_536) fail("manifest_invalid")
        if (next.bytesRead === 0) break
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))
    } finally { await handle.close() }
  }
  try {
    const hub = origin(options.hubOrigin), write = options.write, fetchImpl = options.fetchImpl
    signal = options.signal
    if (typeof write !== "boolean" || typeof fetchImpl !== "function") fail("configuration_invalid")
    const paths = [options.output, options.template, options.chainConfig].map(path => {
      if (!(path instanceof URL) || path.protocol !== "file:" || path.search || path.hash) return fail("configuration_invalid")
      return new URL(path.href)
    })
    if (new Set(paths.map(path => path.href)).size !== 3) fail("configuration_invalid")
    const output = paths[0]!, templatePath = paths[1]!
    signal?.addEventListener("abort", externalAbort, { once: true }); if (signal?.aborted) externalAbort(); check()
    const [original, template, chain] = await Promise.all(paths.map(localRead)); check()
    const saved: unknown = JSON.parse(original!)
    planSplitterUpdate(saved, { kind: "empty", candidates: [] })
    const get = async (path: string): Promise<unknown> => {
      check()
      const pending = Promise.resolve(fetchImpl(`${hub}${path}`, { method: "GET", redirect: "error", credentials: "omit", headers: { accept: "application/json" }, signal: controller.signal }))
      // A late uncooperative fetch may acquire a body; cancel it, never process it.
      void pending.then(response => { if (controller.signal.aborted) void response.body?.cancel().catch(() => undefined) }, () => undefined)
      const response = await bounded(pending)
      if (!response.ok || response.redirected || !response.body) { void response.body?.cancel().catch(() => undefined); return fail("discovery_unavailable") }
      const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true })
      let length = 0, text = ""
      try {
        for (;;) {
          check(); const next = await bounded(reader.read()); check()
          if (next.done) break
          length += next.value.byteLength
          if (length > MAX_BYTES) fail("discovery_invalid")
          text += decoder.decode(next.value, { stream: true })
        }
        text += decoder.decode()
        return JSON.parse(text) as unknown
      } catch (error) { return normalize(error, "discovery_invalid") }
      finally { void reader.cancel().catch(() => undefined); reader.releaseLock() }
    }
    const listings = await get("/listings"), document = await get("/.well-known/x402")
    const plan = planSplitterUpdate(saved, decodeSplitterDiscovery(hub, listings, document))
    try {
      renderManifest(template!, JSON.parse(chain!), JSON.parse(plan.json))
      for (const relative of ["schema.graphql", "src/fee-splitter.ts", "src/ids.ts", "src/identity.ts", "src/reputation.ts", "src/validation.ts", "src/registry.ts", "abis/FeeSplitter.json", "abis/FeeSplitterV2.json", "abis/IdentityRegistry.json", "abis/ReputationRegistry.json", "abis/ValidationRegistry.json"]) {
        if (!(await lstat(new URL(relative, templatePath))).isFile()) fail("manifest_invalid")
      }
    } catch { fail("manifest_invalid") }
    check()
    const changed = original !== plan.json
    if (write && changed) {
      try {
        temporary = new URL(`.splitters-${randomUUID()}.tmp`, output)
        const handle = await open(temporary, "wx", 0o600)
        try { await handle.writeFile(plan.json) } finally { await handle.close() }
        check()
        // Detect cooperative concurrent edits, without claiming a hostile-filesystem CAS.
        if (await localRead(output) !== original) fail("write_failed")
        check(); await rename(temporary, output); temporary = undefined
      } catch (error) { normalize(error, "write_failed") }
    }
    return Object.freeze({ changed, added: plan.added, total: plan.total })
  } catch (error) { return normalize(error, "discovery_unavailable") }
  finally {
    clearTimeout(timer); signal?.removeEventListener("abort", externalAbort)
    if (temporary) await unlink(temporary).catch(() => undefined)
  }
}

export function parseSplitterArgs(args: readonly string[]): Readonly<{ help: true } | { help: false; hubOrigin: string; write: boolean }> {
  try {
    if (args.length === 1 && args[0] === "--help") return { help: true }
    let hub: string | undefined, write = false
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--hub" && hub === undefined) hub = args[++i]
      else if (args[i] === "--write" && !write) write = true
      else fail("configuration_invalid")
    }
    return { help: false, hubOrigin: origin(hub), write }
  } catch { return fail("configuration_invalid") }
}
if (import.meta.main) {
  try {
    const args = parseSplitterArgs(Bun.argv.slice(2))
    if (args.help) process.stdout.write("Usage: bun --no-env-file scripts/graph-splitters.ts --hub <origin> [--write]\nDefault: dry-run. Two public GETs; only reviewed splitter pins; no deployment or payments.\n")
    else {
      const result = await updateSplitterList({ ...args, output: new URL("../subgraph/splitters.json", import.meta.url), template: new URL("../subgraph/subgraph.template.yaml", import.meta.url), chainConfig: new URL("../config/chains/arc-testnet.json", import.meta.url), fetchImpl: fetch })
      process.stdout.write(JSON.stringify({ mode: args.write ? "write" : "dry-run", ...result }) + "\n")
    }
  } catch (error) { process.stderr.write(failureCode(error, "configuration_invalid") + "\n"); process.exitCode = 1 }
}
