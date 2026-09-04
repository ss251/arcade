import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe("pending browser network", () => {
  it("blocks a purchase even when the wallet chain could not be read", async () => {
    vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    vi.resetModules()
    const { walletBlocker } = await import("../src/lib/wallet.ts")
    expect(walletBlocker(true, undefined)).toMatch(/pending/)
  })

  it("refuses direct signing before asking the wallet", async () => {
    vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    vi.resetModules()
    const { signPayment } = await import("../src/lib/sign.ts")
    const provider = { request: vi.fn(async () => "0xsigned") }
    await expect(signPayment(provider, {
      from: `0x${"a".repeat(40)}`, payTo: `0x${"b".repeat(40)}`, amountAtomic: "10000"
    })).rejects.toThrow(/pending/)
    expect(provider.request).not.toHaveBeenCalled()
  })
})
