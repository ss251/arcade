import { Effect, Layer, Ref } from "effect"
import {
  ARC_CAIP2,
  AuthorizationExpired,
  GATEWAY_MIN_VALIDITY_SECONDS,
  InsufficientFunds,
  InvalidSignature,
  NonceAlreadyUsed,
  SettlementFailed,
  USDC_ADDRESS,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION
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
  /** What a payer not named in `balances` starts with. Zero in tests, funded for demos. */
  readonly defaultBalance: bigint
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
        // Mirrors EIP3009Live: every rail must publish a signable EIP-712 domain, or the
        // test layer would quietly diverge from the thing it stands in for.
        extra: { name: USDC_EIP712_NAME, version: USDC_EIP712_VERSION }
      })
    )

  const verify = (payload: PaymentPayload, requirements: PaymentRequirements) =>
    Effect.gen(function* () {
      const p = payload.payload.authorization
      const sig = payload.payload.signature
      const value = BigInt(p.value)
      const required = BigInt(requirements.amount)
      const state = yield* Ref.get(stateRef)

      if (sig === "0xbad" || sig.length < 4) {
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

      const balance = state.balances.get(p.from.toLowerCase()) ?? state.defaultBalance
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
        network: payload.accepted.network,
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

      const nonce = verified.payload.payload.authorization.nonce
      const payer = verified.payer.toLowerCase()
      const txHash = `0xtest${nonce.slice(2, 12)}${state.settlements.length.toString(16).padStart(4, "0")}`

      yield* Ref.update(stateRef, (s) => {
        const balances = new Map(s.balances)
        // Both sides fall back to `defaultBalance`, the same as `verify` does. Deducting
        // from `0n` instead sent an unlisted payer NEGATIVE on their first settlement, so
        // the second call failed `InsufficientFunds` — verify saw the default, settle did
        // not, and the two disagreed about what an unknown account holds.
        balances.set(payer, (balances.get(payer) ?? s.defaultBalance) - verified.amountAtomic)
        const seller = verified.payTo.toLowerCase()
        balances.set(seller, (balances.get(seller) ?? s.defaultBalance) + verified.amountAtomic)
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
  balances: Record<string, bigint> = {},
  defaultBalance = 0n
): TestRailState => ({
  balances: new Map(Object.entries(balances).map(([k, v]) => [k.toLowerCase(), v])),
  defaultBalance,
  nonces: new Set(),
  settlements: [],
  failSettlement: false
})

/**
 * `defaultBalance` is what an unlisted payer starts with, and it exists because this layer
 * could not do the job it was written for.
 *
 * The docstring above says the point is to exercise the hub's entire settle pipeline
 * without a chain — but with every balance defaulting to zero, a real buyer running
 * `arcade-buy` against `ARCADE_RAIL=test` always failed at `InsufficientFunds` and never
 * reached settlement. The failure paths were reachable; the success path was not. Tests
 * that name their payers are unaffected and still start at zero.
 */
export const RailTest = (
  initial?: Record<string, bigint>,
  defaultBalance = 0n
): Layer.Layer<RailTag> =>
  Layer.effect(
    RailTag,
    Effect.gen(function* () {
      const ref = yield* Ref.make(makeTestState(initial, defaultBalance))
      return makeTestRail(ref)
    })
  )
