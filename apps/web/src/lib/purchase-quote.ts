/** Fixed same-origin actual-input/ENS quote. No signature, capability or approval
 * authority; import is inert and only an explicit browser call reads location.
 */
import { parsePrice } from "../../../../packages/core/src/money.ts"
import { capturePurchaseInput } from "./purchase-approval.ts"
import { capturePurchaseContext, type BrowserPurchaseContext } from "./purchase-context.ts"
import { ordinaryHttp, ORDINARY_BODY_LIMIT, type OrdinaryReadOptions } from "./ordinary-http-transport.ts"
import { capturePurchaseTarget } from "./purchase-target.ts"
import { addressOk } from "./hub-decode.ts"

const fail = (): never => { throw 0 }
export class PurchaseQuoteFailure extends Error {
  constructor(readonly code: "ens_name_expired" | "ens_payto_mismatch", ensPayTo?: string, challengePayTo?: string) {
    super(code === "ens_name_expired"
      ? "The ENS name has expired. Request a fresh resolution after renewal; no payment was started."
      : `ENS payTo ${ensPayTo} differs from the payment challenge payTo ${challengePayTo}. No payment was started.`)
  }
}
export async function quotePurchaseContext(targetInput: unknown, input: unknown, options: OrdinaryReadOptions = {},
  fetchFn?: typeof fetch): Promise<BrowserPurchaseContext> {
  try {
    const result = await ordinaryHttp(() => {
      const rawTarget = typeof targetInput === "string" ? { skillId: targetInput } : targetInput
      const target = capturePurchaseTarget(rawTarget)
      if (!target || Reflect.ownKeys(rawTarget as object).length !== 1) return fail()
      const captured = capturePurchaseInput(input)
      if (captured === undefined) return fail()
      const body = JSON.stringify(target).slice(0, -1) + ',"input":' + captured + '}'
      if (new TextEncoder().encode(body).byteLength > ORDINARY_BODY_LIMIT) return fail()
      const origin = globalThis.location?.origin
      if (typeof origin !== "string" || origin.length > 2048 || /[\s\\%?#]/.test(origin)) return fail()
      const url = new URL(origin)
      if (url.origin !== origin || url.username || url.password ||
        !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return fail()
      return {
        url: origin + "/api/quote", method: "POST", body, maximumMs: 25000,
        headers: { accept: "application/json", "content-type": "application/json" },
        project(raw) {
          if (raw.body === null || typeof raw.body !== "object" || Array.isArray(raw.body) ||
            ![Object.prototype, null].includes(Object.getPrototypeOf(raw.body))) return fail()
          const field = (key: string) => {
            const d = Object.getOwnPropertyDescriptor(raw.body, key)
            if (d !== undefined && (!d.enumerable || !("value" in d))) return fail()
            return d?.value
          }
          // ordinaryHttp intentionally contains thrown diagnostics. Return only
          // this closed refusal as data, then unwrap after transport completion.
          if (raw.status === 502) {
            const code = field("error")
            if (code === "ens_name_expired") return new PurchaseQuoteFailure(code)
            const ensPayTo = field("ensPayTo"), challengePayTo = field("challengePayTo")
            if (code === "ens_payto_mismatch" && addressOk(ensPayTo) && addressOk(challengePayTo) &&
                ensPayTo.toLowerCase() !== challengePayTo.toLowerCase()) return new PurchaseQuoteFailure(code, ensPayTo, challengePayTo)
            return fail()
          }
          if (raw.status !== 200) return fail()
          const values: Record<string, unknown> = Object.create(null)
          for (const key of ["skillId", "price", "amountAtomic", "payTo", "network", "asset", "browser", "ensName"]) {
            const d = Object.getOwnPropertyDescriptor(raw.body, key)
            if (d !== undefined && (!d.enumerable || !("value" in d))) return fail()
            values[key] = d?.value
          }
          const context = capturePurchaseContext(values.browser)
          if (!context || values.skillId !== context.skillId ||
            (target.name === undefined ? values.skillId !== target.skillId : context.ensName !== target.name) ||
            values.amountAtomic !== context.amountAtomic || values.payTo !== context.payTo || values.network !== context.network ||
            values.asset !== context.asset || values.ensName !== context.ensName ||
            typeof values.price !== "string" || values.price.length > 100 || parsePrice(values.price) !== BigInt(context.amountAtomic)) return fail()
          return context
        }
      }
    }, options, fetchFn)
    if (result instanceof PurchaseQuoteFailure) throw result
    return result
  } catch (error) {
    if (error instanceof PurchaseQuoteFailure) throw error
    throw new Error("Purchase terms unavailable")
  }
}
