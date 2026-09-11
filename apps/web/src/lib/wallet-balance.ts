/** Explicit, read-only ERC-20 balance snapshot. No signatures, native units or retries. */
import { loadChainConfig } from "../../../../packages/core/src/chain-config.ts"
import { readPurchaseWallet } from "./purchase-wallet.ts"
import type { Eip1193Provider } from "./wallet.ts"

export interface WalletBalance {
  readonly buyer: string; readonly network: string; readonly token: string
  readonly atomic: string; readonly checkedAt: number
}
export const WALLET_BALANCE_TIMEOUT = 15_000
export async function readWalletBalance(provider: Eip1193Provider, options: {
  readonly connect?: boolean; readonly signal?: AbortSignal
} = {}): Promise<Readonly<WalletBalance>> {
  const controller = new AbortController(), abort = () => controller.abort()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cleanup = () => {}
  let external: AbortSignal | undefined
  try {
    if (options === null || typeof options !== "object" || Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw 0
    const values: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(options)) {
      if (key !== "signal" && key !== "connect") throw 0
      const descriptor = Object.getOwnPropertyDescriptor(options, key)
      if (!descriptor?.enumerable || !("value" in descriptor)) throw 0
      values[key] = descriptor.value
    }
    if (values.signal !== undefined && !(values.signal instanceof AbortSignal) ||
      values.connect !== undefined && typeof values.connect !== "boolean") throw 0
    external = values.signal as AbortSignal | undefined
    if (external?.aborted) throw 0
    const cfg = loadChainConfig(), request = provider.request
    if (cfg.status !== "ready" || cfg.usdc.decimals !== 6 || typeof request !== "function" ||
      /^0x0{40}$/i.test(cfg.usdc.address)) throw 0
    external?.addEventListener("abort", abort, { once: true })
    timer = setTimeout(abort, WALLET_BALANCE_TIMEOUT)
    const check = () => { if (controller.signal.aborted || external?.aborted || provider.request !== request) throw 0 }
    const step = async <A>(operation: () => Promise<A>): Promise<A> => {
      check()
      const result = await new Promise<A>((resolve, reject) => {
        let done = false
        const finish = (work: () => void) => { if (done) return; done = true; controller.signal.removeEventListener("abort", stop); work() }
        const stop = () => finish(() => reject(0))
        controller.signal.addEventListener("abort", stop, { once: true })
        Promise.resolve().then(() => { check(); return operation() }).then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
        if (controller.signal.aborted) stop()
      })
      check(); return result
    }
    const before = await step(() => readPurchaseWallet(provider, cfg.caip2, {
      signal: controller.signal, ...(values.connect === true ? { connect: true } : {})
    }))
    const eventProvider = provider as Eip1193Provider & { removeListener?: (event: string, listener: () => void) => void }
    if (eventProvider.on && eventProvider.removeListener) {
      cleanup = () => {
        try { eventProvider.removeListener?.("accountsChanged", abort); eventProvider.removeListener?.("chainChanged", abort) } catch { /* Optional provider cleanup. */ }
      }
      try { eventProvider.on("accountsChanged", abort); eventProvider.on("chainChanged", abort) }
      catch { cleanup() }
    }
    const data = `0x70a08231${before.buyer.slice(2).toLowerCase().padStart(64, "0")}`
    const result = await step(() => before.provider.request({ method: "eth_call", params: [
      { to: cfg.usdc.address, data }, "latest"
    ] }))
    if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result)) throw 0
    const after = await step(() => readPurchaseWallet(provider, cfg.caip2, { signal: controller.signal }))
    if (before.buyer.toLowerCase() !== after.buyer.toLowerCase()) throw 0
    check()
    return Object.freeze({ buyer: before.buyer, network: cfg.caip2, token: cfg.usdc.address,
      atomic: BigInt(result).toString(), checkedAt: Date.now() })
  } catch { throw new Error("The wallet balance could not be verified. Check your account and Arc network, then try again.") }
  finally { cleanup(); if (timer !== undefined) clearTimeout(timer); external?.removeEventListener("abort", abort); controller.abort() }
}

/** Exact six-decimal ERC-20 units. Zero is a real balance, never an unavailable state. */
export function formatWalletUsdc(atomic: string): string {
  const value = BigInt(atomic), fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "")
  return `${value / 1_000_000n}${fraction ? `.${fraction}` : ""}`
}
