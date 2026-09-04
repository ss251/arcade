import { createPublicClient, defineChain, http, parseAbi } from "viem"
import { toViemChain, type ChainConfig } from "../../../packages/core/src/chain-config.ts"
import type { ChainRpc } from "./chain-check.ts"

const ABI = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)"
])

/** Shared by boot and the operator CLI; pace public-RPC reads to avoid burst limits. */
export const createChainRpc = (cfg: ChainConfig, rpcOverride?: string): ChainRpc => {
  if (cfg.status !== "ready") throw new Error(`${cfg.id} configuration is pending`)
  const rpcUrl = rpcOverride ?? cfg.rpcHttp[0]
  let validUrl = false
  try { validUrl = rpcUrl !== undefined && ["http:", "https:"].includes(new URL(rpcUrl).protocol) }
  catch { /* Never echo an invalid URL, which may contain an upstream credential. */ }
  if (!validUrl) {
    throw new Error("chain check requires an HTTP(S) RPC endpoint")
  }
  const client = createPublicClient({
    chain: defineChain(toViemChain(cfg)),
    transport: http(rpcUrl, { timeout: 5000, retryCount: 2, retryDelay: 750 })
  })
  let nextReadAt = 0
  const paced = async <T>(read: () => Promise<T>): Promise<T> => {
    const delay = Math.max(0, nextReadAt - Date.now())
    nextReadAt = Date.now() + delay + 400
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    return read()
  }
  return {
    chainId: () => paced(() => client.getChainId()),
    read: (fn) => paced(() => client.readContract({ address: cfg.usdc.address, abi: ABI, functionName: fn })),
    balanceOf: (addr) => paced(() => client.readContract({
      address: cfg.usdc.address, abi: ABI, functionName: "balanceOf", args: [addr as `0x${string}`]
    }))
  }
}
