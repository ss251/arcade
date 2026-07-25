#!/usr/bin/env bun
/**
 * usdc-flow-check — lane E (bare script, no LLM).
 *
 * Skill contract: read `{ jobId, input }` as JSON on stdin, write `{ output, stopReason }`
 * as JSON on stdout. Anything on stderr is streamed to the hub as a job log.
 *
 * This runs inside the runner's sandbox with a scrubbed environment — note that it needs no
 * secrets at all, which is why it's the safest possible first listing.
 */

const RPC = "https://rpc.testnet.arc.network"
const USDC = "0x3600000000000000000000000000000000000000"

interface Payload {
  jobId: string
  input: { address?: string }
}

const rpc = async (method: string, params: Array<unknown>): Promise<string> => {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  })
  const body = (await res.json()) as { result?: string; error?: { message: string } }
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result ?? "0x0"
}

const main = async () => {
  const raw = await Bun.stdin.text()
  const { input } = JSON.parse(raw) as Payload
  const address = input?.address

  if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    // Emitting a non-conforming output on purpose: the hub will fail schema validation and
    // NOT settle, which is the correct outcome for a bad request.
    console.error("invalid address")
    process.stdout.write(JSON.stringify({ output: { error: "invalid address" } }))
    process.exit(1)
  }

  console.error(`checking ${address} on Arc testnet`)

  // ERC-20 balanceOf(address) — the 6-decimal interface of Arc's dual-nature USDC.
  const padded = address.toLowerCase().replace("0x", "").padStart(64, "0")
  const [balHex, codeHex, nonceHex, blockHex, chainHex] = await Promise.all([
    rpc("eth_call", [{ to: USDC, data: `0x70a08231${padded}` }, "latest"]),
    rpc("eth_getCode", [address, "latest"]),
    rpc("eth_getTransactionCount", [address, "latest"]),
    rpc("eth_blockNumber", []),
    rpc("eth_chainId", [])
  ])

  const atomic = BigInt(balHex === "0x" ? "0x0" : balHex)
  const whole = atomic / 1_000_000n
  const frac = (atomic % 1_000_000n).toString().padStart(6, "0")

  const output = {
    address,
    balanceUsdc: `${whole}.${frac}`,
    balanceAtomic: atomic.toString(),
    nonce: Number(BigInt(nonceHex)),
    isContract: codeHex !== "0x" && codeHex.length > 2,
    chainId: Number(BigInt(chainHex)),
    blockNumber: BigInt(blockHex).toString(),
    checkedAt: new Date().toISOString()
  }

  console.error(`balance ${output.balanceUsdc} USDC at block ${output.blockNumber}`)
  process.stdout.write(JSON.stringify({ output, stopReason: "end_turn" }))
}

main().catch((e) => {
  console.error(String(e?.message ?? e))
  process.stdout.write(JSON.stringify({ output: null, stopReason: "error" }))
  process.exit(1)
})
