import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { decodeFunctionData, encodeAbiParameters, erc20Abi, keccak256, parseAbi,
  parseTransaction, recoverTransactionAddress, recoverTypedDataAddress, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { createGateRuntime, openGateJournal } from "./gateway-gate-runtime.ts"
import { GATE, GatewayGateError, executeGatewayGate, makeGatewayPayment,
  type GateFetch, type GateOptions } from "./gateway-gate.ts"

// Public deterministic fixture scalar, never a funded account or environment-derived key.
const fixtureKey = `0x${"00".repeat(31)}01` as Hex
const buyer = privateKeyToAccount(fixtureKey).address
const payTo = "0x2222222222222222222222222222222222222222" as Hex
const blockHash = `0x${"ab".repeat(32)}` as Hex
const nonce = `0x${"cd".repeat(32)}` as Hex
const id = "3c90c3cc-0d44-4b50-8888-8dd25736052a"
const gatewayAbi = parseAbi(["function deposit(address token,uint256 value)",
  "function totalBalance(address token,address depositor) view returns (uint256)"])
const uint = (n: bigint) => encodeAbiParameters([{ type: "uint256" }], [n])
const dirs: string[] = []
const runtimes: Array<ReturnType<typeof createGateRuntime>> = []
afterEach(async () => {
  for (const r of runtimes.splice(0)) await r.close()
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

type WireCall = { url: string; method: string; params?: readonly unknown[]; body: Record<string, unknown> }
type Fault = "none" | "send-unknown" | "settle-unknown" | "wrong-chain" | "high-gas" |
  "receipt-hash" | "receipt-from" | "receipt-to" | "receipt-failed" | "transaction-data" |
  "transaction-value" | "transaction-block" | "verify-payer" | "transfer-payee"
const setup = async (fault: Fault = "none", signal = AbortSignal.timeout(3000)) => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-wire-")); dirs.push(directory)
  const options: GateOptions = { buyer, payTo, journal: join(directory, "gate.jsonl"),
    depositAtomic: GATE.depositAtomic, paymentAtomic: GATE.paymentAtomic }
  const calls: WireCall[] = [], rawTransactions: Hex[] = [], submitted = new Map<string, ReturnType<typeof parseTransaction>>()
  const checkpoints = async () => (await readFile(options.journal, "utf8")).trim().split("\n")
    .filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
  let deposited = false, settled = false, authorization: Record<string, unknown> | undefined
  let allowance = 0n
  const fixtureErrors: unknown[] = []
  const handle: GateFetch = async (input, init) => {
    const url = String(input), body = init?.body === undefined ? {} : JSON.parse(String(init.body)) as Record<string, unknown>
    expect(init?.redirect).toBe("error"); expect(init?.credentials).toBe("omit")
    expect(new Headers(init?.headers).get("accept-encoding")).toBe("identity")
    expect(new Headers(init?.headers).has("authorization")).toBe(false)
    expect(String(init?.body)).not.toContain(fixtureKey.slice(2))
    if (url === GATE.rpc) {
      const method = String(body.method), params = body.params as readonly unknown[]
      calls.push({ url, method, params, body })
      let result: unknown
      if (method === "eth_chainId") result = fault === "wrong-chain" ? "0x1" : `0x${GATE.chainId.toString(16)}`
      else if (method === "eth_getCode") result = "0x6000"
      else if (method === "eth_getTransactionCount") result = `0x${rawTransactions.length.toString(16)}`
      else if (method === "eth_getBlockByNumber") result = { number: "0x64", hash: blockHash,
        timestamp: "0x6a9b0000", baseFeePerGas: fault === "high-gas" ? "0x1000000000000000" : "0x3b9aca00", transactions: [] }
      else if (method === "eth_maxPriorityFeePerGas" || method === "eth_gasPrice") result = "0x3b9aca00"
      else if (method === "eth_call") {
        const tx = params[0] as { to: string; data: Hex }
        if (tx.to.toLowerCase() === GATE.usdc.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data })
          if (decoded.functionName === "decimals") result = uint(6n)
          else if (decoded.functionName === "balanceOf") result = uint(20000000n)
          else if (decoded.functionName === "allowance") result = uint(allowance)
          else throw new Error("Unexpected fixture ERC20 read")
        } else {
          expect(tx.to.toLowerCase()).toBe(GATE.wallet.toLowerCase())
          expect(decodeFunctionData({ abi: gatewayAbi, data: tx.data })).toMatchObject({ functionName: "totalBalance", args: [GATE.usdc, buyer] })
          result = uint(deposited ? GATE.depositAtomic : 0n)
        }
      } else if (method === "eth_sendRawTransaction") {
        const serialized = params[0]
        if (typeof serialized !== "string" || !/^0x02(?:[0-9a-f]{2})+$/i.test(serialized))
          throw new Error("Expected canonical fixture EIP-1559 transaction")
        const raw = serialized as `0x02${string}`, tx = parseTransaction(raw), hash = keccak256(raw)
        expect(await recoverTransactionAddress({ serializedTransaction: raw })).toBe(buyer)
        // viem decodes the canonical empty RLP value (zero) as an omitted optional field.
        expect(tx.chainId).toBe(GATE.chainId); expect(tx.value ?? 0n).toBe(0n); expect(tx.gas).toBe(120000n)
        expect(tx.maxFeePerGas! * tx.gas!).toBeLessThanOrEqual(100000000000000000n)
        const isApproval = tx.to?.toLowerCase() === GATE.usdc.toLowerCase()
        const saved = await checkpoints()
        expect(saved.at(-1)).toMatchObject({ event: isApproval ? "approval-prepared" : "deposit-prepared", txHash: hash, amountAtomic: "500000" })
        expect(saved.some(v => v.event === "deposit-intent")).toBe(true)
        if (isApproval) {
          expect(decodeFunctionData({ abi: erc20Abi, data: tx.data! })).toMatchObject({ functionName: "approve", args: [GATE.wallet, GATE.depositAtomic] })
          allowance = GATE.depositAtomic
        } else {
          expect(tx.to?.toLowerCase()).toBe(GATE.wallet.toLowerCase())
          expect(decodeFunctionData({ abi: gatewayAbi, data: tx.data! })).toMatchObject({ functionName: "deposit", args: [GATE.usdc, GATE.depositAtomic] })
          deposited = true
        }
        rawTransactions.push(raw); submitted.set(hash, tx)
        if (fault === "send-unknown") throw new Error("private-upstream-diagnostic")
        result = hash
      } else if (method === "eth_getTransactionReceipt" || method === "eth_getTransactionByHash") {
        const hash = String(params[0]), tx = submitted.get(hash)
        if (!tx) throw new Error("Receipt requested for unsubmitted transaction")
        result = method === "eth_getTransactionReceipt"
          ? { status: fault === "receipt-failed" ? "0x0" : "0x1", transactionHash: fault === "receipt-hash" ? blockHash : hash,
            from: fault === "receipt-from" ? payTo : buyer, to: fault === "receipt-to" ? payTo : tx.to, blockNumber: "0x64", blockHash }
          : { hash, from: buyer, to: tx.to, input: fault === "transaction-data" ? "0x1234" : tx.data,
            value: fault === "transaction-value" ? "0x1" : "0x0", blockHash: fault === "transaction-block" ? nonce : blockHash }
      } else throw new Error(`Unexpected fixture RPC method ${method}`)
      return Response.json({ jsonrpc: "2.0", id: body.id, result })
    }
    expect(new URL(url).origin).toBe(GATE.facilitator)
    const path = new URL(url).pathname; calls.push({ url, method: path, body })
    if (path === "/v1/x402/supported") return Response.json({ kinds: [{ x402Version: 2, scheme: "exact", network: GATE.network,
      extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATE.wallet,
        assets: [{ address: GATE.usdc, symbol: "USDC", decimals: 6 }] } }] })
    if (path === "/v1/balances") return Response.json({ token: "USDC", balances: [{ depositor: buyer, domain: 26,
      balance: settled ? "0.499" : deposited ? "0.5" : "0" }] })
    if (path === "/v1/x402/verify" || path === "/v1/x402/settle") {
      expect(Object.keys(body).sort()).toEqual(["paymentPayload", "paymentRequirements"])
      const payload = body.paymentPayload as { payload: { authorization: Record<string, unknown>; signature: Hex } }
      const auth = payload.payload.authorization; authorization = auth
      const payment = makeGatewayPayment(options, Number(auth.validAfter) + 600, String(auth.nonce))
      expect(body.paymentRequirements).toEqual(payment.requirements)
      expect(auth).toEqual({ ...payment.message, value: "1000", validAfter: String(payment.message.validAfter), validBefore: String(payment.message.validBefore) })
      expect(await recoverTypedDataAddress({ ...payment, signature: payload.payload.signature })).toBe(buyer)
      const saved = await checkpoints()
      expect(saved.some(v => v.event === "deposit-confirmed")).toBe(true)
      if (path.endsWith("/verify")) return Response.json({ isValid: true, payer: fault === "verify-payer" ? payTo : buyer })
      expect(saved.at(-1)).toMatchObject({ event: "settle-intent", nonce: auth.nonce, amountAtomic: "1000" })
      expect(saved.some(v => v.event === "verify-confirmed")).toBe(true)
      settled = true
      if (fault === "settle-unknown") throw new Error("private-upstream-diagnostic")
      return Response.json({ success: true, payer: buyer, network: GATE.network, transaction: id })
    }
    expect(path).toBe(`/v1/x402/transfers/${id}`)
    return Response.json({ id, status: "received", token: "USDC", sendingNetwork: GATE.network,
      recipientNetwork: GATE.network, fromAddress: buyer, toAddress: fault === "transfer-payee" ? buyer : payTo,
      amount: "1000", nonce: authorization?.nonce, txHash: null })
  }
  const fetchImpl: GateFetch = async (input, init) => {
    try { return await handle(input, init) }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "private-upstream-diagnostic") fixtureErrors.push(error)
      throw error
    }
  }
  const runtime = createGateRuntime(options, fixtureKey, signal, fetchImpl); runtimes.push(runtime)
  const run = async () => {
    try { return await Effect.runPromise(executeGatewayGate(options, runtime.dependencies)) }
    finally { if (fixtureErrors.length > 0) throw fixtureErrors[0] }
  }
  return { runtime, options, calls, rawTransactions, checkpoints, run }
}

describe("F1 actual viem adapter with injected transport only", () => {
  it("signs exact approval/deposit and Gateway authorization; checkpoints precede every mutation", async () => {
    const f = await setup()
    expect(await f.run()).toMatchObject({ decision: "PASS", transferId: id,
      settlementKind: "gateway-transfer", batchTxHash: null, gatewayAfterAtomic: "499000" })
    expect(f.rawTransactions).toHaveLength(2)
    expect(f.calls.filter(c => c.method === "/v1/x402/settle")).toHaveLength(1)
    expect((await f.checkpoints()).at(-1)?.event).toBe("completed")
    const journal = await readFile(f.options.journal, "utf8")
    expect(journal).not.toContain(fixtureKey); expect(journal).not.toContain("signature")
    for (const raw of f.rawTransactions) expect(journal).not.toContain(raw)
    await expect(f.run()).rejects.toThrow()
    expect(f.rawTransactions).toHaveLength(2)
  })
  for (const fault of ["send-unknown", "settle-unknown"] as const) it(`never resends after ${fault}`, async () => {
    const f = await setup(fault)
    await expect(f.run()).rejects.not.toThrow("private-upstream-diagnostic")
    const count = f.rawTransactions.length, settles = f.calls.filter(c => c.method === "/v1/x402/settle").length
    expect(count).toBe(fault === "send-unknown" ? 1 : 2); expect(settles).toBe(fault === "send-unknown" ? 0 : 1)
    await expect(f.run()).rejects.toThrow()
    expect(f.rawTransactions).toHaveLength(count)
    expect(f.calls.filter(c => c.method === "/v1/x402/settle")).toHaveLength(settles)
    expect((await f.checkpoints()).some(v => v.event === "completed")).toBe(false)
  })
  for (const fault of ["receipt-hash", "receipt-from", "receipt-to", "receipt-failed", "transaction-data", "transaction-value", "transaction-block"] as const)
    it(`refuses ${fault} before a second transaction or payment signature`, async () => {
      const f = await setup(fault)
      await expect(f.run()).rejects.toThrow()
      expect(f.rawTransactions).toHaveLength(1)
      expect(f.calls.some(c => c.method === "/v1/x402/verify" || c.method === "/v1/x402/settle")).toBe(false)
    })
  for (const fault of ["wrong-chain", "high-gas"] as const) it(`refuses ${fault} before broadcast`, async () => {
    const f = await setup(fault)
    await expect(f.run()).rejects.toThrow(); expect(f.rawTransactions).toEqual([])
  })
  for (const fault of ["verify-payer", "transfer-payee"] as const) it(`does not report PASS for ${fault}`, async () => {
    const f = await setup(fault)
    await expect(f.run()).rejects.toThrow()
    expect(f.calls.filter(c => c.method === "/v1/x402/settle")).toHaveLength(fault === "verify-payer" ? 0 : 1)
    expect((await f.checkpoints()).some(v => v.event === "completed")).toBe(false)
  })
  it("refuses altered domain/value/payee in the key-consuming adapter itself", async () => {
    const f = await setup(), payment = makeGatewayPayment(f.options, Math.floor(Date.now() / 1000), nonce)
    await f.runtime.dependencies.claim()
    for (const altered of [
      { ...payment, domain: { ...payment.domain, verifyingContract: payTo } },
      { ...payment, message: { ...payment.message, value: 1001n } },
      { ...payment, message: { ...payment.message, to: buyer } }
    ]) await expect(f.runtime.dependencies.sign(altered)).rejects.toThrow(GatewayGateError)
    const signature = await f.runtime.dependencies.sign(payment) as Hex
    expect(await recoverTypedDataAddress({ ...payment, signature })).toBe(buyer)
    await expect(f.runtime.dependencies.sign(payment)).rejects.toThrow(GatewayGateError)
    expect(f.calls).toEqual([])
  })
  it("an already cancelled runtime performs no transport, signing or journal creation", async () => {
    const ctl = new AbortController(); ctl.abort()
    const f = await setup("none", ctl.signal)
    await expect(f.run()).rejects.toThrow()
    await expect(f.runtime.dependencies.sign(makeGatewayPayment(f.options, 1788590000, nonce))).rejects.toThrow()
    expect(f.calls).toEqual([])
    await expect(readFile(f.options.journal)).rejects.toThrow()
  })
  it("latches the actual deposit adapter against a direct second call after success", async () => {
    const f = await setup(); await f.run()
    await expect(f.runtime.dependencies.deposit()).rejects.toThrow(GatewayGateError)
    expect(f.rawTransactions).toHaveLength(2)
  })
  it("latches an uncertain direct deposit call without preparing another transaction", async () => {
    const f = await setup("send-unknown"); await expect(f.run()).rejects.toThrow()
    await expect(f.runtime.dependencies.deposit()).rejects.toThrow(GatewayGateError)
    expect(f.rawTransactions).toHaveLength(1)
    expect((await f.checkpoints()).filter(v => v.event === "approval-prepared" || v.event === "deposit-prepared")).toHaveLength(1)
  })
  it("journal close drains an accepted append but refuses all later appends", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gateway-close-wire-")); dirs.push(directory)
    const path = join(directory, "gate.jsonl"), journal = await openGateJournal(path)
    const before = journal.append({ event: "started", buyer })
    const closing = journal.close()
    await expect(journal.append({ event: "deposit-intent", amountAtomic: "500000" })).rejects.toThrow(GatewayGateError)
    await before; await closing; await journal.close()
    expect((await readFile(path, "utf8")).trim().split("\n").map(line => JSON.parse(line))).toEqual([{ event: "started", buyer }])
  })
})

describe("F1 owned loopback transport through the real adapter", () => {
  const local = async (fetchImpl: GateFetch, signal: AbortSignal) => {
    const directory = await mkdtemp(join(tmpdir(), "gateway-local-wire-")); dirs.push(directory)
    const runtime = createGateRuntime({ buyer, payTo, journal: join(directory, "gate.jsonl"),
      depositAtomic: GATE.depositAtomic, paymentAtomic: GATE.paymentAtomic }, fixtureKey, signal, fetchImpl)
    runtimes.push(runtime); return runtime
  }
  it("does not follow a real 302 or forward the dummy request to its second owned origin", async () => {
    let firstRequests = 0, targetRequests = 0
    const target = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      targetRequests++; return Response.json({ success: true })
    } })
    const first = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      firstRequests++; return Response.redirect(new URL("/must-not-receive", target.url), 302)
    } })
    try {
      const runtime = await local(async (input, init) => {
        expect(String(input)).toBe(`${GATE.facilitator}/v1/x402/settle`)
        return fetch(new URL("/v1/x402/settle", first.url), init)
      }, AbortSignal.timeout(2000))
      await expect(runtime.dependencies.settle({ fixture: "public-dummy-signed-request" })).rejects.toThrow(GatewayGateError)
      expect(firstRequests).toBe(1); expect(targetRequests).toBe(0)
    } finally { await first.stop(true); await target.stop(true) }
  })
  it("bounds actual headers plus unfinished response-body reads and cancels its fetch signal", async () => {
    let requests = 0, observedSignal: AbortSignal | undefined
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      requests++
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new TextEncoder().encode('{"kinds":['))
      } }), { headers: { "content-type": "application/json" } })
    } })
    try {
      const runtime = await local(async (input, init) => {
        expect(String(input)).toBe(`${GATE.facilitator}/v1/x402/supported`)
        observedSignal = init?.signal ?? undefined
        return fetch(new URL("/v1/x402/supported", server.url), init)
      }, AbortSignal.timeout(100))
      const started = performance.now()
      await expect(runtime.dependencies.supported()).rejects.toThrow(GatewayGateError)
      expect(performance.now() - started).toBeLessThan(1500)
      expect(observedSignal?.aborted).toBe(true); expect(requests).toBe(1)
    } finally { await server.stop(true) }
  })
})
