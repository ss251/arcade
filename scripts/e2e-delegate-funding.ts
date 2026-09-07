/** Explicit one-shot J5 live entry. Help/dry-run never reads a key or creates a file. */
import { chmod, mkdtemp, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createDelegateProofChain } from "./delegate-funding-chain.ts"
import { openDelegateProofJournal } from "./delegate-funding-journal.ts"
import { createDelegateDelivery } from "./delegate-funding-delivery.ts"
import { runDelegateSequence } from "./delegate-funding-sequence.ts"
import { ownedDelegatePurchase } from "./delegate-funding-purchase.ts"
import { lazyProofAccount } from "./delegate-proof-keys.ts"
import { profileDelegateReadCost } from "./delegate-funding-timing.ts"
import { DELEGATE_PROOF, assertFreshDelegateProof, proofCheck } from "./delegate-funding-proof.ts"
import { parseFundingUint } from "../packages/buyer/src/gateway-funding.ts"
export function parseDelegateProofArgs(args: readonly string[]) {
  if (args.length === 1 && args[0] === "--help") return { mode: "help" as const }
  if (args.length === 1 && args[0] === "--dry-run") return { mode: "dry-run" as const }
  proofCheck(args.length === 3 && args[0] === "--live" && args[1] === "--max-burn-block-delta")
  const maxBurnBlockDelta = parseFundingUint(args[2])
  proofCheck(maxBurnBlockDelta > 0n && maxBurnBlockDelta < (1n << 256n) - 1n)
  return { mode: "live" as const, maxBurnBlockDelta }
}
const publicJson = (value: unknown) => JSON.stringify(value, (_k, v: unknown) => typeof v === "bigint" ? v.toString() : v, 2)
export async function delegateProofMain(args = process.argv.slice(2)): Promise<number> {
  let directory: string | undefined, journal: Awaited<ReturnType<typeof openDelegateProofJournal>> | undefined
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined, hardFuse: ReturnType<typeof setTimeout> | undefined
  const abort = () => controller.abort()
  try {
    const command = parseDelegateProofArgs(args)
    if (command.mode === "help") {
      console.log("Usage: bash scripts/e2e-delegate-funding.sh --dry-run | --live --max-burn-block-delta INTEGER\n" +
        "One pre-approved Arc testnet grant, 0.50 USDC owner depositFor, 0.25 delegated delivery, and one $0.01 first-party EIP-3009 call.\n" +
        "The ordinary Unified Balance BurnIntent needs an explicit finite height bound. No validity rewriting, mainnet, automatic revoke, overwrite or spend retry.\n" +
        "Keys are read only in consuming processes. Fresh private journals are retained even on failure. Reconcile before any new attempt.")
      return 0
    }
    if (command.mode === "dry-run") {
      console.log(publicJson({ mode: command.mode, terms: DELEGATE_PROOF, keyReads: 0, networkRequests: 0,
        writes: 0, maxBurnBlockDelta: null, grantIsPersistent: true, paymentRail: "eip3009" }))
      return 0
    }
    proofCheck(process.env.ARCADE_NETWORK === "arc-testnet" && !["ARCADE_BUYER_KEY", "ARCADE_SELLER_KEY", "ARCADE_FACILITATOR_KEY",
      "ARCADE_HUB", "ARCADE_RPC_URL", "SKILL", "INPUT"].some(k => process.env[k] !== undefined))
    const deadlineMs = performance.now() + 600000
    timer = setTimeout(abort, 600000)
    // Owned children have their own parent-PID and four-minute guards as well.
    hardFuse = setTimeout(() => process.exit(2), 615000)
    process.on("SIGINT", abort); process.on("SIGTERM", abort)
    const chain = createDelegateProofChain({ signal: controller.signal, deadlineMs })
    const preflight = await chain.snapshot()
    assertFreshDelegateProof(preflight)
    proofCheck(command.maxBurnBlockDelta >= preflight.withdrawalDelay)
    const timing = await profileDelegateReadCost(chain, controller.signal)
    console.log(publicJson({ keylessTiming: timing, keys: 0, signatures: 0, broadcasts: 0 }))
    // Do not grant/deposit against a preflight that already exhausts the
    // unchanged request deadline. A fast probe is not a network guarantee.
    proofCheck(timing.complete && !timing.readFailed && timing.dispatchReached)
    directory = await realpath(await mkdtemp("/private/tmp/arcade-j5-")); await chmod(directory, 0o700)
    console.log("Retained private proof directory: " + directory + ". Never replay grants/spends after an uncertain outcome.")
    journal = await openDelegateProofJournal(join(directory, "proof.jsonl"))
    const owner = lazyProofAccount("owner"), delegate = lazyProofAccount("delegate"), ownedJournal = journal
    const delivery = createDelegateDelivery({ chain, journal: ownedJournal, fundJournalPath: join(directory, "fund.jsonl"),
      maxBurnBlockDelta: command.maxBurnBlockDelta, signal: controller.signal, deadlineMs, acquireDelegate: delegate })
    const summary = await runDelegateSequence({ chain, journal: ownedJournal, delivery,
      ownerStep: (step, prepared) => chain.ownerStep(step, owner, (hash, tx) => prepared(hash, tx.gas! * tx.maxFeePerGas!)),
      purchase: () => ownedDelegatePurchase({ directory: directory!, chain, signal: controller.signal, deadlineMs, acquireDelegate: delegate }) })
    const status = summary.delivery.sourceDebit === "confirmed" ? "confirmed" : "source_debit_pending"
    const output = { status, verifiedAt: new Date().toISOString(), ...summary, terms: DELEGATE_PROOF,
      limits: { maxBurnBlockDelta: command.maxBurnBlockDelta },
      scope: "Arc testnet only; normal Unified Balance funding, not J4 GatewayWalletBatched payment",
      note: "Loopback listing URLs existed only during the paid call and were stopped after cleanup. Pre-existing delegate funds are fungible; delivery is proved by correlated mint effects, not by spending provenance. The grant persists. Fees accrue in the splitter; none were withdrawn.",
      counts: { ...chain.counts(), ...delivery.counts(), paymentCalls: 1 },
      retained: ["proof.jsonl", "fund.jsonl", "relay.jsonl", "hub.sqlite"] }
    await writeFile(join(directory, "evidence.json"), publicJson(output) + "\n", { flag: "wx", mode: 0o600 })
    console.log(publicJson(output))
    return status === "confirmed" ? 0 : 2
  } catch {
    console.error("delegate_proof_unavailable; retain all journals and reconcile before another attempt. No automatic retry.")
    return 1
  } finally {
    controller.abort()
    if (timer) clearTimeout(timer)
    process.off("SIGINT", abort); process.off("SIGTERM", abort)
    await journal?.close().catch(() => {})
    if (directory) console.log("Retained private checkpoints: " + directory)
    if (hardFuse) clearTimeout(hardFuse)
  }
}
if (import.meta.main) process.exitCode = await delegateProofMain()
