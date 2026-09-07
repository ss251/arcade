/** Process-owned SDK Gateway IO. Not a shared-server/global import-time hook.
 * RPC clients must use their separately captured, guarded transport. */
const ORIGIN = "https://gateway-api-testnet.circle.com/v1/"
const fail = (): never => { throw new Error("unified_network_refused") }
export interface UnifiedGatewayBoundaryOptions {
  readonly request: (url: string, init: RequestInit) => Promise<Response>
  readonly signal: AbortSignal
  readonly deadlineMs: number
  /** Bind the serialized final signed intent before the sole transfer dispatch.
   * The callback must not itself perform a transfer or log its body. */
  readonly beforeTransfer: (body: string) => Promise<void>
}
export interface UnifiedGatewayBoundary {
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  readonly close: () => void
}
export const createUnifiedGatewayBoundary = (options: UnifiedGatewayBoundaryOptions): UnifiedGatewayBoundary => {
  const { request, beforeTransfer, signal, deadlineMs } = options
  if (!Number.isFinite(deadlineMs) || deadlineMs <= performance.now() || deadlineMs > performance.now() + 330000) return fail()
  let closed = false, transferClaimed = false, requests = 0
  const active = new Set<AbortController>()
  const check = () => { if (closed || signal.aborted || performance.now() >= deadlineMs) return fail() }
  return Object.freeze({
    close() { closed = true; for (const controller of active) controller.abort() },
    async fetch(input: RequestInfo | URL, init: RequestInit = {}) {
      let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let onAbort: (() => void) | undefined, onInputAbort: (() => void) | undefined
      let upstreamSignal: AbortSignal | undefined
      try {
        check()
        // The pinned SDK uses literal URL strings and scalar JSON. Refuse a
        // Request/stream rather than consuming, cloning or coercing a capability.
        if (typeof input !== "string") return fail()
        const method = init.method ?? "GET", body = init.body
        const read = input === ORIGIN + "info" && method === "GET"
        const post = [ORIGIN + "balances", ORIGIN + "estimate", ORIGIN + "transfer"].includes(input) && method === "POST"
        if (!read && !post || read && body !== undefined || post && (typeof body !== "string" || new TextEncoder().encode(body).length > 16384)) return fail()
        if (++requests > 64) return fail()
        if (input === ORIGIN + "transfer") {
          if (transferClaimed) return fail()
          transferClaimed = true
        }
        controller = new AbortController()
        const owned = controller
        active.add(owned)
        upstreamSignal = init.signal ?? undefined
        const aborted = new Promise<never>((_resolve, reject) => {
          onAbort = () => {
            // Timers can fire slightly before a fractional monotonic deadline.
            // An aborted request retires the capability immediately, not only
            // after a subsequent clock comparison.
            closed = true
            if (reader) void reader.cancel().catch(() => {})
            reject(new Error("unified_network_refused"))
          }
          owned.signal.addEventListener("abort", onAbort, { once: true })
        })
        onInputAbort = () => owned.abort()
        signal.addEventListener("abort", onInputAbort, { once: true })
        upstreamSignal?.addEventListener("abort", onInputAbort, { once: true })
        timer = setTimeout(() => owned.abort(), Math.max(1, Math.min(5000, deadlineMs - performance.now())))
        if (signal.aborted || upstreamSignal?.aborted) owned.abort()
        const stillActive = () => { check(); if (owned.signal.aborted) return fail() }
        const work = async () => {
          stillActive()
          if (input === ORIGIN + "transfer") { await beforeTransfer(body as string); stillActive() }
          const response = await request(input, { method, ...(post ? { body } : {}), signal: owned.signal,
            redirect: "error", credentials: "omit",
            headers: { "content-type": "application/json", accept: "application/json", "accept-encoding": "identity" } })
          try { stillActive() } catch { void response.body?.cancel().catch(() => {}); return fail() }
          reader = response.body?.getReader()
          if (response.redirected || response.url && response.url !== input || response.status !== 200 || !reader ||
            !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") ||
            ![null, "identity"].includes(response.headers.get("content-encoding"))) return fail()
          const length = response.headers.get("content-length")
          if (length !== null && (!/^\d+$/.test(length) || Number(length) > 262144)) return fail()
          const chunks: Uint8Array[] = []; let size = 0, empty = 0
          for (;;) {
            const next = await reader.read(); stillActive()
            if (next.done) break
            if (!(next.value instanceof Uint8Array)) return fail()
            if (next.value.byteLength === 0) { if (++empty > 1024) return fail(); continue }
            empty = 0
            size += next.value.byteLength
            if (size > 262144) return fail()
            chunks.push(next.value.slice())
          }
          if (length !== null && size !== Number(length)) return fail()
          const bytes = new Uint8Array(size); let offset = 0
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
          // Original provider/error headers never escape into SDK diagnostics.
          return new Response(bytes, { status: 200, headers: { "content-type": "application/json" } })
        }
        return await Promise.race([work(), aborted])
      } catch { return fail() }
      finally {
        if (timer !== undefined) clearTimeout(timer)
        if (onInputAbort) { signal.removeEventListener("abort", onInputAbort); upstreamSignal?.removeEventListener("abort", onInputAbort) }
        if (controller) {
          if (onAbort) controller.signal.removeEventListener("abort", onAbort)
          controller.abort(); active.delete(controller)
        }
        if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock() } catch {} }
      }
    }
  })
}

let scopeActive = false
/** Only the owning CLI process may invoke this. Await the full SDK operation,
 * never a race that returns while its work can still dispatch. No background
 * observer or shared-server caller is supported. The CLI hard fuse also owns
 * stalled SDK cleanup; failure/return closes this boundary before restoration. */
export const withOwnedUnifiedGatewayFetch = async <T>(boundary: UnifiedGatewayBoundary, work: () => Promise<T>): Promise<T> => {
  if (scopeActive) return fail()
  scopeActive = true
  const original = globalThis.fetch
  try {
    globalThis.fetch = boundary.fetch as typeof fetch
    return await work()
  } finally {
    boundary.close()
    globalThis.fetch = original
    scopeActive = false
  }
}
