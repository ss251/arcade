import { createFileRoute } from "@tanstack/react-router"
import { formatPrice } from "@arcade/core"
import * as hub from "../lib/hub.ts"
import { requestJson } from "../lib/hub-http.ts"
import { purchaseInput } from "../lib/purchase-input.ts"

/**
 * A keyless snapshot for the card. The verified ENS name is emitted only after /names and
 * the actual-input 402 agree. The live browser captures the complete context at
 * confirmation and checks it again before signing and forwarding directly.
 * SDK approvals alone are not payment authority; the private conversation owner is
 * also required. A returned snapshot itself cannot authorize a payment.
 */
export const handleQuote = async ({ request }: { request: Request }): Promise<Response> => {
  let skillId: string
  let input: Record<string, unknown>
  try {
    const body: unknown = request.method === "GET"
      ? { skillId: new URL(request.url).searchParams.get("skillId"), input: {} }
      : await requestJson(request)
    if (!body || typeof body !== "object" || !("skillId" in body) ||
        typeof body.skillId !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(body.skillId)) throw new Error()
    skillId = body.skillId
    input = purchaseInput("input" in body ? body.input : undefined)
  } catch { return Response.json({ error: "invalid_quote_input", detail: "A skill identifier and bounded JSON object input are required" }, { status: 400 }) }

  try {
    const q = await hub.quote(skillId, input)
    return Response.json({
      skillId: q.skillId, price: formatPrice(BigInt(q.amountAtomic)), amountAtomic: q.amountAtomic,
      payTo: q.payTo, network: q.network, asset: q.asset,
      ...(q.browser === undefined ? {} : { browser: q.browser }),
      ...(q.ensName === undefined ? {} : { ensName: q.ensName })
    })
  } catch {
    return Response.json({ error: "quote_failed", detail: "Payment terms or ENS verification are unavailable. Nothing was signed.", skillId }, { status: 502 })
  }
}

export const Route = createFileRoute("/api/quote")({
  server: { handlers: { GET: handleQuote, POST: handleQuote } }
})
