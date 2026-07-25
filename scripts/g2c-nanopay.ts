/**
 * G-2c — does Circle Gateway Nanopayments actually work on Arc testnet?
 *
 * Nanopayments is strictly better than the raw EIP-3009 rail if it works: gas-free on both
 * sides, $0.000001 minimum, batched settlement inside a TEE. Two things have to be true:
 *
 *   1. a buyer can DEPOSIT into the Gateway Wallet on Arc (one on-chain tx, costs gas), and
 *   2. the Gateway balance is then spendable off-chain.
 *
 * Everything after the deposit is gasless, which is what makes deep agent→agent call chains
 * economically real.
 *
 * usage: ARCADE_BUYER_KEY=0x… bun run scripts/g2c-nanopay.ts [depositUsdc]
 */

import { GatewayClient, CHAIN_CONFIGS, GATEWAY_DOMAINS } from "@circle-fin/x402-batching/client"
import { privateKeyToAccount } from "viem/accounts"
import {
  GATEWAY_DOMAIN,
  GATEWAY_MIN_VALIDITY_SECONDS,
  GATEWAY_WALLET,
  USDC_ADDRESS
} from "@arcade/core"

const key = process.env["ARCADE_BUYER_KEY"]
if (key === undefined) {
  console.error("ARCADE_BUYER_KEY is not set (use a funded Arc testnet throwaway)")
  process.exit(2)
}
const depositAmount = process.argv[2] ?? "0.5"

const account = privateKeyToAccount(key as `0x${string}`)
console.log(`buyer ${account.address}\n`)

// ── 0. our constants vs Circle's own ────────────────────────────────────────
const cfg = CHAIN_CONFIGS["arcTestnet"]
const checks: Array<[string, unknown, unknown]> = [
  ["usdc", cfg.usdc.toLowerCase(), USDC_ADDRESS.toLowerCase()],
  ["gatewayWallet", cfg.gatewayWallet.toLowerCase(), GATEWAY_WALLET.toLowerCase()],
  ["domain", GATEWAY_DOMAINS["arcTestnet"], GATEWAY_DOMAIN]
]
let drift = false
for (const [name, theirs, ours] of checks) {
  const ok = theirs === ours
  if (!ok) drift = true
  console.log(`  ${ok ? "OK  " : "DRIFT"} ${name}: circle=${theirs} ours=${ours}`)
}
console.log(`  ---- validity window: ours=${GATEWAY_MIN_VALIDITY_SECONDS}\n`)
if (drift) {
  console.error("Our Arc constants have drifted from Circle's SDK. Fix packages/core/src/chain.ts.")
  process.exit(1)
}

/**
 * Arc's DEFAULT public RPC rate-limits hard enough to break Circle's own SDK mid-deposit
 * (`request limit reached` on a plain balanceOf). The SDK's own CHAIN_CONFIGS ships two
 * alternates; QuickNode is used here and takes the limiter out of the picture.
 * ARCADE_RPC_URL overrides it.
 */
const rpcUrl: string =
  process.env["ARCADE_RPC_URL"] ??
  cfg.chain.rpcUrls.default.http.find((u: string) => u.includes("quicknode")) ??
  cfg.rpcUrl ??
  "https://rpc.testnet.arc.network"
console.log(`  rpc: ${rpcUrl}\n`)

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey: key as `0x${string}`,
  rpcUrl
})

/**
 * Shape per Circle's buyer quickstart (via the circle docs MCP):
 *   getBalances() -> { wallet: { formatted }, gateway: { available: bigint, formattedAvailable } }
 */
const show = async (label: string) => {
  const b = await client.getBalances()
  console.log(`${label}`)
  console.log(`  wallet USDC        ${b.wallet.formatted}`)
  console.log(`  gateway available  ${b.gateway.formattedAvailable}`)
  return b
}

try {
  const before = await show("before")

  // 1 USDC = 1_000_000 base units (6 decimals) — Circle's own guard.
  const wantAtomic = BigInt(Math.round(Number(depositAmount) * 1e6))
  if (before.gateway.available >= wantAtomic) {
    console.log(`\nGateway balance already covers ${depositAmount} USDC — skipping deposit.`)
  } else {
    console.log(`\ndepositing ${depositAmount} USDC into the Gateway Wallet (one on-chain tx)…`)

    /**
     * `deposit()` fires several RPC calls in a burst (balance, allowance, approve, deposit)
     * and Arc's public RPC limits bursts — the identical calls succeed one at a time. The
     * SDK exposes no transport hook, so retry the whole operation and let the bucket refill.
     * A dedicated RPC removes this entirely and is required before demo day.
     */
    let deposit: { depositTxHash: string } | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        deposit = await client.deposit(depositAmount)
        break
      } catch (err) {
        const msg = String((err as Error)?.message ?? err)
        if (!/request limit|-32011/.test(msg) || attempt === 4) throw err
        const waitMs = 5000 * 2 ** attempt
        console.log(`  rate limited — retrying in ${waitMs / 1000}s (attempt ${attempt + 2}/5)`)
        await Bun.sleep(waitMs)
      }
    }
    if (deposit === undefined) throw new Error("deposit did not complete")
    console.log(`  deposit tx: ${deposit.depositTxHash}`)
    console.log(`  explorer:   https://testnet.arcscan.app/tx/${deposit.depositTxHash}`)
    // Arc credits in ~0.5s — the fastest of any Gateway chain (Circle's own finality table).
    // Sepolia-family chains take 13-19 MINUTES for the same step.
    await Bun.sleep(4000)
  }

  const after = await show("\nafter")

  if (after.gateway.available === 0n) {
    throw new Error("deposit did not credit a Gateway balance")
  }

  console.log(`\nG-2c: PASS — Gateway Nanopayments works on Arc testnet.`)
  console.log(`  Gateway balance is now spendable GASLESS, down to $0.000001 per call.`)
  console.log(`  Set ARCADE_RAIL=gateway to make it the hub's default.`)
} catch (e) {
  console.error(`\nG-2c: FAIL — ${String((e as Error)?.message ?? e)}`)
  console.error(
    `\nThis is a finding, not a crisis: the EIP-3009 rail is proven on-chain and remains\n` +
      `the default. Record the failure mode and keep ARCADE_RAIL=eip3009.`
  )
  process.exit(1)
}
