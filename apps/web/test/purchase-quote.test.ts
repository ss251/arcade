import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import chain from "../../../config/chains/arc-testnet.json"
import { quotePurchaseContext } from "../src/lib/purchase-quote.ts"

const WEB = "https://web.example", HUB = "https://hub.example", SELLER = `0x${"3".repeat(40)}`
const resource = `/x/${SELLER}/diff-triage`
const browser = () => ({ hubOrigin: HUB, skillId: "diff-triage", seller: SELLER, resource, amountAtomic: "10000",
  payTo: SELLER, asset: chain.usdc.address, network: chain.caip2, rail: "eip3009",
  requirements: { scheme: "exact", network: chain.caip2, amount: "10000", asset: chain.usdc.address,
    payTo: SELLER, resource: HUB + resource, maxTimeoutSeconds: 604900, mimeType: "application/json",
    extra: { name: "USDC", version: "2" } } })
const body = () => ({ skillId: "diff-triage", price: "$0.01", amountAtomic: "10000", payTo: SELLER,
  network: chain.caip2, asset: chain.usdc.address, browser: browser() })
beforeEach(() => vi.stubGlobal("location", { origin: WEB }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers() })
describe("fixed same-origin keyless purchase quote", () => {
  it("sends only the original name and actual input, binding both response projections", async () => {
    const name = "diff-triage.seller.arcade.eth", value = body()
    const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json({
      ...value, ensName: name, browser: { ...value.browser, ensName: name }
    }))
    const result = await quotePurchaseContext({ name }, { diff: "owned input" }, {}, f)
    expect(result.skillId).toBe("diff-triage"); expect(result.ensName).toBe(name)
    expect(JSON.parse(String(f.mock.calls[0]?.[1]?.body))).toEqual({ name, input: { diff: "owned input" } })
    expect(f).toHaveBeenCalledTimes(1)
  })
  it.each([undefined, "other.eth"])("refuses a different or missing explicitly requested name (%s)", async ensName => {
    const b = body(), response = { ...b, ...(ensName ? { ensName } : {}), browser: { ...b.browser, ...(ensName ? { ensName } : {}) } }
    await expect(quotePurchaseContext({ name: "diff-triage.seller.arcade.eth" }, {}, {}, async () => Response.json(response)))
      .rejects.toThrow("Purchase terms unavailable")
  })
  it.each([{ name: "x.eth", skillId: "diff-triage" }, { name: "x.eth", endpoint: HUB }, { name: "bad" }])("refuses extra or ambiguous target fields %j before IO", async target => {
    const f = vi.fn(async () => Response.json(body()))
    await expect(quotePurchaseContext(target, {}, {}, f)).rejects.toThrow("Purchase terms unavailable")
    expect(f).not.toHaveBeenCalled()
  })
  it("projects only typed expiry and validated mismatched public payees outside transport errors", async () => {
    const target = { name: "diff-triage.seller.arcade.eth" }, other = "0x" + "4".repeat(40)
    await expect(quotePurchaseContext(target, {}, {}, async () => Response.json({
      error: "ens_name_expired", detail: "PRIVATE_CAUSE"
    }, { status: 502 }))).rejects.toMatchObject({ code: "ens_name_expired", message: expect.stringContaining("expired") })
    await expect(quotePurchaseContext(target, {}, {}, async () => Response.json({
      error: "ens_payto_mismatch", ensPayTo: SELLER, challengePayTo: other, detail: "PRIVATE_CAUSE"
    }, { status: 502 }))).rejects.toMatchObject({ code: "ens_payto_mismatch", message: expect.stringContaining(SELLER) })
    await expect(quotePurchaseContext(target, {}, {}, async () => Response.json({
      error: "ens_payto_mismatch", ensPayTo: "PRIVATE_CAUSE", challengePayTo: other
    }, { status: 502 }))).rejects.toMatchObject({ message: "Purchase terms unavailable" })
  })
  it("uses captured canonical actual input and returns the complete immutable context", async () => {
    const f = vi.fn(async () => Response.json(body()))
    const input = { z: true, a: "é" }
    const run = quotePurchaseContext("diff-triage", input, {}, f); input.a = "mutated"
    const result = await run
    expect(result).toEqual(browser()); expect(Object.isFrozen(result)).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(WEB + "/api/quote")
    expect(init).toMatchObject({ method: "POST", body: '{"skillId":"diff-triage","input":{"a":"é","z":true}}',
      credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" })
    expect([...new Headers(init.headers)]).toEqual([["accept", "application/json"], ["content-type", "application/json"]])
    expect(f).toHaveBeenCalledTimes(1)
  })
  it.each([
    { skillId: "other-skill" }, { price: "$0.02" }, { amountAtomic: "20000" }, { payTo: `0x${"4".repeat(40)}` },
    { network: "eip155:1" }, { asset: SELLER }, { browser: undefined }, { ensName: "unverified.eth" }
  ])("refuses contradictory top-level terms %j", change => {
    return expect(quotePurchaseContext("diff-triage", "{}", {}, async () => Response.json({ ...body(), ...change })))
      .rejects.toMatchObject({ message: "Purchase terms unavailable" })
  })
  it("retains ENS only when both bounded projections agree", async () => {
    const b = body()
    const ensName = "diff-triage.seller.arcade.eth"
    expect((await quotePurchaseContext("diff-triage", "{}", {}, async () => Response.json({
      ...b, ensName, browser: { ...b.browser, ensName }
    }))).ensName).toBe(ensName)
    await expect(quotePurchaseContext("diff-triage", "{}", {}, async () => Response.json({
      ...b, browser: { ...b.browser, ensName }
    }))).rejects.toMatchObject({ message: "Purchase terms unavailable" })
  })
  it.each(["other/skill", "", "diff-triage\n"])("refuses invalid skill %s before IO", async skill => {
    const f = vi.fn(async () => Response.json(body()))
    await expect(quotePurchaseContext(skill, "{}", {}, f)).rejects.toMatchObject({ message: "Purchase terms unavailable" })
    expect(f).not.toHaveBeenCalled()
  })
  it("refuses invalid/oversized envelope and input getters without IO", async () => {
    const f = vi.fn(async () => Response.json(body())), getter = vi.fn(() => 1)
    for (const input of ["[]", '{"x":"' + "x".repeat(131072 - 8) + '"}', Object.defineProperty({}, "x", { enumerable: true, get: getter })]) {
      await expect(quotePurchaseContext("diff-triage", input, {}, f)).rejects.toMatchObject({ message: "Purchase terms unavailable" })
    }
    expect(f).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled()
  })
  it.each(["null", "http://web.example", "https://u:p@web.example", "https://web.example/"])("refuses unsafe location origin %s", async origin => {
    vi.stubGlobal("location", { origin })
    const f = vi.fn(async () => Response.json(body()))
    await expect(quotePurchaseContext("diff-triage", "{}", {}, f)).rejects.toMatchObject({ message: "Purchase terms unavailable" })
    expect(f).not.toHaveBeenCalled()
  })
  it("allows isolated loopback web origin but no caller-supplied quote target", async () => {
    vi.stubGlobal("location", { origin: "http://127.0.0.1:4567" })
    const f = vi.fn(async () => Response.json(body()))
    await quotePurchaseContext("diff-triage", "{}", {}, f)
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://127.0.0.1:4567/api/quote")
  })
  it("bounds a stalled quote, ignores late completion and never retries", async () => {
    vi.useFakeTimers()
    let release!: (r: Response) => void
    const f = vi.fn(() => new Promise<Response>(resolve => { release = resolve })), cancel = vi.fn()
    const run = expect(quotePurchaseContext("diff-triage", "{}", { timeoutMs: 20 }, f)).rejects.toMatchObject({ message: "Purchase terms unavailable" })
    await vi.advanceTimersByTimeAsync(20); await run
    release(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalledTimes(1); expect(f).toHaveBeenCalledTimes(1)
  })
})
