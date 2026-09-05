/** Private Gateway HTTP seam. One attempt, bounded headers/body/cleanup, no diagnostics. */
export const gatewayJson = async (
  base: string, path: "/v1/x402/supported" | "/v1/x402/verify" | "/v1/x402/settle",
  body: unknown, apiKey: string | undefined, parent: AbortSignal
): Promise<unknown> => {
  const fail = () => new Error("Gateway request unavailable")
  const encoded = body === undefined ? undefined : JSON.stringify(body)
  if (encoded !== undefined && Buffer.byteLength(encoded) > 16_384) throw fail()
  const controller = new AbortController()
  const signal = AbortSignal.any([parent, controller.signal])
  const timer = setTimeout(() => controller.abort(), 15_000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let response: Response | undefined
  let onAbort: (() => void) | undefined
  let finished = false
  const cancel = async (target: ReadableStreamDefaultReader<Uint8Array> | ReadableStream<Uint8Array>) => {
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([Promise.resolve().then(() => target.cancel()).catch(() => undefined),
        new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, 250) })])
    } finally { if (cleanupTimer !== undefined) clearTimeout(cleanupTimer) }
  }
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => reject(fail())
    signal.addEventListener("abort", onAbort, { once: true })
  })
  const pending = async () => {
    signal.throwIfAborted()
    const incoming = await fetch(`${base}${path}`, { method: encoded === undefined ? "GET" : "POST",
      ...(encoded === undefined ? {} : { body: encoded }), signal, redirect: "error", credentials: "omit",
      headers: { accept: "application/json", "accept-encoding": "identity",
        ...(encoded === undefined ? {} : { "content-type": "application/json" }),
        ...(apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` }) } })
    if (finished || signal.aborted) { if (incoming.body) await cancel(incoming.body); throw fail() }
    response = incoming
    if (!incoming.ok || incoming.redirected || incoming.body === null ||
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(incoming.headers.get("content-type") ?? "") ||
      incoming.headers.has("content-encoding") && incoming.headers.get("content-encoding") !== "identity") throw fail()
    const length = incoming.headers.get("content-length")
    if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || length.length > 5 || Number(length) > 65_536)) throw fail()
    reader = incoming.body.getReader()
    const chunks: Uint8Array[] = []; let total = 0
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > 65_536 || length !== null && total > Number(length)) throw fail()
      chunks.push(chunk.value)
    }
    if (length !== null && total !== Number(length)) throw fail()
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  }
  try { return await Promise.race([pending(), stopped]) }
  catch { throw fail() }
  finally {
    finished = true; clearTimeout(timer); controller.abort()
    if (onAbort !== undefined) signal.removeEventListener("abort", onAbort)
    if (reader !== undefined) await cancel(reader)
    else if (response?.body) await cancel(response.body)
  }
}
