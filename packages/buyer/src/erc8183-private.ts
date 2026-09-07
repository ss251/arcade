/** Owner-controlled private command storage. No keys, files or network on import. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type Stats } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { createHash } from "node:crypto"
import { privateKeyToAccount } from "viem/accounts"
import { loadChainConfig } from "@arcade/core"
import { captureEscrowIdentity, type EscrowIdentity } from "../../payments/src/erc8183-reader.ts"
import { escrowAddress, escrowCheck, escrowRecord, escrowSeconds, escrowUint } from "../../payments/src/erc8183-codec.ts"
import type { EscrowPurchaseConfig } from "./erc8183-sdk.ts"
import type { SkillResult } from "./index.ts"
type Env = Readonly<Record<string, string | undefined>>
export interface EscrowBuyerBoot {
  readonly identity: EscrowIdentity; readonly buyer: `0x${string}`; readonly gasBudgetWei: bigint
  readonly expiresInSeconds: number; readonly operationTimeoutMs: number; readonly configPath: string; readonly journalPath: string
}
const originals = new WeakMap<EscrowBuyerBoot, string>()
const fail = () => Error("escrow_buyer_configuration_refused")
const existing = (file: string) => {
  try { return lstatSync(file) } catch (e) { if ((e as { code?: string }).code === "ENOENT") return undefined; throw e }
}
const fileStat = (s: Stats) => escrowCheck(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.uid === process.getuid!() && (s.mode & 0o777) === 0o600)
const privatePath = (value: unknown, suffix: string): string => {
  escrowCheck(typeof value === "string" && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value) &&
    isAbsolute(value) && resolve(value) === value && value.endsWith(suffix) && realpathSync(dirname(value)) === dirname(value))
  const parent = lstatSync(dirname(value))
  escrowCheck(parent.isDirectory() && parent.uid === process.getuid!() && (parent.mode & 0o777) === 0o700)
  return value
}
const checkJournal = (file: string) => {
  privatePath(file, ".sqlite"); const stat = existing(file); if (stat) fileStat(stat)
  for (const suffix of ["-wal", "-shm", "-journal"]) escrowCheck(existing(file + suffix) === undefined)
}
function configFile(file: string) {
  privatePath(file, ".json"); const before = lstatSync(file); fileStat(before)
  escrowCheck(before.size > 0 && before.size <= 32768)
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd); fileStat(stat)
    escrowCheck(stat.dev === before.dev && stat.ino === before.ino && stat.size === before.size && stat.mtimeMs === before.mtimeMs && stat.ctimeMs === before.ctimeMs)
    const bytes = Buffer.alloc(32769), length = readSync(fd, bytes, 0, bytes.length, 0), after = fstatSync(fd), current = lstatSync(file)
    fileStat(after); fileStat(current)
    escrowCheck(length === stat.size && after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ctimeMs === stat.ctimeMs &&
      current.dev === stat.dev && current.ino === stat.ino && current.size === stat.size && current.mtimeMs === stat.mtimeMs && current.ctimeMs === stat.ctimeMs)
    privatePath(file, ".json"); const data = bytes.subarray(0, length)
    return { raw: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as unknown,
      digest: createHash("sha256").update(data).digest("hex") }
  } finally { closeSync(fd) }
}
/** Read-only and keyless. Neither a quote nor a model argument can select these paths. */
export function readEscrowBuyerBoot(env: Env): EscrowBuyerBoot | undefined {
  try {
    const config = env["ARCADE_BUYER_ESCROW_CONFIG"], journal = env["ARCADE_BUYER_ESCROW_JOURNAL"]
    escrowCheck(Object.keys(env).filter(k => k.startsWith("ARCADE_BUYER_ESCROW_")).every(k =>
      k === "ARCADE_BUYER_ESCROW_CONFIG" || k === "ARCADE_BUYER_ESCROW_JOURNAL"))
    if (config === undefined && journal === undefined) return undefined
    escrowCheck(env["ARCADE_NETWORK"] === undefined || env["ARCADE_NETWORK"] === "arc-testnet")
    const chain = loadChainConfig("arc-testnet")
    escrowCheck(chain.status === "ready" && chain.chainId === 5042002)
    const configPath = privatePath(config, ".json"), journalPath = privatePath(journal, ".sqlite")
    escrowCheck(configPath !== journalPath); checkJournal(journalPath)
    const file = configFile(configPath), raw = escrowRecord(file.raw, ["identity", "buyer", "gasBudgetWei", "expiresInSeconds", "operationTimeoutMs"]),
      identity = captureEscrowIdentity(raw.identity), buyer = escrowAddress(raw.buyer)
    escrowCheck(buyer !== identity.evaluator && typeof raw.gasBudgetWei === "string" && /^[1-9][0-9]{0,77}$/.test(raw.gasBudgetWei))
    const gasBudgetWei = escrowUint(BigInt(raw.gasBudgetWei)), expiresInSeconds = escrowSeconds(raw.expiresInSeconds), timeout = raw.operationTimeoutMs
    escrowCheck(gasBudgetWei > 0n && expiresInSeconds >= 601 && typeof timeout === "number" && Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 300000)
    const boot = Object.freeze({ identity, buyer, gasBudgetWei, expiresInSeconds, operationTimeoutMs: timeout, configPath, journalPath })
    originals.set(boot, file.digest); return boot
  } catch { throw fail() }
}
export function escrowGasAtomic(wei: bigint): bigint { return (escrowUint(wei) + 999999999999n) / 1000000000000n }
/** One owned file, never implicit rotation/recovery. Used-file refusal precedes a key read. */
export async function openEscrowBuyerPurchase(boot: EscrowBuyerBoot) {
  let disk: Awaited<ReturnType<typeof import("../../payments/src/erc8183-buyer-journal.ts")["openEscrowBuyerJournal"]>> | undefined
  try {
    const digest = originals.get(boot); escrowCheck(digest !== undefined && configFile(boot.configPath).digest === digest)
    checkJournal(boot.journalPath)
    const { openEscrowBuyerJournal } = await import("../../payments/src/erc8183-buyer-journal.ts")
    escrowCheck(configFile(boot.configPath).digest === digest); checkJournal(boot.journalPath)
    disk = openEscrowBuyerJournal(boot.journalPath); escrowCheck((await disk.journal.inspect()).state === "empty")
    const owned = disk, config: EscrowPurchaseConfig = Object.freeze({ identity: boot.identity, gasBudgetWei: boot.gasBudgetWei,
      expiresInSeconds: boot.expiresInSeconds, operationTimeoutMs: boot.operationTimeoutMs, journal: owned.journal })
    return Object.freeze({ config, close: owned.close, evidence: async (out: SkillResult) => {
      try {
        const state = await owned.journal.inspect(), accepted = await owned.journal.readAccepted()
        escrowCheck(state.state === "accepted" && accepted !== undefined && accepted.jobId === out.jobId && out.authorizedRail === "erc8183" &&
          typeof out.authorizedAmountAtomic === "bigint" && state.proofs.length === 4 && state.spentGasWei <= boot.gasBudgetWei)
        const kinds = ["create", "budget", "approve", "fund"], jobId = state.proofs[0]!.jobId, fundedAtomic = state.proofs[3]!.fundedAtomic
        escrowCheck(fundedAtomic > 0n && fundedAtomic === out.authorizedAmountAtomic)
        let buyerGasWei = 0n
        const proofs = state.proofs.map((p, i) => {
          escrowCheck(p.kind === kinds[i] && p.chainId === 5042002 && p.escrow === boot.identity.escrow && p.intentId === state.intentId &&
            p.jobId === jobId && p.gasPayer === (p.kind === "budget" ? boot.identity.evaluator : boot.buyer) && (i === 3 || p.fundedAtomic === 0n))
          if (p.kind !== "budget") buyerGasWei += p.gasWei
          return Object.freeze({ kind: p.kind, chainId: p.chainId, escrow: p.escrow, intentId: p.intentId, jobId: p.jobId.toString(),
            txHash: p.txHash, blockHash: p.blockHash, blockNumber: p.blockNumber.toString(), blockTimestamp: p.blockTimestamp,
            gasWei: p.gasWei.toString(), gasPayer: p.gasPayer, fundedAtomic: p.fundedAtomic.toString() })
        })
        escrowCheck(buyerGasWei === state.spentGasWei)
        return Object.freeze({ rail: "erc8183" as const, state: "funded_and_queued" as const, intentId: state.intentId, jobId: jobId.toString(),
          fundedAtomic: fundedAtomic.toString(), buyerGasWei: buyerGasWei.toString(), buyerGasAtomic: escrowGasAtomic(buyerGasWei).toString(), proofs: Object.freeze(proofs),
          settlementVerified: false as const, refundVerified: false as const })
      } catch { throw Error("escrow_buyer_evidence_unavailable") }
    } })
  } catch { try { disk?.close() } catch { /* Preserve private reconciliation data. */ } throw fail() }
}
/** Consuming process only, after config, budget and unused-file checks. */
export function escrowBuyerAccount(boot: EscrowBuyerBoot, env: Env, signal: AbortSignal) {
  try {
    escrowCheck(originals.has(boot) && !signal.aborted)
    const key = env["ARCADE_BUYER_KEY"]
    escrowCheck(typeof key === "string" && /^0x[0-9a-fA-F]{64}$/.test(key))
    const account = privateKeyToAccount(key as `0x${string}`)
    escrowCheck(account.address.toLowerCase() === boot.buyer && !signal.aborted); return account
  } catch { throw Error("escrow_buyer_signer_unavailable") }
}
