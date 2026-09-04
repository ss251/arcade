import { parseArgs } from "node:util"
import { privateKeyToAccount } from "viem/accounts"
import { loadChainConfig, type NetworkId } from "../packages/core/src/chain-config.ts"
import { chainCheck, chainMetadataCheck, chainStartupRefusal } from "../apps/hub/src/chain-check.ts"
import { createChainRpc } from "../apps/hub/src/chain-rpc.ts"

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    args: process.argv.slice(2), strict: true, allowPositionals: false,
    options: { network: { type: "string" }, facilitator: { type: "string" } }
  })
  const cfg = loadChainConfig((values.network ?? process.env["ARCADE_NETWORK"] ?? "arc-testnet") as NetworkId)
  const unavailable = chainStartupRefusal(cfg, process.env["ARCADE_RAIL"] ?? "eip3009")
  if (unavailable !== undefined) {
    console.error(unavailable)
    process.exitCode = 1
    return
  }
  if (process.env["ARCADE_RAIL"] === "gateway") {
    const result = await chainMetadataCheck(cfg, createChainRpc(cfg, process.env["ARCADE_RPC_URL"]))
    if (result.ok) console.log(`ok: ${cfg.id} chain and USDC metadata; Gateway uses Circle's hosted facilitator (no local gas wallet checked)`)
    else { for (const finding of result.findings) console.error(finding); process.exitCode = 1 }
    return
  }
  let facilitator = values.facilitator ?? process.env["ARCADE_FACILITATOR_ADDRESS"]
  const key = process.env["ARCADE_FACILITATOR_KEY"]
  if (facilitator === undefined && key !== undefined) {
    try { facilitator = privateKeyToAccount(key as `0x${string}`).address }
    catch { throw new Error("ARCADE_FACILITATOR_KEY is invalid") }
  }
  if (facilitator === undefined || !/^0x[0-9a-fA-F]{40}$/.test(facilitator)) {
    throw new Error("pass --facilitator 0x... or set ARCADE_FACILITATOR_ADDRESS / ARCADE_FACILITATOR_KEY")
  }
  const result = await chainCheck(cfg, createChainRpc(cfg, process.env["ARCADE_RPC_URL"]), facilitator)
  if (result.ok) console.log(`ok: ${cfg.id} chain, USDC domain/decimals and facilitator ${facilitator}`)
  else {
    for (const finding of result.findings) console.error(finding)
    process.exitCode = 1
  }
}

await main().catch((error: unknown) => {
  console.error(String((error as Error)?.message ?? error))
  process.exitCode = 2
})
