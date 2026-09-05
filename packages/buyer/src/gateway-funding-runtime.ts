/** Explicit Bun/server funding operations. Imports/factories never acquire keys,
 * call a provider, create a claim, or infer authority from an environment value. */
import { encodeFunctionData, erc20Abi, keccak256, parseAbi, parseTransaction, recoverTransactionAddress,
  recoverTypedDataAddress, recoverAddress, padHex, serializeTransaction, stringToHex, type Hex } from "viem"
import { loadChainConfig } from "@arcade/core"
import { FundingFailure, captureFundingPublicEvent, captureFundingPublicOutcome, decodeFundingRequest,
  decodeFundingSnapshot, encodeFundingPublic, fundingDeployment, fundingUint, operationDigest, parseFundingAmount,
  planDeposit, planWithdrawal, planDigest, validateDeploymentIdentity, validateFundingAuthority,
  type FundingAuthority, type FundingDeploymentIdentity, type FundingFailureCode, type FundingPublicEvent,
  type FundingPublicFacts, type FundingPublicOutcome, type FundingRequest, type FundingSnapshot,
  type DepositPlan, type WithdrawalPlan } from "./gateway-funding.ts"
import { burnIntentTypedData, captureBurnIntent, captureTransferSpec, decodeAndBindWithdrawalAttestation,
  hashTransferSpec, validateBurnHeight, type BurnIntent, type BurnIntentTypedData, type TransferSpec } from "./gateway-withdrawal.ts"
import { finalizeFundingJournal, openFundingJournal, readFundingJournal, type FundingJournal,
  type FundingJournalIO, type FundingJournalRead, type FundingJournalSnapshot } from "./gateway-funding-journal.ts"

const ZERO = "0x0000000000000000000000000000000000000000" as Hex
const UINT_MAX = (1n << 256n) - 1n
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const fail = (code: FundingFailureCode = "read_unavailable"): never => { throw new FundingFailure(code) }
function insist(value: unknown, code: FundingFailureCode = "read_unavailable"): asserts value { if (!value) fail(code) }
function own(value: unknown, allowed?: readonly string[]): Record<string, unknown> {
  insist(value !== null && typeof value === "object" && !Array.isArray(value), "configuration_invalid")
  const prototype = Object.getPrototypeOf(value)
  insist(prototype === Object.prototype || prototype === null, "configuration_invalid")
  const keys = Reflect.ownKeys(value); insist(keys.length <= 128, "configuration_invalid")
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of keys) {
    insist(typeof key === "string" && key.length <= 128 && (!allowed || allowed.includes(key)), "configuration_invalid")
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    insist(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, "value"), "configuration_invalid")
    result[key] = descriptor.value
  }
  return result
}
const hex = (value: unknown, bytes: number): Hex => {
  insist(typeof value === "string" && value.length === bytes * 2 + 2 && /^0x[0-9a-fA-F]*$/.test(value))
  return value.toLowerCase() as Hex
}
const nonzeroHash = (value: unknown): Hex => { const result = hex(value, 32); insist(result !== `0x${"00".repeat(32)}`); return result }
const canonicalSignature = (value: unknown): Hex => {
  const signature = hex(value, 65), r = BigInt(`0x${signature.slice(2, 66)}`), s = BigInt(`0x${signature.slice(66, 130)}`)
  insist(r > 0n && r < CURVE_ORDER && s > 0n && s <= CURVE_ORDER / 2n && /(?:1b|1c)$/.test(signature), "evidence_unavailable")
  return signature
}
const quantity = (value: unknown): bigint => {
  insist(typeof value === "string" && value.length <= 66 && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value))
  return fundingUint(BigInt(value))
}
const wordUint = (value: unknown): bigint => BigInt(hex(value, 32))
const q = (value: bigint): Hex => `0x${value.toString(16)}`
const fixedError = (error: unknown, fallback: FundingFailureCode = "read_unavailable") =>
  error instanceof FundingFailure ? new FundingFailure(error.code) : new FundingFailure(fallback)
export interface FundingTransaction {
  readonly type: "eip1559"; readonly chainId: 5042002; readonly nonce: number; readonly to: Hex; readonly data: Hex
  readonly value: 0n; readonly gas: bigint; readonly maxFeePerGas: bigint; readonly maxPriorityFeePerGas: bigint
}
export interface FundingSigner {
  readonly address: Hex
  readonly signTransaction: (transaction: FundingTransaction, signal: AbortSignal) => Promise<Hex>
  readonly signTypedData: (intent: BurnIntentTypedData, signal: AbortSignal) => Promise<Hex>
}
export interface FundingDependencies {
  readonly signal: AbortSignal
  /** Absolute performance.now-style monotonic deadline, captured once. */
  readonly deadlineMs: number
  readonly now: () => number
  readonly wallNow: () => number
  readonly rpc: (method: string, params: readonly unknown[], signal: AbortSignal) => Promise<unknown>
  readonly gateway: (path: string, method: "GET" | "POST", body: string | undefined, signal: AbortSignal) => Promise<unknown>
  readonly sendRawTransaction: (raw: Hex, signal: AbortSignal) => Promise<unknown>
  readonly normalTransferPost: (body: string, signal: AbortSignal) => Promise<unknown>
  readonly acquireSigner?: (signal: AbortSignal) => Promise<FundingSigner>
  readonly journalIO?: FundingJournalIO
}
export interface FundingDependencyOptions {
  readonly fetch?: typeof fetch
  readonly signal: AbortSignal
  readonly deadlineMs: number
  readonly acquireSigner?: (signal: AbortSignal) => Promise<FundingSigner>
}
export interface FundingOperationInput {
  readonly authority: FundingAuthority; readonly operationId: string; readonly request: FundingRequest; readonly journalPath: string
}
export interface FundingOperation {
  executeDepositOnce(): Promise<FundingPublicOutcome>
  requestWithdrawalOnce(): Promise<FundingPublicOutcome>
  mintWithdrawalOnce(): Promise<FundingPublicOutcome>
  reconcileOperationReadOnly(): Promise<FundingPublicOutcome>
  publicState(): FundingPublicOutcome | undefined
  close(): Promise<void>
}

/** Per-await cancellation owns its timer/listener, including uncooperative IO.
 * Late results are consumed but never grant a later signer/send entry. */
async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, d: Pick<FundingDependencies, "signal" | "deadlineMs" | "now">,
  maximum = 15_000): Promise<T> {
  const controller = new AbortController(), deadline = Math.min(d.deadlineMs, d.now() + maximum)
  let timer: ReturnType<typeof setTimeout> | undefined, onAbort: (() => void) | undefined
  try {
    insist(!d.signal.aborted && d.now() < deadline, "cancelled")
    const stop = new Promise<never>((_resolve, reject) => {
      onAbort = () => { controller.abort(); reject(new FundingFailure("cancelled")) }
      d.signal.addEventListener("abort", onAbort, { once: true })
      timer = setTimeout(onAbort, Math.max(0, deadline - d.now()))
    })
    const result = await Promise.race([Promise.resolve().then(() => {
      insist(!controller.signal.aborted && !d.signal.aborted && d.now() < deadline, "cancelled")
      return work(controller.signal)
    }), stop])
    insist(!controller.signal.aborted && !d.signal.aborted && d.now() < deadline, "cancelled")
    return result
  } finally {
    controller.abort()
    if (timer !== undefined) clearTimeout(timer)
    if (onAbort) d.signal.removeEventListener("abort", onAbort)
  }
}

/** Fixed URL/headers and full response-body bounds; never redirect/retry. */
async function wire(fetchFn: typeof fetch, url: string, method: "GET" | "POST", body: string | undefined,
  signal: AbortSignal, deadlineMs: number): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let response: Response | undefined
  let finished = false
  const context = { signal, deadlineMs, now: () => performance.now() }
  try {
    insist(body === undefined || Buffer.byteLength(body) <= 16_384, "configuration_invalid")
    return await bounded(async activeSignal => {
      const result = await fetchFn(url, { method, ...(body === undefined ? {} : { body }),
        headers: { accept: "application/json", "accept-encoding": "identity", "content-type": "application/json" },
        credentials: "omit", redirect: "error", signal: activeSignal })
      response = result
      if (finished || activeSignal.aborted) {
        try { if (result.body) void result.body.cancel().catch(() => {}) } catch { /* late body owns no authority */ }
        fail("read_unavailable")
      }
      insist(!finished && !activeSignal.aborted && result.ok && !result.redirected && (!result.url || result.url === url))
      insist(result.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json")
      const length = result.headers.get("content-length")
      insist(length === null || /^(0|[1-9][0-9]{0,6})$/.test(length) && Number(length) <= 262_144)
      const encoding = result.headers.get("content-encoding")
      insist(encoding === null || encoding === "identity")
      insist(result.body !== null)
      reader = result.body.getReader()
      const chunks: Uint8Array[] = []; let bytes = 0, empty = 0
      while (true) {
        insist(!finished && !activeSignal.aborted && performance.now() < deadlineMs, "cancelled")
        const next = await bounded(() => reader!.read(), { signal: activeSignal, deadlineMs, now: context.now }, 5000)
        insist(!finished && !activeSignal.aborted && performance.now() < deadlineMs, "cancelled")
        if (next.done) break
        insist(next.value instanceof Uint8Array)
        if (next.value.byteLength === 0) { insist(++empty <= 1024); continue }
        empty = 0; bytes += next.value.byteLength; insist(bytes <= 262_144)
        chunks.push(next.value.slice())
      }
      insist(length === null || bytes === Number(length))
      const combined = new Uint8Array(bytes); let offset = 0
      for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)) as unknown
    }, context, 5000)
  } catch { return fail("read_unavailable") }
  finally {
    finished = true
    try { if (reader) void reader.cancel().catch(() => {}); else if (response?.body) void response.body.cancel().catch(() => {}) } catch { /* fixed errors only */ }
  }
}
const readMethods = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_getStorageAt", "eth_call", "eth_getBalance",
  "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getLogs"])
export function createFundingDependencies(input: FundingDependencyOptions): FundingDependencies {
  try {
    const raw = own(input, ["fetch", "signal", "deadlineMs", "acquireSigner"])
    insist(raw.signal instanceof AbortSignal && typeof raw.deadlineMs === "number" && Number.isFinite(raw.deadlineMs), "configuration_invalid")
    insist(raw.fetch === undefined || typeof raw.fetch === "function", "configuration_invalid")
    insist(raw.acquireSigner === undefined || typeof raw.acquireSigner === "function", "configuration_invalid")
    const fetchFn = (raw.fetch ?? fetch) as typeof fetch, signal = raw.signal, deadlineMs = raw.deadlineMs
    let id = 0
    const rpc = async (method: string, params: readonly unknown[], activeSignal: AbortSignal, send = false): Promise<unknown> => {
      insist(send ? method === "eth_sendRawTransaction" : readMethods.has(method), "configuration_invalid")
      const requestId = ++id
      const body = JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })
      const reply = own(await wire(fetchFn, fundingDeployment.rpcOrigin, "POST", body, activeSignal, deadlineMs))
      insist(reply.jsonrpc === "2.0" && reply.id === requestId && Object.hasOwn(reply, "result") && !Object.hasOwn(reply, "error") && Object.keys(reply).length === 3)
      return reply.result
    }
    const gateway = (path: string, method: "GET" | "POST", body: string | undefined, activeSignal: AbortSignal): Promise<unknown> => {
      insist((path === "/v1/balances" && method === "POST") || /^\/v1\/transfer\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(path) && method === "GET", "configuration_invalid")
      return wire(fetchFn, fundingDeployment.apiOrigin + path, method, body, activeSignal, deadlineMs)
    }
    return Object.freeze<FundingDependencies>({ signal, deadlineMs, now: () => performance.now(), wallNow: () => Date.now(),
      rpc: (method, params, activeSignal) => rpc(method, params, activeSignal), gateway,
      sendRawTransaction: (bytes, activeSignal) => rpc("eth_sendRawTransaction", [bytes], activeSignal, true),
      normalTransferPost: (body, activeSignal) => wire(fetchFn, fundingDeployment.apiOrigin + "/v1/transfer?enableForwarder=false&maxAttestationSize=388", "POST", body, activeSignal, deadlineMs),
      ...(raw.acquireSigner === undefined ? {} : { acquireSigner: raw.acquireSigner as NonNullable<FundingDependencies["acquireSigner"]> }) })
  } catch { return fail("configuration_invalid") }
}

function captureDependencies(input: FundingDependencies): FundingDependencies {
  const d = own(input, ["signal", "deadlineMs", "now", "wallNow", "rpc", "gateway", "sendRawTransaction", "normalTransferPost", "acquireSigner", "journalIO"])
  insist(d.signal instanceof AbortSignal && typeof d.deadlineMs === "number" && Number.isFinite(d.deadlineMs), "configuration_invalid")
  for (const key of ["now", "wallNow", "rpc", "gateway", "sendRawTransaction", "normalTransferPost"]) insist(typeof d[key] === "function", "configuration_invalid")
  insist(d.acquireSigner === undefined || typeof d.acquireSigner === "function", "configuration_invalid")
  if (d.journalIO !== undefined) d.journalIO = Object.freeze(own(d.journalIO, ["testRoot", "checkpoint"]))
  return Object.freeze(d) as unknown as FundingDependencies
}
function check(d: FundingDependencies) { insist(!d.signal.aborted && d.now() < d.deadlineMs, "cancelled") }
const rpc = (d: FundingDependencies, method: string, params: readonly unknown[] = []) => bounded(signal => d.rpc(method, params, signal), d)
const walletAbi = parseAbi(["function deposit(address token, uint256 value)", "function totalBalance(address token,address depositor) view returns(uint256)",
  "function paused() view returns(bool)", "function domain() view returns(uint32)", "function isTokenSupported(address token) view returns(bool)",
  "function withdrawalDelay() view returns(uint256)"])
const minterAbi = parseAbi(["function gatewayMint(bytes attestation,bytes signature)", "function paused() view returns(bool)",
  "function domain() view returns(uint32)", "function isTokenSupported(address token) view returns(bool)",
  "function isAttestationSigner(address signer) view returns(bool)", "function tokenMintAuthority(address token) view returns(address)"])
const call = (d: FundingDependencies, to: Hex, data: Hex, block: Hex): Promise<unknown> => rpc(d, "eth_call", [{ to, data }, block])
interface Block { readonly number: bigint; readonly hash: Hex; readonly timestamp: bigint }
function decodeBlock(input: unknown, d: FundingDependencies, fresh: boolean): Block {
  const r = own(input), block = Object.freeze({ number: quantity(r.number), hash: nonzeroHash(r.hash), timestamp: quantity(r.timestamp) })
  if (fresh) {
    const wall = d.wallNow(); insist(Number.isSafeInteger(wall) && wall >= 0)
    const age = BigInt(wall) - block.timestamp * 1000n
    insist(age >= -5000n && age <= 60_000n)
  }
  return block
}
async function checkedBlock(d: FundingDependencies): Promise<Block> {
  insist(quantity(await rpc(d, "eth_chainId")) === 5042002n)
  return decodeBlock(await rpc(d, "eth_getBlockByNumber", ["finalized", false]), d, true)
}
async function canonicalBlock(d: FundingDependencies, block: Block) {
  const after = decodeBlock(await rpc(d, "eth_getBlockByNumber", [q(block.number), false]), d, false)
  insist(after.number === block.number && after.hash === block.hash)
}
async function identities(d: FundingDependencies, a: FundingAuthority, block: Block, withdrawal: boolean): Promise<readonly FundingDeploymentIdentity[]> {
  const result: FundingDeploymentIdentity[] = []
  for (const role of withdrawal ? ["wallet", "minter"] as const : ["wallet"] as const) {
    const proxy = a[role], tag = q(block.number)
    const proxyCode = await rpc(d, "eth_getCode", [proxy, tag])
    const slot = hex(await rpc(d, "eth_getStorageAt", [proxy, fundingDeployment.implementationSlot, tag]), 32)
    insist(slot.slice(2, 26) === "0".repeat(24), "deployment_identity_unavailable")
    const implementation = `0x${slot.slice(26)}` as Hex
    const implementationCode = await rpc(d, "eth_getCode", [implementation, tag])
    result.push(validateDeploymentIdentity(role, proxyCode, slot, implementationCode))
  }
  await canonicalBlock(d, block)
  return Object.freeze(result)
}
function checkConfig(a: FundingAuthority) {
  const config = loadChainConfig("arc-testnet")
  insist(config.status === "ready" && config.chainId === a.chainId && config.caip2 === a.network &&
    config.usdc.address.toLowerCase() === a.token && config.usdc.decimals === 6 && config.usdc.nativeDecimals === 18 &&
    config.gateway?.wallet.toLowerCase() === a.wallet && config.gateway?.domain === a.domain && config.gateway?.facilitatorUrl === a.apiOrigin,
  "configuration_invalid")
}
async function readSnapshot(a: FundingAuthority, d: FundingDependencies, withdrawal = false) {
  check(d); checkConfig(a)
  const block = await checkedBlock(d), identity = await identities(d, a, block, withdrawal), tag = q(block.number)
  insist(wordUint(await call(d, a.token, encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }), tag)) === 6n)
  for (const role of withdrawal ? ["wallet", "minter"] as const : ["wallet"] as const) {
    const abi = role === "wallet" ? walletAbi : minterAbi
    insist(wordUint(await call(d, a[role], encodeFunctionData({ abi, functionName: "paused" }), tag)) === 0n)
    insist(wordUint(await call(d, a[role], encodeFunctionData({ abi, functionName: "domain" }), tag)) === 26n)
    insist(wordUint(await call(d, a[role], encodeFunctionData({ abi, functionName: "isTokenSupported", args: [a.token] }), tag)) === 1n)
  }
  const walletTokenBalance = wordUint(await call(d, a.token, encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [a.account] }), tag))
  const walletNativeBalance = quantity(await rpc(d, "eth_getBalance", [a.account, tag]))
  const allowance = wordUint(await call(d, a.token, encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [a.account, a.wallet] }), tag))
  const gatewayTotalBalance = wordUint(await call(d, a.wallet, encodeFunctionData({ abi: walletAbi, functionName: "totalBalance", args: [a.token, a.account] }), tag))
  const balanceReply = own(await bounded(signal => d.gateway("/v1/balances", "POST", JSON.stringify({ token: "USDC", sources: [{ depositor: a.account, domain: a.domain }] }), signal), d))
  insist(balanceReply.token === "USDC" && Array.isArray(balanceReply.balances) && balanceReply.balances.length === 1)
  const balance = own(balanceReply.balances[0])
  insist(hex(balance.depositor, 20) === a.account && balance.domain === 26)
  const available = parseFundingAmount(balance.balance)
  const optional = (key: string) => Object.hasOwn(balance, key) ? parseFundingAmount(balance[key]) : null
  const withdrawalDelay = withdrawal ? wordUint(await call(d, a.wallet, encodeFunctionData({ abi: walletAbi, functionName: "withdrawalDelay" }), tag)) : null
  await canonicalBlock(d, block); check(d)
  const snapshot = decodeFundingSnapshot({ authority: a, walletTokenBalance, walletNativeBalance, allowance, available, gatewayTotalBalance,
    pending: optional("pendingBatch"), withdrawing: optional("withdrawing"), withdrawable: optional("withdrawable"),
    sourceBlock: block.number, sourceBlockHash: block.hash, observedAtMs: Math.floor(d.wallNow()),
    destinationBlock: withdrawal ? block.number : null, destinationBlockHash: withdrawal ? block.hash : null, withdrawalDelay }, a)
  return { snapshot, identity }
}
const snapshotFacts = (s: FundingSnapshot): FundingPublicFacts => ({ account: s.authority.account, network: s.authority.network,
  domain: s.authority.domain, token: s.authority.token, wallet: s.authority.wallet, minter: s.authority.minter,
  walletTokenBalance: s.walletTokenBalance, walletNativeBalance: s.walletNativeBalance, allowance: s.allowance,
  availableAfter: s.available, gatewayTotalAfter: s.gatewayTotalBalance, pending: s.pending, withdrawing: s.withdrawing, withdrawable: s.withdrawable,
  blockNumber: s.sourceBlock, blockHash: s.sourceBlockHash, observedAtMs: s.observedAtMs })
export async function inspectFunding(authority: FundingAuthority, dependencies: FundingDependencies): Promise<FundingPublicOutcome> {
  try {
    const a = validateFundingAuthority(authority), d = captureDependencies(dependencies)
    const { snapshot } = await readSnapshot(a, d)
    return captureFundingPublicOutcome({ status: "observed", facts: snapshotFacts(snapshot) })
  } catch (error) { return captureFundingPublicOutcome({ status: "refused", code: fixedError(error).code, facts: {} }) }
}

interface ExpectedTransaction {
  readonly to: Hex; readonly calldataHash: Hex; readonly nonce: bigint; readonly gas: bigint
  readonly maxFeePerGas: bigint; readonly maxPriorityFeePerGas: bigint
}
const transactionFacts = (transaction: FundingTransaction): ExpectedTransaction => Object.freeze({ to: transaction.to,
  calldataHash: keccak256(transaction.data), nonce: BigInt(transaction.nonce), gas: transaction.gas,
  maxFeePerGas: transaction.maxFeePerGas, maxPriorityFeePerGas: transaction.maxPriorityFeePerGas })
async function prepareTransaction(a: FundingAuthority, d: FundingDependencies, to: Hex, data: Hex, remainingGas: bigint): Promise<FundingTransaction> {
  const nonce = quantity(await rpc(d, "eth_getTransactionCount", [a.account, "pending"]))
  insist(nonce <= BigInt(Number.MAX_SAFE_INTEGER))
  const maxFeePerGas = quantity(await rpc(d, "eth_gasPrice")), maxPriorityFeePerGas = quantity(await rpc(d, "eth_maxPriorityFeePerGas"))
  insist(maxFeePerGas > 0n && maxPriorityFeePerGas <= maxFeePerGas)
  const gas = quantity(await rpc(d, "eth_estimateGas", [{ from: a.account, to, data, value: "0x0", type: "0x2",
    maxFeePerGas: q(maxFeePerGas), maxPriorityFeePerGas: q(maxPriorityFeePerGas) }]))
  insist(gas > 0n && gas * maxFeePerGas <= remainingGas, "policy_refused")
  return Object.freeze({ type: "eip1559", chainId: 5042002, nonce: Number(nonce), to, data, value: 0n, gas, maxFeePerGas, maxPriorityFeePerGas })
}
async function checkedSignedTransaction(raw: unknown, expected: FundingTransaction, account: Hex): Promise<Hex> {
  insist(typeof raw === "string" && raw.length <= 8192 && raw.length % 2 === 0 && /^0x[0-9a-f]+$/.test(raw), "evidence_unavailable")
  const bytes = raw as Hex, parsed = parseTransaction(bytes)
  insist(parsed.type === "eip1559" && parsed.chainId === expected.chainId && parsed.nonce === expected.nonce &&
    parsed.to?.toLowerCase() === expected.to && (parsed.value ?? 0n) === 0n && parsed.data === expected.data &&
    parsed.gas === expected.gas && parsed.maxFeePerGas === expected.maxFeePerGas && parsed.maxPriorityFeePerGas === expected.maxPriorityFeePerGas &&
    (!parsed.accessList || parsed.accessList.length === 0), "evidence_unavailable")
  insist(parsed.r !== undefined && parsed.s !== undefined && (parsed.yParity === 0 || parsed.yParity === 1), "evidence_unavailable")
  insist(BigInt(parsed.r) > 0n && BigInt(parsed.s) > 0n && BigInt(parsed.s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n, "evidence_unavailable")
  insist(serializeTransaction(parsed, { r: parsed.r, s: parsed.s, yParity: parsed.yParity }) === bytes, "evidence_unavailable")
  insist(bytes.startsWith("0x02"), "evidence_unavailable")
  insist((await recoverTransactionAddress({ serializedTransaction: bytes as `0x02${string}` })).toLowerCase() === account, "evidence_unavailable")
  return bytes
}
interface ReceiptEvidence { readonly txHash: Hex; readonly block: Block; readonly logs: readonly Record<string, unknown>[] }
async function proveTransaction(a: FundingAuthority, d: FundingDependencies, txHash: Hex, expected: ExpectedTransaction): Promise<ReceiptEvidence | undefined> {
  const rawReceipt = await rpc(d, "eth_getTransactionReceipt", [txHash])
  if (rawReceipt === null) return undefined
  const r = own(rawReceipt)
  insist(r.status === "0x1" && nonzeroHash(r.transactionHash) === txHash && hex(r.from, 20) === a.account && hex(r.to, 20) === expected.to, "evidence_unavailable")
  const blockNumber = quantity(r.blockNumber), blockHash = nonzeroHash(r.blockHash)
  const transaction = own(await rpc(d, "eth_getTransactionByHash", [txHash]))
  insist(nonzeroHash(transaction.hash) === txHash && hex(transaction.from, 20) === a.account && hex(transaction.to, 20) === expected.to &&
    quantity(transaction.chainId) === 5042002n && quantity(transaction.value) === 0n && transaction.type === "0x2" &&
    quantity(transaction.nonce) === expected.nonce && quantity(transaction.gas) === expected.gas &&
    quantity(transaction.maxFeePerGas) === expected.maxFeePerGas && quantity(transaction.maxPriorityFeePerGas) === expected.maxPriorityFeePerGas &&
    nonzeroHash(transaction.blockHash) === blockHash && quantity(transaction.blockNumber) === blockNumber, "evidence_unavailable")
  insist(typeof transaction.input === "string" && transaction.input.length <= 4096 && transaction.input.length % 2 === 0 && /^0x[0-9a-fA-F]*$/.test(transaction.input), "evidence_unavailable")
  insist(keccak256(transaction.input as Hex) === expected.calldataHash, "evidence_unavailable")
  const block = decodeBlock(await rpc(d, "eth_getBlockByNumber", [q(blockNumber), false]), d, false)
  insist(block.number === blockNumber && block.hash === blockHash, "evidence_unavailable")
  const finalized = await checkedBlock(d)
  insist(finalized.number >= blockNumber, "evidence_unavailable")
  insist(Array.isArray(r.logs) && r.logs.length <= 128, "evidence_unavailable")
  const logs = r.logs.map((value: unknown) => {
    const log = own(value)
    insist(log.removed === false && nonzeroHash(log.blockHash) === blockHash && quantity(log.blockNumber) === blockNumber && nonzeroHash(log.transactionHash) === txHash,
      "evidence_unavailable")
    return log
  })
  await canonicalBlock(d, block)
  return Object.freeze({ txHash, block, logs: Object.freeze(logs) })
}
const eventTopic = (text: string) => keccak256(stringToHex(text))
const TRANSFER = eventTopic("Transfer(address,address,uint256)")
const APPROVAL = eventTopic("Approval(address,address,uint256)")
const ATTESTATION_USED = eventTopic("AttestationUsed(address,address,bytes32,uint32,bytes32,bytes32,uint256)")
const GATEWAY_BURNED = eventTopic("GatewayBurned(address,address,bytes32,uint32,bytes32,address,uint256,uint256,uint256,uint256)")
function exactTokenEffect(receipt: ReceiptEvidence, token: Hex, topic: Hex, from: Hex, to: Hex, amount: bigint) {
  const matching = receipt.logs.filter(log => hex(log.address, 20) === token && Array.isArray(log.topics) && log.topics[0] === topic)
    .filter(log => {
      const topics = log.topics as unknown[]
      insist(topics.length === 3, "evidence_unavailable")
      return hex(topics[1], 32) === padHex(from, { size: 32 }) && hex(topics[2], 32) === padHex(to, { size: 32 })
    })
  insist(matching.length === 1 && wordUint(matching[0]!.data) === amount, "evidence_unavailable")
}
async function proveDeposit(a: FundingAuthority, d: FundingDependencies, txHash: Hex, expected: ExpectedTransaction,
  amount: bigint, totalBefore: bigint): Promise<ReceiptEvidence | undefined> {
  const receipt = await proveTransaction(a, d, txHash, expected)
  if (!receipt) return undefined
  await identities(d, a, receipt.block, false)
  exactTokenEffect(receipt, a.token, TRANSFER, a.account, a.wallet, amount)
  const after = wordUint(await call(d, a.wallet, encodeFunctionData({ abi: walletAbi, functionName: "totalBalance", args: [a.token, a.account] }), q(receipt.block.number)))
  insist(totalBefore + amount <= UINT_MAX && after === totalBefore + amount, "evidence_unavailable")
  await canonicalBlock(d, receipt.block)
  return receipt
}
const publicResult = (status: FundingPublicOutcome["status"], facts: FundingPublicFacts, code?: FundingFailureCode) =>
  captureFundingPublicOutcome({ status, facts, ...(code === undefined ? {} : { code }) })

export function createFundingOperation(input: FundingOperationInput, dependencies: FundingDependencies): FundingOperation {
  try {
    const raw = own(input, ["authority", "operationId", "request", "journalPath"]), authority = validateFundingAuthority(raw.authority)
    const request = decodeFundingRequest(raw.request)
    insist(typeof raw.operationId === "string" && typeof raw.journalPath === "string", "configuration_invalid")
    const operationId = raw.operationId, journalPath = raw.journalPath, digest = operationDigest(authority, request, operationId), d = captureDependencies(dependencies)
    let attempted = false, mintAttempted = false, uncertain = false, closed = false, closing = false, entered = false
    let journal: FundingJournal | undefined, state: FundingPublicOutcome | undefined, owner: Promise<FundingPublicOutcome> | undefined
    let opening: Promise<FundingJournal> | undefined, lateCleanupFailed = false
    let plan: DepositPlan | WithdrawalPlan | undefined, initialIdentity: readonly FundingDeploymentIdentity[] | undefined
    let signer: FundingSigner | undefined, authorizedGas = 0n, closePromise: Promise<void> | undefined
    let capability: { readonly id: string; readonly payload: Hex; readonly signature: Hex; readonly intent: BurnIntent; readonly actualFee: bigint } | undefined
    const base: FundingPublicFacts = Object.freeze({ operationId, operationDigest: digest, account: authority.account, network: authority.network,
      domain: authority.domain, token: authority.token, wallet: authority.wallet, minter: authority.minter, kind: request.kind, gasCapWei: request.gasCapWei })
    const checkpoint = async (event: FundingPublicEvent["event"], facts: FundingPublicFacts = {}) => {
      insist(journal !== undefined, "journal_unavailable")
      try { await bounded(() => journal!.append(journal!.readHead(), captureFundingPublicEvent({ event, facts: { ...base, ...facts } })), d) }
      catch { uncertain = true; fail("journal_unavailable") }
    }
    const active = () => { check(d); insist(!uncertain && !closed && !closing, "operation_consumed") }
    const ensureSigner = async (): Promise<FundingSigner> => {
      active()
      if (signer) return signer
      insist(d.acquireSigner !== undefined, "configuration_invalid")
      const rawSigner = own(await bounded(signal => d.acquireSigner!(signal), d), ["address", "signTransaction", "signTypedData"])
      active()
      insist(hex(rawSigner.address, 20) === authority.account && typeof rawSigner.signTransaction === "function" && typeof rawSigner.signTypedData === "function", "configuration_invalid")
      signer = Object.freeze({ address: authority.account, signTransaction: rawSigner.signTransaction as FundingSigner["signTransaction"],
        signTypedData: rawSigner.signTypedData as FundingSigner["signTypedData"] })
      return signer
    }
    const recheck = async (withdrawal = false): Promise<FundingSnapshot> => {
      active()
      const current = await readSnapshot(authority, d, withdrawal)
      active()
      insist(initialIdentity !== undefined && JSON.stringify(current.identity) === JSON.stringify(initialIdentity), "deployment_identity_unavailable")
      return current.snapshot
    }
    const transaction = async (stage: "approval" | "deposit" | "mint", to: Hex, data: Hex, amount: bigint,
      validateCurrent: (snapshot: FundingSnapshot, remainingGas: bigint) => void | Promise<void>): Promise<{ readonly receipt: ReceiptEvidence | undefined; readonly expected: ExpectedTransaction; readonly hash: Hex }> => {
      active()
      const remainingGas = request.gasCapWei - authorizedGas
      const prepared = await prepareTransaction(authority, d, to, data, remainingGas)
      const fresh = await recheck(stage === "mint"); await validateCurrent(fresh, remainingGas)
      insist(quantity(await rpc(d, "eth_getTransactionCount", [authority.account, "pending"])) === BigInt(prepared.nonce), "policy_refused")
      const expected = transactionFacts(prepared), { to: _to, ...facts } = expected
      authorizedGas += prepared.gas * prepared.maxFeePerGas
      // Intent is durable before credential acquisition or any signing callback.
      await checkpoint(`${stage}_intent`, { ...facts, stage, amount, signerEntered: true })
      entered = true
      const account = await ensureSigner(); active()
      // Acquiring a lazy signer is asynchronous; it does not freeze chain state.
      const beforeSign = await recheck(stage === "mint"); await validateCurrent(beforeSign, remainingGas)
      insist(quantity(await rpc(d, "eth_getTransactionCount", [authority.account, "pending"])) === BigInt(prepared.nonce), "policy_refused")
      active()
      const signed = await bounded(signal => account.signTransaction(prepared, signal), d)
      active()
      const bytes = await checkedSignedTransaction(signed, prepared, authority.account)
      active()
      const txHash = keccak256(bytes)
      await checkpoint(`${stage}_prepared`, { ...facts, stage, amount, txHash, signerEntered: true })
      const beforeSend = await recheck(stage === "mint"); await validateCurrent(beforeSend, remainingGas)
      insist(quantity(await rpc(d, "eth_getTransactionCount", [authority.account, "pending"])) === BigInt(prepared.nonce), "policy_refused")
      active()
      // The prepared hash is write-ahead. A lost reply may have been accepted.
      const submitted = await bounded(signal => d.sendRawTransaction(bytes, signal), d)
      active(); insist(nonzeroHash(submitted) === txHash, "evidence_unavailable")
      await checkpoint(`${stage}_submitted`, { ...facts, stage, amount, txHash, submitted: true })
      const receipt = await proveTransaction(authority, d, txHash, expected)
      return { receipt, expected, hash: txHash }
    }
    const start = async () => {
      active()
      // Adopt the resource in the opening promise itself, not only in the raced
      // await. An ignored-abort OS open can complete after the caller has left.
      opening = openFundingJournal({ authority, operationId, request, operationDigest: digest, journalPath }, d.journalIO).then(async opened => {
        journal = opened
        if (d.signal.aborted || d.now() >= d.deadlineMs || closed || closing || uncertain) {
          try { await opened.close() } catch { lateCleanupFailed = true }
          fail("cancelled")
        }
        return opened
      })
      await bounded(() => opening!, d)
      active()
      const first = await readSnapshot(authority, d, request.kind === "withdrawal")
      active(); initialIdentity = first.identity
      plan = request.kind === "deposit" ? planDeposit(authority, request, first.snapshot) : planWithdrawal(authority, request, first.snapshot)
      const facts: FundingPublicFacts = { ...snapshotFacts(first.snapshot), planDigest: planDigest(plan), amount: plan.amount,
        availableBefore: first.snapshot.available, gatewayTotalBefore: first.snapshot.gatewayTotalBalance,
        ...(plan.kind === "deposit" ? { approvalAmount: plan.approvalAmount,
          ...(plan.request.mode === "target" ? { minimumAvailable: plan.request.minimumAvailable, maxDeposit: plan.request.maxDeposit } : {}) }
          : { maxFee: plan.maxFee, maxBurnBlockDelta: plan.request.maxBurnBlockDelta, maxBlockHeight: plan.maxBlockHeight }) }
      await checkpoint("planned", facts)
      return plan
    }
    const settleFailure = async (error: unknown): Promise<FundingPublicOutcome> => {
      const failure = fixedError(error, "journal_unavailable"), unknown = entered || uncertain
      uncertain ||= unknown
      if (journal && !closing && !closed) {
        try { await checkpoint(unknown ? "uncertain" : "refused", { failureCode: failure.code,
          ...(unknown ? {} : { terminalKind: "unsigned_refusal" as const, signerEntered: false, submitted: false }) }) } catch { uncertain = true }
      }
      state = publicResult(uncertain ? "uncertain" : "refused", base, uncertain ? "operation_uncertain" : failure.code)
      return state
    }
    const deposit = async (): Promise<FundingPublicOutcome> => {
      const p = await start(); insist(p.kind === "deposit", "configuration_invalid")
      if (p.noop) {
        await checkpoint("noop", { amount: 0n, terminalKind: "noop", signerEntered: false, submitted: false })
        return publicResult("noop", { ...base, ...snapshotFacts(p.snapshot), amount: 0n, terminalKind: "noop" })
      }
      const currentPolicy = (s: FundingSnapshot, approval: boolean, remainingGas: bigint) => {
        // The captured request/plan never changes. This local affordability check
        // reserves only its unspent aggregate cap after a confirmed approval.
        const current = planDeposit(authority, { ...p.request, gasCapWei: remainingGas }, s)
        insist(current.amount === p.amount && s.gatewayTotalBalance === p.snapshot.gatewayTotalBalance &&
          (approval ? s.allowance === p.snapshot.allowance : s.allowance >= p.amount), "policy_refused")
      }
      if (p.approvalAmount > 0n) {
        const approved = await transaction("approval", authority.token,
          encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [authority.wallet, p.amount] }), p.amount, (s, remaining) => currentPolicy(s, true, remaining))
        insist(approved.receipt !== undefined, "evidence_unavailable")
        exactTokenEffect(approved.receipt, authority.token, APPROVAL, authority.account, authority.wallet, p.amount)
        const allowance = wordUint(await call(d, authority.token, encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [authority.account, authority.wallet] }), q(approved.receipt.block.number)))
        insist(allowance === p.amount, "evidence_unavailable")
        await checkpoint("approval_confirmed", { amount: p.amount, txHash: approved.hash, blockNumber: approved.receipt.block.number, blockHash: approved.receipt.block.hash })
      }
      const deposited = await transaction("deposit", authority.wallet,
        encodeFunctionData({ abi: walletAbi, functionName: "deposit", args: [authority.token, p.amount] }), p.amount, (s, remaining) => currentPolicy(s, false, remaining))
      const proof = await proveDeposit(authority, d, deposited.hash, deposited.expected, p.amount, p.snapshot.gatewayTotalBalance)
      insist(proof !== undefined, "evidence_unavailable")
      await checkpoint("deposit_confirmed", { amount: p.amount, txHash: deposited.hash, blockNumber: proof.block.number, blockHash: proof.block.hash,
        gatewayTotalAfter: p.snapshot.gatewayTotalBalance + p.amount })
      const after = await readSnapshot(authority, d)
      const facts = { ...snapshotFacts(after.snapshot), amount: p.amount, txHash: deposited.hash,
        availableBefore: p.snapshot.available, gatewayTotalBefore: p.snapshot.gatewayTotalBalance }
      // Pending-only Gateway evidence and available balance cannot attribute a
      // completed credit to this transaction, even when available increased.
      await checkpoint("credit_pending", facts)
      return publicResult("credit_pending", { ...base, ...facts })
    }

    const execute = (kind: "deposit" | "withdrawal", work: () => Promise<FundingPublicOutcome>): Promise<FundingPublicOutcome> => {
      if (attempted || closed || closing || request.kind !== kind) return Promise.resolve(publicResult("refused", base, "operation_consumed"))
      attempted = true // Before asynchronous evaluation: calls cannot race for a second attempt.
      owner = work().then(result => { state = result; return result }, settleFailure)
      return owner
    }
    const operation: FundingOperation = Object.freeze({
      executeDepositOnce: () => execute("deposit", deposit),
      requestWithdrawalOnce: () => execute("withdrawal", withdrawal),
      mintWithdrawalOnce: () => {
        if (mintAttempted || request.kind !== "withdrawal" || state?.status !== "mint_ready" || uncertain || closed || closing || !capability)
          return Promise.resolve(publicResult("refused", base, "operation_consumed"))
        mintAttempted = true
        owner = mint().then(result => { state = result; return result }, settleFailure)
        return owner
      },
      async reconcileOperationReadOnly() {
        if (!journal || owner && state === undefined) return publicResult("refused", base, "operation_consumed")
        if (!closed && !closing && capability && !journal.snapshot().events.some(row => row.event === "mint_prepared")) {
          // Read-only inspection never replaces the retained capability, changes
          // the public state/uncertainty latch, appends, signs or advances mint.
          try {
            const held = capability, current = await readSnapshot(authority, d, true)
            insist(JSON.stringify(current.identity) === JSON.stringify(initialIdentity), "deployment_identity_unavailable")
            const reply = own(await bounded(signal => d.gateway(`/v1/transfer/${held.id}`, "GET", undefined, signal), d),
              ["destinationDomain", "status", "burnIntents", "transactionHash", "forwardingDetails", "fees", "attestation"])
            insist(reply.destinationDomain === authority.domain && ["pending", "confirmed", "finalized"].includes(reply.status as string), "evidence_unavailable")
            const forwarding = own(reply.forwardingDetails, ["forwardingEnabled"])
            insist(forwarding.forwardingEnabled === false && Array.isArray(reply.burnIntents) && reply.burnIntents.length === 1, "evidence_unavailable")
            const summary = own(reply.burnIntents[0], ["transferSpecHash", "maxBlockHeight", "maxFee"])
            const specHash = hashTransferSpec(held.intent.spec)
            insist(nonzeroHash(summary.transferSpecHash) === specHash && fundingUint(summary.maxBlockHeight) === held.intent.maxBlockHeight &&
              fundingUint(summary.maxFee) === held.intent.maxFee, "evidence_unavailable")
            const attestation = own(reply.attestation, ["payload", "signature", "expirationBlock"])
            const payload = attestationBytes(attestation.payload), signature = canonicalSignature(attestation.signature)
            insist(payload === held.payload && signature === held.signature, "evidence_unavailable")
            const bound = decodeAndBindWithdrawalAttestation(payload, held.intent.spec, current.snapshot.sourceBlock)
            insist(fundingUint(attestation.expirationBlock) === bound.maxBlockHeight && fees(reply.fees, specHash, held.intent.maxFee) === held.actualFee, "evidence_unavailable")
            const attester = await validateAttester(authority, d, bound.attesterMessageHash, signature, current.snapshot)
            const txHash = reply.status === "pending" ? undefined : nonzeroHash(reply.transactionHash)
            insist(reply.status !== "pending" || !Object.hasOwn(reply, "transactionHash"), "evidence_unavailable")
            return publicResult("observed", { ...base, amount: held.intent.spec.value, specHash, payloadHash: bound.payloadHash, actualFee: held.actualFee,
              attester, ...(txHash === undefined ? {} : { txHash }) })
          } catch (error) { return publicResult("uncertain", base, fixedError(error, "evidence_unavailable").code) }
        }
        return reconcileFundingOperation({ authority, journalPath }, d)
      },
      publicState: () => state,
      close() {
        if (closePromise) return closePromise
        closing = true
        // Close never retires the active claim or triggers another stage.
        closePromise = (async () => {
          const cleanup = { signal: new AbortController().signal, deadlineMs: d.now() + 1500, now: d.now }
          let failed = false
          try {
            try { if (owner) await bounded(() => owner!.then(() => {}), cleanup, 1000) } catch { failed = true }
            try { if (opening) await bounded(() => opening!.then(() => {}, () => {}), cleanup, 1000) } catch { failed = true }
            try { if (journal) await bounded(() => journal!.close(), cleanup, 1000) } catch { failed = true }
          } finally { closed = true; capability = undefined; signer = undefined }
          insist(!failed && !lateCleanupFailed, "journal_unavailable")
        })()
        return closePromise
      }
    })
    // Function declarations retain the private capability, never the facade.
    async function withdrawal(): Promise<FundingPublicOutcome> {
      const p = await start(); insist(p.kind === "withdrawal", "configuration_invalid")
      const salt = keccak256(stringToHex(`arcade-funding-withdrawal:${digest}`))
      const spec = captureTransferSpec({ version: 1, sourceDomain: 26, destinationDomain: 26,
        sourceContract: authority.wallet, destinationContract: authority.minter, sourceToken: authority.token, destinationToken: authority.token,
        sourceDepositor: authority.account, destinationRecipient: authority.account, sourceSigner: authority.account, destinationCaller: ZERO,
        value: p.amount, salt, hookData: "0x" }, authority)
      const intent = captureBurnIntent({ maxBlockHeight: p.maxBlockHeight, maxFee: p.maxFee, spec }, authority)
      const fresh = await recheck(true)
      validateBurnHeight(p.maxBlockHeight, fresh.sourceBlock, fresh.withdrawalDelay!, p.request.maxBurnBlockDelta)
      insist(fresh.available >= p.amount + p.maxFee && fresh.walletNativeBalance >= p.request.gasCapWei, "policy_refused")
      const typed = burnIntentTypedData(intent, authority), specHash = hashTransferSpec(spec)
      await checkpoint("burn_authorization_prepared", { amount: p.amount, maxFee: p.maxFee, maxBlockHeight: p.maxBlockHeight, specHash, signerEntered: true })
      entered = true
      const account = await ensureSigner(); active()
      const beforeSign = await recheck(true)
      validateBurnHeight(p.maxBlockHeight, beforeSign.sourceBlock, beforeSign.withdrawalDelay!, p.request.maxBurnBlockDelta)
      insist(beforeSign.available >= p.amount + p.maxFee && beforeSign.walletNativeBalance >= p.request.gasCapWei, "policy_refused")
      active()
      const signature = canonicalSignature(await bounded(signal => account.signTypedData(typed, signal), d))
      active(); insist((await recoverTypedDataAddress({ ...typed, signature })).toLowerCase() === authority.account, "evidence_unavailable")
      const beforeSend = await recheck(true)
      validateBurnHeight(p.maxBlockHeight, beforeSend.sourceBlock, beforeSend.withdrawalDelay!, p.request.maxBurnBlockDelta)
      insist(beforeSend.available >= p.amount + p.maxFee && beforeSend.walletNativeBalance >= p.request.gasCapWei, "policy_refused")
      await checkpoint("normal_transfer_requested", { amount: p.amount, specHash, submitted: true })
      active()
      // The UUID, signature and attestation are capabilities: only this closure retains them.
      const body = JSON.stringify([{ burnIntent: typed.message, signature }], (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value)
      const reply = own(await bounded(signal => d.normalTransferPost(body, signal), d))
      active()
      const id = transferId(reply.transferId), payload = attestationBytes(reply.attestation), attesterSignature = canonicalSignature(reply.signature)
      const latest = await recheck(true), bound = decodeAndBindWithdrawalAttestation(payload, spec, latest.sourceBlock)
      insist(fundingUint(reply.expirationBlock) === bound.maxBlockHeight, "evidence_unavailable")
      const actualFee = fees(reply.fees, specHash, p.maxFee)
      const attester = await validateAttester(authority, d, bound.attesterMessageHash, attesterSignature, latest)
      capability = Object.freeze({ id, payload, signature: attesterSignature, intent, actualFee })
      await checkpoint("attestation_validated", { amount: p.amount, specHash, payloadHash: bound.payloadHash, attester, actualFee })
      return publicResult("mint_ready", { ...base, amount: p.amount, specHash, payloadHash: bound.payloadHash, actualFee })
    }
    async function mint(): Promise<FundingPublicOutcome> {
      active(); insist(capability && plan?.kind === "withdrawal", "operation_consumed")
      const held = capability, p = plan
      const checkMint = async (s: FundingSnapshot, remainingGas: bigint) => {
        const bound = decodeAndBindWithdrawalAttestation(held.payload, held.intent.spec, s.sourceBlock)
        insist(s.walletNativeBalance >= remainingGas, "policy_refused")
        await validateAttester(authority, d, bound.attesterMessageHash, held.signature, s)
      }
      const fresh = await recheck(true), bound = decodeAndBindWithdrawalAttestation(held.payload, held.intent.spec, fresh.sourceBlock)
      await validateAttester(authority, d, bound.attesterMessageHash, held.signature, fresh)
      const sent = await transaction("mint", authority.minter,
        encodeFunctionData({ abi: minterAbi, functionName: "gatewayMint", args: [held.payload, held.signature] }), p.amount, checkMint)
      insist(sent.receipt !== undefined, "evidence_unavailable")
      await proveDelivery(authority, d, sent.receipt, held.intent.spec)
      await checkpoint("delivery_confirmed", { amount: p.amount, txHash: sent.hash, blockNumber: sent.receipt.block.number,
        blockHash: sent.receipt.block.hash, specHash: bound.specHash, actualFee: held.actualFee })
      const debit = await proveSourceDebit(authority, d, held.intent.spec, held.actualFee, p.snapshot.sourceBlock)
      if (!debit) return publicResult("source_debit_pending", { ...base, amount: p.amount, txHash: sent.hash, specHash: bound.specHash, actualFee: held.actualFee })
      await checkpoint("source_debit_reconciled", { amount: p.amount, txHash: sent.hash, specHash: bound.specHash,
        sourceTxHash: debit.txHash, sourceBlockHash: debit.block.hash, actualFee: held.actualFee, terminalKind: "withdrawal_complete" })
      return publicResult("confirmed", { ...base, amount: p.amount, txHash: sent.hash, specHash: bound.specHash,
        sourceTxHash: debit.txHash, actualFee: held.actualFee, terminalKind: "withdrawal_complete" })
    }
    return operation
  } catch (error) { throw fixedError(error, "configuration_invalid") }
}

const transferId = (value: unknown): string => {
  insist(typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value), "evidence_unavailable")
  return value
}
const attestationBytes = (value: unknown): Hex => {
  insist(typeof value === "string" && (value.length === 762 || value.length === 778), "evidence_unavailable")
  return hex(value, (value.length - 2) / 2)
}
function fees(input: unknown, specHash: Hex, maxFee: bigint): bigint {
  const r = own(input, ["token", "total", "perIntent", "forwardingFee"])
  insist(r.token === "USDC" && Array.isArray(r.perIntent) && r.perIntent.length === 1, "evidence_unavailable")
  const fee = own(r.perIntent[0], ["transferSpecHash", "domain", "baseFee", "transferFee"])
  insist(nonzeroHash(fee.transferSpecHash) === specHash && fee.domain === 26, "evidence_unavailable")
  const total = parseFundingAmount(r.total), base = parseFundingAmount(fee.baseFee)
  // Same-chain transferFee is explicitly optional in the retained normal API.
  const transfer = Object.hasOwn(fee, "transferFee") ? parseFundingAmount(fee.transferFee) : 0n
  insist(total === base + transfer && total <= maxFee &&
    (!Object.hasOwn(r, "forwardingFee") || parseFundingAmount(r.forwardingFee) === 0n), "evidence_unavailable")
  return total
}
async function validateAttester(a: FundingAuthority, d: FundingDependencies, messageHash: Hex, signature: Hex, snapshot: FundingSnapshot): Promise<Hex> {
  const attester = (await recoverAddress({ hash: messageHash, signature: canonicalSignature(signature) })).toLowerCase() as Hex
  const tag = q(snapshot.sourceBlock)
  insist(wordUint(await call(d, a.minter, encodeFunctionData({ abi: minterAbi, functionName: "isAttestationSigner", args: [attester] }), tag)) === 1n,
    "evidence_unavailable")
  const mintAuthority = hex(await call(d, a.minter, encodeFunctionData({ abi: minterAbi, functionName: "tokenMintAuthority", args: [a.token] }), tag), 32)
  // No trusted source identity for an arbitrary configured external mint hook.
  insist(mintAuthority === padHex(ZERO, { size: 32 }), "evidence_unavailable")
  const permissionAbi = parseAbi(["function isMinter(address account) view returns(bool)"])
  insist(wordUint(await call(d, a.token, encodeFunctionData({ abi: permissionAbi, functionName: "isMinter", args: [a.minter] }), tag)) === 1n,
    "evidence_unavailable")
  const block = decodeBlock(await rpc(d, "eth_getBlockByNumber", [tag, false]), d, false)
  insist(block.number === snapshot.sourceBlock && block.hash === snapshot.sourceBlockHash, "evidence_unavailable")
  return attester
}
async function proveDelivery(a: FundingAuthority, d: FundingDependencies, receipt: ReceiptEvidence, spec: TransferSpec) {
  await identities(d, a, receipt.block, true)
  exactTokenEffect(receipt, a.token, TRANSFER, ZERO, a.account, spec.value)
  const rows = receipt.logs.filter(log => hex(log.address, 20) === a.minter && Array.isArray(log.topics) && log.topics[0] === ATTESTATION_USED)
  insist(rows.length === 1, "evidence_unavailable")
  const row = rows[0]!, topics = row.topics as unknown[]
  insist(topics.length === 4 && hex(topics[1], 32) === padHex(a.token, { size: 32 }) &&
    hex(topics[2], 32) === padHex(a.account, { size: 32 }) && nonzeroHash(topics[3]) === hashTransferSpec(spec), "evidence_unavailable")
  const data = hex(row.data, 128)
  insist(data === `0x${26n.toString(16).padStart(64, "0")}${padHex(a.account, { size: 32 }).slice(2)}${padHex(a.account, { size: 32 }).slice(2)}${spec.value.toString(16).padStart(64, "0")}`, "evidence_unavailable")
}
async function proveSourceDebit(a: FundingAuthority, d: FundingDependencies, spec: TransferSpec, actualFee: bigint, firstBlock: bigint): Promise<{ readonly txHash: Hex; readonly block: Block } | undefined> {
  const finalized = await checkedBlock(d)
  if (finalized.number < firstBlock || finalized.number - firstBlock > 10_000n) return undefined
  const topics = [GATEWAY_BURNED, padHex(a.token, { size: 32 }), padHex(a.account, { size: 32 }), hashTransferSpec(spec)]
  const logs = await rpc(d, "eth_getLogs", [{ address: a.wallet, fromBlock: q(firstBlock), toBlock: q(finalized.number), topics }])
  insist(Array.isArray(logs) && logs.length <= 64, "evidence_unavailable")
  if (logs.length === 0) return undefined
  insist(logs.length === 1, "evidence_unavailable")
  const row = own(logs[0]), txHash = nonzeroHash(row.transactionHash), blockNumber = quantity(row.blockNumber), blockHash = nonzeroHash(row.blockHash)
  insist(row.removed === false && hex(row.address, 20) === a.wallet && Array.isArray(row.topics) && row.topics.length === 4 &&
    row.topics.every((value: unknown, index: number) => hex(value, 32) === topics[index]), "evidence_unavailable")
  const data = hex(row.data, 224), words = Array.from({ length: 7 }, (_, index) => `0x${data.slice(2 + index * 64, 66 + index * 64)}` as Hex)
  insist(BigInt(words[0]!) === 26n && words[1] === padHex(a.account, { size: 32 }) && words[2] === padHex(a.account, { size: 32 }) &&
    BigInt(words[3]!) === spec.value && BigInt(words[4]!) === actualFee && BigInt(words[5]!) + BigInt(words[6]!) === spec.value + actualFee,
  "evidence_unavailable")
  const receipt = own(await rpc(d, "eth_getTransactionReceipt", [txHash]))
  insist(receipt.status === "0x1" && nonzeroHash(receipt.transactionHash) === txHash && hex(receipt.to, 20) === a.wallet &&
    quantity(receipt.blockNumber) === blockNumber && nonzeroHash(receipt.blockHash) === blockHash && Array.isArray(receipt.logs) && receipt.logs.length <= 128,
  "evidence_unavailable")
  const insufficient = eventTopic("InsufficientBalance(address,address,uint256,uint256,uint256)")
  const matching = receipt.logs.filter((value: unknown) => {
    const log = own(value)
    insist(log.removed === false && nonzeroHash(log.transactionHash) === txHash && nonzeroHash(log.blockHash) === blockHash && quantity(log.blockNumber) === blockNumber, "evidence_unavailable")
    if (hex(log.address, 20) !== a.wallet) return false
    insist(Array.isArray(log.topics), "evidence_unavailable")
    insist(log.topics[0] !== insufficient, "evidence_unavailable")
    return log.topics.length === 4 && log.topics.every((topic: unknown, index: number) => hex(topic, 32) === topics[index]) && hex(log.data, 224) === data && quantity(log.logIndex) === quantity(row.logIndex)
  })
  insist(matching.length === 1, "evidence_unavailable")
  const transaction = own(await rpc(d, "eth_getTransactionByHash", [txHash]))
  insist(nonzeroHash(transaction.hash) === txHash && hex(transaction.to, 20) === a.wallet && quantity(transaction.chainId) === 5042002n &&
    quantity(transaction.value) === 0n && nonzeroHash(transaction.blockHash) === blockHash && quantity(transaction.blockNumber) === blockNumber, "evidence_unavailable")
  const block = decodeBlock(await rpc(d, "eth_getBlockByNumber", [q(blockNumber), false]), d, false)
  insist(block.number === blockNumber && block.hash === blockHash && blockNumber >= firstBlock && blockNumber <= finalized.number, "evidence_unavailable")
  await identities(d, a, block, false)
  return Object.freeze({ txHash, block })
}
function specForJournal(journal: FundingJournalSnapshot): TransferSpec {
  const a = journal.authority
  insist(journal.request.kind === "withdrawal", "evidence_unavailable")
  return captureTransferSpec({ version: 1, sourceDomain: 26, destinationDomain: 26, sourceContract: a.wallet, destinationContract: a.minter,
    sourceToken: a.token, destinationToken: a.token, sourceDepositor: a.account, destinationRecipient: a.account, sourceSigner: a.account,
    destinationCaller: ZERO, value: journal.request.amount, salt: keccak256(stringToHex(`arcade-funding-withdrawal:${journal.operationDigest}`)), hookData: "0x" }, a)
}
function stageFromJournal(journal: FundingJournalSnapshot, stage: "deposit" | "mint") {
  const intent = journal.events.find(event => event.event === `${stage}_intent`), prepared = journal.events.find(event => event.event === `${stage}_prepared`)
  insist(intent !== undefined && prepared !== undefined, "evidence_unavailable")
  const facts = prepared.facts, txHash = nonzeroHash(facts.txHash)
  const expected: ExpectedTransaction = { to: stage === "deposit" ? journal.authority.wallet : journal.authority.minter,
    calldataHash: nonzeroHash(facts.calldataHash), nonce: fundingUint(facts.nonce), gas: fundingUint(facts.gas, true),
    maxFeePerGas: fundingUint(facts.maxFeePerGas, true), maxPriorityFeePerGas: fundingUint(facts.maxPriorityFeePerGas) }
  insist(expected.gas * expected.maxFeePerGas <= journal.request.gasCapWei, "evidence_unavailable")
  return { txHash, expected }
}
async function reconcileSnapshot(journal: FundingJournalSnapshot, d: FundingDependencies): Promise<FundingPublicOutcome> {
  const base: FundingPublicFacts = { operationId: journal.operationId, operationDigest: journal.operationDigest,
    account: journal.authority.account, network: journal.authority.network, kind: journal.request.kind }
  const last = journal.events.at(-1), planned = journal.events.find(event => event.event === "planned")
  if (last?.event === "refused") return publicResult("refused", { ...base, ...last.facts }, last.facts.failureCode ?? "policy_refused")
  if (last?.event === "noop") {
    insist(journal.request.kind === "deposit" && journal.request.mode === "target" && planned?.facts.amount === 0n &&
      planned.facts.availableBefore !== undefined && planned.facts.availableBefore >= journal.request.minimumAvailable, "evidence_unavailable")
    return publicResult("noop", { ...base, ...last.facts, terminalKind: "noop" })
  }
  insist(planned !== undefined, "evidence_unavailable")
  const a = journal.authority, current = await readSnapshot(a, d, journal.request.kind === "withdrawal")
  if (journal.request.kind === "deposit") {
    const amount = fundingUint(planned.facts.amount, true), totalBefore = fundingUint(planned.facts.gatewayTotalBefore)
    const known = stageFromJournal(journal, "deposit")
    insist(known.expected.calldataHash === keccak256(encodeFunctionData({ abi: walletAbi, functionName: "deposit", args: [a.token, amount] })), "evidence_unavailable")
    const proof = await proveDeposit(a, d, known.txHash, known.expected, amount, totalBefore)
    if (!proof) return publicResult("uncertain", { ...base, txHash: known.txHash }, "operation_uncertain")
    // Retained /v1/deposits only lists pending rows; disappearance and an available
    // balance increase do NOT prove this transaction's completed API credit.
    return publicResult("credit_pending", { ...base, ...snapshotFacts(current.snapshot), amount, txHash: known.txHash,
      availableBefore: fundingUint(planned.facts.availableBefore), gatewayTotalBefore: totalBefore })
  }
  const known = stageFromJournal(journal, "mint"), spec = specForJournal(journal)
  const fee = journal.events.find(event => event.event === "attestation_validated")?.facts.actualFee
  const actualFee = fundingUint(fee), firstBlock = fundingUint(planned.facts.blockNumber)
  insist(actualFee <= journal.request.maxFee, "evidence_unavailable")
  const receipt = await proveTransaction(a, d, known.txHash, known.expected)
  if (!receipt) return publicResult("uncertain", { ...base, txHash: known.txHash }, "operation_uncertain")
  await proveDelivery(a, d, receipt, spec)
  const debit = await proveSourceDebit(a, d, spec, actualFee, firstBlock)
  if (!debit) return publicResult("source_debit_pending", { ...base, txHash: known.txHash, amount: spec.value, specHash: hashTransferSpec(spec), actualFee })
  return publicResult("confirmed", { ...base, txHash: known.txHash, amount: spec.value, specHash: hashTransferSpec(spec), actualFee,
    sourceTxHash: debit.txHash, sourceBlockHash: debit.block.hash, terminalKind: "withdrawal_complete" })
}
export async function reconcileFundingOperation(input: FundingJournalRead, dependencies: FundingDependencies): Promise<FundingPublicOutcome> {
  try {
    const raw = own(input, ["authority", "journalPath"]), authority = validateFundingAuthority(raw.authority), d = captureDependencies(dependencies)
    insist(typeof raw.journalPath === "string", "configuration_invalid"); check(d)
    const journal = await bounded(() => readFundingJournal({ authority, journalPath: raw.journalPath as string }, d.journalIO), d)
    return await reconcileSnapshot(journal, d)
  } catch (error) { return publicResult("uncertain", {}, fixedError(error, "journal_unavailable").code) }
}
export async function finalizeFundingOperation(input: FundingJournalRead, dependencies: FundingDependencies): Promise<FundingPublicOutcome> {
  try {
    const raw = own(input, ["authority", "journalPath"]), authority = validateFundingAuthority(raw.authority), d = captureDependencies(dependencies)
    insist(typeof raw.journalPath === "string", "configuration_invalid"); check(d)
    let observed: FundingPublicOutcome | undefined
    await bounded(() => finalizeFundingJournal({ authority, journalPath: raw.journalPath as string }, async journal => {
      check(d)
      const last = journal.events.at(-1)
      if (last?.event === "refused") {
        insist(last.facts.terminalKind === "unsigned_refusal" && last.facts.signerEntered === false && last.facts.submitted === false &&
          last.facts.failureCode !== undefined, "evidence_unavailable")
        observed = publicResult("confirmed", { operationId: journal.operationId, operationDigest: journal.operationDigest, terminalKind: "unsigned_refusal" })
      } else {
        observed = await reconcileSnapshot(journal, d)
        insist(observed.status === "noop" || observed.status === "confirmed", "evidence_unavailable")
        // No current documented completed-credit attribution predicate exists.
        insist(observed.facts.terminalKind === "noop" || observed.facts.terminalKind === "withdrawal_complete", "evidence_unavailable")
      }
      check(d)
      return captureFundingPublicEvent({ event: "finalized", facts: observed.facts })
    }, d.journalIO), d)
    insist(observed !== undefined, "journal_unavailable")
    return observed
  } catch (error) { return publicResult("refused", {}, fixedError(error, "journal_unavailable").code) }
}
