import { parsePrice, type PublicListing } from "@arcade/core"
import { validateJson } from "./validate.ts"

export type Example =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly why: string }

type JsonObject = Record<string, unknown>
const no = (why: string): Example => ({ ok: false, why })
const record = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value)
const own = (value: JsonObject, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined
const MAX_DEPTH = 32
const MAX_NODES = 2_048
const MAX_KEYS = 256
const MAX_TEXT = 65_536
const MAX_STRING = 4_096
class UnsafeInput extends Error {}
function refuse(why: string): never { throw new UnsafeInput(why) }

/** Copy only JSON data properties, never getters or inherited state, within a fixed budget. */
const boundedJson = (input: unknown): unknown => {
  let nodes = 0
  let text = 0
  const active = new WeakSet<object>()
  const copy = (value: unknown, depth: number): unknown => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) refuse("input or schema exceeds the canary complexity limit")
    if (value === null || typeof value === "boolean") return value
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      text += value.length
      if (value.length > MAX_STRING || text > MAX_TEXT) refuse("input or schema exceeds the canary size limit")
      return value
    }
    if (typeof value !== "object" || value === null) refuse("input and schema must contain JSON values")
    if (active.has(value)) refuse("input or schema contains a cycle")
    active.add(value)
    try {
      const keys = Object.keys(value)
      if (keys.length > MAX_KEYS || (Array.isArray(value) && value.length > MAX_KEYS)) {
        refuse("input or schema exceeds the canary size limit")
      }
      const out: JsonObject | unknown[] = Array.isArray(value) ? [] : Object.create(null)
      if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index)))) {
        refuse("input arrays must contain JSON values at every index")
      }
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor === undefined || !("value" in descriptor)) refuse("input or schema cannot contain accessors")
        text += key.length
        if (text > MAX_TEXT) refuse("input or schema exceeds the canary size limit")
        const copied = copy(descriptor.value, depth + 1)
        Object.defineProperty(out, key, { value: copied, enumerable: true, writable: true, configurable: true })
      }
      return out
    } finally { active.delete(value) }
  }
  return copy(input, 0)
}

const TYPES = new Set(["object", "array", "string", "integer", "number", "boolean", "null"])
const UNSUPPORTED_DERIVATION = ["$ref", "oneOf", "anyOf", "allOf", "not", "if", "then", "else",
  "dependentSchemas", "dependencies", "patternProperties", "propertyNames", "contains", "prefixItems",
  "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minProperties", "maxProperties", "unevaluatedProperties", "uniqueItems"]

/** The hub uses synchronous RegExp; canaries accept only bounded, fixed-repeat patterns. */
const safePattern = (pattern: string): boolean => {
  if (pattern.length > 256) return false
  let inClass = false
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]
    if (char === "\\") {
      const escaped = pattern[++index]
      if (escaped === undefined || /[1-9kpPuU]/.test(escaped)) return false
      continue
    }
    if (char === "[") inClass = true
    else if (char === "]") inClass = false
    else if (!inClass) {
      if (char === "(" || char === "|" || char === "*" || char === "+" || char === "?") return false
      if (char === "{") {
        const repeat = /^\{(\d{1,4})\}/.exec(pattern.slice(index))
        if (repeat === null || Number(repeat[1]) > MAX_STRING) return false
        index += repeat[0].length - 1
      }
    }
  }
  try { new RegExp(pattern); return true } catch { return false }
}

/** Check shapes the small hub validator otherwise ignores or assumes are well formed. */
const checkSchema = (schema: unknown): JsonObject => {
  if (!record(schema)) refuse("inputSchema must be a JSON schema object")
  const type = own(schema, "type")
  if (type !== undefined && !(typeof type === "string" ? TYPES.has(type) :
    Array.isArray(type) && type.length > 0 && type.every((entry) => typeof entry === "string" && TYPES.has(entry)))) {
    refuse("inputSchema has an unsupported type")
  }
  for (const key of ["minLength", "maxLength", "minItems", "maxItems"]) {
    const value = own(schema, key)
    if (value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
      refuse("inputSchema has invalid length or item bounds")
    }
  }
  for (const key of ["minimum", "maximum"]) {
    const value = own(schema, key)
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) refuse("inputSchema has invalid numeric bounds")
  }
  for (const [min, max] of [["minLength", "maxLength"], ["minItems", "maxItems"], ["minimum", "maximum"]] as const) {
    if (typeof own(schema, min) === "number" && typeof own(schema, max) === "number" &&
      (own(schema, min) as number) > (own(schema, max) as number)) refuse("inputSchema has inconsistent bounds")
  }
  const required = own(schema, "required")
  if (required !== undefined && (!Array.isArray(required) || required.some((key) => typeof key !== "string"))) {
    refuse("inputSchema required properties must be names")
  }
  const props = own(schema, "properties")
  if (props !== undefined) {
    if (!record(props)) refuse("inputSchema properties must be an object")
    for (const sub of Object.values(props)) checkSchema(sub)
  }
  const items = own(schema, "items")
  if (items !== undefined) checkSchema(items)
  const values = own(schema, "enum")
  if (values !== undefined && (!Array.isArray(values) || values.length === 0)) refuse("inputSchema enum must be non-empty")
  // The hub compares enum members by identity, so object members cannot survive a JSON
  // roundtrip as matching inputs. Do not manufacture a local-only success for them.
  if (Array.isArray(values) && values.some((value) => value !== null && typeof value === "object")) {
    refuse("inputSchema object enum cannot be safely checked by this canary")
  }
  const pattern = own(schema, "pattern")
  if (pattern !== undefined && (typeof pattern !== "string" || !safePattern(pattern))) {
    refuse("inputSchema pattern cannot be safely checked by this canary")
  }
  if (own(schema, "format") !== undefined && typeof own(schema, "format") !== "string") refuse("inputSchema format must be a string")
  return schema
}

const failure = (error: unknown): Example => no(error instanceof UnsafeInput ? error.message : "input or schema cannot be safely checked")

/** A declared candidate wins over invention, but it still has to pass the input gate. */
export const exampleFromSchema = (schema: unknown): Example => {
  try {
    const prepared = checkSchema(boundedJson(schema))
    let outputText = 0
    let derivedNodes = 0
    const derive = (s: JsonObject): unknown => {
      if (++derivedNodes > MAX_NODES) refuse("derived input exceeds the canary complexity limit")
      const examples = own(s, "examples")
      if (Array.isArray(examples) && examples.length > 0) return examples[0]
      for (const key of ["example", "default", "const"]) if (Object.hasOwn(s, key)) return s[key]
      const values = own(s, "enum")
      if (Array.isArray(values) && values.length > 0) return values[0]
      if (UNSUPPORTED_DERIVATION.some((key) => Object.hasOwn(s, key))) refuse("inputSchema needs an explicit canaryInput for unsupported constraints")
      const raw = own(s, "type")
      const type = Array.isArray(raw) ? raw[0] : raw
      switch (type) {
        case undefined:
        case "object": {
          const props = own(s, "properties")
          const out: JsonObject = Object.create(null)
          for (const key of new Set((own(s, "required") ?? []) as string[])) {
            if (!record(props) || !Object.hasOwn(props, key)) refuse("a required property has no schema to derive from")
            out[key] = derive(props[key] as JsonObject)
          }
          return out
        }
        case "array":
          if (typeof own(s, "minItems") === "number" && (own(s, "minItems") as number) > 0) refuse("array requires items we cannot invent")
          return []
        case "string": {
          if (Object.hasOwn(s, "pattern") || Object.hasOwn(s, "format")) refuse("string has a pattern or format we cannot satisfy by construction")
          const min = (own(s, "minLength") ?? 0) as number
          const max = (own(s, "maxLength") ?? MAX_STRING) as number
          const length = Math.max(min, Math.min(1, max))
          outputText += length
          if (length > MAX_STRING || outputText > MAX_TEXT) refuse("derived input exceeds the canary size limit")
          return "x".repeat(length)
        }
        case "integer":
        case "number": {
          const min = own(s, "minimum") as number | undefined
          const max = own(s, "maximum") as number | undefined
          const value = type === "integer" ? (min === undefined ? Math.min(0, Math.floor(max ?? 0)) : Math.ceil(min))
            : min ?? Math.min(0, max ?? 0)
          if (!Number.isFinite(value) || (type === "integer" && !Number.isSafeInteger(value)) ||
            (max !== undefined && value > max)) refuse("numeric constraints have no safe canary example")
          return value
        }
        case "boolean": return false
        case "null": return null
        default: return refuse("inputSchema has an unsupported type")
      }
    }
    const value = derive(prepared)
    // Also bound object/array examples selected from schema metadata, without altering
    // identity-sensitive enum behavior in the existing hub validator.
    boundedJson(value)
    return validateJson(value, prepared) ? { ok: true, value }
      : no("the declared or derived example does not satisfy inputSchema")
  } catch (error) { return failure(error) }
}

/** Explicit inputs are checked as supplied; they are never replaced with generated data. */
export const canaryInputFor = (listing: PublicListing): Example => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(listing, "canaryInput")
    if (descriptor !== undefined && !("value" in descriptor)) refuse("declared canaryInput cannot contain accessors")
    const declared: unknown = descriptor?.value
    const schemaDescriptor = Object.getOwnPropertyDescriptor(listing, "inputSchema")
    if (schemaDescriptor === undefined || !("value" in schemaDescriptor)) refuse("inputSchema must be an own data property")
    const schema: unknown = schemaDescriptor.value
    if (declared === undefined) return exampleFromSchema(schema)
    const prepared = checkSchema(boundedJson(schema))
    const value = boundedJson(declared)
    return validateJson(value, prepared) ? { ok: true, value }
      : no("the declared canaryInput does not satisfy this listing's own inputSchema")
  } catch (error) { return failure(error) }
}

/** A skip is a limitation of this hub's automated buyer, not a failed paid call. */
export const payTestSkipReason = (listing: PublicListing, capAtomic: bigint): string | null => {
  try {
    if (parsePrice(listing.price) > capAtomic) return "not pay-tested — priced above this hub's canary cap"
  } catch { return "not pay-tested — listing price is invalid" }
  const input = canaryInputFor(listing)
  return input.ok ? null : `not pay-tested — ${input.why}. Declare a valid canaryInput in arcade.json to enable pay-testing.`
}
