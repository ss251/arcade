import { Effect, Schema } from "effect"
import type { Account } from "viem"
import { PaymentAlreadyAttempted, RpcFailure } from "@arcade/core"
import {
  HEADER_PAYMENT_LEGACY,
  HEADER_PAYMENT_SIGNATURE,
  PaymentPayload,
  PaymentRequirements,
  encodeHeader,
  signAuthorization
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
  readonly fetch?: typeof globalThis.fetch
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

    const headers = new Headers(init.headers ?? {})
    if (headers.has(HEADER_PAYMENT_SIGNATURE) || headers.has(HEADER_PAYMENT_LEGACY)) {
      return yield* new PaymentAlreadyAttempted({ resource: String(input) })
    }

    const probe = yield* Effect.tryPromise({
      try: () => doFetch(String(input), { ...init, headers }),
      catch: (e) => new RpcFailure({ method: "fetch", reason: String((e as Error)?.message ?? e) })
    })

    if (probe.status !== 402) {
      return { response: probe, paid: false } satisfies PaidResponse
    }

    const body = yield* Effect.tryPromise({
      try: () => probe.json() as Promise<unknown>,
      catch: (e) => new RpcFailure({ method: "402 body", reason: String((e as Error)?.message ?? e) })
    })
    const challenge = yield* decode402(body).pipe(
      Effect.mapError((e) => new RpcFailure({ method: "402 decode", reason: String(e) }))
    )

    const requirements = challenge.accepts[0]
    if (requirements === undefined) {
      return yield* new RpcFailure({ method: "402", reason: "no acceptable payment requirements" })
    }

    const amount = BigInt(requirements.amount)
    if (options.maxAmountAtomic !== undefined && amount > options.maxAmountAtomic) {
      return yield* new RpcFailure({
        method: "402",
        reason: `price ${amount} exceeds max-amount ${options.maxAmountAtomic}`
      })
    }

    // Offline. No gas, no chain round-trip — measured at ~5ms during G-1.
    const signed = yield* signAuthorization({
      account: options.account,
      to: requirements.payTo,
      valueAtomic: amount,
      validForSeconds: requirements.maxTimeoutSeconds
    })

    const payload = PaymentPayload.make({
      x402Version: 2,
      scheme: "exact",
      network: requirements.network,
      payload: signed
    })

    const retryHeaders = new Headers(init.headers ?? {})
    retryHeaders.set(HEADER_PAYMENT_SIGNATURE, encodeHeader(payload))

    const paidRes = yield* Effect.tryPromise({
      try: () => doFetch(String(input), { ...init, headers: retryHeaders }),
      catch: (e) => new RpcFailure({ method: "fetch(paid)", reason: String((e as Error)?.message ?? e) })
    })

    return {
      response: paidRes,
      paid: true,
      amountAtomic: amount,
      requirements
    } satisfies PaidResponse
  })
