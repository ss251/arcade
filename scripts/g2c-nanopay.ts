/** Explicit OWNER-gated F1 probe. Imports/help never read keys or perform IO. */
import { Effect } from "effect"
import { fetchGatewayJson, GatewayGateError, parseGateArgs, parseSupported, executeGatewayGate } from "./gateway-gate.ts"
import { createGateRuntime } from "./gateway-gate-runtime.ts"

export const gateMain = async (args: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<number> => {
  if (args.length === 1 && args[0] === "--help") {
    console.log("Keyless: bun --no-env-file scripts/g2c-nanopay.ts --supported")
    console.log("OWNER-approved only: --live --buyer ADDRESS --pay-to DISTINCT_ADDRESS --deposit-usdc 0.5 --payment-usdc 0.001 --journal /ABS/PRIVATE_DIR/probe.jsonl")
    console.log("Use a new dedicated funded buyer, explicit recipient and existing 0700 directory. Never repeat an uncertain run or delete its journal to retry.")
    return 0
  }
  let runtime: ReturnType<typeof createGateRuntime> | undefined
  try {
    const parsed = parseGateArgs(args)
    if (parsed.mode === "supported") {
      const support = parseSupported(await fetchGatewayJson("/v1/x402/supported"))
      console.log(JSON.stringify({ ...support, supported: true, fullGate: "UNPROVEN", spending: false }))
      return 0
    }
    if ((env["ARCADE_NETWORK"] !== undefined && env["ARCADE_NETWORK"] !== "arc-testnet") ||
      (env["ARCADE_RPC_URL"] !== undefined && env["ARCADE_RPC_URL"] !== "https://rpc.testnet.arc.io") ||
      env["SELLER"] !== undefined || env["GATEWAY_FACILITATOR_URL"] !== undefined)
      throw new GatewayGateError({ stage: "configuration", reason: "refused" })
    // Keychain is read inline by the owner's consuming command, never here or on import.
    const key = env["ARCADE_BUYER_KEY"]
    if (key === undefined) throw new GatewayGateError({ stage: "configuration", reason: "unavailable" })
    runtime = createGateRuntime(parsed, key, AbortSignal.timeout(315_000))
    const outcome = await Effect.runPromise(executeGatewayGate(parsed, runtime.dependencies).pipe(Effect.match({
      onFailure: error => ({ ok: false as const, error }),
      onSuccess: result => ({ ok: true as const, result })
    })))
    if (!outcome.ok) throw outcome.error
    await runtime.close(); runtime = undefined
    console.log(JSON.stringify(outcome.result))
    console.log("G-2c: PASS — deposit confirmed; exact authorization verified and accepted; transfer and Gateway balance correlated. Batch mining is not independently proven.")
    return 0
  } catch (error) {
    const safe = error instanceof GatewayGateError ? error : new GatewayGateError({ stage: "configuration", reason: "unavailable" })
    console.error(safe.message)
    console.error(safe.reason === "unsupported"
      ? "Observed supported response excludes the required Arc v2 kind. Record this limited evidence; no spend was attempted."
      : "Full live gate INCOMPLETE. No automatic resend or fallback decision. Keep EIP-3009 as the default and reconcile retained journal/hash/nonce.")
    return 1
  } finally { if (runtime) await runtime.close() }
}

/** Only for the owning CLI process: this fuse covers stalled filesystem cleanup too. */
export const runGateCli = async (work: () => Promise<number>, timeoutMs = 330_000): Promise<void> => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 330_000)
    throw new Error("Gateway gate deadline invalid")
  const fuse = setTimeout(() => {
    console.error("Gateway gate hard deadline; reconcile retained journal/hash/nonce before any retry")
    process.exit(124)
  }, timeoutMs)
  try { process.exitCode = await work() }
  catch { console.error("Gateway gate cleanup unavailable; retained evidence requires reconciliation"); process.exitCode = 1 }
  finally { clearTimeout(fuse) }
}

if (import.meta.main) await runGateCli(() => gateMain(process.argv.slice(2), process.env))
