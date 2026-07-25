/**
 * Does Arc's USDC implement EIP-3009 `receiveWithAuthorization`?
 *
 * This decides how the platform fee can be collected. `transferWithAuthorization` sends the
 * FULL price to `payTo`, so an accrued fee is a claim against a wallet we don't control and
 * can never sweep — the take-rate we print would be fiction.
 *
 * `receiveWithAuthorization` is the variant that requires `msg.sender == to`. That lets a
 * splitter CONTRACT be the payee: it pulls the payment in and forwards the seller's share in
 * one atomic transaction, so funds never rest with us and a third-party client still signs a
 * single ordinary authorization to a single payTo. Interop preserved.
 *
 * Probe method: eth_call with a deliberately invalid signature and read the revert.
 *   - "caller must be the payee" / "invalid signature" -> the function EXISTS
 *   - empty/generic revert, same as a nonexistent selector -> it does NOT
 * A known-bad selector is used as the negative control.
 */

import { encodeFunctionData, toFunctionSelector } from "viem"
import { ARC_RPC_URL, USDC_ADDRESS } from "@arcade/core"

const RECEIVE_ABI = [
  {
    type: "function",
    name: "receiveWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" }
    ],
    outputs: []
  }
] as const

const rpc = async (method: string, params: Array<unknown>) => {
  const res = await fetch(ARC_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  })
  return (await res.json()) as { result?: string; error?: { message: string; data?: string } }
}

const A = "0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"
const B = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"

console.log(`selector receiveWithAuthorization = ${toFunctionSelector(RECEIVE_ABI[0])}`)

const data = encodeFunctionData({
  abi: RECEIVE_ABI,
  functionName: "receiveWithAuthorization",
  args: [
    A,
    B,
    1n,
    0n,
    BigInt(Math.floor(Date.now() / 1000) + 3600),
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    27,
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000000000000000000000000000001"
  ]
})

const real = await rpc("eth_call", [{ to: USDC_ADDRESS, from: B, data }, "latest"])
console.log("\nreceiveWithAuthorization ->")
console.log("  ", JSON.stringify(real.error ?? real.result))

// Negative control: a selector that certainly does not exist.
const control = await rpc("eth_call", [{ to: USDC_ADDRESS, from: B, data: "0xdeadbeef" }, "latest"])
console.log("\n0xdeadbeef (control) ->")
console.log("  ", JSON.stringify(control.error ?? control.result))

const realMsg = JSON.stringify(real.error ?? "")
const ctrlMsg = JSON.stringify(control.error ?? "")
console.log("\n---")
if (realMsg !== ctrlMsg) {
  console.log("EXISTS — reverts differently from a nonexistent selector, i.e. it executed")
  console.log("A FeeSplitter contract CAN be payTo and split atomically. Interop preserved.")
} else {
  console.log("NOT PRESENT — same revert as the control selector")
  console.log("Fall back to: platform address as payTo + forward (custodial, state it plainly).")
}
