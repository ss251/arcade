import { describe, expect, it, vi } from "vitest"
import { createUnifiedGatewayBoundary, withOwnedUnifiedGatewayFetch } from "../src/unified-balance-network.ts"

const endpoint = "https://gateway-api-testnet.circle.com/v1/"
const fixture = () => {
  const request = vi.fn(async (_url: string, _init: RequestInit) => new Response('{"ok":true}', { headers: { "content-type": "application/json" } }))
  const beforeTransfer = vi.fn(async (_body: string) => {})
  const controller = new AbortController()
  const boundary = createUnifiedGatewayBoundary({ request, beforeTransfer, signal: controller.signal, deadlineMs: performance.now() + 10000 })
  return { request, beforeTransfer, controller, boundary }
}
describe("owned Unified Balance Gateway network boundary", () => {
  it("pins anonymous testnet endpoints and buffers a bounded body before returning", async () => {
    const f = fixture()
    try {
      expect(await (await f.boundary.fetch(endpoint + "info", { method: "GET" })).json()).toEqual({ ok: true })
      const [, init] = f.request.mock.calls[0]!
      expect(init).toMatchObject({ redirect: "error", credentials: "omit", method: "GET" })
      expect(init.headers).toEqual({ "content-type": "application/json", accept: "application/json", "accept-encoding": "identity" })
      expect(f.beforeTransfer).not.toHaveBeenCalled()
    } finally { f.boundary.close() }
  })
  it.each([
    ["https://gateway-api.circle.com/v1/info", "GET"], [endpoint + "info?x=1", "GET"],
    [endpoint + "estimate?enableForwarder=true", "POST"], [endpoint + "transfer/x", "GET"],
    [endpoint + "info", "POST"], [endpoint + "transfer", "GET"], ["http://127.0.0.1/v1/info", "GET"]
  ])("refuses unapproved target/method %s %s before dispatch", async (url, method) => {
    const f = fixture()
    try {
      await expect(f.boundary.fetch(url!, { method, ...(method === "POST" ? { body: "{}" } : {}) })).rejects.toThrow("unified_network_refused")
      expect(f.request).not.toHaveBeenCalled()
    } finally { f.boundary.close() }
  })
  it("claims a transfer before its asynchronous binding and never dispatches a second", async () => {
    const f = fixture(); let release!: () => void
    f.beforeTransfer.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve }) })
    const first = f.boundary.fetch(endpoint + "transfer", { method: "POST", body: "[]" })
    try {
      await expect(f.boundary.fetch(endpoint + "transfer", { method: "POST", body: "[]" })).rejects.toThrow("unified_network_refused")
      expect(f.request).not.toHaveBeenCalled()
      release(); await first
      expect(f.beforeTransfer).toHaveBeenCalledTimes(1); expect(f.request).toHaveBeenCalledTimes(1)
      await expect(f.boundary.fetch(endpoint + "transfer", { method: "POST", body: "[]" })).rejects.toThrow()
    } finally { release?.(); await first.catch(() => {}); f.boundary.close() }
  })
  it("a refused or failed transfer stays consumed without reflecting raw errors", async () => {
    const f = fixture(); f.beforeTransfer.mockRejectedValue(Error("PRIVATE_BURN"))
    try {
      await expect(f.boundary.fetch(endpoint + "transfer", { method: "POST", body: "[]" })).rejects.toThrow("unified_network_refused")
      f.beforeTransfer.mockResolvedValue()
      await expect(f.boundary.fetch(endpoint + "transfer", { method: "POST", body: "[]" })).rejects.toThrow("unified_network_refused")
      expect(f.request).not.toHaveBeenCalled(); expect(f.beforeTransfer).toHaveBeenCalledTimes(1)
    } finally { f.boundary.close() }
  })
  it("never retries a failed underlying dispatch", async () => {
    const f = fixture(); f.request.mockRejectedValue(Error("PRIVATE_RESPONSE"))
    try {
      await expect(f.boundary.fetch(endpoint + "transfer", { method: "POST", body: "[]" })).rejects.toThrow("unified_network_refused")
      expect(f.request).toHaveBeenCalledTimes(1)
    } finally { f.boundary.close() }
  })
  it("closes before a late transfer check can authorize dispatch", async () => {
    const f = fixture(); let release!: () => void
    f.beforeTransfer.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve }) })
    const request = f.boundary.fetch(endpoint + "transfer", { method: "POST", body: "[]" })
    f.boundary.close(); release()
    await expect(request).rejects.toThrow("unified_network_refused")
    expect(f.request).not.toHaveBeenCalled()
  })
  it.each([302, 500])("refuses HTTP %s without retaining its body/error", async status => {
    const f = fixture(); f.request.mockResolvedValue(new Response("PRIVATE_BODY", { status, headers: { location: "https://example.invalid/" } }))
    try { await expect(f.boundary.fetch(endpoint + "info", { method: "GET" })).rejects.toThrow("unified_network_refused") }
    finally { f.boundary.close() }
  })
  it("bounds outgoing JSON and never coerces streamed bodies", async () => {
    const f = fixture()
    try {
      for (const body of ["x".repeat(16385), new Blob(["{}"]), new ReadableStream()]) {
        await expect(f.boundary.fetch(endpoint + "estimate", { method: "POST", body })).rejects.toThrow()
      }
      expect(f.request).not.toHaveBeenCalled()
    } finally { f.boundary.close() }
  })
  it("bounds incoming bytes and refuses non-JSON/compressed responses", async () => {
    const f = fixture()
    try {
      for (const response of [new Response("x".repeat(262145), { headers: { "content-type": "application/json" } }),
        new Response("html", { headers: { "content-type": "text/html" } }),
        new Response("{}", { headers: { "content-type": "application/json", "content-encoding": "gzip" } })]) {
        f.request.mockResolvedValue(response)
        await expect(f.boundary.fetch(endpoint + "info", { method: "GET" })).rejects.toThrow()
      }
    } finally { f.boundary.close() }
  })
  it("aborts a stalled body and refuses all late requests after the deadline", async () => {
    let cancelled = 0
    const request = vi.fn(async () => new Response(new ReadableStream({ cancel() { cancelled++ } }), { headers: { "content-type": "application/json" } }))
    const boundary = createUnifiedGatewayBoundary({ request, beforeTransfer: async () => {}, signal: new AbortController().signal,
      deadlineMs: performance.now() + 30 })
    try {
      await expect(boundary.fetch(endpoint + "info", { method: "GET" })).rejects.toThrow("unified_network_refused")
      await expect(boundary.fetch(endpoint + "info", { method: "GET" })).rejects.toThrow("unified_network_refused")
      expect(cancelled).toBe(1); expect(request).toHaveBeenCalledTimes(1)
    } finally { boundary.close() }
  })
  it("does not install global fetch on creation and restores an exclusive owned scope", async () => {
    const previous = globalThis.fetch, f = fixture()
    expect(globalThis.fetch).toBe(previous)
    try {
      await withOwnedUnifiedGatewayFetch(f.boundary, async () => {
        expect(globalThis.fetch).not.toBe(previous)
        await expect(withOwnedUnifiedGatewayFetch(f.boundary, async () => 1)).rejects.toThrow()
        expect(await (await fetch(endpoint + "info")).json()).toEqual({ ok: true })
      })
      expect(globalThis.fetch).toBe(previous)
      await expect(f.boundary.fetch(endpoint + "info")).rejects.toThrow()
    } finally { f.boundary.close() }
  })
})
