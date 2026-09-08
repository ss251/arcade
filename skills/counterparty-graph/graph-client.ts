/** Scoped Graph query payments. Query receipts are not agent-service proofs. */
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { x402Client, x402HTTPClient, type PaymentRequired } from "@x402/fetch"
import { ExactEvmScheme } from "@x402/evm/exact/client"
import { decodeEventLog, parseAbi, toEventSelector, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

export const AGENT0_BASE_SUBGRAPH_ID = "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
export const GATEWAY_BASE = "https://gateway.thegraph.com/api/x402/subgraphs/id/"
export const QUERY_COST_ATOMIC = "10000"
export const PAYMENT_CHAIN = "eip155:8453"
const ENDPOINT = `${GATEWAY_BASE}${AGENT0_BASE_SUBGRAPH_ID}`
const RPC = "https://mainnet.base.org"
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
// Unsigned canonical gateway challenge independently reviewed 2026-09-05T09:54:03.618Z.
// Metadata only: the advertised internal HTTP resource is NEVER a request target.
const MERCHANT = "0x79dc34e41b2b591078d3de222c43ecaabd52fccb"
const RESOURCE = `http://mainnet-thegraph-arbitrum-04-asia-east1.thegraph.com/subgraphs/id/${AGENT0_BASE_SUBGRAPH_ID}`
const FAIL = "graph query could not be completed"
const KEY_FAIL = "graph payer key unavailable"
const MAX_UINT = (1n << 256n) - 1n
const ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)", "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)"])
const TRANSFER = toEventSelector("Transfer(address,address,uint256)")
const AUTH_USED = toEventSelector("AuthorizationUsed(address,bytes32)")
const AUTH_TYPES = { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] } as const

function fail(): never { throw new Error(FAIL) }
function plain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false
  try { return !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) }
  catch { return false }
}
function own(v: unknown, key: string): unknown {
  if (!plain(v)) fail()
  const d = Object.getOwnPropertyDescriptor(v, key)
  if (d === undefined) return undefined
  if (!("value" in d)) fail()
  return d.value
}
function keys(v: unknown, allowed: readonly string[], required: readonly string[] = allowed): asserts v is Record<string, unknown> {
  if (!plain(v)) fail()
  const names = Object.keys(v)
  if (names.length > allowed.length || names.some((k) => !allowed.includes(k)) || required.some((k) => !Object.hasOwn(v, k))) fail()
  for (const name of names) own(v, name)
}
function addr(v: unknown): string | null { return typeof v === "string" && /^0x[\da-fA-F]{40}$/.test(v) ? v.toLowerCase() : null }
function hash(v: unknown): v is Hex { return typeof v === "string" && /^0x[\da-fA-F]{64}$/.test(v) && !/^0x0{64}$/.test(v) }
function quantity(v: unknown): v is Hex { return typeof v === "string" && /^0x(?:0|[1-9a-f][\da-f]{0,63})$/.test(v) }
function safeIndex(v: unknown): v is Hex { return quantity(v) && BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER) }
function uint(v: unknown): v is string { return typeof v === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) <= MAX_UINT }
function key(v: unknown): v is Hex {
  if (!hash(v)) return false
  try { privateKeyToAccount(v); return true } catch { return false }
}
function bounded<T>(work: Promise<T>, ms: number, abort?: () => void): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) { abort?.(); return Promise.reject(new Error(FAIL)) }
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([work, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { try { abort?.() } finally { reject(new Error(FAIL)) } }, ms)
  })]).finally(() => clearTimeout(timer))
}

export type Runner = (cmd: ReadonlyArray<string>) => Promise<{ code: number; stdout: string }>
/** Low-level inert-child test seam. Production selects only the security argv below. */
export const runKeyCommand: Runner = (cmd) => new Promise((resolve, reject) => {
  if (cmd.length < 1 || cmd.length > 8 || !cmd[0]!.startsWith("/") || cmd.some((s) => typeof s !== "string" || s.length === 0 || s.length > 4096 || s.includes("\0"))) { reject(new Error(KEY_FAIL)); return }
  const child = spawn(cmd[0]!, cmd.slice(1), { env: {}, stdio: ["ignore", "pipe", "ignore"] })
  let output = "", invalid = false, killTimer: ReturnType<typeof setTimeout> | undefined
  const stop = () => { invalid = true; child.kill("SIGTERM"); killTimer ??= setTimeout(() => { child.kill("SIGKILL") }, 100) }
  const timer = setTimeout(stop, 2500)
  child.stdout.on("data", (chunk: Buffer) => { if (Buffer.byteLength(output) + chunk.length > 1024) stop(); else if (!invalid) output += chunk.toString("utf8") })
  child.on("error", () => { invalid = true })
  child.on("close", (code) => { clearTimeout(timer); clearTimeout(killTimer); if (invalid) reject(new Error(KEY_FAIL)); else resolve({ code: code ?? 1, stdout: output }) })
})
const spawnSecurity: Runner = (cmd) => process.platform === "darwin" ? runKeyCommand(cmd) : Promise.reject(new Error(KEY_FAIL))

/** No default item, ambiguous mechanisms, or fallback after a failed explicit choice. */
export async function readPayerKey(env: Record<string, string | undefined>, run: Runner = spawnSecurity): Promise<string> {
  try {
    // Node's real process.env has a special prototype. Read only the two own data
    // properties without enumerating ambient values or consulting inheritance.
    const value = (name: string): unknown => {
      const d = Object.getOwnPropertyDescriptor(env, name)
      if (d === undefined) return undefined
      if (!("value" in d)) fail()
      return d.value
    }
    const direct = value("GRAPH_X402_PAYER_KEY"), service = value("GRAPH_X402_KEYCHAIN_SERVICE")
    if ((direct !== undefined) === (service !== undefined)) fail()
    if (direct !== undefined) { if (!key(direct)) fail(); return direct }
    if (typeof service !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(service)) fail()
    const pending = Promise.resolve().then(() => run(["/usr/bin/security", "find-generic-password", "-s", service, "-w"]))
    // The production runner owns a TERM/KILL deadline and resolves only on close.
    // Racing that cleanup with a second timer could return while its child lives.
    const result = await (run === spawnSecurity || run === runKeyCommand ? pending : bounded(pending, 3000))
    if (own(result, "code") !== 0 || typeof own(result, "stdout") !== "string") fail()
    const stdout = result.stdout
    if (Buffer.byteLength(stdout) > 1024 || !key(stdout.trim())) fail()
    return stdout.trim()
  } catch { throw new Error(KEY_FAIL) }
}

export function document(name: "identities" | "attestations"): string {
  if (name !== "identities" && name !== "attestations") fail()
  const text = readFileSync(new URL(`./queries/${name}.graphql`, import.meta.url), "utf8")
  if (Buffer.byteLength(text) > 8192) fail()
  return text
}
export interface PaidResult { readonly data: Record<string, unknown>; readonly paymentTx: string | null; readonly costAtomic: string | null }
export interface QueryArgs { readonly subgraphId: string; readonly document: string; readonly variables: Record<string, unknown> }
export type PaidQuery = (args: QueryArgs) => Promise<PaidResult>
export interface GraphResponseObservation {
  readonly phase: "challenge" | "paid" | "rpc"
  readonly requestUrl: string
  readonly requestBodySha256: string
  readonly responseUrl: string
  readonly redirected: boolean
  readonly status: number
  readonly complete: true
  readonly headers: Readonly<Record<"content-type" | "content-length" | "content-encoding" | "payment-required" | "payment-response", string | null>>
  readonly bodyBase64: string
  readonly bodySha256: string
}
export interface GraphPaymentIntent {
  readonly endpoint: string
  readonly network: typeof PAYMENT_CHAIN
  readonly primaryType: "TransferWithAuthorization"
  readonly domain: Readonly<{ name: "USD Coin"; version: "2"; chainId: 8453; verifyingContract: string }>
  readonly authorization: Readonly<{ from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string }>
  /** SHA256 of canonical domain/primaryType/authorization JSON, NOT EIP-712. */
  readonly authorizationSha256: string
  readonly requestBodySha256: string
  readonly paymentHeaderSha256: string
}
export interface QueryOptions {
  readonly fetch?: typeof globalThis.fetch
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  readonly now?: () => number
  /** Trusted private journal seam, not public output. Raw provider bytes can be
   * sensitive. Awaited inside the existing transport deadline; never owns the
   * original Response, a key, mutable bytes or a signed request header. */
  readonly observeResponse?: (observation: GraphResponseObservation, signal: AbortSignal) => Promise<void>
  /** Trusted private intent/balance seam after validated signing, before the
   * original single paid send. Never a signer-entry event or forwarding proof.
   * No key, raw signature or mutable request is exposed. Failure stays uncertain. */
  readonly beforePaidRequest?: (intent: GraphPaymentIntent, signal: AbortSignal) => Promise<void>
}

function requestBody(args: QueryArgs): string {
  keys(args, ["subgraphId", "document", "variables"])
  if (own(args, "subgraphId") !== AGENT0_BASE_SUBGRAPH_ID) fail()
  const doc = own(args, "document"), v = own(args, "variables")
  if (doc === document("identities")) {
    keys(v, ["address"])
    const a = own(v, "address")
    if (addr(a) !== a) fail()
    return JSON.stringify({ query: doc, variables: { address: a } })
  }
  if (doc !== document("attestations")) fail()
  keys(v, ["agentIds", "block"]); const ids = own(v, "agentIds"), block = own(v, "block")
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) fail()
  const canonical: string[] = []
  for (let i = 0; i < ids.length; i++) {
    const d = Object.getOwnPropertyDescriptor(ids, String(i))
    if (d === undefined || !("value" in d) || typeof d.value !== "string" || !d.value.startsWith("8453:") || !uint(d.value.slice(5)) || canonical.includes(d.value)) fail()
    canonical.push(d.value)
  }
  keys(block, ["hash"]); const digest = own(block, "hash")
  if (!hash(digest) || digest !== digest.toLowerCase()) fail()
  return JSON.stringify({ query: doc, variables: { agentIds: canonical, block: { hash: digest } } })
}
/** Inert encoder for local intent/cache binding; identical validator as paidQuery.
 * Encoding a request grants no key access, signing authority or paid dispatch. */
export function encodeGraphQuery(args: QueryArgs): string { return requestBody(args) }

function decodeHeader(header: string | null): unknown {
  if (header === null || header.length === 0 || header.length > 16384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(header)) fail()
  const raw = Buffer.from(header, "base64")
  if (raw.toString("base64") !== header || raw.length > 12288) fail()
  return JSON.parse(raw.toString("utf8")) as unknown
}
function paymentRequired(v: unknown): PaymentRequired {
  keys(v, ["x402Version", "resource", "accepts"], ["x402Version", "resource", "accepts"])
  if (own(v, "x402Version") !== 2) fail()
  const r = own(v, "resource"), accepts = own(v, "accepts")
  keys(r, ["url", "description", "mimeType"], ["url"])
  if (own(r, "url") !== RESOURCE) fail()
  for (const name of ["description", "mimeType"]) { const value = own(r, name); if (value !== undefined && (typeof value !== "string" || value.length > 256 || /[\x00-\x1f\x7f]/.test(value))) fail() }
  if (!Array.isArray(accepts) || accepts.length !== 1) fail()
  const a: unknown = accepts[0]; keys(a, ["scheme", "network", "asset", "amount", "payTo", "maxTimeoutSeconds", "extra"])
  const e = own(a, "extra"); keys(e, ["assetTransferMethod", "name", "version"])
  if (own(a, "scheme") !== "exact" || own(a, "network") !== PAYMENT_CHAIN || addr(own(a, "asset")) !== USDC ||
    own(a, "amount") !== QUERY_COST_ATOMIC || addr(own(a, "payTo")) !== MERCHANT || own(a, "maxTimeoutSeconds") !== 300 ||
    own(e, "assetTransferMethod") !== "eip3009" || own(e, "name") !== "USD Coin" || own(e, "version") !== "2") fail()
  return { x402Version: 2, resource: { url: RESOURCE }, accepts: [{ scheme: "exact", network: PAYMENT_CHAIN, asset: USDC,
    amount: QUERY_COST_ATOMIC, payTo: MERCHANT, maxTimeoutSeconds: 300, extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" } }] }
}

/** One factory owns one finite run. No wrapper recovery, broadcast retries or ambient mutation. */
export function makePaidQuery(privateKey: string, options: QueryOptions = {}): PaidQuery {
  const now = options.now ?? Date.now, transport = options.fetch ?? globalThis.fetch
  const observeResponse = options.observeResponse
  const beforePaidRequest = options.beforePaidRequest
  const timeout = options.timeoutMs ?? 80000
  if (!key(privateKey) || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 85000 ||
    observeResponse !== undefined && typeof observeResponse !== "function" ||
    beforePaidRequest !== undefined && typeof beforePaidRequest !== "function") fail()
  const deadline = now() + timeout
  if (!Number.isSafeInteger(deadline)) fail()
  const account = privateKeyToAccount(privateKey), payer = account.address.toLowerCase()
  let busy = false, uncertain = false, signedCount = 0, attempts = 0, rpcId = 0
  const nonces = new Set<string>()
  const active = () => { if (options.signal?.aborted || now() >= deadline) fail() }
  async function observeForward(intent: GraphPaymentIntent): Promise<void> {
    if (beforePaidRequest === undefined) return
    active(); const controller = new AbortController(), parent = options.signal
    const cancel = () => controller.abort(); parent?.addEventListener("abort", cancel, { once: true })
    try {
      if (parent?.aborted) fail()
      const started = now(), forwardDeadline = Math.min(deadline, started + 5000)
      if (!Number.isSafeInteger(started) || !Number.isSafeInteger(forwardDeadline)) fail()
      let lastTime = started
      const withinForward = () => {
        active(); const current = now()
        if (controller.signal.aborted || !Number.isSafeInteger(current) || current < lastTime || current >= forwardDeadline) fail()
        lastTime = current; return current
      }
      const remaining = forwardDeadline - withinForward()
      const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error(FAIL)), { once: true }))
      const work = Promise.resolve().then(() => {
        withinForward()
        return beforePaidRequest(intent, controller.signal)
      })
      await bounded(Promise.race([work, aborted]), remaining, cancel)
      withinForward()
    } finally { controller.abort(); parent?.removeEventListener("abort", cancel) }
  }
  async function fetchBytes(url: string, body: string, headers: Record<string, string>, max = 1048576): Promise<{ response: Response; bytes: Uint8Array }> {
    active(); const controller = new AbortController()
    const cancel = () => controller.abort(); options.signal?.addEventListener("abort", cancel, { once: true })
    let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const work = (async () => {
        const pending = transport(url, { method: "POST", body, headers: { ...headers, "accept-encoding": "identity" }, redirect: "error", credentials: "omit", signal: controller.signal })
        pending.then((r) => { if (controller.signal.aborted) void r.body?.cancel().catch(() => {}) }, () => {})
        response = await pending; active(); if (controller.signal.aborted) fail()
        if (response.status >= 300 && response.status < 400 || response.url && response.url !== url) fail()
        const encoding = response.headers.get("content-encoding")
        if (encoding !== null && encoding.toLowerCase() !== "identity") fail()
        const length = response.headers.get("content-length")
        if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > max)) fail()
        reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0
        while (reader) { const next = await reader.read(); active(); if (controller.signal.aborted) fail(); if (next.done) break; size += next.value.length; if (size > max) fail(); chunks.push(next.value) }
        if (length !== null && size !== Number(length)) fail()
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
        if (observeResponse !== undefined) {
          const selectedHeaders = Object.freeze({
            "content-type": response.headers.get("content-type"),
            "content-length": response.headers.get("content-length"),
            "content-encoding": response.headers.get("content-encoding"),
            "payment-required": response.headers.get("payment-required"),
            "payment-response": response.headers.get("payment-response"),
          })
          let headerBytes = 0
          for (const value of Object.values(selectedHeaders)) if (value !== null) {
            const n = Buffer.byteLength(value); if (n > 16384) fail(); headerBytes += n
          }
          if (headerBytes > 32768) fail()
          const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
          const observation: GraphResponseObservation = Object.freeze({
            phase: url === RPC ? "rpc" : headers["PAYMENT-SIGNATURE"] === undefined ? "challenge" : "paid",
            requestUrl: url, requestBodySha256: sha(body), responseUrl: response.url, redirected: response.redirected,
            status: response.status, complete: true, headers: selectedHeaders,
            bodyBase64: Buffer.from(bytes).toString("base64"), bodySha256: sha(bytes),
          })
          active(); if (controller.signal.aborted) fail()
          await observeResponse(observation, controller.signal)
          active(); if (controller.signal.aborted) fail()
        }
        return { response, bytes }
      })()
      const aborted = new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(new Error(FAIL)), { once: true }))
      return await bounded(Promise.race([work, aborted]), Math.min(5000, deadline - now()), cancel)
    } finally { controller.abort(); options.signal?.removeEventListener("abort", cancel); void reader?.cancel().catch(() => {}) }
  }
  async function rpc(method: string, params: unknown[]): Promise<unknown> {
    const id = ++rpcId
    const { response, bytes } = await fetchBytes(RPC, JSON.stringify({ jsonrpc: "2.0", id, method, params }), { "content-type": "application/json" })
    if (response.status !== 200) fail()
    const result: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    keys(result, ["jsonrpc", "id", "result"])
    if (own(result, "jsonrpc") !== "2.0" || own(result, "id") !== id) fail()
    return own(result, "result")
  }
  async function proveReceipt(tx: Hex, nonce: Hex): Promise<void> {
    if (await rpc("eth_chainId", []) !== "0x2105") fail()
    const until = Math.min(deadline, now() + 15000)
    let receipt: unknown
    while (true) {
      active(); if (now() >= until) fail()
      receipt = await rpc("eth_getTransactionReceipt", [tx])
      if (receipt !== null) break
      await bounded(new Promise<void>((resolve) => setTimeout(resolve, 1000)), Math.min(1100, until - now()))
    }
    if (!plain(receipt) || own(receipt, "status") !== "0x1" || own(receipt, "transactionHash") !== tx ||
      !hash(own(receipt, "blockHash")) || !safeIndex(own(receipt, "blockNumber")) || !safeIndex(own(receipt, "transactionIndex"))) fail()
    const logs = own(receipt, "logs")
    if (!Array.isArray(logs) || logs.length > 128) fail()
    const indexes = new Set<string>(); let transfers = 0, authorizations = 0
    for (const log of logs) {
      if (!plain(log) || own(log, "transactionHash") !== tx || own(log, "blockHash") !== own(receipt, "blockHash") ||
        own(log, "blockNumber") !== own(receipt, "blockNumber") || own(log, "transactionIndex") !== own(receipt, "transactionIndex") ||
        !safeIndex(own(log, "logIndex")) || !(own(log, "removed") === false || own(log, "removed") === undefined)) fail()
      const index = String(own(log, "logIndex")); if (indexes.has(index)) fail(); indexes.add(index)
      if (addr(own(log, "address")) !== USDC) continue
      const topics = own(log, "topics"), data = own(log, "data")
      if (!Array.isArray(topics) || topics.length > 4 || !topics.every((t) => typeof t === "string" && /^0x[\da-fA-F]{64}$/.test(t)) || typeof data !== "string" || !/^0x(?:[\da-fA-F]{2})*$/.test(data)) fail()
      const topic = typeof topics[0] === "string" ? topics[0].toLowerCase() : ""
      if (topic !== TRANSFER && topic !== AUTH_USED) continue
      if (topics.length !== 3 || (topic === TRANSFER ? data.length !== 66 : data !== "0x")) fail()
      const decoded = decodeEventLog({ abi: ABI, topics: topics as [Hex, ...Hex[]], data: data as Hex, strict: true })
      if (decoded.eventName === "Transfer") {
        if (decoded.args.from.toLowerCase() === payer || decoded.args.to.toLowerCase() === MERCHANT) {
          if (decoded.args.from.toLowerCase() !== payer || decoded.args.to.toLowerCase() !== MERCHANT || decoded.args.value !== 10000n) fail()
          transfers++
        }
      } else if (decoded.eventName === "AuthorizationUsed" && decoded.args.authorizer.toLowerCase() === payer) {
        if (decoded.args.nonce.toLowerCase() !== nonce.toLowerCase()) fail()
        authorizations++
      }
    }
    if (transfers !== 1 || authorizations !== 1) fail()
    const block = await rpc("eth_getBlockByNumber", [own(receipt, "blockNumber"), false])
    if (own(block, "number") !== own(receipt, "blockNumber") || own(block, "hash") !== own(receipt, "blockHash") || !safeIndex(own(block, "timestamp"))) fail()
  }
  return async (args) => {
    let signed = false, queryOpen = true
    if (busy) fail()
    busy = true
    try {
      active(); if (uncertain || signedCount >= 2 || attempts >= 2) fail()
      const body = requestBody(args)
      attempts++
      const initial = await fetchBytes(ENDPOINT, body, { "content-type": "application/json" }, 65536)
      if (initial.response.status !== 402) fail()
      const required = paymentRequired(decodeHeader(initial.response.headers.get("payment-required")))
      if (await rpc("eth_chainId", []) !== "0x2105") fail()
      const block = await rpc("eth_getBlockByNumber", ["latest", false]), timestamp = own(block, "timestamp")
      if (!safeIndex(timestamp) || Math.abs(Number(BigInt(timestamp)) - Math.floor(now() / 1000)) > 30) fail()
      let nonce: Hex | undefined
      let signedAuthorization: GraphPaymentIntent["authorization"] | undefined
      const signer: ConstructorParameters<typeof ExactEvmScheme>[0] = { address: account.address, async signTypedData(input) {
        active(); if (!queryOpen || signed || signedCount >= 2) fail()
        keys(input, ["domain", "types", "primaryType", "message"])
        const d = input.domain, m = input.message
        keys(d, ["name", "version", "chainId", "verifyingContract"]); keys(m, ["from", "to", "value", "validAfter", "validBefore", "nonce"])
        if (d.name !== "USD Coin" || d.version !== "2" || d.chainId !== 8453 || addr(d.verifyingContract) !== USDC ||
          input.primaryType !== "TransferWithAuthorization" || JSON.stringify(input.types) !== JSON.stringify(AUTH_TYPES) ||
          addr(m.from) !== payer || addr(m.to) !== MERCHANT || m.value !== 10000n || m.validAfter !== 0n ||
          typeof m.validBefore !== "bigint" || m.validBefore < BigInt(Math.floor(now() / 1000) + 295) || m.validBefore > BigInt(Math.floor(now() / 1000) + 300) ||
          !hash(m.nonce) || nonces.has(m.nonce.toLowerCase())) fail()
        nonce = m.nonce; nonces.add(nonce.toLowerCase()); signed = true; signedCount++
        if (beforePaidRequest !== undefined) signedAuthorization = Object.freeze({ from: payer, to: MERCHANT,
          value: QUERY_COST_ATOMIC, validAfter: "0", validBefore: m.validBefore.toString(), nonce: nonce.toLowerCase() })
        return account.signTypedData({ domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC }, types: AUTH_TYPES,
          primaryType: "TransferWithAuthorization", message: { from: account.address, to: MERCHANT, value: 10000n, validAfter: 0n, validBefore: m.validBefore, nonce } })
      } }
      // Pinned @x402/evm2.25 chunk-TTRSMFXP, core2.25 client/index: register is v2 only.
      const client = new x402Client().register(PAYMENT_CHAIN, new ExactEvmScheme(signer))
      const payload = await bounded(client.createPaymentPayload(required), Math.min(5000, deadline - now()))
      active(); if (!signed || nonce === undefined) fail()
      const headers = new x402HTTPClient(client).encodePaymentSignatureHeader(payload)
      if (Object.keys(headers).length !== 1 || typeof headers["PAYMENT-SIGNATURE"] !== "string") fail()
      if (beforePaidRequest !== undefined) {
        if (signedAuthorization === undefined) fail()
        const domain = Object.freeze({ name: "USD Coin" as const, version: "2" as const, chainId: 8453 as const, verifyingContract: USDC })
        const primaryType = "TransferWithAuthorization" as const
        const sha = (value: string) => createHash("sha256").update(value).digest("hex")
        await observeForward(Object.freeze({ endpoint: ENDPOINT, network: PAYMENT_CHAIN, primaryType, domain,
          authorization: signedAuthorization, authorizationSha256: sha(JSON.stringify({ domain, primaryType, authorization: signedAuthorization })),
          requestBodySha256: sha(body), paymentHeaderSha256: sha(headers["PAYMENT-SIGNATURE"]) }))
      }
      const paid = await fetchBytes(ENDPOINT, body, { "content-type": "application/json", "PAYMENT-SIGNATURE": headers["PAYMENT-SIGNATURE"] })
      if (paid.response.status !== 200) fail()
      const settlement = decodeHeader(paid.response.headers.get("payment-response"))
      // Core2.25 SettleResponse: known optional diagnostics must not contradict
      // success; extensions/extra/unreviewed authority are not supported here.
      keys(settlement, ["success", "network", "payer", "transaction", "amount", "errorReason", "errorMessage"], ["success", "network", "payer", "transaction"])
      if ((own(settlement, "amount") !== undefined && own(settlement, "amount") !== QUERY_COST_ATOMIC) ||
        ["errorReason", "errorMessage"].some((field) => own(settlement, field) !== undefined && own(settlement, field) !== "")) fail()
      if (own(settlement, "success") !== true || own(settlement, "network") !== PAYMENT_CHAIN || addr(own(settlement, "payer")) !== payer || !hash(own(settlement, "transaction"))) fail()
      const tx = String(own(settlement, "transaction")).toLowerCase() as Hex
      await proveReceipt(tx, nonce); active()
      const result: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(paid.bytes))
      keys(result, ["data"], ["data"]); const data = own(result, "data")
      if (!plain(data) || own(own(data, "_meta"), "hasIndexingErrors") !== false) fail()
      return { data, paymentTx: tx, costAtomic: QUERY_COST_ATOMIC }
    } catch { if (signed) uncertain = true; throw new Error(FAIL) }
    finally { queryOpen = false; busy = false }
  }
}

export function paidQuery(args: QueryArgs & { readonly privateKey: string }, options?: QueryOptions): Promise<PaidResult> {
  return makePaidQuery(args.privateKey, options)({ subgraphId: args.subgraphId, document: args.document, variables: args.variables })
}
