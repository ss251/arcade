/**
 * Arc testnet constants.
 *
 * All values verified live on 2026-07-24/25 (see internal/research/G1-RAIL-VERIFICATION.md):
 * chain id via eth_chainId, USDC capabilities via eth_call probes against a negative control,
 * and a real EIP-3009 settlement (tx 0xc9b77c1e…, block 53480033).
 */

/** Arc testnet chain id. */
export const ARC_CHAIN_ID = 5042002 as const

/** CAIP-2 identifier — the form Circle's x402/Nanopayments requirements use on the wire. */
export const ARC_CAIP2 = `eip155:${ARC_CHAIN_ID}` as const

export const ARC_RPC_URL = "https://rpc.testnet.arc.network" as const
export const ARC_EXPLORER = "https://testnet.arcscan.app" as const

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
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const

/** ERC-20 interface decimals. Payments/prices/receipts use this. */
export const USDC_DECIMALS = 6 as const

/** Native gas-token decimals for the same address. Gas math only. */
export const USDC_NATIVE_DECIMALS = 18 as const

/** EIP-712 domain values for the USDC contract (probed live: name "USDC", version "2"). */
export const USDC_EIP712_NAME = "USDC" as const
export const USDC_EIP712_VERSION = "2" as const

/** Circle Gateway Wallet — same address across all EVM testnets. */
export const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const

/** Circle Gateway/CCTP domain id for Arc testnet. */
export const GATEWAY_DOMAIN = 26 as const

/** Circle's hosted Nanopayments facilitator (testnet). We do NOT run our own. */
export const GATEWAY_FACILITATOR_URL = "https://gateway-api-testnet.circle.com" as const

/** Nanopayments scheme marker that distinguishes a Gateway 402 from a vanilla `exact` one. */
export const GATEWAY_BATCHING_NAME = "GatewayWalletBatched" as const
export const GATEWAY_BATCHING_VERSION = "1" as const

/**
 * Gateway rejects authorizations valid for less than 7 days.
 * 604800s (7d) + 100s buffer, matching the SDK's own `maxTimeoutSeconds`.
 */
export const GATEWAY_MIN_VALIDITY_SECONDS = 604900 as const

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
