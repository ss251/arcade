import { USDC_DECIMALS } from "./chain.ts"

/**
 * USDC money math. Everything here is **6-decimal atomic units** (the ERC-20 interface),
 * never the 18-decimal native gas representation of the same token.
 *
 * All values are bigint. There is deliberately no float path: `0.1 + 0.2` problems in a
 * payments system are unacceptable, and the fee split must be exact.
 */

/** Atomic units per whole USDC: 10^6. */
export const ATOMIC_PER_USDC = 10n ** BigInt(USDC_DECIMALS)

/** Smallest expressible payment: $0.000001, which is also Circle Nanopayments' floor. */
export const MIN_ATOMIC = 1n

const PRICE_RE = /^\$?(\d+)(?:\.(\d{1,6}))?$/

/**
 * Parse a human price ("$0.25", "0.25", "$1") into atomic units.
 *
 * Rejects more than 6 decimal places rather than silently truncating — a listing priced
 * at "$0.0000001" must fail loudly, not become free.
 */
export const parsePrice = (input: string): bigint => {
  const trimmed = input.trim()
  const m = PRICE_RE.exec(trimmed)
  if (!m) {
    throw new Error(
      `Invalid price ${JSON.stringify(input)}: expected e.g. "$0.25" with at most ${USDC_DECIMALS} decimal places`
    )
  }
  const whole = BigInt(m[1]!)
  const frac = (m[2] ?? "").padEnd(USDC_DECIMALS, "0")
  const atomic = whole * ATOMIC_PER_USDC + BigInt(frac === "" ? "0" : frac)
  if (atomic < MIN_ATOMIC) {
    throw new Error(`Invalid price ${JSON.stringify(input)}: must be at least $0.000001`)
  }
  return atomic
}

/** Format atomic units as a plain decimal string ("250000" -> "0.250000"). */
export const formatUsdc = (atomic: bigint): string => {
  const neg = atomic < 0n
  const abs = neg ? -atomic : atomic
  const whole = abs / ATOMIC_PER_USDC
  const frac = (abs % ATOMIC_PER_USDC).toString().padStart(USDC_DECIMALS, "0")
  return `${neg ? "-" : ""}${whole}.${frac}`
}

/** Format atomic units for display ("$0.25", trailing zeros trimmed but never below 2dp). */
export const formatPrice = (atomic: bigint): string => {
  const s = formatUsdc(atomic)
  const [whole, frac = ""] = s.split(".")
  const trimmed = frac.replace(/0+$/, "")
  const padded = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed
  return `$${whole}.${padded}`
}

export interface FeeSplit {
  /** What the seller receives. */
  readonly sellerAtomic: bigint
  /** What the platform accrues. */
  readonly feeAtomic: bigint
}

/**
 * Split a price into seller share and platform fee.
 *
 * The fee is floor-rounded and the seller receives the remainder, so
 * `sellerAtomic + feeAtomic === priceAtomic` holds EXACTLY for every input —
 * no atomic unit is ever created or destroyed by a rounding step.
 *
 * @param priceAtomic total charged to the buyer, in atomic units
 * @param feeBps platform fee in basis points (500 = 5%)
 */
export const splitFee = (priceAtomic: bigint, feeBps: number): FeeSplit => {
  if (priceAtomic < 0n) throw new Error("priceAtomic must be non-negative")
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error(`feeBps must be an integer in [0, 10000], got ${feeBps}`)
  }
  const feeAtomic = (priceAtomic * BigInt(feeBps)) / 10_000n
  return { feeAtomic, sellerAtomic: priceAtomic - feeAtomic }
}

/** Default platform take-rate: 5%. Visible on every receipt. */
export const DEFAULT_FEE_BPS = 500

/** Convert an 18-decimal native (gas) amount to a human string. Gas display only. */
export const formatNativeGas = (wei: bigint): string => {
  const per = 10n ** 18n
  const whole = wei / per
  const frac = (wei % per).toString().padStart(18, "0").replace(/0+$/, "") || "0"
  return `${whole}.${frac}`
}
