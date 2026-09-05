import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const HUB = "https://hub.example"
const SELLER = `0x${"1".repeat(40)}`
const PAYEE = `0x${"2".repeat(40)}`
const OTHER = `0x${"3".repeat(40)}`
const ID = "usdc-flow-check"
const NAME = `${ID}.seller.arcade.eth`
const RESOURCE = `/x/${SELLER}/${ID}`
const INPUT = { address: SELLER, limit: 5 }
const req = () => ({
  scheme: "exact", amount: "10000", payTo: PAYEE,
  asset: "0x3600000000000000000000000000000000000000", network: "eip155:5042002",
  resource: HUB + RESOURCE, maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" }
})
const names = () => ({
  name: NAME, skillId: ID, seller: SELLER, endpoint: HUB + RESOURCE,
  payTo: PAYEE, chain: "eip155:5042002", priceAtomic: "99999", expired: false
})
const listing = () => ({ id: ID, seller: SELLER, price: "$0.01", ensName: NAME })
type StubOptions = {
  listing?: Record<string, unknown>; names?: Record<string, unknown>; requirements?: Record<string, unknown>
  namesStatus?: number; challengeStatus?: number
}
const stub = (options: StubOptions = {}) => {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path.startsWith("/listings/")) return Response.json(options.listing ?? listing())
    if (path.startsWith("/names/")) return Response.json(options.names ?? names(), { status: options.namesStatus ?? 200 })
    if (path.startsWith("/x/")) return Response.json({ x402Version: 2, accepts: [options.requirements ?? req()] }, { status: options.challengeStatus ?? 402 })
    throw new Error("unexpected request")
  })
  vi.stubGlobal("fetch", fetcher)
  return fetcher
}
beforeEach(() => { vi.resetModules(); vi.stubEnv("ARCADE_HUB", HUB); vi.stubEnv("ARCADE_NETWORK", "arc-testnet") })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe("the web quote verifies ENS provenance before offering a signature", () => {
  it("checks the name, sends actual input unsigned, and keeps 402 price authoritative", async () => {
    const f = stub()
    const { quote } = await import("../src/lib/hub.ts")
    const out = await quote(ID, INPUT)
    expect(out.ensName).toBe(NAME)
    expect(out.amountAtomic).toBe("10000")
    expect(out.payTo).toBe(PAYEE)
    expect(out.requirements).toEqual(req())
    expect(f.mock.calls.some(([url]) => String(url) === `${HUB}/names/${NAME}`)).toBe(true)
    const [, init] = f.mock.calls.find(([url]) => String(url) === HUB + RESOURCE)!
    expect(JSON.parse(String(init?.body))).toEqual(INPUT)
    for (const [, options] of f.mock.calls) {
      expect(options?.redirect).toBe("error")
      expect(options?.credentials).toBe("omit")
      expect(new Headers(options?.headers).has("payment-signature")).toBe(false)
    }
  })
  it.each([
    ["name", { name: `other.seller.arcade.eth` }],
    ["skill", { skillId: "other" }],
    ["seller", { seller: OTHER }],
    ["payee", { payTo: OTHER }],
    ["chain", { chain: "eip155:1" }],
    ["missing chain", { chain: undefined }],
    ["foreign origin", { endpoint: `https://other.example${RESOURCE}` }],
    ["expired", { expired: true }],
    ["unknown liveness", { expired: undefined }],
    ["encoded path", { endpoint: `${HUB}/x/${SELLER}/%75sdc-flow-check` }]
  ])("refuses %s disagreement rather than dressing an advertised name as verified", async (_, mutation) => {
    stub({ names: { ...names(), ...mutation } })
    const { quote } = await import("../src/lib/hub.ts")
    await expect(quote(ID, INPUT)).rejects.toThrow(/ENS/)
  })
  it.each([404, 503])("fails closed on a %s resolver response without inferring expiry", async status => {
    stub({ namesStatus: status, names: { error: "private RPC secret" } })
    const { quote } = await import("../src/lib/hub.ts")
    await expect(quote(ID, INPUT)).rejects.toThrow(/ENS resolution unavailable/)
    await expect(quote(ID, INPUT)).rejects.not.toThrow(/private|expired/)
  })
  it("keeps an absent or null name opt-in and makes no resolver request", async () => {
    const f = stub({ listing: { ...listing(), ensName: null } })
    const { quote } = await import("../src/lib/hub.ts")
    const out = await quote(ID, INPUT)
    expect(out).not.toHaveProperty("ensName")
    expect(f.mock.calls).toHaveLength(2)
  })
  it.each([
    { amount: "-1" }, { amount: "01" }, { amount: "1.2" }, { amount: ((1n << 256n)).toString() },
    { payTo: "0xabc" }, { network: "eip155:1" }, { asset: OTHER },
    { resource: `https://foreign.example${RESOURCE}` }, { maxTimeoutSeconds: 0 }
  ])("rejects malformed or unauthorized payment requirements %j", async mutation => {
    stub({ requirements: { ...req(), ...mutation }, listing: { ...listing(), ensName: null } })
    const { quote } = await import("../src/lib/hub.ts")
    await expect(quote(ID, INPUT)).rejects.toThrow(/payment challenge/)
  })
  it("refuses a changed listing identity before issuing its probe", async () => {
    const f = stub({ listing: { ...listing(), id: "different" } })
    const { quote } = await import("../src/lib/hub.ts")
    await expect(quote(ID, INPUT)).rejects.toThrow()
    expect(f.mock.calls).toHaveLength(1)
  })
  it("rechecks ENS and actual approved input when deriving the later signing request", async () => {
    const f = stub()
    const { deriveSigningRequest } = await import("../src/lib/purchase.ts")
    const out = await deriveSigningRequest({ skillId: ID, maxAmountUsd: "$0.02", toolCallId: "c", input: INPUT })
    expect(out.ensName).toBe(NAME)
    expect(f.mock.calls.some(([url]) => String(url) === `${HUB}/names/${NAME}`)).toBe(true)
    expect(JSON.parse(String(f.mock.calls.find(([url]) => String(url) === HUB + RESOURCE)?.[1]?.body))).toEqual(INPUT)
  })
  it("bounds the complete streamed quote body and cancels stalled reads", async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ cancel }))))
    const { quote } = await import("../src/lib/hub.ts")
    const outcome = quote(ID, INPUT).then(() => "accepted", () => "refused")
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await Promise.race([outcome, Promise.resolve("pending")])).toBe("refused")
    expect(cancel).toHaveBeenCalled()
  })
  it("parses approved tool input before quote and returns the same input to the job", async () => {
    const f = stub()
    const { arcade_call_skill } = await import("../src/lib/tools.ts")
    const out = await arcade_call_skill.execute!({ skillId: ID, maxAmountUsd: "$0.02", input: JSON.stringify(INPUT) }, { toolCallId: "c", messages: [] } as never)
    expect(out).toMatchObject({ awaitingSignature: true, input: INPUT, ensName: NAME })
    expect(JSON.parse(String(f.mock.calls.find(([url]) => String(url) === HUB + RESOURCE)?.[1]?.body))).toEqual(INPUT)
  })
  it.each(["{bad", "[]", "null", "42"])("never silently quotes an empty object for invalid approved input %s", async input => {
    const f = stub()
    const { arcade_call_skill } = await import("../src/lib/tools.ts")
    await expect(arcade_call_skill.execute!({ skillId: ID, maxAmountUsd: "$0.02", input }, { toolCallId: "c", messages: [] } as never)).rejects.toThrow(/input/)
    expect(f).not.toHaveBeenCalled()
  })
})
