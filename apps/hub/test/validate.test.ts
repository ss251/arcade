import { describe, expect, it } from "vitest"
import { validateOutput } from "../src/validate.ts"

/**
 * `validateOutput` decides whether a seller gets paid. A false PASS charges a buyer for
 * garbage; a false FAIL costs an honest seller a settlement. It had zero tests, which for
 * the function that gates every payment is the worst place in the codebase to have none.
 */

describe("validateOutput", () => {
  describe("type checking", () => {
    it.each([
      [{ type: "object" }, {}, true],
      [{ type: "object" }, [], false],
      [{ type: "object" }, null, false],
      [{ type: "object" }, "s", false],
      [{ type: "array" }, [], true],
      [{ type: "array" }, {}, false],
      [{ type: "string" }, "x", true],
      [{ type: "string" }, 1, false],
      [{ type: "number" }, 1.5, true],
      [{ type: "number" }, 2, true],
      [{ type: "integer" }, 2, true],
      [{ type: "integer" }, 1.5, false],
      [{ type: "boolean" }, false, true],
      [{ type: "boolean" }, 0, false],
      [{ type: "null" }, null, true]
    ])("%o vs %o -> %s", (schema, value, expected) => {
      expect(validateOutput(value, schema)).toBe(expected)
    })

    it("accepts a union of types", () => {
      const s = { type: ["string", "null"] }
      expect(validateOutput("x", s)).toBe(true)
      expect(validateOutput(null, s)).toBe(true)
      expect(validateOutput(1, s)).toBe(false)
    })
  })

  describe("required properties — the common real-world failure", () => {
    const schema = {
      type: "object",
      required: ["address", "balanceUsdc"],
      properties: { address: { type: "string" }, balanceUsdc: { type: "string" } }
    }

    it("passes when all required keys are present", () => {
      expect(validateOutput({ address: "0x", balanceUsdc: "1.0" }, schema)).toBe(true)
    })

    it("fails on a missing required key", () => {
      expect(validateOutput({ address: "0x" }, schema)).toBe(false)
    })

    it("fails when a present key has the wrong type", () => {
      expect(validateOutput({ address: "0x", balanceUsdc: 1.0 }, schema)).toBe(false)
    })

    it("tolerates extra keys — sellers may return MORE than promised", () => {
      expect(validateOutput({ address: "0x", balanceUsdc: "1.0", extra: 1 }, schema)).toBe(true)
    })

    it("rejects an explicitly-undefined required value", () => {
      // The key passes the `required` check via `in`, but then fails its declared type —
      // which is the outcome we want. `{balanceUsdc: undefined}` is not a valid string, and
      // paying a seller for it would be wrong.
      expect(validateOutput({ address: "0x", balanceUsdc: undefined }, schema)).toBe(false)
    })
  })

  describe("nested and array shapes", () => {
    it("validates array items", () => {
      const s = { type: "array", items: { type: "object", required: ["id"] } }
      expect(validateOutput([{ id: 1 }, { id: 2 }], s)).toBe(true)
      expect(validateOutput([{ id: 1 }, { nope: 2 }], s)).toBe(false)
    })

    it("enforces min/max items", () => {
      expect(validateOutput([1, 2], { type: "array", minItems: 3 })).toBe(false)
      expect(validateOutput([1, 2, 3], { type: "array", minItems: 3 })).toBe(true)
      expect(validateOutput([1, 2, 3, 4], { type: "array", maxItems: 3 })).toBe(false)
    })

    it("recurses into nested objects", () => {
      const s = {
        type: "object",
        required: ["meta"],
        properties: { meta: { type: "object", required: ["ts"], properties: { ts: { type: "string" } } } }
      }
      expect(validateOutput({ meta: { ts: "2026-01-01" } }, s)).toBe(true)
      expect(validateOutput({ meta: { ts: 1 } }, s)).toBe(false)
      expect(validateOutput({ meta: {} }, s)).toBe(false)
    })
  })

  describe("string and number constraints", () => {
    it("enforces string length and pattern", () => {
      expect(validateOutput("abc", { type: "string", minLength: 4 })).toBe(false)
      expect(validateOutput("abcd", { type: "string", minLength: 4 })).toBe(true)
      expect(validateOutput("abcdef", { type: "string", maxLength: 5 })).toBe(false)
      expect(validateOutput("0xabc", { type: "string", pattern: "^0x" })).toBe(true)
      expect(validateOutput("abc", { type: "string", pattern: "^0x" })).toBe(false)
    })

    it("fails closed on an invalid regex rather than passing it", () => {
      // A seller shipping a broken pattern must not accidentally get a free pass.
      expect(validateOutput("x", { type: "string", pattern: "([" })).toBe(false)
    })

    it("enforces numeric bounds", () => {
      expect(validateOutput(5, { type: "number", minimum: 10 })).toBe(false)
      expect(validateOutput(15, { type: "number", maximum: 10 })).toBe(false)
      expect(validateOutput(10, { type: "number", minimum: 10, maximum: 10 })).toBe(true)
    })

    it("enforces enum membership", () => {
      expect(validateOutput("a", { enum: ["a", "b"] })).toBe(true)
      expect(validateOutput("c", { enum: ["a", "b"] })).toBe(false)
    })
  })

  describe("permissive edges — deliberate", () => {
    it("accepts anything when the seller declared no schema", () => {
      expect(validateOutput({ anything: true }, undefined)).toBe(true)
      expect(validateOutput({ anything: true }, null)).toBe(true)
      expect(validateOutput({ anything: true }, {})).toBe(true)
    })

    it("ignores keywords it does not implement rather than rejecting", () => {
      // Unknown keywords must not fail an otherwise-valid output — that would punish a
      // seller for using a richer schema than we support.
      expect(validateOutput({ a: 1 }, { type: "object", additionalProperties: false })).toBe(true)
      expect(validateOutput({ a: 1 }, { type: "object", $ref: "#/x" })).toBe(true)
    })
  })

  describe("the real usdc-flow-check contract", () => {
    const schema = {
      type: "object",
      required: ["address", "balanceUsdc", "chainId"],
      properties: {
        address: { type: "string" },
        balanceUsdc: { type: "string" },
        chainId: { type: "integer" }
      }
    }

    it("accepts the shape the skill actually returns", () => {
      expect(
        validateOutput(
          {
            address: "0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b",
            balanceUsdc: "19.988375",
            balanceAtomic: "19988375",
            nonce: 1,
            isContract: false,
            chainId: 5042002,
            blockNumber: "53530539",
            checkedAt: "2026-07-25T04:19:41.301Z"
          },
          schema
        )
      ).toBe(true)
    })

    it("rejects the error shape the skill returns for a bad address", () => {
      // This is what makes a malformed request cost the buyer nothing.
      expect(validateOutput({ error: "invalid address" }, schema)).toBe(false)
    })
  })
})
