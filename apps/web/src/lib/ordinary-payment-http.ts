/** Browser-private, one-shot ordinary submission. Not approval/signature recovery
 * authority. Call only after consuming fresh approval, signing and rechecking terms.
 * Never pass these arguments through SSR/server functions or transcript/model state.
 */
import { parsePrice } from "../../../../packages/core/src/money.ts"
import { capturePurchaseContext } from "./purchase-context.ts"
import { captureStoredJob, type StoredJob } from "./job-store.ts"
import { ordinaryHttp, ORDINARY_BODY_LIMIT, type OrdinaryReadOptions } from "./ordinary-http-transport.ts"

export class OrdinarySubmitFailure extends Error {
  readonly _tag = "OrdinarySubmitFailure"
  readonly code: "not_dispatched" | "submission_uncertain"
  constructor(readonly dispatched: boolean) {
    super(dispatched ? "Purchase submission unconfirmed. The authorization may still be valid; do not retry the payment."
      : "No purchase request was dispatched by this browser. A signed authorization may still exist.")
    this.name = "OrdinarySubmitFailure"
    this.code = dispatched ? "submission_uncertain" : "not_dispatched"
  }
}
const fail = (): never => { throw 0 }
const own = (input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail()
  const keys = Reflect.ownKeys(input)
  if (keys.length > required.length + optional.length || required.some(k => !Object.hasOwn(input, k))) return fail()
  const result: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    if (typeof key !== "string" || !required.includes(key) && !optional.includes(key)) return fail()
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (!d?.enumerable || !("value" in d)) return fail()
    result[key] = d.value
  }
  return result
}
const uint = (value: unknown): value is string => typeof value === "string" && value.length <= 78 &&
  /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < 1n << 256n
const address = (value: unknown): value is string => typeof value === "string" && value.length === 42 &&
  /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value)
const inputText = (value: unknown): string => {
  if (typeof value !== "string" || value.length > ORDINARY_BODY_LIMIT) return fail()
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i)
    if (n >= 0xd800 && n <= 0xdbff) {
      const low = value.charCodeAt(++i)
      if (!(low >= 0xdc00 && low <= 0xdfff)) return fail()
    } else if (n >= 0xdc00 && n <= 0xdfff) return fail()
  }
  if (new TextEncoder().encode(value).byteLength > ORDINARY_BODY_LIMIT) return fail()
  const parsed: unknown = JSON.parse(value)
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return fail()
  return value // Exact H10b1 captured bytes, not a later mutable object re-serialization.
}
const base64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  if (bytes.length > 12288) return fail()
  // btoa consumes bytes, not Unicode text; original description bytes must survive.
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""))
}

export async function submitOrdinaryPayment(input: unknown, options: OrdinaryReadOptions = {},
  fetchFn?: typeof fetch): Promise<Readonly<StoredJob>> {
  let dispatched = false
  try {
    return await ordinaryHttp(() => {
      const value = own(input, ["context", "authorization", "inputJson"])
      const context = capturePurchaseContext(value.context)
      if (!context || context.rail === "test") return fail()
      const a = own(value.authorization, ["from", "to", "value", "validAfter", "validBefore", "nonce", "signature"])
      if (!address(a.from) || !address(a.to) || a.to.toLowerCase() !== context.payTo.toLowerCase() ||
        a.value !== context.amountAtomic || !uint(a.validAfter) || !uint(a.validBefore) ||
        typeof a.nonce !== "string" || a.nonce.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(a.nonce) || /^0x0{64}$/.test(a.nonce) ||
        typeof a.signature !== "string" || a.signature.length !== 132 || !/^0x[0-9a-fA-F]{128}(?:1[bBcC])$/.test(a.signature) ||
        /^0x0{128}/.test(a.signature)) return fail()
      const body = inputText(value.inputJson), wall = Date.now()
      if (!Number.isSafeInteger(wall) || wall < 600000 || wall > Number.MAX_SAFE_INTEGER - 605500000) return fail()
      const current = BigInt(Math.floor(wall / 1000)), after = BigInt(a.validAfter), before = BigInt(a.validBefore)
      const lifetime = BigInt(context.requirements.maxTimeoutSeconds)
      if (after >= before || after > current || before <= current || before > current + lifetime ||
        (context.rail === "gateway" ? before - after > lifetime + 600n : after !== 0n)) return fail()
      const authorization = { from: a.from, to: a.to, value: a.value, validAfter: a.validAfter, validBefore: a.validBefore, nonce: a.nonce }
      const header = base64(JSON.stringify({ x402Version: 2, accepted: context.requirements,
        payload: { authorization, signature: a.signature } }))
      return {
        url: context.hubOrigin + context.resource, method: "POST", body, maximumMs: 10000,
        headers: { accept: "application/json", "content-type": "application/json", "payment-signature": header },
        onDispatch() { dispatched = true },
        project(raw) {
          if (raw.status !== 202) return fail()
          const admitted = own(raw.body, ["job_id", "job_token", "status", "price"], ["poll_url"])
          if (admitted.status !== "queued" || typeof admitted.price !== "string" || admitted.price.length > 100 ||
            parsePrice(admitted.price) !== BigInt(context.amountAtomic)) return fail()
          // Capture exactly once here. Never retain/follow the ignored poll_url.
          const createdAtMs = Date.now()
          if (!Number.isSafeInteger(createdAtMs) || createdAtMs < wall) return fail()
          const row = captureStoredJob({ jobId: admitted.job_id, token: admitted.job_token, skillId: context.skillId,
            priceAtomic: context.amountAtomic, createdAtMs, hubOrigin: context.hubOrigin, realm: "ordinary" })
          if (!row) return fail()
          return Object.freeze(row)
        }
      }
    }, options, fetchFn)
  } catch { throw new OrdinarySubmitFailure(dispatched) }
}
