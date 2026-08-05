import { createFileRoute } from "@tanstack/react-router"
import { formatPrice } from "@arcade/core"
import * as hub from "~/lib/hub.ts"

/**
 * What the endpoint is asking, for the confirmation card to display.
 *
 * ## Why the card needs a route at all
 *
 * `lib/hub.ts` runs server-side only and says why: this service is exposed over a network,
 * so it holds no key and reaches nothing that spends. The card runs in the browser and needs
 * the endpoint's own `payTo` — the address the visitor is being asked to verify — so it
 * needs a server hop to get it. This is that hop, and it inherits the same constraint: it
 * reads a 402 challenge and nothing else. Probing signs nothing, sends no payment header and
 * costs nothing, which is exactly why a quote can be free.
 *
 * ## This is a DISPLAY, not a second binding — which is the whole reason it is safe
 *
 * The obvious objection is the one this repo keeps answering: a second copy of a money field
 * is a chance for two copies to disagree. It does not apply here, because this copy binds
 * nothing.
 *
 * The approval HMAC covers `skillId` and `maxAmountUsd` — a CEILING, not an address. The
 * signature the wallet later produces covers `payTo`, `value`, `validBefore` and `nonce`,
 * and every one of those is derived inside `deriveSigningRequest` from the approved skill's
 * own challenge, never from anything the client sends back. So if the endpoint's terms move
 * between this display and the signature, the card was merely stale — and if they move ABOVE
 * the approved ceiling, `PriceMovedAboveApproval` refuses outright rather than re-asking.
 *
 * The distinction worth keeping: the card shows what is TRUE NOW, the approval binds what
 * the visitor AGREED TO, and the ceiling is what makes the gap between them safe. A card
 * that displayed nothing would be safer against drift and worse at its actual job, which is
 * letting someone verify who gets their money.
 */

const handler = async ({ request }: { request: Request }): Promise<Response> => {
  const skillId = new URL(request.url).searchParams.get("skillId") ?? ""
  if (skillId === "") {
    return Response.json({ error: "skillId is required" }, { status: 400 })
  }

  try {
    const q = await hub.quote(skillId)
    return Response.json({
      skillId: q.skillId,
      // Formatted server-side, from atomic units, by the same function the hub and the
      // receipts page use. A price crossing a network boundary as a number is a price a
      // renderer can round; `apps/web/test/figures.test.ts` pins this for the tool path and
      // the reasoning is identical here.
      price: formatPrice(BigInt(q.amountAtomic)),
      amountAtomic: q.amountAtomic,
      payTo: q.payTo,
      network: q.network,
      asset: q.asset
    })
  } catch (e) {
    // The card renders its blocked state from this. Naming the skill matters because the
    // visitor is looking at a card about that skill and needs to know the card is the thing
    // that failed, not their wallet.
    return Response.json(
      { error: "quote_failed", detail: String((e as Error)?.message ?? e), skillId },
      { status: 502 }
    )
  }
}

export const Route = createFileRoute("/api/quote")({
  server: { handlers: { GET: handler } }
})
