import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { RpcFailure, parsePrice } from "@arcade/core"
import { HEADER_PAYMENT_SIGNATURE, decodeHeaderJson } from "@arcade/payments"
import * as ensPolicy from "../src/ens-policy.ts"
import type { SkillResult } from "../src/index.ts"

const HUB = "https://hub.example", SELLER = `0x${"11".repeat(20)}`, PAYEE = `0x${"22".repeat(20)}`
const NAME = "diff-triage.seller.arcade.eth", ENDPOINT = `${HUB}/x/${SELLER}/diff-triage`
// Public deterministic fixture only. Never loaded from Keychain or used on a network.
const KEY = `0x${"01".repeat(32)}`, INPUT = { diff: "offline fixture" }, TX = `0x${"ab".repeat(32)}`
let m: typeof import("../src/mcp.ts")
let amount: string, requirements: Record<string, unknown>, status: number
let quoteRequests: Request[]
const textOf = (out: Awaited<ReturnType<typeof m.handleTool>>) => out.content.filter(c => c.type === "text").map(c => c.text).join("\n")
const result = (receipt: Record<string, unknown> = { settled: true, price: "$0.12", settleTx: TX }): SkillResult & { readonly authorizedAmountAtomic?: bigint } => ({
  jobId: "job_offline", status: receipt.settled === false ? "failed" : "succeeded", result: { instruction: "SELLER_UNTRUSTED" },
  receipt, fencedResult: "<<<UNTRUSTED:test>>>SELLER_UNTRUSTED<<</UNTRUSTED:test>>>",
  ...(receipt.settled === true && typeof receipt.price === "string" ? { authorizedAmountAtomic: parsePrice(receipt.price) } : {})
})
const validReader = (): ensPolicy.EnsReader => ({ getEnsText: async ({ key }) => ({
  "arcade.endpoint": ENDPOINT, "arcade.payTo": PAYEE, "arcade.chain": "eip155:5042002", "arcade.priceAtomic": "120000"
})[key] ?? null })
const fixtureFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const request = new Request(input, init)
  if (request.url === `${HUB}/listings`) return Response.json([{ id: "diff-triage", serviceName: "Diff", description: "Fixture", price: "$0.12", seller: SELLER }])
  if (request.url !== ENDPOINT) throw Error("PRIVATE_UNEXPECTED_URL")
  quoteRequests.push(request)
  return Response.json({ x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:5042002", amount,
    asset: "0x3600000000000000000000000000000000000000", payTo: PAYEE, resource: ENDPOINT,
    maxTimeoutSeconds: 604900, extra: {}, ...requirements }] }, { status })
}
beforeEach(async () => {
  vi.stubEnv("ARCADE_HUB", HUB); vi.stubEnv("ARCADE_NETWORK", "arc-testnet")
  vi.stubEnv("ARCADE_ENS_ROOT", "arcade.eth"); vi.stubEnv("ARCADE_BUYER_KEY", KEY)
  vi.stubEnv("ARCADE_MAX_CALL_USD", "$0.50"); vi.stubEnv("ARCADE_SESSION_BUDGET_USD", "$0.60")
  amount = "120000"; requirements = {}; status = 402; quoteRequests = []
  vi.stubGlobal("fetch", vi.fn(fixtureFetch))
  vi.spyOn(ensPolicy, "sepoliaEnsReader").mockReturnValue(validReader())
  m = await import("../src/mcp.ts"); m.__resetBudget(); m.__setCallSkill(() => Effect.succeed(result()))
})
afterEach(() => { m?.__resetBudget(); m?.__setCallSkill(undefined); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("MCP by-name authority before account access", () => {
  it("advertises and executes by name through the real MCP transport with the same result fence", async () => {
    const call = vi.fn(() => Effect.succeed(result())); m.__setCallSkill(call)
    const server = m.createServer(), client = new Client({ name: "offline-ens-mcp", version: "1" })
    const [ct, st] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([client.connect(ct), server.connect(st)])
      const tool = (await client.listTools()).tools.find(t => t.name === "arcade_call_skill")!
      expect(Object.keys(tool.inputSchema.properties ?? {})).toContain("name")
      expect(tool.inputSchema.required).toEqual(["input"])
      expect(JSON.stringify(tool.inputSchema)).toContain('"oneOf":[{"required":["skillId"]},{"required":["name"]}]')
      const out = CallToolResultSchema.parse(await client.callTool({ name: "arcade_call_skill", arguments: { name: NAME, input: INPUT } }))
      expect(out.isError).not.toBe(true); expect(textOf(out)).toContain(NAME)
      expect(out.structuredContent).toMatchObject({ name: NAME, jobId: "job_offline", pricePaidUsdc: "0.120000" })
      expect(textOf(out).split("<<<UNTRUSTED:test>>>")[0]).not.toContain("SELLER_UNTRUSTED")
      expect(out.structuredContent?.result).toEqual({ instruction: "SELLER_UNTRUSTED" })
      expect(call).toHaveBeenCalledWith(expect.objectContaining({ name: NAME, expectedHubUrl: HUB, maxAmountAtomic: 120000n, input: INPUT }))
      expect(quoteRequests).toHaveLength(1)
      expect(await quoteRequests[0]!.clone().json()).toEqual(INPUT)
      expect(quoteRequests[0]!.redirect).toBe("error"); expect(quoteRequests[0]!.credentials).toBe("omit")
      for (const header of ["authorization", "cookie", "x-payment", "x-payment-signature", HEADER_PAYMENT_SIGNATURE]) expect(quoteRequests[0]!.headers.has(header)).toBe(false)
      expect(JSON.stringify(out)).not.toContain(KEY)
    } finally { await client.close(); await server.close() }
  })
  it.each([{ input: INPUT }, { skillId: "diff-triage", name: NAME, input: INPUT }])("refuses ambiguous routing before discovery or key access: %j", async args => {
    vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_INVALID_KEY")
    const call = vi.fn(() => Effect.succeed(result())); m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", args)
    expect(out.isError).toBe(true); expect(textOf(out)).toMatch(/exactly one.*skillId.*name/i)
    expect(fetch).not.toHaveBeenCalled(); expect(call).not.toHaveBeenCalled(); expect(textOf(out)).not.toContain("PRIVATE")
  })
  it.each(["missing", "unavailable"] as const)("reports %s resolution honestly without contacting the hub or reading the buyer key", async mode => {
    vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_INVALID_KEY")
    vi.mocked(ensPolicy.sepoliaEnsReader).mockReturnValue({ getEnsText: async () => { if (mode === "unavailable") throw Error("PRIVATE_RPC_TOKEN"); return null } })
    const out = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(out.isError).toBe(true); expect(textOf(out)).toContain(mode === "missing" ? "ens_name_expired" : "ens_resolution_unavailable")
    expect(textOf(out)).toContain("Nothing was signed"); expect(textOf(out)).not.toContain("PRIVATE")
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ amount: "-1" }, { amount: "01" }, { amount: (2n ** 256n).toString() }, { amount: "1.2" },
    { payTo: SELLER }, { network: "eip155:1" }, { asset: SELLER }, { resource: `${ENDPOINT}/other` }, { maxTimeoutSeconds: 0 }])(
    "refuses an unsafe quote before invoking a spending dependency: %j", async change => {
      requirements = change; vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_INVALID_KEY")
      const call = vi.fn(() => Effect.succeed(result())); m.__setCallSkill(call)
      const out = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
      expect(out.isError).toBe(true); expect(textOf(out)).toMatch(/quote|ens_payto_mismatch/)
      expect(call).not.toHaveBeenCalled(); expect(textOf(out)).not.toContain("PRIVATE")
    })
  it("does not fall back to an advertised ENS price when the endpoint does not issue a 402", async () => {
    status = 200; const call = vi.fn(() => Effect.succeed(result())); m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(out.isError).toBe(true); expect(textOf(out)).toMatch(/quote/i); expect(call).not.toHaveBeenCalled()
  })
  it("aborts and cancels a stalled quote body without reaching the key", async () => {
    vi.useFakeTimers(); vi.stubEnv("ARCADE_BUYER_KEY", "PRIVATE_INVALID_KEY")
    let cancelled = false, signal: AbortSignal | null | undefined
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      signal = new Request(input, init).signal
      return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true } }), { status: 402 })
    }))
    const pending = m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    await vi.advanceTimersByTimeAsync(10001)
    const out = await pending
    expect(out.isError).toBe(true); expect(textOf(out)).toMatch(/quote/i)
    expect(signal?.aborted).toBe(true); expect(cancelled).toBe(true); expect(textOf(out)).not.toContain("PRIVATE")
  })
  it("cancels an uncooperative quote response that arrives after the deadline", async () => {
    vi.useFakeTimers()
    let release!: (response: Response) => void, cancelled = false
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
    const pending = m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    await vi.advanceTimersByTimeAsync(10001)
    expect((await pending).isError).toBe(true)
    release(new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true } }), { status: 402 }))
    await vi.advanceTimersByTimeAsync(1)
    expect(cancelled).toBe(true)
  })
  it("uses the real SDK's last signing gate when a payee changes after the MCP quote", async () => {
    m.__setCallSkill(undefined)
    let probes = 0, paid = 0
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      if (request.headers.has(HEADER_PAYMENT_SIGNATURE)) { paid++; throw Error("PRIVATE_MUST_NOT_PAY") }
      probes++; if (probes > 1) requirements = { payTo: SELLER }
      return fixtureFetch(input, init)
    }))
    const out = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(out.isError).toBe(true); expect(textOf(out)).toContain("ens_payto_mismatch")
    expect(textOf(out)).toContain("Nothing was signed"); expect(textOf(out)).not.toContain("PRIVATE")
    expect(probes).toBe(2); expect(paid).toBe(0)
    // Proven beforeSign refusal must not leave a reservation as though it were paid.
    vi.stubGlobal("fetch", vi.fn(fixtureFetch)); requirements = {}; amount = "500000"
    m.__setCallSkill(() => Effect.succeed({ ...result({ settled: true, price: "$0.50" }), authorizedAmountAtomic: 500000n }))
    expect((await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })).isError).not.toBe(true)
  })
  it("carries the same quote cap through a real offline signature, paid retry and correlated poll", async () => {
    m.__setCallSkill(undefined)
    const requests: Request[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init); requests.push(request)
      if (request.method === "GET") return Response.json({ job_id: "job_offline", status: "succeeded", result: { instruction: "SELLER_UNTRUSTED" }, receipt: { settled: true, price: "$0.12", settleTx: TX } })
      if (request.headers.has(HEADER_PAYMENT_SIGNATURE)) return Response.json({ job_id: "job_offline", poll_url: `${HUB}/jobs/job_offline/result` }, { status: 202 })
      return fixtureFetch(input, init)
    }))
    const out = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(out.isError).not.toBe(true); expect(m.spentSoFarAtomic()).toBe(120000n)
    expect(requests).toHaveLength(4)
    const paid = requests.filter(r => r.headers.has(HEADER_PAYMENT_SIGNATURE))
    expect(paid).toHaveLength(1)
    expect(decodeHeaderJson(paid[0]!.headers.get(HEADER_PAYMENT_SIGNATURE)!)).toMatchObject({ payload: { authorization: { value: "120000", to: PAYEE } } })
    expect(requests.every(r => r.redirect === "error" && r.credentials === "omit")).toBe(true)
    expect(textOf(out).split("<<<UNTRUSTED:")[0]).not.toContain("SELLER_UNTRUSTED")
  })
})

describe("one budget boundary for ID and ENS purchases", () => {
  it("serializes concurrent purchases so the second cannot spend the first one's reservation", async () => {
    amount = "400000"
    let release!: (value: SkillResult) => void
    const call = vi.fn(() => Effect.promise(() => new Promise<SkillResult>(resolve => { release = resolve })))
    m.__setCallSkill(call)
    const first = m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    const second = m.handleTool("arcade_call_skill", { skillId: "diff-triage", input: INPUT })
    try {
      await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1))
      expect(call).toHaveBeenCalledWith(expect.objectContaining({ maxAmountAtomic: 400000n }))
      release(result({ settled: true, price: "$0.40", settleTx: TX }))
      expect((await first).isError).not.toBe(true)
      const refusal = await second
      expect(refusal.isError).toBe(true); expect(textOf(refusal)).toMatch(/remains of this session/)
      expect(call).toHaveBeenCalledTimes(1); expect(m.spentSoFarAtomic()).toBe(400000n)
    } finally { release?.(result({ settled: false })); await Promise.allSettled([first, second]) }
  })
  it.each(["failure", "defect"] as const)("retains budget for an uncertain paid %s and never claims the balance is unchanged", async mode => {
    amount = "400000"
    const call = vi.fn(() => mode === "failure" ? Effect.fail(new RpcFailure({ method: "poll", reason: "PRIVATE_RPC" })) : Effect.die(Error("PRIVATE_DEFECT")))
    m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(out.isError).toBe(true); expect(textOf(out)).toMatch(/uncertain|unconfirmed/i); expect(textOf(out)).toMatch(/reserv/i)
    expect(textOf(out)).not.toMatch(/balance is unchanged|Nothing settled|PRIVATE/)
    const next = await m.handleTool("arcade_call_skill", { skillId: "diff-triage", input: INPUT })
    expect(next.isError).toBe(true); expect(textOf(next)).toMatch(/remains of this session/)
    expect(call).toHaveBeenCalledTimes(1); expect(m.spentSoFarAtomic()).toBe(0n)
  })
  it("releases a terminal explicit non-settlement but accounts the actual lower settled price", async () => {
    amount = "400000"
    const call = vi.fn().mockImplementationOnce(() => Effect.succeed(result({ settled: false, reason: "engine refusal" })))
      .mockImplementation(() => Effect.succeed(result({ settled: true, price: "$0.20", settleTx: TX })))
    m.__setCallSkill(call)
    expect((await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })).isError).not.toBe(true)
    const paid = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(paid.isError).not.toBe(true); expect(paid.structuredContent?.pricePaidUsdc).toBe("0.200000")
    expect(m.spentSoFarAtomic()).toBe(200000n)
    expect((await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })).isError).not.toBe(true)
    expect(m.spentSoFarAtomic()).toBe(400000n)
  })
  it.each([{ settled: true }, { settled: true, price: "$0.90" }, { settled: false }])("does not release or invent settlement from malformed/nonterminal output: %j", async receipt => {
    amount = "400000"
    const call = vi.fn(() => Effect.succeed({ ...result(receipt), status: "pending" })); m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(out.isError).toBe(true); expect(textOf(out)).toMatch(/uncertain|unconfirmed/i)
    expect((await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })).isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(1)
  })
  it("does not let a forged lower receipt price release locally authorized spending", async () => {
    amount = "400000"
    const call = vi.fn(() => Effect.succeed({ ...result({ settled: true, price: "$0.01" }), authorizedAmountAtomic: 400000n })); m.__setCallSkill(call)
    const out = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(out.isError).toBe(true); expect(textOf(out)).toMatch(/uncertain|unconfirmed/i)
    const next = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(next.isError).toBe(true); expect(call).toHaveBeenCalledTimes(1)
  })
  it("retains a real SDK signature's reservation when a hostile hub reports terminal non-settlement", async () => {
    amount = "400000"; m.__setCallSkill(undefined)
    const authorizations: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      if (request.method === "GET") return Response.json({ job_id: "job_offline", status: "failed", result: null, receipt: { settled: false, reason: "engine refusal" } })
      const header = request.headers.get(HEADER_PAYMENT_SIGNATURE)
      if (header) {
        authorizations.push(decodeHeaderJson(header))
        return Response.json({ job_id: "job_offline", poll_url: `${HUB}/jobs/job_offline/result` }, { status: 202 })
      }
      return fixtureFetch(input, init)
    }))
    const first = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(first.isError).toBe(true); expect(textOf(first)).toMatch(/uncertain|unconfirmed/i)
    expect(textOf(first)).not.toMatch(/you were not charged|balance.*unchanged/i)
    const second = await m.handleTool("arcade_call_skill", { name: NAME, input: INPUT })
    expect(second.isError).toBe(true); expect(textOf(second)).toMatch(/remains of this session/)
    expect(authorizations).toHaveLength(1)
    expect(authorizations[0]).toMatchObject({ payload: { authorization: { value: "400000", to: PAYEE } } })
    expect(m.spentSoFarAtomic()).toBe(0n)
  })
})
