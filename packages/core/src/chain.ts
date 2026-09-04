import { loadChainConfig } from "./chain-config.ts"

const cfg = loadChainConfig()

/**
 * Compatibility exports for the selected Arc network (testnet by default).
 *
 * All values verified live on 2026-07-24/25 (see internal/research/G1-RAIL-VERIFICATION.md):
 * chain id via eth_chainId, USDC capabilities via eth_call probes against a negative control,
 * and a real EIP-3009 settlement (tx 0xc9b77c1e…, block 53480033).
 */

/** Selected Arc chain id. */
export const ARC_CHAIN_ID = cfg.chainId

/** CAIP-2 identifier — the form Circle's x402/Nanopayments requirements use on the wire. */
export const ARC_CAIP2 = cfg.caip2

export const ARC_RPC_URL = cfg.rpcHttp[0] ?? ""
export const ARC_EXPLORER = cfg.explorerBaseUrl

/**
 * USDC on Arc.
 *
 * ⚠️ The single most important fact in this codebase: this ONE address is simultaneously
 *  - the NATIVE gas token, denominated in 18 decimals (what `eth_getBalance` returns), and
 *  - the ERC-20 interface, denominated in 6 decimals (what `balanceOf`/`transfer` use).
 *
 * Prices, payments and receipts are ALWAYS 6-decimal atomic units. Gas costs are 18-decimal.
 * Never mix them; see `money.ts`, which only speaks 6-decimal atomic units.
 */
export const USDC_ADDRESS = cfg.usdc.address

/** ERC-20 interface decimals. Payments/prices/receipts use this. */
export const USDC_DECIMALS = cfg.usdc.decimals

/** Native gas-token decimals for the same address. Gas math only. */
export const USDC_NATIVE_DECIMALS = cfg.usdc.nativeDecimals

/** EIP-712 domain values for the USDC contract (probed live: name "USDC", version "2"). */
export const USDC_EIP712_NAME = cfg.usdc.eip712Name
export const USDC_EIP712_VERSION = cfg.usdc.eip712Version

/** Circle Gateway Wallet; zero sentinel when unavailable, checked before hub boot. */
export const GATEWAY_WALLET = cfg.gateway?.wallet ?? "0x0000000000000000000000000000000000000000"

/** Circle Gateway/CCTP domain id for Arc testnet. */
export const GATEWAY_DOMAIN = cfg.gateway?.domain ?? -1

/** Circle's hosted Nanopayments facilitator (testnet). We do NOT run our own. */
export const GATEWAY_FACILITATOR_URL = cfg.gateway?.facilitatorUrl ?? ""

/** Nanopayments scheme marker that distinguishes a Gateway 402 from a vanilla `exact` one. */
export const GATEWAY_BATCHING_NAME = "GatewayWalletBatched" as const
export const GATEWAY_BATCHING_VERSION = "1" as const

/**
 * Gateway rejects authorizations valid for less than 7 days.
 * 604800s (7d) + 100s buffer, matching the SDK's own `maxTimeoutSeconds`.
 */
export const GATEWAY_MIN_VALIDITY_SECONDS = cfg.gateway?.minValiditySeconds ?? 604900

/**
 * Measured block cadence (~0.5s) with single-block deterministic finality (Malachite BFT).
 * Used to size polling intervals — Arc's public RPC returns -32011 under aggressive polling,
 * so never poll faster than this.
 */
export const ARC_BLOCK_MS = 500 as const

/** One receipt poll per tick. Slower than block time on purpose: the public RPC rate-limits. */
export const RECEIPT_POLL_INTERVAL_MS = 1500 as const

export const explorerTxUrl = (hash: string): string => `${ARC_EXPLORER}/tx/${hash}`
export const explorerAddressUrl = (address: string): string => `${ARC_EXPLORER}/address/${address}`
