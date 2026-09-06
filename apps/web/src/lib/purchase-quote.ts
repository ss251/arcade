/** Fixed same-origin actual-input/ENS quote. No signature, capability or approval
 * authority; import is inert and only an explicit browser call reads location.
 */
import { parsePrice } from "../../../../packages/core/src/money.ts"
import { capturePurchaseInput } from "./purchase-approval.ts"
import { capturePurchaseContext, type BrowserPurchaseContext } from "./purchase-context.ts"
import { ordinaryHttp, ORDINARY_BODY_LIMIT, type OrdinaryReadOptions } from "./ordinary-http-transport.ts"

const fail = (): never => { throw 0 }
export async function quotePurchaseContext(skillId: unknown, input: unknown, options: OrdinaryReadOptions = {},
  fetchFn?: typeof fetch): Promise<BrowserPurchaseContext> {
  try {
    return await ordinaryHttp(() => {
      if (typeof skillId !== "string" || skillId.length > 64 || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(skillId)) return fail()
      const captured = capturePurchaseInput(input)
      if (captured === undefined) return fail()
      const body = '{"skillId":' + JSON.stringify(skillId) + ',"input":' + captured + '}'
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
          if (raw.status !== 200 || raw.body === null || typeof raw.body !== "object" || Array.isArray(raw.body) ||
            ![Object.prototype, null].includes(Object.getPrototypeOf(raw.body))) return fail()
          const values: Record<string, unknown> = Object.create(null)
          for (const key of ["skillId", "price", "amountAtomic", "payTo", "network", "asset", "browser", "ensName"]) {
            const d = Object.getOwnPropertyDescriptor(raw.body, key)
            if (d !== undefined && (!d.enumerable || !("value" in d))) return fail()
            values[key] = d?.value
          }
          const context = capturePurchaseContext(values.browser)
          if (!context || values.skillId !== skillId || context.skillId !== skillId ||
            values.amountAtomic !== context.amountAtomic || values.payTo !== context.payTo || values.network !== context.network ||
            values.asset !== context.asset || values.ensName !== context.ensName ||
            typeof values.price !== "string" || values.price.length > 100 || parsePrice(values.price) !== BigInt(context.amountAtomic)) return fail()
          return context
        }
      }
    }, options, fetchFn)
  } catch { throw new Error("Purchase terms unavailable") }
}
