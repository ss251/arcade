import { randomBytes, timingSafeEqual } from "node:crypto"

export interface AgentRelayOptions {
  readonly baseUrl: string
  readonly model: string
  readonly apiKey?: string | undefined
  readonly authToken?: string | undefined
  readonly allowedTools: ReadonlyArray<string>
  readonly signal: AbortSignal
  readonly timeoutMs: number
  readonly requestLimit: number
  /** Explicit test seam only. Production binds a fresh ephemeral loopback port. */
  readonly listenPort?: number | undefined
}

export interface AgentRelay {
  readonly baseUrl: string
  readonly capability: string
  readonly close: () => Promise<void>
}

const REQUEST_BYTES = 1_048_576
const RESPONSE_BYTES = 4_194_304
const ERROR_BODY = '{"type":"error","error":{"type":"invalid_request_error","message":"agent relay request refused"}}'
const refused = () => new Response(ERROR_BODY, { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store" } })
const failure = () => new Error("agent relay request refused")
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

const baseOf = (value: string): string => {
  const invalid = () => { throw new Error("agent relay configuration refused") }
  if (typeof value !== "string" || value.length > 2048 || /[\\%\s]/.test(value) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(value)) invalid()
  let url: URL
  try { url = new URL(value) } catch { return invalid() }
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)) ||
      !/^(?:\/[A-Za-z0-9._~-]+)*\/?$/.test(url.pathname)) invalid()
  // Match the installed Messages SDK's append semantics. This is an API base, not
  // an OpenAI /v1 endpoint: explicit /provider -> /provider/v1/messages.
  return url.href.replace(/\/$/, "")
}

const untilAbort = async <T>(work: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) throw failure()
  let stop: (() => void) | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      stop = () => reject(failure())
      signal.addEventListener("abort", stop, { once: true })
      if (signal.aborted) stop()
    })])
  } finally { if (stop !== undefined) signal.removeEventListener("abort", stop) }
}

/**
 * API-key custom endpoints only. The native CLI sees a per-job capability, never
 * the upstream credential. No environment, config, persistent file or account IO.
 * Bun is referenced only on opening: importing this module has no side effects.
 */
export const openAgentRelay = async (options: AgentRelayOptions): Promise<AgentRelay> => {
  const base = baseOf(options.baseUrl)
  const secrets = [options.apiKey, options.authToken].filter((value): value is string => value !== undefined)
  if (secrets.length !== 1 || typeof secrets[0] !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(secrets[0]) ||
      typeof options.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(options.model) ||
      !Array.isArray(options.allowedTools) || options.allowedTools.length > 64 ||
      options.allowedTools.some(tool => typeof tool !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(tool)) ||
      !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 600_000 ||
      !Number.isSafeInteger(options.requestLimit) || options.requestLimit < 1 || options.requestLimit > 256 ||
      options.listenPort !== undefined && (!Number.isSafeInteger(options.listenPort) || options.listenPort < 0 || options.listenPort > 65535)) {
    throw new Error("agent relay configuration refused")
  }
  if (options.signal.aborted) throw failure()
  const secret = secrets[0]!
  const secretBytes = Buffer.from(secret)
  const capability = randomBytes(32).toString("hex")
  const capBytes = Buffer.from(capability)
  const allowedTools = new Set(options.allowedTools)
  const active = new Set<AbortController>()
  let server: ReturnType<typeof Bun.serve>
  let closePromise: Promise<void> | undefined
  let closed = false, poisoned = false, requests = 0
  let lifetime: ReturnType<typeof setTimeout> | undefined
  const close = (): Promise<void> => {
    if (closePromise !== undefined) return closePromise
    closed = true
    clearTimeout(lifetime)
    options.signal.removeEventListener("abort", cancel)
    for (const controller of active) controller.abort()
    closePromise = (async () => {
      let deadline: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([server.stop(true), new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("agent relay cleanup failed")), 1_000)
        })])
      } finally { clearTimeout(deadline) }
    })()
    return closePromise
  }
  const cancel = () => { void close().catch(() => {}) }
  try {
    server = Bun.serve({ hostname: "127.0.0.1", port: options.listenPort ?? 0,
      idleTimeout: Math.ceil(Math.min(options.timeoutMs, 60_000) / 1000) + 1,
      maxRequestBodySize: REQUEST_BYTES + 1,
      error: refused,
      async fetch(request) {
        if (closed || poisoned || ++requests > options.requestLimit) return refused()
        const target = new URL(request.url)
        if (request.method === "HEAD" && target.pathname === "/api/hello" && target.search === "") {
          return new Response(null, { status: 204 })
        }
        const supplied = request.headers.get("x-api-key") ?? ""
        if (!/^[0-9a-f]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), capBytes) ||
            request.method !== "POST" || !["/v1/messages", "/v1/messages/count_tokens"].includes(target.pathname) ||
            !["", "?beta=true"].includes(target.search) || active.size >= 4) return refused()
        const controller = new AbortController()
        active.add(controller)
        const disconnected = () => controller.abort()
        request.signal.addEventListener("abort", disconnected, { once: true })
        const deadline = setTimeout(() => controller.abort(), Math.min(options.timeoutMs, 60_000))
        let bodyDeadline: ReturnType<typeof setTimeout> | undefined = setTimeout(() => controller.abort(), Math.min(options.timeoutMs, 5_000))
        let upstreamStarted = false
        const finish = () => {
          clearTimeout(deadline); clearTimeout(bodyDeadline)
          request.signal.removeEventListener("abort", disconnected)
          active.delete(controller)
        }
        try {
          if (request.body === null) throw failure()
          const input = request.body.getReader()
          const chunks: Uint8Array[] = []
          let size = 0
          try {
            while (true) {
              const next = await untilAbort(input.read(), controller.signal)
              if (next.done) break
              size += next.value.byteLength
              if (size > REQUEST_BYTES) throw failure()
              chunks.push(next.value)
            }
          } finally { void input.cancel().catch(() => {}); input.releaseLock() }
          clearTimeout(bodyDeadline); bodyDeadline = undefined
          const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
          if (!record(data) || data["model"] !== options.model || data["tools"] !== undefined &&
              (!Array.isArray(data["tools"]) || data["tools"].length > 64 || data["tools"].some(tool => !record(tool) || typeof tool["name"] !== "string" || !allowedTools.has(tool["name"])))) throw failure()
          if (closed || poisoned || controller.signal.aborted) throw failure()
          upstreamStarted = true
          const headers: Record<string, string> = { "content-type": "application/json", "anthropic-version": "2023-06-01", "accept-encoding": "identity",
            accept: data["stream"] === true ? "text/event-stream" : "application/json" }
          if (options.apiKey !== undefined) headers["x-api-key"] = secret
          else headers["authorization"] = `Bearer ${secret}`
          const response = await untilAbort(fetch(`${base}${target.pathname}${target.search}`, {
            method: "POST", body: JSON.stringify(data), headers, signal: controller.signal, redirect: "error", credentials: "omit"
          }), controller.signal)
          const contentType = response.headers.get("content-type")?.split(";")[0]?.trim()
          const encoding = response.headers.get("content-encoding")?.trim().toLowerCase()
          // Fetch transparently decompresses. Only identity bytes can be checked
          // against the upstream framing and forwarded without changing their meaning.
          if (response.status !== 200 || encoding !== undefined && encoding !== "identity" ||
              !["application/json", "text/event-stream"].includes(contentType ?? "") || response.body === null) {
            void response.body?.cancel().catch(() => {})
            throw failure()
          }
          const length = response.headers.get("content-length")
          if (length !== null && (!/^\d+$/.test(length) || Number(length) > RESPONSE_BYTES)) {
            void response.body.cancel().catch(() => {})
            throw failure()
          }
          const reader = response.body.getReader()
          let bytes = 0
          const output: Uint8Array[] = []
          try {
            while (true) {
              const next = await untilAbort(reader.read(), controller.signal)
              if (next.done) break
              bytes += next.value.byteLength
              if (bytes > RESPONSE_BYTES || output.length >= 16_384) throw failure()
              output.push(next.value)
            }
          } finally { void reader.cancel().catch(() => {}); reader.releaseLock() }
          const complete = Buffer.concat(output)
          if (length !== null && bytes !== Number(length) || complete.indexOf(secretBytes) !== -1 ||
              closed || controller.signal.aborted) throw failure()
          // Bun can finish an errored outgoing stream as a clean partial200. Buffer
          // the bounded complete response BEFORE committing any native bytes instead.
          // SSE/JSON bytes are preserved, not rewritten; only their delivery is delayed.
          finish()
          return new Response(complete, { headers: { "content-type": contentType!, "cache-control": "no-store" } })
        } catch {
          if (upstreamStarted) poisoned = true
          controller.abort(); finish(); return refused()
        }
      }
    })
  } catch { throw new Error("agent relay configuration refused") }
  lifetime = setTimeout(cancel, options.timeoutMs)
  options.signal.addEventListener("abort", cancel, { once: true })
  if (options.signal.aborted) { await close(); throw failure() }
  return { baseUrl: server.url.origin, capability, close }
}
