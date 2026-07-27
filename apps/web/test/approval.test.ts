import { describe, expect, it } from "vitest"
import { decide, hardCeilingAtomic } from "../src/lib/approval.ts"

/**
 * The approval policy, tested from the DENY side first.
 *
 * A suite that only walks the approve path passes identically whether the gate is wired or
 * missing — that is the vacuous-gate shape, and on this edge it would be vacuous about
 * money. So the tests that carry weight here are the ones where the policy refuses or
 * escalates, and the auto-approve case is the narrow exception that has to justify itself.
 *
 * Note what is NOT covered: this is policy in isolation. That a denied approval actually
 * BLOCKS a purchase is a property of the wiring, and needs the tool to exist —
 * `docs/threat-model.md` T-EXEC-005 records it as required before the edge ships.
 */

const ENV = { ARCADE_MAX_CALL_USD: "$1.00" }

describe("approval policy — the deny and escalate paths", () => {
  it("escalates a normal priced purchase to the visitor", () => {
    expect(decide({ skillId: "diff-triage", maxAmountUsd: "$0.12" }, ENV)).toBe("user-approval")
  })

  it("escalates a sub-cent purchase — small is not the same as free", () => {
    // $0.0005 is a real spend on a marketplace whose argument is that sub-cent payments are
    // the point. Auto-approving "small" amounts would quietly pick a threshold nobody chose.
    expect(decide({ skillId: "s", maxAmountUsd: "$0.0005" }, ENV)).toBe("user-approval")
  })

  it("denies a purchase above the configured ceiling rather than asking", () => {
    // Showing a card for something the system has already decided it will not do would make
    // the ceiling advisory, and would teach the visitor that the card is a formality.
    expect(decide({ skillId: "s", maxAmountUsd: "$1.01" }, ENV)).toBe("denied")
    expect(decide({ skillId: "s", maxAmountUsd: "$999" }, ENV)).toBe("denied")
  })

  it("asks on a negative amount rather than inventing a verdict", () => {
    // `parsePrice` rejects negatives, so this lands in the unparseable branch — which asks.
    // Worth pinning: the safe answer to a nonsensical price is the visitor, not a decision.
    expect(decide({ skillId: "s", maxAmountUsd: "-$1" }, ENV)).toBe("user-approval")
  })

  it("asks when it cannot tell what the call costs", () => {
    // The default must be to ask. A policy that fell through to "approved" on a shape it
    // failed to parse would be a gate that opens when confused — and confusing input is
    // exactly what an injected seller description would try to produce.
    for (const args of [
      {},
      { skillId: "s" },
      { skillId: "s", maxAmountUsd: null },
      { skillId: "s", maxAmountUsd: {} },
      { skillId: "s", maxAmountUsd: "not-money" },
      { skillId: "", maxAmountUsd: "$0.12" },
      { skillId: 42, maxAmountUsd: "$0.12" }
    ]) {
      expect(decide(args, ENV), JSON.stringify(args)).toBe("user-approval")
    }
  })

  it("never returns approved for anything that costs money", () => {
    // The general form of the property, over the whole shape space above.
    const priced = ["$0.000001", "$0.01", "$0.99", "$1.00"]
    for (const p of priced) {
      expect(decide({ skillId: "s", maxAmountUsd: p }, ENV)).not.toBe("approved")
    }
  })

  it("NEVER auto-approves — there is no free purchase to auto-approve", () => {
    // The first draft had an auto-approve branch for zero-cost calls. `parsePrice` rejects
    // $0 (the floor is $0.000001), so a free purchase cannot be expressed in this system and
    // the branch guarded a case that cannot occur. An unreachable path in a money gate is
    // worse than no path: it implies an approval route that does not exist.
    for (const amount of ["$0", "$0.00", 0, "$0.000001", "$1.00"]) {
      expect(decide({ skillId: "s", maxAmountUsd: amount }, ENV)).not.toBe("approved")
    }
  })

  it("reads the ceiling from the same variable the MCP server uses", () => {
    // One name for one limit across both buyer front-ends.
    expect(hardCeilingAtomic({ ARCADE_MAX_CALL_USD: "$0.50" })).toBe(500_000n)
    expect(hardCeilingAtomic({})).toBe(1_000_000n)
  })

  it("respects a lowered ceiling", () => {
    const tight = { ARCADE_MAX_CALL_USD: "$0.10" }
    expect(decide({ skillId: "s", maxAmountUsd: "$0.12" }, tight)).toBe("denied")
    expect(decide({ skillId: "s", maxAmountUsd: "$0.09" }, tight)).toBe("user-approval")
  })
})
