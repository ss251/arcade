import { describe, expect, it } from "vitest"
import { formatPrice } from "@arcade/core"
import { createEscrowBuyerHttp } from "../src/erc8183-buyer-http.ts"
import { buyerFixture, hash } from "./fixtures/erc8183-buyer.ts"
const body = JSON.stringify({ fixture: true })
async function fixture() {
  const f = await buyerFixture(), controller = new AbortController(), calls: { url: string; init: RequestInit }[] = []
  const jobId = "job_" + "a".repeat(32), token = "b".repeat(32)
  const root = { job_id: jobId, status: "queued", job_token: token, price: formatPrice(f.intent.call.amount),
    poll_url: `https://example.test/jobs/${jobId}/result?token=${token}` }
  const budget = { status: "budget_set", jobId: "7", budget: "300000", token: f.intent.call.token,
    escrow: f.intent.call.escrow, budgetTx: hash(88), fundBy: f.intent.fundBy }
  const health = { ok: true, rail: "gateway", rails: ["gateway", "erc8183"], network: "eip155:5042002", erc8183: f.intent.identity }
  const fetch = (async (url, init) => {
    const target = String(url); calls.push({ url: target, init: init! })
    return Response.json(target.endsWith("/healthz") ? health : target.endsWith("/escrow") ? budget : root,
      { status: target === f.intent.call.resource ? 202 : 200 })
  }) as typeof globalThis.fetch
  const options = { fetch, signal: controller.signal, deadlineMs: performance.now() + 30000 }
  return { ...f, controller, calls, options, health, budget, root, http: createEscrowBuyerHttp(options) }
}
describe("bounded private buyer HTTP contracts (fake fetch only)", () => {
  it("checks local health pins, posts closed budget, and returns captured actual32hex202 response", async () => {
    const f = await fixture(), signal = f.controller.signal
    await f.http.health(f.intent, signal)
    expect(await f.http.budget(f.intent, 7n, f.input.capability, body, signal)).toEqual({ budgetTx: hash(88), fundBy: f.intent.fundBy })
    const result = await f.http.root(f.intent, 7n, f.input.capability, body, signal)
    expect(await result.response().json()).toEqual(f.root)
    expect(result.accepted).toEqual({ jobId: f.root.job_id, token: f.root.job_token, pollUrl: f.root.poll_url })
    const budgetRequest = f.calls[1]!, rootRequest = f.calls[2]!
    expect(JSON.parse(String(budgetRequest.init.body))).toEqual({ input: { fixture: true }, payment: {
      x402Version: 2, accepted: JSON.parse(JSON.stringify(f.intent.requirements)), payload: { jobId: "7", capability: f.input.capability }
    } })
    expect(new Headers(budgetRequest.init.headers).has("payment-signature")).toBe(false)
    const header = new Headers(rootRequest.init.headers).get("payment-signature")!
    expect(JSON.parse(Buffer.from(header, "base64").toString()).payload).toEqual({ jobId: "7", capability: f.input.capability })
    for (const call of f.calls) expect(call.init).toMatchObject({ redirect: "error", credentials: "omit" })
    f.root.job_token = "c".repeat(32)
    expect(result.accepted.token).toBe("b".repeat(32))
    await expect(f.http.budget(f.intent, 7n, f.input.capability, body, signal)).rejects.toThrow("escrow_buyer_http_refused")
    await expect(f.http.root(f.intent, 7n, f.input.capability, body, signal)).rejects.toThrow("escrow_buyer_http_refused")
    expect(f.calls).toHaveLength(3)
  })
  it.each(["budget", "root"] as const)("binds actual input and capability before %s dispatch", async kind => {
    for (const [capability, requestBody] of [[hash(78), body], [hash(77), '{"fixture":false}'], [hash(77), ' {"fixture":true}']]) {
      const f = await fixture()
      await expect(f.http[kind](f.intent, 7n, capability, requestBody!, f.controller.signal)).rejects.toThrow("escrow_buyer_http_refused")
      expect(f.calls).toHaveLength(0)
    }
  })
  it.each(["evaluator", "treasury", "proxyCodeHash"])("refuses wrong health %s", async key => {
    const f = await fixture()
    f.health.erc8183 = { ...f.health.erc8183, [key]: key === "proxyCodeHash" ? hash(99) : "0x" + "09".repeat(20) }
    await expect(f.http.health(f.intent, f.controller.signal)).rejects.toThrow("escrow_buyer_http_refused")
  })
  it.each([{ ok: false }, { network: "eip155:1" }, { rail: "test" }, { rails: ["gateway"] }])("refuses unavailable/mismatched health metadata: %o", async patch => {
    const f = await fixture(); Object.assign(f.health, patch)
    await expect(f.http.health(f.intent, f.controller.signal)).rejects.toThrow("escrow_buyer_http_refused")
  })
  it.each([{ jobId: "8" }, { budget: "300001" }, { fundBy: 2141 }, { budgetTx: "0x" }, { extra: true }])("refuses bad budget response: %o", async patch => {
    const f = await fixture(); Object.assign(f.budget, patch)
    await expect(f.http.budget(f.intent, 7n, f.input.capability, body, f.controller.signal)).rejects.toThrow("escrow_buyer_http_refused")
  })
  it.each([{ job_id: "job_invalid" }, { status: "done" }, { job_token: "b".repeat(64) }, { price: "0.31" },
    { poll_url: "https://elsewhere.test/result" }, { extra: true }])("refuses bad root response: %o", async patch => {
    const f = await fixture(); Object.assign(f.root, patch)
    await expect(f.http.root(f.intent, 7n, f.input.capability, body, f.controller.signal)).rejects.toThrow("escrow_buyer_http_refused")
  })
  it("bounds a never-ending body and ignores private failure text without retrying", async () => {
    const f = await fixture(); let requests = 0, canceled = 0
    const fetch = (async () => { requests++; return new Response(new ReadableStream({ cancel() { canceled++ } }),
      { headers: { "content-type": "application/json" } }) }) as unknown as typeof globalThis.fetch
    const http = createEscrowBuyerHttp({ ...f.options, fetch, deadlineMs: performance.now() + 30 })
    await expect(http.budget(f.intent, 7n, f.input.capability, body, f.controller.signal)).rejects.toThrow(/^escrow_buyer_http_refused$/)
    await expect(http.budget(f.intent, 7n, f.input.capability, body, f.controller.signal)).rejects.toThrow(/^escrow_buyer_http_refused$/)
    expect(requests).toBe(1); expect(canceled).toBe(1)
  })
})
