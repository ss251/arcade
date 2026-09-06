const BODY_BYTES = 131072, BODY_MS = 5000
const invalid = (): never => { throw Error("Ordinary input invalid") }
const unavailable = (): never => { throw Error("Ordinary read unavailable") }

/** A completed read removes its waiter. Repeated chunks/polls never accumulate
 * reactions on one permanently pending Promise.race operand. */
const untilAborted = <A>(signal: AbortSignal, start: () => Promise<A>): Promise<A> => new Promise((resolve, reject) => {
  let settled = false
  const finish = (ok: boolean, value: unknown) => {
    if (settled) return
    settled = true; signal.removeEventListener("abort", stop)
    if (ok) resolve(value as A); else reject(Error("Ordinary read unavailable"))
  }
  const stop = () => finish(false, undefined)
  signal.addEventListener("abort", stop, { once: true })
  if (signal.aborted) { stop(); return }
  try { void start().then(value => finish(true, value), () => finish(false, undefined)) }
  catch { finish(false, undefined) }
})

/** Ordinary-only reader; legacy no-Origin content types are unchanged. JSON syntax
 * remains the caller's responsibility. F keeps its separate stricter reader. */
export const readOrdinaryBody = async (req: Request): Promise<string> => {
  const discard = () => { if (req.body !== null && !req.body.locked) void req.body.cancel().catch(() => {}) }
  const length = req.headers.get("content-length")
  if (req.signal.aborted || length !== null && (!/^(0|[1-9][0-9]{0,5})$/.test(length) || Number(length) > BODY_BYTES)) {
    discard(); return invalid()
  }
  if (req.body?.locked) return invalid()
  const reader = req.body?.getReader()
  if (reader === undefined) { if (length !== null && length !== "0") return invalid(); return "" }
  const deadline = performance.now() + BODY_MS
  let timer: ReturnType<typeof setTimeout> | undefined, finished = false, cancelled = false
  const cancel = () => { if (!cancelled) { cancelled = true; void reader.cancel().catch(() => {}) } }
  const controller = new AbortController()
  const stop = () => { controller.abort(); cancel() }
  timer = setTimeout(stop, BODY_MS); req.signal.addEventListener("abort", stop, { once: true })
  const chunks: Uint8Array[] = []; let bytes = 0, emptyChunks = 0
  try {
    while (true) {
      if (req.signal.aborted || performance.now() >= deadline) return invalid()
      const chunk = await untilAborted(controller.signal, () => reader.read())
      if (req.signal.aborted || performance.now() >= deadline) return invalid()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > BODY_BYTES) return invalid()
      if (chunk.value.byteLength === 0) {
        if (++emptyChunks > 32) return invalid()
      } else { emptyChunks = 0; chunks.push(chunk.value.slice()) }
    }
    if (length !== null && Number(length) !== bytes) return invalid()
    const buffer = new Uint8Array(bytes); let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer)
    finished = true; return text
  } catch { return invalid() }
  finally {
    clearTimeout(timer); req.signal.removeEventListener("abort", stop)
    if (!finished) cancel()
    reader.releaseLock()
  }
}

/** One retrieval lifetime: abort the Effect itself, race even an uncooperative
 * adapter, and recheck after every continuation. This never owns admitted jobs. */
export const ordinaryReadScope = (caller: AbortSignal, timeoutMs: 10000 | 120000 = 120000) => {
  const controller = new AbortController(), deadline = performance.now() + timeoutMs
  let closed = false, expired = false
  const stop = () => { controller.abort() }
  const timer = setTimeout(() => { expired = true; stop() }, timeoutMs)
  caller.addEventListener("abort", stop, { once: true })
  if (caller.aborted) stop()
  const check = () => {
    if (performance.now() >= deadline) { expired = true; stop() }
    if (closed || caller.aborted || controller.signal.aborted) return unavailable()
  }
  return {
    expired: () => expired,
    async read<A>(start: (signal: AbortSignal) => Promise<A>): Promise<A> {
      try { check(); const value = await untilAborted(controller.signal, () => start(controller.signal)); check(); return value }
      catch { return unavailable() }
    },
    close() { closed = true; clearTimeout(timer); caller.removeEventListener("abort", stop); stop() }
  }
}
