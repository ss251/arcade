import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Confirm } from "../src/components/confirm.tsx"

const base = { skillId: "diff-triage", price: "$0.01", payTo: `0x${"3".repeat(40)}`, network: "eip155:5042002",
  onApprove: () => { throw Error("SSR must never approve") }, onDeny: () => { throw Error("SSR must never deny") } }
describe("confirmation keyboard and private identity presentation", () => {
  it("explains the same deliberate hold for pointer and keyboard users", () => {
    const html = renderToStaticMarkup(<Confirm {...base} />)
    expect(html).toContain("Space or Enter"); expect(html).toContain("0.9 seconds")
    expect(html).toContain("Releasing or leaving the card cancels")
    expect(html).toContain('type="button" class="approve"')
    expect(html).toContain("Hold to approve paying $0.01 for diff-triage")
  })
  it("never serializes the parent's private decision identity into markup", () => {
    const html = renderToStaticMarkup(<Confirm {...base} decisionKey="PRIVATE_DECISION_CONTEXT" />)
    expect(html).not.toContain("PRIVATE_DECISION_CONTEXT")
  })
  it("blocks payment while connecting even when a caller has no separate blocker", () => {
    const html = renderToStaticMarkup(<Confirm {...base} connecting />)
    expect(html).toContain("Finish connecting your wallet before approving")
    expect(html).toMatch(/class="approve"[^>]*disabled/)
  })
  it("retains full address and verified ENS while a blocked card stays inactive", () => {
    const html = renderToStaticMarkup(<Confirm {...base} blocked="Terms changed" ensName="diff-triage.seller.arcade.eth" />)
    expect(html).toContain(base.payTo); expect(html).toContain("diff-triage.seller.arcade.eth")
    expect(html).toContain("from ENS"); expect(html).toContain("Terms changed")
    expect(html).toMatch(/class="approve"[^>]*disabled/)
  })
})
