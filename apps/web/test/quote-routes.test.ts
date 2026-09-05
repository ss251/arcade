import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const HUB = "https://hub.example"
const SELLER = `0x${"1".repeat(40)}`
const PAYEE = `0x${"2".repeat(40)}`
const ID = "usdc-flow-check"
const NAME = `${ID}.seller.arcade.eth`
const RESOURCE = `/x/${SELLER}/${ID}`
const INPUT = { address: SELLER }
const AUTH = { from: SELLER, to: PAYEE, value: "10000", validAfter: "0", validBefore: "2000000000", nonce: `0x${"a".repeat(64)}`, signature: `0x${"b".repeat(130)}` }
const REQ = { scheme: "exact", amount: "10000", payTo: PAYEE, asset: "0x3600000000000000000000000000000000000000", network: "eip155:5042002", resource: HUB + RESOURCE, maxTimeoutSeconds: 604900 }
const receipt = (settled = true) => ({ jobId: "job_1", skillId: ID, seller: SELLER, buyer: SELLER,
  network: REQ.network, priceAtomic: "10000", settled, ...(settled ? { settleTx: `0x${"c".repeat(64)}` } : {}) })
const request = (body: unknown, path = "quote") => new Request(`https://web.example/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const stub = (paid?: { status: number; body: unknown }, pollBody: unknown = { job_id: "job_1", status: "succeeded", receipt: receipt() }) => {
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes("/listings/")) return Response.json({ id: ID, seller: SELLER, ensName: NAME })
    if (u.includes("/names/")) return Response.json({ name: NAME, skillId: ID, seller: SELLER, endpoint: HUB + RESOURCE, payTo: PAYEE, chain: REQ.network, expired: false })
    if (u.includes("/x/")) {
      if (new Headers(init?.headers).has("payment-signature")) return Response.json(paid?.body ?? { job_id: "job_1", status: "succeeded", receipt: receipt() }, { status: paid?.status ?? 200 })
      return Response.json({ x402Version: 2, accepts: [REQ] }, { status: 402 })
    }
    if (u.includes("/jobs/")) return Response.json(pollBody)
    throw new Error("secret provider diagnostic")
  })
  vi.stubGlobal("fetch", f)
  return f
}
beforeEach(() => { vi.resetModules(); vi.stubEnv("ARCADE_HUB", HUB); vi.stubEnv("ARCADE_NETWORK", "arc-testnet") })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe("web ENS quotes — actual route and browser transport", () => {
  it("POST carries actual input and returns only the verified name", async () => {
    const f = stub()
    const { handleQuote } = await import("../src/routes/api.quote.ts")
    const response = await handleQuote({ request: request({ skillId: ID, input: INPUT }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ skillId: ID, ensName: NAME, payTo: PAYEE, price: "$0.01" })
    expect(JSON.parse(String(f.mock.calls.find(([url]) => String(url) === HUB + RESOURCE)?.[1]?.body))).toEqual(INPUT)
  })
  it("browser requests are POST, omit credentials and redirects, and do not leak input into URL", async () => {
    const f = vi.fn(async () => Response.json({ price: "$0.01", payTo: PAYEE, network: REQ.network, ensName: NAME }))
    vi.stubGlobal("fetch", f)
    const { fetchQuote } = await import("../src/components/chat.tsx")
    expect(await fetchQuote(ID, INPUT)).toMatchObject({ ensName: NAME })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/quote")
    expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" })
    expect(JSON.parse(String(init.body))).toEqual({ skillId: ID, input: INPUT })
  })
  it("quote errors never echo private endpoint diagnostics or input", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret provider diagnostic") }))
    const { handleQuote } = await import("../src/routes/api.quote.ts")
    const response = await handleQuote({ request: request({ skillId: ID, input: INPUT }) })
    expect(response.status).toBe(502)
    expect(await response.text()).not.toMatch(/secret|0x111111/)
  })
})

describe("signed relay — no redirected payment or untrusted polling", () => {
  it("refuses signed payee disagreement before sending any signature", async () => {
    const f = stub()
    const { handleSettle } = await import("../src/routes/api.settle.ts")
    const response = await handleSettle({ request: request({ skillId: ID, input: INPUT, authorization: { ...AUTH, to: SELLER } }, "settle") })
    expect(response.status).toBe(409)
    expect(f.mock.calls.some(([, init]) => new Headers(init?.headers).has("payment-signature"))).toBe(false)
  })
  it("requotes actual input, verifies ENS, and forwards the authorization exactly once without ambient authority", async () => {
    const f = stub()
    const { handleSettle } = await import("../src/routes/api.settle.ts")
    const response = await handleSettle({ request: request({ skillId: ID, input: INPUT, authorization: AUTH }, "settle") })
    expect(response.status).toBe(200)
    const paid = f.mock.calls.filter(([, init]) => new Headers(init?.headers).has("payment-signature"))
    expect(paid).toHaveLength(1)
    expect(paid[0]![1]).toMatchObject({ redirect: "error", credentials: "omit" })
    for (const [url, init] of f.mock.calls.filter(([url]) => String(url).includes("/x/"))) {
      expect(String(url)).toBe(HUB + RESOURCE)
      expect(JSON.parse(String(init?.body))).toEqual(INPUT)
    }
    expect(f.mock.calls.some(([url]) => String(url) === `${HUB}/names/${NAME}`)).toBe(true)
  })
  it.each([
    "https://foreign.example/jobs/job_1/result",
    `${HUB}/jobs/other/result`, `${HUB}/jobs/job_1`, `${HUB}/jobs/job_1/result?token=bad`,
    `${HUB}/jobs/job_1/result?token=${"a".repeat(32)}&token=${"b".repeat(32)}`,
    `${HUB}/x/${SELLER}/${ID}`, `${HUB}/jobs/job_1/result#fragment`,
    `${HUB}/jobs/a/../job_1/result`, `https://user:password@hub.example/jobs/job_1/result`
  ])("never follows an invalid poll target %s", async poll_url => {
    vi.useFakeTimers()
    const f = stub({ status: 202, body: { job_id: "job_1", poll_url } })
    const { handleSettle } = await import("../src/routes/api.settle.ts")
    const result = handleSettle({ request: request({ skillId: ID, input: INPUT, authorization: AUTH }, "settle") })
    await vi.advanceTimersByTimeAsync(1100)
    expect((await result).status).toBe(502)
    expect(f.mock.calls).toHaveLength(4) // listing, challenge, ENS, paid; never a poll
  })
  it("accepts only its correlated same-origin token poll and sends no payment header on GET", async () => {
    vi.useFakeTimers()
    const f = stub({ status: 202, body: { job_id: "job_1", poll_url: `${HUB}/jobs/job_1/result?token=${"a".repeat(32)}` } })
    const { handleSettle } = await import("../src/routes/api.settle.ts")
    const result = handleSettle({ request: request({ skillId: ID, input: INPUT, authorization: AUTH }, "settle") })
    await vi.advanceTimersByTimeAsync(1100)
    expect((await result).status).toBe(200)
    const [, init] = f.mock.calls.at(-1)!
    expect(init).toMatchObject({ redirect: "error", credentials: "omit" })
    expect(new Headers(init?.headers).has("payment-signature")).toBe(false)
  })
  it("lets the hub's legitimate long-poll return after 15 seconds without resending payment", async () => {
    vi.useFakeTimers()
    const f = stub({ status: 202, body: { job_id: "job_1", poll_url: `${HUB}/jobs/job_1/result` } })
    const original = f.getMockImplementation()!
    f.mockImplementation((url, init) => String(url).includes("/jobs/")
      ? new Promise(resolve => setTimeout(() => resolve(Response.json({
          job_id: "job_1", status: "succeeded", result: { checked: true }, receipt: receipt()
        })), 15_000))
      : original(url, init))
    const { handleSettle } = await import("../src/routes/api.settle.ts")
    const result = handleSettle({ request: request({ skillId: ID, input: INPUT, authorization: AUTH }, "settle") })
    await vi.advanceTimersByTimeAsync(16_001)
    const response = await result
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ body: { job_id: "job_1", receipt: { settled: true } } })
    expect(f.mock.calls.filter(([, init]) => new Headers(init?.headers).has("payment-signature"))).toHaveLength(1)
    expect(f.mock.calls.filter(([url]) => String(url).includes("/jobs/"))).toHaveLength(1)
  })
  it("retains the overall 90-second result deadline, cancels the stalled body, and never resends payment", async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    let pollSignal: AbortSignal | null | undefined
    const f = stub({ status: 202, body: { job_id: "job_1", poll_url: `${HUB}/jobs/job_1/result` } })
    const original = f.getMockImplementation()!
    f.mockImplementation((url, init) => {
      if (!String(url).includes("/jobs/")) return original(url, init)
      pollSignal = init?.signal
      return Promise.resolve(new Response(new ReadableStream({ cancel })))
    })
    const { handleSettle } = await import("../src/routes/api.settle.ts")
    let finished = false
    const result = handleSettle({ request: request({ skillId: ID, input: INPUT, authorization: AUTH }, "settle") }).then(response => { finished = true; return response })
    await vi.advanceTimersByTimeAsync(89_999)
    expect(finished).toBe(false)
    expect(pollSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(finished).toBe(true)
    const response = await result
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: "outcome_unconfirmed" })
    expect(pollSignal?.aborted).toBe(true)
    expect(cancel).toHaveBeenCalled()
    expect(f.mock.calls.filter(([, init]) => new Headers(init?.headers).has("payment-signature"))).toHaveLength(1)
    expect(f.mock.calls.filter(([url]) => String(url).includes("/jobs/"))).toHaveLength(1)
  })
  it.each(["bounds_exceeded", "runner_lost", "rejected"])("recognizes canonical terminal state %s", async status => {
    vi.useFakeTimers()
    stub({ status: 202, body: { job_id: "job_1", poll_url: `${HUB}/jobs/job_1/result` } }, { job_id: "job_1", status, receipt: receipt(false) })
    const { handleSettle } = await import("../src/routes/api.settle.ts")
    const result = handleSettle({ request: request({ skillId: ID, input: INPUT, authorization: AUTH }, "settle") })
    await vi.advanceTimersByTimeAsync(1100)
    expect((await result).status).toBe(200)
  })
  it.each([
    { job_id: "job_1", status: "succeeded" },
    { job_id: "job_1", status: "succeeded", receipt: { ...receipt(), jobId: "different" } },
    { job_id: "job_1", status: "running", receipt: receipt() },
    { job_id: "job_1", status: "failed", receipt: receipt() }
  ])("never labels malformed or contradictory terminal response as success %j", async body => {
    stub({ status: 200, body })
    const { handleSettle } = await import("../src/routes/api.settle.ts")
    const response = await handleSettle({ request: request({ skillId: ID, input: INPUT, authorization: AUTH }, "settle") })
    expect(response.status).toBe(502)
    expect(await response.text()).toContain("outcome_unconfirmed")
  })
})
