/** Explicit Bun-only escrow opt-in. Public identity file; private signature journal. */
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"
import { captureEscrowIdentity, escrowCheck, escrowRecord } from "@arcade/payments"
import { openEscrowProviderJournal } from "@arcade/payments/erc8183-provider-journal"
const fail = () => Error("escrow_runner_configuration_refused")
export function parseEscrowRunnerArgs(args: readonly string[]) {
  try {
    const flags = args.filter(a => a.startsWith("--escrow"))
    if (!flags.length) return undefined
    escrowCheck(flags.length === 2 && flags.includes("--escrow-config") && flags.includes("--escrow-journal"))
    const configPath = args[args.indexOf("--escrow-config") + 1], journalPath = args[args.indexOf("--escrow-journal") + 1]
    escrowCheck(typeof configPath === "string" && configPath.length > 0 && !configPath.startsWith("-") &&
      typeof journalPath === "string" && journalPath.length > 0 && !journalPath.startsWith("-"))
    return Object.freeze({ configPath, journalPath })
  } catch { throw fail() }
}
/** Both paths must be explicit absolute canonical paths; no discovery or default address.
 * Configuration contains exactly independently known identity and an explicit IO bound,
 * not keys or payment-authorization policy. The caller owns close for its whole lifetime. */
export function openEscrowRunnerConfig(paths: { readonly configPath: string; readonly journalPath: string }) {
  try {
    const path = paths.configPath
    escrowCheck(isAbsolute(path) && resolve(path) === path && realpathSync(path) === path && paths.journalPath !== path)
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    let raw: unknown
    try {
      const stat = fstatSync(fd)
      escrowCheck(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid!() && (stat.mode & 0o022) === 0 &&
        stat.size > 0 && stat.size <= 32768)
      const bytes = Buffer.alloc(32769), length = readSync(fd, bytes, 0, bytes.length, 0)
      escrowCheck(length === stat.size && length <= 32768)
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)))
    } finally { closeSync(fd) }
    const config = escrowRecord(raw, ["identity", "operationTimeoutMs"]), identity = captureEscrowIdentity(config.identity)
    const operationTimeoutMs = config.operationTimeoutMs
    escrowCheck(typeof operationTimeoutMs === "number" && Number.isSafeInteger(operationTimeoutMs) &&
      operationTimeoutMs > 0 && operationTimeoutMs <= 300000)
    const disk = openEscrowProviderJournal(paths.journalPath)
    return Object.freeze({ options: Object.freeze({ identity, operationTimeoutMs, journal: disk.journal }), close: disk.close })
  } catch { throw fail() }
}
