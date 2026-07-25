/**
 * Sweep accrued platform fees from a FeeSplitter to its immutable treasury.
 *
 * Permissionless: the destination is baked into the contract, so anyone may trigger this and
 * nobody can redirect it. Kept separate from `settle` on purpose — USDC can blacklist
 * addresses, and pushing the fee inside settlement would let a blocked treasury brick every
 * payment on the marketplace forever.
 *
 * usage: SPLITTER=0x… CALLER_KEY=0x… bun run scripts/withdraw-fees.ts
 */

import { createPublicClient, createWalletClient, encodeFunctionData, http, type Hex } from "viem"
import { arcTestnet } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import { USDC_ADDRESS, explorerTxUrl } from "@arcade/core"

const splitter = process.env["SPLITTER"] as Hex | undefined
const key = process.env["CALLER_KEY"] as Hex | undefined
if (!splitter || !key) {
  console.error("SPLITTER and CALLER_KEY are required")
  process.exit(2)
}

const rpcUrl = process.env["ARCADE_RPC_URL"] ?? "http://localhost:8899"
const transport = http(rpcUrl, { retryCount: 5, retryDelay: 1500 })
const pub = createPublicClient({ chain: arcTestnet, transport })
const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: arcTestnet, transport })

const ABI = [
  { type: "function", name: "withdrawFees", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "accruedFees", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }
] as const

const usdcBalance = async (a: Hex) =>
  (await pub.readContract({
    address: USDC_ADDRESS as Hex,
    abi: [
      { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }
    ] as const,
    functionName: "balanceOf",
    args: [a]
  })) as bigint

const fmt = (n: bigint) => `${Number(n) / 1e6} USDC`

const treasury = (await pub.readContract({ address: splitter, abi: ABI, functionName: "treasury" })) as Hex
const accrued = (await pub.readContract({ address: splitter, abi: ABI, functionName: "accruedFees" })) as bigint

console.log(`splitter  ${splitter}`)
console.log(`treasury  ${treasury}   (immutable — cannot be redirected)`)
console.log(`accrued   ${fmt(accrued)}`)

if (accrued === 0n) {
  console.log("\nnothing to withdraw")
  process.exit(0)
}

const before = await usdcBalance(treasury)
console.log(`\ntreasury balance before  ${fmt(before)}`)

const hash = await wallet.sendTransaction({
  to: splitter,
  data: encodeFunctionData({ abi: ABI, functionName: "withdrawFees" })
})
console.log(`withdraw tx ${explorerTxUrl(hash)}`)

for (let i = 0; i < 60; i++) {
  try {
    const r = await pub.getTransactionReceipt({ hash })
    if (r) {
      if (r.status !== "success") throw new Error("withdrawal reverted")
      break
    }
  } catch (e) {
    if (!/not be found/.test(String((e as Error).message))) throw e
  }
  await Bun.sleep(1500)
}

const after = await usdcBalance(treasury)
console.log(`treasury balance after   ${fmt(after)}`)
console.log(`\ncollected ${fmt(after - before)} — the take-rate is now real money in the treasury.`)
