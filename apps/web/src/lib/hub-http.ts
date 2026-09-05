/** Bounded JSON transport. No keys, redirects, ambient cookies, retries, or raw diagnostics. */
export const HUB_BODY_LIMIT = 131_072
const unavailable = () => new Error("Hub request unavailable or invalid")

export const hubOrigin = (): string => {
  const raw = process.env["ARCADE_HUB"] ?? "http://localhost:8787"
  const url = new URL(raw)
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (raw.length > 2048 || /[\s\\%?#]/.test(raw) || url.username || url.password ||
      url.pathname !== "/" || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) throw unavailable()
  return url.origin
}

/** The deadline covers headers AND the complete body, even when an injected fetch ignores abort. */
export const hubJson = (
  path: string, init: RequestInit = {}, timeoutMs = 10_000
): Promise<{ readonly status: number; readonly body: unknown }> => {
  const origin = hubOrigin()
  if (!path.startsWith("/") || path.startsWith("//") || /[\\%#\s]/.test(path) ||
      new URL(origin + path).origin !== origin || new URL(origin + path).pathname !== path.split("?")[0]) {
    return Promise.reject(unavailable())
  }
  return jsonFetch(origin + path, init, timeoutMs)
}

/** Also used by the browser's fixed same-origin quote route; it carries no server authority. */
export const jsonFetch = (
  url: string, init: RequestInit = {}, timeoutMs = 10_000
): Promise<{ readonly status: number; readonly body: unknown }> => new Promise((resolve, reject) => {
    const controller = new AbortController()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const stop = () => { controller.abort(); void reader?.cancel().catch(() => {}) }
    const timer = setTimeout(() => { stop(); reject(unavailable()) }, timeoutMs)
    void (async () => {
      try {
        const response = await fetch(url, { ...init, redirect: "error", credentials: "omit", signal: controller.signal })
        if (controller.signal.aborted || response.redirected || (response.url !== "" && !url.startsWith("/") && response.url !== url)) {
          void response.body?.cancel().catch(() => {})
          throw unavailable()
        }
        const length = response.headers.get("content-length")
        if (length !== null && (!/^\d+$/.test(length) || Number(length) > HUB_BODY_LIMIT)) {
          void response.body?.cancel().catch(() => {})
          throw unavailable()
        }
        if (response.body === null) throw unavailable()
        reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        while (true) {
          const chunk = await reader.read()
          if (controller.signal.aborted) throw unavailable()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > HUB_BODY_LIMIT) throw unavailable()
          chunks.push(chunk.value)
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        resolve({ status: response.status, body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) })
      } catch { stop(); reject(unavailable()) }
      finally { clearTimeout(timer); reader?.releaseLock() }
    })()
  })

/** Incoming quote/relay bodies are bounded too; no private input in query strings or logs. */
export const requestJson = (request: Request): Promise<unknown> => new Promise((resolve, reject) => {
  const reader = request.body?.getReader()
  if (reader === undefined) { reject(new Error("Invalid request body")); return }
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new Error("Invalid request body")) }, 10_000)
  void (async () => {
    try {
      let size = 0
      const chunks: Uint8Array[] = []
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > HUB_BODY_LIMIT) throw new Error()
        chunks.push(chunk.value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      resolve(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
    } catch { void reader.cancel().catch(() => {}); reject(new Error("Invalid request body")) }
    finally { clearTimeout(timer); reader.releaseLock() }
  })()
})
