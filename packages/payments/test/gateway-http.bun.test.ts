import { afterEach, describe, expect, it } from "bun:test"
import { createServer, type RequestListener, type Server } from "node:http"
import { gatewayJson } from "../src/gateway-http.ts"

const servers: Server[] = []
const nativeServers: Array<Bun.Server<undefined>> = []
const within = async <T>(work: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("owned transport fixture deadline")), ms)
  })]) } finally { if (timer !== undefined) clearTimeout(timer) }
}
const drained = async (server: Bun.Server<undefined>): Promise<void> => {
  const deadline = Date.now() + 1_000
  while (server.pendingRequests !== 0) {
    if (Date.now() >= deadline) throw new Error("owned request did not drain after cancellation")
    await Bun.sleep(5)
  }
}
const listen = async (handler: RequestListener): Promise<string> => {
  const server = createServer(handler); servers.push(server)
  await within(new Promise<void>((resolve, reject) => {
    server.once("error", reject); server.listen(0, "127.0.0.1", resolve)
  }), 1_000)
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("owned listener missing")
  return "http://127.0.0.1:" + address.port
}
afterEach(async () => {
  for (const server of nativeServers.splice(0)) await within(server.stop(true), 1_000)
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    if (server.listening) await within(new Promise<void>(resolve => server.close(() => resolve())), 1_000)
  }
})
const request = (base: string, signal = new AbortController().signal) =>
  gatewayJson(base, "/v1/x402/verify", { paymentPayload: {}, paymentRequirements: {} }, undefined, signal)

describe("owned Gateway HTTP transport; no external endpoints or spending", () => {
  it("sends the exact POST to its owned origin and reads chunked JSON", async () => {
    let seen = ""
    const base = await listen((req, res) => {
      req.setEncoding("utf8"); req.on("data", part => { seen += part })
      req.on("end", () => { res.writeHead(200, { "content-type": "application/json" }); res.write('{"isValid":'); res.end("true}") })
    })
    expect(await request(base)).toEqual({ isValid: true })
    expect(JSON.parse(seen)).toEqual({ paymentPayload: {}, paymentRequirements: {} })
  })

  it("does not follow a redirect or deliver its bearer/body to another owned origin", async () => {
    let foreign = 0, original = 0
    const other = await listen((_req, res) => { foreign++; res.end("{}") })
    const base = await listen((_req, res) => { original++; res.writeHead(307, { location: other + "/stolen" }); res.end() })
    await expect(gatewayJson(base, "/v1/x402/settle", { private: "DUMMY_SIGNATURE" }, "DUMMY_BEARER",
      new AbortController().signal)).rejects.toThrow("Gateway request unavailable")
    expect(original).toBe(1); expect(foreign).toBe(0)
  })

  it("aborts a stalled body and observes native server cancellation with no pending request", async () => {
    let arrived!: () => void, closed!: () => void, requests = 0
    const received = new Promise<void>(resolve => { arrived = resolve })
    const disconnected = new Promise<void>(resolve => { closed = resolve })
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      requests++; req.signal.addEventListener("abort", closed, { once: true }); arrived()
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("{")) } }),
        { headers: { "content-type": "application/json" } })
    } })
    nativeServers.push(server)
    const controller = new AbortController()
    const result = request(server.url.origin, controller.signal)
    await within(received, 1_000); controller.abort()
    await expect(result).rejects.toThrow("Gateway request unavailable")
    await within(disconnected, 1_000)
    await drained(server)
    expect(requests).toBe(1)
    expect(server.pendingRequests).toBe(0)
  })

  it("applies the real 15-second total deadline to stalled headers without retry", async () => {
    let requests = 0, closed!: () => void
    const disconnected = new Promise<void>(resolve => { closed = resolve })
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      requests++
      return new Promise<Response>(resolve => req.signal.addEventListener("abort", () => {
        closed(); resolve(new Response(null, { status: 499 }))
      }, { once: true }))
    } })
    nativeServers.push(server)
    const started = Date.now()
    await expect(request(server.url.origin)).rejects.toThrow("Gateway request unavailable")
    await within(disconnected, 1_000)
    await drained(server)
    expect(Date.now() - started).toBeGreaterThanOrEqual(14_900)
    expect(Date.now() - started).toBeLessThan(16_500)
    expect(requests).toBe(1)
    expect(server.pendingRequests).toBe(0)
  }, 18_000)

  it("rejects declared and streamed overflow plus invalid UTF-8 without diagnostic reflection", async () => {
    for (const mode of ["declared", "streamed", "utf8", "diagnostic"]) {
      const base = await listen((_req, res) => {
        res.writeHead(mode === "diagnostic" ? 500 : 200, { "content-type": "application/json",
          ...(mode === "declared" ? { "content-length": "65537" } : {}) })
        if (mode === "declared") res.end("x")
        else if (mode === "streamed") { res.write(" ".repeat(32_768)); res.end(" ".repeat(32_769)) }
        else if (mode === "utf8") res.end(Buffer.from([0xc3, 0x28]))
        else res.end("PRIVATE_DIAGNOSTIC_SIGNATURE")
      })
      await expect(request(base)).rejects.toThrow("Gateway request unavailable")
    }
  })

  it("does not dispatch an already-aborted request or an oversized body", async () => {
    let requests = 0
    const base = await listen((_req, res) => { requests++; res.end("{}") })
    const controller = new AbortController(); controller.abort()
    await expect(request(base, controller.signal)).rejects.toThrow("Gateway request unavailable")
    await expect(gatewayJson(base, "/v1/x402/verify", { padding: "x".repeat(16_385) }, undefined,
      new AbortController().signal)).rejects.toThrow("Gateway request unavailable")
    expect(requests).toBe(0)
  })
})
