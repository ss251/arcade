/**
 * Minimal JSON Schema validation, shared by the hub's input gate (against `inputSchema`,
 * before any payment work) and settlement (against `outputSchema`).
 *
 * Deliberately small and dependency-free: it covers the subset a skill manifest can declare
 * (type, required, properties, items, enum, min/max). A seller writing an exotic schema gets
 * a conservative verdict — unknown keywords are ignored rather than assumed satisfied, and
 * anything structurally wrong fails, which is the safe direction: a false "invalid" costs
 * the seller a settlement, never the buyer money.
 */


/** Longest listing-supplied `pattern` this validator will run. See the note at its use. */
const PATTERN_MAX = 200
/** Longest caller-supplied string this validator will match a pattern against. */
const PATTERN_VALUE_MAX = 4096
type Json = unknown

const typeOf = (v: Json): string => {
  if (v === null) return "null"
  if (Array.isArray(v)) return "array"
  if (Number.isInteger(v as number) && typeof v === "number") return "integer"
  return typeof v
}

const matchesType = (v: Json, t: string): boolean => {
  const actual = typeOf(v)
  if (t === "number") return actual === "number" || actual === "integer"
  if (t === "integer") return actual === "integer"
  return actual === t
}

export const validateJson = (value: Json, schema: Json): boolean => {
  if (schema === undefined || schema === null) return true
  if (typeof schema !== "object" || Array.isArray(schema)) return true
  const s = schema as Record<string, Json>

  if (typeof s["type"] === "string" && !matchesType(value, s["type"])) return false
  if (Array.isArray(s["type"]) && !(s["type"] as Array<string>).some((t) => matchesType(value, t))) {
    return false
  }

  if (Array.isArray(s["enum"]) && !(s["enum"] as Array<Json>).some((e) => e === value)) return false

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, Json>
    const required = s["required"]
    if (Array.isArray(required)) {
      for (const key of required as Array<string>) {
        if (!(key in obj)) return false
      }
    }
    const props = s["properties"]
    if (props !== undefined && typeof props === "object" && props !== null) {
      for (const [key, sub] of Object.entries(props as Record<string, Json>)) {
        if (key in obj && !validateJson(obj[key], sub)) return false
      }
    }
  }

  if (Array.isArray(value)) {
    const items = s["items"]
    if (items !== undefined) {
      for (const el of value) if (!validateJson(el, items)) return false
    }
    if (typeof s["minItems"] === "number" && value.length < (s["minItems"] as number)) return false
    if (typeof s["maxItems"] === "number" && value.length > (s["maxItems"] as number)) return false
  }

  if (typeof value === "string") {
    if (typeof s["minLength"] === "number" && value.length < (s["minLength"] as number)) return false
    if (typeof s["maxLength"] === "number" && value.length > (s["maxLength"] as number)) return false
    if (typeof s["pattern"] === "string") {
      /*
       * Both sides of this match are untrusted, and it runs BEFORE payment.
       *
       * The pattern comes from a seller's listing manifest — anyone who controls an address
       * can publish one — and the value comes from an unpaid request body. JavaScript's
       * regex engine backtracks, so a pattern like `^(a+)+$` against a few dozen characters
       * is minutes of blocked event loop, and the hub is single-threaded. Measured in Bun:
       * 40 characters is 430ms and each further character roughly doubles it.
       *
       * Bounding the inputs is what makes the match affordable without replacing the
       * engine. A pattern longer than PATTERN_MAX cannot be honoured, and a value longer
       * than PATTERN_VALUE_MAX is rejected rather than matched — refusing is safe here
       * because this gate exists to reject malformed input, so failing closed on input
       * nobody can afford to check keeps the meaning it already had. A short pattern can
       * still backtrack, but over a bounded value the worst case is bounded too.
       */
      const pattern = s["pattern"] as string
      if (pattern.length > PATTERN_MAX || value.length > PATTERN_VALUE_MAX) return false
      try {
        if (!new RegExp(pattern).test(value)) return false
      } catch {
        return false
      }
    }
  }

  if (typeof value === "number") {
    if (typeof s["minimum"] === "number" && value < (s["minimum"] as number)) return false
    if (typeof s["maximum"] === "number" && value > (s["maximum"] as number)) return false
  }

  return true
}

/** Kept for existing call sites; settlement validation and input validation are the same check. */
export const validateOutput = validateJson
