import { describe, expect, it } from "vitest"
import { Bounds, PublicListing, SkillManifest, parsePrice, toPublicListing } from "@arcade/core"
import { Schema } from "effect"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { canaryInputFor, exampleFromSchema, payTestSkipReason } from "../src/canary-input.ts"
import { validateJson } from "../src/validate.ts"

const listing = (over: Partial<PublicListing> = {}): PublicListing => PublicListing.make({
  id: "demo", version: "1.0.0", serviceName: "Demo", description: "d", tags: [], price: "$0.01",
  bounds: Bounds.make({ timeoutSec: 30 }), inputSchema: { type: "object" }, outputSchema: { type: "object" }, ...over
})
const addressSchema = { type: "object", required: ["address"], properties: {
  address: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" }
} }

describe("exampleFromSchema", () => {
  it("prefers and validates examples, example, default, const and enum in order", () => {
    expect(exampleFromSchema({ type: "string", examples: ["first"], example: "second", default: "third" }))
      .toEqual({ ok: true, value: "first" })
    expect(exampleFromSchema({ type: "integer", default: 7 })).toEqual({ ok: true, value: 7 })
    expect(exampleFromSchema({ type: "boolean", example: false })).toEqual({ ok: true, value: false })
    expect(exampleFromSchema({ type: "null", const: null })).toEqual({ ok: true, value: null })
    expect(exampleFromSchema({ enum: ["a", "b"] })).toEqual({ ok: true, value: "a" })
  })
  it.each([{ type: "integer", examples: ["PRIVATE_INPUT"] }, { type: "string", default: 7 },
    { type: "number", const: -1, minimum: 0 }, { type: "string", enum: [0, "valid"] }])(
    "refuses invalid declared candidates without replacing them", (schema) => {
      const result = exampleFromSchema(schema)
      expect(result.ok).toBe(false)
      expect(JSON.stringify(result)).not.toContain("PRIVATE_INPUT")
    }
  )
  it("builds only required properties and preserves the hub validation contract", () => {
    const schema = { type: "object", required: ["name", "count"], properties: {
      name: { type: "string" }, count: { type: "integer", minimum: 2 }, extra: { type: "string" }
    } }
    const result = exampleFromSchema(schema)
    expect(result).toEqual({ ok: true, value: { name: "x", count: 2 } })
    if (result.ok) expect(validateJson(result.value, schema)).toBe(true)
  })
  it("preserves required own keys named __proto__ and constructor without pollution", () => {
    const schema = JSON.parse('{"type":"object","required":["__proto__","constructor"],"properties":{"__proto__":{"type":"string"},"constructor":{"type":"integer"}}}')
    const result = exampleFromSchema(schema)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.hasOwn(result.value as object, "__proto__")).toBe(true)
    expect(Object.hasOwn(result.value as object, "constructor")).toBe(true)
    expect((result.value as Record<string, unknown>)["__proto__"]).toBe("x")
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
  })
  it("ignores inherited schema fields and never uses inherited property schemas", () => {
    expect(exampleFromSchema(Object.create({ type: "string", default: "PRIVATE_INHERITED" }))).toEqual({ ok: true, value: {} })
    const schema = { type: "object", required: ["constructor"], properties: {} }
    expect(exampleFromSchema(schema).ok).toBe(false)
    expect(exampleFromSchema({ type: "object", required: ["x"], properties: Object.create({ x: { type: "string" } }) }).ok).toBe(false)
  })
  it.each([{ type: "string", pattern: "^x$" }, { type: "string", format: "email" }, addressSchema])(
    "refuses to invent patterned or formatted values", (schema) => { expect(exampleFromSchema(schema).ok).toBe(false) }
  )
  it.each([
    [{ type: "string", maxLength: 0 }, ""],
    [{ type: "string", minLength: 0, maxLength: 0 }, ""],
    [{ type: "string", minLength: 3, maxLength: 3 }, "xxx"],
    [{ type: "integer", minimum: 1.2 }, 2],
    [{ type: "integer", minimum: -2.8, maximum: -1.1 }, -2],
    [{ type: "number", minimum: 1.2 }, 1.2],
    [{ type: "number", maximum: -2.5 }, -2.5],
    [{ type: "array" }, []], [{ type: "boolean" }, false], [{ type: "null" }, null]
  ])("derives a bounded value for %j", (schema, value) => {
    expect(exampleFromSchema(schema)).toEqual({ ok: true, value })
    expect(validateJson(value, schema)).toBe(true)
  })
  it.each([
    { type: "string", minLength: 1, maxLength: 0 }, { type: "string", minLength: -1 },
    { type: "string", minLength: 1.5 }, { type: "string", minLength: 1e12 },
    { type: "number", minimum: 2, maximum: 1 }, { type: "integer", minimum: 1.2, maximum: 1.8 },
    { type: "integer", minimum: Number.MAX_VALUE }, { type: "number", minimum: Infinity },
    { type: "array", minItems: 1 }, { type: "array", maxItems: -1 },
    { type: "object", required: [1] }, { type: "object", properties: [] },
    { type: [] }, { type: "PRIVATE_UNSUPPORTED" }, { $ref: "#/private" },
    { oneOf: [{ type: "string" }, { type: "number" }] }, { type: "number", exclusiveMinimum: 0 }
  ])("refuses impossible or unsupported schemas without throwing: %j", (schema) => {
    const result = exampleFromSchema(schema)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain("PRIVATE_UNSUPPORTED")
  })
  it("bounds cyclic, deeply nested and broad schemas without exceptions", () => {
    const cycle: Record<string, unknown> = { type: "object", required: ["child"] }
    cycle["properties"] = { child: cycle }
    let deep: unknown = { type: "string" }
    for (let i = 0; i < 100; i++) deep = { type: "object", required: ["child"], properties: { child: deep } }
    const keys = Array.from({ length: 10_000 }, (_, i) => `key${i}`)
    const broad = { type: "object", required: keys, properties: Object.fromEntries(keys.map((key) => [key, { type: "string" }])) }
    for (const schema of [cycle, deep, broad]) expect(exampleFromSchema(schema).ok).toBe(false)
  })
  it("does not invoke schema accessors", () => {
    let calls = 0
    const schema = Object.defineProperty({}, "default", { enumerable: true, get() { calls++; throw new Error("PRIVATE_GETTER") } })
    expect(exampleFromSchema(schema).ok).toBe(false)
    expect(calls).toBe(0)
  })
  it("does not amplify repeated required keys into exponential derivation", () => {
    let schema: unknown = { type: "string" }
    let value: unknown = "x"
    for (let depth = 0; depth < 8; depth++) {
      schema = { type: "object", required: Array(20).fill("child"), properties: { child: schema } }
      value = { child: value }
    }
    expect(exampleFromSchema(schema)).toEqual({ ok: true, value })
  })
  it("refuses object enum identity that cannot survive the buyer's JSON roundtrip", () => {
    expect(exampleFromSchema({ type: "object", enum: [{ ok: true }] }).ok).toBe(false)
  })
})

describe("canaryInputFor", () => {
  it("uses a declared patterned input after validating it", () => {
    const canaryInput = { address: "0x3600000000000000000000000000000000000000" }
    expect(canaryInputFor(listing({ inputSchema: addressSchema, canaryInput }))).toEqual({ ok: true, value: canaryInput })
  })
  it("refuses invalid declared input without falling back or leaking its value", () => {
    const result = canaryInputFor(listing({ inputSchema: addressSchema, canaryInput: { address: "PRIVATE_BAD_ADDRESS" } }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.why).toContain("declared canaryInput")
    expect(JSON.stringify(result)).not.toContain("PRIVATE_BAD_ADDRESS")
  })
  it("accepts explicit JSON primitives without treating them as missing", () => {
    for (const [type, canaryInput] of [["null", null], ["boolean", false], ["string", ""], ["number", 0]] as const) {
      expect(canaryInputFor(listing({ inputSchema: { type }, canaryInput }))).toEqual({ ok: true, value: canaryInput })
    }
  })
  it("falls back only when canaryInput is absent", () => {
    expect(canaryInputFor(listing())).toEqual({ ok: true, value: {} })
  })
  it("requires real own input keys and rejects cyclic or non-JSON inputs", () => {
    const cycle: Record<string, unknown> = {}; cycle["child"] = cycle
    for (const canaryInput of [Object.create({ address: "0x" + "a".repeat(40) }), cycle, { value: undefined }, { value: Infinity }]) {
      expect(canaryInputFor(listing({ inputSchema: addressSchema, canaryInput })).ok).toBe(false)
    }
  })
  it.each(["(a+)+$", "a|b", ".*", "a{10000}"])("distinguishes unsafe pattern %s from an invalid seller input", (pattern) => {
    const result = canaryInputFor(listing({ inputSchema: { type: "string", pattern }, canaryInput: "PRIVATE_INPUT" }))
    expect(result).toEqual({ ok: false, why: "inputSchema pattern cannot be safely checked by this canary" })
  })
  it("validates explicit fixed-repeat examples without inventing pattern content", () => {
    expect(exampleFromSchema({ type: "string", pattern: "^x{2}$", example: "xx" })).toEqual({ ok: true, value: "xx" })
  })
  it("rejects sparse arrays with custom keys without silently changing their JSON", () => {
    const canaryInput = Array(1)
    Object.defineProperty(canaryInput, "extra", { enumerable: true, value: "x" })
    expect(canaryInputFor(listing({ inputSchema: { type: "array" }, canaryInput })).ok).toBe(false)
  })
})

describe("payTestSkipReason", () => {
  const cap = parsePrice("$0.25")
  it("allows a valid listing at or below the cap", () => {
    expect(payTestSkipReason(listing(), cap)).toBeNull()
    expect(payTestSkipReason(listing({ price: "$0.25" }), cap)).toBeNull()
  })
  it("explains above-cap prices and underivable inputs without exposing their values", () => {
    expect(payTestSkipReason(listing({ price: "$0.30" }), cap)).toContain("cap")
    expect(payTestSkipReason(listing({ inputSchema: addressSchema }), cap)).toContain("canaryInput")
  })
  it("refuses malformed prices without throwing or leaking their values", () => {
    for (const price of ["$0", "PRIVATE_BAD_PRICE"]) {
      const result = payTestSkipReason({ ...listing(), price }, cap)
      expect(result).not.toBeNull()
      expect(result).not.toContain("PRIVATE_BAD_PRICE")
    }
  })
})

describe("first-party listings", () => {
  it("validates all nine declared inputs and skips only the unchanged $0.30 lineage probe at a $0.25 cap", () => {
    const skills = fileURLToPath(new URL("../../../skills", import.meta.url))
    const directories = readdirSync(skills, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    expect(directories).toHaveLength(9)
    for (const directory of directories) {
      const raw: unknown = JSON.parse(readFileSync(join(skills, directory.name, "arcade.json"), "utf8"))
      const pub = toPublicListing(Schema.decodeUnknownSync(SkillManifest)(raw))
      expect(pub.canaryInput, directory.name).toBeDefined()
      expect(canaryInputFor(pub).ok, directory.name).toBe(true)
      expect(validateJson(pub.canaryInput, pub.inputSchema), directory.name).toBe(true)
      if (pub.id === "loop-probe") {
        expect(pub.price).toBe("$0.30")
        expect(payTestSkipReason(pub, parsePrice("$0.25"))).toContain("cap")
      } else expect(payTestSkipReason(pub, parsePrice("$0.25")), directory.name).toBeNull()
    }
  })
})
