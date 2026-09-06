/** Browser-private one-use composition. Never put this runner's retained request,
 * wallet, authorization or recovery row into SDK messages, SSR or model state.
 * Dependencies are trusted application code, not a caller-selected plugin API.
 */
import type { PurchaseApprovalScope } from "./purchase-approval.ts"
import { capturePurchaseContext } from "./purchase-context.ts"
import { quotePurchaseContext } from "./purchase-quote.ts"
import { OrdinaryPaymentSignFailure, signOrdinaryPayment } from "./ordinary-payment-sign.ts"
import { submitOrdinaryPayment } from "./ordinary-payment-http.ts"
import { readOrdinaryResult, type OrdinaryReadOptions } from "./ordinary-job-http.ts"
import { captureStoredJob, remember, type StoredJob } from "./job-store.ts"
import { decodePurchaseOutcome, type PurchaseOutcome } from "./purchase-outcome.ts"
import type { Eip1193Provider } from "./wallet.ts"

export interface PurchaseRuntime {
  readonly quote: typeof quotePurchaseContext; readonly sign: typeof signOrdinaryPayment
  readonly submit: typeof submitOrdinaryPayment; readonly remember: typeof remember; readonly read: typeof readOrdinaryResult
}
export interface PurchaseView {
  readonly phase: "refused" | "declined" | "unconfirmed" | "checking" | "signing" | "submitting" | "pending" | "settled" | "not_settled"
  readonly message: string; readonly jobId?: string
  readonly recovery?: "stored" | "already_stored" | "recovered" | "invalid" | "unavailable" | "capacity" | "conflict"
  readonly outcome?: Readonly<PurchaseOutcome>
}
const MAX_MS = 300000
const fail = (): never => { throw 0 }
const data = (input: unknown, allowed: readonly string[]): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail()
  const value: Record<string, unknown> = Object.create(null)
  const keys = Reflect.ownKeys(input)
  if (keys.length > allowed.length) return fail()
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.includes(key)) return fail()
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (!d?.enumerable || !("value" in d)) return fail()
    value[key] = d.value
  }
  return value
}
const refused = (): Readonly<PurchaseView> => Object.freeze({ phase: "refused",
  message: "Purchase not started. A fresh confirmation is required." })

export const createPurchaseRunner = (runtime: PurchaseRuntime) => {
  const { quote, sign, submit, remember: store, read } = runtime
  return async (scope: PurchaseApprovalScope, token: unknown, binding: unknown, wallet: unknown,
    options: OrdinaryReadOptions = {}, onUpdate?: (view: Readonly<PurchaseView>) => void): Promise<Readonly<PurchaseView>> => {
    // An async function runs synchronously up to its first await. Burn before IO,
    // options validation, observer callbacks or any other re-entry opportunity.
    let request
    try { request = scope.consume(token, binding) } catch { return refused() }
    if (!request) return refused()
    let signedEntry = false, signingPhase = false, active = true, row: StoredJob | undefined, recovery: PurchaseView["recovery"]
    let timer: ReturnType<typeof setTimeout> | undefined, external: AbortSignal | undefined, abort: (() => void) | undefined
    const controller = new AbortController()
    const view = (phase: PurchaseView["phase"], message: string, outcome?: Readonly<PurchaseOutcome>): Readonly<PurchaseView> => {
      const next = Object.freeze({ phase, message, ...(row ? { jobId: row.jobId } : {}),
        ...(recovery ? { recovery } : {}), ...(outcome ? { outcome } : {}) })
      // Observers are display-only. They cannot add authority or redirect IO.
      try { onUpdate?.(next) } catch { /* UI failure does not retry payment. */ }
      return next
    }
    try {
      const config = data(options, ["signal", "timeoutMs"]), capturedWallet = data(wallet, ["provider", "buyer"])
      const timeoutMs = config.timeoutMs === undefined ? MAX_MS : config.timeoutMs
      if (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_MS ||
        config.signal !== undefined && !(config.signal instanceof AbortSignal)) return fail()
      external = config.signal as AbortSignal | undefined
      const walletProvider = capturedWallet.provider as Eip1193Provider, buyer = capturedWallet.buyer
      const walletRequest = walletProvider?.request
      if (!walletProvider || typeof walletRequest !== "function" || typeof buyer !== "string" ||
        !/^0x[0-9a-fA-F]{40}$/.test(buyer) || /^0x0{40}$/i.test(buyer) || external?.aborted) return fail()
      const provider: Eip1193Provider = Object.freeze({ request: (args: Parameters<Eip1193Provider["request"]>[0]) =>
        walletRequest.call(walletProvider, args) })
      const now = performance.now.bind(performance), started = now()
      if (!Number.isFinite(started) || started < 0 || started > Number.MAX_SAFE_INTEGER - MAX_MS) return fail()
      let last = started
      const deadline = started + timeoutMs, signal = controller.signal
      const remaining = (maximum: number) => {
        const current = now()
        if (!active || signal.aborted || external?.aborted || !Number.isFinite(current) || current < last || current >= deadline) return fail()
        last = current
        const left = Math.floor(Math.min(maximum, deadline - current))
        return left >= 1 ? left : fail()
      }
      abort = () => controller.abort()
      external?.addEventListener("abort", abort, { once: true })
      timer = setTimeout(abort, timeoutMs)
      const wait = <A>(pending: Promise<A>, budget: number): Promise<A> => new Promise((resolve, reject) => {
        let done = false
        const finish = (work: () => void) => {
          if (done) return
          done = true; clearTimeout(stepTimer); signal.removeEventListener("abort", stopped); work()
        }
        const stopped = () => finish(() => reject(0))
        const stepTimer = setTimeout(() => controller.abort(), budget)
        signal.addEventListener("abort", stopped, { once: true })
        pending.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
        if (signal.aborted) stopped()
      })
      const step = async <A>(maximum: number, operation: (opts: OrdinaryReadOptions) => Promise<A>): Promise<A> => {
        const budget = remaining(maximum), result = await wait(operation({ signal, timeoutMs: budget }), budget)
        remaining(MAX_MS); return result
      }
      const delay = () => new Promise<void>((resolve, reject) => {
        remaining(MAX_MS)
        const stop = () => { clearTimeout(pause); signal.removeEventListener("abort", stop); reject(0) }
        const pause = setTimeout(() => { signal.removeEventListener("abort", stop); resolve() }, 1000)
        signal.addEventListener("abort", stop, { once: true })
        if (signal.aborted) stop()
      })
      const unchanged = async () => {
        const fresh = capturePurchaseContext(await step(25000, opts => quote(request.skillId, request.inputJson, opts)))
        return fresh !== undefined && JSON.stringify(fresh) === JSON.stringify(request.context)
      }
      view("checking", "Checking the approved purchase terms.")
      if (!await unchanged()) return view("refused", "Purchase terms changed. Confirm the new terms before signing.")
      view("signing", "Review the exact authorization in your wallet.")
      // Mark possible signing only at the actual dependency boundary, after check.
      const authorization = Object.freeze({ ...await step(120000, opts => {
        signedEntry = true; signingPhase = true; return sign(provider, request.context, buyer, opts)
      }) })
      signingPhase = false
      if (!await unchanged()) return view("unconfirmed", "Purchase terms changed after signing. Nothing was forwarded; the signature may still be valid.")
      view("submitting", "Submitting once. Do not repeat the payment.")
      const accepted = captureStoredJob(await step(10000, opts => submit({ context: request.context, authorization, inputJson: request.inputJson }, opts)))
      if (!accepted || accepted.hubOrigin !== request.context.hubOrigin || accepted.skillId !== request.skillId ||
        accepted.priceAtomic !== request.context.amountAtomic) return fail()
      row = Object.freeze(accepted)
      // Persist before an admission observer or first poll can navigate away.
      recovery = "unavailable"
      try {
        const result = store(row)
        if (result.status === "stored") recovery = result.recovered ? "recovered" : "stored"
        else if (["already_stored", "invalid", "unavailable", "capacity", "conflict"].includes(result.status)) recovery = result.status
      } catch { /* Keep this accepted capability only in private RAM for this run. */ }
      view("pending", "The hub accepted this job. Checking its reported outcome.")
      for (let attempt = 0; attempt < 60; attempt++) {
        const response = await step(90000, opts => read(row, opts))
        if (response.status === 200) {
          const outcome = decodePurchaseOutcome(response.body, { row, context: request.context, buyer, nonce: authorization.nonce })
          if (!outcome || [authorization.signature, authorization.nonce].some(secret =>
            outcome.resultJson?.toLowerCase().includes(secret.toLowerCase()))) return fail()
          return view(outcome.settled ? "settled" : "not_settled", outcome.settled
            ? "The hub reports settlement. This browser has not independently verified it on chain."
            : "The hub reports no settlement. This is not independent proof of no charge.", outcome)
        }
        const pending = data(response.body, ["job_id", "status"])
        if (response.status !== 202 || pending.job_id !== row.jobId || pending.status !== "pending") return fail()
        if (attempt < 59) await delay()
      }
      return fail()
    } catch (error) {
      if (signingPhase && error instanceof OrdinaryPaymentSignFailure && error.code !== "signing_uncertain")
        return view(error.code, error.code === "declined"
          ? "The wallet reported a declined signature. This browser did not submit it."
          : "Wallet authorization unavailable; this browser did not request a signature.")
      return signedEntry ? view("unconfirmed", "Purchase outcome unconfirmed. An authorization or job may still be active; do not repeat the payment.") : refused()
    } finally {
      active = false; if (timer !== undefined) clearTimeout(timer)
      if (abort) external?.removeEventListener("abort", abort)
      controller.abort()
    }
  }
}

/** Passive default composition. No operation occurs until a consumed approval run. */
export const runPurchase = createPurchaseRunner(Object.freeze({ quote: quotePurchaseContext, sign: signOrdinaryPayment,
  submit: submitOrdinaryPayment, remember, read: readOrdinaryResult }))
