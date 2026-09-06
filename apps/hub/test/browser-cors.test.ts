import { describe, expect, it, vi } from "vitest"
import { makeBrowserCors } from "../src/browser-cors.ts"

const WEB = "https://web.example", HUB = "https://hub.example", SELLER = `0x${"a".repeat(40)}`
const POST = `/x/${SELLER}/demo`, RESULT = `/jobs/job_${"a".repeat(16)}/result`
const request = (path = POST, method = "POST", headers: Record<string, string> = {}) => new Request(HUB + path,
  { method, headers: { origin: WEB, ...(method === "POST" ? { "content-type": "application/json" } : {}), ...headers } })
describe("closed ordinary browser CORS policy", () => {
  it("captures exact canonical origins without importing configuration", () => {
    for (const origin of [WEB, "http://127.0.0.1:1234", "http://[::1]:1234"]) {
      expect(makeBrowserCors(origin, HUB).publicOrigin).toBe(HUB)
    }
    expect(makeBrowserCors(undefined, "raw legacy value").publicOrigin).toBeNull()
  })
  it.each(["", "null", "https://WEB.example", WEB + "/", WEB + ":443", WEB + "/path", WEB + "?query", "http://localhost:12",
    "http://127.1:12", "http://0.0.0.0:12", "https://user@web.example", "https://web.example#fragment", "https://a.example, https://b.example", "x".repeat(2049), null, {}])(
    "refuses malformed configured origins with fixed diagnostics: %s", bad => {
      expect(() => makeBrowserCors(bad, HUB)).toThrow("Browser transport configuration invalid")
      expect(() => makeBrowserCors(WEB, bad)).toThrow("Browser transport configuration invalid")
    })
  it("requires public origin only when armed", () => {
    expect(() => makeBrowserCors(WEB, undefined)).toThrow("Browser transport configuration invalid")
  })
  it("keeps absent Origin traffic byte-identical and does not reinterpret F headers", async () => {
    const next = vi.fn(async () => new Response("legacy", { status: 409, headers: { vary: "Accept" } }))
    const response = await makeBrowserCors(undefined, undefined).handle(new Request(HUB + "/sessions", { headers: { "x-session-token": "" } }), next)
    expect(await response.text()).toBe("legacy"); expect(response.status).toBe(409); expect(next).toHaveBeenCalledOnce()
    expect(response.headers.get("vary")).toBe("Accept"); expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })
  it.each(["", "null", "https://foreign.example", WEB + "/"])("refuses present invalid Origin before handler: %s", async origin => {
    const next = vi.fn(), response = await makeBrowserCors(WEB, HUB).handle(request(POST, "POST", { origin }), next)
    expect(response.status).toBe(403); expect(next).not.toHaveBeenCalled(); expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })
  it.each(["/sessions", "/healthz", "/x/alias/demo", `/x/${SELLER}/a`, `/x/${SELLER}/${"a".repeat(65)}`, "/jobs/job_short/result", RESULT + "?token=secret",
    `/x/0x${"0".repeat(40)}/demo`, `/x/${SELLER}/demo%2Fextra`])("refuses unsupported browser route %s", async path => {
    const next = vi.fn(), r = await makeBrowserCors(WEB, HUB).handle(request(path), next)
    expect(r.status).toBe(403); expect(next).not.toHaveBeenCalled()
  })
  it.each(["x-session-token", "x-arcade-session", "x-arcade-hire-capability", "authorization", "cookie", "proxy-authorization", "x-job-token"])(
    "refuses present-empty forbidden POST header %s", async name => {
      const next = vi.fn(), response = await makeBrowserCors(WEB, HUB).handle(request(POST, "POST", { [name]: "" }), next)
      expect(response.status).toBe(403); expect(next).not.toHaveBeenCalled()
    })
  it("refuses unequal payment headers and non-JSON POST", async () => {
    const cors = makeBrowserCors(WEB, HUB), next = vi.fn()
    for (const headers of [{ "payment-signature": "a", "x-payment": "b" }, { "content-type": "text/plain" }, { "payment-signature": "x".repeat(16385) }]) {
      expect((await cors.handle(request(POST, "POST", headers), next)).status).toBe(403)
    }
    expect(next).not.toHaveBeenCalled()
  })
  it.each(["x-session-token", "X-Job-Token", "content-type,,x-payment", "content-type,content-type", "authorization", "x-custom", "x".repeat(1025)])(
    "rejects unauthorized/ambiguous/oversized preflight headers %s", async names => {
      const next = vi.fn(), response = await makeBrowserCors(WEB, HUB).handle(request(POST, "OPTIONS", {
        "access-control-request-method": "POST", "access-control-request-headers": names }), next)
      expect(response.status).toBe(403); expect(next).not.toHaveBeenCalled()
    })
  it("accepts case-insensitive allowed requested names but refuses private-network permission", async () => {
    const cors = makeBrowserCors(WEB, HUB), next = vi.fn()
    const headers = { "access-control-request-method": "POST", "access-control-request-headers": "Content-Type, Payment-Signature, X-Payment" }
    const r = await cors.handle(request(POST, "OPTIONS", headers), next)
    expect(r.status).toBe(204); expect(await r.text()).toBe("")
    expect(r.headers.get("access-control-allow-headers")).toBe("accept, content-type, payment-signature, x-payment")
    expect(r.headers.get("vary")).toBe("Origin, Access-Control-Request-Method, Access-Control-Request-Headers")
    expect((await cors.handle(request(POST, "OPTIONS", { ...headers, "access-control-request-private-network": "true" }), next)).status).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
  it.each([200, 202, 400, 402, 404, 429, 503])("decorates status %s preserving exact body and Vary", async status => {
    const bytes = new Uint8Array([0, 1, 195, 169, 255]), response = new Response(bytes, { status, headers: { vary: "Accept, accept-encoding" } })
    const r = await makeBrowserCors(WEB, HUB).handle(request(RESULT, "GET", { "x-job-token": "a".repeat(32),
      "sec-fetch-mode": "cors", "sec-fetch-site": "cross-site", "accept-encoding": "gzip", "user-agent": "Browser", "x-forwarded-proto": "https" }), async () => response)
    expect(r.status).toBe(status); expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes)
    expect(r.headers.get("vary")).toBe("Accept, accept-encoding, Origin")
    expect(r.headers.get("cache-control")).toBe("private, no-store")
    expect(r.headers.get("access-control-allow-origin")).toBe(WEB)
    for (const name of ["access-control-allow-credentials", "access-control-allow-private-network", "set-cookie", "location"]) expect(r.headers.has(name)).toBe(false)
  })
  it("contains unexpected handler errors without exposing raw diagnostics", async () => {
    const r = await makeBrowserCors(WEB, HUB).handle(request(), async () => { throw Error("PRIVATE_PAYMENT_DATA") })
    expect(r.status).toBe(503); expect(await r.json()).toEqual({ error: "ordinary_unavailable" })
    expect(r.headers.get("access-control-allow-origin")).toBe(WEB)
  })
})
