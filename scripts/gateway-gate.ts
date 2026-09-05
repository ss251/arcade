/** F1 probe policy. No key, filesystem, network or transaction work on import. */
import { Data, Effect } from "effect"
import { isAbsolute, normalize } from "node:path"
import type { Hex } from "viem"

export const GATE = Object.freeze({
  chainId: 5042002, network: "eip155:5042002", domain: 26,
  wallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as Hex,
  usdc: "0x3600000000000000000000000000000000000000" as Hex,
  rpc: "https://rpc.testnet.arc.io", facilitator: "https://gateway-api-testnet.circle.com",
  validitySeconds: 604900, depositAtomic: 500000n, paymentAtomic: 1000n
})
export type GateStage = "configuration" | "supported" | "journal" | "preflight" |
  "deposit" | "sign" | "verify" | "settle" | "transfer" | "balance" | "transport"
export class GatewayGateError extends Data.TaggedError("GatewayGateError")<{
  stage: GateStage; reason: "refused" | "unsupported" | "unavailable"
}> {
  override get message() { return `Gateway gate ${this.stage} ${this.reason}; reconcile retained evidence before retrying` }
}
const fail = (stage: GateStage, reason: GatewayGateError["reason"] = "refused") =>
  new GatewayGateError({ stage, reason })
function insist(value: unknown, stage: GateStage): asserts value { if (!value) throw fail(stage) }
export const isAddress = (value: unknown): value is Hex => typeof value === "string" &&
  /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value)
export const isHash = (value: unknown): value is Hex => typeof value === "string" &&
  /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/i.test(value)
export const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase()
const uuid = (v: unknown): v is string => typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v)
export const record = (v: unknown, stage: GateStage): Record<string, unknown> => {
  insist(v !== null && typeof v === "object" && !Array.isArray(v), stage)
  return v as Record<string, unknown>
}
export interface GateOptions {
  readonly buyer: string; readonly payTo: string; readonly journal: string
  readonly depositAtomic: bigint; readonly paymentAtomic: bigint
}
const checkOptions = (o: GateOptions) => {
  insist(isAddress(o.buyer) && isAddress(o.payTo) && !same(o.buyer, o.payTo), "configuration")
  insist(o.depositAtomic === GATE.depositAtomic && o.paymentAtomic === GATE.paymentAtomic, "configuration")
  insist(typeof o.journal === "string" && o.journal.length < 2048 && isAbsolute(o.journal) &&
    normalize(o.journal) === o.journal && o.journal.endsWith(".jsonl") &&
    !/[\u0000-\u001f\u007f]/.test(o.journal), "configuration")
}
export const parseGateArgs = (args: readonly string[]): { mode: "supported" } | (GateOptions & { mode: "live" }) => {
  if (args.length === 1 && args[0] === "--supported") return { mode: "supported" }
  insist(args.length === 11 && args[0] === "--live", "configuration")
  const names = ["--buyer", "--pay-to", "--deposit-usdc", "--payment-usdc", "--journal"]
  // No environment variable arms the probe or changes the explicit amount/recipient.
  const values = new Map<string, string>()
  for (let i = 1; i < args.length; i += 2) {
    const k = args[i]!, v = args[i + 1]
    insist(names.includes(k) && !values.has(k) && v !== undefined, "configuration")
    values.set(k, v)
  }
  insist(values.get("--deposit-usdc") === "0.5" && values.get("--payment-usdc") === "0.001", "configuration")
  const o = { buyer: values.get("--buyer")!, payTo: values.get("--pay-to")!,
    journal: values.get("--journal")!, depositAtomic: GATE.depositAtomic, paymentAtomic: GATE.paymentAtomic }
  checkOptions(o)
  return { mode: "live", ...o }
}

export const parseSupported = (value: unknown) => {
  const kinds = record(value, "supported")["kinds"]
  insist(Array.isArray(kinds) && kinds.length <= 100, "supported")
  const all = kinds.map(v => record(v, "supported"))
  for (const kind of all) insist(typeof kind["network"] === "string" &&
    kind["network"].length <= 80 && typeof kind["scheme"] === "string" &&
    (kind["x402Version"] === 1 || kind["x402Version"] === 2), "supported")
  const matches = all.filter(k => k["network"] === GATE.network && k["x402Version"] === 2)
  if (matches.length === 0) throw fail("supported", "unsupported")
  insist(matches.length === 1 && matches[0]!["scheme"] === "exact", "supported")
  const extra = record(matches[0]!["extra"], "supported")
  insist(extra["name"] === "GatewayWalletBatched" && extra["version"] === "1" &&
    same(extra["verifyingContract"], GATE.wallet), "supported")
  const assets = extra["assets"]
  insist(Array.isArray(assets) && assets.length > 0 && assets.length <= 20, "supported")
  const usdc = assets.map(v => record(v, "supported")).filter(v => same(v["address"], GATE.usdc))
  insist(usdc.length === 1 && usdc[0]!["symbol"] === "USDC" && usdc[0]!["decimals"] === 6, "supported")
  return { network: GATE.network, wallet: GATE.wallet }
}

export const makeGatewayPayment = (o: GateOptions, now: number, nonce: string) => {
  checkOptions(o)
  insist(Number.isSafeInteger(now) && now > 600 && now < 2 ** 40 && isHash(nonce), "sign")
  const domain = { name: "GatewayWalletBatched", version: "1", chainId: GATE.chainId,
    verifyingContract: GATE.wallet } as const
  const message = { from: o.buyer as Hex, to: o.payTo as Hex, value: o.paymentAtomic,
    validAfter: BigInt(now - 600), validBefore: BigInt(now + GATE.validitySeconds), nonce }
  const types = { TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }
  ] } as const
  const requirements = { scheme: "exact", network: GATE.network, amount: String(o.paymentAtomic),
    asset: GATE.usdc, payTo: o.payTo, maxTimeoutSeconds: GATE.validitySeconds,
    extra: { name: domain.name, version: domain.version, verifyingContract: GATE.wallet } }
  return { domain, types, primaryType: "TransferWithAuthorization" as const, message, requirements }
}
export type GatewayPayment = ReturnType<typeof makeGatewayPayment>
export const parseTransfer = (value: unknown, o: GateOptions, nonce: string, id: string) => {
  const t = record(value, "transfer")
  insist(uuid(id) && same(t["id"], id) && t["token"] === "USDC" &&
    t["sendingNetwork"] === GATE.network && t["recipientNetwork"] === GATE.network &&
    same(t["fromAddress"], o.buyer) && same(t["toAddress"], o.payTo) &&
    t["amount"] === String(o.paymentAtomic) && same(t["nonce"], nonce), "transfer")
  const status = t["status"], batchTxHash = t["txHash"]
  insist(status === "received" || status === "batched" || status === "confirmed" || status === "completed", "transfer")
  insist(batchTxHash === null || isHash(batchTxHash), "transfer")
  // A facilitator-reported batch hash is metadata, never an independently mined proof.
  return { transferId: id, status, batchTxHash, settlementKind: "gateway-transfer" as const }
}

/** One attempt; total deadline covers headers AND stream consumption. No body diagnostics. */
export type GateFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
const fetchJson = async (url: string, body: unknown, fetchImpl: GateFetch, parentSignal: AbortSignal): Promise<unknown> => {
  const encoded = body === undefined ? undefined : JSON.stringify(body)
  insist(encoded === undefined || Buffer.byteLength(encoded) <= 16_384, "transport")
  const ctl = new AbortController(), signal = AbortSignal.any([parentSignal, ctl.signal, AbortSignal.timeout(15_000)])
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let onAbort: (() => void) | undefined
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => reject(fail("transport")); signal.addEventListener("abort", onAbort, { once: true })
  })
  const pending = async () => {
    signal.throwIfAborted()
    const response = await fetchImpl(url, { method: encoded === undefined ? "GET" : "POST",
      ...(encoded === undefined ? {} : { body: encoded }), redirect: "error", credentials: "omit", signal,
      headers: { accept: "application/json", "accept-encoding": "identity", ...(encoded === undefined ? {} : { "content-type": "application/json" }) } })
    insist(response.ok && !response.redirected && response.body !== null, "transport")
    insist(!response.headers.has("content-encoding") || response.headers.get("content-encoding") === "identity", "transport")
    const length = response.headers.get("content-length")
    insist(length === null || (/^(0|[1-9][0-9]*)$/.test(length) && Number(length) <= 65536), "transport")
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []; let total = 0
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.length; insist(total <= 65536, "transport"); chunks.push(chunk.value)
    }
    insist(length === null || Number(length) === total, "transport")
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  }
  try { return await Promise.race([pending(), stopped]) }
  catch { throw fail("transport") }
  finally {
    ctl.abort(); if (onAbort) signal.removeEventListener("abort", onAbort)
    if (reader) void reader.cancel().catch(() => {})
  }
}
export const fetchGatewayJson = async (
  path: string, body?: unknown, fetchImpl: GateFetch = fetch,
  parentSignal: AbortSignal = AbortSignal.timeout(15_000)
): Promise<unknown> => {
  const allowed = ["/v1/x402/supported", "/v1/x402/verify", "/v1/x402/settle", "/v1/balances"]
  insist(allowed.includes(path) || /^\/v1\/x402\/transfers\/[a-f0-9-]{36}$/i.test(path), "transport")
  return fetchJson(`${GATE.facilitator}${path}`, body, fetchImpl, parentSignal)
}
export const fetchArcRpc = async (method: string, params: readonly unknown[], fetchImpl: GateFetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(15_000)): Promise<unknown> => {
  insist(["eth_chainId", "eth_call", "eth_getCode", "eth_getBalance", "eth_getTransactionCount",
    "eth_getBlockByNumber", "eth_maxPriorityFeePerGas", "eth_gasPrice", "eth_getTransactionReceipt",
    "eth_getTransactionByHash", "eth_sendRawTransaction"].includes(method), "transport")
  const id = crypto.randomUUID()
  const value = record(await fetchJson(GATE.rpc, { jsonrpc: "2.0", id, method, params }, fetchImpl, signal), "transport")
  insist(value["jsonrpc"] === "2.0" && value["id"] === id && value["error"] === undefined &&
    Object.hasOwn(value, "result"), "transport")
  return value["result"]
}

export interface GateDependencies {
  supported(): Promise<unknown>
  claim(): Promise<void>
  checkpoint(value: Record<string, unknown>): Promise<void>
  preflight(): Promise<{ buyer: string; chainId: number; decimals: number; walletAtomic: bigint; gatewayAtomic: bigint }>
  deposit(): Promise<{ txHash: string; blockHash: string; blockNumber: number; amountAtomic: bigint; gatewayAtomic: bigint }>
  sign(payment: GatewayPayment): Promise<string>
  verify(body: unknown): Promise<unknown>
  settle(body: unknown): Promise<unknown>
  transfer(id: string): Promise<unknown>
  afterBalance(): Promise<bigint>
  now(): number
  nonce(): string
}
/** IO callbacks are local trusted adapters. Every untrusted provider result is checked. */
export const executeGatewayGate = (o: GateOptions, d: GateDependencies) => Effect.gen(function* () {
  const step = <A>(stage: GateStage, work: () => Promise<A>) => Effect.tryPromise({ try: work,
    catch: (error) => error instanceof GatewayGateError ? error : fail(stage, "unavailable") })
  yield* step("configuration", async () => checkOptions(o))
  yield* step("supported", async () => parseSupported(await d.supported()))
  yield* step("journal", () => d.claim())
  const checkpoint = (value: Record<string, unknown>) => step("journal", () => d.checkpoint(value))
  yield* checkpoint({ event: "started", buyer: o.buyer, payTo: o.payTo, network: GATE.network,
    depositAtomic: String(o.depositAtomic), paymentAtomic: String(o.paymentAtomic) })
  yield* step("preflight", async () => {
    const p = await d.preflight()
    insist(same(p.buyer, o.buyer) && p.chainId === GATE.chainId && p.decimals === 6 &&
      typeof p.walletAtomic === "bigint" && p.walletAtomic >= o.depositAtomic && p.gatewayAtomic === 0n, "preflight")
  })
  yield* checkpoint({ event: "deposit-intent", amountAtomic: String(o.depositAtomic) })
  const deposit = yield* step("deposit", async () => {
    const proof = await d.deposit()
    insist(isHash(proof.txHash) && isHash(proof.blockHash) && Number.isSafeInteger(proof.blockNumber) &&
      proof.blockNumber > 0 && proof.amountAtomic === o.depositAtomic && proof.gatewayAtomic === o.depositAtomic, "deposit")
    return proof
  })
  yield* checkpoint({ event: "deposit-confirmed", txHash: deposit.txHash, blockHash: deposit.blockHash,
    blockNumber: deposit.blockNumber, gatewayAtomic: String(deposit.gatewayAtomic) })
  const payment = yield* step("sign", async () => makeGatewayPayment(o, d.now(), d.nonce()))
  yield* checkpoint({ event: "authorization-intent", nonce: payment.message.nonce,
    validAfter: String(payment.message.validAfter), validBefore: String(payment.message.validBefore) })
  const signature = yield* step("sign", async () => {
    const s = await d.sign(payment); insist(/^0x[a-fA-F0-9]{130}$/.test(s), "sign"); return s
  })
  const { message } = payment
  const body = { paymentRequirements: payment.requirements, paymentPayload: {
    x402Version: 2, accepted: payment.requirements,
    resource: { url: "https://arcade.local/x/g2c/probe", description: "Owner-approved Gateway gate", mimeType: "application/json" },
    payload: { authorization: { ...message, value: String(message.value), validAfter: String(message.validAfter),
      validBefore: String(message.validBefore) }, signature }
  } }
  yield* step("verify", async () => {
    const v = record(await d.verify(body), "verify")
    insist(v["isValid"] === true && same(v["payer"], o.buyer) &&
      (v["invalidReason"] === undefined || v["invalidReason"] === ""), "verify")
  })
  yield* checkpoint({ event: "verify-confirmed", payer: o.buyer })
  // Persist uncertainty BEFORE submission. No automatic retry, including on restart.
  yield* checkpoint({ event: "settle-intent", nonce: message.nonce, amountAtomic: String(o.paymentAtomic) })
  const id = yield* step("settle", async () => {
    const s = record(await d.settle(body), "settle")
    insist(s["success"] === true && same(s["payer"], o.buyer) && s["network"] === GATE.network &&
      uuid(s["transaction"]) && (s["errorReason"] === undefined || s["errorReason"] === ""), "settle")
    return s["transaction"]
  })
  yield* checkpoint({ event: "settle-accepted", transferId: id })
  const proof = yield* step("transfer", async () => parseTransfer(await d.transfer(id), o, message.nonce, id))
  const after = yield* step("balance", async () => {
    const amount = await d.afterBalance()
    insist(amount === deposit.gatewayAtomic - o.paymentAtomic, "balance"); return amount
  })
  const result = { decision: "PASS" as const, depositTxHash: deposit.txHash, ...proof,
    gatewayAfterAtomic: String(after), network: GATE.network }
  yield* checkpoint({ event: "completed", ...result })
  return result
})
