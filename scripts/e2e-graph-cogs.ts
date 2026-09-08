/**
 * G15 offline budget boundary. CLI is read-only; writer is an offline library.
 * No payer import, transport, recovery switch or live mode.
 * Reservations are potential exposure, never proof of a signature or payment.
 */
import { createHash, randomBytes } from "node:crypto"
import { constants, openSync, closeSync, lstatSync, fstatSync, readSync, realpathSync,
  mkdirSync, opendirSync, writeSync, fsyncSync, unlinkSync, type Stats } from "node:fs"
import { dirname, isAbsolute, normalize, join, resolve } from "node:path"
import { encodeGraphQuery, GATEWAY_BASE, validateGraphChallengeHeader, readGraphSettlementHeader, readGraphPaidBody, readGraphRpcBody, verifyGraphReceiptEvidence, type QueryArgs, type GraphResponseObservation, type GraphPaymentIntent, type PaidResult } from "../skills/counterparty-graph/graph-client.ts"
import { graphQueryIds } from "../skills/counterparty-graph/run.ts"
import { copyPlainData, plainObject } from "../skills/counterparty-graph/validate-output.ts"

export const GRAPH_COGS_POLICY = Object.freeze({
  namespace: "arcade-graph-cogs-2026-09-v1",
  payer: "0x776d8acf230a371676e637199943aa6e00b7adca",
  chain: "eip155:8453",
  token: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  merchant: "0x79dc34e41b2b591078d3de222c43ecaabd52fccb",
  subject: "0x79dc34e41b2b591078d3de222c43ecaabd52fccb",
  subgraph: "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb",
  queryCostAtomic: "10000",
  totalLimit: 10,
  evidenceLimit: 5,
  floorAtomic: "900000",
  liveEnabled: false,
} as const)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
export const GRAPH_COGS_POLICY_HASH = hash(JSON.stringify(GRAPH_COGS_POLICY))
const MAX_BYTES = 32768
const HEADER = JSON.stringify({ format: "arcade-graph-reservations-v1", policyHash: GRAPH_COGS_POLICY_HASH })
const HASH = /^[a-f0-9]{64}$/
const STATE_FAIL = "graph_cogs_state_invalid"
function insist(value: unknown): asserts value { if (!value) throw new Error(STATE_FAIL) }
function shape(value: unknown, fields: readonly string[]): asserts value is Record<string, unknown> {
  insist(value !== null && typeof value === "object" && !Array.isArray(value))
  insist(Object.getPrototypeOf(value) === Object.prototype)
  const names = Reflect.ownKeys(value)
  insist(names.length === fields.length && names.every((name, i) => name === fields[i]))
  for (const name of names) insist("value" in Object.getOwnPropertyDescriptor(value, name)!)
}
export interface GraphReservationSummary {
  readonly reservations: number
  readonly evidence: number
  readonly video: number
  readonly reservedAtomic: string
  readonly unresolved: number
  readonly lastHash: string
  readonly liveEnabled: false
  readonly paymentProof: "not_checked"
}
/** Canonical bytes reject duplicate keys, torn tails, extra fields and schema drift.
 * Hashes detect accidental alteration, not malicious rewriting by the file owner. */
export function decodeGraphReservations(text: string): GraphReservationSummary {
  try {
    insist(typeof text === "string" && Buffer.byteLength(text) <= MAX_BYTES && text.endsWith("\n"))
    const rows = text.slice(0, -1).split("\n")
    insist(rows.length >= 1 && rows.length <= GRAPH_COGS_POLICY.totalLimit + 1 && rows[0] === HEADER)
    let previousHash = hash(HEADER), evidence = 0, video = 0
    const queries = new Set<string>()
    for (let i = 1; i < rows.length; i++) {
      const line = rows[i]!, row: unknown = JSON.parse(line)
      shape(row, ["sequence", "previousHash", "allocation", "queryHash", "amountAtomic", "hash"])
      insist(JSON.stringify(row) === line && row.sequence === i && row.previousHash === previousHash)
      insist(row.allocation === "evidence" || row.allocation === "video")
      insist(typeof row.queryHash === "string" && HASH.test(row.queryHash) && !queries.has(row.queryHash))
      insist(row.amountAtomic === GRAPH_COGS_POLICY.queryCostAtomic && typeof row.hash === "string" && HASH.test(row.hash))
      const body = { sequence: row.sequence, previousHash: row.previousHash, allocation: row.allocation,
        queryHash: row.queryHash, amountAtomic: row.amountAtomic }
      insist(hash(JSON.stringify(body)) === row.hash)
      if (row.allocation === "evidence") evidence++; else video++
      insist(evidence <= GRAPH_COGS_POLICY.evidenceLimit)
      previousHash = row.hash; queries.add(row.queryHash)
    }
    const reservations = evidence + video
    return Object.freeze({ reservations, evidence, video,
      reservedAtomic: (BigInt(reservations) * BigInt(GRAPH_COGS_POLICY.queryCostAtomic)).toString(),
      unresolved: reservations, lastHash: previousHash, liveEnabled: false, paymentProof: "not_checked" })
  } catch { throw new Error(STATE_FAIL) }
}

/** Pure arithmetic only. Does not obtain, authenticate or establish freshness of
 * an RPC balance, protect against unrelated spending, or authorize a paid call. */
export function checkGraphBalance(balanceAtomic: string) {
  const floor = BigInt(GRAPH_COGS_POLICY.floorAtomic)
  const minimum = floor + BigInt(GRAPH_COGS_POLICY.queryCostAtomic)
  if (typeof balanceAtomic !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(balanceAtomic) ||
      BigInt(balanceAtomic) >= (1n << 256n) || BigInt(balanceAtomic) < minimum) {
    throw new Error("graph_cogs_balance_refused")
  }
  return Object.freeze({ balanceAtomic, minimumBeforeAtomic: minimum.toString(), floorAtomic: floor.toString() })
}

export const GRAPH_COGS_RPC = "https://mainnet.base.org"
export type GraphBalanceTransport = (url: string, init: RequestInit) => Promise<Response>
export interface GraphBalanceObservation {
  readonly chain: "eip155:8453"
  readonly payer: string
  readonly token: string
  readonly balanceAtomic: string
  readonly blockNumber: string
  readonly blockHash: string
  readonly blockTimestamp: number
  readonly observedAt: number
  readonly responseHashes: readonly string[]
}
/** Four bounded reads from one RPC, never a payment or independent consensus
 * proof. No default transport: CLI/import cannot accidentally access mainnet. */
export async function readGraphBalance(transport: GraphBalanceTransport, options: {
  readonly signal?: AbortSignal
  readonly now?: () => number
  readonly timeoutMs?: number
} = {}): Promise<GraphBalanceObservation> {
  const controller = new AbortController(), abort = () => controller.abort()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    insist(typeof transport === "function")
    const now = options.now ?? Date.now, timeout = options.timeoutMs ?? 5000
    insist(typeof now === "function" && Number.isSafeInteger(timeout) && timeout >= 1 && timeout <= 5000)
    const started = now(), deadline = started + timeout
    insist(Number.isSafeInteger(started) && started > 0 && Number.isSafeInteger(deadline))
    const active = () => {
      const current = now()
      insist(!controller.signal.aborted && !options.signal?.aborted && Number.isSafeInteger(current) &&
        current >= started && current < deadline)
      return current
    }
    active()
    options.signal?.addEventListener("abort", abort, { once: true })
    timer = setTimeout(abort, timeout)
    const until = async <T>(pending: Promise<T>): Promise<T> => {
      void pending.catch(() => {}) // An abort can predate installing the race.
      active()
      let cancel: (() => void) | undefined
      try {
        const stopped = new Promise<never>((_, reject) => {
          cancel = () => reject(new Error("aborted")); controller.signal.addEventListener("abort", cancel, { once: true })
        })
        const result = await Promise.race([pending, stopped]); active(); return result
      } finally { if (cancel) controller.signal.removeEventListener("abort", cancel) }
    }
    const responseHashes: string[] = []
    let sequence = 0
    const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
      active(); insist(++sequence <= 4)
      const id = sequence
      const pending = Promise.resolve().then(() => {
        active()
        return transport(GRAPH_COGS_RPC, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          headers: { "content-type": "application/json", "accept-encoding": "identity" },
          redirect: "error", credentials: "omit", signal: controller.signal })
      })
      // A noncooperative test/provider may resolve after the caller's deadline.
      // Cancel its body; never follow it with another request.
      void pending.then(response => {
        if (controller.signal.aborted) void response.body?.cancel().catch(() => {})
      }, () => {}).catch(() => {})
      let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      try {
        response = await until(pending)
        insist(response.status === 200 && !response.redirected && (!response.url || response.url === GRAPH_COGS_RPC))
        insist(response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() === "application/json")
        const encoding = response.headers.get("content-encoding"), length = response.headers.get("content-length")
        insist(encoding === null || encoding.toLowerCase() === "identity")
        insist(length === null || /^(0|[1-9][0-9]{0,5})$/.test(length) && Number(length) <= 131072)
        reader = response.body?.getReader(); insist(reader)
        const parts: Uint8Array[] = []; let size = 0, chunks = 0
        for (;;) {
          const next = await until(reader.read())
          if (next.done) break
          insist(++chunks <= 256)
          size += next.value.byteLength; insist(size <= 131072)
          parts.push(next.value)
        }
        insist(length === null || size === Number(length))
        const bytes = Buffer.concat(parts), text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        // Prevent silent BOM stripping from changing the hashed observation.
        insist(Buffer.from(text).equals(bytes))
        const envelope: unknown = JSON.parse(text)
        insist(envelope !== null && typeof envelope === "object" && !Array.isArray(envelope))
        const row = envelope as Record<string, unknown>, names = Object.keys(row)
        insist(names.length === 3 && names.every(name => ["jsonrpc", "id", "result"].includes(name)) &&
          row.jsonrpc === "2.0" && row.id === id && Object.hasOwn(row, "result"))
        responseHashes.push(hash(text)); return row.result
      } finally {
        if (reader) void reader.cancel().catch(() => {})
        else void response?.body?.cancel().catch(() => {})
      }
    }
    const captureBlock = (value: unknown) => {
      insist(value !== null && typeof value === "object" && !Array.isArray(value))
      const block = value as Record<string, unknown>, quantity = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/
      insist(typeof block.number === "string" && quantity.test(block.number) && BigInt(block.number) > 0n &&
        typeof block.hash === "string" && /^0x[0-9a-f]{64}$/.test(block.hash) && !/^0x0{64}$/.test(block.hash) &&
        typeof block.timestamp === "string" && quantity.test(block.timestamp) && BigInt(block.timestamp) <= BigInt(Number.MAX_SAFE_INTEGER))
      const timestamp = Number(BigInt(block.timestamp))
      insist(Math.abs(Math.floor(now() / 1000) - timestamp) <= 30)
      return { number: block.number, hash: block.hash, timestamp }
    }
    insist(await rpc("eth_chainId", []) === "0x2105")
    const block = captureBlock(await rpc("eth_getBlockByNumber", ["latest", false]))
    const data = "0x70a08231" + GRAPH_COGS_POLICY.payer.slice(2).padStart(64, "0")
    const rawBalance = await rpc("eth_call", [{ to: GRAPH_COGS_POLICY.token, data }, block.number])
    insist(typeof rawBalance === "string" && /^0x[0-9a-fA-F]{64}$/.test(rawBalance))
    const repeated = captureBlock(await rpc("eth_getBlockByNumber", [block.number, false]))
    insist(repeated.number === block.number && repeated.hash === block.hash && repeated.timestamp === block.timestamp)
    const finishedAt = active()
    return Object.freeze({ chain: GRAPH_COGS_POLICY.chain, payer: GRAPH_COGS_POLICY.payer, token: GRAPH_COGS_POLICY.token,
      balanceAtomic: BigInt(rawBalance).toString(), blockNumber: BigInt(block.number).toString(), blockHash: block.hash,
      blockTimestamp: block.timestamp, observedAt: finishedAt, responseHashes: Object.freeze(responseHashes) })
  } catch { throw new Error("graph_cogs_balance_unavailable") }
  finally { controller.abort(); if (timer !== undefined) clearTimeout(timer); options.signal?.removeEventListener("abort", abort) }
}

/** Explicit read-only inspection path, NOT the eventual fixed live authority
 * namespace. No creation, chmod, recovery, cache refresh or missing-state reset. */
function readBudgetText(path: string, privateFile = true, maxBytes = MAX_BYTES): string {
  let fd: number | undefined
  try {
    insist(typeof path === "string" && path.length <= 2048 && isAbsolute(path) && normalize(path) === path &&
      !/[\u0000-\u001f\u007f]/.test(path) && typeof process.getuid === "function")
    insist(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 2 * 1024 * 1024)
    const uid = process.getuid(), parent = dirname(path), directory = lstatSync(parent), before = lstatSync(path)
    insist(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === uid &&
      (!privateFile || (directory.mode & 0o777) === 0o700) && realpathSync(parent) === parent)
    const validFile = (st: typeof before) => st.isFile() && !st.isSymbolicLink() && st.uid === uid &&
      st.nlink === 1 && (!privateFile || (st.mode & 0o777) === 0o600) && st.size > 0 && st.size <= maxBytes
    insist(validFile(before))
    // NONBLOCK prevents a concurrent FIFO substitution from hanging before fstat.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const opened = fstatSync(fd)
    insist(validFile(opened) && opened.ino === before.ino && opened.dev === before.dev &&
      opened.size === before.size && opened.mtimeMs === before.mtimeMs && opened.ctimeMs === before.ctimeMs)
    const bytes = Buffer.alloc(maxBytes + 1)
    let length = 0
    while (length < bytes.length) {
      const n = readSync(fd, bytes, length, bytes.length - length, length)
      if (n === 0) break
      length += n
    }
    const after = fstatSync(fd), atPath = lstatSync(path), dirAfter = lstatSync(parent)
    insist(validFile(after) && length === opened.size && after.size === opened.size &&
      after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs)
    insist(validFile(atPath) && atPath.ino === opened.ino && atPath.dev === opened.dev &&
      atPath.size === opened.size && atPath.mtimeMs === opened.mtimeMs && atPath.ctimeMs === opened.ctimeMs)
    insist(dirAfter.ino === directory.ino && dirAfter.dev === directory.dev &&
      dirAfter.isDirectory() && !dirAfter.isSymbolicLink() && dirAfter.uid === uid &&
      (!privateFile || (dirAfter.mode & 0o777) === 0o700) && realpathSync(parent) === parent)
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))
    insist(Buffer.from(text).equals(bytes.subarray(0, length)))
    closeSync(fd); fd = undefined
    return text
  } catch { throw new Error(STATE_FAIL) }
  finally { if (fd !== undefined) try { closeSync(fd) } catch { /* already refused */ } }
}
export function readGraphReservations(path: string): GraphReservationSummary {
  insist(typeof path === "string" && path.endsWith(".jsonl"))
  return decodeGraphReservations(readBudgetText(path))
}

export const GRAPH_COGS_SOURCE_FILES = Object.freeze([
  "bun.lock", "scripts/e2e-graph-cogs.ts", "skills/counterparty-graph/arcade.json",
  "skills/counterparty-graph/graph-client.ts", "skills/counterparty-graph/queries/attestations.graphql",
  "skills/counterparty-graph/queries/identities.graphql", "skills/counterparty-graph/run.ts",
  "skills/counterparty-graph/synthesize.ts", "skills/counterparty-graph/validate-output.ts",
] as const)
export interface GraphSourceManifest {
  readonly format: "arcade-graph-sources-v1"
  readonly files: readonly Readonly<{ path: string; sha256: string }>[]
  readonly sourceHash: string
}
export interface GraphQueryBinding {
  readonly format: "arcade-graph-query-binding-v1"
  readonly policyHash: string
  readonly sourceHash: string
  readonly endpoint: string
  readonly payer: string
  readonly token: string
  readonly merchant: string
  readonly amountAtomic: string
  readonly kind: "identities" | "attestations"
  readonly body: string
  readonly bodySha256: string
  readonly parentQueryHash: string | null
  readonly blockHash: string | null
  readonly queryHash: string
}
const sourceRoots = new WeakMap<GraphSourceManifest, string>()
const bindings = new WeakMap<GraphQueryBinding, string>()
function sourceFiles(root: string) {
  insist(typeof root === "string" && isAbsolute(root) && normalize(root) === root &&
    root.length <= 1800 && realpathSync(root) === root && lstatSync(root).isDirectory())
  return GRAPH_COGS_SOURCE_FILES.map(path => Object.freeze({ path,
    sha256: hash(readBudgetText(join(root, path), false,
      path === "bun.lock" ? 2 * 1024 * 1024 : path.endsWith(".graphql") ? 8192 : 262144)),
  }))
}
/** Disk provenance only, not runtime-code attestation or spending authority.
 * Explicit root is a local fixture seam; the CLI has no source-root override. */
export function readGraphSourceManifest(root = resolve(import.meta.dir, "..")): GraphSourceManifest {
  try {
    const files = sourceFiles(root)
    insist(JSON.stringify(files) === JSON.stringify(sourceFiles(root)))
    const manifest: GraphSourceManifest = Object.freeze({ format: "arcade-graph-sources-v1",
      files: Object.freeze(files), sourceHash: hash(JSON.stringify(files)) })
    sourceRoots.set(manifest, root); return manifest
  } catch { throw new Error("graph_cogs_binding_refused") }
}
/** Stable request/cache-key ingredient. Parent/block are declarations, NOT a
 * paid receipt or reconciler; binding never clears an unresolved reservation. */
export function bindGraphQuery(args: QueryArgs, sources: GraphSourceManifest, parent?: unknown): GraphQueryBinding {
  try {
    const root = sourceRoots.get(sources)
    insist(root !== undefined && hash(JSON.stringify(sourceFiles(root))) === sources.sourceHash)
    const body = encodeGraphQuery(args), decoded = JSON.parse(body) as { query: string; variables: Record<string, unknown> }
    const kind: GraphQueryBinding["kind"] = Object.hasOwn(decoded.variables, "address") ? "identities" : "attestations"
    const querySource = sources.files.find(file => file.path === `skills/counterparty-graph/queries/${kind}.graphql`)
    insist(querySource?.sha256 === hash(decoded.query))
    let parentQueryHash: string | null = null, blockHash: string | null = null
    if (kind === "identities") insist(parent === undefined && decoded.variables.address === GRAPH_COGS_POLICY.subject)
    else {
      shape(parent, ["binding", "blockHash"])
      const previous = parent.binding as GraphQueryBinding
      insist(bindings.has(previous) && previous.kind === "identities" && previous.sourceHash === sources.sourceHash &&
        previous.policyHash === GRAPH_COGS_POLICY_HASH && typeof parent.blockHash === "string" &&
        /^0x[0-9a-f]{64}$/.test(parent.blockHash) && !/^0x0{64}$/.test(parent.blockHash))
      const declared = decoded.variables.block as { hash: string }
      insist(declared.hash === parent.blockHash)
      parentQueryHash = previous.queryHash; blockHash = parent.blockHash
    }
    // Re-read after encoding: changing a query/source during capture refuses.
    insist(hash(JSON.stringify(sourceFiles(root))) === sources.sourceHash)
    const value = { format: "arcade-graph-query-binding-v1" as const, policyHash: GRAPH_COGS_POLICY_HASH,
      sourceHash: sources.sourceHash, endpoint: GATEWAY_BASE + GRAPH_COGS_POLICY.subgraph,
      payer: GRAPH_COGS_POLICY.payer, token: GRAPH_COGS_POLICY.token, merchant: GRAPH_COGS_POLICY.merchant,
      amountAtomic: GRAPH_COGS_POLICY.queryCostAtomic, kind, body, bodySha256: hash(body), parentQueryHash, blockHash }
    const binding: GraphQueryBinding = Object.freeze({ ...value, queryHash: hash(JSON.stringify(value)) })
    bindings.set(binding, root); return binding
  } catch { throw new Error("graph_cogs_binding_refused") }
}

type DirectoryIdentity = Stats
const WRITER_FAIL = "graph_cogs_writer_refused"
function privateDirectory(path: string): DirectoryIdentity {
  insist(typeof path === "string" && path.length <= 1900 && isAbsolute(path) && normalize(path) === path &&
    !/[\u0000-\u001f\u007f]/.test(path) && typeof process.getuid === "function")
  const st = lstatSync(path)
  insist(st.isDirectory() && !st.isSymbolicLink() && st.uid === process.getuid() &&
    (st.mode & 0o777) === 0o700 && realpathSync(path) === path)
  return st
}
function sameDirectory(path: string, expected: DirectoryIdentity) {
  const current = privateDirectory(path)
  insist(current.ino === expected.ino && current.dev === expected.dev)
}
function syncDirectory(path: string, expected: DirectoryIdentity) {
  sameDirectory(path, expected)
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    const st = fstatSync(fd); insist(st.ino === expected.ino && st.dev === expected.dev)
    fsyncSync(fd); sameDirectory(path, expected)
  } finally { closeSync(fd) }
}
function writeBytes(fd: number, text: string, position: number, maximum = MAX_BYTES) {
  const bytes = Buffer.from(text)
  insist(Number.isSafeInteger(maximum) && maximum > 0 && maximum <= 2 * 1024 * 1024 &&
    bytes.length > 0 && position >= 0 && position + bytes.length <= maximum)
  let n = 0
  while (n < bytes.length) {
    const written = writeSync(fd, bytes, n, bytes.length - n, position + n)
    insist(written > 0); n += written
  }
  fsyncSync(fd)
}
function freshBudgetFile(path: string, text: string, maximum = MAX_BYTES) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    const st = fstatSync(fd)
    insist(st.isFile() && st.nlink === 1 && st.uid === process.getuid!() && (st.mode & 0o777) === 0o600 && st.size === 0)
    writeBytes(fd, text, 0, maximum)
    const after = fstatSync(fd), atPath = lstatSync(path)
    insist(after.size === Buffer.byteLength(text) && atPath.ino === after.ino && atPath.dev === after.dev && !atPath.isSymbolicLink())
  } finally { closeSync(fd) }
  insist(readBudgetText(path, true, maximum) === text)
}
function ownClaim(directory: string, identity: DirectoryIdentity) {
  sameDirectory(directory, identity)
  const path = join(directory, ".claim")
  const text = JSON.stringify({ policyHash: GRAPH_COGS_POLICY_HASH, claimId: randomBytes(32).toString("hex") }) + "\n"
  freshBudgetFile(path, text); syncDirectory(directory, identity)
  const pinned = lstatSync(path)
  const check = () => {
    sameDirectory(directory, identity)
    const st = lstatSync(path)
    insist(st.ino === pinned.ino && st.dev === pinned.dev && readBudgetText(path) === text)
  }
  return { check, release() { check(); unlinkSync(path); syncDirectory(directory, identity) } }
}
const headName = (n: number) => "head-" + String(n).padStart(2, "0") + ".json"
const headText = (text: string, reservations: number) => JSON.stringify({
  format: "arcade-graph-head-v1", policyHash: GRAPH_COGS_POLICY_HASH, reservations, journalHash: hash(text),
}) + "\n"
function writerState(directory: string) {
  const text = readBudgetText(join(directory, "reservations.jsonl"))
  const summary = decodeGraphReservations(text), expected = [".claim", "reservations.jsonl",
    ...Array.from({ length: summary.reservations + 1 }, (_, i) => headName(i))].sort()
  const handle = opendirSync(directory, { bufferSize: 16 }), names: string[] = []
  try {
    for (;;) {
      const entry = handle.readSync(); if (entry === null) break
      insist(names.length < 13 && entry.isFile()); names.push(entry.name)
    }
  } finally { handle.closeSync() }
  insist(JSON.stringify(names.sort()) === JSON.stringify(expected))
  const lines = text.trimEnd().split("\n")
  for (let i = 0; i <= summary.reservations; i++) {
    const prefix = lines.slice(0, i + 1).join("\n") + "\n"
    insist(readBudgetText(join(directory, headName(i))) === headText(prefix, i))
  }
  return { text, summary }
}

/** Explicit offline/library initialization only. Existing namespaces are never
 * reused or repaired. A future live consumer must bind one fixed owner root,
 * NOT accept a disposable run directory or the CLI audit path as authority. */
export function initializeGraphReservationState(parent: string): string {
  try {
    const parentIdentity = privateDirectory(parent), directory = join(parent, GRAPH_COGS_POLICY.namespace)
    mkdirSync(directory, { mode: 0o700 })
    const identity = privateDirectory(directory)
    syncDirectory(parent, parentIdentity)
    const claim = ownClaim(directory, identity)
    freshBudgetFile(join(directory, "reservations.jsonl"), HEADER + "\n")
    syncDirectory(directory, identity)
    freshBudgetFile(join(directory, headName(0)), headText(HEADER + "\n", 0))
    syncDirectory(directory, identity); claim.check(); writerState(directory)
    claim.release(); return directory
  } catch { throw new Error(WRITER_FAIL) } // Retain any partial state for inspection.
}
export interface GraphWriterHooks {
  /** Test-only interruption seam after journal fsync, before the head receipt.
   * Throwing never acknowledges, reclaims or rolls back the reservation. */
  readonly afterJournalSync: () => void
}
export interface GraphReservationWriter {
  readonly snapshot: () => GraphReservationSummary
  readonly reserve: (input: unknown) => GraphReservationSummary
  readonly close: () => void
}
/** Cooperating-process claim, not a malicious-filesystem or power-loss sandbox.
 * No key or transport can be invoked by this writer. One unresolved reservation
 * blocks all later writes; receipt reconciliation is deliberately absent. */
export function openGraphReservationWriter(parent: string, hooks?: GraphWriterHooks): GraphReservationWriter {
  try {
    privateDirectory(parent)
    const directory = join(parent, GRAPH_COGS_POLICY.namespace), identity = privateDirectory(directory)
    let afterJournalSync: (() => void) | undefined
    if (hooks !== undefined) {
      shape(hooks, ["afterJournalSync"]); insist(typeof hooks.afterJournalSync === "function")
      afterJournalSync = hooks.afterJournalSync as () => void
    }
    const claim = ownClaim(directory, identity)
    let state = writerState(directory), closed = false, poisoned = false, busy = false
    const current = () => {
      try {
        insist(!closed && !poisoned && !busy); claim.check()
        const disk = writerState(directory); insist(disk.text === state.text); return disk
      } catch { poisoned = true; throw new Error(WRITER_FAIL) }
    }
    return Object.freeze({
      snapshot() {
        try { return current().summary } catch { poisoned = true; throw new Error(WRITER_FAIL) }
      },
      reserve(input: unknown) {
        if (busy) { poisoned = true; throw new Error(WRITER_FAIL) }
        let mutation = false, ownsBusy = false
        try {
          // Validate/capture before mutation, without executing getters/toJSON.
          shape(input, ["allocation", "queryHash", "balanceAtomic"])
          insist(input.allocation === "evidence" || input.allocation === "video")
          insist(typeof input.queryHash === "string" && HASH.test(input.queryHash))
          insist(typeof input.balanceAtomic === "string"); checkGraphBalance(input.balanceAtomic)
          const allocation = input.allocation, queryHash = input.queryHash, observed = current()
          insist(observed.summary.unresolved === 0 && observed.summary.reservations < GRAPH_COGS_POLICY.totalLimit &&
            (allocation !== "evidence" || observed.summary.evidence < GRAPH_COGS_POLICY.evidenceLimit))
          const body = { sequence: observed.summary.reservations + 1, previousHash: observed.summary.lastHash,
            allocation, queryHash, amountAtomic: GRAPH_COGS_POLICY.queryCostAtomic }
          const line = JSON.stringify({ ...body, hash: hash(JSON.stringify(body)) }) + "\n", nextText = observed.text + line
          const next = decodeGraphReservations(nextText)
          busy = true; ownsBusy = true; claim.check()
          const path = join(directory, "reservations.jsonl"), before = lstatSync(path)
          const fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK)
          try {
            const pinned = fstatSync(fd)
            insist(pinned.isFile() && pinned.nlink === 1 && pinned.uid === process.getuid!() && (pinned.mode & 0o777) === 0o600 &&
              pinned.ino === before.ino && pinned.dev === before.dev && pinned.size === Buffer.byteLength(observed.text))
            mutation = true; writeBytes(fd, line, pinned.size)
          } finally { closeSync(fd) }
          claim.check(); insist(readBudgetText(path) === nextText)
          afterJournalSync?.()
          insist(!poisoned && !closed && busy); claim.check()
          freshBudgetFile(join(directory, headName(next.reservations)), headText(nextText, next.reservations))
          syncDirectory(directory, identity)
          const persisted = writerState(directory); insist(persisted.text === nextText); claim.check()
          state = persisted
          return persisted.summary
        } catch { if (mutation) poisoned = true; throw new Error(WRITER_FAIL) }
        finally { if (ownsBusy) busy = false }
      },
      close() {
        if (closed) { if (poisoned) throw new Error(WRITER_FAIL); return }
        if (busy) { poisoned = true; throw new Error(WRITER_FAIL) }
        try {
          insist(!poisoned); current(); claim.release(); closed = true
        } catch { poisoned = true; closed = true; throw new Error(WRITER_FAIL) }
      },
    })
  } catch { throw new Error(WRITER_FAIL) } // Never remove another process's claim.
}

const CAPTURE_FAIL = "graph_cogs_capture_refused"
const CAPTURE_FILE_BYTES = 2 * 1024 * 1024, CAPTURE_TOTAL_BYTES = 16 * 1024 * 1024
const captureName = (sequence: number) => "response-" + String(sequence).padStart(2, "0") + ".json"
function captureObservation(input: unknown, binding: GraphQueryBinding): GraphResponseObservation {
  shape(input, ["phase", "requestUrl", "requestBodySha256", "responseUrl", "redirected", "status", "complete", "headers", "bodyBase64", "bodySha256"])
  insist(input.phase === "challenge" || input.phase === "paid" || input.phase === "rpc")
  insist(input.requestUrl === (input.phase === "rpc" ? GRAPH_COGS_RPC : binding.endpoint) &&
    typeof input.requestBodySha256 === "string" && HASH.test(input.requestBodySha256) &&
    (input.phase === "rpc" || input.requestBodySha256 === binding.bodySha256))
  insist(input.responseUrl === "" || input.responseUrl === input.requestUrl)
  insist(typeof input.redirected === "boolean" && Number.isSafeInteger(input.status) &&
    Number(input.status) >= 100 && Number(input.status) <= 599 && input.complete === true)
  const names = ["content-type", "content-length", "content-encoding", "payment-required", "payment-response"] as const
  shape(input.headers, names)
  let headerBytes = 0
  const headers = {} as Record<typeof names[number], string | null>
  for (const name of names) {
    const value = input.headers[name]
    insist(value === null || typeof value === "string" && Buffer.byteLength(value) <= 16384)
    headerBytes += value === null ? 0 : Buffer.byteLength(value)
    headers[name] = value
  }
  insist(headerBytes <= 32768 && typeof input.bodyBase64 === "string" && input.bodyBase64.length <= 1398104)
  const bytes = Buffer.from(input.bodyBase64, "base64")
  insist(bytes.length <= 1048576 && bytes.toString("base64") === input.bodyBase64 &&
    typeof input.bodySha256 === "string" && createHash("sha256").update(bytes).digest("hex") === input.bodySha256)
  return Object.freeze({ phase: input.phase, requestUrl: String(input.requestUrl), requestBodySha256: input.requestBodySha256,
    responseUrl: String(input.responseUrl), redirected: input.redirected, status: Number(input.status), complete: true,
    headers: Object.freeze(headers), bodyBase64: input.bodyBase64, bodySha256: input.bodySha256 })
}
export interface GraphCaptureSummary {
  readonly responses: number
  readonly paidResponses: number
  readonly storedBytes: number
  readonly lastHash: string
  readonly receiptProof: "not_checked"
}
export interface GraphResponseRecorder {
  readonly observe: (observation: GraphResponseObservation, signal: AbortSignal) => Promise<void>
  readonly beforePaidRequest: (intent: GraphPaymentIntent, signal: AbortSignal) => Promise<void>
  readonly snapshot: () => GraphCaptureSummary
  readonly close: () => void
}
export interface GraphForwardCapture {
  readonly responsesBefore: number
  readonly responsePrefixHash: string
  readonly observedAt: number
  readonly intent: GraphPaymentIntent
  readonly hash: string
}
/** Declared intent validation only; hashes are not an independent signature or
 * forwarding proof. Historical validation uses the captured time, not now. */
function captureForwardIntent(input: unknown, binding: GraphQueryBinding, observedAt: number): GraphPaymentIntent {
  shape(input, ["endpoint", "network", "primaryType", "domain", "authorization", "authorizationSha256", "requestBodySha256", "paymentHeaderSha256"])
  insist(input.endpoint === binding.endpoint && input.network === GRAPH_COGS_POLICY.chain && input.primaryType === "TransferWithAuthorization" &&
    input.requestBodySha256 === binding.bodySha256 && typeof input.paymentHeaderSha256 === "string" &&
    HASH.test(input.paymentHeaderSha256) && input.paymentHeaderSha256 !== "0".repeat(64))
  shape(input.domain, ["name", "version", "chainId", "verifyingContract"])
  insist(input.domain.name === "USD Coin" && input.domain.version === "2" && input.domain.chainId === 8453 && input.domain.verifyingContract === binding.token)
  shape(input.authorization, ["from", "to", "value", "validAfter", "validBefore", "nonce"])
  const auth = input.authorization
  insist(auth.from === binding.payer && auth.to === binding.merchant && auth.value === binding.amountAtomic && auth.validAfter === "0" &&
    typeof auth.validBefore === "string" && /^(0|[1-9][0-9]{0,77})$/.test(auth.validBefore) &&
    typeof auth.nonce === "string" && /^0x[a-f0-9]{64}$/.test(auth.nonce) && !/^0x0{64}$/.test(auth.nonce) &&
    Number.isSafeInteger(observedAt) && observedAt > 0)
  // An original <=300s authorization may have aged since signing; this storage
  // check does not replace the unchanged signer's295..300s admission rule.
  const second = BigInt(Math.floor(observedAt / 1000)), until = BigInt(auth.validBefore)
  insist(until > second && until <= second + 300n)
  const domain = Object.freeze({ name: "USD Coin" as const, version: "2" as const, chainId: 8453 as const, verifyingContract: binding.token })
  const authorization = Object.freeze({ from: binding.payer, to: binding.merchant, value: binding.amountAtomic,
    validAfter: "0", validBefore: auth.validBefore, nonce: auth.nonce })
  const primaryType = "TransferWithAuthorization" as const
  insist(input.authorizationSha256 === hash(JSON.stringify({ domain, primaryType, authorization })))
  return Object.freeze({ endpoint: binding.endpoint, network: GRAPH_COGS_POLICY.chain, primaryType, domain, authorization,
    authorizationSha256: String(input.authorizationSha256), requestBodySha256: binding.bodySha256, paymentHeaderSha256: input.paymentHeaderSha256 })
}
/** Private offline capture only, not verified results or a live budget namespace.
 * All evidence survives close. A failed/late acknowledgement retains the claim;
 * there is deliberately no reopen, repair, takeover or cache-hit operation.
 * Sync IO cannot be preempted; time/signal checks gate its acknowledgement. */
export function createGraphResponseRecorder(parent: string, binding: GraphQueryBinding, options: {
  readonly now?: () => number
  /** Test-only crash/re-entry seam after exclusive record file sync. */
  readonly afterRecordSync?: () => void
  readonly afterForwardSync?: () => void
} = {}): GraphResponseRecorder {
  try {
    const now = options.now ?? Date.now, afterSync = options.afterRecordSync, afterForward = options.afterForwardSync
    insist(typeof now === "function" && (afterSync === undefined || typeof afterSync === "function") &&
      (afterForward === undefined || typeof afterForward === "function"))
    const createdAt = now(); insist(Number.isSafeInteger(createdAt) && createdAt > 0)
    const root = bindings.get(binding); insist(root !== undefined)
    const sourceCurrent = () => insist(hash(JSON.stringify(sourceFiles(root))) === binding.sourceHash)
    sourceCurrent()
    const parentIdentity = privateDirectory(parent), directory = join(parent, "query-" + binding.queryHash)
    mkdirSync(directory, { mode: 0o700 }); const identity = privateDirectory(directory)
    syncDirectory(parent, parentIdentity)
    const claim = ownClaim(directory, identity)
    const manifest = JSON.stringify({ format: "arcade-graph-capture-v1", policyHash: GRAPH_COGS_POLICY_HASH,
      queryHash: binding.queryHash, binding, createdAt }) + "\n"
    freshBudgetFile(join(directory, "intent.json"), manifest); syncDirectory(directory, identity)
    const records: { digest: string; bytes: number }[] = []
    let forward: { text: string; value: GraphForwardCapture } | undefined
    let lastHash = hash(manifest), storedBytes = 0, paid = 0, challenge = false,
      closed = false, poisoned = false, busy = false, lastTime = createdAt
    const clock = (signal?: AbortSignal, deadline?: number) => {
      const value = now()
      insist(!signal?.aborted && Number.isSafeInteger(value) && value >= lastTime &&
        (deadline === undefined || value < deadline))
      lastTime = value; return value
    }
    const disk = () => {
      claim.check(); sourceCurrent()
      insist(readBudgetText(join(directory, "intent.json")) === manifest)
      const expected = [".claim", "intent.json", ...(forward ? ["forward.json"] : []), ...records.map((_, i) => captureName(i + 1))].sort()
      const handle = opendirSync(directory, { bufferSize: 16 }), names: string[] = []
      try {
        for (;;) {
          const entry = handle.readSync(); if (entry === null) break
          insist(names.length < 35 && entry.isFile()); names.push(entry.name)
        }
      } finally { handle.closeSync() }
      insist(JSON.stringify(names.sort()) === JSON.stringify(expected))
      if (forward) insist(readBudgetText(join(directory, "forward.json")) === forward.text)
      records.forEach((record, i) => {
        const text = readBudgetText(join(directory, captureName(i + 1)), true, CAPTURE_FILE_BYTES)
        insist(Buffer.byteLength(text) === record.bytes && hash(text) === record.digest)
      })
      claim.check()
    }
    const summary = (): GraphCaptureSummary => Object.freeze({ responses: records.length, paidResponses: paid,
      storedBytes, lastHash, receiptProof: "not_checked" })
    disk(); clock(undefined, createdAt + 5000)
    return Object.freeze({
      async observe(input: GraphResponseObservation, signal: AbortSignal) {
        if (busy) { poisoned = true; throw new Error(CAPTURE_FAIL) }
        busy = true
        try {
          insist(!closed && !poisoned && signal instanceof AbortSignal)
          const started = clock(signal), deadline = started + 5000; insist(Number.isSafeInteger(deadline))
          disk(); clock(signal, deadline)
          const observation = captureObservation(input, binding)
          insist(records.length < 32 && (observation.phase === "challenge" ? !challenge && records.length === 0 : challenge) &&
            (observation.phase !== "paid" || paid === 0))
          if (forward && paid === 0) insist(observation.phase === "paid" && records.length === forward.value.responsesBefore)
          const body = { format: "arcade-graph-response-v1", policyHash: GRAPH_COGS_POLICY_HASH,
            queryHash: binding.queryHash, sequence: records.length + 1, previousHash: lastHash,
            capturedAt: clock(signal, deadline), observation }
          const digest = hash(JSON.stringify(body)), text = JSON.stringify({ ...body, hash: digest }) + "\n"
          const bytes = Buffer.byteLength(text)
          insist(bytes <= CAPTURE_FILE_BYTES && storedBytes + bytes <= CAPTURE_TOTAL_BYTES)
          clock(signal, deadline); claim.check()
          freshBudgetFile(join(directory, captureName(records.length + 1)), text, CAPTURE_FILE_BYTES)
          afterSync?.()
          insist(!closed && !poisoned && busy); clock(signal, deadline); claim.check()
          syncDirectory(directory, identity)
          records.push({ digest: hash(text), bytes }); lastHash = digest; storedBytes += bytes
          if (observation.phase === "challenge") challenge = true
          if (observation.phase === "paid") paid++
          disk(); clock(signal, deadline)
        } catch { poisoned = true; throw new Error(CAPTURE_FAIL) }
        finally { busy = false }
      },
      async beforePaidRequest(input: GraphPaymentIntent, signal: AbortSignal) {
        if (busy) { poisoned = true; throw new Error(CAPTURE_FAIL) }
        busy = true
        try {
          insist(!closed && !poisoned && signal instanceof AbortSignal && !forward && challenge && paid === 0 && records.length === 3)
          const started = clock(signal), deadline = started + 5000; insist(Number.isSafeInteger(deadline))
          disk(); clock(signal, deadline)
          // Exactly the initial challenge and two client RPC observations. Their
          // actual RPC meaning remains a later evidence-verifier responsibility.
          for (const sequence of [2, 3]) {
            const row = JSON.parse(readBudgetText(join(directory, captureName(sequence)), true, CAPTURE_FILE_BYTES))
            insist(row.observation.phase === "rpc")
          }
          const observedAt = clock(signal, deadline), intent = captureForwardIntent(input, binding, observedAt)
          const body = { format: "arcade-graph-forward-intent-v1", policyHash: GRAPH_COGS_POLICY_HASH, queryHash: binding.queryHash,
            responsesBefore: records.length, responsePrefixHash: lastHash, observedAt, intent }
          const digest = hash(JSON.stringify(body)), text = JSON.stringify({ ...body, hash: digest }) + "\n"
          clock(signal, deadline); claim.check(); freshBudgetFile(join(directory, "forward.json"), text)
          afterForward?.()
          insist(!closed && !poisoned && busy); clock(signal, deadline); claim.check()
          syncDirectory(directory, identity)
          forward = { text, value: Object.freeze({ responsesBefore: records.length, responsePrefixHash: lastHash, observedAt, intent, hash: digest }) }
          disk(); clock(signal, deadline)
        } catch { poisoned = true; throw new Error(CAPTURE_FAIL) }
        finally { busy = false }
      },
      snapshot() {
        try {
          insist(!closed && !poisoned && !busy); const started = clock()
          disk(); clock(undefined, started + 5000); return summary()
        } catch { poisoned = true; throw new Error(CAPTURE_FAIL) }
      },
      close() {
        if (closed) { if (poisoned) throw new Error(CAPTURE_FAIL); return }
        if (busy) { poisoned = true; throw new Error(CAPTURE_FAIL) }
        try {
          insist(!poisoned); const started = clock(); disk(); clock(undefined, started + 5000)
          claim.release(); closed = true
        } catch { poisoned = true; closed = true; throw new Error(CAPTURE_FAIL) }
      },
    })
  } catch { throw new Error(CAPTURE_FAIL) }
}

export interface GraphCapturedRecord {
  readonly sequence: number
  readonly capturedAt: number
  readonly previousHash: string
  readonly hash: string
  readonly observation: GraphResponseObservation
}
export interface GraphCaptureReadback {
  readonly queryHash: string
  readonly sourceHash: string
  readonly createdAt: number
  readonly claimPresent: boolean
  readonly forwardIntent: GraphForwardCapture | null
  readonly records: readonly GraphCapturedRecord[]
  readonly summary: GraphCaptureSummary
}
/** Private read-only snapshot, never receipt/cache authority. Claim absence is
 * not proof of acknowledged close; a retained claim is not repaired or removed.
 * Double reads detect cooperative concurrent changes, not a malicious owner. */
export function readGraphResponseCapture(parent: string, binding: GraphQueryBinding, options: {
  readonly now?: () => number
} = {}): GraphCaptureReadback {
  try {
    const now = options.now ?? Date.now; insist(typeof now === "function")
    const started = now(); insist(Number.isSafeInteger(started) && started > 0 && Number.isSafeInteger(started + 5000))
    let lastTime = started
    const active = () => {
      const time = now(); insist(Number.isSafeInteger(time) && time >= lastTime && time < started + 5000)
      lastTime = time
    }
    const root = bindings.get(binding); insist(root !== undefined)
    const sourceCurrent = () => insist(hash(JSON.stringify(sourceFiles(root))) === binding.sourceHash)
    sourceCurrent(); privateDirectory(parent)
    const directory = join(parent, "query-" + binding.queryHash), identity = privateDirectory(directory)
    const inventory = () => {
      active(); sameDirectory(directory, identity)
      const handle = opendirSync(directory, { bufferSize: 16 }), names: string[] = []
      try {
        for (;;) {
          const entry = handle.readSync(); if (entry === null) break
          insist(names.length < 35 && entry.isFile()); names.push(entry.name)
        }
      } finally { handle.closeSync() }
      return names.sort()
    }
    const names = inventory(), claimPresent = names.includes(".claim"), forwardPresent = names.includes("forward.json")
    const count = names.length - (claimPresent ? 2 : 1) - (forwardPresent ? 1 : 0)
    insist(count >= 0 && count <= 32 && JSON.stringify(names) === JSON.stringify([
      ...(claimPresent ? [".claim"] : []), ...(forwardPresent ? ["forward.json"] : []), "intent.json", ...Array.from({ length: count }, (_, i) => captureName(i + 1)),
    ].sort()))
    const pins: { name: string; digest: string; bytes: number; maximum: number }[] = []
    const read = (name: string, maximum = MAX_BYTES) => {
      active(); const text = readBudgetText(join(directory, name), true, maximum); active()
      pins.push({ name, digest: hash(text), bytes: Buffer.byteLength(text), maximum }); return text
    }
    const manifestText = read("intent.json"), manifest: unknown = JSON.parse(manifestText)
    shape(manifest, ["format", "policyHash", "queryHash", "binding", "createdAt"])
    insist(manifest.format === "arcade-graph-capture-v1" && manifest.policyHash === GRAPH_COGS_POLICY_HASH &&
      manifest.queryHash === binding.queryHash && JSON.stringify(manifest.binding) === JSON.stringify(binding) &&
      JSON.stringify(manifest) + "\n" === manifestText && Number.isSafeInteger(manifest.createdAt) &&
      Number(manifest.createdAt) > 0 && Number(manifest.createdAt) <= started)
    const createdAt = Number(manifest.createdAt)
    if (claimPresent) {
      const text = read(".claim"), claim: unknown = JSON.parse(text)
      shape(claim, ["policyHash", "claimId"])
      insist(claim.policyHash === GRAPH_COGS_POLICY_HASH && typeof claim.claimId === "string" &&
        HASH.test(claim.claimId) && JSON.stringify(claim) + "\n" === text)
    }
    const records: GraphCapturedRecord[] = []
    let lastHash = hash(manifestText), storedBytes = 0, paid = 0, previousTime = createdAt
    for (let sequence = 1; sequence <= count; sequence++) {
      const text = read(captureName(sequence), CAPTURE_FILE_BYTES), row: unknown = JSON.parse(text)
      storedBytes += Buffer.byteLength(text); insist(storedBytes <= CAPTURE_TOTAL_BYTES)
      shape(row, ["format", "policyHash", "queryHash", "sequence", "previousHash", "capturedAt", "observation", "hash"])
      insist(row.format === "arcade-graph-response-v1" && row.policyHash === GRAPH_COGS_POLICY_HASH &&
        row.queryHash === binding.queryHash && row.sequence === sequence && row.previousHash === lastHash &&
        Number.isSafeInteger(row.capturedAt) && Number(row.capturedAt) >= previousTime && Number(row.capturedAt) <= started &&
        typeof row.hash === "string" && HASH.test(row.hash) && JSON.stringify(row) + "\n" === text)
      const observation = captureObservation(row.observation, binding), capturedAt = Number(row.capturedAt)
      insist(sequence === 1 ? observation.phase === "challenge" : observation.phase !== "challenge")
      if (observation.phase === "paid") insist(++paid <= 1)
      const body = { format: row.format, policyHash: row.policyHash, queryHash: row.queryHash,
        sequence, previousHash: lastHash, capturedAt, observation }
      insist(hash(JSON.stringify(body)) === row.hash)
      records.push(Object.freeze({ sequence, capturedAt, previousHash: lastHash, hash: row.hash, observation }))
      previousTime = capturedAt; lastHash = row.hash
    }
    let forwardIntent: GraphForwardCapture | null = null
    if (forwardPresent) {
      const text = read("forward.json"), row: unknown = JSON.parse(text)
      shape(row, ["format", "policyHash", "queryHash", "responsesBefore", "responsePrefixHash", "observedAt", "intent", "hash"])
      insist(row.format === "arcade-graph-forward-intent-v1" && row.policyHash === GRAPH_COGS_POLICY_HASH && row.queryHash === binding.queryHash &&
        row.responsesBefore === 3 && records.length >= 3 && records[1]!.observation.phase === "rpc" && records[2]!.observation.phase === "rpc" &&
        row.responsePrefixHash === records[2]!.hash && Number.isSafeInteger(row.observedAt) &&
        Number(row.observedAt) >= records[2]!.capturedAt && Number(row.observedAt) <= started &&
        typeof row.hash === "string" && HASH.test(row.hash) && JSON.stringify(row) + "\n" === text)
      if (records.length > 3) insist(records[3]!.observation.phase === "paid" && records[3]!.capturedAt >= Number(row.observedAt))
      const observedAt = Number(row.observedAt), intent = captureForwardIntent(row.intent, binding, observedAt)
      const body = { format: row.format, policyHash: row.policyHash, queryHash: row.queryHash,
        responsesBefore: 3, responsePrefixHash: records[2]!.hash, observedAt, intent }
      insist(hash(JSON.stringify(body)) === row.hash)
      forwardIntent = Object.freeze({ responsesBefore: 3, responsePrefixHash: records[2]!.hash, observedAt, intent, hash: row.hash })
    }
    for (const pin of pins) {
      active(); const text = readBudgetText(join(directory, pin.name), true, pin.maximum); active()
      insist(hash(text) === pin.digest && Buffer.byteLength(text) === pin.bytes)
    }
    insist(JSON.stringify(inventory()) === JSON.stringify(names)); sourceCurrent(); active()
    return Object.freeze({ queryHash: binding.queryHash, sourceHash: binding.sourceHash, createdAt, claimPresent, forwardIntent,
      records: Object.freeze(records), summary: Object.freeze({ responses: count, paidResponses: paid,
        storedBytes, lastHash, receiptProof: "not_checked" }) })
  } catch { throw new Error(CAPTURE_FAIL) }
}

const QUERY_PROOF_FAIL = "graph_cogs_query_evidence_refused"
export interface GraphQueryEvidence {
  readonly evidence: "retained-protocol-consistency"
  readonly queryHash: string
  readonly sourceHash: string
  readonly captureHash: string
  readonly forwardHash: string
  readonly createdAt: number
  readonly capturedAt: number
  readonly firstRpcId: number
  readonly lastRpcId: number
  readonly nonce: string
  readonly receiptBlockNumber: string
  readonly receiptBlockHash: string
  readonly result: PaidResult
  readonly hash: string
}
const queryEvidenceOrigins = new WeakMap<GraphQueryEvidence, { binding: GraphQueryBinding; directory: string }>()
function frozenData(input: unknown): Record<string, unknown> {
  const copy = copyPlainData(input); insist(plainObject(copy))
  const freeze = (value: unknown): void => {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child)
      Object.freeze(value)
    }
  }
  freeze(copy); return copy
}
/** Read-only retained protocol consistency, NOT authenticated acquisition or
 * cache/global-budget authority. No key, RPC, write, retry or automatic repair.
 * Current-source binding remains mandatory; historical versions need a separate
 * qualified replay path. A supplied coherent synthetic capture can pass. */
export function verifyGraphCapturedQuery(directory: string, binding: GraphQueryBinding, options: {
  readonly parent?: GraphQueryEvidence
  readonly now?: () => number
} = {}): GraphQueryEvidence {
  try {
    const clock = options.now ?? Date.now, started = clock(); let previous = started
    insist(typeof clock === "function" && Number.isSafeInteger(started) && started > 0 && Number.isSafeInteger(started + 5000))
    const now = () => {
      const time = clock(); insist(Number.isSafeInteger(time) && time >= previous && time < started + 5000)
      previous = time; return time
    }
    const capture = readGraphResponseCapture(directory, binding, { now })
    const forward = capture.forwardIntent, rows = capture.records
    insist(forward !== null && rows.length >= 7 && capture.summary.paidResponses === 1)
    let prior: GraphQueryEvidence | undefined
    if (binding.kind === "identities") insist(options.parent === undefined && binding.parentQueryHash === null)
    else {
      const origin = options.parent === undefined ? undefined : queryEvidenceOrigins.get(options.parent)
      insist(origin !== undefined && origin.binding.kind === "identities" && origin.binding.queryHash === binding.parentQueryHash &&
        origin.binding.sourceHash === binding.sourceHash && bindings.get(origin.binding) === bindings.get(binding))
      prior = verifyGraphCapturedQuery(origin.directory, origin.binding, { now })
      insist(prior.hash === options.parent!.hash && prior.capturedAt <= capture.createdAt)
      const ids = graphQueryIds(prior.result.data, GRAPH_COGS_POLICY.subject), request: unknown = JSON.parse(binding.body)
      insist(ids !== null && ids.length > 0 && plainObject(request) && plainObject(request.variables))
      const meta = prior.result.data._meta
      insist(plainObject(meta) && plainObject(meta.block) && typeof meta.block.hash === "string" &&
        meta.block.hash.toLowerCase() === binding.blockHash &&
        JSON.stringify(request.variables.agentIds) === JSON.stringify(ids))
      insist(forward.intent.authorization.nonce !== prior.nonce)
    }
    const bytes = (row: GraphCapturedRecord, phase: GraphResponseObservation["phase"], status: number, maximum = 1048576) => {
      now(); const obs = row.observation
      insist(obs.phase === phase && obs.status === status && !obs.redirected &&
        (obs.responseUrl === "" || obs.responseUrl === obs.requestUrl))
      const body = Buffer.from(obs.bodyBase64, "base64"), encoding = obs.headers["content-encoding"], length = obs.headers["content-length"]
      insist(body.length <= maximum && (encoding === null || encoding.toLowerCase() === "identity") &&
        (length === null || /^(0|[1-9][0-9]*)$/.test(length) && Number(length) === body.length))
      return body
    }
    bytes(rows[0]!, "challenge", 402, 65536)
    validateGraphChallengeHeader(rows[0]!.observation.headers["payment-required"])
    const initialRpcBytes = bytes(rows[1]!, "rpc", 200)
    const initialRpc: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(initialRpcBytes))
    insist(plainObject(initialRpc) && Number.isSafeInteger(initialRpc.id))
    const firstRpcId = Number(initialRpc.id)
    insist(firstRpcId === 1 || prior !== undefined && firstRpcId === prior.lastRpcId + 1)
    // Continuation uses the same factory deadline; partial-cache/new factory starts at1.
    const factoryStart = firstRpcId === 1 ? capture.createdAt : prior!.createdAt
    insist(rows.at(-1)!.capturedAt - factoryStart < 80000)
    let id = firstRpcId, index = 1
    const rpc = (method: string, params: unknown[]) => {
      insist(index < rows.length)
      const row = rows[index++]!, body = bytes(row, "rpc", 200)
      const request = JSON.stringify({ jsonrpc: "2.0", id, method, params })
      insist(row.observation.requestBodySha256 === hash(request))
      return readGraphRpcBody(body, id++)
    }
    insist(rpc("eth_chainId", []) === "0x2105")
    const block = rpc("eth_getBlockByNumber", ["latest", false])
    insist(plainObject(block) && typeof block.timestamp === "string" && /^0x(?:0|[1-9a-f][\da-f]{0,63})$/.test(block.timestamp) &&
      BigInt(block.timestamp) <= BigInt(Number.MAX_SAFE_INTEGER) &&
      Math.abs(Number(BigInt(block.timestamp)) - Math.floor(forward.observedAt / 1000)) <= 30)
    insist(index === 3)
    const paid = rows[index++]!, paidBytes = bytes(paid, "paid", 200)
    const tx = readGraphSettlementHeader(paid.observation.headers["payment-response"], binding.payer)
    insist(prior === undefined || tx !== prior.result.paymentTx)
    insist(rpc("eth_chainId", []) === "0x2105")
    let receipt: unknown = null
    do { receipt = rpc("eth_getTransactionReceipt", [tx]) } while (receipt === null)
    insist(plainObject(receipt))
    const receiptBlock = rpc("eth_getBlockByNumber", [receipt.blockNumber, false])
    const proof = verifyGraphReceiptEvidence({ payer: binding.payer, transaction: tx, nonce: forward.intent.authorization.nonce, receipt, block: receiptBlock })
    insist(index === rows.length) // No hidden trailing calls or second paid response.
    const data = frozenData(readGraphPaidBody(paidBytes))
    const result = Object.freeze({ data, paymentTx: tx, costAtomic: GRAPH_COGS_POLICY.queryCostAtomic })
    const body = { evidence: "retained-protocol-consistency" as const, queryHash: binding.queryHash, sourceHash: binding.sourceHash,
      captureHash: capture.summary.lastHash, forwardHash: forward.hash, createdAt: capture.createdAt, capturedAt: rows.at(-1)!.capturedAt,
      firstRpcId, lastRpcId: id - 1, nonce: proof.nonce, receiptBlockNumber: proof.blockNumber, receiptBlockHash: proof.blockHash, result }
    insist(hash(JSON.stringify(sourceFiles(bindings.get(binding)!))) === binding.sourceHash)
    now()
    const evidence = Object.freeze({ ...body, hash: hash(JSON.stringify(body)) })
    queryEvidenceOrigins.set(evidence, { binding, directory }); return evidence
  } catch { throw new Error(QUERY_PROOF_FAIL) }
}

export function graphCogsMain(args: readonly string[]): number {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Read-only Graph reservation audit. No live calls, keys, writes or nested gates.\nUsage: e2e-graph-cogs.sh [--audit-reservations /absolute/private/reservations.jsonl]\n")
    return 0
  }
  if (args.length === 0) {
    process.stdout.write(JSON.stringify({ liveEvidence: "NOT_RUN", liveEnabled: false, state: "not_checked",
      remaining: ["fixed-owner-root", "receipt-reconciler", "balance-rpc-integration", "response-recorder-integration", "validated-cache", "live-authority-review"] }) + "\n")
    return 1
  }
  if (args.length !== 2 || args[0] !== "--audit-reservations" || !args[1]?.startsWith("/")) {
    process.stderr.write("graph_cogs_arguments_invalid\n"); return 2
  }
  try {
    const summary = readGraphReservations(args[1])
    process.stdout.write(JSON.stringify({ liveEvidence: "NOT_RUN", state: "validated", durableState: "not_checked", ...summary }) + "\n")
    return 1 // Valid local records do not pass the G15 live-evidence gate.
  } catch { process.stderr.write(STATE_FAIL + "\n"); return 1 }
}
if (import.meta.main) process.exitCode = graphCogsMain(process.argv.slice(2))
