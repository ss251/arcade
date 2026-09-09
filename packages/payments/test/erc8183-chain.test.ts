import { describe, expect, it, vi } from "vitest"
import { createEscrowChain } from "../src/erc8183-chain.ts"
import { fixture, addr, hash, evaluator } from "./fixtures/erc8183-action.ts"
import { keccak256 } from "viem"
import { rpcFixture } from "./fixtures/erc8183-rpc.ts"
import { createEscrowExecutor } from "../src/erc8183-executor.ts"
import { assertEscrowActionReceipt, assertEscrowSignedAction } from "../src/erc8183-evidence.ts"
async function setup() {
  const f = await fixture(), controller = new AbortController(), calls: string[] = []
  const identity = { chainId: 5042002 as const, escrow: f.context.call.escrow, implementation: addr(11), hook: f.context.call.hook,
    evaluator: f.context.call.evaluator, treasury: f.context.treasury, token: f.context.call.token,
    proxyCodeHash: keccak256("0x01"), implementationCodeHash: keccak256("0x02"), hookCodeHash: keccak256("0x03") }
  const options = { identity, signal: controller.signal, deadlineMs: performance.now() + 30000, nowSeconds: () => 1000,
    gasCapWei: 2000000n, acquireSigner: async () => evaluator,
    fetch: (async (_url, init) => {
      const r = JSON.parse(String(init?.body)); calls.push(r.method)
      const result = r.method === "eth_chainId" ? "0x4cef52" : "0x3"
      return Response.json({ jsonrpc: "2.0", id: r.id, result })
    }) as typeof fetch }
  return { f, options, calls, controller }
}
describe("concrete bounded escrow RPC transport (offline fetch)", () => {
  it("uses fixed Arc JSON-RPC, exact response IDs, and no send during nonce reads", async () => {
    const h = await setup(), client = createEscrowChain(h.options)
    expect(await client.nonceState(h.f.context.call.evaluator, h.controller.signal)).toEqual({ latest: 3, pending: 3 })
    expect(h.calls).toEqual(["eth_chainId", "eth_getTransactionCount", "eth_getTransactionCount", "eth_chainId"])
  })
  it("refuses non-evaluator nonce queries before RPC", async () => {
    const h = await setup()
    await expect(createEscrowChain(h.options).nonceState(addr(99), h.controller.signal)).rejects.toThrow("escrow_chain_refused")
    expect(h.calls).toEqual([])
  })
  it.each(["id", "error", "redirect", "encoding", "oversize", "type"])("refuses a %s response with a fixed error and no retries", async mode => {
    const h = await setup(); let requests = 0
    const fetch = (async (_url, init) => {
      requests++; const r = JSON.parse(String(init?.body))
      if (mode === "redirect") return new Response(null, { status: 302, headers: { location: "https://example.test/private" } })
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: mode === "id" ? 900 : r.id,
        ...(mode === "error" ? { error: { message: "private provider text" } } : { result: "0x4cef52" }) }),
        { headers: { "content-type": mode === "type" ? "text/plain" : "application/json",
          ...(mode === "encoding" ? { "content-encoding": "gzip" } : {}),
          ...(mode === "oversize" ? { "content-length": "262145" } : {}) } })
    }) as typeof globalThis.fetch
    await expect(createEscrowChain({ ...h.options, fetch }).nonceState(h.f.context.call.evaluator, h.controller.signal))
      .rejects.toThrow(/^escrow_chain_refused$/)
    expect(requests).toBe(1)
  })
  it("bounds an uncooperative fetch and never performs a later request", async () => {
    const h = await setup(); let requests = 0
    const fetch = (async () => { requests++; return new Promise<Response>(() => {}) }) as unknown as typeof globalThis.fetch
    const client = createEscrowChain({ ...h.options, deadlineMs: performance.now() + 25, fetch })
    await expect(client.nonceState(h.f.context.call.evaluator, h.controller.signal)).rejects.toThrow("escrow_chain_refused")
    expect(requests).toBe(1)
  })
  it("refuses direct or repeated broadcasts without one exactly signed local intent", async () => {
    const h = await setup()
    await expect(createEscrowChain(h.options).broadcast(h.f.raw, h.controller.signal)).rejects.toThrow("escrow_chain_refused")
    expect(h.calls).toEqual([])
  })
  it("decodes exact ABI job/identity facts and canonical provider code/nonce without acquiring a signer", async () => {
    const h = await rpcFixture(), ports = createEscrowChain(h.options), signal = h.controller.signal
    const snapshot = await ports.readJob(7n, signal)
    expect(snapshot).toEqual(h.f.snapshot)
    expect(await ports.providerCode(h.f.context.call.provider, snapshot, signal)).toBe("0x")
    expect(await ports.providerNonceUsed(hash(9), snapshot, signal)).toBe(false)
    expect(h.acquisitions()).toBe(0); expect(h.sent()).toBe(false)
    expect(h.calls.filter(c => c.method === "eth_call").every(c => c.params[1] === "0x32")).toBe(true)
    h.getters.platformFeeBP = 501n
    await expect(ports.readJob(7n, signal)).rejects.toThrow("escrow_chain_refused")
  })
  it("prepares bounded gas terms, signs exactly once, sends exactly once and proves actual decoded receipt/state", async () => {
    const h = await rpcFixture(), p = createEscrowChain(h.options), signal = h.controller.signal
    expect(await p.transactionTerms(h.f.action, signal)).toEqual(h.f.terms)
    expect(h.acquisitions()).toBe(0)
    const raw = await p.signTransaction(h.f.transaction, signal)
    expect(h.acquisitions()).toBe(1); expect(raw).toBe(h.f.raw)
    await expect(p.signTransaction(h.f.transaction, signal)).rejects.toThrow("escrow_chain_refused")
    expect(await p.broadcast(raw, signal)).toBe(h.f.signed.hash)
    await expect(p.broadcast(raw, signal)).rejects.toThrow("escrow_chain_refused")
    const receipt = await p.readReceipt(h.f.signed.hash, signal), transaction = await p.readTransaction(h.f.signed.hash, signal)
    const after = await p.readJobAt(7n, { blockNumber: receipt.blockNumber, blockHash: receipt.blockHash }, signal)
    expect(assertEscrowActionReceipt(h.f.action, await assertEscrowSignedAction(h.f.action, raw, h.f.terms), transaction, receipt, after))
      .toMatchObject({ kind: "complete", sellerAtomic: 285000n, feeAtomic: 15000n })
    expect(h.calls.filter(c => c.method === "eth_sendRawTransaction")).toHaveLength(1)
  })
  it("runs the real coordinator across these encoded RPC ports (fake journal/chain only)", async () => {
    const h = await rpcFixture(), events: string[] = []
    const result = await createEscrowExecutor({ ...createEscrowChain(h.options), ...h.options,
      identity: { escrow: h.identity.escrow, hook: h.identity.hook, evaluator: h.identity.evaluator,
        token: h.identity.token, treasury: h.identity.treasury },
      providerAuthorization: async () => { throw Error("complete needs no provider reply") },
      journal: { durability: "durable", claim: async () => ({ id: "fake-claim" }), matchSubmission: async () => true,
        intent: async () => { events.push("intent") }, prepared: async () => { events.push("prepared") },
        attempt: async () => { events.push("attempt") }, confirmed: async () => { events.push("confirmed") }, uncertain: async () => { events.push("uncertain") } }
    }).execute(h.f.context, h.f.input)
    expect(result.kind).toBe("complete"); expect(events).toEqual(["intent", "prepared", "attempt", "confirmed"])
    expect(h.calls.filter(c => c.method === "eth_sendRawTransaction")).toHaveLength(1)
  })
  it.each(["cap", "balance", "nonce", "signer"])("refuses %s drift before broadcast", async mode => {
    const h = await rpcFixture()
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body)), result = mode === "balance" && r.method === "eth_getBalance" ? "0x0" : h.answer(r.method, r.params)
      return Response.json({ jsonrpc: "2.0", id: r.id, result })
    }) as typeof globalThis.fetch
    const p = createEscrowChain({ ...h.options, fetch, gasCapWei: mode === "cap" ? 1n : h.options.gasCapWei,
      ...(mode === "signer" ? { acquireSigner: async () => ({ ...evaluator, address: addr(99) }) } : {}) })
    if (mode === "cap" || mode === "balance") await expect(p.transactionTerms(h.f.action, h.controller.signal)).rejects.toThrow("escrow_chain_refused")
    else {
      await p.transactionTerms(h.f.action, h.controller.signal)
      await expect(p.signTransaction({ ...h.f.transaction, ...(mode === "nonce" ? { nonce: 4 } : {}) }, h.controller.signal))
        .rejects.toThrow("escrow_chain_refused")
    }
    expect(h.sent()).toBe(false)
  })
  it("cancels a stalled response body without another request", async () => {
    const h = await setup(); let canceled = false, requests = 0
    const fetch = (async (_url, _init) => { requests++
      return new Response(new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => { canceled = true } }),
        { headers: { "content-type": "application/json" } })
    }) as typeof globalThis.fetch
    await expect(createEscrowChain({ ...h.options, deadlineMs: performance.now() + 25, fetch })
      .nonceState(h.f.context.call.evaluator, h.controller.signal)).rejects.toThrow("escrow_chain_refused")
    expect(requests).toBe(1); expect(canceled).toBe(true)
  })
  it("never signs with an acquisition that returns after cancellation", async () => {
    const h = await rpcFixture(); let release!: (account: typeof evaluator) => void, signatures = 0
    const p = createEscrowChain({ ...h.options, acquireSigner: () => new Promise<typeof evaluator>(resolve => { release = resolve }) })
    await p.transactionTerms(h.f.action, h.controller.signal)
    const signing = p.signTransaction(h.f.transaction, h.controller.signal)
    await new Promise(resolve => setTimeout(resolve, 0)); h.controller.abort()
    await expect(signing).rejects.toThrow("escrow_chain_refused")
    release({ ...evaluator, signTransaction: async tx => { signatures++; return evaluator.signTransaction(tx) } })
    await Promise.resolve(); expect(signatures).toBe(0); expect(h.sent()).toBe(false)
  })
  it.each(["unknown", "wrong-hash"])("fences the sole send after a %s response", async mode => {
    const h = await rpcFixture(); let sends = 0
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body))
      if (r.method === "eth_sendRawTransaction") {
        sends++; if (mode === "unknown") throw Error("private RPC failure")
        return Response.json({ jsonrpc: "2.0", id: r.id, result: hash(99) })
      }
      return Response.json({ jsonrpc: "2.0", id: r.id, result: h.answer(r.method, r.params) })
    }) as typeof globalThis.fetch
    const p = createEscrowChain({ ...h.options, fetch })
    await p.transactionTerms(h.f.action, h.controller.signal)
    const raw = await p.signTransaction(h.f.transaction, h.controller.signal)
    await expect(p.broadcast(raw, h.controller.signal)).rejects.toThrow(/^escrow_chain_refused$/)
    await expect(p.broadcast(raw, h.controller.signal)).rejects.toThrow(/^escrow_chain_refused$/)
    expect(sends).toBe(1)
  })
  it.each([null, 0, "0x00", "0xzz"])("refuses malformed quantity %s before viem can coerce it", async result => {
    const h = await setup(); let count = 0
    const fetch = (async (_url, init) => { count++; const r = JSON.parse(String(init?.body))
      return Response.json({ jsonrpc: "2.0", id: r.id, result })
    }) as typeof globalThis.fetch
    await expect(createEscrowChain({ ...h.options, fetch }).nonceState(h.f.context.call.evaluator, h.controller.signal))
      .rejects.toThrow("escrow_chain_refused")
    expect(count).toBe(1)
  })
  it("polls only read-only receipt observations and refuses a reorg without any signer/send", async () => {
    const h = await rpcFixture(); h.answer("eth_sendRawTransaction", []) // Fixture-only already-mined state.
    let receipts = 0, reorg = false
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body)); h.calls.push({ method: r.method, params: r.params })
      let result = r.method === "eth_getTransactionReceipt" && ++receipts === 1 ? null : h.answer(r.method, r.params)
      if (reorg && r.method === "eth_getBlockByNumber" && r.params[0] === "0x33") result = { ...(result as object), hash: hash(99) }
      return Response.json({ jsonrpc: "2.0", id: r.id, result })
    }) as typeof globalThis.fetch
    vi.useFakeTimers()
    try {
      const p = createEscrowChain({ ...h.options, deadlineMs: performance.now() + 30000, fetch })
      const pending = p.readReceipt(h.f.signed.hash, h.controller.signal)
      await vi.advanceTimersByTimeAsync(1000)
      expect((await pending).transactionHash).toBe(h.f.signed.hash); expect(receipts).toBe(2)
      reorg = true
      await expect(p.readReceipt(h.f.signed.hash, h.controller.signal)).rejects.toThrow("escrow_chain_refused")
      expect(h.acquisitions()).toBe(0); expect(h.calls.some(c => c.method === "eth_sendRawTransaction")).toBe(false)
    } finally { vi.useRealTimers() }
  })
  it("retains the initial provider-read block even when a caller mutates its argument during fetch", async () => {
    const h = await rpcFixture(), snapshot = { ...h.f.snapshot }
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body)); h.calls.push({ method: r.method, params: r.params })
      if (r.method === "eth_getCode") { snapshot.blockNumber = 51n; snapshot.blockHash = hash(51); snapshot.timestamp = 1001 }
      return Response.json({ jsonrpc: "2.0", id: r.id, result: h.answer(r.method, r.params) })
    }) as typeof globalThis.fetch
    expect(await createEscrowChain({ ...h.options, fetch }).providerCode(h.f.context.call.provider, snapshot, h.controller.signal)).toBe("0x")
    expect(h.calls.find(c => c.method === "eth_getBlockByNumber")?.params[0]).toBe("0x32")
  })
  it("caps all transport observations at 400 and does not dispatch observation 401", async () => {
    const h = await setup(), p = createEscrowChain(h.options)
    for (let i = 0; i < 100; i++) await p.nonceState(h.f.context.call.evaluator, h.controller.signal)
    await expect(p.nonceState(h.f.context.call.evaluator, h.controller.signal)).rejects.toThrow("escrow_chain_refused")
    expect(h.calls).toHaveLength(400)
  })
})
