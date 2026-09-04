import { parseArgs } from "node:util"
import { defineChain } from "viem"
import { loadChainConfig, toViemChain, type ChainConfig, type NetworkId } from "../packages/core/src/chain-config.ts"

const isHttpUrl = (value: string): boolean => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** Deployment must never turn a pending manifest's placeholders into immutables. */
export const deploymentConfig = (config: ChainConfig, rpcOverride?: string) => {
  if (config.status !== "ready") {
    throw new Error(`${config.id} is pending: fill config/chains/${config.id}.json before deployment`)
  }
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0 || config.caip2 !== `eip155:${config.chainId}`) {
    throw new Error(`${config.id}: invalid ready chainId or CAIP-2 identifier`)
  }
  if (config.rpcHttp.length === 0 || !config.rpcHttp.every(isHttpUrl)) {
    throw new Error(`${config.id}: ready config requires HTTP(S) RPC endpoints`)
  }
  if (!isHttpUrl(config.explorerBaseUrl)) {
    throw new Error(`${config.id}: ready config requires an HTTP(S) explorer URL`)
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(config.usdc.address) || /^0x0{40}$/i.test(config.usdc.address)) {
    throw new Error(`${config.id}: ready config requires a nonzero USDC contract address`)
  }
  const rpcUrl = rpcOverride ?? config.rpcHttp[0]!
  if (!isHttpUrl(rpcUrl)) throw new Error("ARCADE_RPC_URL must be an HTTP(S) RPC endpoint")
  const explorer = config.explorerBaseUrl.replace(/\/+$/, "")
  return {
    config,
    chain: defineChain(toViemChain(config)),
    rpcUrl,
    explorerTxUrl: (hash: string) => `${explorer}/tx/${hash}`,
    explorerAddressUrl: (address: string) => `${explorer}/address/${address}`
  }
}

export const loadDeploymentConfig = (
  args: string[],
  env: Readonly<Record<string, string | undefined>> = process.env
) => {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: { network: { type: "string" }, v2: { type: "boolean", default: false } }
  })
  const network = values.network ?? env["ARCADE_NETWORK"] ?? "arc-testnet"
  return {
    ...deploymentConfig(loadChainConfig(network as NetworkId), env["ARCADE_RPC_URL"]),
    useV2: values.v2
  }
}

/** Check the endpoint itself, including overrides pointing at a local RPC proxy. */
export const withCheckedDeploymentChain = async <T>(
  config: ChainConfig,
  rpc: { getChainId(): Promise<number> },
  deploy: () => Promise<T>
): Promise<T> => {
  deploymentConfig(config)
  const actual = await rpc.getChainId()
  if (actual !== config.chainId) {
    throw new Error(`RPC chain mismatch for ${config.id}: expected ${config.chainId}, received ${actual}; refusing deployment`)
  }
  return deploy()
}
