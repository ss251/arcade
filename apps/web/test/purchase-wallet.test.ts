import { afterEach, describe, expect, it, vi } from "vitest"
import { readPurchaseWallet } from "../src/lib/purchase-wallet.ts"
const buyer = `0x${"1".repeat(40)}`, network = "eip155:5042002"
const provider = () => ({ request: vi.fn(async ({ method }: { method: string }): Promise<unknown> => method === "eth_chainId" ? "0x4cef52" : [buyer]) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe("bounded wallet selection before confirmation", () => {
  it("reads the selected account/network without connecting, switching or signing", async () => {
    const p = provider(), result = await readPurchaseWallet(p, network)
    expect(result.buyer).toBe(buyer)
    expect(p.request.mock.calls.map(([a]) => a.method)).toEqual(["eth_chainId", "eth_accounts"])
    expect(Object.isFrozen(result)).toBe(true)
  })
  it.each([[], ["bad"], [`0x${"0".repeat(40)}`], buyer].map(accounts => ({ accounts })))("blocks missing/malformed accounts $accounts", async ({ accounts }) => {
    const p = provider(); p.request.mockImplementation(async ({ method }) => method === "eth_chainId" ? "0x4cef52" : accounts as never)
    await expect(readPurchaseWallet(p, network)).rejects.toThrow("Connect a wallet on the quoted network")
  })
  it("refuses the wrong chain without switching it", async () => {
    const p = provider(); p.request.mockResolvedValue("0x1")
    await expect(readPurchaseWallet(p, network)).rejects.toThrow("Connect a wallet on the quoted network")
    expect(p.request).toHaveBeenCalledTimes(1)
  })
  it("keeps unknown provider diagnostics private", async () => {
    const p = provider(); p.request.mockRejectedValue(Error("PRIVATE_WALLET"))
    await expect(readPurchaseWallet(p, network)).rejects.toThrow(/^Connect a wallet on the quoted network before approving\.$/)
  })
  it("bounds a permanently pending read and ignores its late completion", async () => {
    vi.useFakeTimers()
    const p = provider(); let release!: (v: string) => void
    p.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const run = expect(readPurchaseWallet(p, network)).rejects.toThrow("Connect a wallet")
    await vi.advanceTimersByTimeAsync(15000); await run
    release("0x4cef52"); await vi.advanceTimersByTimeAsync(0)
    expect(p.request).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
  it("pre-abort stops all wallet IO", async () => {
    const p = provider(), c = new AbortController(); c.abort()
    await expect(readPurchaseWallet(p, network, { signal: c.signal })).rejects.toThrow("Connect a wallet")
    expect(p.request).not.toHaveBeenCalled()
  })
  it("permits connection only for an explicit remedy and rechecks selection afterward", async () => {
    const p = provider()
    expect((await readPurchaseWallet(p, network, { connect: true })).buyer).toBe(buyer)
    expect(p.request.mock.calls.map(([a]) => a.method)).toEqual(["eth_requestAccounts", "eth_chainId", "eth_chainId", "eth_accounts"])
  })
  it("does not enter a late chain-switch step after a cancelled connection prompt", async () => {
    vi.useFakeTimers()
    const p = provider(), c = new AbortController(); let release!: (v: string[]) => void
    p.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const run = expect(readPurchaseWallet(p, network, { signal: c.signal, connect: true })).rejects.toThrow("Connect a wallet")
    // Let the action-local wallet helper load before cancelling its pending prompt.
    await vi.waitFor(() => expect(p.request).toHaveBeenCalledTimes(1))
    c.abort(); await run; release([buyer]); await vi.advanceTimersByTimeAsync(0)
    expect(p.request).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
  it("captures closed options without invoking getters or starting wallet IO", async () => {
    const p = provider(), getter = vi.fn(() => { throw Error("PRIVATE_OPTION") })
    for (const options of [null, { connect: "yes" }, { signal: {} }, { unexpected: true },
      Object.defineProperty({}, "signal", { enumerable: true, get: getter })]) {
      await expect(readPurchaseWallet(p, network, options as never)).rejects.toThrow(/^Connect a wallet on the quoted network before approving\.$/)
    }
    expect(getter).not.toHaveBeenCalled(); expect(p.request).not.toHaveBeenCalled()
  })
  it("refuses sparse or accessor account arrays without invoking wallet-supplied getters", async () => {
    const getter = vi.fn(() => buyer)
    const values = [new Array(1), Object.defineProperty([], "0", { enumerable: true, get: getter })]
    for (const accounts of values) {
      const p = provider(); p.request.mockImplementation(async ({ method }) => method === "eth_chainId" ? "0x4cef52" : accounts)
      await expect(readPurchaseWallet(p, network)).rejects.toThrow("Connect a wallet")
    }
    expect(getter).not.toHaveBeenCalled()
  })
})
