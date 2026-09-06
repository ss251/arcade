import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Confirm } from "../src/components/confirm.tsx"
import { LivePurchaseView } from "../src/components/purchase.tsx"

const base = {
  skillId: "usdc-flow-check", price: "$0.01",
  payTo: `0x${"a".repeat(40)}`, network: "eip155:5042002",
  onApprove: () => {}, onDeny: () => {}
}
const name = "usdc-flow-check.ss251.arcade.eth"

describe("confirm card — verified ENS quote", () => {
  it("shows the full name and its payout provenance without hiding the address", () => {
    const html = renderToStaticMarkup(<Confirm {...base} ensName={name} />)
    expect(html).toContain(`class="ens-name" title="${name}">${name}</div>`)
    expect(html).toContain("from ENS")
    expect(html).toContain(`title="${base.payTo}"`)
    expect(html).toContain("Copy the payout address")
    expect(html).toContain("Hold to approve paying $0.01")
  })
  it("has no name or ENS claim for the unchanged direct-ID card", () => {
    const html = renderToStaticMarkup(<Confirm {...base} />)
    expect(html).not.toContain("ens-name")
    expect(html).not.toContain("from ENS")
    expect(html).toContain(base.skillId)
  })
  it("states the hub settlement policy without promising that a remote refusal revokes a signature", () => {
    const html = renderToStaticMarkup(<Confirm {...base} ensName={name} />)
    expect(html).toContain("ARCADE hubs settle only after the result validates")
    expect(html).toContain("signed authorization may remain valid")
    expect(html).toContain("check the settlement record before retrying")
    expect(html).not.toContain("leaves your balance untouched")
    expect(html).not.toContain("Nothing is charged unless")
  })
  it("escapes identifier text and title rather than treating them as markup", () => {
    const html = renderToStaticMarkup(<Confirm {...base} ensName={'<img src=x onerror="bad">.eth'} />)
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img")
  })
  it("keeps a verified name visible on a blocked card, without enabling payment", () => {
    const html = renderToStaticMarkup(<Confirm {...base} ensName={name} blocked="Connect your wallet" />)
    expect(html).toContain(name)
    expect(html).toContain("disabled")
    expect(html).toContain("Connect your wallet")
  })
  it("never turns an uncertain signed outcome into a no-charge promise", () => {
    const html = renderToStaticMarkup(<LivePurchaseView view={{ phase: "unconfirmed",
      message: "Purchase outcome unconfirmed. The signed authorization may remain valid; check before retrying." }} />)
    expect(html).toContain("outcome unconfirmed"); expect(html).toContain("check before retrying")
    expect(html).not.toContain("not settled"); expect(html).not.toContain("you were not charged")
  })
  it("does not treat a hub failure report as independent proof a signature cannot be redeemed", () => {
    const html = renderToStaticMarkup(<LivePurchaseView view={{ phase: "not_settled",
      message: "The hub reports no settlement. This is not independent proof of no charge." }} />)
    expect(html).toContain("not independent proof of no charge")
    expect(html).not.toContain("you were not charged")
  })
  it("does not claim payment acceptance or dispatch immediately after signing", () => {
    const html = renderToStaticMarkup(<LivePurchaseView view={{ phase: "submitting",
      message: "Submitting once. Do not repeat the payment." }} />)
    expect(html).toContain('role="status"'); expect(html).toContain("Submitting once")
    expect(html).not.toContain("paid;"); expect(html).not.toContain("seller is running")
    expect(renderToStaticMarkup(<LivePurchaseView view={{ phase: "signing",
      message: "Review the exact authorization in your wallet." }} />)).toContain("Review the exact authorization")
  })
})
