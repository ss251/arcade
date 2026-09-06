import { describe, expect, it, vi } from "vitest"
import { capturePurchaseTarget } from "../src/lib/purchase-target.ts"

describe("original purchase target capture", () => {
  it("retains exactly one own bounded target and freezes the scalar copy", () => {
    const raw = { name: "diff-triage.seller.arcade.eth", input: "{}" }
    const out = capturePurchaseTarget(raw)
    raw.name = "changed.eth"
    expect(out).toEqual({ name: "diff-triage.seller.arcade.eth" })
    expect(Object.isFrozen(out)).toBe(true)
    expect(capturePurchaseTarget({ skillId: "diff-triage" })).toEqual({ skillId: "diff-triage" })
    expect(capturePurchaseTarget(Object.assign(Object.create(null), { name: "x.eth" }))).toEqual({ name: "x.eth" })
  })
  it.each([null, [], "diff-triage", {}, { skillId: "diff-triage", name: undefined },
    { name: "x.eth", skillId: undefined }, { name: undefined }, { name: "x.".repeat(127) + "eth" },
    { name: "x.eth\n" }, { skillId: "diff-triage\n" }, { skillId: "x".repeat(65) }])("refuses ambiguous or invalid targets %j", value => {
    expect(capturePurchaseTarget(value)).toBeUndefined()
  })
  it("never invokes getters or accepts inherited/non-enumerable targets", () => {
    const get = vi.fn(() => "x.eth")
    expect(capturePurchaseTarget(Object.defineProperty({}, "name", { enumerable: true, get }))).toBeUndefined()
    expect(capturePurchaseTarget(Object.create({ name: "x.eth" }))).toBeUndefined()
    expect(capturePurchaseTarget(Object.defineProperty({}, "name", { value: "x.eth" }))).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
  })
})
