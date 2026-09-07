/** Explicit Arc escrow boot; public identity config and private journal have no fallback. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { createHash } from "node:crypto"
import { privateKeyToAccount } from "viem/accounts"
import type { TransactionSerializableEIP1559 } from "viem"
import { captureEscrowIdentity, escrowCheck, escrowRecord, escrowSeconds, escrowUint, makeErc8183Rail,
  type Erc8183Config, type EscrowIdentity } from "@arcade/payments"
import { openEscrowActionJournal } from "@arcade/payments/erc8183-journal"
import type { Store } from "./store.ts"
import type { Broker } from "./broker.ts"
type Env = Readonly<Record<string, string | undefined>>
export interface EscrowHubBoot {
  readonly identity: EscrowIdentity; readonly gasCapWei: bigint; readonly expiresInSeconds: number; readonly operationTimeoutMs: number
  readonly configPath: string; readonly journalPath: string; readonly dbPath: string
}
const proven = new WeakMap<EscrowHubBoot, { digest: string; acquireSigner: Erc8183Config["acquireSigner"] }>()
const fail = () => Error("escrow_hub_configuration_refused")
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const path = (raw: unknown): string => {
  escrowCheck(typeof raw === "string" && raw.length > 0 && raw.length <= 4096 && isAbsolute(raw) && resolve(raw) === raw &&
    realpathSync(dirname(raw)) === dirname(raw))
  return raw
}
const privateParent = (file: string) => {
  const stat = lstatSync(dirname(file))
  escrowCheck(stat.isDirectory() && stat.uid === process.getuid!() && (stat.mode & 0o777) === 0o700)
}
const existing = (file: string) => {
  try { return lstatSync(file) } catch (e) { if ((e as { code?: string }).code === "ENOENT") return undefined; throw e }
}
const databasePath = (file: string, mustExist = false) => {
  path(file); privateParent(file)
  escrowCheck(!mustExist || existing(file) !== undefined)
  for (const name of [file, file + "-wal", file + "-shm", file + "-journal"]) {
    const stat = existing(name)
    if (!stat) continue
    escrowCheck(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.getuid!() && (stat.mode & 0o022) === 0)
  }
}
const journalPathCheck = (file: string) => {
  path(file); privateParent(file)
  const stat = existing(file)
  escrowCheck(stat === undefined || stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.getuid!() && (stat.mode & 0o777) === 0o600)
  // A retained/active action sidecar is not permission for implicit recovery.
  for (const suffix of ["-wal", "-shm", "-journal"]) escrowCheck(existing(file + suffix) === undefined)
}
function readConfig(file: string) {
  path(file); escrowCheck(realpathSync(file) === file)
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(fd)
    escrowCheck(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid!() && (stat.mode & 0o022) === 0 && stat.size > 0 && stat.size <= 32768)
    const bytes = Buffer.alloc(32769), length = readSync(fd, bytes, 0, bytes.length, 0), after = fstatSync(fd)
    escrowCheck(length === stat.size && length <= 32768 && after.size === stat.size && after.mtimeMs === stat.mtimeMs)
    const read = bytes.subarray(0, length)
    return { raw: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(read)) as unknown, digest: digest(read) }
  } finally { closeSync(fd) }
}
/** Disabled means two flag reads only; no config, DB, journal, key or network lookup.
 * Armed preflight is read-only, including signer-address validation. Key material
 * stays in the consuming process, never the returned public plan or diagnostics. */
export function readEscrowHubBoot(env: Env, selection: { readonly chainId: number; readonly rail: string }): EscrowHubBoot | undefined {
  try {
    const configRaw = env["ARCADE_ESCROW_CONFIG"], journalRaw = env["ARCADE_ESCROW_JOURNAL"]
    if (configRaw === undefined && journalRaw === undefined) {
      escrowCheck(!Object.keys(env).some(key => key.startsWith("ARCADE_ESCROW_")))
      return undefined
    }
    escrowCheck(Object.keys(env).filter(key => key.startsWith("ARCADE_ESCROW_")).every(key =>
      key === "ARCADE_ESCROW_CONFIG" || key === "ARCADE_ESCROW_JOURNAL"))
    escrowCheck(selection.chainId === 5042002 && ["gateway", "eip3009"].includes(selection.rail))
    const configPath = path(configRaw), journalPath = path(journalRaw), dbPath = path(env["ARCADE_DB"])
    const names = [configPath, journalPath, dbPath].flatMap(file => [file, file + "-wal", file + "-shm", file + "-journal"])
    escrowCheck(new Set(names).size === names.length); journalPathCheck(journalPath); databasePath(dbPath)
    const secret = env["ARCADE_HUB_SECRET"], origin = env["ARCADE_PUBLIC_URL"]
    escrowCheck(typeof secret === "string" && secret.length >= 32 && Buffer.byteLength(secret) <= 4096 && typeof origin === "string")
    const url = new URL(origin)
    escrowCheck(["http:", "https:"].includes(url.protocol) && url.origin === origin && !url.username && !url.password)
    const file = readConfig(configPath), raw = escrowRecord(file.raw, ["identity", "gasCapWei", "expiresInSeconds", "operationTimeoutMs"])
    const identity = captureEscrowIdentity(raw.identity)
    escrowCheck(typeof raw.gasCapWei === "string" && /^[1-9][0-9]{0,77}$/.test(raw.gasCapWei))
    const gasCapWei = escrowUint(BigInt(raw.gasCapWei)), expiresInSeconds = escrowSeconds(raw.expiresInSeconds)
    const operationTimeoutMs = raw.operationTimeoutMs
    escrowCheck(gasCapWei > 0n && expiresInSeconds >= 601 && typeof operationTimeoutMs === "number" &&
      Number.isSafeInteger(operationTimeoutMs) && operationTimeoutMs > 0 && operationTimeoutMs <= 300000)
    const account = () => {
      const key = env["ARCADE_FACILITATOR_KEY"]
      escrowCheck(typeof key === "string" && /^0x[0-9a-fA-F]{64}$/.test(key))
      const signer = privateKeyToAccount(key as `0x${string}`)
      escrowCheck(signer.address.toLowerCase() === identity.evaluator); return signer
    }
    account() // No ephemeral signer and no unusable quote before a known evaluator key.
    const boot = Object.freeze({ identity, gasCapWei, expiresInSeconds, operationTimeoutMs, configPath, journalPath, dbPath })
    proven.set(boot, { digest: file.digest, acquireSigner: async signal => {
      try {
        escrowCheck(!signal.aborted); const signer = account(); escrowCheck(!signal.aborted)
        return Object.freeze({ address: signer.address, signTransaction: async (transaction: TransactionSerializableEIP1559) => {
          escrowCheck(!signal.aborted); const signed = await signer.signTransaction(transaction); escrowCheck(!signal.aborted); return signed
        } })
      } catch { throw fail() }
    } })
    return boot
  } catch { throw fail() }
}
/** Concrete journal + original broker, offline construction. Caller closes only
 * after request and accepted-job interruption cleanup; no repair/replay here. */
export function openEscrowHubRail(boot: EscrowHubBoot, store: Store, broker: Broker) {
  let disk: ReturnType<typeof openEscrowActionJournal> | undefined
  try {
    const owned = proven.get(boot)
    escrowCheck(owned !== undefined && store.escrow?.durability === "durable" && broker.escrow !== undefined)
    escrowCheck(readConfig(boot.configPath).digest === owned.digest); databasePath(boot.dbPath, true); journalPathCheck(boot.journalPath)
    disk = openEscrowActionJournal(boot.journalPath)
    const rail = makeErc8183Rail({ identity: boot.identity, gasCapWei: boot.gasCapWei, expiresInSeconds: boot.expiresInSeconds,
      operationTimeoutMs: boot.operationTimeoutMs, nowSeconds: () => Math.floor(Date.now() / 1000), journal: disk.journal,
      acquireSigner: owned.acquireSigner, providerAuthorization: broker.escrow.authorize })
    return Object.freeze({ rail, close: disk.close })
  } catch { try { disk?.close() } catch { /* No private path or provider diagnostics. */ } throw fail() }
}
