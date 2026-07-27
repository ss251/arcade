import { parsePrice, formatPrice } from "@arcade/core"
import * as hub from "./hub.ts"

/**
 * The purchase edge, built so the two bindings cannot disagree.
 *
 * `docs/threat-model.md` T-EXEC-005: this edge carries TWO cryptographic bindings covering
 * DIFFERENT facts. The AI SDK's approval HMAC binds *tool name + call id + input arguments*
 * — "the visitor agreed to buy skill X for at most $N". The EIP-3009 signature binds
 * *payTo + value + validBefore + nonce* — "pay this address this amount". Nothing ties one
 * to the other by construction, and if a client can hold an approval for one purchase and
 * sign a different one, the human gate is decorative.
 *
 * The resolution is single-copy rather than a cross-check. The server derives the payment
 * requirements FROM the approved arguments and hands the client only that. The client is
 * never in possession of an alternative to sign, so the mismatch is unconstructible instead
 * of detected — the same move as `SellerAuthored` and as deriving `hubWsUrl`, except this
 * time it prevents a second copy from existing rather than removing one that already did.
 *
 * ## What this function does NOT do
 *
 * It does not sign, and it holds no key. The signature happens in the visitor's browser
 * with the visitor's wallet — `packages/buyer/src/mcp.ts` states the rule this service
 * obeys: a process holding a spending key must not be exposed over a network, and this one
 * is exposed. What it returns is a signing REQUEST: the exact requirements, and nothing the
 * client could substitute.
 */

export class PriceMovedAboveApproval extends Error {
  readonly _tag = "PriceMovedAboveApproval"
  constructor(readonly quotedAtomic: bigint, readonly approvedAtomic: bigint) {
    super(
      `the endpoint now asks ${formatPrice(quotedAtomic)}, above the approved ceiling of ` +
        `${formatPrice(approvedAtomic)} — nothing was signed`
    )
  }
}

export interface SigningRequest {
  readonly skillId: string
  /** The resource the payment authorises. Derived, never supplied by the client. */
  readonly resource: string
  readonly payTo: string
  readonly asset: string
  readonly network: string
  /** Atomic units as a decimal string — never a JS number. */
  readonly amountAtomic: string
  readonly price: string
  /**
   * The approval this request was derived from. Carried so the client's settle call can be
   * matched against it, and so a request cannot be reused under a different approval.
   */
  readonly toolCallId: string
}

/**
 * Derive what the visitor will be asked to sign, from what they approved.
 *
 * `approvedMaxUsd` is the argument the approval HMAC covers. The quote comes from the
 * endpoint's own 402 challenge rather than the catalogue, so a listing whose advertised
 * price has drifted is caught here — and if the endpoint now asks for more than was
 * approved, this REFUSES rather than re-asking, because the visitor approved a number and
 * the number changed. Re-asking would be defensible; silently proceeding would not.
 */
export const deriveSigningRequest = async (
  approved: { readonly skillId: string; readonly maxAmountUsd: string; readonly toolCallId: string }
): Promise<SigningRequest> => {
  const approvedAtomic = parsePrice(approved.maxAmountUsd)
  const quote = await hub.quote(approved.skillId)
  const quotedAtomic = BigInt(quote.amountAtomic)

  if (quotedAtomic > approvedAtomic) {
    throw new PriceMovedAboveApproval(quotedAtomic, approvedAtomic)
  }

  return {
    // Every field below comes from the approved skillId's own challenge. None of it is
    // client-supplied, which is what makes an approval-for-A / settle-B mismatch
    // unconstructible rather than merely detected.
    skillId: quote.skillId,
    resource: quote.resource,
    payTo: quote.payTo,
    asset: quote.asset,
    network: quote.network,
    amountAtomic: quote.amountAtomic,
    price: formatPrice(quotedAtomic),
    toolCallId: approved.toolCallId
  }
}
