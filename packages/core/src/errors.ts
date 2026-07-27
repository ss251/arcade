import { Data } from "effect"

/**
 * The shared failure vocabulary. Every one of these is a value in an Effect error channel,
 * so a caller cannot forget to handle one without the compiler noticing.
 *
 * Grouped by the stage that produces them: payment → execution → settlement.
 */

// ── Payment (packages/payments, apps/hub paywall) ────────────────────────────

/** Payment header absent or unparseable — answered with a fresh 402 challenge. */
export class PaymentRequired extends Data.TaggedError("PaymentRequired")<{
  readonly resource: string
  readonly priceAtomic: bigint
}> {}

/** Signature did not recover to the claimed payer, or the EIP-712 domain did not match. */
export class InvalidSignature extends Data.TaggedError("InvalidSignature")<{
  readonly reason: string
  readonly payer?: string
}> {}

/** Payer's balance (or Gateway balance) cannot cover the authorization. */
export class InsufficientFunds extends Data.TaggedError("InsufficientFunds")<{
  readonly payer: string
  readonly requiredAtomic: bigint
  readonly availableAtomic?: bigint
}> {}

/** Authorization nonce already used — replay attempt. */
export class NonceAlreadyUsed extends Data.TaggedError("NonceAlreadyUsed")<{
  readonly nonce: string
  readonly payer: string
}> {}

/** `validAfter`/`validBefore` window is not currently open, or is shorter than Gateway allows. */
export class AuthorizationExpired extends Data.TaggedError("AuthorizationExpired")<{
  readonly validAfter: bigint
  readonly validBefore: bigint
  readonly nowSeconds: number
}> {}

/** A payment was already attempted on this request — guards the buyer's retry loop. */
export class PaymentAlreadyAttempted extends Data.TaggedError("PaymentAlreadyAttempted")<{
  readonly resource: string
}> {}

/** Broadcasting the settlement failed. Distinct from a rejected authorization. */
export class SettlementFailed extends Data.TaggedError("SettlementFailed")<{
  readonly reason: string
  readonly txHash?: string
}> {}

/** Arc's public RPC rate limit (-32011). Retried with exponential backoff, never hammered. */
export class RpcRateLimited extends Data.TaggedError("RpcRateLimited")<{
  readonly method: string
}> {}

/** Any other RPC/transport failure. */
export class RpcFailure extends Data.TaggedError("RpcFailure")<{
  readonly method: string
  readonly reason: string
}> {
  /**
   * `Data.TaggedError` defaults `message` to "An error has occurred", so a failure that
   * knows exactly what went wrong printed nothing useful — a buyer whose call failed saw
   * `RpcFailure: An error has occurred` and could not tell payment from dispatch from
   * polling. The fields exist; they just have to be said.
   */
  override get message(): string {
    return `${this.method}: ${this.reason}`
  }
}

// ── Execution (packages/runner, apps/hub broker) ─────────────────────────────

/** No runner is currently connected that can serve this listing. */
export class NoRunnerAvailable extends Data.TaggedError("NoRunnerAvailable")<{
  readonly skillId: string
}> {}

/** The engine declined to answer (Claude `stop_reason: "refusal"` etc.). NOT an exit code. */
export class EngineRefused extends Data.TaggedError("EngineRefused")<{
  readonly skillId: string
  readonly stopReason: string
}> {}

/** The job exceeded its declared bounds (turns / tokens / tool calls). */
export class BoundsExceeded extends Data.TaggedError("BoundsExceeded")<{
  readonly skillId: string
  readonly bound: "maxTurns" | "maxTokens" | "maxToolCalls" | "timeoutSec"
  readonly limit: number
}> {}

/** The job ran past `timeoutSec` and was interrupted; the sandbox is torn down by `Scope`. */
export class JobTimeout extends Data.TaggedError("JobTimeout")<{
  readonly jobId: string
  readonly timeoutSec: number
}> {}

/** The engine produced output that does not satisfy the listing's declared output schema. */
export class SchemaInvalid extends Data.TaggedError("SchemaInvalid")<{
  readonly skillId: string
  readonly detail: string
}> {}

/** The runner process died or the socket dropped mid-job. */
export class RunnerDisconnected extends Data.TaggedError("RunnerDisconnected")<{
  readonly runnerId: string
  readonly jobId?: string
}> {}

// ── Registry / manifest ──────────────────────────────────────────────────────

export class ListingNotFound extends Data.TaggedError("ListingNotFound")<{
  readonly skillId: string
}> {}

/** A manifest failed publish-time validation (Bazaar limits, schema shape, price form). */
export class ManifestInvalid extends Data.TaggedError("ManifestInvalid")<{
  readonly detail: string
}> {}

/**
 * The product's cardinal sin: something tried to publish a private field.
 * This should be unreachable — `toPublicListing` is a schema transformation, not a filter —
 * but it exists so that any future code path that reintroduces the risk fails loudly.
 */
export class SecrecyViolation extends Data.TaggedError("SecrecyViolation")<{
  readonly field: string
}> {}

export type ArcadeError =
  | PaymentRequired
  | InvalidSignature
  | InsufficientFunds
  | NonceAlreadyUsed
  | AuthorizationExpired
  | PaymentAlreadyAttempted
  | SettlementFailed
  | RpcRateLimited
  | RpcFailure
  | NoRunnerAvailable
  | EngineRefused
  | BoundsExceeded
  | JobTimeout
  | SchemaInvalid
  | RunnerDisconnected
  | ListingNotFound
  | ManifestInvalid
  | SecrecyViolation
