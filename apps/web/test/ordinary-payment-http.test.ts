import { afterEach, describe, expect, it, vi } from "vitest"
import chain from "../../../config/chains/arc-testnet.json"
import { submitOrdinaryPayment, OrdinarySubmitFailure } from "../src/lib/ordinary-payment-http.ts"

const ORIGIN = "https://hub.example", SELLER = `0x${"3".repeat(40)}`, BUYER = `0x${"1".repeat(40)}`
const ID = `job_${"a".repeat(32)}`, TOKEN = "b".repeat(32)
const resource = `/x/${SELLER}/diff-triage`, LIMIT = 131072
const context = (rail = "eip3009") => ({ hubOrigin: ORIGIN, skillId: "diff-triage", seller: SELLER, resource,
  amountAtomic: "10000", payTo: SELLER, asset: chain.usdc.address, network: chain.caip2, rail,
  requirements: { scheme: "exact", network: chain.caip2, amount: "10000", asset: chain.usdc.address,
    payTo: SELLER, resource: ORIGIN + resource, maxTimeoutSeconds: 604900, mimeType: "application/json",
    description: "résumé — 円", extra: rail === "gateway" ?
      { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway.wallet } : { name: "USDC", version: "2" } } })
// Public synthetic bytes, not a real signed payment or cryptographic-recovery claim.
const input = (rail = "eip3009") => ({ context: context(rail), inputJson: '{"diff":"é"}',
  authorization: { from: BUYER, to: SELLER, value: "10000", validAfter: rail === "gateway" ? String(Math.floor(Date.now() / 1000) - 600) : "0",
    validBefore: String(Math.floor(Date.now() / 1000) + 604900), nonce: `0x${"1".repeat(64)}`,
    signature: `0x${"0".repeat(63)}1${"0".repeat(63)}11b` } })
const accepted = () => ({ job_id: ID, job_token: TOKEN, status: "queued", price: "$0.01",
  poll_url: `https://untrusted.example/?token=${TOKEN}` })
const reply = (value: unknown = accepted(), status = 202) => Response.json(value, { status })
const refused = async (promise: Promise<unknown>, dispatched: boolean) => {
  try { await promise; throw Error("Unexpected accepted submission") }
  catch (error) {
    expect(error).toBeInstanceOf(OrdinarySubmitFailure)
    expect(error).toMatchObject({ dispatched, code: dispatched ? "submission_uncertain" : "not_dispatched" })
    expect((error as Error).message).not.toContain(TOKEN)
  }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("one-shot direct ordinary browser submission", () => {
  it.each(["eip3009", "gateway"])("echoes exact %s requirements and UTF8 in one private POST, returning only recovery coordinates", async rail => {
    const v = input(rail), clock = vi.spyOn(Date, "now").mockReturnValue(1800000000000)
    // Refresh the synthetic authorization against the fixed clock before measuring admission timestamps.
    v.authorization.validBefore = "1800604900"; v.authorization.validAfter = rail === "gateway" ? "1799999400" : "0"
    const storage = vi.fn(() => { throw Error("No storage at the HTTP boundary") })
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get: storage }))
    const fetcher = vi.fn(async () => reply())
    const row = await submitOrdinaryPayment(v, {}, fetcher)
    expect(row).toEqual({ jobId: ID, token: TOKEN, skillId: "diff-triage", priceAtomic: "10000", createdAtMs: 1800000000000,
      hubOrigin: ORIGIN, realm: "ordinary" })
    expect(Object.isFrozen(row)).toBe(true)
    expect(JSON.stringify(row)).not.toContain("poll_url")
    expect(storage).not.toHaveBeenCalled()
    expect(clock).toHaveBeenCalledTimes(2) // One pre-dispatch expiry check and one admission timestamp.
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(ORIGIN + resource)
    expect(init).toMatchObject({ method: "POST", body: v.inputJson, redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" })
    const headers = new Headers(init.headers)
    expect([...headers.keys()]).toEqual(["accept", "content-type", "payment-signature"])
    const payment = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(headers.get("payment-signature")!), ch => ch.charCodeAt(0))))
    const { signature, ...authorization } = v.authorization
    expect(payment).toEqual({ x402Version: 2, accepted: v.context.requirements, payload: { authorization, signature } })
    expect(Object.isFrozen(init)).toBe(true); expect(Object.isFrozen(init.headers)).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("captures original input, context and signed bytes before waiting", async () => {
    const v = input(), original = JSON.stringify(v), options = { timeoutMs: 500 }
    let release!: (value: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve }))
    const run = submitOrdinaryPayment(v, options, fetcher)
    v.inputJson = '{"mutated":true}'; v.context.hubOrigin = "https://evil.example"
    v.authorization.signature = TOKEN; options.timeoutMs = 1
    release(reply())
    expect((await run).hubOrigin).toBe(ORIGIN)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(ORIGIN + resource); expect(init.body).toBe(JSON.parse(original).inputJson)
    expect(new Headers(init.headers).get("payment-signature")).not.toContain(TOKEN)
  })
  it.each([
    { context: context("test") }, { context: { ...context(), hubOrigin: "https://hub.example?token=private" } },
    { context: { ...context(), resource: resource + "?token=private" } }, { extra: true },
    { inputJson: "[]" }, { inputJson: "null" }, { inputJson: "{} {}" }, { inputJson: "" }, { inputJson: {} }
  ])("refuses invalid submission before dispatch %j", async change => {
    const f = vi.fn(async () => reply())
    await refused(submitOrdinaryPayment({ ...input(), ...change }, {}, f), false)
    expect(f).not.toHaveBeenCalled()
  })
  it.each([
    { from: "0x0" }, { to: BUYER }, { value: "10001" }, { value: "010000" }, { nonce: "0x0" },
    { nonce: `0x${"0".repeat(64)}` }, { signature: "private" }, { signature: `0x${"0".repeat(130)}` },
    { validBefore: "1" }, { validAfter: String(2 ** 40) }, { validBefore: String(2 ** 40) },
    { validAfter: "-1" }, { extra: TOKEN }
  ])("refuses invalid/mismatched authorization %j without IO", async change => {
    const v = input(), f = vi.fn(async () => reply())
    await refused(submitOrdinaryPayment({ ...v, authorization: { ...v.authorization, ...change } }, {}, f), false)
    expect(f).not.toHaveBeenCalled()
  })
  it("requires Gateway's actual bounded backdate instead of validAfter zero", async () => {
    const v = input("gateway"), f = vi.fn(async () => reply())
    v.authorization.validAfter = "0"
    await refused(submitOrdinaryPayment(v, {}, f), false)
    expect(f).not.toHaveBeenCalled()
  })
  it("refuses getters and revoked arguments without invoking or reflecting them", async () => {
    const getter = vi.fn(() => { throw Error(TOKEN) }), f = vi.fn(async () => reply()), v = input()
    Object.defineProperty(v.authorization, "signature", { enumerable: true, get: getter })
    await refused(submitOrdinaryPayment(v, {}, f), false)
    const proxy = Proxy.revocable({}, {}); proxy.revoke()
    await refused(submitOrdinaryPayment(proxy.proxy, {}, f), false)
    expect(getter).not.toHaveBeenCalled(); expect(f).not.toHaveBeenCalled()
  })
  it("enforces actual UTF8 input bytes and permits the exact cap", async () => {
    const v = input(), f = vi.fn(async () => reply())
    v.inputJson = '{"x":"' + "x".repeat(LIMIT - 8) + '"}'
    expect(new TextEncoder().encode(v.inputJson).byteLength).toBe(LIMIT)
    await submitOrdinaryPayment(v, {}, f); expect(f).toHaveBeenCalledTimes(1)
    v.inputJson += " "
    await refused(submitOrdinaryPayment(v, {}, f), false); expect(f).toHaveBeenCalledTimes(1)
    v.inputJson = '{"x":"' + "é".repeat(LIMIT / 2) + '"}'
    await refused(submitOrdinaryPayment(v, {}, f), false); expect(f).toHaveBeenCalledTimes(1)
  })
  it.each([{}, { status: "pending" }, { job_id: "bad" }, { job_token: TOKEN + "\n" },
    { price: "$0.02" }, { price: "private" }, { price: 0.01 }])("refuses malformed or mismatched admission %j after exactly one dispatch", async change => {
    const f = vi.fn(async () => reply(Object.keys(change).length ? { ...accepted(), ...change } : {}))
    await refused(submitOrdinaryPayment(input(), {}, f), true); expect(f).toHaveBeenCalledTimes(1)
  })
  it.each([200, 400, 402, 429, 500, 503])("does not turn HTTP%i into a retry or acceptance", async status => {
    const f = vi.fn(async () => reply({ ...accepted(), detail: TOKEN }, status))
    await refused(submitOrdinaryPayment(input(), {}, f), true); expect(f).toHaveBeenCalledTimes(1)
  })
  it("does not require, follow or return the producer's poll_url", async () => {
    const { poll_url: ignored, ...body } = accepted()
    const f = vi.fn(async () => reply(body))
    expect((await submitOrdinaryPayment(input(), {}, f)).jobId).toBe(ID)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it.each([
    { "content-type": "text/plain" }, { "content-encoding": "gzip" }, { "content-length": "1" },
    { "content-length": "01" }, { "content-length": "999999" }
  ])("retains bounded response framing for POST %j", async headers => {
    const f = vi.fn(async () => new Response(JSON.stringify(accepted()), { status: 202, headers: { "content-type": "application/json", ...headers } }))
    await refused(submitOrdinaryPayment(input(), {}, f), true); expect(f).toHaveBeenCalledTimes(1)
  })
  it("refuses redirect, URL drift and oversized response without a second request", async () => {
    for (const response of [
      Response.redirect("https://evil.example"), new Response('"' + "x".repeat(LIMIT) + '"', { headers: { "content-type": "application/json" } }),
      Object.defineProperty(reply(), "url", { value: "https://evil.example" })
    ]) {
      const f = vi.fn(async () => response)
      await refused(submitOrdinaryPayment(input(), {}, f), true); expect(f).toHaveBeenCalledTimes(1)
    }
  })
  it("reports synchronous and asynchronous fetch failures as possibly submitted without raw text", async () => {
    for (const f of [vi.fn((): never => { throw Error(TOKEN) }), vi.fn(async (): Promise<Response> => { throw Error(TOKEN) })]) {
      await refused(submitOrdinaryPayment(input(), {}, f), true); expect(f).toHaveBeenCalledTimes(1)
    }
  })
  it("refuses pre-abort and invalid options before dispatch", async () => {
    const c = new AbortController(); c.abort(TOKEN); const f = vi.fn(async () => reply())
    await refused(submitOrdinaryPayment(input(), { signal: c.signal }, f), false)
    for (const timeoutMs of [0, 10001, Infinity, null]) await refused(submitOrdinaryPayment(input(), { timeoutMs } as never, f), false)
    expect(f).not.toHaveBeenCalled()
  })
  it("bounds stalled response headers and cancels a late body without admitting or resending", async () => {
    vi.useFakeTimers()
    let release!: (v: Response) => void
    const f = vi.fn(() => new Promise<Response>(resolve => { release = resolve })), cancel = vi.fn()
    const run = refused(submitOrdinaryPayment(input(), { timeoutMs: 20 }, f), true)
    await vi.advanceTimersByTimeAsync(20); await run
    release(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalledTimes(1); expect(f).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
  it("bounds stalled body plus uncooperative cleanup and never returns a recovery row", async () => {
    vi.useFakeTimers()
    const response = new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { status: 202, headers: { "content-type": "application/json" } })
    const f = vi.fn(async () => response), run = refused(submitOrdinaryPayment(input(), { timeoutMs: 20 }, f), true)
    await vi.advanceTimersByTimeAsync(70); await run
    expect(response.body?.locked).toBe(false); expect(f).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
  it("refuses an admission timestamp before the captured pre-dispatch wall clock", async () => {
    const v = input(), wall = Date.now(), f = vi.fn(async () => reply())
    vi.spyOn(Date, "now").mockReturnValueOnce(wall).mockReturnValue(wall - 1)
    await refused(submitOrdinaryPayment(v, {}, f), true)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it.each([NaN, -1, Infinity])("refuses invalid monotonic time %s before dispatch", async time => {
    vi.spyOn(performance, "now").mockReturnValue(time)
    const f = vi.fn(async () => reply())
    await refused(submitOrdinaryPayment(input(), {}, f), false)
    expect(f).not.toHaveBeenCalled()
  })
  it("refuses backward monotonic time before dispatch", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValue(99)
    const f = vi.fn(async () => reply())
    await refused(submitOrdinaryPayment(input(), {}, f), false)
    expect(f).not.toHaveBeenCalled()
  })
  it("does not invoke option getters or read browser state on import", async () => {
    vi.resetModules(); vi.stubEnv("ARCADE_NETWORK", "INVALID_PRIVATE_NETWORK")
    const io = vi.fn(() => { throw Error(TOKEN) })
    vi.stubGlobal("fetch", io)
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get: io }))
    const module = await import("../src/lib/ordinary-payment-http.ts")
    const options = Object.defineProperty({}, "timeoutMs", { enumerable: true, get: io })
    await expect(module.submitOrdinaryPayment(input(), options)).rejects.toMatchObject({ code: "not_dispatched" })
    expect(io).not.toHaveBeenCalled()
  })
  it("aborts a pending body, removes the listener and refuses a raw diagnostic without retry", async () => {
    const controller = new AbortController(), cancel = vi.fn()
    const add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener")
    const response = new Response(new ReadableStream({ cancel }), { status: 202, headers: { "content-type": "application/json" } })
    const f = vi.fn(async () => response)
    const run = refused(submitOrdinaryPayment(input(), { signal: controller.signal }, f), true)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    controller.abort(TOKEN); await run
    expect(cancel).toHaveBeenCalled(); expect(response.body?.locked).toBe(false)
    expect(add).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1); expect(f).toHaveBeenCalledTimes(1)
  })
})
