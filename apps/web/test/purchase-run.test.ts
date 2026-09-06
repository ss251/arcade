import { afterEach, describe, expect, it, vi } from "vitest"
import chain from "../../../config/chains/arc-testnet.json"
import { createPurchaseApprovalScope } from "../src/lib/purchase-approval.ts"
import { createPurchaseRunner, type PurchaseRuntime, type PurchaseView } from "../src/lib/purchase-run.ts"
import { OrdinaryPaymentSignFailure } from "../src/lib/ordinary-payment-sign.ts"
import { runPurchase } from "../src/lib/purchase-run.ts"
import { privateKeyToAccount } from "viem/accounts"
import { recoverTypedDataAddress } from "viem"
import { KEY } from "../src/lib/job-store.ts"
import type { Eip1193Provider } from "../src/lib/wallet.ts"

const BUYER = `0x${"1".repeat(40)}`, SELLER = `0x${"3".repeat(40)}`
const ID = `job_${"a".repeat(32)}`, TOKEN = "b".repeat(32), NONCE = `0x${"4".repeat(64)}`, HASH = `0x${"5".repeat(64)}`
const resource = `/x/${SELLER}/diff-triage`, SIGNATURE = `0x${"6".repeat(128)}1b`
const context = () => ({ hubOrigin: "https://hub.example", skillId: "diff-triage", seller: SELLER, resource,
  amountAtomic: "10000", payTo: SELLER, asset: chain.usdc.address, network: chain.caip2, rail: "eip3009" as const,
  requirements: { scheme: "exact" as const, network: chain.caip2, amount: "10000", asset: chain.usdc.address,
    payTo: SELLER, resource: "https://hub.example" + resource, maxTimeoutSeconds: 604900, extra: { name: "USDC", version: "2" } } })
const binding = () => ({ approvalId: "approval_1", toolCallId: "call_1", toolName: "arcade_call_skill",
  skillId: "diff-triage", maxAmountUsd: "$0.02", input: { diff: "private actual input" } })
const row = () => ({ jobId: ID, token: TOKEN, skillId: "diff-triage", priceAtomic: "10000", createdAtMs: 10,
  hubOrigin: "https://hub.example", realm: "ordinary" as const })
const authorization = () => ({ from: BUYER, to: SELLER, value: "10000", validAfter: "0", validBefore: "1800604900", nonce: NONCE, signature: SIGNATURE })
const terminal = () => ({ status: 200, body: { job_id: ID, status: "succeeded", result: { report: "owned result" },
  receipt: { jobId: ID, skillId: "diff-triage", skillVersion: "1.0.0", buyer: BUYER, seller: SELLER,
    priceAtomic: "10000", sellerAtomic: "9500", feeAtomic: "500", feeBps: 500, rail: "eip3009", network: chain.caip2,
    settled: true, settleTx: HASH, authorizationNonce: NONCE, latencyMs: 20, createdAtMs: 9 } } })
const setup = () => {
  const order: string[] = [], updates: PurchaseView[] = [], provider = { request: vi.fn(async () => undefined) }
  const runtime: PurchaseRuntime = {
    quote: vi.fn(async () => { order.push("quote"); return context() }),
    sign: vi.fn(async () => { order.push("sign"); return authorization() }),
    submit: vi.fn(async () => { order.push("submit"); return row() }),
    remember: vi.fn(() => { order.push("remember"); return { status: "stored" as const, recovered: false } }),
    read: vi.fn(async () => { order.push("read"); return terminal() })
  }
  const scope = createPurchaseApprovalScope(), token = scope.approve({ ...binding(), context: context() })!
  const run = createPurchaseRunner(runtime)
  return { runtime, scope, token, order, updates, provider, run,
    execute: (options = {}) => run(scope, token, binding(), { provider, buyer: BUYER }, options, view => updates.push(view)) }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe("fresh-approved browser purchase composition", () => {
  it("consumes once, rechecks both quotes, stores before polling and returns a capability-free hub projection", async () => {
    const f = setup(), result = await f.execute()
    expect(f.order).toEqual(["quote", "sign", "quote", "submit", "remember", "read"])
    expect(result).toMatchObject({ phase: "settled", recovery: "stored", jobId: ID, outcome: { source: "hub", settled: true } })
    const serialized = JSON.stringify([result, f.updates])
    for (const secret of [TOKEN, SIGNATURE, NONCE, "private actual input"]) expect(serialized).not.toContain(secret)
    expect(f.runtime.quote).toHaveBeenNthCalledWith(1, "diff-triage", '{"diff":"private actual input"}', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(f.runtime.remember).toHaveBeenCalledWith(row())
    expect(f.runtime.read).toHaveBeenCalledWith(row(), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect((await f.execute()).phase).toBe("refused")
    expect(f.order).toHaveLength(6)
  })
  it("refuses forged tokens and altered bindings before any dependency", async () => {
    const f = setup()
    expect((await f.run(f.scope, {}, binding(), { provider: f.provider, buyer: BUYER })).phase).toBe("refused")
    expect((await f.run(f.scope, f.token, { ...binding(), input: {} }, { provider: f.provider, buyer: BUYER })).phase).toBe("refused")
    expect((await f.execute()).phase).toBe("refused"); expect(f.order).toEqual([])
  })
  it("refuses a simultaneous duplicate while the first quote is pending", async () => {
    const f = setup(); let resolve!: (v: ReturnType<typeof context>) => void
    vi.mocked(f.runtime.quote).mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const first = f.execute()
    expect((await f.execute()).phase).toBe("refused")
    resolve(context())
    expect((await first).phase).toBe("settled")
    expect(f.runtime.sign).toHaveBeenCalledTimes(1); expect(f.runtime.submit).toHaveBeenCalledTimes(1)
  })
  it.each(["before", "after"])("requires another decision for changed terms %s signing even below the ceiling", async when => {
    const f = setup(), changed = context()
    changed.amountAtomic = "15000"; changed.requirements.amount = "15000"
    if (when === "after") vi.mocked(f.runtime.quote).mockResolvedValueOnce(context())
    vi.mocked(f.runtime.quote).mockResolvedValueOnce(changed)
    const result = await f.execute()
    expect(result.phase).toBe(when === "before" ? "refused" : "unconfirmed")
    expect(result.message).toContain("terms changed")
    expect(f.runtime.sign).toHaveBeenCalledTimes(when === "before" ? 0 : 1)
    expect(f.runtime.submit).not.toHaveBeenCalled()
  })
  it.each(["hubOrigin", "rail", "ensName"])("refuses changed quote provenance %s", async field => {
    const f = setup()
    vi.mocked(f.runtime.quote).mockResolvedValueOnce({ ...context(), [field]: "changed" } as never)
    expect((await f.execute()).phase).toBe("refused")
    expect(f.runtime.sign).not.toHaveBeenCalled()
  })
  it.each(["unavailable", "capacity", "conflict", "invalid"] as const)("keeps current-run recovery private while surfacing storage %s", async status => {
    const f = setup(); vi.mocked(f.runtime.remember).mockReturnValue({ status })
    const result = await f.execute()
    expect(result).toMatchObject({ phase: "settled", recovery: status })
    expect(f.order.indexOf("read")).toBeGreaterThan(f.order.indexOf("submit"))
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
  it("surfaces recovered malformed storage and contains a thrown storage error", async () => {
    const f = setup(); vi.mocked(f.runtime.remember).mockReturnValue({ status: "stored", recovered: true })
    expect((await f.execute()).recovery).toBe("recovered")
    const g = setup(); vi.mocked(g.runtime.remember).mockImplementation(() => { throw Error(TOKEN) })
    expect(await g.execute()).toMatchObject({ phase: "settled", recovery: "unavailable" })
    expect(g.runtime.read).toHaveBeenCalledTimes(1)
  })
  it.each(["quote", "sign", "submit", "read"] as const)("contains private %s failures and never retries signing/payment", async method => {
    const f = setup(); vi.mocked(f.runtime[method]).mockRejectedValue(Error(TOKEN))
    const result = await f.execute()
    expect(result.phase).toBe(method === "quote" ? "refused" : "unconfirmed")
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(vi.mocked(f.runtime.sign).mock.calls.length).toBeLessThanOrEqual(1)
    expect(vi.mocked(f.runtime.submit).mock.calls.length).toBeLessThanOrEqual(1)
  })
  it.each(["refused", "declined", "signing_uncertain"] as const)("retains the fixed signer distinction %s", async code => {
    const f = setup(); vi.mocked(f.runtime.sign).mockRejectedValue(new OrdinaryPaymentSignFailure(code))
    expect((await f.execute()).phase).toBe(code === "signing_uncertain" ? "unconfirmed" : code)
    expect(f.runtime.submit).not.toHaveBeenCalled()
  })
  it("does not expose a capability/signature echoed inside the paid output", async () => {
    for (const secret of [TOKEN, SIGNATURE]) {
      const f = setup(), response = terminal(); response.body.result.report = secret
      vi.mocked(f.runtime.read).mockResolvedValue(response)
      const result = await f.execute()
      expect(result.phase).toBe("unconfirmed")
      expect(JSON.stringify(result)).not.toContain(secret)
    }
  })
  it("does not promote an uncorrelated receipt or pending ID to success", async () => {
    for (const response of [{ status: 202, body: { job_id: "different", status: "pending" } }, {
      ...terminal(), body: { ...terminal().body, receipt: { ...terminal().body.receipt, authorizationNonce: HASH } }
    }]) {
      const f = setup(); vi.mocked(f.runtime.read).mockResolvedValue(response)
      expect((await f.execute()).phase).toBe("unconfirmed")
      expect(f.runtime.read).toHaveBeenCalledTimes(1)
    }
  })
  it("delays read-only pending retries and never submits payment again", async () => {
    vi.useFakeTimers()
    const f = setup()
    vi.mocked(f.runtime.read).mockResolvedValueOnce({ status: 202, body: { job_id: ID, status: "pending" } })
    const run = f.execute()
    await vi.advanceTimersByTimeAsync(999)
    expect(f.runtime.read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await run).phase).toBe("settled")
    expect(f.runtime.read).toHaveBeenCalledTimes(2); expect(f.runtime.submit).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("bounds immediate pending responses to sixty reads, not an unbounded loop", async () => {
    vi.useFakeTimers()
    const f = setup(); vi.mocked(f.runtime.read).mockResolvedValue({ status: 202, body: { job_id: ID, status: "pending" } })
    const run = f.execute()
    await vi.advanceTimersByTimeAsync(60000)
    expect((await run).phase).toBe("unconfirmed")
    expect(f.runtime.read).toHaveBeenCalledTimes(60); expect(f.runtime.submit).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("burns approval but does no IO when pre-aborted or the run budget is invalid", async () => {
    const c = new AbortController(); c.abort(TOKEN)
    for (const options of [{ signal: c.signal }, { timeoutMs: 0 }, { timeoutMs: null }, { timeoutMs: 300001 }]) {
      const f = setup(); expect((await f.execute(options)).phase).toBe("refused")
      expect((await f.execute()).phase).toBe("refused"); expect(f.order).toEqual([])
    }
  })
  it.each(["quote", "sign", "submit", "read"] as const)("bounds an uncooperative %s dependency and ignores late completion", async method => {
    vi.useFakeTimers()
    const f = setup(); let release!: (value: unknown) => void
    vi.mocked(f.runtime[method]).mockImplementation(() => new Promise(resolve => { release = resolve }) as never)
    const run = f.execute({ timeoutMs: 20 })
    await vi.advanceTimersByTimeAsync(20)
    expect((await run).phase).toBe(method === "quote" ? "refused" : "unconfirmed")
    const before = f.order.slice()
    release(method === "quote" ? context() : method === "sign" ? authorization() : method === "submit" ? row() : terminal())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.order).toEqual(before); expect(vi.getTimerCount()).toBe(0)
  })
  it.each([NaN, Infinity, -1])("refuses invalid initial monotonic time %s before IO", async value => {
    const f = setup()
    // Preserve valid scope consumption so this tests the runner's own clock.
    vi.spyOn(performance, "now").mockReturnValueOnce(performance.now()).mockReturnValue(value)
    expect((await f.execute()).phase).toBe("refused"); expect(f.order).toEqual([])
  })
  it.each([{ method: "quote", cap: 25000 }, { method: "sign", cap: 120000 },
    { method: "submit", cap: 10000 }, { method: "read", cap: 90000 }] as const)("enforces the $method cap even for an uncooperative dependency", async ({ method, cap }) => {
    vi.useFakeTimers()
    const f = setup(); vi.mocked(f.runtime[method]).mockImplementation(() => new Promise(() => {}) as never)
    const run = f.execute()
    await vi.advanceTimersByTimeAsync(cap)
    expect((await run).phase).toBe(method === "quote" ? "refused" : "unconfirmed")
    expect(vi.getTimerCount()).toBe(0)
    expect(vi.mocked(f.runtime.submit).mock.calls.length).toBeLessThanOrEqual(1)
  })
  it("stops on monotonic rollback between quote and signing", async () => {
    const f = setup(), at = performance.now()
    const clock = vi.spyOn(performance, "now").mockReturnValue(at)
    vi.mocked(f.runtime.quote).mockImplementationOnce(async () => { clock.mockReturnValue(at - 1); return context() })
    expect((await f.execute()).phase).toBe("refused"); expect(f.runtime.sign).not.toHaveBeenCalled()
  })
  it("captures the selected wallet method before a pending quote", async () => {
    const f = setup(), original = f.provider.request
    let release!: (v: ReturnType<typeof context>) => void
    vi.mocked(f.runtime.quote).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    vi.mocked(f.runtime.sign).mockImplementation(async provider => { await provider.request({ method: "eth_accounts" }); return authorization() })
    const run = f.execute()
    f.provider.request = vi.fn(async () => undefined); release(context())
    expect((await run).phase).toBe("settled")
    expect(original).toHaveBeenCalledTimes(1); expect(f.provider.request).not.toHaveBeenCalled()
  })
  it("contains observer errors and respects observer-triggered abort before signing", async () => {
    const f = setup()
    expect((await f.run(f.scope, f.token, binding(), { provider: f.provider, buyer: BUYER }, {}, () => { throw Error(TOKEN) })).phase).toBe("settled")
    const g = setup(), abort = new AbortController()
    expect((await g.run(g.scope, g.token, binding(), { provider: g.provider, buyer: BUYER }, { signal: abort.signal }, view => {
      if (view.phase === "signing") abort.abort(TOKEN)
    })).phase).toBe("refused")
    expect(g.runtime.sign).not.toHaveBeenCalled(); expect(g.runtime.submit).not.toHaveBeenCalled()
  })
  it("does not turn a downstream error into a false wallet-decline report", async () => {
    const f = setup(); vi.mocked(f.runtime.read).mockRejectedValue(new OrdinaryPaymentSignFailure("declined"))
    expect((await f.execute()).phase).toBe("unconfirmed")
  })
  it("returns a qualified nonsettlement without unpaid output or a no-charge promise", async () => {
    const f = setup(), r = terminal()
    const { settleTx: ignored, ...receipt } = r.body.receipt
    vi.mocked(f.runtime.read).mockResolvedValue({ status: 200, body: { ...r.body, result: TOKEN,
      detail: "You were not charged", receipt: { ...receipt, settled: false } } })
    const result = await f.execute()
    expect(result).toMatchObject({ phase: "not_settled", outcome: { settled: false, resultJson: null, reference: null } })
    expect(JSON.stringify(result)).not.toContain(TOKEN); expect(JSON.stringify(result)).not.toContain("You were not charged")
  })
  it("cancels a read-only polling delay with no leaked timers or repeated POST", async () => {
    vi.useFakeTimers()
    const f = setup(), abort = new AbortController()
    vi.mocked(f.runtime.read).mockResolvedValue({ status: 202, body: { job_id: ID, status: "pending" } })
    const run = f.execute({ signal: abort.signal })
    await vi.advanceTimersByTimeAsync(500); abort.abort(TOKEN)
    expect((await run).phase).toBe("unconfirmed")
    expect(f.runtime.read).toHaveBeenCalledTimes(1); expect(f.runtime.submit).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(["eip3009", "gateway"] as const)("composes real %s helpers with a public fixture signer and intercepted HTTP only", async rail => {
    vi.spyOn(Date, "now").mockReturnValue(1800000000000)
    vi.stubGlobal("location", { origin: "https://web.example" })
    const memory = new Map<string, string>(), order: string[] = [], account = privateKeyToAccount(`0x${"01".repeat(32)}`)
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { order.push("store"); memory.set(key, value) }
    } })
    const c = { ...context(), rail, requirements: { ...context().requirements, extra: rail === "gateway"
      ? { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway.wallet } : { name: "USDC", version: "2" } } }
    type Wire = Parameters<typeof account.signTypedData>[0]
    let wire: Wire | undefined, signed = "", nonce = ""
    const rpc = vi.fn(async (args: Parameters<Eip1193Provider["request"]>[0]) => {
      if (args.method === "eth_chainId") return `0x${chain.chainId.toString(16)}`
      if (args.method === "eth_accounts") return [account.address]
      if (args.method !== "eth_signTypedData_v4") throw Error("unexpected fixture RPC")
      order.push("sign"); wire = JSON.parse(args.params?.[1] as string) as Wire
      signed = await account.signTypedData(wire); return signed
    })
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      if (url === "https://web.example/api/quote") {
        order.push("quote")
        expect(init?.body).toBe('{"skillId":"diff-triage","input":{"diff":"private actual input"}}')
        expect([...headers.keys()]).toEqual(["accept", "content-type"])
        return Response.json({ skillId: c.skillId, price: "$0.01", amountAtomic: c.amountAtomic,
          payTo: c.payTo, network: c.network, asset: c.asset, browser: c })
      }
      if (url === c.hubOrigin + c.resource) {
        order.push("submit"); expect(init?.method).toBe("POST")
        expect(init?.body).toBe('{"diff":"private actual input"}')
        expect([...headers.keys()]).toEqual(["accept", "content-type", "payment-signature"])
        const payment = JSON.parse(atob(headers.get("payment-signature")!))
        expect(payment.accepted).toEqual(c.requirements); expect(payment.payload.signature).toBe(signed)
        expect(payment.payload.authorization.from).toBe(account.address)
        nonce = payment.payload.authorization.nonce
        expect(await recoverTypedDataAddress({ ...wire!, signature: signed as `0x${string}` })).toBe(account.address)
        return Response.json({ job_id: ID, job_token: TOKEN, status: "queued", price: "$0.01" }, { status: 202 })
      }
      expect(url).toBe(`${c.hubOrigin}/jobs/${ID}/result`)
      order.push("read"); expect(init?.method).toBe("GET")
      expect([...headers]).toEqual([["accept", "application/json"], ["x-job-token", TOKEN]])
      expect(memory.get(KEY)).toContain(TOKEN)
      return Response.json({ ...terminal().body, receipt: { ...terminal().body.receipt,
        buyer: account.address, authorizationNonce: nonce, rail,
        settleTx: rail === "gateway" ? "12345678-1234-4234-8234-123456789abc" : HASH } })
    })
    vi.stubGlobal("fetch", fetcher)
    const scope = createPurchaseApprovalScope(), token = scope.approve({ ...binding(), context: c })!, updates: PurchaseView[] = []
    const result = await runPurchase(scope, token, binding(), { provider: { request: rpc }, buyer: account.address }, {}, v => updates.push(v))
    expect(result).toMatchObject({ phase: "settled", recovery: "stored", outcome: { rail, source: "hub" } })
    expect(order).toEqual(["quote", "sign", "quote", "submit", "store", "read"])
    expect(fetcher).toHaveBeenCalledTimes(4)
    const display = JSON.stringify([result, updates])
    for (const secret of [TOKEN, nonce, signed, "private actual input"]) expect(display).not.toContain(secret)
    expect((await runPurchase(scope, token, binding(), { provider: { request: rpc }, buyer: account.address })).phase).toBe("refused")
    expect(fetcher).toHaveBeenCalledTimes(4)
    if (rail === "gateway") expect(result.outcome?.explorer).toBe(null)
  })
  it("imports the default composition without browser effects or ambient network selection", async () => {
    vi.resetModules(); vi.stubEnv("ARCADE_NETWORK", "INVALID_PASSIVE_IMPORT_SENTINEL")
    const io = vi.fn(() => { throw Error("unexpected passive IO") })
    vi.stubGlobal("fetch", io)
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get: io }))
    vi.stubGlobal("location", Object.defineProperty({}, "origin", { get: io }))
    expect(typeof (await import("../src/lib/purchase-run.ts")).runPurchase).toBe("function")
    expect(io).not.toHaveBeenCalled(); vi.resetModules()
  })
})
