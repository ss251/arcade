import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { loadChainConfig, type ListingRail } from "@arcade/core"
import { decodeHeaderJson, HEADER_PAYMENT_SIGNATURE, PaymentRequirements } from "@arcade/payments"
import { fetchWithPayment } from "../src/fetch-with-payment.ts"

const chain = loadChainConfig(), account = privateKeyToAccount(generatePrivateKey()), url = "https://hub.example/x/seller/skill"
const exact = () => PaymentRequirements.make({ scheme: "exact", network: chain.caip2, amount: "10000", asset: chain.usdc.address,
  payTo: `0x${"a".repeat(40)}`, resource: url, maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" } })
const gateway = () => PaymentRequirements.make({ ...exact(), payTo: `0x${"b".repeat(40)}`, extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway!.wallet } })
const choices = () => [{ ...exact(), scheme: "erc8183" }, exact(), gateway(), { scheme: "future" }]
type Options = Parameters<typeof fetchWithPayment>[2]
const fixture = (balance: string | null = "0.01", accepts: unknown[] = choices()) => {
  const probes: Request[] = [], reads: Request[] = [], paid: Request[] = [], signer = { ...account }, sign = vi.spyOn(signer, "signTypedData")
  const fetch: typeof globalThis.fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    if (request.url === "https://gateway-api-testnet.circle.com/v1/balances") {
      reads.push(request)
      return balance === null ? new Response("PRIVATE_PROVIDER", { status: 503 }) : Response.json({ token: "USDC", balances: [{ depositor: account.address, domain: 26, balance }] })
    }
    expect(request.url).toBe(url)
    if (request.headers.has(HEADER_PAYMENT_SIGNATURE)) { paid.push(request); return Response.json({ ok: true }, { status: 202 }) }
    probes.push(request); return Response.json({ x402Version: 2, accepts }, { status: 402 })
  }, { preconnect() { throw Error("No preconnect") } })
  const run = (options: Partial<Options> = {}, signal?: AbortSignal) => Effect.runPromise(Effect.either(fetchWithPayment(url,
    { method: "POST", body: "original", headers: { "x-original": "yes" }, ...(signal ? { signal } : {}) },
    { account: signer, fetch, maxAmountAtomic: 10000n, lineage: "cap.private-fixture", ...options })))
  return { probes, reads, paid, signer, sign, fetch, run }
}
afterEach(() => vi.restoreAllMocks())

describe("multi-rail buyer signing edge", () => {
  it.each(["0.01", "0.02", "0.009999", "0", null])("selects funded Gateway or exact fallback before one signature: %s", async balance => {
    const f = fixture(balance), out = await f.run(), rail = balance === "0.01" || balance === "0.02" ? "gateway" : "eip3009"
    expect(out).toMatchObject({ _tag: "Right", right: { paid: true, amountAtomic: 10000n, authorizedRail: rail } })
    expect(f.probes).toHaveLength(1); expect(f.reads).toHaveLength(1); expect(f.paid).toHaveLength(1); expect(f.sign).toHaveBeenCalledTimes(1)
    const payload = decodeHeaderJson(f.paid[0]!.headers.get(HEADER_PAYMENT_SIGNATURE)!) as { accepted: PaymentRequirements }
    expect(payload.accepted.extra.name).toBe(rail === "gateway" ? "GatewayWalletBatched" : "USDC")
    expect(await f.paid[0]!.text()).toBe("original")
    for (const h of ["authorization", "cookie", HEADER_PAYMENT_SIGNATURE, "x-arcade-hire-capability", "x-original"]) expect(f.reads[0]!.headers.has(h)).toBe(false)
  })
  it("obeys exact-only without a balance request even when Gateway is first", async () => {
    const f = fixture("999", [gateway(), exact()]), out = await f.run({ preferRail: ["eip3009"] })
    expect(out).toMatchObject({ _tag: "Right", right: { authorizedRail: "eip3009" } })
    expect(f.reads).toHaveLength(0)
  })
  it("refuses unfunded explicit Gateway without signing exact", async () => {
    const f = fixture("0"), out = await f.run({ preferRail: ["gateway"] })
    expect(out).toMatchObject({ _tag: "Left", left: { method: "402" } })
    expect(f.sign).not.toHaveBeenCalled(); expect(f.paid).toHaveLength(0)
  })
  it("checks caps before any balance read or signature", async () => {
    const f = fixture(), out = await f.run({ maxAmountAtomic: 9999n })
    expect(out).toMatchObject({ _tag: "Left", left: { method: "402" } })
    expect(f.reads).toHaveLength(0); expect(f.sign).not.toHaveBeenCalled()
  })
  it("refuses malformed known Gateway rather than treating it as unfunded", async () => {
    const f = fixture("0", [{ ...gateway(), extra: { name: "GatewayWalletBatched" } }, exact()]), out = await f.run()
    expect(out).toMatchObject({ _tag: "Left", left: { method: "402" } })
    expect(f.reads).toHaveLength(0); expect(f.sign).not.toHaveBeenCalled()
  })
  it("keeps the final signing gate and forbids mutation of its retained extra", async () => {
    const f = fixture(), gate = vi.fn((r: PaymentRequirements) => { (r.extra as Record<string, unknown>).name = "USDC"; return null })
    const out = await f.run({ beforeSign: gate })
    expect(out).toMatchObject({ _tag: "Left", left: { method: "beforeSign" } })
    expect(gate).toHaveBeenCalledTimes(1); expect(f.sign).not.toHaveBeenCalled()
  })
  it("captures preference before the initial probe can mutate caller options", async () => {
    const f = fixture(), preference: ListingRail[] = ["eip3009"]
    const fetch: typeof globalThis.fetch = Object.assign(async (...args: Parameters<typeof globalThis.fetch>) => {
      preference[0] = "gateway"; return f.fetch(...args)
    }, { preconnect() { throw Error("No preconnect") } })
    const out = await f.run({ fetch, preferRail: preference })
    expect(out).toMatchObject({ _tag: "Right", right: { authorizedRail: "eip3009" } })
    expect(f.reads).toHaveLength(0)
  })
  it("never signs an exact fallback after caller cancellation during balance observation", async () => {
    const f = fixture(), controller = new AbortController()
    const fetch: typeof globalThis.fetch = Object.assign(async (...args: Parameters<typeof globalThis.fetch>) => {
      if (String(args[0]).endsWith("/v1/balances")) controller.abort()
      return f.fetch(...args)
    }, { preconnect() { throw Error("No preconnect") } })
    const out = await f.run({ fetch }, controller.signal)
    expect(out._tag).toBe("Left"); expect(f.sign).not.toHaveBeenCalled(); expect(f.paid).toHaveLength(0)
  })
  it("can choose affordable exact without looking up an over-cap Gateway quote", async () => {
    const f = fixture("999", [{ ...gateway(), amount: "20000" }, exact()]), out = await f.run()
    expect(out).toMatchObject({ _tag: "Right", right: { authorizedRail: "eip3009", amountAtomic: 10000n } })
    expect(f.reads).toHaveLength(0)
  })
  it("never falls back to a second rail after issuing a Gateway signature", async () => {
    const f = fixture(), fetch: typeof globalThis.fetch = Object.assign(async (...args: Parameters<typeof globalThis.fetch>) => {
      const response = await f.fetch(...args)
      if (new Headers(args[1]?.headers).has(HEADER_PAYMENT_SIGNATURE)) throw Error("PRIVATE_TRANSPORT")
      return response
    }, { preconnect() { throw Error("No preconnect") } })
    const out = await f.run({ fetch })
    expect(out).toMatchObject({ _tag: "Left", left: { method: "fetch(paid)", reason: "Gateway authorization issued; payment outcome unknown. Reconcile before retrying." } })
    expect(f.probes).toHaveLength(1); expect(f.paid).toHaveLength(1); expect(f.sign).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(out)).not.toContain("PRIVATE_TRANSPORT")
  })
})
