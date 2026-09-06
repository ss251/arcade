import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { privateKeyToAccount } from "viem/accounts"
import { recoverTypedDataAddress } from "viem"
import { quotePurchaseContext } from "../src/lib/purchase-quote.ts"
import { createPurchaseApprovalScope } from "../src/lib/purchase-approval.ts"
import { runPurchase } from "../src/lib/purchase-run.ts"
import { readOrdinaryResult } from "../src/lib/ordinary-job-http.ts"
import { decodePurchaseOutcome } from "../src/lib/purchase-outcome.ts"
import { KEY } from "../src/lib/job-store.ts"

const HUB = "https://hub.example", WEB = "https://web.example"
const SELLER = `0x${"1".repeat(40)}`, PAYEE = `0x${"2".repeat(40)}`, ID = "usdc-flow-check"
const NAME = `${ID}.seller.arcade.eth`, RESOURCE = `/x/${SELLER}/${ID}`, INPUT = { address: SELLER }
const JOB = `job_${"a".repeat(32)}`, TOKEN = "b".repeat(32), HASH = `0x${"c".repeat(64)}`
const REQ = { scheme: "exact", amount: "10000", payTo: PAYEE, asset: "0x3600000000000000000000000000000000000000",
  network: "eip155:5042002", resource: HUB + RESOURCE, maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" } }
const request = (body: unknown) => new Request(WEB + "/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
beforeEach(() => { vi.stubEnv("ARCADE_HUB", HUB); vi.stubEnv("ARCADE_NETWORK", "arc-testnet"); vi.stubGlobal("location", { origin: WEB }) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks() })

async function setup() {
  const { handleQuote } = await import("../src/routes/api.quote.ts")
  const account = privateKeyToAccount(`0x${"01".repeat(32)}`) // PUBLIC offline fixture, never an owner key.
  const memory = new Map<string, string>(), inputs: unknown[] = []
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) } })
  let signed = false, expired = false, expireAfterSigning = false, nonce = "", signature = ""
  type Wire = Parameters<typeof account.signTypedData>[0]
  let wire: Wire | undefined
  const provider = { request: vi.fn(async ({ method, params }: { method: string; params?: ReadonlyArray<unknown> }) => {
    if (method === "eth_chainId") return "0x4cef52"
    if (method === "eth_accounts") return [account.address]
    if (method !== "eth_signTypedData_v4") throw Error("unexpected offline fixture RPC")
    wire = JSON.parse(params?.[1] as string) as Wire
    signature = await account.signTypedData(wire); signed = true; return signature
  }) }
  const receipt = () => ({ jobId: JOB, skillId: ID, skillVersion: "1.0.0", seller: SELLER, buyer: account.address,
    network: REQ.network, priceAtomic: "10000", sellerAtomic: "9500", feeAtomic: "500", feeBps: 500,
    rail: "eip3009", settled: true, settleTx: HASH, authorizationNonce: nonce, latencyMs: 10, createdAtMs: Date.now() })
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url), headers = new Headers(init?.headers)
    if (u === WEB + "/api/quote") return handleQuote({ request: new Request(u, init) })
    expect(init?.redirect).toBe("error"); expect(init?.credentials).toBe("omit")
    if (u === HUB + "/listings/" + ID) return Response.json({ id: ID, seller: SELLER, ensName: NAME, version: "1.0.0",
      serviceName: "USDC Flow Check", description: "Public fixture", tags: [], price: "$0.01", inputSchema: {}, outputSchema: {}, bounds: { timeoutSec: 30 } })
    if (u === HUB + "/names/" + NAME) return Response.json({ name: NAME, skillId: ID, seller: SELLER,
      endpoint: HUB + RESOURCE, payTo: PAYEE, chain: REQ.network, priceAtomic: null, expired: expired || signed && expireAfterSigning })
    if (u === HUB + RESOURCE) {
      inputs.push(JSON.parse(String(init?.body)))
      if (!headers.has("payment-signature")) return Response.json({ x402Version: 2, rail: "eip3009", accepts: [REQ] }, { status: 402 })
      const payment = JSON.parse(atob(headers.get("payment-signature")!))
      expect(payment.accepted).toEqual(REQ); expect(payment.payload.signature).toBe(signature)
      expect(await recoverTypedDataAddress({ ...wire!, signature: signature as `0x${string}` })).toBe(account.address)
      expect([...headers.keys()]).toEqual(["accept", "content-type", "payment-signature"])
      nonce = payment.payload.authorization.nonce
      return Response.json({ job_id: JOB, job_token: TOKEN, status: "queued", price: "$0.01",
        poll_url: "https://ignored.example/never-follow?token=UNTRUSTED" }, { status: 202 })
    }
    if (u === HUB + "/jobs/" + JOB + "/result") {
      expect([...headers]).toEqual([["accept", "application/json"], ["x-job-token", TOKEN]])
      expect(memory.get(KEY)).toContain(TOKEN)
      return Response.json({ job_id: JOB, status: "succeeded", receipt: receipt(), result: { checked: true } })
    }
    throw Error("PRIVATE_UNEXPECTED_URL")
  })
  vi.stubGlobal("fetch", f)
  return { f, memory, inputs, provider, account, handleQuote, receipt,
    expire: () => { expired = true }, expireOnSignature: () => { expireAfterSigning = true } }
}

describe("E13 actual-input ENS regression on direct browser boundaries", () => {
  it("POST quotes actual input and returns the complete verified browser context", async () => {
    const s = await setup(), context = await quotePurchaseContext(ID, INPUT)
    expect(context).toMatchObject({ ensName: NAME, payTo: PAYEE, rail: "eip3009", requirements: REQ })
    expect(s.inputs).toEqual([INPUT])
    const [url, init] = s.f.mock.calls[0]!
    expect(url).toBe(WEB + "/api/quote")
    expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" })
    expect(JSON.parse(String(init?.body))).toEqual({ skillId: ID, input: INPUT })
  })
  it("contains quote diagnostics and fails closed on expired ENS", async () => {
    const s = await setup(); s.expire()
    await expect(quotePurchaseContext(ID, INPUT)).rejects.toThrow(/^Purchase terms unavailable$/)
    s.f.mockRejectedValue(Error("PRIVATE_PROVIDER_DIAGNOSTIC"))
    const response = await s.handleQuote({ request: request({ skillId: ID, input: INPUT }) })
    expect(response.status).toBe(502); expect(await response.text()).not.toMatch(/PRIVATE_|0x111111/)
  })
  it.each([false, true])("rechecks actual-input ENS around signing (expire after signature: %s), never forwards stale terms", async after => {
    const s = await setup(), context = await quotePurchaseContext(ID, INPUT)
    const binding = { approvalId: "approval_e13", toolCallId: "call_e13", toolName: "arcade_call_skill",
      skillId: ID, maxAmountUsd: "$0.02", input: INPUT }
    const scope = createPurchaseApprovalScope(), token = scope.approve({ ...binding, context })!
    if (after) s.expireOnSignature(); else s.expire()
    const result = await runPurchase(scope, token, binding, { provider: s.provider, buyer: s.account.address })
    expect(result.phase).toBe(after ? "unconfirmed" : "refused")
    expect(s.provider.request.mock.calls.filter(([a]) => a.method === "eth_signTypedData_v4")).toHaveLength(after ? 1 : 0)
    expect(s.f.mock.calls.filter(([, init]) => new Headers(init?.headers).has("payment-signature"))).toHaveLength(0)
    expect(s.inputs.every(v => JSON.stringify(v) === JSON.stringify(INPUT))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|you were not charged/)
  })
  it("runs real quote/ENS/shared signer/direct POST/header recovery once, without sending private data to the web server", async () => {
    const s = await setup(), context = await quotePurchaseContext(ID, INPUT)
    const binding = { approvalId: "approval_e13", toolCallId: "call_e13", toolName: "arcade_call_skill",
      skillId: ID, maxAmountUsd: "$0.02", input: INPUT }
    const scope = createPurchaseApprovalScope(), token = scope.approve({ ...binding, context })!
    const result = await runPurchase(scope, token, binding, { provider: s.provider, buyer: s.account.address })
    expect(result).toMatchObject({ phase: "settled", recovery: "stored", outcome: { source: "hub", resultJson: '{"checked":true}' } })
    expect(s.inputs).toEqual([INPUT, INPUT, INPUT, INPUT])
    expect(s.f.mock.calls.filter(([, init]) => new Headers(init?.headers).has("payment-signature"))).toHaveLength(1)
    expect(s.f.mock.calls.filter(([url]) => String(url).startsWith(WEB)).every(([, init]) => !String(init?.body).includes("signature"))).toBe(true)
    expect(s.f.mock.calls.some(([url]) => String(url).includes("?") || String(url).includes("/api/settle"))).toBe(false)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    for (const status of ["bounds_exceeded", "runner_lost", "rejected"]) {
      const { settleTx: ignored, ...receipt } = s.receipt()
      const closed = decodePurchaseOutcome({ job_id: JOB, status, result: { private: "unpaid" }, receipt: { ...receipt, settled: false } },
        { row: { jobId: JOB, token: TOKEN, hubOrigin: HUB, skillId: ID, priceAtomic: "10000", createdAtMs: Date.now(), realm: "ordinary" },
          context, buyer: s.account.address, nonce: receipt.authorizationNonce })
      expect(closed).toMatchObject({ settled: false, resultJson: null, reference: null })
    }
  })
  it("allows a legitimate 15-second read-only long poll without another paid call", async () => {
    vi.useFakeTimers()
    const f = vi.fn(() => new Promise<Response>(resolve => setTimeout(() => resolve(Response.json({ job_id: JOB, status: "pending" })), 15000)))
    const row = { jobId: JOB, token: TOKEN, hubOrigin: HUB, skillId: ID, priceAtomic: "10000", createdAtMs: Date.now(), realm: "ordinary" as const }
    const reading = readOrdinaryResult(row, {}, f as typeof fetch)
    await vi.advanceTimersByTimeAsync(15000)
    expect(await reading).toMatchObject({ status: 200, body: { job_id: JOB } })
    expect(f).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
})
// Retired courier's hostile-URL/status/90s/correlation cases now reside at the
// actual boundaries: ordinary-payment-http, ordinary-job-http, purchase-run,
// purchase-outcome. settle-retired separately proves the old endpoint has zero IO.
