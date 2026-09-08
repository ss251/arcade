/** Explicit offline library only. No CLI activation, wallet, signer or outbound call. */
import { createCircleCaptureStore, type CircleCaptureStore, type CircleCaptureArtifact } from "./capture-x402-header.ts"

const FAIL = "circle_capture_listener_refused"
interface ListenerOptions { readonly payer: string; readonly payTo: string; readonly timeoutMs: number; readonly signal?: AbortSignal }
function options(value: unknown): ListenerOptions {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw Error(FAIL)
  const keys = Reflect.ownKeys(value)
  if (!keys.every(key => typeof key === "string" && ["payer", "payTo", "timeoutMs", "signal"].includes(key))) throw Error(FAIL)
  const data: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key)
    if (!field || !("value" in field) || !field.enumerable) throw Error(FAIL)
    data[key as string] = field.value
  }
  const address = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/.test(v)
  const timeoutMs = data.timeoutMs === undefined ? 15000 : data.timeoutMs
  if (!address(data.payer) || !address(data.payTo) || data.payer.toLowerCase() === data.payTo.toLowerCase() ||
    typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > 30000 ||
    data.signal !== undefined && (!(data.signal instanceof AbortSignal) || data.signal.aborted)) throw Error(FAIL)
  return Object.freeze({ payer: data.payer, payTo: data.payTo, timeoutMs,
    ...(data.signal === undefined ? {} : { signal: data.signal as AbortSignal }) })
}
export interface CircleCaptureListenerResult {
  readonly status: "captured" | "refused" | "cancelled" | "expired"
  readonly listenerClosed: boolean
  readonly clientAcknowledgement: "unconfirmed"
  readonly clientIdentity: "unverified"
  readonly artifact?: CircleCaptureArtifact
}
export interface CircleCaptureListener {
  readonly endpoint: string
  readonly directory: string
  readonly finished: Promise<CircleCaptureListenerResult>
  readonly close: () => Promise<CircleCaptureListenerResult>
}
function acknowledgedWithin(work: Promise<void>, milliseconds: number): Promise<boolean> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), milliseconds)
    work.then(() => { clearTimeout(timer); resolve(true) }, () => { clearTimeout(timer); resolve(false) })
  })
}
/** One unsigned challenge then one shape capture. No signature authentication,
 * live-client identity, payment admission/settlement or response-delivery claim. */
export async function startCircleCaptureListener(input: unknown): Promise<CircleCaptureListener> {
  let server: ReturnType<typeof Bun.serve> | undefined
  try {
    const opts = options(input), started = Date.now()
    let store: CircleCaptureStore | undefined, endpoint = "", challenged = false, terminal = false, stopping = false
    let lifetime: ReturnType<typeof setTimeout> | undefined
    let resolveFinished!: (result: CircleCaptureListenerResult) => void
    const finished = new Promise<CircleCaptureListenerResult>(resolve => { resolveFinished = resolve })
    const finish = async (status: CircleCaptureListenerResult["status"], artifact?: CircleCaptureArtifact) => {
      if (stopping) return finished
      stopping = true; terminal = true
      if (lifetime !== undefined) clearTimeout(lifetime)
      opts.signal?.removeEventListener("abort", cancelled)
      let listenerClosed = false
      try {
        // A graceful stop can acknowledge while a pre-request TCP connection
        // remains open. Allow only a short response flush opportunity, then
        // force-close owned connections; never claim client delivery from this.
        if (status === "captured" || status === "refused") await new Promise(resolve => setTimeout(resolve, 25))
        listenerClosed = await acknowledgedWithin(server!.stop(true), 750)
      } catch { /* fixed uncertainty result; no diagnostic or acknowledgement fabrication */ }
      const result = Object.freeze({ status, listenerClosed, clientAcknowledgement: "unconfirmed" as const,
        clientIdentity: "unverified" as const, ...(artifact === undefined ? {} : { artifact }) })
      resolveFinished(result); return result
    }
    const cancelled = () => { void finish("cancelled") }
    const endAfterResponse = (status: CircleCaptureListenerResult["status"], artifact?: CircleCaptureArtifact) => {
      terminal = true
      queueMicrotask(() => { void finish(status, artifact) })
    }
    const refused = () => {
      endAfterResponse("refused")
      return Response.json({ error: FAIL }, { status: 400 })
    }
    server = Bun.serve({
      hostname: "127.0.0.1", port: 0, maxRequestBodySize: 1024, idleTimeout: 2, development: false,
      fetch(request) {
        try {
          if (terminal || store === undefined) return Response.json({ error: FAIL }, { status: 503 })
          if (request.method !== "POST" || request.url !== endpoint) return refused()
          const current = request.headers.get("payment-signature"), legacy = request.headers.get("x-payment")
          if (current !== null && legacy !== null) return refused()
          if (current === null && legacy === null) {
            if (challenged) return refused()
            challenged = true
            // Same unsigned capture-template challenge; no production lifetime or rail change.
            return Response.json({ x402Version: 2, error: "payment required", accepts: [{
              scheme: "exact", network: "eip155:5042002", amount: "10000",
              asset: "0x3600000000000000000000000000000000000000", payTo: opts.payTo,
              resource: endpoint, description: "capture probe", mimeType: "application/json",
              maxTimeoutSeconds: 604900, extra: {},
            }] }, { status: 402 })
          }
          if (!challenged) return refused()
          const artifact = store.capture(current === null ? "x-payment" : "payment-signature", current ?? legacy)
          endAfterResponse("captured", artifact)
          return Response.json({ captured: true, authenticated: false, settled: false })
        } catch { return refused() }
      },
      error() { return refused() },
    })
    endpoint = "http://127.0.0.1:" + server.port + "/x/demo/usdc-flow-check"
    store = createCircleCaptureStore({ endpoint, payer: opts.payer, payTo: opts.payTo })
    lifetime = setTimeout(() => { void finish("expired") }, Math.max(0, opts.timeoutMs - (Date.now() - started)))
    opts.signal?.addEventListener("abort", cancelled, { once: true })
    if (opts.signal?.aborted) cancelled()
    return Object.freeze({ endpoint, directory: store.directory, finished, close: () => finish("cancelled") })
  } catch {
    if (server !== undefined) { try { await acknowledgedWithin(server.stop(true), 750) } catch { /* never expose runtime diagnostics */ } }
    throw Error(FAIL)
  }
}

if (import.meta.main) {
  process.stderr.write("circle_capture_listener_library_only\n")
  process.exitCode = 2
}
