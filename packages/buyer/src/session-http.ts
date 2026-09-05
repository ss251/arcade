/** Session-only JSON transport. The caller owns the captured origin/route authority;
 * this boundary independently refuses unsafe URLs and never follows a redirect. */
export interface SessionRequestInit {
  readonly method: "GET" | "POST"
  readonly headers: Readonly<Record<string, string>>
  readonly body?: string
}
export interface SessionRequestOptions {
  readonly signal: AbortSignal
  /** Absolute monotonic time, from performance.now(), not a wall-clock timestamp. */
  readonly deadlineMs: number
  readonly maxBytes: number
}
export class SessionHttpFailure extends Error {
  readonly _tag = "SessionHttpFailure"
  readonly code = "session_http_unavailable"
  constructor() { super("Session request unavailable"); this.name = "SessionHttpFailure" }
}

const REQUEST_BYTES = 1_048_576
const RESPONSE_BYTES = 2 * REQUEST_BYTES + 16_384
const HEADER_BYTES = 16_384
const HEADER_NAMES = new Set(["content-type", "accept", "accept-encoding", "x-arcade-session",
  "x-session-token", "x-job-token", "payment-signature"])
const unavailable = (): never => { throw new SessionHttpFailure() }

/** Only own, scalar configuration is consumed. This is not a hostile-Proxy sandbox. */
function ownRecord(input: unknown, keys?: ReadonlySet<string>): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return unavailable()
  const proto = Object.getPrototypeOf(input)
  if (proto !== null && proto !== Object.prototype) return unavailable()
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || keys && !keys.has(key)) return unavailable()
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) return unavailable()
    out[key] = descriptor.value
  }
  return out
}

function snapshot(url: unknown, init: SessionRequestInit): { url: string; init: Readonly<RequestInit> } {
  if (typeof url !== "string" || url.length > 2048 || /[\s\\%?#]/.test(url)) return unavailable()
  const parsed = new URL(url)
  if (parsed.username || parsed.password || parsed.search || parsed.hash || url !== parsed.href ||
    parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(parsed.hostname))) return unavailable()
  const raw = ownRecord(init, new Set(["method", "headers", "body"]))
  if (raw.method !== "GET" && raw.method !== "POST") return unavailable()
  const rawHeaders = ownRecord(raw.headers, HEADER_NAMES)
  const headers: Record<string, string> = Object.create(null) as Record<string, string>
  let headerBytes = 0
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value !== "string" || value.length > HEADER_BYTES || value !== value.trim() || /[^\x20-\x7e]/.test(value)) return unavailable()
    headerBytes += key.length + value.length
    if (headerBytes > HEADER_BYTES) return unavailable()
    headers[key] = value
  }
  if (headers["content-type"] !== undefined && headers["content-type"] !== "application/json" ||
    headers.accept !== undefined && headers.accept !== "application/json" ||
    headers["accept-encoding"] !== undefined && headers["accept-encoding"] !== "identity") return unavailable()
  headers.accept = "application/json"; headers["accept-encoding"] = "identity"
  const body = raw.body
  if (body !== undefined && (raw.method !== "POST" || typeof body !== "string" || body.length > REQUEST_BYTES ||
    new TextEncoder().encode(body).length > REQUEST_BYTES)) return unavailable()
  if (body !== undefined) headers["content-type"] = "application/json"
  return { url, init: Object.freeze({ method: raw.method, headers: Object.freeze(headers),
    ...(body === undefined ? {} : { body }), redirect: "error" as const, credentials: "omit" as const }) }
}

/** Cancel may be uncooperative. Never await it without a finite local cleanup bound. */
function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => {}) } catch { /* no provider diagnostics */ }
}

export async function sessionRequest(fetchFn: typeof fetch, url: string, init: SessionRequestInit,
  options: SessionRequestOptions): Promise<{ readonly status: number; readonly body: unknown }> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let externalSignal: AbortSignal | undefined
  let abort: (() => void) | undefined
  let active = true
  try {
    const raw = ownRecord(options, new Set(["signal", "deadlineMs", "maxBytes"]))
    if (typeof fetchFn !== "function" || !(raw.signal instanceof AbortSignal) ||
      typeof raw.deadlineMs !== "number" || !Number.isFinite(raw.deadlineMs) ||
      typeof raw.maxBytes !== "number" || !Number.isSafeInteger(raw.maxBytes) || raw.maxBytes < 1 || raw.maxBytes > RESPONSE_BYTES) return unavailable()
    externalSignal = raw.signal
    const maxBytes = raw.maxBytes, deadline = Math.min(raw.deadlineMs, performance.now() + 5000)
    const check = () => {
      if (!active || externalSignal!.aborted || controller?.signal.aborted || performance.now() >= deadline) unavailable()
    }
    check()
    const request = snapshot(url, init)
    check()
    controller = new AbortController()
    abort = () => { controller!.abort() }
    externalSignal.addEventListener("abort", abort, { once: true })
    timer = setTimeout(abort, Math.max(0, deadline - performance.now()))
    check()
    // Remove each read's abort listener after it settles; a shared never-settled
    // Promise.race branch would retain one reaction per tiny/empty chunk.
    const wait = <A>(pending: Promise<A>): Promise<A> => new Promise((resolve, reject) => {
      let finished = false
      const done = (work: () => void) => {
        if (finished) return
        finished = true; controller!.signal.removeEventListener("abort", cancelled); work()
      }
      const cancelled = () => done(() => reject(new SessionHttpFailure()))
      controller!.signal.addEventListener("abort", cancelled, { once: true })
      pending.then(value => done(() => resolve(value)), () => done(() => reject(new SessionHttpFailure())))
      if (controller!.signal.aborted) cancelled()
    })
    const requestInit = Object.freeze({ ...request.init, signal: controller.signal })
    // A late fetch resolution may only cancel its body, never parse it or send again.
    const pending = Promise.resolve(fetchFn(request.url, requestInit)).then(response => {
      if (!active || controller!.signal.aborted || performance.now() >= deadline) { cancelBody(response); return unavailable() }
      return response
    })
    const response = await wait(pending)
    check()
    if (!(response instanceof Response) || response.redirected || response.url !== "" && response.url !== request.url ||
      response.status < 200 || response.status > 599 || response.status >= 300 && response.status < 400 || !response.body) {
      cancelBody(response); return unavailable()
    }
    const type = response.headers.get("content-type"), encoding = response.headers.get("content-encoding")
    const length = response.headers.get("content-length")
    if (!type || !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(type) ||
      encoding !== null && encoding.toLowerCase() !== "identity" ||
      length !== null && (length.length > 7 || !/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > maxBytes)) {
      cancelBody(response); return unavailable()
    }
    reader = response.body.getReader()
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let size = 0, text = "", emptyChunks = 0
    for (;;) {
      check()
      const next = await wait(reader.read())
      check()
      if (next.done) break
      if (next.value.byteLength === 0) {
        if (++emptyChunks > 1024) return unavailable()
        continue
      }
      emptyChunks = 0
      size += next.value.byteLength
      if (size > maxBytes) return unavailable()
      text += decoder.decode(next.value, { stream: true })
    }
    if (length !== null && size !== Number(length)) return unavailable()
    text += decoder.decode()
    const body: unknown = JSON.parse(text)
    check()
    return { status: response.status, body }
  } catch { throw new SessionHttpFailure() }
  finally {
    active = false
    if (timer !== undefined) clearTimeout(timer)
    if (externalSignal && abort) externalSignal.removeEventListener("abort", abort)
    controller?.abort()
    if (reader) {
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([reader.cancel().catch(() => {}), new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, 50) })])
      } catch { /* retain original fixed failure */ }
      finally { if (cleanupTimer !== undefined) clearTimeout(cleanupTimer); try { reader.releaseLock() } catch { /* pending read is already cancelled */ } }
    }
  }
}
