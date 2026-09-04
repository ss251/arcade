import { Schema } from "effect"
import testnet from "../../../config/chains/arc-testnet.json" with { type: "json" }
import mainnet from "../../../config/chains/arc-mainnet.json" with { type: "json" }

const Hex = Schema.String.pipe(
  Schema.filter((value): value is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(value))
)

export class ChainConfig extends Schema.Class<ChainConfig>("ChainConfig")({
  id: Schema.Literal("arc-testnet", "arc-mainnet"),
  status: Schema.Literal("ready", "pending"),
  chainId: Schema.Int,
  caip2: Schema.String,
  rpcHttp: Schema.Array(Schema.String),
  explorerBaseUrl: Schema.String,
  usdc: Schema.Struct({
    address: Hex,
    decimals: Schema.Literal(6),
    nativeDecimals: Schema.Literal(18),
    eip712Name: Schema.String,
    eip712Version: Schema.String
  }),
  erc8004: Schema.optional(Schema.Struct({ identity: Hex, reputation: Hex, validation: Hex })),
  gateway: Schema.NullOr(Schema.Struct({
    wallet: Hex,
    domain: Schema.Int,
    facilitatorUrl: Schema.String,
    minValiditySeconds: Schema.Int
  })),
  note: Schema.optional(Schema.String)
}) {}

export type NetworkId = "arc-testnet" | "arc-mainnet"
const MANIFESTS: Readonly<Record<NetworkId, unknown>> = { "arc-testnet": testnet, "arc-mainnet": mainnet }

// Vite binds only the public network selector. No process shim or environment object is
// bundled into the browser; Bun/Node select from the real environment at runtime.
declare const __ARCADE_NETWORK__: string | undefined
const selectedNetwork = (): NetworkId => (
  typeof __ARCADE_NETWORK__ !== "undefined"
    ? __ARCADE_NETWORK__
    : typeof process !== "undefined"
      ? process.env["ARCADE_NETWORK"] ?? "arc-testnet"
      : "arc-testnet"
) as NetworkId

export const loadChainConfig = (network: NetworkId = selectedNetwork()): ChainConfig => {
  if (!Object.hasOwn(MANIFESTS, network)) {
    throw new Error(`unknown ARCADE_NETWORK "${network}" (known: ${Object.keys(MANIFESTS).join(", ")})`)
  }
  return Schema.decodeUnknownSync(ChainConfig)(MANIFESTS[network])
}

export const toViemChain = (c: ChainConfig) => ({
  id: c.chainId,
  name: c.id,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: c.usdc.nativeDecimals },
  rpcUrls: { default: { http: c.rpcHttp } },
  blockExplorers: { default: { name: "Arcscan", url: c.explorerBaseUrl } }
})
