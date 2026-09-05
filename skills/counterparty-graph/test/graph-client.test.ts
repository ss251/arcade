import { afterEach, describe, expect, it, vi } from "vitest"
import { encodeAbiParameters, encodeEventTopics, parseAbi, recoverTypedDataAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ExactEvmScheme } from "@x402/evm/exact/client"
import * as childProcess from "node:child_process"
import { PassThrough } from "node:stream"
vi.mock("node:child_process", { spy: true })
import { AGENT0_BASE_SUBGRAPH_ID, GATEWAY_BASE, PAYMENT_CHAIN, QUERY_COST_ATOMIC,
  document, makePaidQuery, readPayerKey, runKeyCommand } from "../graph-client.ts"

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
