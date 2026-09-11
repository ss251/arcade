/** Honest display seeds: schema examples/defaults, or clearly identified scaffolding. */
export interface SchemaExample { readonly kind: "example" | "default" | "template" | "blank"; readonly json: string }
const record = (value: unknown): value is object => value !== null && typeof value === "object" &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const own = (value: object, key: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(value, key)
  if (d !== undefined && (!d.enumerable || !("value" in d))) throw Error("Unsupported schema")
  return d?.value
}
/** Copy only bounded plain data; getters, toJSON hooks and cycles never execute. */
const copy = (value: unknown): unknown => {
  let nodes = 0
  const active = new Set<object>()
  const walk = (v: unknown, depth: number): unknown => {
    if (++nodes > 256 || depth > 8) throw Error("Example exceeds preview bounds")
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.length <= 8192) return v
    if (typeof v !== "object" || v === null || active.has(v)) throw Error("Unsupported example")
    active.add(v)
    try {
      if (Array.isArray(v)) {
        const length = Object.getOwnPropertyDescriptor(v, "length")?.value
        if (!Number.isSafeInteger(length) || length > 64) throw Error("Unsupported array")
        return Array.from({ length }, (_, i) => walk(own(v, String(i)), depth + 1))
      }
      if (!record(v)) throw Error("Unsupported object")
      const keys = Reflect.ownKeys(v), out: Record<string, unknown> = Object.create(null)
      if (keys.length > 64) throw Error("Unsupported object")
      for (const key of keys) {
        if (typeof key !== "string" || ["__proto__", "constructor", "prototype", "toJSON"].includes(key)) throw Error("Unsupported field")
        out[key] = walk(own(v, key), depth + 1)
      }
      return out
    } finally { active.delete(v) }
  }
  const result = walk(value, 0)
  if (JSON.stringify(result).length > 16384) throw Error("Example too large")
  return result
}

export function schemaExample(schema: unknown, input = false): SchemaExample {
  const blank: SchemaExample = { kind: "blank", json: input ? "{}" : "null" }
  try {
    if (!record(schema)) return blank
    const examples = own(schema, "examples")
    const example = Array.isArray(examples) ? own(examples, "0") : undefined
    for (const [kind, value] of [["example", example], ["default", own(schema, "default")]] as const) {
      if (value === undefined) continue
      const copied = copy(value)
      if (!input || record(copied)) return { kind, json: JSON.stringify(copied, null, 2) }
    }
    let nodes = 0
    const build = (raw: unknown, depth: number): unknown => {
      if (++nodes > 48 || depth > 4 || !record(raw)) throw Error("No safe template")
      if (["$ref", "allOf", "anyOf", "oneOf", "if", "then", "else"].some(key => own(raw, key) !== undefined)) throw Error("Complex schema")
      const defaultValue = own(raw, "default")
      if (defaultValue !== undefined) return copy(defaultValue)
      const enumValues = own(raw, "enum")
      if (Array.isArray(enumValues) && own(enumValues, "0") !== undefined) return copy(own(enumValues, "0"))
      const type = own(raw, "type")
      if (type === "string") return ""
      if (type === "number" || type === "integer") return 0
      if (type === "boolean") return false
      if (type === "null") return null
      if (type === "array") return []
      if (type !== "object") throw Error("Unknown type")
      const properties = own(raw, "properties")
      if (properties === undefined) return {}
      if (!record(properties)) throw Error("Unsupported properties")
      const keys = Reflect.ownKeys(properties)
      if (keys.length > 16) throw Error("Too many fields")
      const out: Record<string, unknown> = Object.create(null)
      for (const key of keys) {
        if (typeof key !== "string" || ["__proto__", "constructor", "prototype", "toJSON"].includes(key)) throw Error("Unsupported field")
        out[key] = build(own(properties, key), depth + 1)
      }
      return out
    }
    const template = build(schema, 0)
    return input && !record(template) ? blank : { kind: "template", json: JSON.stringify(template, null, 2) }
  } catch { return blank }
}
