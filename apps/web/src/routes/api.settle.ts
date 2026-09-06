import { createFileRoute } from "@tanstack/react-router"

/** Retired: signed authorizations travel directly from the private browser run to
 * its captured hub origin. This endpoint must never inspect or forward a body.
 * A 410 here says nothing about whether an existing signature remains usable.
 */
export const handleSettle = async (_input: { request: Request }): Promise<Response> =>
  Response.json({ error: "settlement_courier_retired",
    detail: "This route cannot submit payments. Use a fresh browser confirmation. Do not resend an existing authorization."
  }, { status: 410 })

export const Route = createFileRoute("/api/settle")({
  server: { handlers: { POST: handleSettle } }
})
