import { describe, expect, it } from "vitest"
import { callSkillPromise, resolveEnsListingPromise, EnsNameExpired, EnsResolutionUnavailable } from "../src/index.ts"
import type { Account } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ARC_CAIP2, USDC_ADDRESS } from "@arcade/core"

describe("typed buyer Promise boundary for dependency-isolated callers", () => {
  it("preserves actual SDK success, locally authorized amount and seller-fenced result", async () => {
    const seller = `0x${"11".repeat(20)}`, endpoint = `https://hub.example/x/${seller}/flow`, payTo = `0x${"22".repeat(20)}`
    const calls: Request[] = [], account = privateKeyToAccount(`0x${"01".repeat(32)}`)
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(String(url), init); calls.push(req)
      if (req.method === "GET") return Response.json({ job_id: "job_test", status: "succeeded", result: { ok: true }, receipt: { settled: true }, authorizedAmountAtomic: "1" })
      if (req.headers.has("payment-signature")) return Response.json({ job_id: "job_test", poll_url: `https://hub.example/jobs/job_test/result?token=${"ab".repeat(16)}` }, { status: 202 })
      return Response.json({ x402Version: 2, accepts: [{ scheme: "exact", network: ARC_CAIP2, amount: "10000", asset: USDC_ADDRESS, payTo, resource: endpoint, maxTimeoutSeconds: 604900 }] }, { status: 402 })
    }) as typeof fetch
    const out = await callSkillPromise({ hubUrl: "https://hub.example", seller, skillId: "flow", input: {}, account, fetch: fetcher, pollIntervalMs: 1, maxWaitMs: 100 })
    expect(out).toMatchObject({ jobId: "job_test", result: { ok: true }, authorizedAmountAtomic: 10000n })
    expect(out.fencedResult).toContain(seller); expect(calls).toHaveLength(3)
  })
  it("returns the resolved public listing without requiring callers to import Effect", async () => {
    const records: Record<string, string> = { "arcade.endpoint": `https://hub.example/x/0x${"11".repeat(20)}/flow`,
      "arcade.payTo": `0x${"22".repeat(20)}`, "arcade.chain": "eip155:5042002", "arcade.priceAtomic": "10000" }
    expect(await resolveEnsListingPromise({ getEnsText: async ({ key }) => records[key] ?? null }, "flow.seller.arcade.eth"))
      .toMatchObject({ name: "flow.seller.arcade.eth", priceAtomic: 10000n })
  })
  it("throws the original typed resolution errors, not a FiberFailure wrapper", async () => {
    await expect(resolveEnsListingPromise({ getEnsText: async () => null }, "flow.seller.arcade.eth")).rejects.toBeInstanceOf(EnsNameExpired)
    await expect(resolveEnsListingPromise({ getEnsText: async () => { throw Error("PRIVATE_RPC") } }, "flow.seller.arcade.eth")).rejects.toBeInstanceOf(EnsResolutionUnavailable)
  })
  it("runs the actual buyer and preserves its typed pre-sign failure without invoking an account", async () => {
    const account = { address: `0x${"11".repeat(20)}`, type: "json-rpc" } as Account
    await expect(callSkillPromise({ name: "flow.seller.arcade.eth", input: {}, account,
      ensReader: { getEnsText: async () => null } })).rejects.toBeInstanceOf(EnsNameExpired)
    await expect(callSkillPromise({ name: "flow.seller.arcade.eth", input: {}, account, pollIntervalMs: 0 }))
      .rejects.toMatchObject({ _tag: "RpcFailure", method: "callSkill" })
  })
})
