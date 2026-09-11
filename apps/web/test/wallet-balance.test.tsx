import { afterEach, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { loadChainConfig } from "../../../packages/core/src/chain-config.ts"
import { formatWalletUsdc, readWalletBalance } from "../src/lib/wallet-balance.ts"
import { WalletOverview } from "../src/components/wallet-overview.tsx"
import type { Eip1193Provider } from "../src/lib/wallet.ts"

const buyer = `0x${"1".repeat(40)}`, other = `0x${"2".repeat(40)}`, cfg = loadChainConfig()
const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`
const fixture = () => {
  const listeners = new Map<string, Set<() => void>>()
  const wallet = {
    request: vi.fn(async ({ method }: Parameters<Eip1193Provider["request"]>[0]): Promise<unknown> => {
      if (method === "eth_chainId") return `0x${cfg.chainId.toString(16)}`
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [buyer]
      if (method === "eth_call") return word(12_345_678n)
      throw Error("Unexpected wallet method")
    }),
    on: (event: string, listener: () => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener) },
    removeListener: (event: string, listener: () => void) => { listeners.get(event)?.delete(listener) }
  }
  return { wallet, listeners, emit: (event: string) => { for (const listener of listeners.get(event) ?? []) listener() } }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it("reads the configured ERC-20 six-decimal balance and rechecks account and chain", async () => {
  const { wallet, listeners } = fixture(), result = await readWalletBalance(wallet)
  expect(result.atomic).toBe("12345678"); expect(formatWalletUsdc(result.atomic)).toBe("12.345678")
  expect(result.buyer).toBe(buyer); expect(result.token).toBe(cfg.usdc.address)
  expect(wallet.request.mock.calls.map(([call]) => call.method)).toEqual(["eth_chainId", "eth_accounts", "eth_call", "eth_chainId", "eth_accounts"])
  expect(wallet.request.mock.calls[2]![0].params).toEqual([{ to: cfg.usdc.address, data: `0x70a08231${buyer.slice(2).padStart(64, "0")}` }, "latest"])
  expect([...listeners.values()].every(set => set.size === 0)).toBe(true)
  expect(formatWalletUsdc("0")).toBe("0"); expect(formatWalletUsdc("1")).toBe("0.000001")
  expect(Object.isFrozen(result)).toBe(true)
})

it("connects only when explicitly requested and never signs or reads native balance", async () => {
  const { wallet } = fixture(); await readWalletBalance(wallet, { connect: true })
  expect(wallet.request.mock.calls[0]![0].method).toBe("eth_requestAccounts")
  expect(wallet.request.mock.calls.map(([call]) => call.method).join(" ")).not.toMatch(/sign|eth_send|eth_getBalance/)
})

it.each(["0x", "0x1", word(1n) + "00", "PRIVATE_PROVIDER_DATA"])("rejects malformed ABI balance %s", async value => {
  const { wallet } = fixture(), normal = wallet.request.getMockImplementation()!
  wallet.request.mockImplementation(args => args.method === "eth_call" ? Promise.resolve(value) : normal(args))
  await expect(readWalletBalance(wallet)).rejects.toThrow("balance could not be verified")
})

it("rejects an account or chain change surrounding the balance read", async () => {
  for (const change of ["account", "chain"]) {
    const { wallet } = fixture(), normal = wallet.request.getMockImplementation()!
    let read = false
    wallet.request.mockImplementation(args => {
      if (read && args.method === "eth_accounts" && change === "account") return Promise.resolve([other])
      if (read && args.method === "eth_chainId" && change === "chain") return Promise.resolve("0x1")
      if (args.method === "eth_call") read = true
      return normal(args)
    })
    await expect(readWalletBalance(wallet)).rejects.toThrow("balance could not be verified")
  }
})

it("invalidates an in-flight read on a wallet event and removes its listeners", async () => {
  const { wallet, emit, listeners } = fixture(), normal = wallet.request.getMockImplementation()!
  wallet.request.mockImplementation(args => {
    if (args.method === "eth_call") { emit("accountsChanged"); return Promise.resolve(word(10n)) }
    return normal(args)
  })
  await expect(readWalletBalance(wallet)).rejects.toThrow("balance could not be verified")
  expect([...listeners.values()].every(set => set.size === 0)).toBe(true)
})

it("bounds a pending read and ignores late completion without another request", async () => {
  vi.useFakeTimers()
  const { wallet } = fixture(), normal = wallet.request.getMockImplementation()!
  let release!: (value: string) => void
  wallet.request.mockImplementation(args => args.method === "eth_call" ? new Promise(resolve => { release = resolve }) : normal(args))
  const result = expect(readWalletBalance(wallet)).rejects.toThrow("balance could not be verified")
  await vi.waitFor(() => expect(release).toBeTypeOf("function"))
  await vi.advanceTimersByTimeAsync(15000); await result
  release(word(123n)); await vi.advanceTimersByTimeAsync(0)
  expect(wallet.request).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0)
})

it("does no IO on a canceled operation, SSR, or an unopened wallet overview", async () => {
  const { wallet } = fixture(), controller = new AbortController(); controller.abort()
  await expect(readWalletBalance(wallet, { signal: controller.signal })).rejects.toThrow("balance could not be verified")
  vi.stubGlobal("ethereum", wallet)
  const html = renderToStaticMarkup(<WalletOverview />)
  expect(html).toContain("Connect and view balance"); expect(html).toContain("No signature or payment")
  expect(wallet.request).not.toHaveBeenCalled()
})


it("rejects malformed read options without invoking accessors or starting wallet IO", async () => {
  const { wallet } = fixture(), getter = vi.fn(() => true)
  for (const options of [null, { connect: "yes" }, { signal: {} }, { unexpected: true },
    Object.defineProperty({}, "connect", { enumerable: true, get: getter })]) {
    await expect(readWalletBalance(wallet, options as never)).rejects.toThrow("balance could not be verified")
  }
  expect(getter).not.toHaveBeenCalled(); expect(wallet.request).not.toHaveBeenCalled()
})
