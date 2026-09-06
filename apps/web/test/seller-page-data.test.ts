import { describe, expect, it, vi } from "vitest"
import { loadSellerPage, sellerSearch } from "../src/lib/seller-page-data.ts"
import { SELLER, NOW, sellerFixture } from "./fixtures/seller-data.ts"

describe("public seller boundary", () => {
  it.each([null, [], {}, { address: 2 }, { address: `0x${"0".repeat(40)}` }, { address: SELLER, token: "PRIVATE" }])("rejects malformed closed input before IO", async input => {
    const read = vi.fn(); expect(await loadSellerPage(input, read, () => NOW)).toMatchObject({ state: "invalid", summary: null })
    expect(read).not.toHaveBeenCalled()
  })
  it("distinguishes missing selection without requesting a summary", async () => {
    const read = vi.fn(); expect(await loadSellerPage({ address: "" }, read, () => NOW)).toMatchObject({ state: "missing" })
    expect(read).not.toHaveBeenCalled()
  })
  it.each(["normal", "negative", "unknown-cost", "unknown-spend", "empty", "historical", "zero"] as const)("preserves actual H2/H4 $mode accounting", async mode => {
    const fixture = sellerFixture(mode), read = vi.fn(async () => fixture)
    const result = await loadSellerPage({ address: SELLER }, read, () => NOW)
    expect(result).toEqual({ state: "ready", address: SELLER, summary: fixture, observedAtMs: NOW })
    expect(read).toHaveBeenCalledExactlyOnceWith(SELLER)
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|job-root|job-failed/)
  })
  it("projects known scalars without touching unknown accessors or serialization hooks", async () => {
    const fixture = sellerFixture(), unknown = vi.fn(() => { throw Error("PRIVATE") })
    Object.defineProperty(fixture, "token", { enumerable: true, get: unknown })
    Object.defineProperty(fixture.listings[0]!, "toJSON", { enumerable: true, get: unknown })
    const result = await loadSellerPage({ address: SELLER }, async () => fixture, () => NOW)
    expect(result.state).toBe("ready"); expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(unknown).not.toHaveBeenCalled()
  })
  it.each([{ seller: `0x${"5".repeat(40)}` }, { margin: "$999" }, { inferenceCostComplete: false }, { listings: new Array(1025) }])("refuses inconsistent or oversized public DTOs", async changed => {
    const result = await loadSellerPage({ address: SELLER }, async () => ({ ...sellerFixture(), ...changed }), () => NOW)
    expect(result).toMatchObject({ state: "unavailable", summary: null })
  })
  it("does not invoke request getters or stringify hostile errors", async () => {
    const getter = vi.fn(() => SELLER), read = vi.fn()
    expect((await loadSellerPage(Object.defineProperty({}, "address", { get: getter }), read)).state).toBe("invalid")
    expect(getter).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled()
    const error = Object.defineProperty({}, "message", { get: getter })
    const result = await loadSellerPage({ address: SELLER }, async () => { throw error }, () => NOW)
    expect(result).toMatchObject({ state: "unavailable", address: SELLER, summary: null }); expect(getter).not.toHaveBeenCalled()
  })
  it("copies public search selection without coercion or unknown-field reads", () => {
    const getter = vi.fn()
    expect(sellerSearch({ address: SELLER, irrelevant: "PRIVATE" })).toEqual({ address: SELLER })
    expect(sellerSearch({})).toEqual({ address: "" })
    expect(sellerSearch({ address: [SELLER] })).toEqual({ address: "invalid" })
    expect(sellerSearch(Object.defineProperty({}, "address", { get: getter }))).toEqual({ address: "invalid" })
    expect(getter).not.toHaveBeenCalled()
  })
})
