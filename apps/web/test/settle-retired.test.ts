import { afterEach, describe, expect, it, vi } from "vitest"
import { handleSettle } from "../src/routes/api.settle.ts"
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe("retired web settlement courier", () => {
  it("returns a fixed 410 without reading a body, quote, capability, or signature", async () => {
    const f = vi.fn(() => { throw Error("PRIVATE_FETCH") }), read = vi.fn(() => { throw Error("PRIVATE_BODY") })
    vi.stubGlobal("fetch", f)
    const request = new Request("https://web.example/api/settle", { method: "POST" })
    Object.defineProperty(request, "json", { get: read })
    const response = await handleSettle({ request })
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: "settlement_courier_retired",
      detail: "This route cannot submit payments. Use a fresh browser confirmation. Do not resend an existing authorization." })
    expect(f).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled()
    expect(request.bodyUsed).toBe(false)
  })
  it("does not inspect even a hostile request property or forward signed bodies", async () => {
    const f = vi.fn(), read = vi.fn(() => { throw Error("PRIVATE_REQUEST") })
    vi.stubGlobal("fetch", f)
    const value = Object.defineProperty({}, "request", { get: read }) as { request: Request }
    expect((await handleSettle(value)).status).toBe(410)
    expect(f).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled()
  })
})
