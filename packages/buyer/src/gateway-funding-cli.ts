/** Deliberate Bun-only funding entry. No signer, filesystem or fetch work on import. */
import { isAbsolute, normalize } from "node:path"
import { randomUUID } from "node:crypto"
import { captureFundingAuthority, decodeFundingRequest, parseFundingAmount, parseFundingUint,
  encodeFundingPublic, type FundingAuthority, type FundingRequest, type FundingPublicOutcome } from "./gateway-funding.ts"
import type { FundingSigner } from "./gateway-funding-runtime.ts"

export class FundingCliFailure extends Error {
  readonly code = "funding_input_invalid"
  constructor() { super("funding_input_invalid") }
}
export type FundingCommand =
  | { readonly kind: "help" }
  | { readonly kind: "balance"; readonly authority: FundingAuthority }
  | { readonly kind: "reconcile" | "finalize"; readonly authority: FundingAuthority; readonly journalPath: string }
  | { readonly kind: "deposit" | "withdrawal"; readonly authority: FundingAuthority; readonly journalPath: string; readonly request: FundingRequest }

const commands = ["gateway-balance", "gateway-deposit", "gateway-withdraw", "gateway-reconcile", "gateway-finalize"] as const
const fail = (): never => { throw new FundingCliFailure() }
/** Entry snapshot precedes routing or spread. The separate funding parser keeps
 * its tighter 16 KiB policy; session JSON retains its full 1 MiB allowance. */
export const captureCliArgv = (raw: readonly string[]): readonly string[] => {
  try {
    if (!Array.isArray(raw) || raw.length > 32 || Reflect.ownKeys(raw).length !== raw.length + 1) return fail()
    const copy: string[] = []; let bytes = 0
    for (let i = 0; i < raw.length; i++) {
      const d = Object.getOwnPropertyDescriptor(raw, String(i))
      if (!d || !("value" in d) || typeof d.value !== "string" || d.value.length > 1048576) return fail()
      bytes += new TextEncoder().encode(d.value).byteLength
      if (bytes > 2097152) return fail()
      copy.push(d.value)
    }
    return Object.freeze(copy)
  } catch { return fail() }
}
/** Validate argv as bounded own scalar data before any asynchronous work. */
export const fundingArgv = (raw: readonly string[]): readonly string[] => {
  if (!Array.isArray(raw) || raw.length > 32 || Reflect.ownKeys(raw).length !== raw.length + 1) return fail()
  const copy: string[] = []; let bytes = 0
  for (let i = 0; i < raw.length; i++) {
    const d = Object.getOwnPropertyDescriptor(raw, String(i))
    if (!d || !("value" in d) || typeof d.value !== "string" || d.value.length > 4096 || /[\u0000\r\n]/.test(d.value)) return fail()
    bytes += new TextEncoder().encode(d.value).byteLength
    if (bytes > 16384) return fail()
    copy.push(d.value)
  }
  return Object.freeze(copy)
}
const journal = (value: string | undefined): string => {
  if (!value || value.length > 2048 || !isAbsolute(value) || normalize(value) !== value || !value.endsWith(".jsonl") || /[\u0000-\u001f\u007f]/.test(value)) return fail()
  return value
}
export const parseFundingCommand = (raw: readonly string[]): FundingCommand => {
  try {
    const args = fundingArgv(raw), name = args[0]
    if (args.length === 1 && name === "--help" || args.length === 2 && commands.includes(name as typeof commands[number]) && args[1] === "--help") return Object.freeze({ kind: "help" })
    if (!commands.includes(name as typeof commands[number]) || (args.length - 1) % 2 !== 0) return fail()
    const flags: Record<string, string> = Object.create(null)
    for (let i = 1; i < args.length; i += 2) {
      const k = args[i]!, value = args[i + 1]!
      if (!/^--[a-z][a-z-]*$/.test(k) || value === "" || value.startsWith("--") || Object.hasOwn(flags, k)) return fail()
      flags[k] = value
    }
    const keys = Object.keys(flags), allowed = name === "gateway-balance" ? ["--address"] : name === "gateway-reconcile" || name === "gateway-finalize" ? ["--address", "--journal"] :
      name === "gateway-deposit" ? ["--address", "--journal", "--amount", "--minimum-available", "--max-deposit", "--gas-cap-wei"] :
        ["--address", "--journal", "--amount", "--fee-cap", "--max-burn-block-delta", "--gas-cap-wei"]
    if (keys.some(k => !allowed.includes(k))) return fail()
    const authority = captureFundingAuthority(flags["--address"])
    if (name === "gateway-balance") return Object.freeze({ kind: "balance", authority })
    const journalPath = journal(flags["--journal"])
    if (name === "gateway-reconcile" || name === "gateway-finalize") return Object.freeze({ kind: name === "gateway-reconcile" ? "reconcile" : "finalize", authority, journalPath })
    const gasCapWei = parseFundingUint(flags["--gas-cap-wei"])
    let request: FundingRequest
    if (name === "gateway-deposit") {
      if (flags["--amount"] !== undefined) {
        if (flags["--minimum-available"] !== undefined || flags["--max-deposit"] !== undefined) return fail()
        request = decodeFundingRequest({ kind: "deposit", mode: "exact", amount: parseFundingAmount(flags["--amount"]), gasCapWei })
      } else request = decodeFundingRequest({ kind: "deposit", mode: "target", minimumAvailable: parseFundingAmount(flags["--minimum-available"]), maxDeposit: parseFundingAmount(flags["--max-deposit"]), gasCapWei })
      return Object.freeze({ kind: "deposit", authority, journalPath, request })
    }
    request = decodeFundingRequest({ kind: "withdrawal", amount: parseFundingAmount(flags["--amount"]), maxFee: parseFundingAmount(flags["--fee-cap"]),
      maxBurnBlockDelta: parseFundingUint(flags["--max-burn-block-delta"]), gasCapWei })
    return Object.freeze({ kind: "withdrawal", authority, journalPath, request })
  } catch { return fail() }
}

const HELP = "Explicit funding commands (Arc testnet only):\n" +
  "gateway-balance --address ADDRESS\n" +
  "gateway-deposit --address ADDRESS --journal /ABS/PRIVATE/FILE.jsonl --amount USDC --gas-cap-wei INTEGER\n" +
  "gateway-deposit --address ADDRESS --journal /ABS/PRIVATE/FILE.jsonl --minimum-available USDC --max-deposit USDC --gas-cap-wei INTEGER\n" +
  "gateway-withdraw --address ADDRESS --journal /ABS/PRIVATE/FILE.jsonl --amount USDC --fee-cap USDC --max-burn-block-delta INTEGER --gas-cap-wei INTEGER\n" +
  "gateway-reconcile|gateway-finalize --address ADDRESS --journal /ABS/PRIVATE/FILE.jsonl\n" +
  "Journal parent must already be an owned mode-0700 canonical real directory; it does not select the account-claim root.\n" +
  "session --help\n" +
  "arcade-buy --rail erc8183 --help (explicit private-journal escrow purchase; principal plus configured gas)\n" +
  "fund --help (owner Unified Balance delegation; separate funding flow)\n" +
  "No key flags, implicit funding, withdraw-all or automatic retry. Withdrawal requires matching deployed Wallet and Minter identity; current Minter mismatches the reviewed build.\n"

export type FundingRuntimeBindings = Pick<typeof import("./gateway-funding-runtime.ts"),
  "createFundingDependencies" | "createFundingOperation" | "inspectFunding" | "reconcileFundingOperation" | "finalizeFundingOperation">
export interface FundingCliContext {
  readonly env: Readonly<Record<string, string | undefined>>; readonly role: "buyer" | "seller"
  /** Trusted test/programmatic seams. No CLI argument or environment selects these. */
  readonly runtime?: () => Promise<FundingRuntimeBindings>
  readonly write?: (line: string, error: boolean) => Promise<void>
  readonly signal?: AbortSignal; readonly timeoutMs?: number
}
const output = async (line: string, error: boolean): Promise<void> => new Promise((resolve, reject) => {
  ;(error ? process.stderr : process.stdout).write(`${line}\n`, failure => failure ? reject(failure) : resolve())
})
const active = (signal: AbortSignal, deadline: number) => {
  if (signal.aborted || performance.now() >= deadline) throw new Error("funding_unavailable")
}
const observe = async <T>(work: Promise<T>, signal: AbortSignal): Promise<T> => {
  let abort: (() => void) | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    abort = () => reject(new Error("funding_unavailable"))
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort()
  })]) } finally { if (abort) signal.removeEventListener("abort", abort) }
}
/** This callback is created without reading the role key; runtime invokes it only after its gates. */
const lazySigner = (authority: FundingAuthority, env: FundingCliContext["env"], role: FundingCliContext["role"], deadline: number) => async (signal: AbortSignal): Promise<FundingSigner> => {
  active(signal, deadline)
  try {
    const key = env[role === "seller" ? "ARCADE_SELLER_KEY" : "ARCADE_BUYER_KEY"]
    if (typeof key !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw Error()
    const { privateKeyToAccount } = await import("viem/accounts")
    active(signal, deadline)
    const account = privateKeyToAccount(key as `0x${string}`)
    if (account.address.toLowerCase() !== authority.account) throw Error()
    return Object.freeze({ address: account.address.toLowerCase() as `0x${string}`,
      signTransaction: async (transaction, atSignal) => { active(atSignal, deadline)
        try { return await account.signTransaction(transaction) } catch { throw new Error("funding_signer_unavailable") } },
      signTypedData: async (burn, atSignal) => { active(atSignal, deadline)
        try { return await account.signTypedData(burn) } catch { throw new Error("funding_signer_unavailable") } }
    } satisfies FundingSigner)
  } catch { throw new Error("funding_signer_unavailable") }
}
export const fundingMain = async (raw: readonly string[], context: FundingCliContext): Promise<number> => {
  const write = context.write ?? output
  const env = context.env, role = context.role, parentSignal = context.signal
  let operation: ReturnType<FundingRuntimeBindings["createFundingOperation"]> | undefined
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
  try {
    const args = captureCliArgv(raw)
    if (args[0] === "session") return await (await import("./session-cli.ts")).sessionMain(args, context)
    const command = parseFundingCommand(args)
    if (command.kind === "help") { await write(HELP, false); return 0 }
    if (role !== "buyer" && role !== "seller" || env["ARCADE_NETWORK"] !== undefined && env["ARCADE_NETWORK"] !== "arc-testnet") throw new FundingCliFailure()
    const timeout = context.timeoutMs ?? 300000
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300000) throw new FundingCliFailure()
    controller = new AbortController(); const signal = controller.signal, deadline = performance.now() + timeout
    abort = () => controller!.abort(); parentSignal?.addEventListener("abort", abort, { once: true }); if (parentSignal?.aborted) abort()
    timer = setTimeout(abort, timeout); active(signal, deadline)
    const runtime = await observe((context.runtime ?? (() => import("./gateway-funding-runtime.ts")))(), signal)
    active(signal, deadline)
    const mutation = command.kind === "deposit" || command.kind === "withdrawal"
    const deps = runtime.createFundingDependencies({ signal, deadlineMs: deadline,
      ...(mutation ? { acquireSigner: lazySigner(command.authority, env, role, deadline) } : {}) })
    let result: FundingPublicOutcome
    if (command.kind === "balance") result = await observe(runtime.inspectFunding(command.authority, deps), signal)
    else if (command.kind === "reconcile") result = await observe(runtime.reconcileFundingOperation({ authority: command.authority, journalPath: command.journalPath }, deps), signal)
    else if (command.kind === "finalize") result = await observe(runtime.finalizeFundingOperation({ authority: command.authority, journalPath: command.journalPath }, deps), signal)
    else {
      if (command.kind !== "deposit" && command.kind !== "withdrawal") throw new FundingCliFailure()
      operation = runtime.createFundingOperation({ authority: command.authority, operationId: `op_${randomUUID().replaceAll("-", "")}`,
        request: command.request, journalPath: command.journalPath }, deps)
      active(signal, deadline)
      result = await observe(command.kind === "deposit" ? operation.executeDepositOnce() : operation.requestWithdrawalOnce(), signal)
      // The explicit withdrawal command authorizes both separately journaled stages.
      // Only the validated facts-only intermediate state permits the second stage.
      const status = (JSON.parse(encodeFundingPublic(result)) as { status: unknown }).status
      if (command.kind === "withdrawal" && status === "mint_ready") {
        active(signal, deadline)
        result = await observe(operation.mintWithdrawalOnce(), signal)
      }
      const owned = operation; operation = undefined
      await owned.close()
    }
    active(signal, deadline)
    const encoded = encodeFundingPublic(result)
    await write(encoded, false)
    return result.status === "noop" || result.status === "confirmed" || command.kind === "balance" && result.status === "observed" ? 0 : 1
  } catch (error) {
    await write(error instanceof FundingCliFailure ? "funding_input_invalid" : "funding_unavailable: retain evidence; no automatic retry", true)
    return error instanceof FundingCliFailure ? 2 : 1
  } finally {
    controller?.abort()
    // The failure path already emitted a fixed local diagnostic. Cleanup must
    // not replace it with provider/OS prose or trigger a second close attempt.
    try { if (operation) await operation.close() } catch { /* Retain failure and journal; never unlock or retry. */ }
    finally { if (timer !== undefined) clearTimeout(timer); if (abort) parentSignal?.removeEventListener("abort", abort) }
  }
}

/** Owning-process fuse remains armed through work, output and cleanup. */
export const runOwnedFundingCli = async (work: () => Promise<number>, hardTimeoutMs = 330000): Promise<void> => {
  if (!Number.isSafeInteger(hardTimeoutMs) || hardTimeoutMs < 1 || hardTimeoutMs > 330000) throw new FundingCliFailure()
  const timer = setTimeout(() => { console.error("funding_deadline_exceeded: retain the journal; do not retry"); process.exit(124) }, hardTimeoutMs)
  try { process.exitCode = await work() }
  catch { console.error("funding_unavailable: retained evidence requires reconciliation"); process.exitCode = 1 }
  finally { clearTimeout(timer) }
}
