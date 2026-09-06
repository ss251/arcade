import { createFileRoute } from "@tanstack/react-router"
import { formatPrice } from "@arcade/core"
import * as hub from "../lib/hub.ts"
import { requestJson } from "../lib/hub-http.ts"
import { purchaseInput } from "../lib/purchase-input.ts"
import { capturePurchaseTarget, type PurchaseTarget } from "../lib/purchase-target.ts"

/**
 * A keyless snapshot for the card. The verified ENS name is emitted only after /names and
 * the actual-input 402 agree. The live browser captures the complete context at
 * confirmation and checks it again before signing and forwarding directly.
 * SDK approvals alone are not payment authority; the private conversation owner is
 * also required. A returned snapshot itself cannot authorize a payment.
 */
export const handleQuote = async ({ request }: { request: Request }): Promise<Response> => {
  let target: PurchaseTarget
  let input: Record<string, unknown>
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })
  try {
    if (request.method !== "GET" && request.method !== "POST") throw new Error()
    let body: unknown
    if (request.method === "GET") {
      const query = new URL(request.url).searchParams
      if (query.getAll("skillId").length > 1 || query.getAll("name").length > 1) throw new Error()
      body = { ...(query.has("skillId") ? { skillId: query.get("skillId") } : {}),
        ...(query.has("name") ? { name: query.get("name") } : {}), input: {} }
    } else body = await requestJson(request)
    const captured = capturePurchaseTarget(body)
    if (!captured || !body || typeof body !== "object") throw new Error()
    target = captured
    input = purchaseInput("input" in body ? body.input : undefined)
  } catch { return json({ error: "invalid_quote_input", detail: "Exactly one skill identifier or ENS name and bounded JSON object input are required" }, 400) }

  try {
    const q = await hub.quote(target, input)
    return json({
      skillId: q.skillId, price: formatPrice(BigInt(q.amountAtomic)), amountAtomic: q.amountAtomic,
      payTo: q.payTo, network: q.network, asset: q.asset,
      ...(q.browser === undefined ? {} : { browser: q.browser }),
      ...(q.ensName === undefined ? {} : { ensName: q.ensName })
    })
  } catch (error) {
    if (error instanceof hub.EnsNameExpired) return json({ error: "ens_name_expired", detail: "The ENS name has expired. Nothing was signed." }, 502)
    if (error instanceof hub.EnsPayToMismatch) return json({ error: "ens_payto_mismatch",
      ensPayTo: error.ensPayTo, challengePayTo: error.challengePayTo, detail: error.message }, 502)
    return json({ error: "quote_failed", detail: "Payment terms or ENS verification are unavailable. Nothing was signed." }, 502)
  }
}

export const Route = createFileRoute("/api/quote")({
  server: { handlers: { GET: handleQuote, POST: handleQuote } }
})
