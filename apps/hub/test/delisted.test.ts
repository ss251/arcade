import { describe, expect, it } from "vitest"
import { HEADER_PAYMENT_LEGACY, HEADER_PAYMENT_SIGNATURE } from "@arcade/payments"
import { claimedPayerOf, delistRefusal } from "../src/delisted.ts"

const CANARY = "0xCa0000000000000000000000000000000000000A"
const STRANGER = "0x1111111111111111111111111111111111111111"
const encoded = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64")
const claim = (from: unknown): string => encoded({ payload: { authorization: { from } } })
const request = (headers: Record<string, string> = {}) => new Request("https://hub.example/x/seller/skill", { method: "POST", headers })

describe("delistRefusal", () => {
  it("refuses an ordinary payer with a stable non-charging explanation", () => {
    expect(delistRefusal({ delisted: true }, STRANGER, CANARY)).toEqual({
      error: "listing_delisted", detail: expect.stringContaining("pay-test")
    })
    expect(delistRefusal({ delisted: true }, STRANGER, CANARY)?.detail).toContain("not charged")
  })
  it("permits only a valid matching canary address, independent of hexadecimal case", () => {
    expect(delistRefusal({ delisted: true }, CANARY.toLowerCase(), CANARY)).toBeNull()
    expect(delistRefusal({ delisted: true }, CANARY, CANARY.toLowerCase())).toBeNull()
  })
  it.each([["", undefined], ["", ""], ["PRIVATE_BAD_ADDRESS", "PRIVATE_BAD_ADDRESS"],
    ["0x1234", "0x1234"], [STRANGER, undefined], [CANARY, `${CANARY} `]])(
    "does not exempt absent or malformed addresses", (payer, canaryAddress) => {
      const result = delistRefusal({ delisted: true }, payer!, canaryAddress)
      expect(result?.error).toBe("listing_delisted")
      expect(JSON.stringify(result)).not.toContain("PRIVATE_BAD_ADDRESS")
    }
  )
  it("is silent for live listings even when no canary is configured", () => {
    expect(delistRefusal({}, "", undefined)).toBeNull()
    expect(delistRefusal({ delisted: false }, STRANGER, undefined)).toBeNull()
    expect(delistRefusal({ delisted: undefined }, STRANGER, CANARY)).toBeNull()
  })
})

describe("claimedPayerOf", () => {
  it.each([HEADER_PAYMENT_SIGNATURE, HEADER_PAYMENT_LEGACY])("reads an address from %s", (header) => {
    expect(claimedPayerOf(request({ [header]: claim(CANARY) }))).toBe(CANARY)
  })
  it("uses the same modern-header precedence as payment verification", () => {
    expect(claimedPayerOf(request({ [HEADER_PAYMENT_SIGNATURE]: claim(STRANGER), [HEADER_PAYMENT_LEGACY]: claim(CANARY) })))
      .toBe(STRANGER)
  })
  it.each(["", "not-base64-json", encoded({}), claim("PRIVATE_BAD_ADDRESS"), claim({ address: CANARY })])(
    "never falls back to legacy when the modern header is malformed", (modern) => {
      expect(claimedPayerOf(request({ [HEADER_PAYMENT_SIGNATURE]: modern, [HEADER_PAYMENT_LEGACY]: claim(CANARY) }))).toBe("")
    }
  )
  it.each([undefined, null, 5, {}, [], true, "", "0x1234", `${CANARY} `, ` ${CANARY}`, `0x${"g".repeat(40)}`])(
    "refuses a missing, non-string, or malformed from value", (from) => {
      expect(claimedPayerOf(request({ [HEADER_PAYMENT_SIGNATURE]: claim(from) }))).toBe("")
    }
  )
  it.each([null, [], { payload: [] }, { payload: null }, { payload: { authorization: [] } },
    { payload: { authorization: null } }, { payload: { authorization: { from: { toLowerCase: CANARY } } } }])(
    "does not traverse invalid payment header shapes", (payload) => {
      expect(claimedPayerOf(request({ [HEADER_PAYMENT_SIGNATURE]: encoded(payload) }))).toBe("")
    }
  )
  it("does not treat prototype-inherited from as a claim", () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "from")
    Object.defineProperty(Object.prototype, "from", { value: CANARY, configurable: true })
    try {
      expect(claimedPayerOf(request({ [HEADER_PAYMENT_SIGNATURE]: encoded({ payload: { authorization: {} } }) }))).toBe("")
    } finally {
      if (previous === undefined) Reflect.deleteProperty(Object.prototype, "from")
      else Object.defineProperty(Object.prototype, "from", previous)
    }
  })
  it("returns no claim for a headerless challenge probe", () => {
    expect(claimedPayerOf(request())).toBe("")
    // The server chooses whether a headerless probe may get a 402. This helper cannot
    // turn an absent payer into permission to create a job.
    expect(delistRefusal({ delisted: true }, claimedPayerOf(request()), CANARY)?.error).toBe("listing_delisted")
  })
})
