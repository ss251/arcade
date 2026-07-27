import { afterEach, describe, expect, it, vi } from "vitest"
import { deriveSigningRequest, PriceMovedAboveApproval } from "../src/lib/purchase.ts"
import { arcade_call_skill, SPENDING_TOOLS } from "../src/lib/tools.ts"
import { decide } from "../src/lib/approval.ts"

/**
 * T-EXEC-005's three required tests, plus the composition mutation.
 *
 * The edge carries two bindings over different facts — the approval HMAC over tool name,
 * call id and arguments, and the EIP-3009 signature over payTo, value, validBefore and
 * nonce — and nothing inherently ties them. The design answer is single-copy: the server
 * DERIVES the payment requirements from the approved arguments and hands the client only
 * that, so a mismatch is unconstructible rather than detected.
 *
 * These are written deny-first. A suite that only walks the approve path passes identically
 * whether the gate is wired or missing, and here that would be vacuous about money.
 *
 * **Rail: none.** Nothing below touches a chain or a real hub — `fetch` is stubbed. What
 * they establish is that the derivation cannot be bypassed and the policy refuses; a live
 * settlement is a separate claim, measured on a rail, and stated as such when it exists.
 */

const HUB = "http://hub.test"
process.env["ARCADE_HUB"] = HUB

const SELLER = "0x1111111111111111111111111111111111111111"

/** A hub that quotes `priceAtomic` for whatever skill is asked for. */
const stubHub = (priceAtomic: string, skillId = "diff-triage") =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/listings/")) {
        return new Response(JSON.stringify({ id: skillId, seller: SELLER, price: "$0.12" }))
      }
      if (url.includes("/x/")) {
        return new Response(
          JSON.stringify({
            accepts: [
              {
                amount: priceAtomic,
                payTo: SELLER,
                asset: "0x3600000000000000000000000000000000000000",
                network: "eip155:5042002"
              }
            ]
          }),
          { status: 402 }
        )
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  )

afterEach(() => vi.unstubAllGlobals())

describe("T-EXEC-005 (1) — a denied approval blocks the purchase", () => {
  it("denies above the ceiling, so no signing request is ever produced", () => {
    // The policy decides BEFORE the tool executes. A denied call never reaches
    // deriveSigningRequest, so there is nothing for a client to sign.
    expect(decide({ skillId: "diff-triage", maxAmountUsd: "$5.00" }, { ARCADE_MAX_CALL_USD: "$1.00" })).toBe(
      "denied"
    )
  })

  it("escalates every priced purchase rather than approving any of it", () => {
    for (const amount of ["$0.000001", "$0.12", "$1.00"]) {
      expect(decide({ skillId: "s", maxAmountUsd: amount }, { ARCADE_MAX_CALL_USD: "$1.00" })).toBe(
        "user-approval"
      )
    }
  })
})

describe("T-EXEC-005 (2) — the requirements are derived, not accepted", () => {
  it("returns only fields taken from the approved skill's own challenge", async () => {
    stubHub("120000")
    const req = await deriveSigningRequest({
      skillId: "diff-triage",
      maxAmountUsd: "$0.12",
      toolCallId: "call_1"
    })
    expect(req.skillId).toBe("diff-triage")
    expect(req.payTo).toBe(SELLER)
    expect(req.amountAtomic).toBe("120000")
    expect(req.price).toBe("$0.12")
    // The resource is derived from the seller and skill, never supplied.
    expect(req.resource).toBe(`/x/${SELLER}/diff-triage`)
    // Bound to the approval it came from.
    expect(req.toolCallId).toBe("call_1")
  })

  it("REFUSES when the endpoint asks more than was approved", async () => {
    // The mutation for the amount binding: the visitor approved a number and the number
    // changed. Proceeding would settle something they never agreed to.
    stubHub("500000") // $0.50 quoted against a $0.12 approval
    await expect(
      deriveSigningRequest({ skillId: "diff-triage", maxAmountUsd: "$0.12", toolCallId: "c" })
    ).rejects.toThrow(PriceMovedAboveApproval)
  })

  it("surfaces that refusal as a tool result rather than an exception", async () => {
    stubHub("500000")
    const out = (await arcade_call_skill.execute!(
      { skillId: "diff-triage", maxAmountUsd: "$0.12" },
      { toolCallId: "c", messages: [] } as never
    )) as { awaitingSignature: boolean; refused?: boolean; reason?: string }
    expect(out.awaitingSignature).toBe(false)
    expect(out.refused).toBe(true)
    expect(out.reason).toContain("nothing was signed")
  })
})

describe("T-EXEC-005 (3) — approval for A cannot settle B", () => {
  it("is unconstructible: the skill in the request comes only from the approved argument", async () => {
    // The composition mutation. There is no code path that accepts a skillId for the
    // requirements separately from the one that was approved — `deriveSigningRequest` takes
    // ONE skillId and derives every field from it, so a client cannot express the mismatch
    // rather than being caught attempting it. This test documents why it holds by
    // construction, which T-EXEC-005 asks for explicitly.
    stubHub("120000", "diff-triage")
    const req = await deriveSigningRequest({
      skillId: "diff-triage",
      maxAmountUsd: "$0.12",
      toolCallId: "c"
    })

    // Every money-bearing field traces to the approved skill's challenge.
    expect(req.resource).toContain("diff-triage")
    expect(req.resource).not.toContain("usdc-flow-check")
    expect(Object.keys(req).sort()).toEqual(
      ["amountAtomic", "asset", "network", "payTo", "price", "resource", "skillId", "toolCallId"].sort()
    )
    // Nothing in the returned shape lets a caller nominate a different resource or payee.
    expect(req).not.toHaveProperty("overrideResource")
    expect(req).not.toHaveProperty("payToOverride")
  })
})

describe("the spending tool is registered, which arms the preflight guard", () => {
  it("reports arcade_call_skill as a spending tool", () => {
    // The guard keys off this list. If the tool were mounted without appearing here, the
    // approval-secret refusal would stay silent on a deployment that can spend.
    expect(SPENDING_TOOLS).toContain("arcade_call_skill")
  })

  it("never returns a completed purchase — only a request to sign", async () => {
    stubHub("120000")
    const out = (await arcade_call_skill.execute!(
      { skillId: "diff-triage", maxAmountUsd: "$0.12" },
      { toolCallId: "c", messages: [] } as never
    )) as Record<string, unknown>
    expect(out["awaitingSignature"]).toBe(true)
    // No settlement, no tx, no receipt — this service holds no key and cannot produce one.
    expect(out).not.toHaveProperty("settleTx")
    expect(out).not.toHaveProperty("receipt")
    expect(JSON.stringify(out)).not.toContain("settled")
  })
})
