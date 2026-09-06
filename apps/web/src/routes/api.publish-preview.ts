import { createFileRoute } from "@tanstack/react-router"
import { handlePublishRequest } from "../lib/publish-route.server.ts"

export const Route = createFileRoute("/api/publish-preview")({
  server: { handlers: { POST: ({ request }) => handlePublishRequest(request) } }
})
