/**
 * G15A offline budget boundary. No writer, payer import, transport or live mode.
 * Reservations are potential exposure, never proof of a signature or payment.
 */
import { createHash } from "node:crypto"
import { constants, openSync, closeSync, lstatSync, fstatSync, readSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, normalize } from "node:path"

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
  const names = Object.keys(value)
  insist(names.length === fields.length && names.every((name, i) => name === fields[i]))
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

/** Explicit read-only inspection path, NOT the eventual fixed live authority
 * namespace. No creation, chmod, recovery, cache refresh or missing-state reset. */
export function readGraphReservations(path: string): GraphReservationSummary {
  let fd: number | undefined
  try {
    insist(typeof path === "string" && path.length <= 2048 && isAbsolute(path) && normalize(path) === path &&
      path.endsWith(".jsonl") && !/[\u0000-\u001f\u007f]/.test(path) && typeof process.getuid === "function")
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
    const result = decodeGraphReservations(text)
    closeSync(fd); fd = undefined
    return result
  } catch { throw new Error(STATE_FAIL) }
  finally { if (fd !== undefined) try { closeSync(fd) } catch { /* already refused */ } }
}

export function graphCogsMain(args: readonly string[]): number {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Read-only Graph reservation audit. No live calls, keys, writes or nested gates.\nUsage: e2e-graph-cogs.sh [--audit-reservations /absolute/private/reservations.jsonl]\n")
    return 0
  }
  if (args.length === 0) {
    process.stdout.write(JSON.stringify({ liveEvidence: "NOT_RUN", liveEnabled: false, state: "not_checked",
      remaining: ["durable-writer", "balance-rpc", "response-recorder", "validated-cache", "live-authority-review"] }) + "\n")
    return 1
  }
  if (args.length !== 2 || args[0] !== "--audit-reservations" || !args[1]?.startsWith("/")) {
    process.stderr.write("graph_cogs_arguments_invalid\n"); return 2
  }
  try {
    const summary = readGraphReservations(args[1])
    process.stdout.write(JSON.stringify({ liveEvidence: "NOT_RUN", state: "validated", ...summary }) + "\n")
    return 1 // Valid local records do not pass the G15 live-evidence gate.
  } catch { process.stderr.write(STATE_FAIL + "\n"); return 1 }
}
if (import.meta.main) process.exitCode = graphCogsMain(process.argv.slice(2))
