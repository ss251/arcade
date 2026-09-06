import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { SellerBoard, SellerAddressForm, SellerPage } from "../src/components/seller.tsx"
import { SELLER, NOW, HASH, sellerFixture } from "./fixtures/seller-data.ts"
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe("public seller dashboard", () => {
  it("shows actual revenue, fees, net, failed-job inference and settled-call margin separately", () => {
    const html = renderToStaticMarkup(<SellerBoard summary={sellerFixture()} observedAtMs={NOW} />)
    for (const label of ["Revenue", "Fees", "Net after fees", "Inference cost", "Direct sub-spend", "Margin", "$0.12", "$0.006", "$0.114", "$0.03", "$0.084"])
      expect(html).toContain(label)
    expect(html).toContain("per settled call"); expect(html).toContain("failed jobs"); expect(html).toContain("test and canary")
    expect(html).not.toContain("PRIVATE_")
  })
  it.each(["unknown-cost", "unknown-spend"] as const)("preserves incomplete $mode and its known subtotal", mode => {
    const html = renderToStaticMarkup(<SellerBoard summary={sellerFixture(mode)} observedAtMs={NOW} />)
    expect(html).toContain("Unavailable"); expect(html).toContain("partial"); expect(html).toContain("Known")
    expect(html).not.toContain("null")
  })
  it("shows a real loss and an exact zero without treating zero as missing", () => {
    const loss = renderToStaticMarkup(<SellerBoard summary={sellerFixture("negative")} observedAtMs={NOW} />)
    expect(loss).toContain("-$0.386"); expect(loss).toContain("loss"); expect(loss).toContain("is-refused")
    const zero = renderToStaticMarkup(<SellerBoard summary={sellerFixture("zero")} observedAtMs={NOW} />)
    expect(zero).toContain("$0.00"); expect(zero).not.toContain("Unavailable")
  })
  it("separates historical earnings without current listings from zero settlements", () => {
    const history = renderToStaticMarkup(<SellerBoard summary={sellerFixture("historical")} observedAtMs={NOW} />)
    expect(history).toContain("No current listings"); expect(history).toContain("$0.12"); expect(history).not.toContain("No recorded settlements")
    const empty = renderToStaticMarkup(<SellerBoard summary={sellerFixture("empty")} observedAtMs={NOW} />)
    expect(empty).toContain("No recorded settlements"); expect(empty).toContain("Unavailable")
    expect(empty).not.toMatch(/refund|not charged/)
  })
  it("preserves agent #0 and unknown ENS liveness without invented reference links", () => {
    const html = renderToStaticMarkup(<SellerBoard summary={sellerFixture()} observedAtMs={NOW} />)
    expect(html).toContain("agent #0"); expect(html).toContain("hub-reported verified"); expect(html).toContain("expiry unknown")
    expect(html).toContain(HASH); expect(html).not.toContain("/tx/"); expect(html).not.toContain("verified on chain")
  })
  it("renders unknown identity, expiry and runner availability as qualified claims", () => {
    const s = sellerFixture(); const listing = { ...s.listings[0]!, ensExpired: true, live: false }
    delete listing.agentId; delete listing.agentVerified
    const html = renderToStaticMarkup(<SellerBoard summary={{ ...s, listings: [listing] }} observedAtMs={NOW} />)
    expect(html).toContain("no identity claim"); expect(html).toContain("hub-reported expired"); expect(html).toContain("offline")
  })
  it.each(["missing", "invalid", "unavailable"] as const)("renders fixed $state state without a false empty ledger", state => {
    const html = renderToStaticMarkup(<SellerPage address={state === "missing" ? "" : SELLER}
      data={{ state, address: state === "missing" ? null : SELLER, summary: null, observedAtMs: NOW }} onSelect={() => {}} />)
    expect(html).toContain(state === "missing" ? "Enter a public seller address" : state === "invalid" ? "Invalid seller address" : "Seller summary unavailable")
    expect(html).not.toContain("No recorded settlements"); expect(html).not.toContain("$0.00")
  })
  it("SSR never prompts a wallet or calls the hub", () => {
    const io = vi.fn(() => { throw Error("SSR IO") }); vi.stubGlobal("ethereum", { request: io }); vi.stubGlobal("fetch", io)
    const html = renderToStaticMarkup(<SellerAddressForm address={SELLER} onSelect={io} />)
    expect(html).toContain("Use wallet address"); expect(html).toContain("not authentication"); expect(io).not.toHaveBeenCalled()
  })
  it("does not display old summary data under a newer URL selection", () => {
    const html = renderToStaticMarkup(<SellerPage address={`0x${"5".repeat(40)}`}
      data={{ state: "ready", address: SELLER, summary: sellerFixture(), observedAtMs: NOW }} onSelect={() => {}} />)
    expect(html).not.toContain("$0.12"); expect(html).toContain("Waiting for the selected seller summary")
  })
})
