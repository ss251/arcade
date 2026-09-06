/** Explicit bounded selection check. Read-only by default; connection/switch is
 * available only from the UI's deliberate remedy, never restored tool output.
 */
import type { Eip1193Provider } from "./wallet.ts"
export interface SelectedPurchaseWallet { readonly buyer: string; readonly provider: Eip1193Provider }
export const readPurchaseWallet = async (provider: Eip1193Provider, network: string,
  options: { readonly signal?: AbortSignal; readonly connect?: boolean } = {}): Promise<Readonly<SelectedPurchaseWallet>> => {
  const controller = new AbortController(), abort = () => controller.abort()
  let external: AbortSignal | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (options === null || typeof options !== "object" || Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw 0
    const values: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(options)) {
      if (key !== "signal" && key !== "connect") throw 0
      const d = Object.getOwnPropertyDescriptor(options, key)
      if (!d?.enumerable || !("value" in d)) throw 0
      values[key] = d.value
    }
    if (values.signal !== undefined && !(values.signal instanceof AbortSignal) ||
      values.connect !== undefined && typeof values.connect !== "boolean") throw 0
    external = values.signal as AbortSignal | undefined
    const request = provider.request, now = performance.now.bind(performance), started = now()
    if (typeof request !== "function" || !/^eip155:[1-9][0-9]{0,15}$/.test(network) || external?.aborted ||
      !Number.isFinite(started) || started < 0 || started > Number.MAX_SAFE_INTEGER - 15000) throw 0
    let last = started
    const check = () => {
      const at = now()
      if (controller.signal.aborted || external?.aborted || !Number.isFinite(at) || at < last || at - started >= 15000) throw 0
      last = at
    }
    timer = setTimeout(abort, 15000); external?.addEventListener("abort", abort, { once: true })
    const step = async <A>(operation: () => Promise<A>): Promise<A> => {
      check()
      const value = await new Promise<A>((resolve, reject) => {
        let done = false
        const finish = (work: () => void) => { if (done) return; done = true; controller.signal.removeEventListener("abort", stop); work() }
        const stop = () => finish(() => reject(0))
        controller.signal.addEventListener("abort", stop, { once: true })
        Promise.resolve().then(() => { check(); return operation() }).then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
        if (controller.signal.aborted) stop()
      })
      check(); return value
    }
    const captured: Eip1193Provider = Object.freeze({ request: (args: Parameters<Eip1193Provider["request"]>[0]) =>
      step(() => request.call(provider, args)) })
    if (values.connect === true) {
      const { connect } = await step(() => import("./wallet.ts"))
      // Each request inside the existing connector crosses the bounded wrapper:
      // a late prompt cannot proceed to an automatic switch after cancellation.
      await step(() => connect(captured))
    }
    const chain = await captured.request({ method: "eth_chainId" })
    if (typeof chain !== "string" || !/^0x[1-9a-fA-F][0-9a-fA-F]{0,15}$/.test(chain) || BigInt(chain) !== BigInt(network.slice(7))) throw 0
    const accounts = await captured.request({ method: "eth_accounts" })
    if (!Array.isArray(accounts) || Object.getPrototypeOf(accounts) !== Array.prototype || accounts.length < 1 || accounts.length > 32 ||
      Reflect.ownKeys(accounts).length !== accounts.length + 1) throw 0
    const capturedAccounts: string[] = []
    for (let i = 0; i < accounts.length; i++) {
      const d = Object.getOwnPropertyDescriptor(accounts, String(i)), a: unknown = d && "value" in d ? d.value : undefined
      if (!d?.enumerable || typeof a !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(a) || /^0x0{40}$/i.test(a)) throw 0
      capturedAccounts.push(a)
    }
    // The operation-bound wrapper is not the retained provider: its deadline
    // expires here. Retain only the original captured trusted request method.
    return Object.freeze({ buyer: capturedAccounts[0]!, provider: Object.freeze({
      request: (args: Parameters<Eip1193Provider["request"]>[0]) => request.call(provider, args)
    }) })
  } catch { throw new Error("Connect a wallet on the quoted network before approving.") }
  finally { if (timer !== undefined) clearTimeout(timer); external?.removeEventListener("abort", abort); controller.abort() }
}
