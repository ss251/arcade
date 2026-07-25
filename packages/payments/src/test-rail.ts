import { Effect, Layer, Ref } from "effect"
import {
  ARC_CAIP2,
  AuthorizationExpired,
  GATEWAY_MIN_VALIDITY_SECONDS,
  InsufficientFunds,
  InvalidSignature,
  NonceAlreadyUsed,
  SettlementFailed,
  USDC_ADDRESS
} from "@arcade/core"
import { PaymentRequirements, type PaymentPayload, type SettledPayment, type VerifiedPayment } from "./types.ts"
import type { ChallengeInput, Rail } from "./rail.ts"
import { RailTag } from "./rail.ts"

/**
 * In-memory rail with the same semantics as the live ones.
 *
 * Its purpose is that the hub's ENTIRE settle pipeline — including every failure path —
 * can be tested without a chain, a faucet, or a network. It is held to the same
 * conformance suite as the production rails, so it cannot drift into a convenient fiction.
 */

export interface TestRailState {
  /** payer -> balance in atomic units */
  readonly balances: Map<string, bigint>
  /** used nonces */
  readonly nonces: Set<string>
  /** settlements performed, newest last */
  readonly settlements: Array<SettledPayment>
  /** when true, settle() fails — exercises the SettlementFailed path */
  failSettlement: boolean
}

export const makeTestRail = (
  stateRef: Ref.Ref<TestRailState>
): Rail => {
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
        maxTimeoutSeconds: GATEWAY_MIN_VALIDITY_SECONDS,
        extra: {}
      })
    )

  const verify = (payload: PaymentPayload, requirements: PaymentRequirements) =>
    Effect.gen(function* () {
      const p = payload.payload
      const value = BigInt(p.value)
      const required = BigInt(requirements.amount)
      const state = yield* Ref.get(stateRef)

      if (p.signature === "0xbad" || p.signature.length < 4) {
        return yield* new InvalidSignature({ reason: "test: bad signature", payer: p.from })
      }
      if (p.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
        return yield* new InvalidSignature({ reason: "payTo mismatch", payer: p.from })
      }
      if (value < required) {
        return yield* new InsufficientFunds({
          payer: p.from,
          requiredAtomic: required,
          availableAtomic: value
        })
      }

      const now = Math.floor(Date.now() / 1000)
      const validAfter = BigInt(p.validAfter)
      const validBefore = BigInt(p.validBefore)
      if (BigInt(now) < validAfter || BigInt(now) >= validBefore) {
        return yield* new AuthorizationExpired({ validAfter, validBefore, nowSeconds: now })
      }

      if (state.nonces.has(p.nonce)) {
        return yield* new NonceAlreadyUsed({ nonce: p.nonce, payer: p.from })
      }

      const balance = state.balances.get(p.from.toLowerCase()) ?? 0n
      if (balance < value) {
        return yield* new InsufficientFunds({
          payer: p.from,
          requiredAtomic: value,
          availableAtomic: balance
        })
      }

      return {
        payer: p.from,
        payTo: p.to,
        amountAtomic: value,
        network: payload.network,
        payload,
        requirements
      } satisfies VerifiedPayment
    })

  const settle = (verified: VerifiedPayment) =>
    Effect.gen(function* () {
      const state = yield* Ref.get(stateRef)
      if (state.failSettlement) {
        return yield* new SettlementFailed({ reason: "test: forced settlement failure" })
      }

      const nonce = verified.payload.payload.nonce
      const payer = verified.payer.toLowerCase()
      const txHash = `0xtest${nonce.slice(2, 12)}${state.settlements.length.toString(16).padStart(4, "0")}`

      yield* Ref.update(stateRef, (s) => {
        const balances = new Map(s.balances)
        balances.set(payer, (balances.get(payer) ?? 0n) - verified.amountAtomic)
        const seller = verified.payTo.toLowerCase()
        balances.set(seller, (balances.get(seller) ?? 0n) + verified.amountAtomic)
        const nonces = new Set(s.nonces)
        nonces.add(nonce)
        return {
          ...s,
          balances,
          nonces,
          settlements: [...s.settlements, { txHash, payer: verified.payer, amountAtomic: verified.amountAtomic }]
        }
      })

      return { txHash, payer: verified.payer, amountAtomic: verified.amountAtomic } satisfies SettledPayment
    })

  return { name: "test", challenge, verify, settle }
}

export const makeTestState = (
  balances: Record<string, bigint> = {}
): TestRailState => ({
  balances: new Map(Object.entries(balances).map(([k, v]) => [k.toLowerCase(), v])),
  nonces: new Set(),
  settlements: [],
  failSettlement: false
})

export const RailTest = (initial?: Record<string, bigint>): Layer.Layer<RailTag> =>
  Layer.effect(
    RailTag,
    Effect.gen(function* () {
      const ref = yield* Ref.make(makeTestState(initial))
      return makeTestRail(ref)
    })
  )
