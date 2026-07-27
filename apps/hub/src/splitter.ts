/**
 * Splitter/seller agreement, as a module with no side effects.
 *
 * It lived in `server.ts`, which boots `Bun.serve` at import — so a test importing it
 * started a server instead of running. A guard that cannot be imported cannot be tested,
 * which is the dormant-guard problem in a new place.
 */

/**
 * Why an announced splitter may not be accepted for this seller.
 *
 * Pure, exported, and the ONLY implementation — the handshake calls this rather than
 * repeating the comparison, so a test exercises the guard itself. Returns `undefined` when
 * the pairing is acceptable.
 */
export const splitterRefusal = (
  announcingSeller: string,
  splitterSeller: string | undefined,
  splitterAddress: string
): string | undefined => {
  // Unreadable is not a refusal: an RPC that will not answer must not take a seller
  // offline, which is the same fail-open the feeBps check already uses.
  if (splitterSeller === undefined) return undefined
  if (splitterSeller.toLowerCase() === announcingSeller.toLowerCase()) return undefined
  return (
    `that fee splitter pays ${splitterSeller}, but you are announcing as ` +
    `${announcingSeller}. FeeSplitter.seller is immutable, so every payment through it ` +
    `would go to the other address no matter what your listings say. Deploy a splitter ` +
    `bound to ${announcingSeller}, or unset ARCADE_FEE_SPLITTER to take the full price ` +
    `with no fee. (splitter ${splitterAddress})`
  )
}

