/** Optional public address convenience only. Invoke on a user click, never an
 * effect. No wallet authentication, signing, chain switching or payment. */
import { addressOk } from "./hub-decode.ts"

export const requestSellerAddress = async (provider: unknown, signal?: AbortSignal): Promise<string | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
  let live = true
  try {
    if (signal !== undefined && !(signal instanceof AbortSignal) || signal?.aborted ||
      provider === null || typeof provider !== "object" || Array.isArray(provider)) return null
    const request = (provider as { request?: unknown }).request
    if (typeof request !== "function") return null
    const now = performance.now.bind(performance), started = now()
    if (!Number.isFinite(started) || started < 0 || started > Number.MAX_SAFE_INTEGER - 15000) return null
    const output = await new Promise<unknown>(resolve => {
      let done = false
      const finish = (value: unknown) => { if (!done) { done = true; resolve(value) } }
      abort = () => finish(null)
      signal?.addEventListener("abort", abort, { once: true })
      timer = setTimeout(abort, 15000)
      if (signal?.aborted) { finish(null); return }
      // Capture the actual method/receiver; late completion is observed but cannot win.
      try { Promise.resolve(request.call(provider, { method: "eth_requestAccounts" })).then(finish, () => finish(null)) }
      catch { finish(null) }
    })
    const at = now()
    if (!live || signal?.aborted || !Number.isFinite(at) || at < started || at >= started + 15000 ||
      !Array.isArray(output) || output.length < 1 || output.length > 32 || Reflect.ownKeys(output).length !== output.length + 1) return null
    const accounts: string[] = []
    for (let i = 0; i < output.length; i++) {
      const d = Object.getOwnPropertyDescriptor(output, String(i))
      if (!d?.enumerable || !("value" in d) || !addressOk(d.value)) return null
      accounts.push(d.value)
    }
    return accounts[0] ?? null
  } catch { return null }
  finally {
    live = false
    if (timer !== undefined) clearTimeout(timer)
    if (abort) signal?.removeEventListener("abort", abort)
  }
}
