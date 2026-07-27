/**
 * Deploy a FeeSplitter for one seller on Arc testnet.
 *
 * One splitter per seller is the security design, not a convenience — `seller` is immutable,
 * which is what makes payment misdirection unrepresentable rather than merely guarded. See
 * contracts/FeeSplitter.sol for the audit findings that forced it.
 *
 * `treasury` and `feeBps` are ALSO immutable: anyone can read the split ratio off the
 * deployed code and check any receipt against it. That is what makes the take-rate auditable
 * rather than merely reported. Choose them carefully — they can never be changed.
 *
 * usage:
 *   DEPLOYER_KEY=0x… SELLER=0x… TREASURY=0x… [FEE_BPS=500] bun run scripts/deploy-splitter.ts
 */

import { createPublicClient, createWalletClient, http, formatEther, type Hex } from "viem"
import { arcTestnet } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import { readFileSync } from "node:fs"
import { ARC_CHAIN_ID, USDC_ADDRESS, explorerAddressUrl, explorerTxUrl } from "@arcade/core"

const key = process.env["DEPLOYER_KEY"]
const seller = process.env["SELLER"]
const treasury = process.env["TREASURY"]
const feeBps = Number(process.env["FEE_BPS"] ?? 500)

if (!key || !seller || !treasury) {
  console.error("DEPLOYER_KEY, SELLER and TREASURY are required")
  process.exit(2)
}
if (seller.toLowerCase() === treasury.toLowerCase()) {
  // Warning, not a refusal — the original guard rested on a false premise about this
  // contract. `settle` does `accruedFees += feeAmount` and transfers only `sellerAmount`,
  // so the fee sits in the splitter until someone calls `withdrawFees()`. The split is
  // therefore observable in contract state (`accruedFees` is public) and in
  // `Settled(buyer, total, sellerAmount, feeAmount, nonce)` regardless of where the
  // treasury points. What coincides is the eventual destination, not the split.
  //
  // That makes a single-party splitter a legitimate pilot configuration — an operator who
  // is also the only seller — and refusing it would have blocked a deliberate choice on a
  // reason that is not true.
  console.warn(
    "NOTE: SELLER and TREASURY are the same address.\n" +
      "  The 95/5 split still happens on chain and is readable from `accruedFees` and the\n" +
      "  Settled event — but the fee ultimately returns to the seller, so it is a take-rate\n" +
      "  enforced against yourself rather than platform revenue. Both fields are IMMUTABLE.\n" +
      "  Set ARCADE_TREASURY_IS_SELLER=1 on the hub so the page says so.\n"
  )
}

// Pace through the local proxy by default: Arc's public RPC rate-limits bursts, and a
// deployment is a burst.
const rpcUrl = process.env["ARCADE_RPC_URL"] ?? "http://localhost:8899"

const artifact = JSON.parse(
  readFileSync("contracts/out/FeeSplitter.sol/FeeSplitter.json", "utf8")
) as { abi: unknown[]; bytecode: { object: Hex } }

const account = privateKeyToAccount(key as Hex)
const transport = http(rpcUrl, { retryCount: 5, retryDelay: 1500 })
const pub = createPublicClient({ chain: arcTestnet, transport })
const wallet = createWalletClient({ account, chain: arcTestnet, transport })

console.log(`chain     ${ARC_CHAIN_ID}  (rpc ${rpcUrl})`)
console.log(`deployer  ${account.address}`)
console.log(`  balance ${formatEther(await pub.getBalance({ address: account.address }))} USDC`)
console.log(`\nimmutable constructor args — these can NEVER be changed:`)
console.log(`  usdc      ${USDC_ADDRESS}`)
console.log(`  seller    ${seller}`)
console.log(`  treasury  ${treasury}`)
console.log(`  feeBps    ${feeBps}  (${feeBps / 100}%)`)

const hash = await wallet.deployContract({
  abi: artifact.abi as never,
  bytecode: artifact.bytecode.object,
  args: [USDC_ADDRESS, seller as Hex, treasury as Hex, feeBps]
})
console.log(`\ndeploy tx ${explorerTxUrl(hash)}`)

// One receipt read per tick — never waitForTransactionReceipt against Arc's public RPC.
let address: Hex | undefined
for (let i = 0; i < 60; i++) {
  try {
    const r = await pub.getTransactionReceipt({ hash })
    if (r) {
      if (r.status !== "success") throw new Error(`deployment reverted (${r.status})`)
      address = r.contractAddress ?? undefined
      console.log(`gas used  ${r.gasUsed}  cost ${formatEther(r.gasUsed * r.effectiveGasPrice)} USDC`)
      break
    }
  } catch (e) {
    if (!/could not be found|not be found/.test(String((e as Error).message))) throw e
  }
  await Bun.sleep(1500)
}
if (!address) throw new Error("no contract address in receipt")

console.log(`\nFeeSplitter ${address}`)
console.log(`            ${explorerAddressUrl(address)}`)

// Read the deployed state back — proving the immutables are what we intended is the whole
// point of them being immutable.
const read = (functionName: string) =>
  pub.readContract({ address, abi: artifact.abi as never, functionName })

console.log(`\nverified on-chain:`)
for (const fn of ["seller", "treasury", "feeBps", "usdc"]) {
  console.log(`  ${fn.padEnd(9)} ${await read(fn)}`)
}

const [sellerAmt, feeAmt] = (await pub.readContract({
  address,
  abi: artifact.abi as never,
  functionName: "quote",
  args: [10_000n] // $0.01
})) as [bigint, bigint]
console.log(`\n  quote($0.01) -> seller ${Number(sellerAmt) / 1e6} + fee ${Number(feeAmt) / 1e6}`)

console.log(`\nSet ARCADE_FEE_SPLITTER=${address} on the hub to route payments through it.`)
