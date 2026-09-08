/** I2 offline capture tooling. CLI inactive; sanitized private storage is explicit. */
import { createHash } from "node:crypto"
import { constants, mkdtempSync, chmodSync, realpathSync, lstatSync, opendirSync, openSync,
  fstatSync, readSync, writeSync, fsyncSync, closeSync, unlinkSync, type Stats } from "node:fs"
import { isAbsolute, join } from "node:path"
import { tmpdir } from "node:os"
import { decodeHeaderJson } from "../packages/payments/src/types.ts"

export const CAPTURE_DUMMY_SIGNATURE = "0x" + "11".repeat(65)
const FAIL = "circle_capture_header_refused"
const USDC = "0x3600000000000000000000000000000000000000"
const GATEWAY = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
const description = "capture probe"
const mimeType = "application/json"
function check(value: unknown): asserts value { if (!value) throw new Error(FAIL) }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)))
  const names = Reflect.ownKeys(value), allowed = [...required, ...optional]
  check(names.length <= allowed.length && names.every(name => typeof name === "string" && allowed.includes(name)) &&
    required.every(name => Object.hasOwn(value, name)))
  const result: Record<string, unknown> = Object.create(null)
  for (const name of names) {
    check(typeof name === "string")
    const field = Object.getOwnPropertyDescriptor(value, name)
    check(field !== undefined && "value" in field && field.enumerable); result[name] = field.value
  }
  return result
}
const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value)
const same = (left: unknown, right: unknown) => address(left) && address(right) && left.toLowerCase() === right.toLowerCase()
const uint = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < (1n << 256n)
export interface CircleCaptureContext { readonly endpoint: string; readonly payer: string; readonly payTo: string }
function captureContext(value: unknown): CircleCaptureContext {
  const r = record(value, ["endpoint", "payer", "payTo"])
  check(typeof r.endpoint === "string" && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/x\/demo\/usdc-flow-check$/.test(r.endpoint) &&
    Number(new URL(r.endpoint).port) <= 65535 && address(r.payer) && address(r.payTo))
  return Object.freeze({ endpoint: r.endpoint, payer: r.payer, payTo: r.payTo })
}
function metadata(value: unknown, payTo: string): Record<string, unknown> {
  const r = record(value, [], ["name", "version", "verifyingContract", "assetTransferMethod", "feeSplitter", "feeSplitterVersion"])
  if (Object.keys(r).length === 0) return {}
  check(r.assetTransferMethod === undefined || r.assetTransferMethod === "eip3009")
  if (r.name === "GatewayWalletBatched") {
    check(r.version === "1" && same(r.verifyingContract, GATEWAY) && r.feeSplitter === undefined && r.feeSplitterVersion === undefined)
  } else {
    check(r.name === "USDC" && r.version === "2" && r.verifyingContract === undefined)
    check(r.feeSplitter === undefined ? r.feeSplitterVersion === undefined :
      same(r.feeSplitter, payTo) && (r.feeSplitterVersion === 1 || r.feeSplitterVersion === 2))
  }
  // Every allowed field above has a fixed literal, bounded integer or bound address.
  return Object.fromEntries(Object.entries(r))
}
export interface SanitizedCircleHeader {
  readonly headerName: "payment-signature" | "x-payment"
  readonly signatureScrubbed: true
  readonly authenticated: false
  readonly provenance: "supplied-header-shape-only"
  readonly fixtureJson: string
}
/** Returns only non-bearer, shape-only text. No provenance, signature validity,
 * freshness, payment acceptance or client-version claim follows from sanitizing.
 * It cannot detect secrets deliberately encoded as valid public integer,
 * address or nonce fields; that is not a property of a shape sanitizer. */
export function sanitizeCircleHeader(headerName: unknown, header: unknown, expected: unknown): SanitizedCircleHeader {
  try {
    check(headerName === "payment-signature" || headerName === "x-payment")
    const context = captureContext(expected)
    check(typeof header === "string" && header.length > 0 && header.length <= 32768 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(header))
    const bytes = Buffer.from(header, "base64")
    check(bytes.length <= 16384 && bytes.toString("base64") === header)
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes), parsed = decodeHeaderJson(header)
    check(text === JSON.stringify(parsed)) // Reject duplicates, invisible bytes and ambiguous spellings.
    const raw = record(parsed, ["x402Version", "payload", "accepted"], ["resource"])
    check(raw.x402Version === 2)
    const payload = record(raw.payload, ["authorization", "signature"])
    check(typeof payload.signature === "string" && /^0x[0-9a-fA-F]{130}$/.test(payload.signature))
    const auth = record(payload.authorization, ["from", "to", "value", "validAfter", "validBefore", "nonce"])
    check(same(auth.from, context.payer) && same(auth.to, context.payTo) && auth.value === "10000" &&
      uint(auth.validAfter) && uint(auth.validBefore) && BigInt(auth.validAfter) < BigInt(auth.validBefore) &&
      typeof auth.nonce === "string" && /^0x[0-9a-fA-F]{64}$/.test(auth.nonce))
    const accepted = record(raw.accepted, ["scheme", "network", "amount", "asset", "payTo", "resource", "maxTimeoutSeconds"],
      ["description", "mimeType", "extra"])
    check(accepted.scheme === "exact" && accepted.network === "eip155:5042002" && accepted.amount === "10000" &&
      same(accepted.asset, USDC) && same(accepted.payTo, context.payTo) && accepted.resource === context.endpoint &&
      typeof accepted.maxTimeoutSeconds === "number" && Number.isSafeInteger(accepted.maxTimeoutSeconds) && accepted.maxTimeoutSeconds > 0 &&
      (accepted.description === undefined || accepted.description === description) && (accepted.mimeType === undefined || accepted.mimeType === mimeType))
    const safeAccepted = { scheme: accepted.scheme, network: accepted.network, amount: accepted.amount,
      asset: accepted.asset, payTo: accepted.payTo, resource: accepted.resource,
      maxTimeoutSeconds: accepted.maxTimeoutSeconds,
      ...(accepted.description === undefined ? {} : { description: accepted.description }),
      ...(accepted.mimeType === undefined ? {} : { mimeType: accepted.mimeType }),
      ...(Object.hasOwn(accepted, "extra") ? { extra: metadata(accepted.extra, context.payTo) } : {}) }
    let resource: Record<string, unknown> | undefined
    if (Object.hasOwn(raw, "resource")) {
      const r = record(raw.resource, ["url"], ["description", "mimeType"])
      check(r.url === context.endpoint && (r.description === undefined || r.description === description) &&
        (r.mimeType === undefined || r.mimeType === mimeType))
      resource = { url: r.url, ...(r.description === undefined ? {} : { description: r.description }),
        ...(r.mimeType === undefined ? {} : { mimeType: r.mimeType }) }
    }
    const fixture = { x402Version: 2, payload: { authorization: { from: auth.from, to: auth.to,
      value: auth.value, validAfter: auth.validAfter, validBefore: auth.validBefore, nonce: auth.nonce },
      signature: CAPTURE_DUMMY_SIGNATURE }, accepted: safeAccepted, ...(resource === undefined ? {} : { resource }) }
    const fixtureJson = JSON.stringify(fixture, null, 2) + "\n"
    check(Buffer.byteLength(fixtureJson) <= 16384)
    return Object.freeze({ headerName, signatureScrubbed: true, authenticated: false, provenance: "supplied-header-shape-only", fixtureJson })
  } catch { throw new Error(FAIL) }
}

const ARTIFACT_FAIL = "circle_capture_artifact_refused"
const digest = (text: string) => createHash("sha256").update(text).digest("hex")
interface CaptureStoreOptions {
  readonly now?: () => number
  readonly signal?: AbortSignal
  readonly afterContextSync?: (directory: string) => void
  readonly afterFixtureSync?: (directory: string) => void
  readonly afterMarkerSync?: (directory: string) => void
  readonly afterReleaseSync?: (directory: string) => void
}
function storeOptions(value: CaptureStoreOptions = {}): CaptureStoreOptions {
  const r = record(value, [], ["now", "signal", "afterContextSync", "afterFixtureSync", "afterMarkerSync", "afterReleaseSync"])
  check(r.signal === undefined || r.signal instanceof AbortSignal)
  for (const name of ["now", "afterContextSync", "afterFixtureSync", "afterMarkerSync", "afterReleaseSync"])
    check(r[name] === undefined || typeof r[name] === "function")
  return Object.freeze({ ...r }) as CaptureStoreOptions
}
function storeClock(options: CaptureStoreOptions) {
  const now = options.now ?? Date.now, started = now(); let previous = started
  check(Number.isSafeInteger(started) && started > 0 && Number.isSafeInteger(started + 5000))
  return () => {
    const time = now()
    check(!options.signal?.aborted && Number.isSafeInteger(time) && time >= previous && time < started + 5000)
    previous = time; return time
  }
}
interface CaptureDirectory { readonly dev: number; readonly ino: number }
function captureDirectory(path: string, expected?: CaptureDirectory): CaptureDirectory {
  check(typeof path === "string" && path.length <= 2048 && isAbsolute(path) && !/[\u0000-\u001f\u007f]/.test(path) && realpathSync(path) === path)
  const s = lstatSync(path)
  check(s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid?.() && (s.mode & 0o777) === 0o700 &&
    (expected === undefined || s.dev === expected.dev && s.ino === expected.ino))
  return { dev: s.dev, ino: s.ino }
}
function inventory(directory: string, identity: CaptureDirectory, expected: readonly string[]) {
  captureDirectory(directory, identity)
  const handle = opendirSync(directory, { bufferSize: 4 }), names: string[] = []
  try { for (;;) {
    const entry = handle.readSync(); if (entry === null) break
    check(entry.isFile() && names.length < expected.length); names.push(entry.name)
  } } finally { handle.closeSync() }
  check(JSON.stringify(names.sort()) === JSON.stringify([...expected].sort()))
}
function privateFile(s: Stats, max: number) {
  check(s.isFile() && s.nlink === 1 && s.uid === process.getuid?.() && (s.mode & 0o777) === 0o600 &&
    Number.isSafeInteger(s.size) && s.size >= 0 && s.size <= max)
}
function artifactText(path: string, max: number): string {
  const initial = lstatSync(path); privateFile(initial, max); check(!initial.isSymbolicLink())
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = fstatSync(fd); privateFile(before, max); check(before.dev === initial.dev && before.ino === initial.ino)
    const bytes = Buffer.alloc(before.size); let offset = 0
    while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0); offset += count }
    for (const after of [fstatSync(fd), lstatSync(path)]) {
      privateFile(after, max); check(after.dev === before.dev && after.ino === before.ino && after.size === before.size &&
        after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs)
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } finally { closeSync(fd) }
}
function artifactWrite(path: string, text: string, max: number) {
  check(Buffer.byteLength(text) <= max)
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    const bytes = Buffer.from(text); let offset = 0
    while (offset < bytes.length) { const count = writeSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0); offset += count }
    fsyncSync(fd); privateFile(fstatSync(fd), max)
  } finally { closeSync(fd) }
  check(artifactText(path, max) === text)
}
function artifactSync(directory: string, identity: CaptureDirectory) {
  captureDirectory(directory, identity)
  const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try { const s = fstatSync(fd); check(s.dev === identity.dev && s.ino === identity.ino); fsyncSync(fd) } finally { closeSync(fd) }
  captureDirectory(directory, identity)
}
export interface CircleCaptureArtifact {
  readonly directory: string
  readonly context: CircleCaptureContext
  readonly headerName: "payment-signature" | "x-payment"
  readonly fixtureJson: string
  readonly fixtureSha256: string
  readonly markerSha256: string
  readonly createdAt: number
  readonly storedAt: number
  readonly authenticated: false
  readonly provenance: "supplied-header-shape-only"
  readonly clientVersion: null
}
/** Historical local consistency only; never mints a client-version or paid proof. */
export function readCircleCaptureArtifact(directory: string, options: CaptureStoreOptions = {}): CircleCaptureArtifact {
  try {
    const clock = storeClock(storeOptions(options)); clock()
    const identity = captureDirectory(directory), names = ["context.json", "fixture.json", "marker.json"]
    inventory(directory, identity, names)
    const contextText = artifactText(join(directory, "context.json"), 4096),
      fixtureJson = artifactText(join(directory, "fixture.json"), 16384), markerText = artifactText(join(directory, "marker.json"), 4096)
    clock()
    const c = record(JSON.parse(contextText), ["format", "createdAt", "context"]), context = captureContext(c.context)
    check(c.format === "arcade-circle-capture-context-v1" && typeof c.createdAt === "number" &&
      Number.isSafeInteger(c.createdAt) && c.createdAt > 0 &&
      contextText === JSON.stringify({ format: c.format, createdAt: c.createdAt, context }) + "\n")
    const m = record(JSON.parse(markerText), ["format", "headerName", "contextHash", "fixtureHash", "storedAt", "signatureScrubbed", "authenticated", "provenance", "clientVersion"])
    check(m.format === "arcade-circle-capture-artifact-v1" && (m.headerName === "payment-signature" || m.headerName === "x-payment") &&
      m.contextHash === digest(contextText) && m.fixtureHash === digest(fixtureJson) &&
      typeof m.storedAt === "number" && Number.isSafeInteger(m.storedAt) && m.storedAt >= c.createdAt && m.storedAt <= clock() &&
      m.signatureScrubbed === true && m.authenticated === false && m.provenance === "supplied-header-shape-only" && m.clientVersion === null &&
      markerText === JSON.stringify(m) + "\n")
    const sanitized = sanitizeCircleHeader(m.headerName, Buffer.from(JSON.stringify(JSON.parse(fixtureJson))).toString("base64"), context)
    check(sanitized.fixtureJson === fixtureJson)
    for (const [name, text, max] of [["context.json", contextText, 4096], ["fixture.json", fixtureJson, 16384], ["marker.json", markerText, 4096]] as const)
      check(artifactText(join(directory, name), max) === text)
    inventory(directory, identity, names); clock()
    return Object.freeze({ directory, context, headerName: m.headerName, fixtureJson, fixtureSha256: digest(fixtureJson), markerSha256: digest(markerText),
      createdAt: c.createdAt, storedAt: m.storedAt, authenticated: false, provenance: "supplied-header-shape-only", clientVersion: null })
  } catch { throw new Error(ARTIFACT_FAIL) }
}
export interface CircleCaptureStore {
  readonly directory: string
  readonly capture: (headerName: unknown, header: unknown) => CircleCaptureArtifact
}
/** Explicit fresh private store. One attempt, no overwrite/retry/repair or raw
 * header persistence. The CLI never calls this constructor. Descriptors are
 * scoped to individual synchronous operations, not retained while awaiting input. */
export function createCircleCaptureStore(expected: unknown, options: CaptureStoreOptions = {}): CircleCaptureStore {
  try {
    const context = captureContext(expected), opts = storeOptions(options), clock = storeClock(opts), createdAt = clock()
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "arcade-circle-capture-"))); chmodSync(directory, 0o700)
    const identity = captureDirectory(directory)
    const contextText = JSON.stringify({ format: "arcade-circle-capture-context-v1", createdAt, context }) + "\n",
      claimText = JSON.stringify({ format: "arcade-circle-capture-claim-v1", contextHash: digest(contextText) }) + "\n"
    artifactWrite(join(directory, "context.json"), contextText, 4096)
    artifactWrite(join(directory, ".claim"), claimText, 4096); artifactSync(directory, identity)
    opts.afterContextSync?.(directory); clock()
    inventory(directory, identity, [".claim", "context.json"])
    check(artifactText(join(directory, "context.json"), 4096) === contextText && artifactText(join(directory, ".claim"), 4096) === claimText)
    let attempted = false
    return Object.freeze({ directory, capture(headerName: unknown, header: unknown) {
      try {
        check(!attempted); attempted = true
        const active = storeClock(opts); active()
        inventory(directory, identity, [".claim", "context.json"])
        check(artifactText(join(directory, "context.json"), 4096) === contextText && artifactText(join(directory, ".claim"), 4096) === claimText)
        const safe = sanitizeCircleHeader(headerName, header, context); active()
        artifactWrite(join(directory, "fixture.json"), safe.fixtureJson, 16384)
        opts.afterFixtureSync?.(directory); active()
        const markerText = JSON.stringify({ format: "arcade-circle-capture-artifact-v1", headerName: safe.headerName,
          contextHash: digest(contextText), fixtureHash: digest(safe.fixtureJson), storedAt: active(),
          signatureScrubbed: true, authenticated: false, provenance: "supplied-header-shape-only", clientVersion: null }) + "\n"
        artifactWrite(join(directory, "marker.json"), markerText, 4096); artifactSync(directory, identity)
        opts.afterMarkerSync?.(directory); active()
        inventory(directory, identity, [".claim", "context.json", "fixture.json", "marker.json"])
        check(artifactText(join(directory, "context.json"), 4096) === contextText && artifactText(join(directory, ".claim"), 4096) === claimText &&
          artifactText(join(directory, "fixture.json"), 16384) === safe.fixtureJson && artifactText(join(directory, "marker.json"), 4096) === markerText)
        active(); unlinkSync(join(directory, ".claim")); artifactSync(directory, identity)
        opts.afterReleaseSync?.(directory); active()
        return readCircleCaptureArtifact(directory, { now: active, ...(opts.signal === undefined ? {} : { signal: opts.signal }) })
      } catch { throw new Error(ARTIFACT_FAIL) }
    } })
  } catch { throw new Error(ARTIFACT_FAIL) }
}

export function captureHeaderMain(args: readonly string[]): number {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Offline Circle capture library. No capture listener, key, signature or artifact write is enabled by this CLI.\n")
    return 0
  }
  if (args.length !== 0) { process.stderr.write("circle_capture_arguments_invalid\n"); return 2 }
  process.stdout.write(JSON.stringify({ liveCapture: "NOT_RUN", captureEnabled: false, writes: false }) + "\n")
  return 1
}
if (import.meta.main) process.exitCode = captureHeaderMain(process.argv.slice(2))
