import { describe, expect, it } from "vitest"
import { callSkillPromise, resolveEnsListingPromise, EnsNameExpired, EnsResolutionUnavailable } from "../src/index.ts"
import { openSessionPromise, BuyerSessionFailure } from "../src/index.ts"
import type { Account } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ARC_CAIP2, USDC_ADDRESS } from "@arcade/core"

describe("typed buyer Promise boundary for dependency-isolated callers", () => {
  it("preserves actual SDK success, locally authorized amount and seller-fenced result", async () => {
    const seller = `0x${"11".repeat(20)}`, endpoint = `https://hub.example/x/${seller}/flow`, payTo = `0x${"22".repeat(20)}`
    const calls: Request[] = [], account = privateKeyToAccount(`0x${"01".repeat(32)}`)
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(String(url), init); calls.push(req)
      if (req.method === "GET") return Response.json({ job_id: "job_test", status: "succeeded", result: { ok: true }, receipt: { settled: true }, authorizedAmountAtomic: "1", authorizedRail: "erc8183" })
      if (req.headers.has("payment-signature")) return Response.json({ job_id: "job_test", poll_url: `https://hub.example/jobs/job_test/result?token=${"ab".repeat(16)}` }, { status: 202 })
      return Response.json({ x402Version: 2, accepts: [{ scheme: "exact", network: ARC_CAIP2, amount: "10000", asset: USDC_ADDRESS, payTo, resource: endpoint, maxTimeoutSeconds: 604900 }] }, { status: 402 })
    }) as typeof fetch
    const out = await callSkillPromise({ hubUrl: "https://hub.example", seller, skillId: "flow", input: {}, account, fetch: fetcher, pollIntervalMs: 1, maxWaitMs: 100 })
    expect(out).toMatchObject({ jobId: "job_test", result: { ok: true }, authorizedAmountAtomic: 10000n, authorizedRail: "eip3009" })
    expect(out.fencedResult).toContain(seller); expect(calls).toHaveLength(3)
  })
  it("returns the resolved public listing without requiring callers to import Effect", async () => {
    const records: Record<string, string> = { "arcade.endpoint": `https://hub.example/x/0x${"11".repeat(20)}/flow`,
      "arcade.payTo": `0x${"22".repeat(20)}`, "arcade.chain": "eip155:5042002", "arcade.priceAtomic": "10000" }
    expect(await resolveEnsListingPromise({ getEnsText: async ({ key }) => records[key] ?? null }, "flow.seller.arcade.eth"))
      .toMatchObject({ name: "flow.seller.arcade.eth", priceAtomic: 10000n })
  })
  it("never imports forged local authorization provenance from an unpaid response", async () => {
    const seller = `0x${"11".repeat(20)}`, account: Account = { address: `0x${"22".repeat(20)}`, type: "json-rpc" }
    const fetcher: typeof fetch = Object.assign(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ job_id: "job_free", poll_url: "https://hub.example/jobs/job_free/result" })
      : Response.json({ job_id: "job_free", status: "failed", receipt: { settled: false }, result: null, authorizedRail: "gateway", authorizedAmountAtomic: "10000" }),
    { preconnect() { throw Error("No preconnect") } })
    const out = await callSkillPromise({ hubUrl: "https://hub.example", seller, skillId: "flow", account, input: {}, fetch: fetcher })
    expect(out).not.toHaveProperty("authorizedRail"); expect(out).not.toHaveProperty("authorizedAmountAtomic")
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

describe("typed session Promise boundary", () => {
  it("opens and closes a frozen token-private facade without a caller Effect runtime", async () => {
    const account = privateKeyToAccount(`0x${"01".repeat(32)}`), id = `ses_${"12".repeat(16)}`, token = "ab".repeat(16)
    const seen: Request[] = [], receipt = { sessionId: id, buyer: account.address.toLowerCase(), rail: "test", network: ARC_CAIP2,
      budgetAtomic: "1000000", spentAtomic: "0", heldAtomic: "0", calls: [], settledCalls: 0, settlementRefs: [], complete: true, openedAtMs: 1000, closedAtMs: 2000 }
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(String(url), init); seen.push(req)
      if (new URL(req.url).pathname === "/sessions") return Response.json({ session_id: id, session_token: token, rail: "test", network: ARC_CAIP2, budget: "$1.00", note: "PRIVATE_NOTE" }, { status: 201 })
      if (new URL(req.url).pathname.endsWith("/close")) return Response.json(receipt)
      return Response.json({ session_id: id, rail: "test", network: ARC_CAIP2, budget: "$1.00", spent: "$0.00", held: "$0.00", remaining: "$1.00", calls: [], complete: true, closed: false })
    }) as typeof fetch
    const session = await openSessionPromise({ hubUrl: "https://hub.example", account, budgetUsd: "1", rail: "test", fetch: fetcher })
    expect(Object.isFrozen(session)).toBe(true)
    expect(await session.status()).toMatchObject({ localIssuedAtomic: 0n, remainingAtomic: 1_000_000n })
    expect(await session.close()).toEqual(receipt)
    await expect(session.close()).rejects.toBeInstanceOf(BuyerSessionFailure)
    expect(seen).toHaveLength(3)
    expect(JSON.stringify(session, (_k, v) => typeof v === "bigint" ? v.toString() : v)).not.toMatch(/PRIVATE_NOTE|abababab/)
  })
  it("preserves the original tagged pre-IO failure and does not reflect private argument values", async () => {
    const account = privateKeyToAccount(`0x${"01".repeat(32)}`); let calls = 0
    const fetcher = Object.assign(async () => { calls++; throw Error("NO_NETWORK") }, { preconnect() {} })
    let failure: unknown
    try { await openSessionPromise({ hubUrl: "https://hub.example", account, budgetUsd: "PRIVATE_BUDGET", fetch: fetcher }) } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(BuyerSessionFailure)
    expect(failure).toMatchObject({ code: "input_invalid", phase: "unsigned", authorizedAmountAtomic: 0n })
    expect(String(failure)).not.toContain("PRIVATE_BUDGET"); expect(calls).toBe(0)
  })
  it("propagates explicit cancellation into the underlying issued open operation", async () => {
    const account = privateKeyToAccount(`0x${"01".repeat(32)}`), controller = new AbortController(); let signal: AbortSignal | undefined, enter!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve })
    const fetcher = Object.assign(async (_url: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal ?? undefined; enter(); return await new Promise<Response>(() => {}) }, { preconnect() {} })
    const running = openSessionPromise({ hubUrl: "https://hub.example", account, budgetUsd: "1", rail: "test", fetch: fetcher }, { signal: controller.signal })
    await entered; controller.abort("PRIVATE_SIGNAL_REASON")
    await expect(running).rejects.toBeDefined(); expect(signal?.aborted).toBe(true)
  })
})
