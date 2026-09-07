/** Strict command policy; no keys, SDK or filesystem mutation on import. */
import { isAbsolute, normalize } from "node:path"
import { captureCliArgv, fundingArgv } from "./gateway-funding-cli.ts"
import { captureFundingAuthority, parseFundingAmount, parseFundingUint } from "./gateway-funding.ts"
import { captureUnifiedFundingPlan, captureCanonicalUnifiedPlan, type UnifiedFundingPlan, type UnifiedSourceChain, type UnifiedFundingResult } from "./unified-balance-funding.ts"
import { unifiedCoordinates } from "./unified-balance-guards.ts"

export class UnifiedFundingCliError extends Error { constructor() { super("unified_funding_input_invalid") } }
const fail = (): never => { throw new UnifiedFundingCliError() }
const HELP = "arcade fund --from-unified-balance --owner ADDRESS --source Arc_Testnet|Base_Sepolia --amount USDC\n" +
  "  [--delegate ADDRESS] [--dry-run] [--journal /ABS/PRIVATE/run.jsonl]\n" +
  "  [--fee-cap USDC] [--gas-cap-wei INTEGER] [--max-burn-block-delta INTEGER]\n" +
  "Destination: Arc_Testnet, recipient: the delegate. Default fee cap 0.05 USDC; destination gas cap 0.10 native USDC (100000000000000000 wei).\n" +
  "Dry-run is offline and never reads a key; supply --delegate to resolve the complete plan. Ready live spends require a fresh private journal and an explicit finite --max-burn-block-delta.\n" +
  "No mainnet, auto-allocation, forwarder, automatic deposit, grant or retry. Owner delegation is source-specific and is not a per-call cap.\n"
export interface UnifiedFundingCommand {
  readonly kind: "fund"
  readonly owner: `0x${string}`
  readonly sourceChain: UnifiedSourceChain
  readonly amount: string
  readonly delegate?: `0x${string}`
  readonly dryRun: boolean
  readonly journalPath?: string
  readonly feeCapAtomic: bigint
  readonly gasCapWei: bigint
  readonly maxBurnBlockDelta?: bigint
}
export const parseUnifiedFundingCommand = (input: readonly string[]): UnifiedFundingCommand | { readonly kind: "help" } => {
  try {
    const args = fundingArgv(captureCliArgv(input))
    if (args.length === 2 && args[0] === "fund" && args[1] === "--help") return Object.freeze({ kind: "help" })
    if (args[0] !== "fund") return fail()
    const values: Record<string, string | true> = Object.create(null)
    const bools = ["--from-unified-balance", "--dry-run"]
    const options = ["--owner", "--source", "--amount", "--delegate", "--journal", "--fee-cap", "--gas-cap-wei", "--max-burn-block-delta"]
    for (let i = 1; i < args.length; i++) {
      const key = args[i]!
      if (Object.hasOwn(values, key)) return fail()
      if (bools.includes(key)) { values[key] = true; continue }
      if (!options.includes(key) || !args[i + 1] || args[i + 1]!.startsWith("--")) return fail()
      values[key] = args[++i]!
    }
    if (values["--from-unified-balance"] !== true) return fail()
    const owner = captureFundingAuthority(values["--owner"]).account
    const sourceChain = values["--source"]
    if (sourceChain !== "Arc_Testnet" && sourceChain !== "Base_Sepolia") return fail()
    const amountAtomic = parseFundingAmount(values["--amount"])
    if (amountAtomic === 0n) return fail()
    const amount = `${amountAtomic / 1_000_000n}.${String(amountAtomic % 1_000_000n).padStart(6, "0")}`
    const delegate = values["--delegate"] === undefined ? undefined : captureFundingAuthority(values["--delegate"]).account
    if (delegate === owner) return fail()
    const journalPath = values["--journal"]
    if (journalPath !== undefined && (typeof journalPath !== "string" || !isAbsolute(journalPath) || normalize(journalPath) !== journalPath ||
      !journalPath.endsWith(".jsonl") || /[\u0000-\u001f\u007f]/.test(journalPath))) return fail()
    const feeCapAtomic = parseFundingAmount(values["--fee-cap"] ?? "0.05")
    const gasCapWei = parseFundingUint(values["--gas-cap-wei"] ?? "100000000000000000")
    const maxBurnBlockDelta = values["--max-burn-block-delta"] === undefined ? undefined : parseFundingUint(values["--max-burn-block-delta"])
    if (maxBurnBlockDelta !== undefined && (maxBurnBlockDelta === 0n || maxBurnBlockDelta === (1n << 256n) - 1n)) return fail()
    if (gasCapWei === 0n || amountAtomic + feeCapAtomic >= 1n << 256n) return fail()
    return Object.freeze({ kind: "fund", owner, sourceChain, amount, dryRun: values["--dry-run"] === true,
      feeCapAtomic, gasCapWei, ...(delegate === undefined ? {} : { delegate }), ...(journalPath === undefined ? {} : { journalPath }),
      ...(maxBurnBlockDelta === undefined ? {} : { maxBurnBlockDelta }) })
  } catch { return fail() }
}
/** A concrete owner-signed command, with interactive key entry instead of any
 * private-key argv. Pending means wait: never execute this instruction again
 * merely because Gateway has not observed the existing grant yet. */
export const ownerAddDelegateCommand = (plan: UnifiedFundingPlan): string => {
  const captured = captureUnifiedFundingPlan({ owner: plan.owner, sourceChain: plan.sourceChain, amount: plan.amount, recipient: plan.recipient })
  const c = unifiedCoordinates(captured.sourceChain)
  return `cast send ${c.wallet} 'addDelegate(address,address)' ${c.token} ${captured.recipient} --rpc-url ${c.rpc} --chain ${c.chainId} --from ${captured.owner} --interactive`
}
export interface UnifiedCliRuntime {
  /** Resolves only the caller's delegate; used only when public --delegate is absent. */
  resolveDelegate(): Promise<string>
  status(plan: UnifiedFundingPlan): Promise<unknown>
  execute(plan: UnifiedFundingPlan, command: UnifiedFundingCommand): Promise<UnifiedFundingResult>
}
export interface UnifiedCliContext {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly runtime: () => Promise<UnifiedCliRuntime>
  readonly write: (line: string, error: boolean) => Promise<void>
}
export const unifiedFundingMain = async (input: readonly string[], context: UnifiedCliContext): Promise<number> => {
  try {
    const command = parseUnifiedFundingCommand(input)
    if (command.kind === "help") { await context.write(HELP, false); return 0 }
    if (context.env["ARCADE_NETWORK"] !== undefined && context.env["ARCADE_NETWORK"] !== "arc-testnet") return fail()
    if (command.dryRun) {
      const plan = command.delegate === undefined ? { owner: command.owner, sourceChain: command.sourceChain, amount: command.amount,
        recipient: null, destinationChain: "Arc_Testnet", token: "USDC" } :
        captureUnifiedFundingPlan({ owner: command.owner, sourceChain: command.sourceChain, amount: command.amount, recipient: command.delegate })
      await context.write(JSON.stringify({ status: "dry_run", plan, feeCapAtomic: String(command.feeCapAtomic), gasCapWei: String(command.gasCapWei),
        maxBurnBlockDelta: command.maxBurnBlockDelta === undefined ? null : String(command.maxBurnBlockDelta),
        delegateUnresolved: command.delegate === undefined, networkObserved: false }), false)
      return 0
    }
    const runtime = await context.runtime()
    const recipient = command.delegate ?? await runtime.resolveDelegate()
    const plan = captureUnifiedFundingPlan({ owner: command.owner, sourceChain: command.sourceChain, amount: command.amount, recipient })
    const status = await runtime.status(plan)
    if (status === "none" || status === "pending") {
      await context.write(JSON.stringify({ status, plan, ownerCommand: ownerAddDelegateCommand(plan),
        next: status === "none" ? "owner_grant_required" : "wait_for_existing_grant_do_not_repeat" }), false)
      return 2
    }
    if (status !== "ready") throw new Error("read_unavailable")
    if (command.journalPath === undefined || command.maxBurnBlockDelta === undefined) return fail()
    const result = await runtime.execute(plan, command)
    if (JSON.stringify(captureCanonicalUnifiedPlan(result.plan)) !== JSON.stringify(plan)) throw Error()
    // Rebuild a closed output projection; a runtime cannot smuggle raw traces.
    if (result.status === "none" || result.status === "pending") {
      await context.write(JSON.stringify({ status: result.status, plan, ownerCommand: ownerAddDelegateCommand(plan) }), false)
      return 2
    }
    if (result.status !== "sdk_returned" || typeof result.txHash !== "string" || !/^0x[0-9a-f]{64}$/.test(result.txHash) || /^0x0{64}$/.test(result.txHash)) throw Error()
    await context.write(JSON.stringify({ status: "sdk_returned", plan, txHash: result.txHash, independentlyConfirmed: false }), false)
    return 0
  } catch (error) {
    await context.write(error instanceof UnifiedFundingCliError ? "unified_funding_input_invalid" :
      "unified_funding_unavailable: retain evidence; do not retry an uncertain spend", true)
    return error instanceof UnifiedFundingCliError ? 2 : 1
  }
}
