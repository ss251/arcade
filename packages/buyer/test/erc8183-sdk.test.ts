import { describe, expect, it } from "vitest"
import { loadChainConfig } from "@arcade/core"
import { captureEscrowPurchaseConfig, captureEscrowFetchConfig, captureEscrowListingCall, assertEscrowSdkRequest,
  fetchEscrowSdkProbe, type EscrowPurchaseConfig } from "../src/erc8183-sdk.ts"
import { paymentChoices, selectAccept } from "../src/accept-selection.ts"
import { createEscrowBuyerIntent } from "../../payments/src/erc8183-buyer-intent.ts"
import { buyerFixture, addr } from "../../payments/test/fixtures/erc8183-buyer.ts"
const body = JSON.stringify({ fixture: true })
async function fixture() {
  const f = await buyerFixture(), config = { identity: f.intent.identity, gasBudgetWei: f.intent.gasBudgetWei,
    expiresInSeconds: 1800, operationTimeoutMs: 30000,
    // Read-only contract tests only; this stub has no execution/durability authority.
    journal: { durability: "durable" } as EscrowPurchaseConfig["journal"] },
    listing = { id: "skill", version: "1.0.0", seller: f.intent.call.provider, price: "$0.30", rails: ["erc8183"],
      delisted: false, bounds: { timeoutSec: 60 }, erc8004: { verified: true, chain: "eip155:5042002",
        agentId: "8", registry: loadChainConfig().erc8004!.identity } }
  return { ...f, config, listing }
}
describe("explicit SDK escrow contracts (no private storage or network)", () => {
  it("keeps default inventory/selection unchanged and permits only explicitly enabled closed escrow accepts", async () => {
    const f = await fixture()
    expect(paymentChoices([f.input.requirements])).toEqual([])
    expect(selectAccept([f.input.requirements], ["erc8183"])).toBeUndefined()
    expect(selectAccept([f.input.requirements], ["erc8183"], undefined, true)?.rail).toBe("erc8183")
    expect(paymentChoices([f.input.requirements], ["eip3009"], true)).toEqual([])
    expect(() => paymentChoices([f.input.requirements, f.input.requirements], undefined, true)).toThrow()
    expect(() => paymentChoices([{ ...f.input.requirements, extra: { ...f.input.requirements.extra, evaluator: "invalid" } }], undefined, true)).toThrow()
  })
  it("binds a separately captured current listing and actual canonical input, not just the402 echo", async () => {
    const f = await fixture(), config = captureEscrowPurchaseConfig(f.config), call = captureEscrowListingCall(f.listing, f.intent.call.resource, body, config)
    expect(call).toEqual(f.intent.call)
    const captured = captureEscrowFetchConfig({ ...config, call })
    expect(() => assertEscrowSdkRequest(captured, call.resource, body)).not.toThrow()
    expect(() => assertEscrowSdkRequest(captured, call.resource.replace("example.test", "elsewhere.test"), body)).toThrow()
    expect(() => assertEscrowSdkRequest(captured, call.resource, "{}")).toThrow()
    expect(() => assertEscrowSdkRequest(captured, call.resource, " " + body)).toThrow()
    const changed = captureEscrowListingCall({ ...f.listing, price: "$0.31" }, call.resource, body, config)
    expect(() => createEscrowBuyerIntent({ ...f.input, call: changed })).toThrow()
  })
  it.each(["seller", "id", "delisted", "rails", "agent", "verified", "registry", "network"])("refuses changed current listing %s", async field => {
    const f = await fixture(), listing = { ...f.listing, erc8004: { ...f.listing.erc8004 } }
    if (field === "seller") listing.seller = addr(99)
    if (field === "id") listing.id = "other"
    if (field === "delisted") listing.delisted = true
    if (field === "rails") listing.rails = ["eip3009"]
    if (field === "agent") listing.erc8004.agentId = "0"
    if (field === "verified") listing.erc8004.verified = false
    if (field === "registry") listing.erc8004.registry = addr(99)
    if (field === "network") listing.erc8004.chain = "eip155:1"
    expect(() => captureEscrowListingCall(listing, f.intent.call.resource, body, f.config)).toThrow()
  })
  it("rejects config accessors/excess fields without reading a getter", async () => {
    const f = await fixture(); let reads = 0
    expect(() => captureEscrowPurchaseConfig({ ...f.config, get gasBudgetWei() { reads++; return 1n } })).toThrow()
    expect(reads).toBe(0)
    expect(() => captureEscrowPurchaseConfig({ ...f.config, unexpected: true } as EscrowPurchaseConfig)).toThrow()
    expect(() => captureEscrowPurchaseConfig({ ...f.config, operationTimeoutMs: 300001 })).toThrow()
  })
  it("consumes a delayed body before ending its fetch scope and returns a bounded captured response", async () => {
    let signal: AbortSignal | undefined
    const fetch = (async (_url, init) => {
      signal = init?.signal ?? undefined
      return new Response(new ReadableStream({ async start(controller) {
        await new Promise(resolve => setTimeout(resolve, 5))
        if (signal?.aborted) controller.error(Error("aborted before body"))
        else { controller.enqueue(new TextEncoder().encode('{"accepts":[]}')); controller.close() }
      } }), { status: 402, headers: { "content-type": "application/json" } })
    }) as typeof globalThis.fetch
    const result = await fetchEscrowSdkProbe("https://example.test", {}, fetch, new AbortController().signal)
    expect(await result.json()).toEqual({ accepts: [] }); expect(signal?.aborted).toBe(true)
  })
})
