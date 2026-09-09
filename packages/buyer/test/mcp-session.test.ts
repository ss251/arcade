import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { CallToolResultSchema, type CallToolResult, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { BuyerSessionFailure, type BuyerSession } from "../src/session.ts"
import { loadChainConfig } from "@arcade/core"
import { decodeHeaderJson } from "@arcade/payments"

const HUB = "https://session-hub.example", SELLER = `0x${"22".repeat(20)}`
// Synthetic unfunded fixture only; never an operational environment credential.
const FIXTURE_KEY = `0x${"01".repeat(32)}`
const CAPTURED_CHAIN = loadChainConfig("arc-testnet")
let m: typeof import("../src/mcp.ts")
const text = (r: CallToolResult) => r.content.filter(c => c.type === "text").map(c => c.text).join("\n")
const invoke = (name: string, args: unknown, signal?: AbortSignal) =>
  m.handleTool(name, args, signal === undefined ? {} : { signal })
const listing = { id: "flow", serviceName: "service", seller: SELLER, price: "$0.10", version: "1.0.0" }
const ordinaryResult = () => ({ jobId: "job_ordinary", status: "succeeded", result: { ok: true },
  receipt: { settled: true, price: "$0.10" }, authorizedAmountAtomic: 100000n, fencedResult: "<<<UNTRUSTED:fixture>>>result<<</UNTRUSTED:fixture>>>" })
const fetchFixture = async (url: string | URL | Request) => {
  const path = new URL(String(url)).pathname
  if (path === "/listings") return Response.json([listing])
  if (path === "/listings/flow") return Response.json(listing)
  return Response.json({ x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:5042002", amount: "100000", asset: "0x3600000000000000000000000000000000000000",
    payTo: SELLER, resource: String(url), maxTimeoutSeconds: 604900 }] }, { status: 402 })
}
beforeEach(async () => {
  vi.stubEnv("ARCADE_HUB", HUB); vi.stubEnv("ARCADE_NETWORK", "arc-testnet"); vi.stubEnv("ARCADE_BUYER_KEY", FIXTURE_KEY)
  vi.stubEnv("ARCADE_MAX_CALL_USD", "$0.60"); vi.stubEnv("ARCADE_SESSION_BUDGET_USD", "$1.00")
  vi.stubGlobal("fetch", vi.fn(fetchFixture)); m = await import("../src/mcp.ts"); m.__resetBudget()
})
afterEach(() => { m?.__resetBudget(); m?.__setCallSkill(undefined); m?.__setOpenSession(undefined); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const sid = `ses_${"ab".repeat(16)}`, jid = `job_${"ab".repeat(16)}`, BUYER = "0x1a642f0e3c3af545e7acbd38b07251b3990914f1"
const sessionResult = (amount = 100000n, settled = true) => ({ jobId: jid, status: settled ? "succeeded" : "failed", result: settled ? { instruction: "SELLER_PRIVATE" } : null,
  authorizedAmountAtomic: amount, fencedResult: "<<<UNTRUSTED:fixture>>>SELLER_PRIVATE<<</UNTRUSTED:fixture>>>",
  receipt: { jobId: jid, skillId: "flow", skillVersion: "1.0.0", sessionId: sid, buyer: BUYER, seller: SELLER, rail: "test", network: "eip155:5042002",
    priceAtomic: amount.toString(), sellerAtomic: settled ? amount.toString() : "0", feeAtomic: "0", feeBps: 0,
    price: `$${Number(amount) / 1e6}`, settled, ...(settled ? { settleTx: `0xtest${"ab".repeat(16)}`, settleRefKind: "test" } : {}), reason: settled ? "ok" : "not settled" } })
function fakeSession() {
  let closed = false
  const identity = { id: sid, buyer: BUYER, rail: "test" as const, network: "eip155:5042002", budgetAtomic: 1000000n }
  const receipt = () => ({ sessionId: sid, buyer: BUYER, rail: "test" as const, network: identity.network, budgetAtomic: "1000000", spentAtomic: "0", heldAtomic: "0",
    calls: [], settledCalls: 0, settlementRefs: [], complete: true as const, openedAtMs: 1000, closedAtMs: 2000 })
  const status = vi.fn<BuyerSession["status"]>(() => Effect.succeed({ ...identity, spentAtomic: 0n, heldAtomic: 0n, remainingAtomic: 1000000n, calls: [], complete: true, closed,
    localIssuedAtomic: 0n, localConfirmedAtomic: 0n, localExposureAtomic: 0n, ...(closed ? { closedReceipt: receipt() } : {}) }))
  const call = vi.fn<BuyerSession["call"]>(() => Effect.succeed(sessionResult()))
  const close = vi.fn<BuyerSession["close"]>(() => Effect.sync(() => { closed = true; return receipt() }))
  const quote = vi.fn<BuyerSession["quote"]>(() => Effect.succeed({ priceAtomic: 100000n, rail: "test" as const, network: identity.network, serviceName: "service", skillId: "flow", skillVersion: "1.0.0", seller: SELLER }))
  const session: BuyerSession = { ...identity, status, call, close, quote }
  const open = vi.fn(() => Effect.succeed(session)); m.__setOpenSession(open)
  return { session, open, call, quote, status, close, receipt, markClosed: () => { closed = true } }
}

describe("MCP session lifecycle and local authority", () => {
  it("cannot override an active session's fixed rail through ordinary call arguments", async () => {
    const f = fakeSession()
    expect((await invoke("arcade_open_session", { budgetUsd: "1", rail: "test" })).isError).not.toBe(true)
    vi.mocked(fetch).mockClear()
    const out = await invoke("arcade_call_skill", { skillId: "flow", input: {}, rail: "gateway" })
    expect(out.isError).toBe(true); expect(text(out)).toContain("session_rail_mismatch")
    expect(f.call).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it("opens once, captures the buyer, and routes actual-input quote through the session", async () => {
    const f = fakeSession(), first = await invoke("arcade_open_session", { budgetUsd: "1", rail: "test" })
    expect(first.isError).not.toBe(true); expect(first.structuredContent).toMatchObject({ sessionId: sid, rail: "test" })
    vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_REPLACED_KEY")
    expect((await invoke("arcade_open_session", { budgetUsd: "1" })).isError).toBe(true); expect(f.open).toHaveBeenCalledTimes(1)
    const quote = await invoke("arcade_quote", { skillId: "flow", input: { actual: 7 } })
    expect(quote.isError).not.toBe(true); expect(f.quote).toHaveBeenCalledWith({ seller: "service", skillId: "flow", input: { actual: 7 } })
    expect(f.call).not.toHaveBeenCalled(); expect(JSON.stringify(quote)).not.toContain("PRIVATE_REPLACED_KEY")
  })
  it("refuses malformed or oversized open budgets before account/SDK/IO", async () => {
    const f = fakeSession(); vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_INVALID")
    for (const budget of ["0", "01", "1e0", "1.0000001", "$1", "2", 1]) {
      const out = await invoke("arcade_open_session", { budgetUsd: budget })
      expect(out.isError).toBe(true); expect(text(out)).not.toContain("PRIVATE")
    }
    expect(f.open).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it("poisons an uncertain opening instead of admitting an ordinary fallback", async () => {
    const f = fakeSession(), legacy = vi.fn(() => Effect.succeed(ordinaryResult())); m.__setCallSkill(legacy)
    m.__setOpenSession(() => Effect.fail(new BuyerSessionFailure({ code: "transport_unavailable", phase: "mutation-uncertain", authorizedAmountAtomic: 0n })))
    expect((await invoke("arcade_open_session", { budgetUsd: "1" })).isError).toBe(true)
    expect((await invoke("arcade_call_skill", { skillId: "flow", input: {} })).isError).toBe(true)
    expect(legacy).not.toHaveBeenCalled(); expect(f.call).not.toHaveBeenCalled()
  })
  it("preserves signed release exposure across close and a later ordinary purchase", async () => {
    const f = fakeSession(); f.call.mockReturnValue(Effect.succeed(sessionResult(600000n, false)))
    await invoke("arcade_open_session", { budgetUsd: "1", rail: "test" })
    const result = await invoke("arcade_call_skill", { skillId: "flow", input: {} })
    expect(result.isError).not.toBe(true); expect(text(result)).toMatch(/issued|reserved/i)
    expect((await invoke("arcade_close_session", {})).isError).not.toBe(true)
    const legacy = vi.fn(() => Effect.succeed({ ...ordinaryResult(), authorizedAmountAtomic: 500000n, receipt: { settled: true, price: "$0.50" } })); m.__setCallSkill(legacy)
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      const response = await fetchFixture(url), body = await response.clone().json() as { accepts?: Array<Record<string, unknown>> }
      return body.accepts ? Response.json({ ...body, accepts: body.accepts.map(a => ({ ...a, amount: "500000" })) }, { status: 402 }) : response
    }))
    expect((await invoke("arcade_call_skill", { skillId: "flow", input: {} })).isError).toBe(true)
    expect(legacy).not.toHaveBeenCalled(); expect(m.spentSoFarAtomic()).toBe(0n)
  })
  it("lost close retains the handle and uses readonly status on explicit recovery, never another close", async () => {
    const f = fakeSession(); f.close.mockImplementation(() => Effect.sync(() => { f.markClosed(); throw Error("PRIVATE_CLOSE") }))
    await invoke("arcade_open_session", { budgetUsd: "1" })
    expect((await invoke("arcade_close_session", {})).isError).toBe(true)
    expect((await invoke("arcade_call_skill", { skillId: "flow", input: {} })).isError).toBe(true)
    expect((await invoke("arcade_close_session", {})).isError).not.toBe(true)
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.status).toHaveBeenCalledTimes(1)
  })
  it("preserves a valid pending-close handle but never debits the same job twice", async () => {
    const f = fakeSession(); f.close.mockReturnValueOnce(Effect.fail(new BuyerSessionFailure({ code: "session_pending", phase: "mutation-uncertain", authorizedAmountAtomic: 0n })))
    await invoke("arcade_open_session", { budgetUsd: "1", rail: "test" })
    expect((await invoke("arcade_close_session", {})).isError).toBe(true)
    const first = await invoke("arcade_call_skill", { skillId: "flow", input: {} })
    expect(first.isError).not.toBe(true); expect(m.spentSoFarAtomic()).toBe(100000n)
    expect(text(first).split("<<<UNTRUSTED:fixture>>>")[0]).not.toContain("SELLER_PRIVATE")
    expect((await invoke("arcade_call_skill", { skillId: "flow", input: {} })).isError).toBe(true)
    expect(m.spentSoFarAtomic()).toBe(100000n)
    const budget = await invoke("arcade_budget", {})
    expect(budget.structuredContent).toMatchObject({ spentUsdc: "0.100000", reservedUsdc: "0.600000" })
  })
  it.each(["signed", "unsigned", "unknown"] as const)("uses only local %s failure provenance to narrow a reservation", async mode => {
    const f = fakeSession()
    f.call.mockImplementation(() => mode === "unknown" ? Effect.die(Error("PRIVATE_PROVIDER")) : Effect.fail(new BuyerSessionFailure({
      code: "transport_unavailable", phase: mode === "signed" ? "issued" : "unsigned", authorizedAmountAtomic: mode === "signed" ? 100000n : 0n })))
    await invoke("arcade_open_session", { budgetUsd: "1" })
    const out = await invoke("arcade_call_skill", { skillId: "flow", input: {} })
    expect(out.isError).toBe(true); expect(text(out)).not.toContain("PRIVATE_PROVIDER")
    const budget = await invoke("arcade_budget", {})
    expect(budget.structuredContent?.reservedUsdc).toBe(mode === "signed" ? "0.100000" : mode === "unsigned" ? "0.000000" : "0.600000")
    expect(m.spentSoFarAtomic()).toBe(0n)
  })
  it("does not narrow local exposure from a forged lower receipt", async () => {
    const f = fakeSession(); f.call.mockReturnValue(Effect.succeed({ ...sessionResult(600000n), receipt: sessionResult(100000n).receipt }))
    await invoke("arcade_open_session", { budgetUsd: "1" })
    expect((await invoke("arcade_call_skill", { skillId: "flow", input: {} })).isError).toBe(true)
    expect((await invoke("arcade_budget", {})).structuredContent).toMatchObject({ spentUsdc: "0.000000", reservedUsdc: "0.600000", remainingUsdc: "0.400000" })
  })
  it("refuses active ENS and malformed quote metadata without legacy or price fallback", async () => {
    const f = fakeSession(); await invoke("arcade_open_session", { budgetUsd: "1" })
    const before = vi.mocked(fetch).mock.calls.length
    expect((await invoke("arcade_call_skill", { name: "flow.service.arcade.eth", input: {} })).isError).toBe(true)
    expect(vi.mocked(fetch).mock.calls).toHaveLength(before)
    f.quote.mockReturnValue(Effect.succeed({ priceAtomic: 100000n, rail: "gateway", network: "eip155:5042002", serviceName: "service", skillId: "flow", skillVersion: "1.0.0", seller: SELLER }))
    expect((await invoke("arcade_quote", { skillId: "flow", input: {} })).isError).toBe(true)
    expect(f.call).not.toHaveBeenCalled()
    expect(vi.mocked(fetch).mock.calls.map(c => String(c[0]))).toEqual([`${HUB}/listings/flow`])
  })
  it("budget keeps captured buyer/network and unavailable categories without re-reading a key", async () => {
    const f = fakeSession(); await invoke("arcade_open_session", { budgetUsd: "1" })
    vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_CHANGED"); vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    const result = await invoke("arcade_budget", {})
    expect(result.isError).not.toBe(true); expect(result.structuredContent).toMatchObject({ address: BUYER, network: "eip155:5042002", walletUsdc: null,
      gatewayAvailableUsdc: null, gatewayPendingUsdc: null, session: { id: sid, current: true, hub: { heldUsdc: "0.000000", remainingUsdc: "1.000000" } } })
    expect(vi.mocked(fetch).mock.calls.map(c => String(c[0]))).toEqual([CAPTURED_CHAIN.rpcHttp[0]])
    expect(f.status).toHaveBeenCalledTimes(1); expect(text(result)).not.toContain("PRIVATE_CHANGED")
  })
  it("captures queued input before mutation and refuses own-data accessors without invoking them", async () => {
    const f = fakeSession(); let release!: () => void, entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    await invoke("arcade_open_session", { budgetUsd: "1" })
    f.call.mockImplementationOnce(() => Effect.promise(async () => { entered(); await gate; return sessionResult() }))
    const first = invoke("arcade_call_skill", { skillId: "flow", input: {} }); await started
    const input = { label: "captured" }, pending = invoke("arcade_call_skill", { skillId: "flow", input })
    input.label = "changed"; release(); await first; await pending
    expect(f.call).toHaveBeenCalledWith(expect.objectContaining({ input: { label: "captured" } }))
    let getters = 0
    expect((await invoke("arcade_call_skill", { skillId: "flow", input: { get key() { getters++; return "PRIVATE_ACCESSOR" } } })).isError).toBe(true)
    expect(getters).toBe(0)
  })
  it.each([false, true])("a call queued during close cannot rebind its captured lane/handle (reopen=%s)", async reopen => {
    const f = fakeSession(); await invoke("arcade_open_session", { budgetUsd: "1" })
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    f.close.mockImplementation(() => Effect.promise(async () => { entered(); await gate; return f.receipt() }))
    const legacy = vi.fn(() => Effect.succeed(ordinaryResult())); m.__setCallSkill(legacy)
    const close = invoke("arcade_close_session", {}); await started
    const next = fakeSession(), opening = reopen ? invoke("arcade_open_session", { budgetUsd: "1" }) : Promise.resolve()
    const pending = invoke("arcade_call_skill", { skillId: "flow", input: {} })
    try {
      release(); await close; await opening
      expect((await pending).isError).toBe(true); expect(legacy).not.toHaveBeenCalled(); expect(next.call).not.toHaveBeenCalled(); expect(f.call).not.toHaveBeenCalled()
    } finally { release(); await Promise.allSettled([close, opening, pending]) }
  })
  it("a late old budget read cannot restore a closed handle or classify a newer one", async () => {
    const first = fakeSession(); await invoke("arcade_open_session", { budgetUsd: "1" })
    const value = await Effect.runPromise(first.session.status())
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    first.status.mockImplementation(() => Effect.promise(async () => { entered(); await gate; return value }))
    const pending = invoke("arcade_budget", {}); await started
    try {
      expect((await invoke("arcade_close_session", {})).isError).not.toBe(true)
      const second = fakeSession(); expect((await invoke("arcade_open_session", { budgetUsd: "1" })).isError).not.toBe(true)
      release(); const old = await pending
      expect(old.structuredContent).toMatchObject({ session: { id: sid, current: false } })
      expect((await invoke("arcade_call_skill", { skillId: "flow", input: {} })).isError).not.toBe(true)
      expect(first.call).not.toHaveBeenCalled(); expect(second.call).toHaveBeenCalledTimes(1)
    } finally { release(); await pending }
  })
  it("an opening latch permits only one concurrent SDK open", async () => {
    const f = fakeSession(); let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    const open = vi.fn(() => Effect.promise(async () => { entered(); await gate; return f.session })); m.__setOpenSession(open)
    const a = invoke("arcade_open_session", { budgetUsd: "1" }); await started
    const b = invoke("arcade_open_session", { budgetUsd: "1" })
    try {
      release(); expect((await a).isError).not.toBe(true); expect((await b).isError).toBe(true); expect(open).toHaveBeenCalledTimes(1)
    } finally { release(); await Promise.allSettled([a, b]) }
  })
})

describe("captured session wallet inspection", () => {
  const responses = () => [{ jsonrpc: "2.0", id: 1, result: `0x${CAPTURED_CHAIN.chainId.toString(16)}` },
    { jsonrpc: "2.0", id: 2, result: `0x${2000000n.toString(16).padStart(64, "0")}` }]
  it("reads chain identity and pinned ERC20 balance in one captured, unsigned bounded batch", async () => {
    const f = fakeSession(), requests: Request[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(new Request(url, init)); return Response.json(responses().reverse())
    }))
    await invoke("arcade_open_session", { budgetUsd: "1" }); vi.stubEnv("ARCADE_NETWORK", "arc-mainnet"); vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_CHANGED")
    const out = await invoke("arcade_budget", {})
    expect(out.structuredContent).toMatchObject({ walletUsdc: "2.000000", gatewayAvailableUsdc: null, gatewayPendingUsdc: null, network: CAPTURED_CHAIN.caip2 })
    expect(requests).toHaveLength(1); expect(requests[0]?.url).toBe(new URL(CAPTURED_CHAIN.rpcHttp[0]!).href)
    expect(await requests[0]!.json()).toEqual([{ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: CAPTURED_CHAIN.usdc.address, data: `0x70a08231${BUYER.slice(2).padStart(64, "0")}` }, "latest"] }])
    expect(requests[0]?.credentials).toBe("omit"); expect(requests[0]?.redirect).toBe("error")
    for (const name of ["x-session-token", "x-arcade-session", "payment-signature", "authorization", "cookie"]) expect(requests[0]?.headers.has(name)).toBe(false)
    expect(f.call).not.toHaveBeenCalled()
  })
  it.each(["chain", "short", "duplicate", "extra", "error"] as const)("reports unavailable, never zero or fallback, on %s wallet evidence", async mode => {
    fakeSession(); const value = responses()
    if (mode === "chain") value[0]!.result = "0x1"
    if (mode === "short") value[1]!.result = "0x1"
    if (mode === "duplicate") value[1]!.id = 1
    if (mode === "extra") value.push({ ...value[1]!, id: 3 })
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(mode === "error" ? { error: "PRIVATE_RPC" } : value)))
    await invoke("arcade_open_session", { budgetUsd: "1" }); const out = await invoke("arcade_budget", {})
    expect(out.structuredContent?.walletUsdc).toBeNull(); expect(text(out)).not.toContain("PRIVATE_RPC"); expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each(["deadline", "cancel"] as const)("%s includes an unfinished wallet body and cancels it without changing process totals", async mode => {
    vi.useFakeTimers(); fakeSession(); let entered!: () => void, canceled = false, transportSignal: AbortSignal | null | undefined
    const started = new Promise<void>(resolve => { entered = resolve }), controller = new AbortController()
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      transportSignal = init?.signal; entered()
      return new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true } }), { status: 200 })
    }))
    await invoke("arcade_open_session", { budgetUsd: "1" })
    const pending = invoke("arcade_budget", {}, controller.signal); await started
    if (mode === "deadline") await vi.advanceTimersByTimeAsync(5001); else controller.abort("PRIVATE_WALLET_CANCEL")
    const out = await pending
    expect(mode === "deadline" ? out.structuredContent?.walletUsdc === null : out.isError).toBe(true)
    expect(transportSignal?.aborted).toBe(true); expect(canceled).toBe(true); expect(m.spentSoFarAtomic()).toBe(0n)
    expect(text(out)).not.toContain("PRIVATE_WALLET_CANCEL")
  })
  it("bounds a finite zero-byte chunk storm before it can consume arbitrary body work", async () => {
    fakeSession(); let pulls = 0, canceled = false
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        if (pulls <= 3000) controller.enqueue(new Uint8Array())
        else { controller.enqueue(new TextEncoder().encode(JSON.stringify(responses()))); controller.close() }
      }, cancel() { canceled = true }
    }), { status: 200 })))
    await invoke("arcade_open_session", { budgetUsd: "1" }); const out = await invoke("arcade_budget", {})
    expect(out.structuredContent?.walletUsdc).toBeNull(); expect(pulls).toBeLessThanOrEqual(1026); expect(canceled).toBe(true)
  })
})

describe("MCP through the actual F9 SDK", () => {
  it.each([true, false])("keeps actual signature provenance, private quote headers and terminal fencing (settled=%s)", async settled => {
    m.__setOpenSession(undefined)
    const token = "cd".repeat(16), tx = `0xtest${"ab".repeat(16)}`, requests: Request[] = []
    let paid = false, closed = false, nonce = ""
    const call = () => ({ jobId: jid, skillId: "flow", priceAtomic: "100000", state: settled ? "settled" : "released", settled, createdAtMs: 1000,
      ...(settled ? { settleRef: tx, settleRefKind: "test" } : {}) })
    const proof = () => ({ sessionId: sid, buyer: BUYER, rail: "test", network: CAPTURED_CHAIN.caip2, budgetAtomic: "1000000", spentAtomic: settled && paid ? "100000" : "0", heldAtomic: "0",
      calls: paid ? [call()] : [], settledCalls: settled && paid ? 1 : 0, settlementRefs: settled && paid ? [tx] : [], complete: true, openedAtMs: 1000, closedAtMs: 2000 })
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const request = new Request(url, init); requests.push(request); const path = new URL(request.url).pathname
      if (request.url.startsWith(CAPTURED_CHAIN.rpcHttp[0]!)) return Response.json([{ jsonrpc: "2.0", id: 1, result: `0x${CAPTURED_CHAIN.chainId.toString(16)}` }, { jsonrpc: "2.0", id: 2, result: `0x${"0".repeat(64)}` }])
      if (path === "/sessions") return Response.json({ session_id: sid, session_token: token, rail: "test", network: CAPTURED_CHAIN.caip2, budget: "$1.00", note: "PRIVATE_HUB_NOTE" }, { status: 201 })
      if (path.endsWith("/close")) { closed = true; return Response.json(proof()) }
      if (path === `/sessions/${sid}`) return Response.json({ session_id: sid, rail: "test", network: CAPTURED_CHAIN.caip2, budget: "$1.00", spent: settled && paid ? "$0.10" : "$0.00", held: "$0.00", remaining: settled && paid ? "$0.90" : "$1.00",
        calls: paid ? [call()] : [], complete: true, closed, ...(closed ? { closed_receipt: proof() } : {}) })
      if (path === "/listings/flow") return Response.json(listing)
      if (path === `/jobs/${jid}/result`) return Response.json({ job_id: jid, status: settled ? "succeeded" : "rejected", result: settled ? { instruction: "SELLER_UNTRUSTED" } : null,
        ...(settled ? {} : { detail: "session_released" }), receipt: { jobId: jid, skillId: "flow", skillVersion: "1.0.0", buyer: BUYER, seller: SELLER,
          priceAtomic: "100000", sellerAtomic: "100000", feeAtomic: "0", feeBps: 0, rail: "test", network: CAPTURED_CHAIN.caip2, latencyMs: 1000, settled,
          reason: settled ? "ok" : "session_released", createdAtMs: 2000, rootJobId: jid, hop: 0, ancestors: [], authorizationNonce: nonce, sessionId: sid,
          price: "$0.10", sellerShare: "$0.10", fee: "$0.00", explorer: null, ...(settled ? { settleTx: tx, settleRefKind: "test" } : {}) } })
      if (path !== "/x/service/flow") throw Error("Fixture refuses unexpected route")
      const signature = request.headers.get("payment-signature")
      if (signature) {
        paid = true; nonce = (decodeHeaderJson(signature) as { payload: { authorization: { nonce: string } } }).payload.authorization.nonce
        return Response.json({ job_id: jid, status: "queued", poll_url: `${HUB}/jobs/${jid}/result`, job_token: token, price: "$0.10" }, { status: 202 })
      }
      return Response.json({ x402Version: 2, error: "payment required", accepts: [{ scheme: "exact", network: CAPTURED_CHAIN.caip2, asset: CAPTURED_CHAIN.usdc.address,
        amount: "100000", payTo: SELLER, resource: request.url, mimeType: "application/json", maxTimeoutSeconds: 604900, extra: { name: CAPTURED_CHAIN.usdc.eip712Name, version: CAPTURED_CHAIN.usdc.eip712Version } }] }, { status: 402 })
    }))
    const opened = await invoke("arcade_open_session", { budgetUsd: "1", rail: "test" }); expect(opened.isError).not.toBe(true)
    vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_REPLACED_KEY")
    const quoted = await invoke("arcade_quote", { skillId: "flow", input: { requested: true } }); expect(quoted.isError).not.toBe(true); expect(paid).toBe(false)
    const out = await invoke("arcade_call_skill", { skillId: "flow", input: { requested: true } }); expect(out.isError).not.toBe(true)
    expect(out.structuredContent).toMatchObject({ settled, authorizedUsdc: "0.100000" })
    if (settled) expect(text(out).split("<<<UNTRUSTED:")[0]).not.toContain("SELLER_UNTRUSTED")
    const budget = await invoke("arcade_budget", {})
    expect(budget.structuredContent).toMatchObject({ spentUsdc: settled ? "0.100000" : "0.000000", reservedUsdc: settled ? "0.000000" : "0.100000", remainingUsdc: "0.900000" })
    expect((await invoke("arcade_close_session", {})).isError).not.toBe(true)
    const probes = requests.filter(r => new URL(r.url).pathname === "/x/service/flow")
    expect(probes).toHaveLength(3); expect(probes.filter(r => r.headers.has("payment-signature"))).toHaveLength(1)
    for (const probe of probes) { expect(probe.headers.get("x-arcade-session")).toBe(sid); expect(probe.headers.get("x-session-token")).toBe(token) }
    for (const result of [opened, quoted, out, budget]) { expect(JSON.stringify(result)).not.toContain(token); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_HUB_NOTE|PRIVATE_REPLACED_KEY/) }
  })
})

describe("installed MCP cancellation and request identity", () => {
  it("actual notification cancellation removes middle B without releasing C ahead of A", async () => {
    const f = fakeSession(), order: number[] = []; let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    f.call.mockImplementation(args => Effect.promise(async () => {
      const n = (args.input as { n: number }).n; order.push(n)
      if (n === 1) { entered(); await gate }
      const jobId = `job_${String(n).repeat(32)}`, result = sessionResult()
      return { ...result, jobId, receipt: { ...result.receipt, jobId } }
    }))
    const server = m.createServer(), client = new Client({ name: "session-queue", version: "1" }), [ct, st] = InMemoryTransport.createLinkedPair(), controller = new AbortController()
    let a: Promise<unknown> | undefined, b: Promise<unknown> | undefined, c: Promise<unknown> | undefined
    try {
      await Promise.all([client.connect(ct), server.connect(st)])
      await client.callTool({ name: "arcade_open_session", arguments: { budgetUsd: "1" } })
      const args = (n: number) => ({ name: "arcade_call_skill", arguments: { skillId: "flow", input: { n }, maxAmountUsd: 0.1 } })
      a = client.callTool(args(1)); await started
      b = client.callTool(args(2), undefined, { signal: controller.signal }).catch(() => undefined)
      c = client.callTool(args(3)); controller.abort("PRIVATE_QUEUED_CANCEL")
      await b; expect(order).toEqual([1])
      release(); await Promise.all([a, c]); expect(order).toEqual([1, 3])
    } finally { release(); controller.abort(); await Promise.allSettled([a, b, c]); await client.close(); await server.close() }
  })
  it.each([0, ""])("refuses uncancellable request id %j through the real in-memory protocol", async requestId => {
    const server = m.createServer(), [ct, st] = InMemoryTransport.createLinkedPair(), messages: JSONRPCMessage[] = []
    ct.onmessage = message => { messages.push(message) }
    try {
      await Promise.all([ct.start(), server.connect(st)])
      await ct.send({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: "arcade_open_session", arguments: { budgetUsd: "1" } } })
      await vi.waitFor(() => expect(messages).toHaveLength(1))
      const response = messages[0]!
      expect("result" in response ? response.result : undefined).toMatchObject({ isError: true, content: [{ type: "text", text: expect.stringContaining("request_id_unsupported") }] })
      expect(fetch).not.toHaveBeenCalled()
    } finally { await ct.close(); await server.close() }
  })
  it.each(["cancel", "disconnect"] as const)("propagates actual client %s into an active SDK Effect, joins cleanup and retains exposure", async mode => {
    const f = fakeSession(); let entered!: () => void, finalized!: () => void, signs = 0
    const started = new Promise<void>(resolve => { entered = resolve }), joined = new Promise<void>(resolve => { finalized = resolve })
    f.call.mockImplementation(() => Effect.sync(() => { signs++; entered() }).pipe(Effect.zipRight(Effect.never), Effect.ensuring(Effect.sync(() => finalized()))))
    const server = m.createServer(), client = new Client({ name: "session-test", version: "1" }), [ct, st] = InMemoryTransport.createLinkedPair()
    const controller = new AbortController()
    try {
      await Promise.all([client.connect(ct), server.connect(st)])
      const opened = CallToolResultSchema.parse(await client.callTool({ name: "arcade_open_session", arguments: { budgetUsd: "1" } }))
      expect(opened.isError).not.toBe(true)
      const call = client.callTool({ name: "arcade_call_skill", arguments: { skillId: "flow", input: {} } }, undefined, { signal: controller.signal }).catch(() => undefined)
      await started
      if (mode === "cancel") controller.abort("PRIVATE_CLIENT_REASON"); else await client.close()
      await call; await joined
      // Queue a sentinel read/mutation after the interrupted lease has finalized.
      const out = await invoke("arcade_call_skill", { skillId: "flow", input: {}, maxAmountUsd: 0.5 }, AbortSignal.abort())
      expect(out.isError).toBe(true); expect(signs).toBe(1)
      const budget = await invoke("arcade_budget", {})
      expect(budget.structuredContent?.reservedUsdc).toBe("0.600000"); expect(text(budget)).not.toContain("PRIVATE_CLIENT_REASON")
    } finally { controller.abort(); await client.close(); await server.close(); await joined }
  })
})

describe("MCP cancellation lease", () => {
  it("preserves ordinary JSON constructor/prototype fields as inert copied data", async () => {
    const call = vi.fn(() => Effect.succeed(ordinaryResult())); m.__setCallSkill(call)
    const input = { constructor: "plain data", prototype: { value: "plain data" } }
    expect((await invoke("arcade_call_skill", { skillId: "flow", input })).isError).not.toBe(true)
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ input }))
  })
  it("refuses a pre-canceled ordinary purchase before discovery or paid SDK entry", async () => {
    const controller = new AbortController(); controller.abort("PRIVATE_ABORT")
    const call = vi.fn(() => Effect.succeed(ordinaryResult())); m.__setCallSkill(call)
    const result = await invoke("arcade_call_skill", { skillId: "flow", input: {} }, controller.signal)
    expect(result.isError).toBe(true); expect(text(result)).not.toContain("PRIVATE_ABORT")
    expect(fetch).not.toHaveBeenCalled(); expect(call).not.toHaveBeenCalled()
  })
  it("a canceled middle waiter never runs and cannot let C overtake active A", async () => {
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    const order: number[] = [], controller = new AbortController()
    m.__setCallSkill(args => Effect.promise(async () => {
      const n = (args.input as { n: number }).n; order.push(n)
      if (n === 1) { entered(); await gate }
      return ordinaryResult()
    }))
    const a = invoke("arcade_call_skill", { skillId: "flow", input: { n: 1 } })
    await started
    const b = invoke("arcade_call_skill", { skillId: "flow", input: { n: 2 } }, controller.signal)
    const c = invoke("arcade_call_skill", { skillId: "flow", input: { n: 3 } })
    try {
      controller.abort("PRIVATE_MIDDLE")
      await new Promise(resolve => setTimeout(resolve, 10)); expect(order).toEqual([1])
      release(); await Promise.all([a, b, c])
      expect(order).toEqual([1, 3]); expect((await b).isError).toBe(true)
    } finally { release(); await Promise.allSettled([a, b, c]) }
  })
})
