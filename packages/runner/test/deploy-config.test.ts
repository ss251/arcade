import { spawnSync } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import { loadChainConfig } from "@arcade/core"
import {
  deploymentConfig,
  loadDeploymentConfig,
  withCheckedDeploymentChain
} from "../../../scripts/deploy-config.ts"

const testnet = loadChainConfig("arc-testnet")

describe("splitter deployment configuration", () => {
  it("defaults to testnet and lets an explicit network override the environment", () => {
    expect(loadDeploymentConfig([], {}).config.id).toBe("arc-testnet")
    const selected = loadDeploymentConfig(["--v2", "--network", "arc-testnet"], {
      ARCADE_NETWORK: "arc-mainnet"
    })
    expect(selected.config.id).toBe("arc-testnet")
    expect(selected.useV2).toBe(true)
  })

  it.each([
    ["--network"],
    ["--network", ""],
    ["--network", "base"],
    ["--unknown"],
    ["arc-mainnet"]
  ])("refuses invalid arguments: %j", (...args) => {
    expect(() => loadDeploymentConfig(args, {})).toThrow()
  })

  it("honors the environment without a flag, including unknown and pending networks", () => {
    expect(() => loadDeploymentConfig([], { ARCADE_NETWORK: "base" })).toThrow(/unknown/)
    expect(() => loadDeploymentConfig([], { ARCADE_NETWORK: "arc-mainnet" })).toThrow(/pending/)
  })

  it("refuses pending mainnet in the real CLI before checking credentials or invoking forge", () => {
    const run = spawnSync("bun", ["run", "scripts/deploy-splitter.ts", "--v2", "--network", "arc-mainnet"], {
      cwd: new URL("../../..", import.meta.url),
      env: { PATH: process.env["PATH"] ?? "" },
      encoding: "utf8",
      timeout: 5_000
    })
    const output = `${run.stdout}${run.stderr}`
    expect(run.status).toBe(2)
    expect(output).toContain("pending")
    expect(output).not.toContain("DEPLOYER_KEY, SELLER and TREASURY are required")
    expect(output).not.toContain("forge build")
  })

  it("applies CLI selection before an invalid inherited network can load compatibility constants", () => {
    const run = spawnSync("bun", ["run", "scripts/deploy-splitter.ts", "--network", "arc-testnet"], {
      cwd: new URL("../../..", import.meta.url),
      env: { PATH: process.env["PATH"] ?? "", ARCADE_NETWORK: "unknown-network" },
      encoding: "utf8",
      timeout: 5_000
    })
    expect(run.status).toBe(2)
    expect(`${run.stdout}${run.stderr}`).toContain("DEPLOYER_KEY, SELLER and TREASURY are required")
  })

  it.each([
    { chainId: 0 },
    { caip2: "eip155:1" },
    { rpcHttp: [] },
    { rpcHttp: ["file:///tmp/rpc"] },
    { explorerBaseUrl: "" },
    { usdc: { ...testnet.usdc, address: `0x${"0".repeat(40)}` as `0x${string}` } }
  ])("refuses a ready manifest that still contains invalid deployment values: %j", (patch) => {
    expect(() => deploymentConfig({ ...testnet, ...patch })).toThrow()
  })

  it("uses one selected config for chain, token, RPC and explorer, including an explicit RPC override", () => {
    const synthetic = {
      ...testnet,
      id: "arc-mainnet" as const,
      chainId: 42,
      caip2: "eip155:42",
      rpcHttp: ["https://rpc.example.test"],
      explorerBaseUrl: "https://explorer.example.test/",
      usdc: { ...testnet.usdc, address: `0x${"12".repeat(20)}` as `0x${string}` }
    }
    const selected = deploymentConfig(synthetic)
    expect(selected.chain.id).toBe(42)
    expect(selected.config.usdc.address).toBe(synthetic.usdc.address)
    expect(selected.rpcUrl).toBe("https://rpc.example.test")
    expect(selected.explorerTxUrl("0xabc")).toBe("https://explorer.example.test/tx/0xabc")
    expect(selected.explorerAddressUrl("0xdef")).toBe("https://explorer.example.test/address/0xdef")
    expect(deploymentConfig(synthetic, "http://127.0.0.1:8899").rpcUrl).toBe("http://127.0.0.1:8899")
    expect(() => deploymentConfig(synthetic, "")).toThrow(/RPC/)
  })

  it("refuses an RPC for a different chain before calling deploy, even with an explicit override", async () => {
    const selected = deploymentConfig(testnet, "http://127.0.0.1:8899")
    const deploy = vi.fn(async () => "0xtx")
    await expect(withCheckedDeploymentChain(selected.config, { getChainId: async () => 1 }, deploy))
      .rejects.toThrow(/expected 5042002.*received 1/)
    expect(deploy).not.toHaveBeenCalled()
  })

  it("refuses pending configuration without calling either the RPC or deployment callback", async () => {
    const rpc = { getChainId: vi.fn(async () => 0) }
    const deploy = vi.fn(async () => "0xtx")
    await expect(withCheckedDeploymentChain(loadChainConfig("arc-mainnet"), rpc, deploy))
      .rejects.toThrow(/pending/)
    expect(rpc.getChainId).not.toHaveBeenCalled()
    expect(deploy).not.toHaveBeenCalled()
  })

  it("deploys only after the RPC confirms the configured chain", async () => {
    const order: string[] = []
    const result = await withCheckedDeploymentChain(testnet, {
      getChainId: async () => { order.push("chainId"); return testnet.chainId }
    }, async () => { order.push("deploy"); return "0xtx" })
    expect(order).toEqual(["chainId", "deploy"])
    expect(result).toBe("0xtx")
  })
})
