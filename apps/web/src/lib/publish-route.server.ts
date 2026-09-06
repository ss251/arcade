import { previewLocal } from "./publish-runtime.ts"
import { capturePublishTarget, localPublishRequestAllowed } from "./publish-policy.ts"
import { publishJsonLength, readPublishBytes } from "./publish-http.ts"

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "vary": "Origin" }
const failure = (error: "preview_disabled" | "invalid_preview_request" | "preview_failed", status: number) =>
  Response.json({ error }, { status, headers })

/** Only this fixed local endpoint can invoke the preview. Refuse authority before
 * acquiring a reader, and never hand raw errors or private output to Start RPC. */
export const handlePublishRequest = async (request: Request, run: typeof previewLocal = previewLocal,
  env: Record<string, string | undefined> = process.env): Promise<Response> => {
  if (!localPublishRequestAllowed(request, env)) return failure("preview_disabled", 403)
  let target: string
  try {
    const length = publishJsonLength(request.headers, 4096)
    const bytes = await readPublishBytes(request.body, request.signal, 4096, 3000)
    if (request.signal.aborted || (length !== null && length !== bytes.byteLength)) throw 0
    target = capturePublishTarget(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))).target
  } catch { return failure("invalid_preview_request", 400) }
  try {
    if (request.signal.aborted) throw 0
    const preview = await run({ target }, request, env)
    if (request.signal.aborted) throw 0
    return Response.json(preview.kind === "directory" ? preview.entries[0] : preview, { headers })
  } catch { return failure("preview_failed", 502) }
}
