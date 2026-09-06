import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { generatePrivateKey } from "viem/accounts"
import { loadChainConfig, type ListingRail } from "@arcade/core"
import type { CallSkillArgs } from "../src/index.ts"

const hub = "https://multi-hub.example", seller = `0x${"a".repeat(40)}`, chain = loadChainConfig()
const endpoint = `${hub}/x/${seller}/flow`, price = "10000"
let m: typeof import("../src/mcp.ts"), accepts: unknown[], requests: string[]
const exact = () => ({ scheme: "exact", network: chain.caip2, asset: chain.usdc.address, payTo: seller, resource: endpoint,
  amount: price, maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" } })
const gateway = () => ({ ...exact(), extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway!.wallet } })
const result = (rail: "gateway" | "eip3009" = "eip3009") => ({ jobId: "job_multi", status: "succeeded", result: { ok: true },
  receipt: { settled: true, price: "$0.01" }, authorizedAmountAtomic: 10000n, authorizedRail: rail, fencedResult: "<<<UNTRUSTED:fixture>>>ok<<</UNTRUSTED:fixture>>>" })
beforeEach(async () => {
  vi.stubEnv("ARCADE_HUB", hub); vi.stubEnv("ARCADE_NETWORK", "arc-testnet"); vi.stubEnv("ARCADE_BUYER_KEY", generatePrivateKey())
  vi.stubEnv("ARCADE_MAX_CALL_USD", "$0.50"); vi.stubEnv("ARCADE_SESSION_BUDGET_USD", "$1.00")
  accepts = [gateway(), exact(), { scheme: "future" }]; requests = []
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
    requests.push(String(url))
    if (String(url) === `${hub}/listings`) return Response.json([{ id: "flow", serviceName: "Flow", price: "$0.01", seller }])
    if (String(url) !== endpoint) throw Error("Unexpected transport")
    return Response.json({ x402Version: 2, accepts }, { status: 402 })
  }))
  m = await import("../src/mcp.ts"); m.__resetBudget(); m.__setCallSkill(() => Effect.succeed(result()))
})
afterEach(() => { m?.__resetBudget(); m?.__setCallSkill(undefined); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe("MCP multi-rail quote and selection", () => {
  it("advertises the same optional rail constraint that it validates", () => {
    const tool = m.TOOLS.find(t => t.name === "arcade_call_skill")!
    expect(tool.inputSchema.properties).toHaveProperty("rail")
    expect(JSON.stringify(tool.inputSchema.properties?.rail)).toContain("erc8183")
  })
  it.each(["gateway", "eip3009"] as const)("passes explicit %s into quote and SDK without balance/key-policy side effects", async rail => {
    const call = vi.fn((_args: CallSkillArgs) => Effect.succeed(result(rail))); m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", { skillId: "flow", input: {}, rail })
    expect(out.isError).not.toBe(true)
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ preferRail: [rail], maxAmountAtomic: 10000n }))
    expect(out.structuredContent).toMatchObject({ authorizedRail: rail })
    expect(requests).toEqual([`${hub}/listings`, endpoint])
  })
  it("reserves the maximum offered eligible quote without claiming Gateway funding", async () => {
    accepts = [{ ...gateway(), amount: "20000" }, exact()]
    const call = vi.fn((_args: CallSkillArgs) => Effect.succeed(result())); m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", { skillId: "flow", input: {} })
    expect(out.isError).not.toBe(true)
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ maxAmountAtomic: 20000n }))
    expect(requests).toHaveLength(2)
  })
  it.each(["unknown", "test", "GATEWAY", ["gateway"], null].map(rail => ({ rail })))("rejects invalid explicit rail %# before any IO or key", async ({ rail }) => {
    vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_INVALID")
    const call = vi.fn((_args: CallSkillArgs) => Effect.succeed(result())); m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", { skillId: "flow", input: {}, rail })
    expect(out.isError).toBe(true); expect(call).not.toHaveBeenCalled(); expect(requests).toHaveLength(0)
    expect(JSON.stringify(out)).not.toContain("PRIVATE_INVALID")
  })
  it("does not promote escrow into an exact payment while its lifecycle is unavailable", async () => {
    accepts = [{ ...exact(), scheme: "erc8183" }]
    vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_INVALID")
    const call = vi.fn((_args: CallSkillArgs) => Effect.succeed(result())); m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", { skillId: "flow", input: {}, rail: "erc8183" satisfies ListingRail })
    expect(out.isError).toBe(true); expect(call).not.toHaveBeenCalled(); expect(JSON.stringify(out)).not.toContain("PRIVATE_INVALID")
  })
})
