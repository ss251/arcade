import { PublishFailed, parsePreview, type PublishPreviewDocument } from "./publish-preview.ts"
import { capturePublishTarget } from "./publish-policy.ts"

/** Shared only by the local preview request and response, not payment/quote IO. */
export const readPublishBytes = (body: ReadableStream<Uint8Array> | null, signal: AbortSignal,
  limit: number, timeoutMs: number): Promise<Uint8Array> => new Promise((resolve, reject) => {
  if (!body || signal.aborted || !Number.isSafeInteger(limit) || limit < 1 || limit > 1048576 ||
    !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 42000) { reject(new PublishFailed()); return }
  let reader: ReadableStreamDefaultReader<Uint8Array>
  try { reader = body.getReader() } catch { reject(new PublishFailed()); return }
  let finished = false, size = 0, reads = 0, empty = 0
  const chunks: Uint8Array[] = []
  const clean = () => { clearTimeout(timer); signal.removeEventListener("abort", stop) }
  const stop = () => {
    if (finished) return
    finished = true; clean(); chunks.length = 0
    void reader.cancel().catch(() => {})
    reject(new PublishFailed())
  }
  const timer = setTimeout(stop, timeoutMs)
  signal.addEventListener("abort", stop, { once: true })
  if (signal.aborted) stop()
  void (async () => {
    try {
      while (!finished) {
        const chunk = await reader.read()
        if (finished) return
        if (chunk.done) {
          const result = new Uint8Array(size); let offset = 0
          for (const bytes of chunks) { result.set(bytes, offset); offset += bytes.byteLength }
          finished = true; clean(); resolve(result); return
        }
        if (!(chunk.value instanceof Uint8Array) || ++reads > 4096) { stop(); return }
        empty = chunk.value.byteLength === 0 ? empty + 1 : 0
        size += chunk.value.byteLength
        if (empty > 32 || size > limit) { stop(); return }
        chunks.push(new Uint8Array(chunk.value))
      }
    } catch { stop() }
    finally { try { reader.releaseLock() } catch { /* A canceled producer may still own its pending read. */ } }
  })()
})

export const publishJsonLength = (headers: Headers, limit: number): number | null => {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(headers.get("content-type") ?? "") ||
    ![null, "identity"].includes(headers.get("content-encoding"))) throw new PublishFailed()
  const length = headers.get("content-length")
  if (length === null) return null
  if (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > limit) throw new PublishFailed()
  return Number(length)
}
export type PreviewFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export const fetchPublishPreview = async (target: string, signal: AbortSignal,
  fetcher: PreviewFetch = fetch): Promise<PublishPreviewDocument> => {
  let wanted: ReturnType<typeof capturePublishTarget>
  try { wanted = capturePublishTarget({ target }); if (signal.aborted) throw 0 } catch { throw new PublishFailed() }
  const controller = new AbortController(), started = performance.now()
  const abort = () => controller.abort()
  let interrupt!: () => void
  const stopped = new Promise<never>((_resolve, reject) => { interrupt = () => reject(new PublishFailed()) })
  controller.signal.addEventListener("abort", interrupt, { once: true })
  signal.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(abort, 42000)
  try {
    if (signal.aborted) { abort(); throw 0 }
    const response = await Promise.race([fetcher("/api/publish-preview", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target }),
      redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal
    }).then(response => {
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new PublishFailed() }
      return response
    }), stopped])
    try {
      const expected = typeof location === "undefined" ? null : new URL("/api/publish-preview", location.href).href
      if (response.status !== 200 || response.redirected || (response.url !== "" && response.url !== expected)) throw 0
      const length = publishJsonLength(response.headers, 1048576)
      const bytes = await readPublishBytes(response.body, controller.signal, 1048576, 42000 - (performance.now() - started))
      if (controller.signal.aborted || (length !== null && length !== bytes.byteLength)) throw 0
      const result = parsePreview(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      if (result.target !== wanted.target || (wanted.kind === "directory" ? result.kind !== "directory" :
        result.kind !== "generated" || result.source !== wanted.kind)) throw 0
      return result
    } catch { void response.body?.cancel().catch(() => {}); throw new PublishFailed() }
  } catch { throw new PublishFailed() }
  finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort)
    controller.signal.removeEventListener("abort", interrupt); controller.abort()
  }
}
