/** Passive browser-only ordinary reads. No storage, server environment, approval,
 * signing, payment submission or retry. A raw result is NOT validated settlement.
 */
import { captureStoredJob } from "./job-store.ts"
import { decodeTree, type TreeView } from "./hub-decode.ts"

export const ORDINARY_BODY_LIMIT = 131_072
export interface OrdinaryReadOptions {
  readonly signal?: AbortSignal
  /** Per-request duration; a later purchase controller owns any overall budget. */
  readonly timeoutMs?: number
}
export interface OrdinaryRawResult { readonly status: number; readonly body: unknown }
export class OrdinaryJobHttpFailure extends Error {
  readonly _tag = "OrdinaryJobHttpFailure"
  readonly code = "ordinary_job_unavailable"
  constructor() { super("Ordinary job request unavailable"); this.name = "OrdinaryJobHttpFailure" }
}
const unavailable = (): never => { throw new OrdinaryJobHttpFailure() }
const cancelBody = (response: unknown): void => {
  try { if (response instanceof Response) void response.body?.cancel().catch(() => {}) }
  catch { /* no raw provider errors */ }
}
const captureOptions = (input: unknown, maximum: number): { signal?: AbortSignal; timeoutMs: number } => {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return unavailable()
  const values: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(input)) {
    if (key !== "signal" && key !== "timeoutMs") return unavailable()
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (!d?.enumerable || !("value" in d)) return unavailable()
    values[key] = d.value
  }
  if (values.signal !== undefined && !(values.signal instanceof AbortSignal)) return unavailable()
  const timeoutMs = values.timeoutMs === undefined ? maximum : values.timeoutMs
  if (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > maximum) return unavailable()
  return { timeoutMs, ...(values.signal === undefined ? {} : { signal: values.signal as AbortSignal }) }
}

function read(input: unknown, kind: "result", options: OrdinaryReadOptions, fetchFn?: typeof fetch): Promise<OrdinaryRawResult>
function read(input: unknown, kind: "tree", options: OrdinaryReadOptions, fetchFn?: typeof fetch): Promise<TreeView>
async function read(input: unknown, kind: "result" | "tree", options: OrdinaryReadOptions,
  fetchFn?: typeof fetch): Promise<OrdinaryRawResult | TreeView> {
  let active = true, controller: AbortController | undefined, external: AbortSignal | undefined
  let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const row = captureStoredJob(input)
    if (row === undefined) return unavailable()
    const captured = captureOptions(options, kind === "result" ? 90_000 : 10_000)
    external = captured.signal
    if (external?.aborted) return unavailable()
    const fetcher = fetchFn ?? globalThis.fetch
    if (typeof fetcher !== "function") return unavailable()
    const now = performance.now.bind(performance), deadline = now() + captured.timeoutMs
    const url = `${row.hubOrigin}/${kind === "tree" ? "trees" : "jobs"}/${row.jobId}${kind === "result" ? "/result" : ""}`
    controller = new AbortController()
    const signal = controller.signal
    abort = () => controller!.abort()
    external?.addEventListener("abort", abort, { once: true })
    const check = () => { if (!active || signal.aborted || external?.aborted || now() >= deadline) unavailable() }
    timer = setTimeout(abort, Math.max(0, deadline - now()))
    check()
    // One removable waiter per operation; no retained race reactions per tiny chunk.
    const wait = <A>(pending: Promise<A>): Promise<A> => new Promise((resolve, reject) => {
      let done = false
      const finish = (work: () => void) => { if (done) return; done = true; signal.removeEventListener("abort", stopped); work() }
      const stopped = () => finish(() => reject(new OrdinaryJobHttpFailure()))
      signal.addEventListener("abort", stopped, { once: true })
      pending.then(value => finish(() => resolve(value)), () => finish(() => reject(new OrdinaryJobHttpFailure())))
      if (signal.aborted) stopped()
    })
    const init: Readonly<RequestInit> = Object.freeze({ method: "GET", signal, credentials: "omit", redirect: "error", cache: "no-store",
      referrerPolicy: "no-referrer", headers: Object.freeze({ accept: "application/json", "x-job-token": row.token }) })
    const pending = Promise.resolve(fetcher(url, init)).then(response => {
      if (!active || signal.aborted || external?.aborted || now() >= deadline) { cancelBody(response); return unavailable() }
      return response
    })
    const response = await wait(pending)
    check()
    if (!(response instanceof Response) || response.redirected || response.url !== "" && response.url !== url ||
      response.status < 200 || response.status > 599 || response.status >= 300 && response.status < 400 || !response.body) {
      cancelBody(response); return unavailable()
    }
    let headerBytes = 0
    for (const [key, value] of response.headers) {
      headerBytes += key.length + value.length
      if (headerBytes > 16_384) { cancelBody(response); return unavailable() }
    }
    const type = response.headers.get("content-type"), encoding = response.headers.get("content-encoding"), length = response.headers.get("content-length")
    if (!type || !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(type) ||
      encoding !== null && encoding.toLowerCase() !== "identity" ||
      length !== null && (length.length > 7 || !/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > ORDINARY_BODY_LIMIT || response.headers.has("transfer-encoding"))) {
      cancelBody(response); return unavailable()
    }
    reader = response.body.getReader()
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let size = 0, text = "", empty = 0
    for (;;) {
      check()
      const chunk = await wait(reader.read())
      check()
      if (chunk.done) break
      if (!(chunk.value instanceof Uint8Array)) return unavailable()
      if (chunk.value.byteLength === 0) { if (++empty > 1024) return unavailable(); continue }
      empty = 0; size += chunk.value.byteLength
      if (size > ORDINARY_BODY_LIMIT) return unavailable()
      text += decoder.decode(chunk.value, { stream: true })
    }
    if (length !== null && Number(length) !== size) return unavailable()
    text += decoder.decode()
    const body: unknown = JSON.parse(text)
    check()
    if (kind === "tree") {
      if (response.status !== 200) return unavailable()
      const tree = decodeTree(body, row.jobId)
      check(); return tree
    }
    return { status: response.status, body }
  } catch { throw new OrdinaryJobHttpFailure() }
  finally {
    active = false
    if (timer !== undefined) clearTimeout(timer)
    if (external && abort) external.removeEventListener("abort", abort)
    controller?.abort()
    if (reader) {
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([reader.cancel().catch(() => {}), new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, 50) })])
      } catch { /* bounded cleanup never replaces the fixed result */ }
      finally { if (cleanupTimer !== undefined) clearTimeout(cleanupTimer); try { reader.releaseLock() } catch { /* no raw diagnostics */ } }
    }
  }
}

/** Each invocation is one bounded read, never a polling or payment loop. */
export const readOrdinaryResult = (row: unknown, options: OrdinaryReadOptions = {}, fetchFn?: typeof fetch): Promise<OrdinaryRawResult> =>
  read(row, "result", options, fetchFn)
export const readOrdinaryTree = (row: unknown, options: OrdinaryReadOptions = {}, fetchFn?: typeof fetch): Promise<TreeView> =>
  read(row, "tree", options, fetchFn)
