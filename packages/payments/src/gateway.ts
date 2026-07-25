import { Effect, Layer } from "effect"
import {
  ARC_CAIP2,
  AuthorizationExpired,
  GATEWAY_BATCHING_NAME,
  GATEWAY_BATCHING_VERSION,
  GATEWAY_FACILITATOR_URL,
  GATEWAY_MIN_VALIDITY_SECONDS,
  GATEWAY_WALLET,
  InsufficientFunds,
  InvalidSignature,
  RpcFailure,
  SettlementFailed,
  USDC_ADDRESS
} from "@arcade/core"
import { PaymentRequirements, type PaymentPayload, type SettledPayment, type VerifiedPayment } from "./types.ts"
import type { ChallengeInput, Rail } from "./rail.ts"
import { RailTag } from "./rail.ts"

/**
 * Circle Gateway Nanopayments rail.
 *
 * Circle hosts the facilitator, so we do not run one. Buyers sign offline against the
 * `GatewayWalletBatched` domain and pay ZERO gas; Gateway nets many payments inside a TEE
 * and settles them in one on-chain transaction. Minimum payment is $0.000001, which is what
 * makes deep agent→agent call chains economically real.
 *
 * We drive `BatchFacilitatorClient`-style verify/settle over HTTP directly rather than using
 * `createGatewayMiddleware`, because the middleware settles inside the HTTP request and our
 * jobs settle minutes later, only after the output validates (D2).
 *
 * Arc testnet is Circle's own canonical example chain for this API (`eip155:5042002`).
 */

export interface GatewayConfig {
  readonly facilitatorUrl?: string
  /** Optional bearer for the facilitator, if the deployment requires one. */
  readonly apiKey?: string
}

interface FacilitatorVerifyResponse {
  readonly isValid: boolean
  readonly invalidReason?: string
  readonly payer?: string
}

interface FacilitatorSettleResponse {
  readonly success: boolean
  readonly errorReason?: string
  readonly payer?: string
  readonly transaction?: string
  readonly network?: string
}

export const makeGatewayRail = (config: GatewayConfig = {}): Rail => {
  const base = config.facilitatorUrl ?? GATEWAY_FACILITATOR_URL

  const post = <A>(path: string, body: unknown) =>
    Effect.tryPromise({
      try: async (): Promise<A> => {
        const res = await fetch(`${base}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.apiKey === undefined ? {} : { authorization: `Bearer ${config.apiKey}` })
          },
          body: JSON.stringify(body)
        })
        if (!res.ok) {
          throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`)
        }
        return (await res.json()) as A
      },
      catch: (e) => new RpcFailure({ method: path, reason: String((e as Error)?.message ?? e) })
    })

  const challenge = (input: ChallengeInput) =>
    Effect.succeed(
      PaymentRequirements.make({
        scheme: "exact",
        network: ARC_CAIP2,
        amount: input.priceAtomic.toString(),
        asset: USDC_ADDRESS,
        payTo: input.payTo,
        resource: input.resource,
        ...(input.description === undefined ? {} : { description: input.description }),
        mimeType: "application/json",
        // ≥7 days or Gateway rejects the authorization outright.
        maxTimeoutSeconds: GATEWAY_MIN_VALIDITY_SECONDS,
        // This marker is what tells a buyer to sign the Gateway domain rather than plain exact.
        extra: {
          name: GATEWAY_BATCHING_NAME,
          version: GATEWAY_BATCHING_VERSION,
          verifyingContract: GATEWAY_WALLET
        }
      })
    )

  const verify = (payload: PaymentPayload, requirements: PaymentRequirements) =>
    Effect.gen(function* () {
      const value = BigInt(payload.payload.value)
      const required = BigInt(requirements.amount)

      // Local pre-checks before spending a network round-trip. These also keep the rail
      // conformance suite deterministic and offline for the rejection cases.
      if (value < required) {
        return yield* new InsufficientFunds({
          payer: payload.payload.from,
          requiredAtomic: required,
          availableAtomic: value
        })
      }
      if (payload.payload.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
        return yield* new InvalidSignature({ reason: "payTo mismatch", payer: payload.payload.from })
      }
      const nowSeconds = Math.floor(Date.now() / 1000)
      const validAfter = BigInt(payload.payload.validAfter)
      const validBefore = BigInt(payload.payload.validBefore)
      if (BigInt(nowSeconds) < validAfter || BigInt(nowSeconds) >= validBefore) {
        return yield* new AuthorizationExpired({ validAfter, validBefore, nowSeconds })
      }

      const res = yield* post<FacilitatorVerifyResponse>("/v1/x402/verify", {
        x402Version: 2,
        paymentPayload: payload,
        paymentRequirements: requirements
      })

      if (!res.isValid) {
        const reason = res.invalidReason ?? "facilitator rejected the authorization"
        if (/insufficient|balance/i.test(reason)) {
          return yield* new InsufficientFunds({ payer: payload.payload.from, requiredAtomic: required })
        }
        return yield* new InvalidSignature({ reason, payer: payload.payload.from })
      }

      return {
        payer: res.payer ?? payload.payload.from,
        payTo: requirements.payTo,
        amountAtomic: value,
        network: payload.network,
        payload,
        requirements
      } satisfies VerifiedPayment
    })

  const settle = (verified: VerifiedPayment) =>
    Effect.gen(function* () {
      // Circle's docs are explicit: call settle() directly in production rather than
      // verify-then-settle. We verified earlier only to gate the seller's work (D2).
      const res = yield* post<FacilitatorSettleResponse>("/v1/x402/settle", {
        x402Version: 2,
        paymentPayload: verified.payload,
        paymentRequirements: verified.requirements
      })

      if (!res.success || res.transaction === undefined) {
        return yield* new SettlementFailed({
          reason: res.errorReason ?? "facilitator did not return a transaction",
          ...(res.transaction === undefined ? {} : { txHash: res.transaction })
        })
      }

      return {
        txHash: res.transaction,
        payer: res.payer ?? verified.payer,
        amountAtomic: verified.amountAtomic
      } satisfies SettledPayment
    })

  return { name: "gateway", challenge, verify, settle }
}

export const GatewayLive = (config: GatewayConfig = {}): Layer.Layer<RailTag> =>
  Layer.succeed(RailTag, makeGatewayRail(config))
