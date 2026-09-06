import { parsePrice, formatPrice } from "@arcade/core"
import * as hub from "./hub.ts"

/**
 * Server-side purchase preparation only; this module never signs or spends.
 * Where configured, the SDK HMAC binds tool name/call ID/original arguments.
 * Independently, the live browser requires a private one-use approval covering
 * that binding and the complete displayed quote. It rechecks the quote before
 * and after signing, then sends directly to the captured hub. SDK output alone
 * is not authority, and restored history cannot reconstruct the browser permit.
 * These derived public coordinates remain a readiness signal/compatibility
 * surface; the browser does not sign output-supplied coordinates.
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
  readonly ensName?: string
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
   * Original call identity. The browser also binds the SDK approval ID, input,
   * ceiling and private quote; this public ID alone cannot authorize reuse.
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
  approved: { readonly skillId: string; readonly maxAmountUsd: string; readonly toolCallId: string; readonly input?: unknown }
): Promise<SigningRequest> => {
  const approvedAtomic = parsePrice(approved.maxAmountUsd)
  const quote = await hub.quote(approved.skillId, approved.input)
  const quotedAtomic = BigInt(quote.amountAtomic)

  if (quotedAtomic > approvedAtomic) {
    throw new PriceMovedAboveApproval(quotedAtomic, approvedAtomic)
  }

  return {
    // Public preparation from the actual-input quote. The separate private
    // browser permit and fresh quote comparisons enforce the payment binding.
    skillId: quote.skillId,
    resource: quote.resource,
    payTo: quote.payTo,
    asset: quote.asset,
    network: quote.network,
    amountAtomic: quote.amountAtomic,
    price: formatPrice(quotedAtomic),
    ...(quote.ensName === undefined ? {} : { ensName: quote.ensName }),
    toolCallId: approved.toolCallId
  }
}
