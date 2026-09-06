import { afterEach, describe, expect, it, vi } from "vitest"
import { requestSellerAddress } from "../src/lib/seller-address.ts"
const ADDRESS = `0x${"3".repeat(40)}`
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe("optional public wallet address selection", () => {
  it("requests accounts once, never chain switches or signing", async () => {
    const request = vi.fn(async () => [ADDRESS])
    expect(await requestSellerAddress({ request })).toBe(ADDRESS)
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: "eth_requestAccounts" })
  })
  it.each([undefined, null, [], ["0x"], [`0x${"0".repeat(40)}`], new Array(33).fill(ADDRESS), new Array(1)])("refuses malformed provider output without coercion", async output => {
    expect(await requestSellerAddress({ request: async () => output })).toBeNull()
  })
  it("contains rejected and getter-bearing responses", async () => {
    const getter = vi.fn(() => ADDRESS), accounts: string[] = []
    Object.defineProperty(accounts, "0", { get: getter })
    expect(await requestSellerAddress({ request: async () => accounts })).toBeNull(); expect(getter).not.toHaveBeenCalled()
    expect(await requestSellerAddress({ request: async () => { throw Error("PRIVATE") } })).toBeNull()
  })
  it("honors pre-abort before IO and ignores late completion after abort", async () => {
    const c = new AbortController(), request = vi.fn(async () => [ADDRESS]); c.abort()
    expect(await requestSellerAddress({ request }, c.signal)).toBeNull(); expect(request).not.toHaveBeenCalled()
    let release!: (v: string[]) => void; const d = new AbortController()
    const pending = requestSellerAddress({ request: () => new Promise(r => { release = r }) }, d.signal)
    d.abort(); expect(await pending).toBeNull(); release([ADDRESS])
  })
  it("bounds an uncooperative provider and removes its timer", async () => {
    vi.useFakeTimers(); const pending = requestSellerAddress({ request: () => new Promise(() => {}) })
    await vi.advanceTimersByTimeAsync(15000); expect(await pending).toBeNull(); expect(vi.getTimerCount()).toBe(0)
  })
})
