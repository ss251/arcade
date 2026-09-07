/** Fresh owned J5C evidence. No resume/overwrite path and no secret-bearing fields. */
import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { dirname, isAbsolute, normalize } from "node:path"
import { createHash } from "node:crypto"
import { captureProofEvent, DELEGATE_PROOF, nextProofStage, proofCheck, type ProofFacts, type ProofStage } from "./delegate-funding-proof.ts"

const encode = (v: unknown) => JSON.stringify(v, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value)
const hash = (s: string) => createHash("sha256").update(s).digest("hex")
export interface DelegateProofJournal {
  append(stage: ProofStage, facts?: ProofFacts): Promise<void>
  close(): Promise<void>
}
export async function openDelegateProofJournal(path: string): Promise<DelegateProofJournal> {
  proofCheck(typeof path === "string" && path.length <= 2048 && isAbsolute(path) && normalize(path) === path &&
    path.endsWith(".jsonl") && !/[\u0000-\u001f\u007f]/.test(path))
  proofCheck(typeof process.getuid === "function")
  const uid = process.getuid(), parent = dirname(path), directoryStat = await lstat(parent)
  proofCheck(directoryStat.isDirectory() && !directoryStat.isSymbolicLink() && directoryStat.uid === uid &&
    (directoryStat.mode & 0o777) === 0o700 && await realpath(parent) === parent)
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  let closed = false, busy = false, poisoned = false, previous: ProofStage | undefined, previousHash = "0".repeat(64), sequence = 0, size = 0
  const checkFile = async () => {
    const actual = await file.stat()
    proofCheck(actual.isFile() && actual.uid === uid && actual.nlink === 1 && (actual.mode & 0o777) === 0o600 && actual.size === size)
    const atPath = await lstat(path)
    proofCheck(atPath.dev === actual.dev && atPath.ino === actual.ino && !atPath.isSymbolicLink())
  }
  const write = async (text: string) => {
    const bytes = Buffer.from(text)
    proofCheck(bytes.byteLength <= 16384 && size + bytes.byteLength <= 65536)
    await checkFile()
    let offset = 0
    while (offset < bytes.byteLength) {
      const n = await file.write(bytes, offset, bytes.byteLength - offset, size + offset)
      proofCheck(n.bytesWritten > 0); offset += n.bytesWritten
    }
    size += bytes.byteLength
    await file.sync(); await checkFile()
  }
  try {
    const header = encode({ format: "arcade-delegate-proof-v1", terms: DELEGATE_PROOF })
    await write(header + "\n")
    previousHash = hash(header)
    const parentFile = await open(parent, constants.O_RDONLY | constants.O_NOFOLLOW)
    try { const st = await parentFile.stat(); proofCheck(st.dev === directoryStat.dev && st.ino === directoryStat.ino); await parentFile.sync() }
    finally { await parentFile.close() }
  } catch (error) { await file.close().catch(() => {}); throw error }
  return Object.freeze({
    async append(stage: ProofStage, facts: ProofFacts = {}) {
      proofCheck(!closed && !busy && !poisoned && sequence < 16)
      busy = true
      try {
        nextProofStage(previous, stage)
        const event = captureProofEvent(stage, facts), body = encode({ sequence, previousHash, event })
        const nextHash = hash(body)
        await write(encode({ sequence, previousHash, event, hash: nextHash }) + "\n")
        previousHash = nextHash; previous = stage; sequence++
      } catch (error) { poisoned = true; throw error }
      finally { busy = false }
    },
    async close() {
      proofCheck(!busy)
      if (!closed) { closed = true; await file.close() }
    }
  })
}
