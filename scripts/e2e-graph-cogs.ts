/**
 * G15 offline budget boundary. CLI is read-only; writer is an offline library.
 * No payer import, transport, recovery switch or live mode.
 * Reservations are potential exposure, never proof of a signature or payment.
 */
import { createHash, randomBytes } from "node:crypto"
import { constants, openSync, closeSync, lstatSync, fstatSync, readSync, realpathSync,
  mkdirSync, opendirSync, writeSync, fsyncSync, unlinkSync, type Stats } from "node:fs"
import { dirname, isAbsolute, normalize, join } from "node:path"

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
function readPrivateBudgetText(path: string): string {
  let fd: number | undefined
  try {
    insist(typeof path === "string" && path.length <= 2048 && isAbsolute(path) && normalize(path) === path &&
      !/[\u0000-\u001f\u007f]/.test(path) && typeof process.getuid === "function")
    const uid = process.getuid(), parent = dirname(path), directory = lstatSync(parent), before = lstatSync(path)
    insist(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === uid &&
      (directory.mode & 0o777) === 0o700 && realpathSync(parent) === parent)
    const validFile = (st: typeof before) => st.isFile() && !st.isSymbolicLink() && st.uid === uid &&
      st.nlink === 1 && (st.mode & 0o777) === 0o600 && st.size > 0 && st.size <= MAX_BYTES
    insist(validFile(before))
    // NONBLOCK prevents a concurrent FIFO substitution from hanging before fstat.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const opened = fstatSync(fd)
    insist(validFile(opened) && opened.ino === before.ino && opened.dev === before.dev &&
      opened.size === before.size && opened.mtimeMs === before.mtimeMs && opened.ctimeMs === before.ctimeMs)
    const bytes = Buffer.alloc(MAX_BYTES + 1)
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
      (dirAfter.mode & 0o777) === 0o700 && realpathSync(parent) === parent)
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))
    insist(Buffer.from(text).equals(bytes.subarray(0, length)))
    closeSync(fd); fd = undefined
    return text
  } catch { throw new Error(STATE_FAIL) }
  finally { if (fd !== undefined) try { closeSync(fd) } catch { /* already refused */ } }
}
export function readGraphReservations(path: string): GraphReservationSummary {
  insist(typeof path === "string" && path.endsWith(".jsonl"))
  return decodeGraphReservations(readPrivateBudgetText(path))
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
function writeBytes(fd: number, text: string, position: number) {
  const bytes = Buffer.from(text)
  insist(bytes.length > 0 && position + bytes.length <= MAX_BYTES)
  let n = 0
  while (n < bytes.length) {
    const written = writeSync(fd, bytes, n, bytes.length - n, position + n)
    insist(written > 0); n += written
  }
  fsyncSync(fd)
}
function freshBudgetFile(path: string, text: string) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    const st = fstatSync(fd)
    insist(st.isFile() && st.nlink === 1 && st.uid === process.getuid!() && (st.mode & 0o777) === 0o600 && st.size === 0)
    writeBytes(fd, text, 0)
    const after = fstatSync(fd), atPath = lstatSync(path)
    insist(after.size === Buffer.byteLength(text) && atPath.ino === after.ino && atPath.dev === after.dev && !atPath.isSymbolicLink())
  } finally { closeSync(fd) }
  insist(readPrivateBudgetText(path) === text)
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
    insist(st.ino === pinned.ino && st.dev === pinned.dev && readPrivateBudgetText(path) === text)
  }
  return { check, release() { check(); unlinkSync(path); syncDirectory(directory, identity) } }
}
const headName = (n: number) => "head-" + String(n).padStart(2, "0") + ".json"
const headText = (text: string, reservations: number) => JSON.stringify({
  format: "arcade-graph-head-v1", policyHash: GRAPH_COGS_POLICY_HASH, reservations, journalHash: hash(text),
}) + "\n"
function writerState(directory: string) {
  const text = readPrivateBudgetText(join(directory, "reservations.jsonl"))
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
    insist(readPrivateBudgetText(join(directory, headName(i))) === headText(prefix, i))
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
          claim.check(); insist(readPrivateBudgetText(path) === nextText)
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

export function graphCogsMain(args: readonly string[]): number {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Read-only Graph reservation audit. No live calls, keys, writes or nested gates.\nUsage: e2e-graph-cogs.sh [--audit-reservations /absolute/private/reservations.jsonl]\n")
    return 0
  }
  if (args.length === 0) {
    process.stdout.write(JSON.stringify({ liveEvidence: "NOT_RUN", liveEnabled: false, state: "not_checked",
      remaining: ["fixed-owner-root", "receipt-reconciler", "balance-rpc", "response-recorder", "validated-cache", "live-authority-review"] }) + "\n")
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
