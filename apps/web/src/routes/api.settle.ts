import { createFileRoute } from "@tanstack/react-router"
import { formatPrice } from "@arcade/core"
import * as hub from "~/lib/hub.ts"

/**
 * Carry a signed authorization to the endpoint, and bring back what it returns.
 *
 * ## This holds no key, and that is the whole test
 *
 * `lib/hub.ts` states the constraint: a process exposed over a network must not hold a
 * spending key. This one does not. It receives an authorization the visitor's wallet
 * already signed and forwards it — and a signed EIP-3009 authorization names its payee,
 * amount, validity window and nonce INSIDE the signature, so this route cannot redirect the
 * payment, raise it, replay it, or mint another. It is a courier carrying a sealed envelope
 * it cannot open or alter.
 *
 * ## Why a courier at all, rather than the browser calling the hub
 *
 * The hub sends no CORS headers on `/x/:seller/:skill`, so a browser cannot post there. The
 * two ways forward were to open CORS on the money endpoint of the live submission artifact,
 * or to relay through the origin that already serves this page. The relay wins: it widens
 * no exposure on the hub, needs no redeploy of the thing being judged, and costs the
 * product claim nothing — "your wallet signs, we never see your key" is exactly as true,
 * because the key never leaves the browser either way. Worth stating plainly, because
 * `lib/hub.ts` says the purchase edge "is the browser's job" and that comment was written
 * about CUSTODY, not about which process makes the HTTP call.
 *
 * ## Everything is re-derived, and the amount is checked before anything is sent
 *
 * The client supplies a `skillId` and a signature. Not the payee, not the price, not the
 * resource — those are read back from the endpoint's own challenge here, the same move
 * `deriveSigningRequest` makes. Then the freshly quoted amount is compared against the
 * amount actually signed, and a mismatch REFUSES rather than forwarding: a signature for a
 * different number would be rejected downstream anyway, and failing here says which number
 * moved instead of surfacing a signature error that means nothing to anyone.
 */

interface SettleBody {
  readonly skillId?: unknown
  readonly input?: unknown
  readonly authorization?: Record<string, unknown>
}

const handler = async ({ request }: { request: Request }): Promise<Response> => {
  const body = (await request.json().catch(() => ({}))) as SettleBody
  const skillId = typeof body.skillId === "string" ? body.skillId : ""
  const auth = body.authorization

  if (skillId === "" || auth === undefined || typeof auth["signature"] !== "string") {
    return Response.json({ error: "skillId and a signed authorization are required" }, { status: 400 })
  }

  try {
    const quote = await hub.quote(skillId)

    if (String(auth["value"]) !== quote.amountAtomic) {
      return Response.json(
        {
          error: "price_moved",
          detail:
            `the endpoint now asks ${formatPrice(BigInt(quote.amountAtomic))} but the ` +
            `authorization was signed for ${formatPrice(BigInt(String(auth["value"])))} — ` +
            "nothing was sent",
          skillId
        },
        { status: 409 }
      )
    }

    const { signature, ...authorization } = auth
    /*
     * The canonical x402 v2 shape, matching `packages/buyer/src/fetch-with-payment.ts`:
     * authorization and signature nested under `payload`, with the requirements echoed back
     * as `accepted`. Circle's own CLI is the interop bar for this envelope.
     */
    const payload = {
      x402Version: 2,
      payload: { authorization, signature },
      // Echoed, not rebuilt. See `Quote.requirements` for what a rebuilt one costs.
      accepted: quote.requirements
    }

    const hubUrl = process.env["ARCADE_HUB"] ?? "http://localhost:8787"
    const res = await fetch(`${hubUrl}${quote.resource}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // v2 name, with the v1 alias alongside — the hub accepts either and a client that
        // sends both cannot be the reason a settlement fails.
        "payment-signature": btoa(JSON.stringify(payload)),
        "x-payment": btoa(JSON.stringify(payload))
      },
      body: JSON.stringify(body.input ?? {})
    })

    const text = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { raw: text }
    }

    if (!res.ok && res.status !== 202) {
      // A 402 here means the payment was not accepted, which is a different outcome from a
      // job that ran and refused. Collapsing them would be the "one signal for two states"
      // bug this repo keeps finding, so the status travels — AND so does a readable reason.
      // The first version returned only `{status, body}`, so the card rendered "the endpoint
      // returned HTTP 502" while the hub's actual explanation sat one level down, unread.
      const b = parsed as Record<string, unknown>
      const reason =
        typeof b["error"] === "string"
          ? `${b["error"]}${typeof b["detail"] === "string" ? `: ${b["detail"]}` : ""}`
          : typeof b["message"] === "string"
            ? (b["message"] as string)
            : JSON.stringify(parsed).slice(0, 300)
      console.error(`[settle] ${skillId} → HTTP ${res.status}: ${JSON.stringify(parsed).slice(0, 500)}`)
      return Response.json(
        { error: "not_accepted", detail: `the endpoint answered HTTP ${res.status} — ${reason}`, status: res.status, body: parsed },
        { status: 502 }
      )
    }

    /*
     * Accepted, and now asynchronous. The poll lives HERE for the same reason the paid POST
     * does — `poll_url` is on the hub and the browser cannot reach it — and it means the
     * client makes one request and gets an outcome.
     *
     * Bounded at 90s. Skills may legitimately run to seven minutes (`packages/buyer` waits
     * that long), and a request held open that long is a different design: the honest shape
     * for slow skills is to return the job id and let the page poll through this origin.
     * `usdc-flow-check` settles in about 2.5s, so the bound is far above what the listed
     * catalogue needs — but it IS a bound, and a skill that outruns it gets told so rather
     * than being reported as failed.
     */
    const accepted = parsed as { job_id?: string; poll_url?: string }
    if (res.status !== 202 || accepted.poll_url === undefined) {
      return Response.json({ status: res.status, body: parsed })
    }

    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000))
      const p = await fetch(accepted.poll_url)
      const pBody = (await p.json().catch(() => ({}))) as { status?: string }
      if (p.status !== 202 && pBody.status !== "pending") {
        return Response.json({ status: 200, body: pBody })
      }
    }

    return Response.json(
      {
        error: "still_running",
        detail:
          "the job is still running after 90 seconds — it was paid for and may yet settle; " +
          "the settlement feed on the hub is the record",
        jobId: accepted.job_id ?? null
      },
      { status: 504 }
    )
  } catch (e) {
    return Response.json(
      { error: "settle_failed", detail: String((e as Error)?.message ?? e), skillId },
      { status: 502 }
    )
  }
}

export const Route = createFileRoute("/api/settle")({
  server: { handlers: { POST: handler } }
})
