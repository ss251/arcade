import { afterEach, describe, expect, it, vi } from "vitest"
import { loadChainConfig } from "@arcade/core"
import { PaymentRequirements } from "@arcade/payments"
import { paymentChoices, selectAccept } from "../src/accept-selection.ts"

const chain = loadChainConfig(), payTo = `0x${"a".repeat(40)}`
const exact = () => PaymentRequirements.make({ scheme: "exact", network: chain.caip2, asset: chain.usdc.address, amount: "10000",
  payTo, resource: "https://hub.example/x/seller/skill", maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" } })
const gateway = () => PaymentRequirements.make({ ...exact(), extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway!.wallet } })
const escrow = () => ({ ...exact(), scheme: "erc8183" })
afterEach(() => vi.restoreAllMocks())

describe("bounded buyer accept selection", () => {
  it.each([0n, 9999n, 10000n, 10001n])("uses Gateway only when observed available balance covers price %s", balance => {
    const out = selectAccept([escrow(), exact(), gateway()], undefined, balance)
    expect(out?.rail).toBe(balance < 10000n ? "eip3009" : "gateway")
    expect(out?.amountAtomic).toBe(10000n)
  })
  it("uses priority, not merchant order, and respects an explicit allow-list", () => {
    expect(selectAccept([gateway(), exact()], ["eip3009", "gateway"], 10000n)?.rail).toBe("eip3009")
    expect(selectAccept([gateway(), exact()], ["gateway"], 0n)).toBeUndefined()
    expect(selectAccept([gateway()], ["eip3009"], 10000n)).toBeUndefined()
    expect(selectAccept([escrow()], ["erc8183"], 10000n)).toBeUndefined()
  })
  it("skips unknown schemes, preserves empty refusal and never executes escrow via exact", () => {
    expect(selectAccept([{ scheme: "future" }, escrow(), exact()])?.rail).toBe("eip3009")
    expect(selectAccept([])).toBeUndefined()
    expect(paymentChoices([escrow(), { scheme: "future" }])).toEqual([])
  })
  it.each([[], ["test"], ["gateway", "gateway"], ["gateway", "eip3009", "erc8183", "gateway"]].map(preference => ({ preference })))("refuses invalid preference $preference", ({ preference }) => {
    expect(() => paymentChoices([exact()], preference as never)).toThrow("Unsupported payment choices")
  })
  it.each([-1n, 1n << 256n, "10000", NaN])("refuses invalid caller balance %s", balance => {
    expect(() => selectAccept([exact()], undefined, balance as bigint)).toThrow("Unsupported payment choices")
  })
  it.each([
    { name: "GatewayWalletBatched", version: "2", verifyingContract: chain.gateway!.wallet },
    { name: "GatewayWalletBatched", version: "1" },
    { name: "GatewayWalletBatched", version: "1", verifyingContract: payTo }
  ])("never downgrades malformed named Gateway to exact", extra => {
    expect(() => selectAccept([{ ...gateway(), extra }, exact()], undefined, 0n)).toThrow("Unsupported payment choices")
  })
  it.each(["0", "01", "10000\n", "1.5", (1n << 256n).toString()])("refuses noncanonical/out-of-range amounts %j", amount => {
    expect(() => paymentChoices([{ ...exact(), amount }])).toThrow("Unsupported payment choices")
  })
  it("rejects duplicate rails and oversized or sparse inventories", () => {
    for (const list of [[exact(), exact()], Array(33).fill({ scheme: "future" }), new Array(1)]) {
      expect(() => paymentChoices(list)).toThrow("Unsupported payment choices")
    }
  })
  it("freezes independent requirements before later transport or policy callbacks", () => {
    const a = { ...gateway(), extra: { ...gateway().extra } }, prefs = ["gateway", "eip3009"] as const
    const choices = paymentChoices([a, exact()], prefs)
    a.extra.name = "USDC"; a.payTo = `0x${"b".repeat(40)}`
    expect(choices[0]?.requirements.extra.name).toBe("GatewayWalletBatched")
    expect(choices[0]?.requirements.payTo).toBe(payTo)
    expect(Object.isFrozen(choices)).toBe(true)
    expect(Object.isFrozen(choices[0]?.requirements.extra)).toBe(true)
  })
  it("never invokes accessors and normalizes hostile diagnostics", () => {
    let reads = 0
    const evil = Object.defineProperty({}, "scheme", { get() { reads++; throw Error("PRIVATE") } })
    const extra = Object.defineProperty({}, "name", { get() { reads++; return "USDC" } })
    for (const a of [evil, { ...exact(), extra }, new Proxy({}, { ownKeys() { throw Error("PRIVATE") } })]) {
      expect(() => paymentChoices([a])).toThrow("Unsupported payment choices")
    }
    expect(reads).toBe(0)
  })
  it("is offline and requires no signer or transport", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("no network"))
    expect(selectAccept([gateway(), exact()], undefined, 10000n)?.rail).toBe("gateway")
    expect(fetch).not.toHaveBeenCalled()
  })
})
