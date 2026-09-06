/** Browser lifecycle authority, not a server HMAC verifier or an XSS boundary.
 * Only the real Confirm callback may mint in production. Never serialize/store
 * a scope or pass its consumed private request into transcript/model state.
 */
import { parsePrice } from "../../../../packages/core/src/money.ts"
import { capturePurchaseContext, type BrowserPurchaseContext } from "./purchase-context.ts"

declare const approvalBrand: unique symbol
export interface PurchaseApprovalToken { readonly [approvalBrand]: true }
export interface ApprovedPurchase {
  readonly approvalId: string; readonly toolCallId: string; readonly toolName: "arcade_call_skill"
  readonly skillId: string; readonly ceilingAtomic: string; readonly inputJson: string
  readonly context: BrowserPurchaseContext
}
export interface PurchaseApprovalScope {
  approve(value: unknown): PurchaseApprovalToken | undefined
  /** Removes the token before checking the binding. Even a mismatch burns it. */
  consume(token: unknown, binding: unknown): ApprovedPurchase | undefined
  /** Drops unused permits only; cannot revoke a downstream signed authorization. */
  close(): void
}

const LIMIT = 131072, MAX_NODES = 16384, MAX_DEPTH = 32, MAX_APPROVALS = 128, TTL = 300000
const fields = ["approvalId", "toolCallId", "toolName", "skillId", "maxAmountUsd", "input"] as const
const fail = (): never => { throw 0 }
const own = (input: unknown, allowed: readonly string[]): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail()
  const keys = Reflect.ownKeys(input)
  if (keys.length !== allowed.length || keys.some(k => typeof k !== "string" || !allowed.includes(k))) return fail()
  const result: Record<string, unknown> = Object.create(null)
  for (const key of allowed) {
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (!d?.enumerable || !("value" in d)) return fail()
    result[key] = d.value
  }
  return result
}
const text = (value: unknown, max: number): value is string => {
  if (typeof value !== "string" || value.length > max) return false
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(++i)
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false
  }
  return new TextEncoder().encode(value).byteLength <= max
}

/** Serialize only captured own JSON data, without invoking input/prototype hooks.
 * Objects are canonicalized; arrays preserve order. The resulting string is the
 * immutable actual-input snapshot, not a mutable reference to model/UI arguments.
 */
const canonicalInput = (input: unknown): string => {
  if (typeof input === "string") {
    if (!text(input, LIMIT)) return fail()
    input = input.trim() === "" ? {} : JSON.parse(input)
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail()
  let nodes = 0, bytes = 0
  const ancestors = new Set<object>()
  const counted = (fragment: string): string => {
    bytes += new TextEncoder().encode(fragment).byteLength
    return bytes <= LIMIT ? fragment : fail()
  }
  const quoted = (value: string): string => text(value, LIMIT) ? counted(JSON.stringify(value)) : fail()
  const visit = (value: unknown, depth: number): string => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return fail()
    if (value === null) return counted("null")
    if (typeof value === "string") return quoted(value)
    if (typeof value === "boolean") return counted(value ? "true" : "false")
    if (typeof value === "number") return Number.isFinite(value) ? counted(JSON.stringify(value)) : fail()
    if (typeof value !== "object" || ancestors.has(value)) return fail()
    ancestors.add(value)
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) return fail()
        const length = Object.getOwnPropertyDescriptor(value, "length")?.value
        if (!Number.isSafeInteger(length) || length < 0 || length > MAX_NODES || Reflect.ownKeys(value).length !== length + 1) return fail()
        const parts: string[] = []
        counted("[]")
        for (let i = 0; i < length; i++) {
          const d = Object.getOwnPropertyDescriptor(value, String(i))
          if (!d?.enumerable || !("value" in d)) return fail()
          if (i) counted(",")
          parts.push(visit(d.value, depth + 1))
        }
        return `[${parts.join(",")}]`
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail()
      const keys = Reflect.ownKeys(value)
      if (keys.length > MAX_NODES || keys.some(k => typeof k !== "string")) return fail()
      const parts: string[] = []
      counted("{}")
      for (const key of (keys as string[]).sort()) {
        const d = Object.getOwnPropertyDescriptor(value, key)
        if (!d?.enumerable || !("value" in d)) return fail()
        if (parts.length) counted(",")
        parts.push(quoted(key) + counted(":") + visit(d.value, depth + 1))
      }
      return `{${parts.join(",")}}`
    } finally { ancestors.delete(value) }
  }
  return visit(input, 0)
}

type Binding = Omit<ApprovedPurchase, "context">
const captureBinding = (v: Record<string, unknown>): Binding => {
  if (!text(v.approvalId, 512) || !v.approvalId || !text(v.toolCallId, 512) || !v.toolCallId ||
    v.toolName !== "arcade_call_skill" || !text(v.skillId, 64) || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(v.skillId) ||
    !text(v.maxAmountUsd, 100)) return fail()
  const ceiling = parsePrice(v.maxAmountUsd)
  if (ceiling >= 1n << 256n) return fail()
  return { approvalId: v.approvalId, toolCallId: v.toolCallId, toolName: v.toolName,
    skillId: v.skillId, ceilingAtomic: ceiling.toString(), inputJson: canonicalInput(v.input) }
}
const matches = (a: Binding, b: Binding): boolean => a.approvalId === b.approvalId &&
  a.toolCallId === b.toolCallId && a.toolName === b.toolName && a.skillId === b.skillId &&
  a.ceilingAtomic === b.ceilingAtomic && a.inputJson === b.inputJson

export const createPurchaseApprovalScope = (now: () => number = () => performance.now()): PurchaseApprovalScope => {
  let closed = false, lastTime = -1
  let pending = new WeakMap<object, { request: ApprovedPurchase; expiresAt: number }>()
  const seen = new Set<string>()
  const close = () => { closed = true; pending = new WeakMap() }
  const clock = () => {
    const value = now()
    if (!Number.isFinite(value) || value < 0 || value < lastTime || value > Number.MAX_SAFE_INTEGER - TTL) { close(); return fail() }
    lastTime = value; return value
  }
  return Object.freeze({
    approve(value: unknown): PurchaseApprovalToken | undefined {
      if (closed) return undefined
      try {
        const raw = own(value, [...fields, "context"]), binding = captureBinding(raw)
        const context = capturePurchaseContext(raw.context)
        if (!context || context.rail === "test" || context.skillId !== binding.skillId ||
          BigInt(context.amountAtomic) > BigInt(binding.ceilingAtomic)) return undefined
        // Length-delimited identities remain injective even if SDK identifiers
        // contain delimiters or newlines; neither is used as public display text.
        const key = `${binding.approvalId.length}:${binding.approvalId}${binding.toolCallId.length}:${binding.toolCallId}`
        if (seen.has(key) || seen.size >= MAX_APPROVALS) return undefined
        const at = clock(), token = Object.freeze(Object.create(null)) as PurchaseApprovalToken
        const request: ApprovedPurchase = Object.freeze({ ...binding, context })
        seen.add(key); pending.set(token, { request, expiresAt: at + TTL })
        return token
      } catch { return undefined }
    },
    consume(token: unknown, binding: unknown): ApprovedPurchase | undefined {
      if (closed || token === null || typeof token !== "object") return undefined
      const captured = pending.get(token)
      if (!captured) return undefined
      pending.delete(token) // Consume before any validation or downstream wallet work.
      try {
        const current = captureBinding(own(binding, fields))
        if (!matches(captured.request, current) || clock() >= captured.expiresAt) return undefined
        return captured.request
      } catch { return undefined }
    },
    close
  })
}
