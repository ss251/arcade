import { describe, expect, it, vi } from "vitest"
import { loadChainConfig } from "@arcade/core"
import { chainCheck, chainMetadataCheck, chainStartupRefusal, type ChainRpc } from "../src/chain-check.ts"

const cfg = loadChainConfig("arc-testnet")
const FACILITATOR = "0x1111111111111111111111111111111111111111"
const good: ChainRpc = {
  chainId: async () => 5042002,
  read: async (fn) => ({ name: "USDC", version: "2", decimals: 6 })[fn],
  balanceOf: async () => 1n
}

describe("chainStartupRefusal", () => {
  it("refuses pending config with actionable instructions before considering its rail", () => {
    const refusal = chainStartupRefusal(loadChainConfig("arc-mainnet"), "gateway")
    expect(refusal).toContain("pending")
    expect(refusal).toContain("config/chains/arc-mainnet.json")
    expect(refusal).toContain("docs/mainnet-runbook.md")
  })

  it("refuses Gateway on a ready network without Gateway configuration", () => {
    expect(chainStartupRefusal({ ...cfg, gateway: null }, "gateway"))
      .toBe("Gateway is not available on this network")
  })

  it("allows configured Gateway and does not require Gateway for other rails", () => {
    expect(chainStartupRefusal(cfg, "gateway")).toBeUndefined()
    expect(chainStartupRefusal({ ...cfg, gateway: null }, "eip3009")).toBeUndefined()
    expect(chainStartupRefusal({ ...cfg, gateway: null }, "test")).toBeUndefined()
  })
})

describe("chainCheck", () => {
  it("passes matching chain, USDC domain, ERC-20 decimals and funded facilitator", async () => {
    const balanceOf = vi.fn(good.balanceOf)
    expect(await chainCheck(cfg, { ...good, balanceOf }, FACILITATOR)).toEqual({ ok: true, findings: [] })
    expect(balanceOf).toHaveBeenCalledWith(FACILITATOR)
  })

  it("accepts bigint ERC-20 decimals returned by an RPC adapter", async () => {
    const rpc = { ...good, read: async (fn: "name" | "version" | "decimals") => fn === "decimals" ? 6n : good.read(fn) }
    expect((await chainCheck(cfg, rpc, FACILITATOR)).ok).toBe(true)
  })

  it("fails a chain id mismatch", async () => {
    const result = await chainCheck(cfg, { ...good, chainId: async () => 1 }, FACILITATOR)
    expect(result.ok).toBe(false)
    expect(result.findings).toEqual(["chainId: rpc reports 1, config says 5042002"])
  })

  it.each([
    ["name", "other USDC"],
    ["version", "1"],
    ["decimals", 18]
  ] as const)("fails mismatching USDC %s", async (field, value) => {
    const result = await chainCheck(cfg, { ...good, read: async (fn) => fn === field ? value : good.read(fn) }, FACILITATOR)
    expect(result.ok).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toContain(`usdc ${field}`)
  })

  it("fails an unfunded facilitator and identifies the checked wallet", async () => {
    const result = await chainCheck(cfg, { ...good, balanceOf: async () => 0n }, FACILITATOR)
    expect(result.ok).toBe(false)
    expect(result.findings).toEqual([`facilitator ${FACILITATOR} has no USDC for gas`])
  })

  it("reports all mismatches so one correction does not conceal the others", async () => {
    const result = await chainCheck(cfg, {
      chainId: async () => 1,
      read: async () => "wrong",
      balanceOf: async () => 0n
    }, FACILITATOR)
    expect(result.ok).toBe(false)
    expect(result.findings).toHaveLength(5)
  })

  it("returns findings for every failed RPC instead of throwing or reporting success", async () => {
    const failure = async (): Promise<never> => { throw new Error("transport unavailable") }
    const result = await chainCheck(cfg, { chainId: failure, read: failure, balanceOf: failure }, FACILITATOR)
    expect(result.ok).toBe(false)
    expect(result.findings).toHaveLength(5)
    for (const finding of result.findings) expect(finding).toContain("RPC failed")
  })

  it("refuses a pending network before making any RPC request", async () => {
    const rpc = {
      chainId: vi.fn(good.chainId),
      read: vi.fn(good.read),
      balanceOf: vi.fn(good.balanceOf)
    }
    const result = await chainCheck(loadChainConfig("arc-mainnet"), rpc, FACILITATOR)
    expect(result.ok).toBe(false)
    expect(result.findings.join()).toContain("pending")
    expect(result.findings.join()).toContain("config/chains/arc-mainnet.json")
    expect(rpc.chainId).not.toHaveBeenCalled()
    expect(rpc.read).not.toHaveBeenCalled()
    expect(rpc.balanceOf).not.toHaveBeenCalled()
  })
})

describe("chainMetadataCheck", () => {
  it("verifies Gateway chain and USDC metadata without querying a local gas wallet", async () => {
    const rpc = {
      chainId: vi.fn(good.chainId),
      read: vi.fn(good.read),
      balanceOf: vi.fn(async () => { throw new Error("Gateway has no local facilitator") })
    }
    expect(await chainMetadataCheck(cfg, rpc)).toEqual({ ok: true, findings: [] })
    expect(rpc.chainId).toHaveBeenCalledOnce()
    expect(rpc.read.mock.calls).toEqual([["name"], ["version"], ["decimals"]])
    expect(rpc.balanceOf).not.toHaveBeenCalled()
  })

  it("retains every metadata failure without inventing a funding result", async () => {
    const failure = async (): Promise<never> => { throw new Error("unavailable") }
    const result = await chainMetadataCheck(cfg, { chainId: failure, read: failure })
    expect(result.ok).toBe(false)
    expect(result.findings).toHaveLength(4)
    expect(result.findings.join()).not.toContain("facilitator")
  })

  it("refuses pending configuration before metadata RPCs", async () => {
    const rpc = { chainId: vi.fn(good.chainId), read: vi.fn(good.read) }
    const result = await chainMetadataCheck(loadChainConfig("arc-mainnet"), rpc)
    expect(result.ok).toBe(false)
    expect(result.findings.join()).toContain("pending")
    expect(rpc.chainId).not.toHaveBeenCalled()
    expect(rpc.read).not.toHaveBeenCalled()
  })
})
