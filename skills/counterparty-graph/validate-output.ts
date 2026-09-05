/** Strict local output contract. Pure/import-safe; unlike the generic hub validator,
 * this also rejects extra keys, getters, prototypes, duplicates and uint256 overflow. */
import { CONTRADICTION_CODES, EVIDENCE_FLAGS, type Assessment } from "./synthesize.ts"

const MAX_UINT = (1n << 256n) - 1n
export const plainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false
  const prototype: unknown = Object.getPrototypeOf(v)
  return prototype === Object.prototype || prototype === null
}
/** Snapshot untrusted plain data without invoking getters or toJSON methods. */
export const copyPlainData = (value: unknown): unknown => {
  let nodes = 0, characters = 0
  const parents = new Set<object>()
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > 50000 || depth > 16) throw new Error("Invalid plain data")
    if (v === null || typeof v === "boolean") return v
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
      characters += v.length
      if (characters > 262144) throw new Error("Invalid plain data")
      return v
    }
    if (typeof v !== "object" || parents.has(v)) throw new Error("Invalid plain data")
    parents.add(v)
    const array = Array.isArray(v)
    if (array ? Object.getPrototypeOf(v) !== Array.prototype : !plainObject(v)) throw new Error("Invalid plain data")
    const length = array ? Object.getOwnPropertyDescriptor(v, "length")?.value as unknown : undefined
    if (array && (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > 10000))
      throw new Error("Invalid plain data")
    const keys = Reflect.ownKeys(v)
    if (keys.length > 10001) throw new Error("Invalid plain data")
    const result: Record<string, unknown> | unknown[] = array ? [] : Object.create(null) as Record<string, unknown>
    for (const key of keys) {
      if (array && key === "length") continue
      if (typeof key !== "string") throw new Error("Invalid plain data")
      const d = Object.getOwnPropertyDescriptor(v, key)
      if (!d || !d.enumerable || !("value" in d)) throw new Error("Invalid plain data")
      if (array && !/^(0|[1-9][0-9]*)$/.test(key)) throw new Error("Invalid plain data")
      Object.defineProperty(result, key, { value: copy(d.value, depth + 1), enumerable: true, writable: true, configurable: true })
    }
    if (array && (result as unknown[]).length !== length) throw new Error("Invalid plain data")
    if (array && keys.length !== Number(length) + 1) throw new Error("Invalid plain data")
    parents.delete(v)
    return result
  }
  return copy(value, 0)
}
const closed = (v: unknown, required: readonly string[], optional: readonly string[] = []): v is Record<string, unknown> =>
  plainObject(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k))
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v)
const address = (v: unknown): v is string => typeof v === "string" && /^0x[a-f0-9]{40}$/.test(v)
const hash = (v: unknown): v is string => typeof v === "string" && /^0x[a-f0-9]{64}$/.test(v) && !/^0x0{64}$/.test(v)
const integer = (v: unknown, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max
export const uint = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) <= MAX_UINT
const optional = (v: unknown, check: (value: unknown) => boolean) => v === null || check(v)
const list = (v: unknown, max: number, check: (value: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.length <= max && v.every(check)
const unique = (v: unknown[], key: (v: unknown) => unknown = x => x) => new Set(v.map(key)).size === v.length
const identity = (v: unknown): boolean => {
  if (!closed(v, ["agentId", "chainId", "owner", "agentWallet", "name", "active", "x402Support", "ens", "supportedTrusts", "validationsPassed", "validationsFailed"])) return false
  return typeof v.agentId === "string" && v.agentId.startsWith("8453:") && uint(v.agentId.slice(5)) &&
    v.chainId === 8453 && address(v.owner) && optional(v.agentWallet, address) && optional(v.name, x => text(x, 256)) &&
    optional(v.ens, x => text(x, 253)) && optional(v.active, x => typeof x === "boolean") && optional(v.x402Support, x => typeof x === "boolean") &&
    list(v.supportedTrusts, 16, x => text(x, 128)) && unique(v.supportedTrusts) &&
    integer(v.validationsPassed, 25) && integer(v.validationsFailed, 25) && v.validationsPassed + v.validationsFailed <= 25
}
const source = (v: unknown): boolean => {
  if (!closed(v, ["name", "endpoint", "subgraphId", "block", "blockHash", "chain", "costAtomic"], ["paymentTx"])) return false
  const subgraph = "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
  return text(v.name, 64) && v.subgraphId === subgraph && v.endpoint === `https://gateway.thegraph.com/api/x402/subgraphs/id/${subgraph}` &&
    v.chain === "eip155:8453" && optional(v.block, x => integer(x, Number.MAX_SAFE_INTEGER)) && optional(v.blockHash, hash) &&
    optional(v.costAtomic, uint) && (!Object.hasOwn(v, "paymentTx") || optional(v.paymentTx, hash))
}
export const assessAddressSchemaOk = (value: unknown): value is Assessment => {
  try {
    const v = copyPlainData(value)
    if (!closed(v, ["address", "verdict", "identities", "attesterSettledCount", "contradictions", "sources", "evidenceFlags"])) return false
    return address(v.address) && ["allow", "manual-review", "refuse"].includes(String(v.verdict)) &&
      list(v.identities, 50, identity) && unique(v.identities, x => (x as Record<string, unknown>).agentId) && integer(v.attesterSettledCount, 100) &&
      list(v.contradictions, 8, x => typeof x === "string" && (CONTRADICTION_CODES as readonly string[]).includes(x)) && unique(v.contradictions) &&
      list(v.evidenceFlags, 12, x => typeof x === "string" && (EVIDENCE_FLAGS as readonly string[]).includes(x)) && unique(v.evidenceFlags) &&
      list(v.sources, 2, source) && unique(v.sources, x => (x as Record<string, unknown>).name) &&
      new TextEncoder().encode(JSON.stringify(v)).byteLength <= 262144
  } catch { return false }
}
