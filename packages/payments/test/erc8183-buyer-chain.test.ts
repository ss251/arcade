import { describe, expect, it } from "vitest"
import { createEscrowBuyerChain } from "../src/erc8183-buyer-chain.ts"
import { assertEscrowBuyerBudgetReceipt, assertEscrowBuyerReceipt, assertEscrowBuyerSigned } from "../src/erc8183-buyer-evidence.ts"
import { buyerRpcFixture } from "./fixtures/erc8183-buyer-rpc.ts"
import { addr, buyer, hash } from "./fixtures/erc8183-buyer.ts"
import { toHex } from "viem"
describe("concrete Arc buyer port over source-shaped fake RPC", () => {
  it("reads full local deployment pins and same-block balance/allowance without signer acquisition", async () => {
    const h = await buyerRpcFixture(), p = createEscrowBuyerChain(h.options), signal = h.controller.signal
    const snapshot = await p.readDeployment(signal)
    expect(snapshot.identity).toEqual(h.id)
    expect(await p.observe(h.f.intent, snapshot, signal)).toEqual({ providerCode: "0x", nativeBalanceWei: 10n ** 20n, allowanceAtomic: 0n })
    expect(await p.nonceState(signal)).toEqual({ latest: 3, pending: 3 })
    expect(h.calls.filter(c => c.method === "eth_getTransactionCount").every(c => c.params[0] === h.f.intent.client)).toBe(true)
    expect(h.acquisitions()).toBe(0); expect(h.calls.some(c => c.method === "eth_sendRawTransaction")).toBe(false)
    h.getters.platformFeeBP = 501n
    await expect(p.readDeployment(signal)).rejects.toThrow("escrow_buyer_chain_refused")
  })
  it.each(["create", "approve", "fund"] as const)("signs/sends %s once, reconstructs mined bytes and proves actual decoded receipt/job", async kind => {
    const h = await buyerRpcFixture(kind), p = createEscrowBuyerChain(h.options), signal = h.controller.signal
    expect(await p.transactionTerms(h.f.action!, 2000000n, signal)).toEqual(h.f.terms)
    expect(h.acquisitions()).toBe(0)
    const raw = await p.signTransaction(h.f.transaction, signal)
    expect(raw).toBe(h.f.raw); expect(h.acquisitions()).toBe(1)
    await expect(p.signTransaction(h.f.transaction, signal)).rejects.toThrow("escrow_buyer_chain_refused")
    expect(await p.broadcast(raw, signal)).toBe(h.f.tx.hash)
    await expect(p.broadcast(raw, signal)).rejects.toThrow("escrow_buyer_chain_refused")
    const receipt = await p.readReceipt(h.f.tx.hash, signal), tx = await p.readTransaction(h.f.tx.hash, signal),
      after = await p.readJobAt(7n, { blockNumber: receipt.blockNumber, blockHash: receipt.blockHash }, signal)
    expect(tx.raw).toBe(raw)
    const allowance = kind === "create" ? undefined : await p.allowanceAt(h.f.intent, after, signal)
    const proof = assertEscrowBuyerReceipt(h.f.action!, await assertEscrowBuyerSigned(h.f.action!, raw, h.f.terms), tx.transaction, receipt, after, allowance)
    expect(proof.kind).toBe(kind); expect(proof.fundedAtomic).toBe(kind === "fund" ? 300000n : 0n)
    expect(h.calls.filter(c => c.method === "eth_sendRawTransaction")).toHaveLength(1)
  })
  it("independently reconstructs and proves the provider-authorized budget relay without buyer signing", async () => {
    const h = await buyerRpcFixture("budget"); h.mine()
    const p = createEscrowBuyerChain(h.options), signal = h.controller.signal, receipt = await p.readReceipt(h.f.tx.hash, signal),
      mined = await p.readTransaction(h.f.tx.hash, signal),
      after = await p.readJobAt(7n, { blockNumber: receipt.blockNumber, blockHash: receipt.blockHash }, signal)
    expect(mined.raw).toBe(h.f.raw)
    expect((await assertEscrowBuyerBudgetReceipt(h.f.intent, 7n, mined.raw, mined.transaction, receipt, after)).kind).toBe("budget")
    expect(h.acquisitions()).toBe(0); expect(h.calls.some(c => c.method === "eth_sendRawTransaction")).toBe(false)
  })
  it.each(["cap", "balance", "signer", "wire", "kind"])("refuses %s drift without a broadcast", async mode => {
    const h = await buyerRpcFixture(), fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body)); h.calls.push({ method: r.method, params: r.params })
      return Response.json({ jsonrpc: "2.0", id: r.id, result: mode === "balance" && r.method === "eth_getBalance" ? toHex(3000000n) : h.answer(r.method, r.params) })
    }) as typeof globalThis.fetch
    const p = createEscrowBuyerChain({ ...h.options, fetch, ...(mode === "kind" ? { kind: "fund" as const } : {}),
      ...(mode === "signer" ? { acquireSigner: async () => ({ ...buyer, address: addr(99) }) } : {}) }), signal = h.controller.signal
    if (mode === "cap" || mode === "balance" || mode === "kind")
      await expect(p.transactionTerms(h.f.action!, mode === "cap" ? 1n : 2000000n, signal)).rejects.toThrow("escrow_buyer_chain_refused")
    else {
      await p.transactionTerms(h.f.action!, 2000000n, signal)
      await expect(p.signTransaction({ ...h.f.transaction, ...(mode === "wire" ? { value: 1n } : {}) }, signal)).rejects.toThrow("escrow_buyer_chain_refused")
    }
    expect(h.calls.some(c => c.method === "eth_sendRawTransaction")).toBe(false)
  })
  it.each(["unknown", "hash"])("does not retry a %s send response", async mode => {
    const h = await buyerRpcFixture(); let sends = 0
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body))
      if (r.method === "eth_sendRawTransaction") { sends++; if (mode === "unknown") throw Error("private upstream text")
        return Response.json({ jsonrpc: "2.0", id: r.id, result: hash(99) }) }
      return Response.json({ jsonrpc: "2.0", id: r.id, result: h.answer(r.method, r.params) })
    }) as typeof globalThis.fetch
    const p = createEscrowBuyerChain({ ...h.options, fetch }), signal = h.controller.signal
    await p.transactionTerms(h.f.action!, 2000000n, signal); const raw = await p.signTransaction(h.f.transaction, signal)
    await expect(p.broadcast(raw, signal)).rejects.toThrow(/^escrow_buyer_chain_refused$/)
    await expect(p.broadcast(raw, signal)).rejects.toThrow(/^escrow_buyer_chain_refused$/)
    expect(sends).toBe(1)
  })
  it("ignores a signer acquisition arriving after cancellation", async () => {
    const h = await buyerRpcFixture(); let release!: (s: typeof buyer) => void, signatures = 0
    const p = createEscrowBuyerChain({ ...h.options, acquireSigner: () => new Promise<typeof buyer>(r => { release = r }) }), signal = h.controller.signal
    await p.transactionTerms(h.f.action!, 2000000n, signal)
    const pending = p.signTransaction(h.f.transaction, signal)
    await new Promise(resolve => setTimeout(resolve, 0)); h.controller.abort()
    await expect(pending).rejects.toThrow("escrow_buyer_chain_refused")
    release({ ...buyer, signTransaction: async t => { signatures++; return buyer.signTransaction(t) } })
    await Promise.resolve(); expect(signatures).toBe(0)
  })
  it("requires exact mined wire hash and sender, not RPC success alone", async () => {
    const h = await buyerRpcFixture(); h.mine()
    const fetch = (async (_url, init) => { const r = JSON.parse(String(init?.body)); let result = h.answer(r.method, r.params)
      if (r.method === "eth_getTransactionByHash") result = { ...(result as object), from: h.id.evaluator }
      return Response.json({ jsonrpc: "2.0", id: r.id, result }) }) as typeof globalThis.fetch
    await expect(createEscrowBuyerChain({ ...h.options, fetch }).readTransaction(h.f.tx.hash, h.controller.signal)).rejects.toThrow("escrow_buyer_chain_refused")
  })
  it("uses a fresh finalized head to fence historical allowance, never as current sending facts", async () => {
    const h = await buyerRpcFixture("approve"); h.mine()
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body)); h.calls.push({ method: r.method, params: r.params })
      const result = r.method === "eth_getBlockByNumber" && r.params[0] === "finalized" ?
        { number: toHex(100n), hash: hash(100), timestamp: toHex(1100), transactions: [] } : h.answer(r.method, r.params)
      return Response.json({ jsonrpc: "2.0", id: r.id, result })
    }) as typeof globalThis.fetch
    const p = createEscrowBuyerChain({ ...h.options, fetch, nowSeconds: () => 1100 }), signal = h.controller.signal,
      after = await p.readJobAt(7n, { blockNumber: 51n, blockHash: hash(51) }, signal)
    expect(after.timestamp).toBe(1001)
    expect(await p.allowanceAt(h.f.intent, after, signal)).toBe(300000n)
    await expect(p.observe(h.f.intent, after, signal)).rejects.toThrow("escrow_buyer_chain_refused")
    expect(h.calls.filter(c => c.method === "eth_call").every(c => c.params[1] === "0x33")).toBe(true)
  })
  it("captures observation block before IO and refuses a changed canonical block", async () => {
    const h = await buyerRpcFixture(), frame = { ...h.f.snapshot }; let reorg = false
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body)); h.calls.push({ method: r.method, params: r.params })
      if (r.method === "eth_getCode") { frame.blockNumber = 51n; frame.blockHash = hash(51); frame.timestamp = 1001 }
      let result = h.answer(r.method, r.params)
      if (reorg && r.method === "eth_getBlockByNumber") result = { ...(result as object), hash: hash(99) }
      return Response.json({ jsonrpc: "2.0", id: r.id, result })
    }) as typeof globalThis.fetch
    const p = createEscrowBuyerChain({ ...h.options, fetch }), signal = h.controller.signal
    expect((await p.observe(h.f.intent, frame, signal)).allowanceAtomic).toBe(0n)
    expect(h.calls.find(c => c.method === "eth_getBlockByNumber")?.params[0]).toBe("0x32")
    reorg = true
    await expect(p.observe(h.f.intent, h.f.snapshot, signal)).rejects.toThrow("escrow_buyer_chain_refused")
  })
  it("refuses unsigned direct sends and expiry drift after signing", async () => {
    const h = await buyerRpcFixture(); let now = 1001
    const p = createEscrowBuyerChain({ ...h.options, nowSeconds: () => now }), signal = h.controller.signal
    await expect(p.broadcast(h.f.raw, signal)).rejects.toThrow("escrow_buyer_chain_refused")
    expect(h.calls).toHaveLength(0)
    await p.transactionTerms(h.f.action!, 2000000n, signal)
    const raw = await p.signTransaction(h.f.transaction, signal); now = h.f.intent.fundBy + 1
    await expect(p.broadcast(raw, signal)).rejects.toThrow("escrow_buyer_chain_refused")
    expect(h.calls.some(c => c.method === "eth_sendRawTransaction")).toBe(false)
  })
  it("retains the existing 400-observation transport bound", async () => {
    const h = await buyerRpcFixture(), p = createEscrowBuyerChain(h.options), signal = h.controller.signal
    for (let n = 0; n < 100; n++) await p.nonceState(signal)
    await expect(p.nonceState(signal)).rejects.toThrow("escrow_buyer_chain_refused")
    expect(h.calls).toHaveLength(400); expect(h.acquisitions()).toBe(0)
  })
  it.each(["reorg", "stale-head"])("refuses a receipt with %s evidence", async mode => {
    const h = await buyerRpcFixture(); h.mine()
    const fetch = (async (_url, init) => {
      const r = JSON.parse(String(init?.body)); let result = h.answer(r.method, r.params)
      if (r.method === "eth_getBlockByNumber" && (mode === "reorg" ? r.params[0] === "0x33" : r.params[0] === "finalized"))
        result = { ...(result as object), ...(mode === "reorg" ? { hash: hash(99) } : { timestamp: toHex(900) }) }
      return Response.json({ jsonrpc: "2.0", id: r.id, result })
    }) as typeof globalThis.fetch
    await expect(createEscrowBuyerChain({ ...h.options, fetch }).readReceipt(h.f.tx.hash, h.controller.signal)).rejects.toThrow("escrow_buyer_chain_refused")
    expect(h.acquisitions()).toBe(0)
  })
})
