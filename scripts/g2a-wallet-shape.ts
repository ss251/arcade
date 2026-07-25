/**
 * G-2a — is a Circle Agent Stack wallet an EOA or a smart contract account?
 *
 * Why this decides architecture: Circle's Nanopayments docs state that Gateway verifies
 * payment signatures off-chain with `ecrecover`, which is incompatible with EIP-1271
 * contract signatures — so **Nanopayments requires an EOA**. But `circle wallet create` is
 * documented as producing agent-controlled *SCA* wallets. If that's true, the mandated
 * eligibility wallet cannot itself sign Nanopayments authorizations, and the buyer must pay
 * from a plain EOA while the agent wallet stays load-bearing as the earnings account and
 * funding source.
 *
 * `eth_getCode` settles it: non-empty bytecode at the address means SCA.
 *
 * usage: bun run scripts/g2a-wallet-shape.ts <address> [more addresses…]
 */

import { ARC_RPC_URL, ARC_CHAIN_ID } from "@arcade/core"

const addresses = process.argv.slice(2)

if (addresses.length === 0) {
  console.error(`usage: bun run scripts/g2a-wallet-shape.ts <address> [...]

Get a Circle agent wallet address first:
  circle wallet list --chain ARC-TESTNET --type agent --output json`)
  process.exit(2)
}

/**
 * Arc's public RPC rate-limits (-32011). Calls are SEQUENTIAL with backoff — firing these
 * in parallel trips the limiter immediately, which is the same trap that forced
 * one-receipt-per-tick polling in packages/payments/src/eip3009.ts.
 */
const rpc = async (method: string, params: Array<unknown>, attempt = 0): Promise<string> => {
  const res = await fetch(ARC_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  })
  const body = (await res.json()) as { result?: string; error?: { message: string } }
  if (body.error) {
    const rateLimited = /request limit|-32011/.test(body.error.message)
    if (rateLimited && attempt < 6) {
      await Bun.sleep(500 * 2 ** attempt)
      return rpc(method, params, attempt + 1)
    }
    throw new Error(`${method}: ${body.error.message}`)
  }
  return body.result ?? "0x"
}

const chainId = Number(BigInt(await rpc("eth_chainId", [])))
if (chainId !== ARC_CHAIN_ID) {
  console.error(`RPC reports chain ${chainId}, expected ${ARC_CHAIN_ID}`)
  process.exit(1)
}
console.log(`chain ${chainId} (Arc testnet)\n`)

let anySca = false
let anyIndeterminate = false

for (const address of addresses) {
  const code = await rpc("eth_getCode", [address, "latest"])
  const balance = await rpc("eth_getBalance", [address, "latest"])
  const nonce = await rpc("eth_getTransactionCount", [address, "latest"])

  const hasCode = code !== "0x" && code.length > 2
  const n = Number(BigInt(nonce))
  const bal = BigInt(balance)

  /**
   * ⚠️ `eth_getCode` alone CANNOT distinguish an EOA from an undeployed SCA.
   *
   * Circle uses lazy deployment: "you don't have to pay the gas fee at the time of wallet
   * creation. Instead, the fee is charged when you initiate your first outbound transaction."
   * An ERC-4337 account has a deterministic counterfactual address that returns `0x` until
   * that first outbound op lands. A brand-new wallet that has never transacted is therefore
   * INDETERMINATE, and reporting it as "EOA" would be a confident wrong answer.
   */
  // The discriminator is NONCE, not balance: receiving a faucet drip does not deploy an
  // SCA either. Only an OUTBOUND operation (nonce > 0) forces lazy deployment, so until
  // then a codeless address is genuinely ambiguous no matter how much USDC it holds.
  const indeterminate = !hasCode && n === 0
  const verdict = hasCode ? "SCA" : indeterminate ? "INDETERMINATE" : "EOA"
  if (hasCode) anySca = true
  if (indeterminate) anyIndeterminate = true

  console.log(`${address}`)
  console.log(`  verdict        ${verdict}${indeterminate ? " — never transacted, cannot tell yet" : ""}`)
  console.log(`  bytecode       ${hasCode ? `${code.length - 2} hex chars` : "none"}`)
  console.log(`  native balance ${(Number(bal) / 1e18).toFixed(6)} USDC (18-dec gas view)`)
  console.log(`  nonce          ${n}`)
  console.log(
    `  nanopayments   ${
      hasCode
        ? "INCOMPATIBLE — Gateway uses ecrecover, not EIP-1271"
        : indeterminate
          ? "UNKNOWN — fund the wallet and send one outbound tx, then re-run"
          : "compatible — can sign EIP-3009 authorizations directly"
    }\n`
  )
}

console.log("---")
if (anyIndeterminate) {
  console.log(
    "INDETERMINATE: at least one wallet has never transacted, so eth_getCode cannot\n" +
      "distinguish an EOA from a lazily-deployed SCA. Fund it and send one outbound\n" +
      "transaction to force deployment, then re-run:\n" +
      "  circle wallet fund --address <addr> --chain ARC-TESTNET\n" +
      "  circle wallet transfer …   (any outbound op)\n"
  )
}
if (anySca) {
  console.log(
    "At least one address is an SCA. If that is the Circle agent wallet, the buyer must pay\n" +
      "from an EOA; the agent wallet remains load-bearing as the seller's earnings account,\n" +
      "the funding source (`circle wallet fund`), and the `circle services pay` leg."
  )
} else {
  console.log(
    "All addresses are EOAs — a Circle agent wallet in this shape CAN sign Nanopayments\n" +
      "authorizations directly, so buyer and eligibility wallet can be the same account."
  )
}
