import { Context, type Effect } from "effect"
import type {
  AuthorizationExpired,
  InsufficientFunds,
  InvalidSignature,
  NonceAlreadyUsed,
  RpcFailure,
  RpcRateLimited,
  SettlementFailed
} from "@arcade/core"
import type { PaymentPayload, PaymentRequirements, SettledPayment, VerifiedPayment } from "./types.ts"

export interface ChallengeInput {
  readonly priceAtomic: bigint
  readonly resource: string
  readonly payTo: string
  readonly description?: string
  /**
   * THIS seller's fee splitter, if they have one. Per call, never per process.
   *
   * A rail configured with one global splitter substituted it for every listing's payout,
   * which is correct with a single seller and silently catastrophic with two:
   * `FeeSplitter.seller` is immutable, so a second seller's buyers would sign
   * authorizations paying the first seller's contract, which can only ever pay the first
   * seller. Passing it alongside `payTo` makes "whose money is this" a property of the
   * call instead of the deployment.
   */
  readonly feeSplitter?: string | undefined
}

export type VerifyError =
  | InvalidSignature
  | InsufficientFunds
  | NonceAlreadyUsed
  | AuthorizationExpired
  | RpcRateLimited
  | RpcFailure

export type SettleError = SettlementFailed | RpcRateLimited | RpcFailure

/**
 * The payment rail.
 *
 * Two production implementations (`EIP3009Live`, `GatewayLive`) plus `RailTest` satisfy this
 * one interface, and the hub depends only on the tag. Choosing a rail is therefore a
 * `Layer` wiring decision that the compiler checks — not a runtime `if`, and not an env flag
 * that could let one implementation silently rot.
 *
 * The split of verify/settle is load-bearing for D2: we verify BEFORE the seller does any
 * work, and settle only AFTER the output validates, which may be minutes later. That is
 * exactly why Circle's Express middleware (which settles inside the request) is unusable here.
 */
export interface Rail {
  readonly name: "eip3009" | "gateway" | "test"

  /** Build the 402 body a buyer needs in order to pay. */
  readonly challenge: (input: ChallengeInput) => Effect.Effect<PaymentRequirements>

  /** Check the authorization is real, funded and unused. No chain writes. */
  readonly verify: (
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ) => Effect.Effect<VerifiedPayment, VerifyError>

  /** Cash the authorization. Called only after settle-on-success says yes. */
  readonly settle: (verified: VerifiedPayment) => Effect.Effect<SettledPayment, SettleError>
}

export class RailTag extends Context.Tag("@arcade/payments/Rail")<RailTag, Rail>() {}
