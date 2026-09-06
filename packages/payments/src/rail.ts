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
  /**
   * The announced splitter's on-chain version, read at handshake. Copied into the
   * challenge's `extra` (which the buyer signs against) so the routing decision — whether
   * `settle` calls `settleWithTree` — is visible in what was signed, not re-derived from
   * process config after the fact.
   */
  readonly feeSplitterVersion?: 1 | 2 | undefined
}

/**
 * A commitment to the receipt tree a root job settled under, passed to `Rail.settle` so
 * `FeeSplitterV2.settleWithTree` can record it on chain. `undefined` (the common case: a
 * job with no children) means "settle plainly" — a v2 splitter accepts both, but committing
 * a hash of the empty set on every ordinary call is meaningless, called out as a minor in
 * Task 6's review.
 */
export interface SettleTree {
  readonly treeHash: `0x${string}`
  readonly childCount: number
  readonly childTotalAtomic: bigint
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
 * one interface. Layers construct the built inventory; an ordinary request selects
 * one of the listing's advertised choices, which is retained through settlement.
 * `erc8183` is a reserved contract here, not a built escrow implementation.
 *
 * The split of verify/settle is load-bearing for D2: we verify BEFORE the seller does any
 * work, and settle only AFTER the output validates, which may be minutes later. That is
 * exactly why Circle's Express middleware (which settles inside the request) is unusable here.
 */
export interface Rail {
  readonly name: "eip3009" | "gateway" | "erc8183" | "test"

  /** Build the 402 body a buyer needs in order to pay. */
  readonly challenge: (input: ChallengeInput) => Effect.Effect<PaymentRequirements>

  /** Check the authorization is real, funded and unused. No chain writes. */
  readonly verify: (
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ) => Effect.Effect<VerifiedPayment, VerifyError>

  /**
   * Cash the authorization. Called only after settle-on-success says yes.
   *
   * `tree` is present only for a root job that actually hired — see `SettleTree`. A rail
   * whose splitter cannot commit one (v1, no splitter, or a non-EIP3009 rail) accepts and
   * ignores it, since the tree is still published in the receipt regardless of whether the
   * chain also holds a hash of it.
   */
  readonly settle: (verified: VerifiedPayment, tree?: SettleTree) => Effect.Effect<SettledPayment, SettleError>
}

export class RailTag extends Context.Tag("@arcade/payments/Rail")<RailTag, Rail>() {}
