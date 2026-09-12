import { describe, expect, it } from "bun:test"
import { makeBrowserCors } from "../src/browser-cors.ts"

/**
 * The poll link a paying buyer receives must be on the configured public host whether or
 * not a browser origin is configured. Before this, the two were coupled: a hub with
 * ARCADE_PUBLIC_URL set and ARCADE_WEB_ORIGIN unset handed out its raw request origin,
 * which behind a TLS-terminating proxy is not the https host the buyer called. The buyer
 * SDK refused that link as foreign, and a settled one-cent job on production was paid for
 * and never collected.
 */
describe("public origin is independent of the web origin", () => {
  it("derives the poll-link origin from the public URL with no web origin configured", () => {
    expect(makeBrowserCors(undefined, "https://hub.example").publicOrigin).toBe("https://hub.example")
  })
  it("keeps browser CORS closed while the web origin is unset", async () => {
    const cors = makeBrowserCors(undefined, "https://hub.example")
    const res = await cors.handle(
      new Request("https://hub.example/jobs/job_aaaaaaaaaaaaaaaa/result", { headers: { origin: "https://evil.example" } }),
      async () => new Response("open"))
    expect(res.status).toBe(403)
  })
  it("is null when no public URL is configured, so a local hub falls back to the request origin", () => {
    expect(makeBrowserCors(undefined, undefined).publicOrigin).toBeNull()
  })
  it("still refuses a malformed public URL", () => {
    expect(() => makeBrowserCors(undefined, "not a url")).toThrow()
  })
})
