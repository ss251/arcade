import { describe, expect, it } from "vitest"
import { createEscrowProviderReader } from "../src/erc8183-provider-read.ts"
import { rpcFixture } from "./fixtures/erc8183-rpc.ts"
import { addr, hash } from "./fixtures/erc8183-action.ts"
async function setup(kind: "budget" | "submit" = "budget") {
  const h = await rpcFixture(kind)
  const options = { identity: h.identity, provider: h.f.context.call.provider, nowSeconds: h.options.nowSeconds,
    signal: h.controller.signal, deadlineMs: performance.now() + 30000, fetch: h.options.fetch }
  return { h, options, reader: createEscrowProviderReader(options), kind }
}
describe("canonical provider preflight is read-only", () => {
  it.each(["budget", "submit"] as const)("checks %s facts, provider code and nonce at one block with no signer", async kind => {
    const h = await setup(kind), result = await h.reader.read(h.h.f.context, kind, 2n, h.h.controller.signal)
    expect(result).toEqual(h.h.f.snapshot)
    expect(h.h.calls.every(c => c.method !== "eth_sendRawTransaction")).toBe(true)
    expect(h.h.calls.filter(c => c.method === "eth_call").every(c => c.params[1] === "0x32")).toBe(true)
    expect(h.h.acquisitions()).toBe(0); expect(Object.keys(h.reader)).toEqual(["read"])
  })
  it("rejects wrong local identity/provider and overflowing nonce before RPC", async () => {
    const h = await setup()
    for (const c of [{ ...h.h.f.context, treasury: addr(6) },
      { ...h.h.f.context, call: { ...h.h.f.context.call, provider: addr(7) } },
      { ...h.h.f.context, call: { ...h.h.f.context.call, hook: addr(8) } }])
      await expect(h.reader.read(c, "budget", 2n, h.h.controller.signal)).rejects.toThrow(/^escrow_provider_preflight_refused$/)
    await expect(h.reader.read(h.h.f.context, "budget", 1n << 72n, h.h.controller.signal)).rejects.toThrow(/^escrow_provider_preflight_refused$/)
    expect(h.h.calls).toHaveLength(0)
  })
  it.each(["used", "fee", "description", "expired", "status", "pending"])("refuses %s drift without keys", async mode => {
    const h = await setup()
    if (mode === "used") h.h.getters.authorizationNonceUsed = true
    if (mode === "fee") h.h.getters.platformFeeBP = 501n
    if (mode === "description") h.h.f.snapshot.job.description = "another request"
    if (mode === "expired") h.h.f.snapshot.job.expiredAt = 1600
    if (mode === "status") h.h.f.snapshot.job.status = 1
    if (mode === "pending") h.h.getters.pendingClaimHash = hash(8)
    const context = mode === "expired" ? { ...h.h.f.context, expiredAt: 1600 } : h.h.f.context
    await expect(h.reader.read(context, "budget", 2n, h.h.controller.signal)).rejects.toThrow(/^escrow_provider_preflight_refused$/)
    expect(h.h.acquisitions()).toBe(0); expect(h.h.sent()).toBe(false)
  })
  it("refuses provider contract code and bounded uncooperative transport", async () => {
    const h = await setup(), fetch = (async (url, init) => {
      const r = JSON.parse(String(init?.body))
      if (r.method === "eth_getCode" && r.params[0] === h.options.provider)
        return Response.json({ jsonrpc: "2.0", id: r.id, result: "0x1234" })
      return h.options.fetch(url, init)
    }) as typeof globalThis.fetch
    await expect(createEscrowProviderReader({ ...h.options, fetch }).read(h.h.f.context, "budget", 2n, h.h.controller.signal))
      .rejects.toThrow(/^escrow_provider_preflight_refused$/)
    const pending = (async () => new Promise<Response>(() => {})) as unknown as typeof globalThis.fetch
    await expect(createEscrowProviderReader({ ...h.options, fetch: pending, deadlineMs: performance.now() + 25 })
      .read(h.h.f.context, "budget", 2n, h.h.controller.signal)).rejects.toThrow(/^escrow_provider_preflight_refused$/)
    expect(h.h.acquisitions()).toBe(0)
  })
  it.each(["reorg", "chain", "clock"] as const)("rechecks %s after provider code/nonce reads", async mode => {
    const h = await setup(); let blocks = 0, chains = 0, now = 1000
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body)); let result = h.h.answer(r.method, r.params)
      if (r.method === "eth_chainId" && ++chains === 3 && mode === "chain") result = "0x1"
      if (r.method === "eth_getBlockByNumber" && r.params[0] === "0x32" && ++blocks === 2) {
        if (mode === "reorg") result = { ...(result as object), hash: hash(77) }
        if (mode === "clock") now = 1031
      }
      return Response.json({ jsonrpc: "2.0", id: r.id, result })
    }) as typeof globalThis.fetch
    await expect(createEscrowProviderReader({ ...h.options, fetch, nowSeconds: () => now })
      .read(h.h.f.context, "budget", 2n, h.h.controller.signal)).rejects.toThrow(/^escrow_provider_preflight_refused$/)
    expect(h.h.acquisitions()).toBe(0); expect(h.h.sent()).toBe(false)
  })
  it("cancellation before entry dispatches nothing; late response cannot resume requests", async () => {
    const h = await setup(); h.h.controller.abort()
    await expect(h.reader.read(h.h.f.context, "budget", 2n, h.h.controller.signal)).rejects.toThrow(/^escrow_provider_preflight_refused$/)
    expect(h.h.calls).toHaveLength(0)
    const fresh = await setup(); let count = 0, release!: (response: Response) => void, start!: () => void
    const started = new Promise<void>(resolve => { start = resolve })
    const fetch = (async () => { count++; start(); return new Promise<Response>(resolve => { release = resolve }) }) as unknown as typeof globalThis.fetch
    const promise = createEscrowProviderReader({ ...fresh.options, fetch }).read(fresh.h.f.context, "budget", 2n, fresh.h.controller.signal)
    await started; fresh.h.controller.abort()
    await expect(promise).rejects.toThrow(/^escrow_provider_preflight_refused$/)
    release(Response.json({ jsonrpc: "2.0", id: 1, result: "0x4cef52" }))
    await new Promise(resolve => setTimeout(resolve, 0)); expect(count).toBe(1)
  })
})
