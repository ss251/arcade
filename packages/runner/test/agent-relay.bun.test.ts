import { afterEach, describe, expect, it } from "bun:test"
import { createServer } from "node:http"
import { gzipSync } from "node:zlib"
import { openAgentRelay } from "../src/engines/agent-relay.ts"

const SECRET = "dummy-upstream-agent-secret"
const MODEL = "glm-5.3-flash"
const servers: Array<ReturnType<typeof Bun.serve>> = []
const relays: Array<Awaited<ReturnType<typeof openAgentRelay>>> = []
afterEach(async () => {
  await Promise.all(relays.splice(0).map(relay => relay.close()))
  await Promise.all(servers.splice(0).map(server => server.stop(true)))
})
const upstream = (fetch: (req: Request) => Response | Promise<Response>) => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch })
  servers.push(server)
  return server
}
const open = async (baseUrl: string, overrides: Partial<Parameters<typeof openAgentRelay>[0]> = {}) => {
  const relay = await openAgentRelay({ baseUrl, apiKey: SECRET, model: MODEL,
    allowedTools: ["StructuredOutput"], signal: new AbortController().signal, timeoutMs: 2_000, requestLimit: 8, ...overrides })
  relays.push(relay)
  return relay
}
const body = { model: MODEL, messages: [{ role: "user", content: "fixture" }],
  tools: [{ name: "StructuredOutput", input_schema: { type: "object" } }], stream: false }
const post = (relay: Awaited<ReturnType<typeof openAgentRelay>>, patch: Record<string, unknown> = {}, path = "/v1/messages?beta=true") =>
  fetch(`${relay.baseUrl}${path}`, { method: "POST", headers: { "x-api-key": relay.capability, "content-type": "application/json" }, body: JSON.stringify({ ...body, ...patch }) })

describe("job-local Agent SDK relay (simulated upstream only)", () => {
  it("binds one exact model/path/prefix and replaces native credentials and headers", async () => {
    const requests: Request[] = []
    const server = upstream(async req => { requests.push(req); expect(await req.json()).toEqual(body); return Response.json({ ok: true }) })
    const relay = await open(`${server.url.origin}/provider/`)
    expect(relay.capability).not.toBe(SECRET)
    expect(relay.capability).toMatch(/^[0-9a-f]{64}$/)
    const response = await fetch(`${relay.baseUrl}/v1/messages?beta=true`, { method: "POST",
      headers: { "x-api-key": relay.capability, authorization: "Bearer native-untrusted", "x-private": "native-untrusted", "anthropic-custom": "native-untrusted" }, body: JSON.stringify(body) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0]!.url).pathname).toBe("/provider/v1/messages")
    expect(requests[0]!.headers.get("x-api-key")).toBe(SECRET)
    expect(requests[0]!.headers.get("authorization")).toBeNull()
    expect(requests[0]!.headers.get("x-private")).toBeNull()
    expect(requests[0]!.headers.get("anthropic-custom")).toBeNull()
    expect(requests[0]!.headers.get("anthropic-version")).toBe("2023-06-01")
  })

  it.each(["http://example.com", "https://user:pass@example.com", "https://example.com/?token=x", "https://example.com/#x", "ftp://example.com", "https://example.com/a/../b", "https://example.com/%2fadmin"])(
    "refuses unsafe base %s before opening a listener or sending", async baseUrl => {
      await expect(open(baseUrl)).rejects.toThrow("agent relay configuration refused")
    })

  it("refuses absent/ambiguous credentials and invalid finite limits", async () => {
    const server = upstream(() => Response.json({ ok: true }))
    for (const patch of [{ apiKey: undefined }, { authToken: "other-dummy" }, { timeoutMs: 0 }, { timeoutMs: Infinity }, { requestLimit: 0 }, { requestLimit: 257 }]) {
      await expect(open(server.url.origin, patch)).rejects.toThrow("agent relay configuration refused")
    }
  })

  it("answers only the harmless anonymous warmup locally and denies unknown target/tool/capability", async () => {
    let hits = 0
    const server = upstream(() => { hits++; return Response.json({ ok: true }) })
    const relay = await open(server.url.origin)
    expect((await fetch(`${relay.baseUrl}/api/hello`, { method: "HEAD" })).status).toBe(204)
    expect((await fetch(`${relay.baseUrl}/v1/messages`, { method: "POST", body: JSON.stringify(body) })).status).toBe(400)
    expect((await post(relay, { model: "other-model" })).status).toBe(400)
    expect((await post(relay, { tools: [{ name: "Bash" }] })).status).toBe(400)
    expect((await post(relay, {}, "/elsewhere")).status).toBe(400)
    expect((await post(relay, {}, "/v1/messages?token=x")).status).toBe(400)
    expect(hits).toBe(0)
  })

  it("forwards count_tokens but neither redirects nor retries a failed upstream", async () => {
    let hits = 0, foreignHits = 0
    const foreign = upstream(() => { foreignHits++; return Response.json({ ok: true }) })
    const server = upstream(() => { hits++; return new Response(SECRET, { status: 302, headers: { location: `${foreign.url.origin}/v1/messages`, "x-private": SECRET } }) })
    const relay = await open(server.url.origin)
    const response = await post(relay, {}, "/v1/messages/count_tokens")
    expect(response.status).toBe(400)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-private")).toBeNull()
    expect(await response.text()).not.toContain(SECRET)
    expect((await post(relay)).status).toBe(400)
    expect(hits).toBe(1)
    expect(foreignHits).toBe(0)
  })

  it("latches a 500 as fixed native400 so repeated native attempts cannot repeat upstream spend", async () => {
    let hits = 0
    const server = upstream(() => { hits++; return new Response(SECRET, { status: 500 }) })
    const relay = await open(server.url.origin)
    for (let i = 0; i < 3; i++) {
      const response = await post(relay)
      expect(response.status).toBe(400)
      expect(await response.text()).toBe('{"type":"error","error":{"type":"invalid_request_error","message":"agent relay request refused"}}')
    }
    expect(hits).toBe(1)
  })

  it("requests identity encoding and refuses a compressed upstream before forwarding bytes", async () => {
    const encodings: Array<string | null> = []
    const compressed = gzipSync('{"private":"compressed-fixture-body"}')
    const server = upstream(req => {
      encodings.push(req.headers.get("accept-encoding"))
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(compressed); controller.close() } }),
        { headers: { "content-type": "application/json", "content-encoding": "gzip" } })
    })
    const relay = await open(server.url.origin)
    const response = await post(relay)
    expect(encodings).toEqual(["identity"])
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("compressed-fixture-body")
    expect((await post(relay)).status).toBe(400)
    expect(encodings).toHaveLength(1)
  })

  it("bounds chunked request bytes before any upstream request", async () => {
    let hits = 0
    const server = upstream(() => { hits++; return Response.json({ ok: true }) })
    const relay = await open(server.url.origin)
    const payload = JSON.stringify({ ...body, extra: "x".repeat(1_048_576) })
    const response = await fetch(`${relay.baseUrl}/v1/messages`, { method: "POST", headers: { "x-api-key": relay.capability },
      body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(payload.slice(0, 500_000))); controller.enqueue(new TextEncoder().encode(payload.slice(500_000))); controller.close() } }) })
    expect(response.status).toBe(400)
    expect(hits).toBe(0)
  })

  it("preserves successful SSE bytes and never exposes an echoed upstream secret across chunks", async () => {
    let leak = false
    const server = upstream(() => new Response(new ReadableStream({ start(controller) {
      for (const part of leak ? ["data: ", SECRET.slice(0, 8), SECRET.slice(8), "\n\n"] : ["event: message_stop\n", 'data: {"type":"message_stop"}\n\n']) controller.enqueue(new TextEncoder().encode(part))
      controller.close()
    } }), { headers: { "content-type": "text/event-stream" } }))
    const relay = await open(server.url.origin)
    expect(await (await post(relay, { stream: true })).text()).toBe('event: message_stop\ndata: {"type":"message_stop"}\n\n')
    leak = true
    let native = ""
    try { native = await (await post(relay, { stream: true })).text() } catch { /* fail-closed stream */ }
    expect(native).not.toContain(SECRET)
    expect(native).not.toContain(SECRET.slice(8))
  })

  it("bounds streamed response bytes even without a Content-Length", async () => {
    const server = upstream(() => new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < 5; i++) controller.enqueue(new Uint8Array(1_048_576).fill(120))
      controller.close()
    } }), { headers: { "content-type": "text/event-stream" } }))
    const relay = await open(server.url.origin)
    // Before headers are committed Bun may return the fixed400; after streaming
    // starts the connection must fail. Neither may become a successful partial body.
    let response: Response | undefined, text: string | undefined
    try { response = await post(relay, { stream: true }); text = await response.text() } catch { /* aborted stream */ }
    if (text !== undefined) {
      expect(response!.status).toBe(400)
      expect(text).toContain("agent relay request refused")
      expect(text.length).toBeLessThan(256)
    }
    expect((await post(relay)).status).toBe(400)
  })

  it("never forwards a valid-looking JSON prefix from a truncated upstream response", async () => {
    let hits = 0
    const server = createServer((_request, response) => {
      hits++
      response.writeHead(200, { "content-type": "application/json", "content-length": "100" })
      response.flushHeaders()
      response.write('{"ok":true}')
      setTimeout(() => response.destroy(), 10)
    })
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
    try {
      const address = server.address()
      if (address === null || typeof address === "string") throw Error("fixture listener failed")
      const relay = await open(`http://127.0.0.1:${address.port}`)
      const response = await post(relay)
      expect(response.status).toBe(400)
      expect(await response.text()).not.toContain('"ok":true')
      expect((await post(relay)).status).toBe(400)
      expect(hits).toBe(1)
    } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) }
  })

  it("permits at most four active bounded upstream responses", async () => {
    let hits = 0, release: (() => void) | undefined, allStarted: (() => void) | undefined
    const started = new Promise<void>(done => { allStarted = done })
    const gate = new Promise<void>(done => { release = done })
    const server = upstream(async () => { if (++hits === 4) allStarted?.(); await gate; return Response.json({ ok: true }) })
    const relay = await open(server.url.origin)
    const active = Array.from({ length: 4 }, () => post(relay))
    const results = Promise.allSettled(active)
    try {
      await started
      const extra = await post(relay)
      expect(extra.status).toBe(400)
      release?.()
      expect(hits).toBe(4)
      for (const result of await results) {
        expect(result.status).toBe("fulfilled")
        if (result.status === "fulfilled") expect(result.value.status).toBe(200)
      }
    } finally { release?.(); await results }
  })

  it("uses a bearer credential only upstream and counts the finite request allowance", async () => {
    let hits = 0
    const server = upstream(req => {
      hits++
      expect(req.headers.get("authorization")).toBe(`Bearer ${SECRET}`)
      expect(req.headers.get("x-api-key")).toBeNull()
      return Response.json({ input_tokens: 1 })
    })
    const relay = await open(server.url.origin, { apiKey: undefined, authToken: SECRET, requestLimit: 1 })
    expect((await post(relay, {}, "/v1/messages/count_tokens")).status).toBe(200)
    expect((await post(relay)).status).toBe(400)
    expect(hits).toBe(1)
  })

  it("refuses an already-canceled job without creating a relay", async () => {
    const controller = new AbortController(); controller.abort()
    await expect(open("http://127.0.0.1:1", { signal: controller.signal })).rejects.toThrow("agent relay request refused")
  })

  it("aborts midstream, closes idempotently, and leaves no listener", async () => {
    const controller = new AbortController()
    const server = upstream(() => new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode("x".repeat(100))) } }), { headers: { "content-type": "text/event-stream" } }))
    const relay = await open(server.url.origin, { signal: controller.signal })
    const read = post(relay, { stream: true }).then(response => response.text())
    void read.catch(() => {})
    await new Promise<void>(done => setTimeout(done, 20))
    controller.abort()
    await expect(read).rejects.toThrow()
    await Promise.all([relay.close(), relay.close()])
    await expect(post(relay)).rejects.toThrow()
  })

  it("bounds a permanently pending upstream and prevents post-timeout sends", async () => {
    let hits = 0
    let release: (() => void) | undefined
    const pending = new Promise<Response>(resolve => { release = () => resolve(Response.json({ fixtureCleanup: true })) })
    const server = upstream(() => { hits++; return pending })
    const relay = await open(server.url.origin, { timeoutMs: 100 })
    try {
      try { await post(relay) } catch { /* closing the owned listener is also fail-closed */ }
      await relay.close()
      await expect(post(relay)).rejects.toThrow()
      expect(hits).toBe(1)
    } finally {
      // It stays pending through every timeout/no-further-send assertion. Only
      // then release the owned handler so afterEach can finish server.stop(true).
      release?.()
      await relay.close()
    }
  }, 2_000)
})
