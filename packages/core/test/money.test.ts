import { describe, expect, it } from "vitest"
import * as fc from "fast-check"
import {
  ATOMIC_PER_USDC,
  DEFAULT_FEE_BPS,
  formatPrice,
  formatUsdc,
  parsePrice,
  splitFee
} from "../src/money.ts"

describe("money", () => {
  it("parses documented prices to exact atomic units", () => {
    expect(parsePrice("$0.25")).toBe(250_000n)
    expect(parsePrice("0.25")).toBe(250_000n)
    expect(parsePrice("$1")).toBe(1_000_000n)
    expect(parsePrice("$0.01")).toBe(10_000n)
    // Circle Nanopayments' floor.
    expect(parsePrice("$0.000001")).toBe(1n)
  })

  it("rejects sub-atomic precision instead of truncating to free", () => {
    // The dangerous case: silently becoming 0 would make the listing free.
    expect(() => parsePrice("$0.0000001")).toThrow()
    expect(() => parsePrice("abc")).toThrow()
    expect(() => parsePrice("$-1")).toThrow()
    expect(() => parsePrice("$0")).toThrow()
  })

  it("round-trips price -> atomic -> string", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 12n }), (atomic) => {
        expect(parsePrice(formatUsdc(atomic))).toBe(atomic)
      }),
      { numRuns: 500 }
    )
  })

  it("splitFee conserves every atomic unit", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.integer({ min: 0, max: 10_000 }),
        (price, bps) => {
          const { sellerAtomic, feeAtomic } = splitFee(price, bps)
          // The invariant that makes the take-rate auditable: nothing created or destroyed.
          expect(sellerAtomic + feeAtomic).toBe(price)
          expect(feeAtomic).toBeGreaterThanOrEqual(0n)
          expect(sellerAtomic).toBeGreaterThanOrEqual(0n)
        }
      ),
      { numRuns: 1000 }
    )
  })

  it("splits the demo price exactly as the video claims", () => {
    const { sellerAtomic, feeAtomic } = splitFee(parsePrice("$0.25"), DEFAULT_FEE_BPS)
    expect(formatPrice(sellerAtomic)).toBe("$0.2375")
    expect(formatPrice(feeAtomic)).toBe("$0.0125")
  })

  it("rounds the fee DOWN so the seller is never shorted", () => {
    // 1 atomic unit at 5% would be 0.05 -> floors to 0; seller keeps the unit.
    const { sellerAtomic, feeAtomic } = splitFee(1n, DEFAULT_FEE_BPS)
    expect(feeAtomic).toBe(0n)
    expect(sellerAtomic).toBe(1n)
  })

  it("rejects nonsense fee rates", () => {
    expect(() => splitFee(100n, -1)).toThrow()
    expect(() => splitFee(100n, 10_001)).toThrow()
    expect(() => splitFee(100n, 1.5)).toThrow()
  })

  it("formats atomic units without float drift", () => {
    expect(formatUsdc(ATOMIC_PER_USDC)).toBe("1.000000")
    expect(formatUsdc(1n)).toBe("0.000001")
    expect(formatPrice(250_000n)).toBe("$0.25")
    expect(formatPrice(1_000_000n)).toBe("$1.00")
  })
})
