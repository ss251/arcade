import { afterEach, describe, expect, it, vi } from "vitest"
import { encodeAbiParameters, encodeEventTopics, parseAbi, recoverTypedDataAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ExactEvmScheme } from "@x402/evm/exact/client"
import * as childProcess from "node:child_process"
import { PassThrough } from "node:stream"
import { createHash } from "node:crypto"
vi.mock("node:child_process", { spy: true })
import { AGENT0_BASE_SUBGRAPH_ID, GATEWAY_BASE, PAYMENT_CHAIN, QUERY_COST_ATOMIC,
  document, encodeGraphQuery, makePaidQuery, readPayerKey, runKeyCommand, verifyGraphReceiptEvidence, type GraphResponseObservation, type GraphPaymentIntent } from "../graph-client.ts"

// Actual installed x402 signer with simulated gateway/RPC; never live payment evidence.
const KEY = `0x${"11".repeat(32)}` as const
const PAYER = privateKeyToAccount(KEY).address.toLowerCase()
const TOKEN = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const MERCHANT = "0x79dc34e41b2b591078d3de222c43ecaabd52fccb"
const RESOURCE = `http://mainnet-thegraph-arbitrum-04-asia-east1.thegraph.com/subgraphs/id/${AGENT0_BASE_SUBGRAPH_ID}`
const TX = `0x${"a".repeat(64)}`
const BLOCK = `0x${"b".repeat(64)}`
const ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)", "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)"])
const types = { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] } as const
const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64")
const request = () => ({ subgraphId: AGENT0_BASE_SUBGRAPH_ID, document: document("identities"), variables: { address: PAYER } })
const challenge = () => ({ x402Version: 2, resource: { url: RESOURCE }, accepts: [{ scheme: "exact", network: PAYMENT_CHAIN,
  asset: TOKEN, amount: "10000", payTo: MERCHANT, maxTimeoutSeconds: 300,
  extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" } }] })
interface Payload { payload: { signature: `0x${string}`; authorization: { from: `0x${string}`; to: `0x${string}`; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` } } }
function fixture(options: { change?: (v: ReturnType<typeof challenge>) => unknown; receipt?: (r: Record<string, unknown>) => unknown; paidStatus?: number; header?: unknown; rpcChain?: string } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const payloads: Payload[] = []
  let rpcId = 0
  const net = Object.assign(vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init: init ?? {} })
    expect(init?.redirect).toBe("error"); expect(init?.credentials).toBe("omit")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (url.startsWith(GATEWAY_BASE)) {
      expect(url).toBe(`${GATEWAY_BASE}${AGENT0_BASE_SUBGRAPH_ID}`)
      const signature = new Headers(init?.headers).get("payment-signature")
      if (!signature) return new Response(null, { status: 402, headers: { "payment-required": enc(options.change ? options.change(challenge()) : challenge()) } })
      payloads.push(JSON.parse(Buffer.from(signature, "base64").toString()) as Payload)
      return Response.json({ data: { _meta: { block: { number: 41, hash: BLOCK }, hasIndexingErrors: false }, asWallet: [], asOwner: [] } },
        { status: options.paidStatus ?? 200, headers: { "payment-response": enc(options.header ?? { success: true, network: PAYMENT_CHAIN, payer: PAYER, transaction: TX }) } })
    }
    expect(url).toBe("https://mainnet.base.org")
    rpcId++; expect(body.id).toBe(rpcId)
    let result: unknown
    if (body.method === "eth_chainId") result = options.rpcChain ?? "0x2105"
    else if (body.method === "eth_getBlockByNumber") result = { number: "0x29", hash: BLOCK, timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` }
    else if (body.method === "eth_getTransactionReceipt") {
      const nonce = payloads.at(-1)!.payload.authorization.nonce
      const base = { address: TOKEN, transactionHash: TX, blockHash: BLOCK, blockNumber: "0x29", transactionIndex: "0x0", removed: false }
      const receipt = { transactionHash: TX, blockHash: BLOCK, blockNumber: "0x29", transactionIndex: "0x0", status: "0x1", logs: [
        { ...base, logIndex: "0x0", topics: encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: PAYER as `0x${string}`, to: MERCHANT } }), data: encodeAbiParameters([{ type: "uint256" }], [10000n]) },
        { ...base, logIndex: "0x1", topics: encodeEventTopics({ abi: ABI, eventName: "AuthorizationUsed", args: { authorizer: PAYER as `0x${string}`, nonce } }), data: "0x" }
      ] }
      result = options.receipt ? options.receipt(receipt) : receipt
    } else throw new Error("unexpected fixture RPC")
    return Response.json({ jsonrpc: "2.0", id: body.id, result })
  }), { preconnect: () => {} })
  return { net, calls, payloads }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe("inert request encoding", () => {
  it("matches the original query transport bytes exactly", async () => {
    const args = request(), encoded = encodeGraphQuery(args), f = fixture()
    expect(encoded).toBe(JSON.stringify({ query: args.document, variables: args.variables }))
    await makePaidQuery(KEY, { fetch: f.net })(args)
    expect(f.calls.filter(call => call.url.startsWith(GATEWAY_BASE)).map(call => call.init.body)).toEqual([encoded, encoded])
  })
  it("uses the original closed validator without resolving transport or Keychain", () => {
    const net = vi.fn(), keychain = vi.spyOn(childProcess, "spawn")
    vi.stubGlobal("fetch", net)
    try {
      expect(encodeGraphQuery(request())).toContain('"variables"')
      for (const args of [{ ...request(), subgraphId: "foreign" }, { ...request(), document: "query { arbitrary }" },
        { ...request(), variables: { address: PAYER, extra: true } }]) expect(() => encodeGraphQuery(args)).toThrow()
      expect(net).not.toHaveBeenCalled(); expect(keychain).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
})

describe("supplied receipt consistency", () => {
  it("reuses the client's successful receipt without fetching or signing again", async () => {
    let receipt: Record<string, unknown> | undefined
    const f = fixture({ receipt: value => { receipt = value; return value } })
    await makePaidQuery(KEY, { fetch: f.net })(request())
    const count = f.calls.length, nonce = f.payloads[0]!.payload.authorization.nonce
    const result = verifyGraphReceiptEvidence({ payer: PAYER, transaction: TX, nonce, receipt,
      block: { number: "0x29", hash: BLOCK, timestamp: "0x1" } })
    expect(result).toMatchObject({ payer: PAYER, transaction: TX, nonce, blockNumber: "0x29", blockHash: BLOCK })
    expect(Object.isFrozen(result)).toBe(true); expect(f.calls).toHaveLength(count)
  })
  it.each(["payer", "transaction", "nonce", "status", "token", "amount", "recipient", "removed", "duplicate-transfer", "duplicate-authorization", "log-transaction", "log-index", "zero-transaction", "zero-nonce", "uppercase-transaction", "block-number", "block-hash", "block-time"])("refuses mismatched supplied %s using the shared checks", async fault => {
    let receipt: Record<string, unknown> | undefined
    const f = fixture({ receipt: value => { receipt = value; return value } })
    await makePaidQuery(KEY, { fetch: f.net })(request())
    const input = { payer: PAYER, transaction: TX, nonce: f.payloads[0]!.payload.authorization.nonce, receipt: structuredClone(receipt!),
      block: { number: "0x29", hash: BLOCK, timestamp: "0x1" } }
    const logs = input.receipt.logs as Record<string, unknown>[]
    if (fault === "payer") input.payer = MERCHANT
    if (fault === "transaction") input.transaction = BLOCK
    if (fault === "nonce") input.nonce = BLOCK as `0x${string}`
    if (fault === "status") input.receipt.status = "0x0"
    if (fault === "token") logs[0]!.address = MERCHANT
    if (fault === "amount") logs[0]!.data = encodeAbiParameters([{ type: "uint256" }], [9999n])
    if (fault === "recipient") logs[0]!.topics = encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: PAYER as `0x${string}`, to: PAYER as `0x${string}` } })
    if (fault === "removed") logs[0]!.removed = true
    if (fault === "duplicate-transfer") logs.push({ ...logs[0], logIndex: "0x2" })
    if (fault === "duplicate-authorization") logs.push({ ...logs[1], logIndex: "0x2" })
    if (fault === "log-transaction") logs[0]!.transactionHash = BLOCK
    if (fault === "log-index") logs[1]!.logIndex = "0x0"
    if (fault === "zero-transaction" || fault === "uppercase-transaction") {
      input.transaction = fault === "zero-transaction" ? `0x${"0".repeat(64)}` : `0x${"A".repeat(64)}`
      input.receipt.transactionHash = input.transaction
      for (const log of logs) log.transactionHash = input.transaction
    }
    if (fault === "zero-nonce") {
      input.nonce = `0x${"0".repeat(64)}`
      logs[1]!.topics = encodeEventTopics({ abi: ABI, eventName: "AuthorizationUsed", args: { authorizer: PAYER as `0x${string}`, nonce: input.nonce } })
    }
    if (fault === "block-number") input.block.number = "0x30"
    if (fault === "block-hash") input.block.hash = TX
    if (fault === "block-time") input.block.timestamp = "0x01"
    const calls = f.calls.length
    expect(() => verifyGraphReceiptEvidence(input)).toThrow(/^graph query could not be completed$/)
    expect(f.calls).toHaveLength(calls); expect(f.payloads).toHaveLength(1)
  })
  it("preserves acceptance of unrelated well-formed logs without treating them as another payment", async () => {
    let receipt: Record<string, unknown> | undefined
    const f = fixture({ receipt: value => { receipt = value; return value } })
    await makePaidQuery(KEY, { fetch: f.net })(request())
    const logs = receipt!.logs as Record<string, unknown>[]
    logs.push({ ...logs[0], address: MERCHANT, logIndex: "0x2" })
    const result = verifyGraphReceiptEvidence({ payer: PAYER, transaction: TX, nonce: f.payloads[0]!.payload.authorization.nonce,
      receipt, block: { number: "0x29", hash: BLOCK, timestamp: "0x1" } })
    expect(result.evidence).toBe("supplied-receipt-and-block")
    expect(result.blockHash).toBe(BLOCK)
  })
  it("refuses malformed expected references and getters without consulting any key or transport", () => {
    let invoked = false
    for (const input of [null, {}, { payer: PAYER, transaction: TX, nonce: BLOCK, receipt: {}, block: {}, extra: true },
      { payer: PAYER.toUpperCase(), transaction: TX, nonce: BLOCK, receipt: {}, block: {} },
      { payer: PAYER, get transaction() { invoked = true; return TX }, nonce: BLOCK, receipt: {}, block: {} }]) {
      expect(() => verifyGraphReceiptEvidence(input)).toThrow(/^graph query could not be completed$/)
    }
    expect(invoked).toBe(false)
  })
})

describe("awaited pre-forward payment intent", () => {
  it("observes the validated authorization and exact wire hashes before the single paid transport", async () => {
    const f = fixture(), intents: GraphPaymentIntent[] = []
    await makePaidQuery(KEY, { fetch: f.net, beforePaidRequest: async intent => {
      intents.push(intent)
      expect(f.calls).toHaveLength(3); expect(f.payloads).toHaveLength(0)
      expect(Object.isFrozen(intent)).toBe(true); expect(Object.isFrozen(intent.domain)).toBe(true)
      expect(Object.isFrozen(intent.authorization)).toBe(true)
      expect(() => Object.defineProperty(intent.authorization, "validBefore", { value: "9999999999" })).toThrow()
      expect(() => Object.defineProperty(intent.domain, "chainId", { value: 1 })).toThrow()
    } })(request())
    expect(intents).toHaveLength(1)
    const intent = intents[0]!, payload = f.payloads[0]!.payload.authorization
    expect(intent.endpoint).toBe(GATEWAY_BASE + AGENT0_BASE_SUBGRAPH_ID); expect(intent.network).toBe(PAYMENT_CHAIN)
    expect(intent.primaryType).toBe("TransferWithAuthorization")
    expect(intent.domain).toEqual({ name: "USD Coin", version: "2", chainId: 8453, verifyingContract: TOKEN })
    expect(intent.authorization).toEqual({ from: payload.from.toLowerCase(), to: payload.to.toLowerCase(), value: payload.value,
      validAfter: payload.validAfter, validBefore: payload.validBefore, nonce: payload.nonce.toLowerCase() })
    const sha = (value: string) => createHash("sha256").update(value).digest("hex")
    expect(intent.authorizationSha256).toBe(sha(JSON.stringify({ domain: intent.domain, primaryType: intent.primaryType, authorization: intent.authorization })))
    const paid = f.calls.find(call => new Headers(call.init.headers).has("payment-signature"))!
    expect(intent.paymentHeaderSha256).toBe(sha(new Headers(paid.init.headers).get("payment-signature")!))
    expect(intent.requestBodySha256).toBe(sha(String(paid.init.body)))
    expect(JSON.stringify(intent)).not.toContain(KEY); expect(JSON.stringify(intent)).not.toContain(f.payloads[0]!.payload.signature)
    expect(f.payloads).toHaveLength(1)
  })
  it("refuses a failed durable-intent callback before forwarding and retains signed uncertainty", async () => {
    const f = fixture(), beforePaidRequest = vi.fn(async () => { throw Error(KEY) })
    const query = makePaidQuery(KEY, { fetch: f.net, beforePaidRequest })
    await expect(query(request())).rejects.toThrow(/^graph query could not be completed$/)
    await expect(query(request())).rejects.toThrow(/^graph query could not be completed$/)
    expect(beforePaidRequest).toHaveBeenCalledTimes(1); expect(f.payloads).toHaveLength(0); expect(f.calls).toHaveLength(3)
  })
  it.each([80000, 1000])("a stalled observer stays within overall timeout %s and cannot forward after late resolution", async timeoutMs => {
    vi.useFakeTimers(); const f = fixture()
    let release: (() => void) | undefined, signal: AbortSignal | undefined
    const beforePaidRequest = vi.fn(async (_intent: GraphPaymentIntent, activeSignal: AbortSignal) => {
      signal = activeSignal; await new Promise<void>(resolve => { release = resolve })
    })
    const query = makePaidQuery(KEY, { fetch: f.net, timeoutMs, beforePaidRequest })
    const result = query(request()).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(Math.min(5000, timeoutMs) + 100)
    expect(await result).toMatchObject({ message: "graph query could not be completed" })
    expect(signal?.aborted).toBe(true); expect(f.calls).toHaveLength(3); expect(f.payloads).toHaveLength(0)
    release?.(); await vi.advanceTimersByTimeAsync(1)
    await expect(query(request())).rejects.toThrow()
    expect(beforePaidRequest).toHaveBeenCalledTimes(1); expect(f.calls).toHaveLength(3)
  })
  it("external abort during a callback prevents forwarding and does not wait for the callback to cooperate", async () => {
    vi.useFakeTimers(); const f = fixture(), controller = new AbortController()
    let release: (() => void) | undefined, observedSignal: AbortSignal | undefined
    const query = makePaidQuery(KEY, { fetch: f.net, signal: controller.signal, beforePaidRequest: async (_intent, signal) => {
      observedSignal = signal; await new Promise<void>(resolve => { release = resolve })
    } })
    const result = query(request()).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1); controller.abort()
    expect(await result).toMatchObject({ message: "graph query could not be completed" })
    expect(observedSignal?.aborted).toBe(true); release?.(); await vi.advanceTimersByTimeAsync(1)
    expect(f.calls).toHaveLength(3); expect(f.payloads).toHaveLength(0)
  })
  it("captures the callback once and never invokes it for an invalid unsigned challenge", async () => {
    const f = fixture(), original = vi.fn(async (_intent: GraphPaymentIntent) => {}), replacement = vi.fn(async (_intent: GraphPaymentIntent) => {})
    const options = { fetch: f.net, beforePaidRequest: original }
    const query = makePaidQuery(KEY, options); options.beforePaidRequest = replacement
    await query(request()); expect(original).toHaveBeenCalledTimes(1); expect(replacement).not.toHaveBeenCalled()
    const bad = fixture({ change: c => ({ ...c, accepts: [{ ...c.accepts[0], amount: "1" }] }) })
    await expect(makePaidQuery(KEY, { fetch: bad.net, beforePaidRequest: replacement })(request())).rejects.toThrow()
    expect(replacement).not.toHaveBeenCalled(); expect(bad.calls).toHaveLength(1); expect(bad.payloads).toHaveLength(0)
  })
  it("does not extend the original run deadline when a callback returns after advancing its clock", async () => {
    let time = Date.now(); const f = fixture()
    const query = makePaidQuery(KEY, { fetch: f.net, now: () => time, timeoutMs: 1000,
      beforePaidRequest: async () => { time += 1001 } })
    await expect(query(request())).rejects.toThrow(/^graph query could not be completed$/)
    expect(f.calls).toHaveLength(3); expect(f.payloads).toHaveLength(0)
    await expect(query(request())).rejects.toThrow()
  })
  it.each([5000, 5001, -1])("refuses a callback clock change of %s outside its own bounded interval", async delta => {
    let time = Date.now(); const f = fixture()
    const query = makePaidQuery(KEY, { fetch: f.net, now: () => time,
      beforePaidRequest: async () => { time += delta } })
    await expect(query(request())).rejects.toThrow(/^graph query could not be completed$/)
    expect(f.calls).toHaveLength(3); expect(f.payloads).toHaveLength(0)
  })
  it("rejects a non-callable observer at factory creation before transport", () => {
    const f = fixture()
    for (const invalid of [null, true, {}]) expect(() => makePaidQuery(KEY, { fetch: f.net, beforePaidRequest: invalid as never })).toThrow()
    expect(f.calls).toHaveLength(0)
  })
})

describe("awaited private response observation", () => {
  it("captures immutable complete bytes without exposing or changing the original response", async () => {
    const f = fixture(), observed: GraphResponseObservation[] = []
    const result = await makePaidQuery(KEY, { fetch: f.net, observeResponse: async (value) => {
      observed.push(value)
      expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.headers)).toBe(true)
      expect(() => Object.defineProperty(value, "status", { value: 500 })).toThrow()
      expect(() => Object.defineProperty(value.headers, "payment-required", { value: "changed" })).toThrow()
    } })(request())
    expect(result.paymentTx).toBe(TX)
    expect(observed.map(value => value.phase)).toEqual(["challenge", "rpc", "rpc", "paid", "rpc", "rpc", "rpc"])
    expect(observed).toHaveLength(f.calls.length)
    const paid = observed.find(value => value.phase === "paid")!
    expect(paid.status).toBe(200); expect(paid.headers["payment-response"]).toBeTruthy()
    expect(JSON.parse(Buffer.from(paid.bodyBase64, "base64").toString()).data._meta.hasIndexingErrors).toBe(false)
    expect(paid.bodySha256).toMatch(/^[a-f0-9]{64}$/); expect(paid.requestBodySha256).toMatch(/^[a-f0-9]{64}$/)
    expect(paid.bodySha256).toBe(createHash("sha256").update(Buffer.from(paid.bodyBase64, "base64")).digest("hex"))
    const paidCall = f.calls.find(call => new Headers(call.init.headers).has("payment-signature"))!
    expect(paid.requestBodySha256).toBe(createHash("sha256").update(String(paidCall.init.body)).digest("hex"))
    expect(JSON.stringify(observed)).not.toContain(KEY)
    expect(Object.keys(paid.headers)).not.toContain("payment-signature")
    expect(Object.keys(paid.headers)).not.toContain("authorization")
  })
  it.each([402, 500])("captures a complete signed HTTP %s before refusal and never repeats it", async (paidStatus) => {
    const f = fixture({ paidStatus }), observed: GraphResponseObservation[] = []
    const query = makePaidQuery(KEY, { fetch: f.net, observeResponse: async value => { observed.push(value) } })
    await expect(query(request())).rejects.toThrow(/^graph query could not be completed$/)
    await expect(query(request())).rejects.toThrow()
    expect(f.payloads).toHaveLength(1)
    const paid = observed.filter(value => value.phase === "paid")
    expect(paid).toHaveLength(1); expect(paid[0]!.status).toBe(paidStatus)
    expect(Buffer.from(paid[0]!.bodyBase64, "base64").toString()).toContain('"data"')
  })
  it("records an unsigned challenge without granting a callback authority to repair its policy", async () => {
    const f = fixture({ change: c => ({ ...c, accepts: [{ ...c.accepts[0], amount: "10001" }] }) })
    const observer = vi.fn(async (_value: GraphResponseObservation) => {})
    await expect(makePaidQuery(KEY, { fetch: f.net, observeResponse: observer })(request())).rejects.toThrow()
    expect(observer).toHaveBeenCalledTimes(1); expect(f.payloads).toHaveLength(0)
  })
  it("redacts an observer exception and refuses before any signing", async () => {
    const f = fixture()
    await expect(makePaidQuery(KEY, { fetch: f.net, observeResponse: async () => { throw Error(KEY) } })(request())).rejects.toThrow(/^graph query could not be completed$/)
    expect(f.payloads).toHaveLength(0); expect(f.calls).toHaveLength(1)
  })
  it("cancels a stalled observer and never signs after it later resolves", async () => {
    vi.useFakeTimers(); const f = fixture()
    let release: (() => void) | undefined, signal: AbortSignal | undefined
    const observer = async (_value: GraphResponseObservation, activeSignal: AbortSignal) => {
      signal = activeSignal; await new Promise<void>(resolve => { release = resolve })
    }
    const result = makePaidQuery(KEY, { fetch: f.net, observeResponse: observer })(request()).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5100)
    expect(await result).toMatchObject({ message: "graph query could not be completed" })
    expect(signal?.aborted).toBe(true); release?.()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.payloads).toHaveLength(0); expect(f.calls).toHaveLength(1)
  })
  it("keeps signed uncertainty when a paid-response observer returns after its deadline", async () => {
    vi.useFakeTimers(); const f = fixture()
    let release: (() => void) | undefined, paidSignal: AbortSignal | undefined
    const query = makePaidQuery(KEY, { fetch: f.net, observeResponse: async (value, signal) => {
      if (value.phase === "paid") {
        paidSignal = signal; await new Promise<void>(resolve => { release = resolve })
      }
    } })
    const result = query(request()).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5100)
    expect(await result).toMatchObject({ message: "graph query could not be completed" })
    expect(paidSignal?.aborted).toBe(true); expect(f.payloads).toHaveLength(1); expect(f.calls).toHaveLength(4)
    release?.(); await vi.advanceTimersByTimeAsync(1)
    await expect(query(request())).rejects.toThrow()
    expect(f.calls).toHaveLength(4); expect(f.payloads).toHaveLength(1)
  })
  it("captures the observer once rather than following later option mutation", async () => {
    const f = fixture(), original = vi.fn(async (_value: GraphResponseObservation) => {}),
      replacement = vi.fn(async (_value: GraphResponseObservation) => {})
    const options = { fetch: f.net, observeResponse: original }
    const query = makePaidQuery(KEY, options); options.observeResponse = replacement
    await query(request())
    expect(original).toHaveBeenCalledTimes(7); expect(replacement).not.toHaveBeenCalled()
  })
})

describe("explicit payer selection", () => {
  it("uses only an explicit env key without probing Keychain", async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: KEY }))
    expect(await readPayerKey({ GRAPH_X402_PAYER_KEY: KEY }, runner)).toBe(KEY)
    expect(runner).not.toHaveBeenCalled()
  })
  it("accepts the actual Node environment object without inherited configuration", async () => {
    vi.stubEnv("GRAPH_X402_PAYER_KEY", KEY); vi.stubEnv("GRAPH_X402_KEYCHAIN_SERVICE", undefined)
    const runner = vi.fn(async () => ({ code: 0, stdout: KEY }))
    expect(await readPayerKey(process.env, runner)).toBe(KEY)
    await expect(readPayerKey(Object.create({ GRAPH_X402_PAYER_KEY: KEY }) as Record<string, string>, runner)).rejects.toThrow()
    expect(runner).not.toHaveBeenCalled()
  })
  it("uses an explicitly named Keychain item once without env fallback", async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: `${KEY}\n` }))
    expect(await readPayerKey({ GRAPH_X402_KEYCHAIN_SERVICE: "fixture-payer" }, runner)).toBe(KEY)
    expect(runner).toHaveBeenCalledExactlyOnceWith(["/usr/bin/security", "find-generic-password", "-s", "fixture-payer", "-w"])
  })
  it.each([{}, { GRAPH_X402_PAYER_KEY: KEY, GRAPH_X402_KEYCHAIN_SERVICE: "fixture" }, { GRAPH_X402_PAYER_KEY: `0x${"0".repeat(64)}` }, { GRAPH_X402_PAYER_KEY: `0x${"f".repeat(64)}` }, { GRAPH_X402_PAYER_KEY: "private-invalid" }, { GRAPH_X402_KEYCHAIN_SERVICE: "bad\nservice" }])("refuses absent, ambiguous or malformed configuration before running", async (env) => {
    const runner = vi.fn(async () => ({ code: 0, stdout: KEY }))
    await expect(readPayerKey(env, runner)).rejects.toThrow("graph payer key unavailable")
    expect(runner).not.toHaveBeenCalled()
  })
  it("sanitizes nonzero/oversize/throwing Keychain output", async () => {
    for (const runner of [async () => ({ code: 1, stdout: KEY }), async () => ({ code: 0, stdout: KEY.repeat(30) }), async () => { throw new Error(KEY) }]) {
      await expect(readPayerKey({ GRAPH_X402_KEYCHAIN_SERVICE: "fixture" }, runner)).rejects.toThrow(/^graph payer key unavailable$/)
    }
  })
  it("bounds an injected uncooperative key reader", async () => {
    vi.useFakeTimers()
    const result = readPayerKey({ GRAPH_X402_KEYCHAIN_SERVICE: "fixture" }, () => new Promise(() => {})).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(3500)
    expect(await result).toMatchObject({ message: "graph payer key unavailable" })
  })
  it("waits for owned command close rather than letting a second outer timer win", async () => {
    vi.useFakeTimers()
    const child = new childProcess.ChildProcess(); child.stdout = new PassThrough()
    const kills: Array<NodeJS.Signals | number | undefined> = []
    vi.spyOn(child, "kill").mockImplementation((signal) => { kills.push(signal); return true })
    vi.spyOn(childProcess, "spawn").mockReturnValue(child)
    let settled = false
    const result = readPayerKey({ GRAPH_X402_KEYCHAIN_SERVICE: "fixture-never-spawned" }, runKeyCommand).catch((e: unknown) => e).finally(() => { settled = true })
    await vi.advanceTimersByTimeAsync(3100)
    expect(kills).toEqual(["SIGTERM", "SIGKILL"]); expect(settled).toBe(false)
    child.emit("close", null, "SIGKILL")
    expect(await result).toMatchObject({ message: "graph payer key unavailable" })
  })
})

describe("exact query and x402 policy", () => {
  it.each(["errorReason", "errorMessage", "extensions", "unreviewed"])("rejects contradictory or unreviewed settlement %s", async (field) => {
    const f = fixture({ header: { success: true, network: PAYMENT_CHAIN, payer: PAYER, transaction: TX, [field]: "private-provider-field" } })
    await expect(makePaidQuery(KEY, { fetch: f.net })(request())).rejects.toThrow(/^graph query could not be completed$/)
  })
  it.each(["length", "encoding"])("refuses %s mismatch before reading a challenge or signing", async (mode) => {
    const f = fixture(); const net = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = await f.net(input, init)
      if (!String(input).startsWith(GATEWAY_BASE)) return r
      const headers = new Headers(r.headers)
      if (mode === "length") headers.set("content-length", "1")
      else headers.set("content-encoding", "gzip")
      return new Response(r.body, { status: r.status, headers })
    }, { preconnect: () => {} })
    await expect(makePaidQuery(KEY, { fetch: net })(request())).rejects.toThrow()
    expect(f.payloads).toHaveLength(0)
    expect(new Headers(f.calls[0]!.init.headers).get("accept-encoding")).toBe("identity")
  })
  it("closes signing authority when the query's SDK phase times out before the run deadline", async () => {
    vi.useFakeTimers(); const original = ExactEvmScheme.prototype.createPaymentPayload; let lateSigned = false
    vi.spyOn(ExactEvmScheme.prototype, "createPaymentPayload").mockImplementation(async function (this: ExactEvmScheme, ...args) {
      await new Promise((resolve) => setTimeout(resolve, 6000))
      const result = await original.apply(this, args); lateSigned = true; return result
    })
    const f = fixture(); const result = makePaidQuery(KEY, { fetch: f.net })(request()).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5100)
    expect(await result).toMatchObject({ message: "graph query could not be completed" })
    await vi.advanceTimersByTimeAsync(1100)
    expect(lateSigned).toBe(false); expect(f.payloads).toHaveLength(0)
  })
  it("signs actual SDK EIP3009 once and reports spend only after matching RPC events", async () => {
    const f = fixture(); const query = makePaidQuery(KEY, { fetch: f.net })
    const result = await query(request())
    expect(result.costAtomic).toBe(QUERY_COST_ATOMIC); expect(result.paymentTx).toBe(TX)
    expect(f.calls.filter((c) => c.url.startsWith(GATEWAY_BASE))).toHaveLength(2)
    expect(f.payloads).toHaveLength(1)
    const { authorization: a, signature } = f.payloads[0]!.payload
    expect(a).toMatchObject({ from: expect.stringMatching(new RegExp(PAYER, "i")), to: expect.stringMatching(new RegExp(MERCHANT, "i")), value: "10000", validAfter: "0" })
    const recovered = await recoverTypedDataAddress({ domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: TOKEN }, types, primaryType: "TransferWithAuthorization",
      message: { from: a.from, to: a.to, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce }, signature })
    expect(recovered.toLowerCase()).toBe(PAYER)
    expect(JSON.stringify(f.calls)).not.toContain(KEY)
    expect(f.calls.every((c) => c.url !== RESOURCE)).toBe(true)
  })
  it.each([
    ["v1", (c: ReturnType<typeof challenge>) => ({ ...c, x402Version: 1 })],
    ["extensions", (c: ReturnType<typeof challenge>) => ({ ...c, extensions: { arbitrary: {} } })],
    ["resource", (c: ReturnType<typeof challenge>) => ({ ...c, resource: { url: "https://private.invalid" } })],
    ...[ ["network", "eip155:1"], ["asset", MERCHANT], ["payTo", TOKEN], ["amount", "10001"], ["amount", "010000"], ["scheme", "upto"], ["maxTimeoutSeconds", 604800] ].map(([k, v]) => [String(k), (c: ReturnType<typeof challenge>) => ({ ...c, accepts: [{ ...c.accepts[0], [String(k)]: v }] })] as const),
    ["permit2", (c: ReturnType<typeof challenge>) => ({ ...c, accepts: [{ ...c.accepts[0], extra: { ...c.accepts[0]!.extra, assetTransferMethod: "permit2" } }] })],
    ["domain", (c: ReturnType<typeof challenge>) => ({ ...c, accepts: [{ ...c.accepts[0], extra: { ...c.accepts[0]!.extra, name: "USDC" } }] })],
    ["payment flow", (c: ReturnType<typeof challenge>) => ({ ...c, accepts: [{ ...c.accepts[0], extra: { ...c.accepts[0]!.extra, paymentFlow: "escrow" } }] })],
    ["ambiguous", (c: ReturnType<typeof challenge>) => ({ ...c, accepts: [...c.accepts, ...c.accepts] })]
  ] as const)("rejects %s before signing or paid HTTP", async (_name, change) => {
    const f = fixture({ change }); await expect(makePaidQuery(KEY, { fetch: f.net })(request())).rejects.toThrow(/^graph query could not be completed$/)
    expect(f.payloads).toHaveLength(0); expect(f.calls).toHaveLength(1)
  })
  it("rejects foreign RPC chain before signing", async () => {
    const f = fixture({ rpcChain: "0x1" }); await expect(makePaidQuery(KEY, { fetch: f.net })(request())).rejects.toThrow()
    expect(f.payloads).toHaveLength(0)
  })
  it("validates exact documents/subgraph/closed variables before I/O", async () => {
    const f = fixture(); const q = makePaidQuery(KEY, { fetch: f.net })
    for (const args of [{ ...request(), subgraphId: "foreign" }, { ...request(), document: "query { __schema { types { name } } }" }, { ...request(), variables: { address: "bad" } }, { ...request(), variables: { address: PAYER, extra: "private" } }]) await expect(q(args)).rejects.toThrow()
    expect(f.calls).toHaveLength(0)
    expect(() => document("../../private" as "identities")).toThrow()
  })
  it("bounds two queries and never lets a third purchase through", async () => {
    const f = fixture(); const q = makePaidQuery(KEY, { fetch: f.net })
    await q(request()); await q({ subgraphId: AGENT0_BASE_SUBGRAPH_ID, document: document("attestations"), variables: { agentIds: ["8453:7"], block: { hash: BLOCK } } })
    await expect(q(request())).rejects.toThrow(); expect(f.payloads).toHaveLength(2)
  })
  it("bounds failed unsigned attempts as well as successful authorizations", async () => {
    const f = fixture({ change: (c) => ({ ...c, x402Version: 1 }) }); const q = makePaidQuery(KEY, { fetch: f.net })
    for (let i = 0; i < 3; i++) await expect(q(request())).rejects.toThrow()
    expect(f.calls).toHaveLength(2); expect(f.payloads).toHaveLength(0)
  })
  it("rejects an unsupported response body before granting a third operation", async () => {
    const f = fixture(); let requests = 0
    const net = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith(GATEWAY_BASE) && new Headers(init?.headers).has("payment-signature")) {
        requests++; return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1048577)); c.close() } }), { headers: { "payment-response": enc({ success: true, network: PAYMENT_CHAIN, payer: PAYER, transaction: TX }) } })
      }
      return f.net(input, init)
    }, { preconnect: () => {} })
    const q = makePaidQuery(KEY, { fetch: net }); await expect(q(request())).rejects.toThrow(); await expect(q(request())).rejects.toThrow()
    expect(requests).toBe(1)
  })
  it("rejects overlapping calls and keeps exactly one active authorization", async () => {
    const f = fixture(); const q = makePaidQuery(KEY, { fetch: f.net })
    const first = q(request()); await expect(q(request())).rejects.toThrow(); await first
    expect(f.payloads).toHaveLength(1)
  })
  it.each([402, 500])("never repeats or permits another purchase after signed HTTP %s", async (paidStatus) => {
    const f = fixture({ paidStatus }); const q = makePaidQuery(KEY, { fetch: f.net })
    await expect(q(request())).rejects.toThrow(); await expect(q(request())).rejects.toThrow()
    expect(f.calls.filter((c) => c.url.startsWith(GATEWAY_BASE))).toHaveLength(2); expect(f.payloads).toHaveLength(1)
  })
  it("does not mutate ambient fetch or payment configuration", async () => {
    vi.stubEnv("X402_PRIVATE_KEY", "public-dummy-reserved-fixture")
    const oldFetch = globalThis.fetch, old = process.env.X402_PRIVATE_KEY
    const f = fixture(); await makePaidQuery(KEY, { fetch: f.net })(request())
    expect(globalThis.fetch).toBe(oldFetch); expect(process.env.X402_PRIVATE_KEY).toBe(old)
  })
})

describe("independent payment receipt proof", () => {
  it("rejects malformed claimed USDC settlement logs even beside a valid event pair", async () => {
    const f = fixture({ receipt: (r) => ({ ...r, logs: [...r.logs as Array<Record<string, unknown>>, { ...(r.logs as Array<Record<string, unknown>>)[0], logIndex: "0x2", data: "0x" }] }) })
    await expect(makePaidQuery(KEY, { fetch: f.net })(request())).rejects.toThrow()
  })
  it("cancels during a stalled signed response and never forwards another authorization", async () => {
    const f = fixture(); const controller = new AbortController(); let paid = 0, cancelled = false
    const net = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new Headers(init?.headers).has("payment-signature")) {
        paid++; queueMicrotask(() => controller.abort())
        return new Response(new ReadableStream({ cancel() { cancelled = true } }))
      }
      return f.net(input, init)
    }, { preconnect: () => {} })
    const q = makePaidQuery(KEY, { fetch: net, signal: controller.signal })
    await expect(q(request())).rejects.toThrow(); await expect(q(request())).rejects.toThrow()
    expect(paid).toBe(1); expect(cancelled).toBe(true)
  })
  it.each([
    ["failed", (r: Record<string, unknown>) => ({ ...r, status: "0x0" })],
    ["wrong transaction", (r: Record<string, unknown>) => ({ ...r, transactionHash: BLOCK })],
    ["no events", (r: Record<string, unknown>) => ({ ...r, logs: [] })],
    ...["removed", "amount", "nonce", "payer", "token", "loghash", "duplicate"].map((kind) => [kind, (r: Record<string, unknown>) => {
      const logs = structuredClone(r.logs) as Array<Record<string, unknown>>
      if (kind === "removed") logs[0]!.removed = "true"
      if (kind === "amount") logs[0]!.data = encodeAbiParameters([{ type: "uint256" }], [1n])
      if (kind === "nonce") logs[1]!.topics = encodeEventTopics({ abi: ABI, eventName: "AuthorizationUsed", args: { authorizer: PAYER as `0x${string}`, nonce: BLOCK as `0x${string}` } })
      if (kind === "payer") logs[0]!.topics = encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: TOKEN, to: MERCHANT } })
      if (kind === "token") logs[0]!.address = MERCHANT
      if (kind === "loghash") logs[0]!.transactionHash = BLOCK
      if (kind === "duplicate") logs.push({ ...logs[0]!, logIndex: "0x2" })
      return { ...r, logs }
    }] as const)
  ] as const)("rejects %s proof and retains signed uncertainty", async (_name, receipt) => {
    const f = fixture({ receipt }); const q = makePaidQuery(KEY, { fetch: f.net })
    await expect(q(request())).rejects.toThrow(/^graph query could not be completed$/)
    await expect(q(request())).rejects.toThrow(); expect(f.payloads).toHaveLength(1)
  })
  it("does not trust a header's success/transaction without independent proof", async () => {
    const f = fixture({ header: { success: true, network: PAYMENT_CHAIN, payer: PAYER, transaction: "private-provider-value" } })
    await expect(makePaidQuery(KEY, { fetch: f.net })(request())).rejects.toThrow(/^graph query could not be completed$/)
    expect(f.payloads).toHaveLength(1)
  })
  it("bounds permanent pending and does not resend", async () => {
    vi.useFakeTimers(); const f = fixture({ receipt: () => null }); const q = makePaidQuery(KEY, { fetch: f.net })
    const result = q(request()).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(16000)
    expect(await result).toMatchObject({ message: "graph query could not be completed" })
    await expect(q(request())).rejects.toThrow(); expect(f.payloads).toHaveLength(1)
  })
  it("aborts an uncooperative unsigned response without any late signing", async () => {
    vi.useFakeTimers(); let finish: ((r: Response) => void) | undefined
    const net = Object.assign(vi.fn(() => new Promise<Response>((resolve) => { finish = resolve })), { preconnect: () => {} })
    const q = makePaidQuery(KEY, { fetch: net, timeoutMs: 1000 })
    const result = q(request()).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1100)
    expect(await result).toMatchObject({ message: "graph query could not be completed" })
    finish?.(new Response(null, { status: 402, headers: { "payment-required": enc(challenge()) } }))
    await vi.advanceTimersByTimeAsync(1); expect(net).toHaveBeenCalledTimes(1)
  })
})
