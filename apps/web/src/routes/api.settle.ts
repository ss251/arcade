import { createFileRoute } from "@tanstack/react-router"
import { NON_SETTLING, type JobStatus } from "@arcade/core"
import * as hub from "../lib/hub.ts"
import { hubJson, hubOrigin, requestJson } from "../lib/hub-http.ts"
import { purchaseInput } from "../lib/purchase-input.ts"

/**
 * Keyless courier for a signature produced in the browser. Re-derive the approved skill's
 * actual-input quote (including ENS), compare the signed payee AND amount before sending,
 * and forward exactly once. No redirects, ambient credentials or arbitrary polling URLs.
 * Once a signature exists, an uncertain network outcome is never evidence of no charge.
 */
const uncertain = () => Response.json({
  error: "outcome_unconfirmed",
  detail: "Purchase outcome unconfirmed. The signed authorization may still be valid. Check the hub's settlement record before retrying."
}, { status: 502 })
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const terminal = (body: Record<string, unknown>, quote: hub.Quote, buyer: string): boolean => {
  const receipt = body["receipt"]
  if (typeof body["job_id"] !== "string" || !/^[A-Za-z0-9_]{1,128}$/.test(body["job_id"]) ||
      !record(receipt) || receipt["jobId"] !== body["job_id"] || receipt["skillId"] !== quote.skillId ||
      typeof receipt["buyer"] !== "string" || receipt["buyer"].toLowerCase() !== buyer.toLowerCase() ||
      typeof receipt["seller"] !== "string" || receipt["seller"].toLowerCase() !== quote.seller.toLowerCase() ||
      receipt["network"] !== quote.network || receipt["priceAtomic"] !== quote.amountAtomic) return false
  if (receipt["settled"] === true) return body["status"] === "succeeded" &&
    typeof receipt["settleTx"] === "string" && /^0x[0-9a-fA-F]{64}$/.test(receipt["settleTx"])
  // The hub may have valid output but an unsettled rail; never turn that into a no-charge assertion.
  return receipt["settled"] === false && receipt["settleTx"] === undefined &&
    typeof body["status"] === "string" && (body["status"] === "succeeded" || NON_SETTLING.has(body["status"] as JobStatus))
}

export const handleSettle = async ({ request }: { request: Request }): Promise<Response> => {
  let skillId: string
  let input: Record<string, unknown>
  let auth: Record<string, unknown>
  try {
    const body = await requestJson(request)
    if (!record(body) || typeof body["skillId"] !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(body["skillId"]) ||
        !record(body["authorization"])) throw new Error()
    auth = body["authorization"]
    if (typeof auth["signature"] !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(auth["signature"]) ||
        typeof auth["from"] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(auth["from"]) ||
        typeof auth["to"] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(auth["to"]) ||
        typeof auth["value"] !== "string" || !/^[1-9][0-9]{0,77}$/.test(auth["value"])) throw new Error()
    skillId = body["skillId"]
    input = purchaseInput(body["input"])
  } catch {
    return Response.json({ error: "invalid_settle_input", detail: "A skill, bounded input and signed authorization are required" }, { status: 400 })
  }

  try {
    const quote = await hub.quote(skillId, input)
    if (auth["value"] !== quote.amountAtomic || (auth["to"] as string).toLowerCase() !== quote.payTo.toLowerCase()) {
      return Response.json({ error: "terms_moved", detail: "The current payment terms differ from the signed authorization. Nothing was forwarded; do not reuse or retry this authorization without reconciliation." }, { status: 409 })
    }
    const { signature, ...authorization } = auth
    const payload = { x402Version: 2, payload: { authorization, signature }, accepted: quote.requirements }
    const encoded = btoa(JSON.stringify(payload))
    const res = await hubJson(quote.resource, {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": encoded, "x-payment": encoded },
      body: JSON.stringify(input)
    })
    if (res.status !== 200 && res.status !== 202) return uncertain()
    if (!record(res.body)) return uncertain()
    if (res.status === 200) return terminal(res.body, quote, auth["from"] as string)
      ? Response.json({ status: 200, body: res.body }) : uncertain()

    const accepted = res.body
    if (typeof accepted["job_id"] !== "string" || !/^[A-Za-z0-9_]{1,128}$/.test(accepted["job_id"]) ||
        typeof accepted["poll_url"] !== "string" || accepted["poll_url"].length > 2048) return uncertain()
    const rawPoll = accepted["poll_url"]
    const poll = new URL(rawPoll)
    if (poll.origin !== hubOrigin() || poll.username || poll.password || poll.hash ||
        poll.pathname !== `/jobs/${accepted["job_id"]}/result` ||
        (poll.search !== "" && !/^\?token=[a-f0-9]{32}$/.test(poll.search)) ||
        rawPoll !== hubOrigin() + poll.pathname + poll.search) return uncertain()

    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      // The real hub holds this GET until a receipt exists (up to 120s). Keep the entire
      // remaining 90s result budget, not the short quote/paid-POST timeout. Never resend payment.
      const response = await hubJson(poll.pathname + poll.search, {}, remaining)
      if (!record(response.body) || response.body["job_id"] !== accepted["job_id"]) return uncertain()
      if (response.status === 202 && response.body["status"] === "pending") continue
      if (response.status !== 200 || !terminal(response.body, quote, auth["from"] as string)) return uncertain()
      return Response.json({ status: 200, body: response.body })
    }
    return Response.json({ error: "still_running", detail: "The job outcome remains unconfirmed. Check the hub's settlement record before retrying.", jobId: accepted["job_id"] }, { status: 504 })
  } catch { return uncertain() }
}

export const Route = createFileRoute("/api/settle")({
  server: { handlers: { POST: handleSettle } }
})
