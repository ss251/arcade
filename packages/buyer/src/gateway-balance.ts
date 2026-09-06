import { loadChainConfig } from "@arcade/core"
import { parseFundingAmount } from "./gateway-funding.ts"

export interface GatewayBalanceOptions { readonly fetch?: typeof fetch; readonly signal?: AbortSignal }
const unavailable = (): never => { throw Error("Gateway balance unavailable") }
const own = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return unavailable()
  const result: Record<string, unknown> = Object.create(null), names = Reflect.ownKeys(value)
  if (names.length > 32) return unavailable()
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(value, name)
    if (typeof name !== "string" || !d || !d.enumerable || !("value" in d)) return unavailable()
    result[name] = d.value
  }
  return result
}
const address = (value: unknown): value is string => typeof value === "string" && value.length === 42 && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value)

/** One anonymous selected-Arc-testnet availability read. No signer, key, deposit,
 * RPC, transfer or retry. null means unavailable, NOT zero balance; a successful
 * observation is not a reservation, proof of deposit or settlement guarantee. */
export const readGatewayBalance = async (account: string, options: GatewayBalanceOptions = {}): Promise<bigint | null> => {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined, parent: AbortSignal | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, response: Response | undefined
  let finished = false, onAbort: (() => void) | undefined
  const cancel = () => controller.abort()
  try {
    const opts = own(options)
    if (Object.keys(opts).some(k => !["fetch", "signal"].includes(k)) || !address(account) ||
      opts.fetch !== undefined && typeof opts.fetch !== "function" || opts.signal !== undefined && !(opts.signal instanceof AbortSignal)) return unavailable()
    const fetcher = (opts.fetch ?? globalThis.fetch) as typeof fetch
    parent = opts.signal as AbortSignal | undefined
    if (parent?.aborted) return null
    const config = loadChainConfig(), gateway = config.gateway
    if (config.id !== "arc-testnet" || config.status !== "ready" || config.chainId !== 5042002 || config.caip2 !== "eip155:5042002" ||
      config.usdc.address.toLowerCase() !== "0x3600000000000000000000000000000000000000" || config.usdc.decimals !== 6 ||
      gateway?.domain !== 26 || gateway.facilitatorUrl !== "https://gateway-api-testnet.circle.com") return unavailable()
    const depositor = account.toLowerCase(), domain = gateway.domain, url = `${gateway.facilitatorUrl}/v1/balances`
    const body = JSON.stringify({ token: "USDC", sources: [{ depositor, domain }] })
    parent?.addEventListener("abort", cancel, { once: true })
    timer = setTimeout(cancel, 5000)
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => reject(Error("Gateway balance unavailable"))
      controller.signal.addEventListener("abort", onAbort, { once: true })
    })
    const pending = async () => {
      controller.signal.throwIfAborted()
      const incoming = await fetcher(url, { method: "POST", body, signal: controller.signal, redirect: "error", credentials: "omit",
        headers: { accept: "application/json", "accept-encoding": "identity", "content-type": "application/json" } })
      if (finished || controller.signal.aborted) { void incoming.body?.cancel().catch(() => {}); return unavailable() }
      response = incoming
      if (!incoming.ok || incoming.redirected || incoming.url && incoming.url !== url || !incoming.body ||
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(incoming.headers.get("content-type") ?? "") ||
        incoming.headers.has("content-encoding") && incoming.headers.get("content-encoding") !== "identity") return unavailable()
      const length = incoming.headers.get("content-length")
      if (length !== null && (!/^(0|[1-9][0-9]{0,4})$/.test(length) || Number(length) > 65536)) return unavailable()
      reader = incoming.body.getReader()
      const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0, chunks = 0, text = ""
      for (;;) {
        const part = await reader.read()
        if (finished || controller.signal.aborted) return unavailable()
        if (part.done) break
        if (!(part.value instanceof Uint8Array) || ++chunks > 4096 || (bytes += part.value.byteLength) > 65536 || length !== null && bytes > Number(length)) return unavailable()
        text += decoder.decode(part.value, { stream: true })
      }
      if (length !== null && bytes !== Number(length)) return unavailable()
      const reply = own(JSON.parse(text + decoder.decode()))
      if (reply.token !== "USDC" || !Array.isArray(reply.balances) || reply.balances.length !== 1) return unavailable()
      const row = own(reply.balances[0])
      if (!address(row.depositor) || row.depositor.toLowerCase() !== depositor || row.domain !== domain) return unavailable()
      return parseFundingAmount(row.balance)
    }
    return await Promise.race([pending(), stopped])
  } catch { return null }
  finally {
    finished = true
    if (timer !== undefined) clearTimeout(timer)
    parent?.removeEventListener("abort", cancel)
    if (onAbort) controller.signal.removeEventListener("abort", onAbort)
    controller.abort()
    // An uncooperative cancel cannot extend the whole-operation deadline. The
    // pending branch consumes late replies without granting signing authority.
    try {
      if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock() }
      else if (response?.body) void response.body.cancel().catch(() => {})
    } catch { /* fixed unavailable result; no provider diagnostics */ }
  }
}
