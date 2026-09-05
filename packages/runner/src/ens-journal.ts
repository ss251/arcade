import { constants } from "node:fs"
import { lstat, mkdir, open, rename, rmdir, unlink } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, normalize } from "node:path"
import { ensStatePath } from "./ens-state.ts"

export interface EnsJournalEntry {
  readonly chainId: 11155111; readonly signer: string; readonly op: "renew" | "price"
  readonly target: string; readonly resource: string; readonly value: string
  readonly stage: "intent" | "submitted" | "confirmed"; readonly txHash?: string
}
export interface EnsJournal {
  readonly entries: ReadonlyArray<EnsJournalEntry>
  readonly set: (entry: EnsJournalEntry) => Promise<void>
}
const LIMIT = 262_144
const failed = () => new Error("ENS journal unavailable or unsafe; reconcile retained intent/hash and lock before retrying")
const checkedPath = (path: string): string => {
  if (path.length > 2048 || !isAbsolute(path) || normalize(path) !== path || !basename(path).endsWith(".json") || /[\u0000-\u001f\u007f]/.test(path)) throw failed()
  return path
}
export const ensJournalPath = (env: Readonly<Record<string, string | undefined>> = process.env): string => {
  const path = checkedPath(env.ARCADE_ENS_JOURNAL ?? join(dirname(ensStatePath(env)), "ens-pending.json"))
  if ((env.ARCADE_ENS_STATE !== undefined || env.HOME !== undefined) && ensStatePath(env) === path) throw failed()
  return path
}
const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value) && !/^0x0{40}$/.test(value)
const hash = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{64}$/.test(value)
const uint = (value: unknown, bits: number): value is string => typeof value === "string" && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) < 1n << BigInt(bits)
const plain = (value: unknown, fields: ReadonlyArray<string>): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw failed()
  const descriptors = Object.getOwnPropertyDescriptors(value), result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !fields.includes(key) || !("value" in descriptors[key]!)) throw failed()
    result[key] = descriptors[key]!.value
  }
  return result
}
const decodeEntry = (raw: unknown): EnsJournalEntry => {
  const e = plain(raw, ["chainId", "signer", "op", "target", "resource", "value", "stage", "txHash"])
  if (e.chainId !== 11155111 || !address(e.signer) || !address(e.target) || (e.op !== "renew" && e.op !== "price") ||
    !(e.op === "renew" ? uint(e.resource, 256) && uint(e.value, 64) : hash(e.resource) && uint(e.value, 256)) ||
    !["intent", "submitted", "confirmed"].includes(String(e.stage)) ||
    (e.stage === "intent" ? e.txHash !== undefined : !hash(e.txHash))) throw failed()
  return Object.freeze({ chainId: 11155111, signer: e.signer, target: e.target, op: e.op,
    resource: e.resource as string, value: e.value as string, stage: e.stage as EnsJournalEntry["stage"], ...(e.txHash === undefined ? {} : { txHash: e.txHash as string }) })
}
const key = (e: EnsJournalEntry) => `${e.signer}:${e.op}:${e.target}:${e.resource}`
const read = async (path: string): Promise<ReadonlyArray<EnsJournalEntry>> => {
  let file: Awaited<ReturnType<typeof open>>
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch (cause) { if ((cause as { code?: string }).code === "ENOENT") return []; throw failed() }
  try {
    const info = await file.stat()
    if (!info.isFile() || info.nlink !== 1 || info.size > LIMIT || (info.mode & 0o077) !== 0) throw failed()
    const buffer = Buffer.alloc(LIMIT + 1)
    let count = 0
    while (count < buffer.length) { const next = await file.read(buffer, count, buffer.length - count, count); if (next.bytesRead === 0) break; count += next.bytesRead }
    if (count > LIMIT) throw failed()
    const document = plain(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, count))), ["format", "entries"])
    if (document.format !== "arcade-ens-journal-v1" || !Array.isArray(document.entries) || document.entries.length > 128) throw failed()
    const entries = document.entries.map(decodeEntry)
    if (new Set(entries.map(key)).size !== entries.length) throw failed()
    return Object.freeze(entries)
  } catch { throw failed() } finally { await file.close() }
}

/** One cross-process lease spans the whole write/receipt operation, not merely JSON IO.
 * A crash-owned lock is deliberately not stolen: uncertain broadcasts require reconciliation. */
export const withEnsJournal = async <T>(path: string, work: (journal: EnsJournal) => Promise<T>): Promise<T> => {
  checkedPath(path)
  const lock = `${path}.lock`
  let locked = false
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const parentInfo = await lstat(dirname(path))
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || (parentInfo.mode & 0o022) !== 0) throw failed()
    await mkdir(lock, { mode: 0o700 }); locked = true
    let entries = await read(path)
    const journal: EnsJournal = {
      get entries() { return entries },
      set: async input => {
        const entry = decodeEntry(input), old = entries.find(e => key(e) === key(entry))
        if (old) {
          if (old.stage === "intent" && (entry.value !== old.value || entry.stage === "confirmed") ||
            old.stage === "submitted" && (entry.value !== old.value || entry.stage === "intent" || entry.txHash !== old.txHash) ||
            old.stage === "confirmed" && (entry.stage === "submitted" || entry.stage === "confirmed" && (entry.value !== old.value || entry.txHash !== old.txHash))) throw failed()
        } else if (entry.stage !== "intent") throw failed()
        const next = Object.freeze([...entries.filter(e => key(e) !== key(entry)), entry])
        if (next.length > 128) throw failed()
        const bytes = `${JSON.stringify({ format: "arcade-ens-journal-v1", entries: next })}\n`
        if (Buffer.byteLength(bytes) > LIMIT) throw failed()
        const temporary = `${path}.${crypto.randomUUID()}.tmp`
        let created = false
        try {
          const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
          created = true
          try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
          await rename(temporary, path); created = false
          const parent = await open(dirname(path), constants.O_RDONLY)
          try { await parent.sync() } finally { await parent.close() }
          entries = next // memory follows both durable flushes, never precedes them
        } catch { throw failed() } finally { if (created) await unlink(temporary).catch(() => {}) }
      }
    }
    return await work(journal)
  } finally { if (locked) await rmdir(lock) }
}
