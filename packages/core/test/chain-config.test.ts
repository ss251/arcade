import { afterEach, describe, expect, it, vi } from "vitest"
import { loadChainConfig, toViemChain } from "../src/chain-config.ts"

afterEach(() => vi.unstubAllEnvs())

describe("chain config", () => {
  it("testnet is ready with the known constants", () => {
    const c = loadChainConfig("arc-testnet")
    expect(c.status).toBe("ready")
    expect(c.chainId).toBe(5042002)
    expect(c.usdc.address).toBe("0x3600000000000000000000000000000000000000")
    expect(c.rpcHttp).toEqual(["https://rpc.testnet.arc.io", "https://rpc.testnet.arc.network"])
    expect(c.erc8004?.identity).toBe("0x8004A818BFB912233c491871b3d84c89A494BD9e")
  })

  it("mainnet is pending with no usable RPC or Gateway", () => {
    const c = loadChainConfig("arc-mainnet")
    expect(c.status).toBe("pending")
    expect(c.rpcHttp).toEqual([])
    expect(c.gateway).toBeNull()
  })

  it("unknown networks throw, including object prototype names", () => {
    for (const name of ["base", "toString", "__proto__"]) {
      expect(() => loadChainConfig(name as never)).toThrow(/unknown ARCADE_NETWORK/)
    }
  })

  it("selects ARCADE_NETWORK when set and testnet by default", () => {
    vi.stubEnv("ARCADE_NETWORK", undefined)
    expect(loadChainConfig().id).toBe("arc-testnet")
    vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    expect(loadChainConfig().id).toBe("arc-mainnet")
  })

  it("loads without a Node process global and respects the browser build selector", () => {
    let fallback: string
    let selected: string
    try {
      vi.stubGlobal("process", undefined)
      fallback = loadChainConfig().id
      vi.stubGlobal("__ARCADE_NETWORK__", "arc-mainnet")
      selected = loadChainConfig().id
    } finally {
      vi.unstubAllGlobals()
    }
    expect(fallback!).toBe("arc-testnet")
    expect(selected!).toBe("arc-mainnet")
  })

  it("builds wallet metadata with native decimals and both RPCs", () => {
    const cfg = loadChainConfig("arc-testnet")
    expect(toViemChain(cfg)).toEqual({
      id: 5042002, name: "arc-testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: cfg.rpcHttp } },
      blockExplorers: { default: { name: "Arcscan", url: cfg.explorerBaseUrl } }
    })
  })
})
