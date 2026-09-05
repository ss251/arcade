import { Effect, Schema } from "effect"
import type { Account } from "viem"
import { HIRE_CAPABILITY_HEADER, PaymentAlreadyAttempted, RpcFailure } from "@arcade/core"
import {
  HEADER_PAYMENT_LEGACY,
  HEADER_PAYMENT_SIGNATURE,
  PaymentPayload,
  PaymentRequirements,
  encodeHeader,
  signAuthorization,
  signGatewayAuthorization,
  paymentRequirementsKind
} from "@arcade/payments"

/**
 * probe → 402 → sign → retry.
 *
 * Pattern adapted from x402scan's MIT `createFetchWithPayment`, including its most important
 * detail: the **double-payment guard**. If the retried request already carries a payment
 * header, we refuse rather than sign a second authorization — otherwise a server that keeps
 * answering 402 could drain a buyer one signature at a time.
 *
 * Here that guard is a typed failure (`PaymentAlreadyAttempted`), so a caller cannot ignore it.
 */

export interface PayFetchOptions {
  readonly account: Account
  /** Refuse to sign anything above this, in atomic units. The buyer-side spend cap. */
  readonly maxAmountAtomic?: bigint
  /** Hub-issued opaque capability proving this purchase is a child of a running job. */
  readonly lineage?: string
  readonly fetch?: typeof globalThis.fetch
  /** Final gate before a signature exists. Only an explicit null permits signing. */
  readonly beforeSign?: (requirements: PaymentRequirements) => string | null
}

// New local replay policy: at most1MiB of stable body bytes. Multipart and streams
// are deliberately refused rather than buffered without a bound or replayed with
// different bytes/boundaries. Normal callSkill JSON requests use the string lane.
const MAX_REPLAY_BYTES = 1_048_576
const BLOB_SNAPSHOT_MS = 5000, MAX_BLOB_CHUNKS = 4096
function badRequest(): never { throw Error("Unsupported payment request") }
const boundedString = (value: string): string => {
  if (value.length > MAX_REPLAY_BYTES || new TextEncoder().encode(value).length > MAX_REPLAY_BYTES) return badRequest()
  return value
}
/** Bun.file is a Blob too, but slice() remains lazily file-backed. Consume native
 * bytes BEFORE the probe, with a whole-operation bound including reader cleanup.
 * Cancellation requests underlying cancellation and always releases our lock;
 * an uncooperative underlying cancel promise cannot extend the deadline. */
const snapshotBlob = async (body: Blob, signals: ReadonlyArray<AbortSignal | null | undefined>): Promise<Blob> => {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, complete = false, stopped = false
  let rejectDeadline!: (reason: Error) => void
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject })
  // A synchronous size/stream failure may occur before the first read races it.
  void deadline.catch(() => {})
  const abort = () => { stopped = true; rejectDeadline(Error("Unsupported payment request")) }
  const timer = setTimeout(abort, BLOB_SNAPSHOT_MS)
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined && signal !== null)
  try {
    for (const signal of activeSignals) {
      if (signal.aborted) return badRequest()
      signal.addEventListener("abort", abort, { once: true })
    }
    const size: unknown = Object.getOwnPropertyDescriptor(Blob.prototype, "size")!.get!.call(body)
    const type: unknown = Object.getOwnPropertyDescriptor(Blob.prototype, "type")!.get!.call(body)
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 || size > MAX_REPLAY_BYTES || typeof type !== "string") return badRequest()
    reader = Blob.prototype.stream.call(body).getReader()
    const chunks: Array<ArrayBuffer> = []
    let total = 0, count = 0
    while (true) {
      const part = await Promise.race([reader.read(), deadline])
      if (stopped || activeSignals.some(signal => signal.aborted)) return badRequest()
      if (part.done) break
      if (!(part.value instanceof Uint8Array) || ++count > MAX_BLOB_CHUNKS) return badRequest()
      total += part.value.byteLength
      if (total > MAX_REPLAY_BYTES || total > size) return badRequest()
      chunks.push(new Uint8Array(part.value).buffer)
    }
    if (total !== size) return badRequest()
    const saved = new Blob(chunks, { type })
    complete = true
    return saved
  } finally {
    stopped = true
    try {
      if (reader !== undefined && !complete) {
        try { await Promise.race([reader.cancel(), deadline]) } catch { /* fixed refusal below */ }
      }
    } finally {
      try { reader?.releaseLock() } finally {
        clearTimeout(timer)
        for (const signal of activeSignals) signal.removeEventListener("abort", abort)
      }
    }
  }
}
const replayBody = async (body: RequestInit["body"], signals: ReadonlyArray<AbortSignal | null | undefined>): Promise<() => RequestInit["body"]> => {
  if (body === undefined || body === null) return () => body
  if (typeof body === "string") { const saved = boundedString(body); return () => saved }
  if (body instanceof URLSearchParams) {
    let chars = 0
    URLSearchParams.prototype.forEach.call(body, (value: string, key: string) => {
      chars += value.length + key.length + 2
      if (chars > MAX_REPLAY_BYTES + 1) badRequest()
    })
    const saved = boundedString(URLSearchParams.prototype.toString.call(body))
    return () => new URLSearchParams(saved)
  }
  if (body instanceof Blob) {
    const saved = await snapshotBlob(body, signals)
    return () => saved
  }
  let buffer: ArrayBufferLike, offset = 0, length: number
  if (body instanceof ArrayBuffer) {
    buffer = body; length = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!.call(body)
  } else if (ArrayBuffer.isView(body)) {
    const proto = body instanceof DataView ? DataView.prototype : Object.getPrototypeOf(Uint8Array.prototype)
    buffer = Object.getOwnPropertyDescriptor(proto, "buffer")!.get!.call(body)
    offset = Object.getOwnPropertyDescriptor(proto, "byteOffset")!.get!.call(body)
    length = Object.getOwnPropertyDescriptor(proto, "byteLength")!.get!.call(body)
  } else return badRequest()
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_REPLAY_BYTES) return badRequest()
  const saved = new Uint8Array(buffer, offset, length).slice()
  return () => saved.slice().buffer
}

export interface PaidResponse {
  readonly response: Response
  readonly paid: boolean
  readonly amountAtomic?: bigint
  readonly requirements?: PaymentRequirements
}

const decode402 = (body: unknown) =>
  Schema.decodeUnknown(
    Schema.Struct({
      x402Version: Schema.Literal(2),
      error: Schema.optional(Schema.String),
      accepts: Schema.Array(PaymentRequirements)
    })
  )(body)

export const fetchWithPayment = (
  input: string | URL,
  init: RequestInit,
  options: PayFetchOptions
) =>
  Effect.gen(function* () {
    const doFetch = options.fetch ?? globalThis.fetch
    const account = options.account, beforeSign = options.beforeSign
    const saved = yield* Effect.try({
      try: () => {
        const url = typeof input === "string" ? input : input instanceof URL ? URL.prototype.toString.call(input) : badRequest()
        const stable = { ...init }, headers = new Headers(stable.headers ?? {})
        if (options.lineage !== undefined) headers.set(HIRE_CAPABILITY_HEADER, options.lineage)
        return { url, stable, headers }
      },
      catch: () => new RpcFailure({ method: "fetch", reason: "Unsupported payment request. Nothing was signed." })
    })

    const headers = saved.headers
    if (headers.has(HEADER_PAYMENT_SIGNATURE) || headers.has(HEADER_PAYMENT_LEGACY)) {
      return yield* new PaymentAlreadyAttempted({ resource: saved.url })
    }
    const cap = options.maxAmountAtomic
    if (cap !== undefined && (typeof cap !== "bigint" || cap < 0n || cap >= 1n << 256n)) {
      return yield* new RpcFailure({ method: "402", reason: "Invalid max-amount. Nothing was signed." })
    }
    const bodyForAttempt = yield* Effect.tryPromise({
      try: signal => replayBody(saved.stable.body, [saved.stable.signal, signal]),
      catch: () => new RpcFailure({ method: "fetch", reason: "Unsupported payment request. Nothing was signed." })
    })
    const requestForAttempt = (requestHeaders: Headers): RequestInit => {
      const body = bodyForAttempt()
      return { ...saved.stable, ...(body === undefined ? {} : { body }), headers: requestHeaders, redirect: "error", credentials: "omit" }
    }

    const probe = yield* Effect.tryPromise({
      try: () => doFetch(saved.url, requestForAttempt(new Headers(headers))),
      catch: (e) => new RpcFailure({ method: "fetch", reason: String((e as Error)?.message ?? e) })
    })

    if (probe.status !== 402) {
      return { response: probe, paid: false } satisfies PaidResponse
    }

    const body = yield* Effect.tryPromise({
      try: () => probe.json() as Promise<unknown>,
      catch: (e) => new RpcFailure({ method: "402 body", reason: String((e as Error)?.message ?? e) })
    })
    // The hub also uses 402 for policy refusals (for example a lineage cycle). These
    // have no payment requirements: preserve the reason and never sign a retry.
    if (typeof body === "object" && body !== null && !("accepts" in body) &&
        "error" in body && typeof body.error === "string") {
      const detail = "detail" in body && typeof body.detail === "string" ? `: ${body.detail}` : ""
      return yield* new RpcFailure({ method: "402", reason: `${body.error}${detail}` })
    }
    const challenge = yield* decode402(body).pipe(
      Effect.mapError((e) => new RpcFailure({ method: "402 decode", reason: String(e) }))
    )

    const selected = challenge.accepts[0]
    if (selected === undefined) {
      return yield* new RpcFailure({ method: "402", reason: "no acceptable payment requirements" })
    }

    // Snapshot decoded own fields before the caller's final gate. That gate may
    // inspect, but cannot redirect the payee/domain after the cap was checked.
    const requirements = Object.freeze(PaymentRequirements.make({ ...selected, extra: Object.freeze({ ...selected.extra }) }))
    const amount = yield* Effect.try({
      try: () => {
        if (!/^[1-9][0-9]{0,77}$/.test(requirements.amount)) throw Error()
        const value = BigInt(requirements.amount)
        if (value >= 1n << 256n) throw Error()
        return value
      },
      catch: () => new RpcFailure({ method: "402", reason: "Unsupported payment requirements. Nothing was signed." })
    })
    if (cap !== undefined && amount > cap) {
      return yield* new RpcFailure({
        method: "402",
        reason: `price ${amount} exceeds max-amount ${cap}`
      })
    }

    const refusal = yield* Effect.try({
      try: () => {
        if (beforeSign === undefined) return null
        const value = beforeSign(requirements)
        if (value !== null && (typeof value !== "string" || value.length > 2048)) throw Error()
        return value
      },
      catch: () => new RpcFailure({ method: "beforeSign", reason: "Payment authority check failed. Nothing was signed." })
    })
    if (refusal !== null) return yield* new RpcFailure({ method: "beforeSign", reason: refusal })

    // Preserve the caller's existing ENS authority gate, then independently pin
    // the signing domain. No explicit malformed Gateway metadata can fall back.
    const kind = yield* Effect.try({
      try: () => paymentRequirementsKind(requirements),
      catch: () => new RpcFailure({ method: "402", reason: "Unsupported payment requirements. Nothing was signed." })
    })

    // Offline. No gas, no chain round-trip — measured at ~5ms during G-1.
    const signed = yield* kind === "gateway" ? signGatewayAuthorization({
      account,
      to: requirements.payTo,
      valueAtomic: amount,
      requirements
    }) : signAuthorization({
      account,
      to: requirements.payTo,
      valueAtomic: amount,
      validForSeconds: requirements.maxTimeoutSeconds
    })

    // Canonical x402 v2 shape — authorization and signature nested, requirements echoed
    // back as `accepted`. Verified against Circle's CLI, which is the interop bar.
    const { signature, ...authorization } = signed
    const payload = PaymentPayload.make({
      x402Version: 2,
      payload: { authorization, signature },
      accepted: requirements
    })

    const retryHeaders = new Headers(headers)
    retryHeaders.set(HEADER_PAYMENT_SIGNATURE, encodeHeader(payload))

    const paidRes = yield* Effect.tryPromise({
      try: () => doFetch(saved.url, requestForAttempt(retryHeaders)),
      catch: (e) => new RpcFailure({ method: "fetch(paid)", reason: kind === "gateway"
        ? "Gateway authorization issued; payment outcome unknown. Reconcile before retrying."
        : String((e as Error)?.message ?? e) })
    })

    return {
      response: paidRes,
      paid: true,
      amountAtomic: amount,
      requirements
    } satisfies PaidResponse
  })
