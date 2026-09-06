import { afterEach, describe, expect, it, vi } from "vitest"
import { readGatewayBalance } from "../src/gateway-balance.ts"

const account = `0x${"a".repeat(40)}`
const reply = (balance: unknown = "0.010000", extra = {}) => ({ token: "USDC", balances: [{ depositor: account, domain: 26, balance, pendingBatch: "999.000000", ...extra }] })
type FetchCall = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
const mockFetch = (impl: FetchCall) => Object.assign(vi.fn<FetchCall>(impl), { preconnect() { throw Error("No preconnect") } })
const transport = (value: unknown = reply()) => mockFetch(async () => Response.json(value))
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe("anonymous bounded Gateway balance observation", () => {
  it("requests only pinned Arc availability, not pending funds or wallet RPC", async () => {
    const fetch = transport()
    expect(await readGatewayBalance(account.toUpperCase().replace("0X", "0x"), { fetch })).toBe(10000n)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe("https://gateway-api-testnet.circle.com/v1/balances")
    expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" })
    expect(JSON.parse(String(init?.body))).toEqual({ token: "USDC", sources: [{ depositor: account, domain: 26 }] })
    const headers: string[] = []; new Headers(init?.headers).forEach((_v, key) => headers.push(key))
    expect(headers.sort()).toEqual(["accept", "accept-encoding", "content-type"])
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
  it.each(["0", "0.000000", "0.000001", "123456789012345678.123456"])("parses exact six-decimal availability %s", async balance => {
    const [whole, part = ""] = balance.split(".")
    expect(await readGatewayBalance(account, { fetch: transport(reply(balance)) })).toBe(BigInt(whole!) * 1000000n + BigInt(part.padEnd(6, "0")))
  })
  it.each([
    { token: "USDT", balances: reply().balances }, { token: "USDC", balances: [] },
    { token: "USDC", balances: [...reply().balances, ...reply().balances] },
    reply("1", { depositor: `0x${"b".repeat(40)}` }), reply("1", { domain: 6 }),
    reply("-1"), reply("01"), reply("1e3"), reply("1.0000001"), reply(10000), reply("1\n"), reply((1n << 256n).toString())
  ])("withholds invalid or mismatched response %# without claiming zero", async value => {
    const fetch = transport(value)
    expect(await readGatewayBalance(account, { fetch })).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("never uses a credential or retries an HTTP/provider failure", async () => {
    const fetch = mockFetch(async () => { throw Error("PRIVATE_TOKEN") })
    expect(await readGatewayBalance(account, { fetch })).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each(["bad", "0x" + "0".repeat(40), account + "\n"])("refuses bad address before transport %s", async address => {
    const fetch = transport()
    expect(await readGatewayBalance(address, { fetch })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("stops before transport when already cancelled", async () => {
    const fetch = transport()
    expect(await readGatewayBalance(account, { fetch, signal: AbortSignal.abort() })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("bounds an uncooperative response and cancels late body acquisition", async () => {
    vi.useFakeTimers()
    const pending = Promise.withResolvers<Response>(), cancel = vi.fn(), fetch = mockFetch(() => pending.promise)
    const operation = readGatewayBalance(account, { fetch })
    await vi.advanceTimersByTimeAsync(5001)
    expect(await operation).toBeNull()
    pending.resolve(new Response(new ReadableStream({ cancel })))
    await vi.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("aborts an uncooperative body without extending the deadline", async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const fetch = mockFetch(async () => new Response(new ReadableStream({ pull() { return new Promise<void>(() => {}) }, cancel }), { headers: { "content-type": "application/json" } }))
    const operation = readGatewayBalance(account, { fetch })
    await vi.advanceTimersByTimeAsync(5001)
    expect(await operation).toBeNull()
    expect(cancel).toHaveBeenCalledTimes(1)
  })
  it("checks the complete body and rejects HTTP, encoding, length and malformed JSON", async () => {
    for (const response of [new Response("PRIVATE", { status: 503 }), new Response("{PRIVATE", { headers: { "content-type": "application/json" } }),
      Response.json(reply(), { headers: { "content-encoding": "gzip" } }), Response.json(reply(), { headers: { "content-length": "1" } }),
      new Response(" ".repeat(65537), { headers: { "content-type": "application/json" } }), new Response(new Uint8Array([0xc3]), { headers: { "content-type": "application/json" } })]) {
      const fetch = mockFetch(async () => response)
      expect(await readGatewayBalance(account, { fetch })).toBeNull()
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })
  it("captures dependencies without invoking getters", async () => {
    let reads = 0
    const options = Object.defineProperty({}, "fetch", { get() { reads++; throw Error("PRIVATE") } })
    expect(await readGatewayBalance(account, options)).toBeNull()
    expect(reads).toBe(0)
  })
})
