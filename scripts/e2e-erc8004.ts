import { spawn, type ChildProcess } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { decodeEventLog, decodeFunctionResult, encodeEventTopics, encodeFunctionData, keccak256, parseAbi, toHex, type Abi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI, VALIDATION_REGISTRY_ABI,
  buildAgentRegistration, buildValidationRequest, buildValidationResponse, buildFeedback, docBytes,
  loadChainConfig, treeHashOf } from "@arcade/core"

// Arc deployment/signatures are pinned in packages/core/src/erc8004.ts. Importing this
// module performs no I/O. Only the explicit live entry point consumes supplied keys.
const ROOT = fileURLToPath(new URL("../", import.meta.url))
const RPC = "https://rpc.testnet.arc.io", SKILL = "usdc-flow-check", CHAIN_ID = 5042002
const USDC = "0x3600000000000000000000000000000000000000"
const registries = loadChainConfig("arc-testnet").erc8004!
const roles = ["seller", "buyer", "facilitator", "operator", "validator", "attester"] as const
type Role = typeof roles[number]
type Hex = `0x${string}`
const address = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v)
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v)
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase()
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v)
class EvidenceError extends Error {}
function insist(ok: unknown, message: string): asserts ok { if (!ok) throw new EvidenceError(message) }
function record(v: unknown, why: string): Record<string, unknown> { insist(object(v), why); return v }
const digest = (bytes: string) => keccak256(toHex(bytes))
const atomic = (v: unknown): bigint => {
  const raw = object(v) ? v["__bigint"] : v
  insist(typeof raw === "bigint" || typeof raw === "string" && /^(0|[1-9][0-9]{0,77})$/.test(raw), "invalid evidence amount")
  return BigInt(raw)
}
const quantity = (v: unknown): bigint => {
  insist(typeof v === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(v), "invalid chain quantity")
  return BigInt(v)
}
export type EvidenceConfig = Readonly<Record<Role, string>> & {
  readonly keys: Readonly<Record<Role, string>>; readonly splitter: string; readonly rpcUrl: string; readonly skillId: string
}
export const readEvidenceConfig = (env: Record<string, string | undefined>, consent?: string): EvidenceConfig => {
  insist(env["ARCADE_NETWORK"] === undefined || env["ARCADE_NETWORK"] === "arc-testnet", "only Arc testnet is permitted")
  insist(env["ARCADE_RAIL"] === undefined || env["ARCADE_RAIL"] === "eip3009", "a real eip3009 rail is required")
  insist(env["ARCADE_RPC_URL"] === undefined || env["ARCADE_RPC_URL"] === RPC, "the canonical Arc testnet RPC is required")
  insist(env["SKILL"] === undefined && env["INPUT"] === undefined, "arbitrary SKILL/INPUT overrides are refused; this is one fixed $0.01 flow-check")
  const keys = {} as Record<Role, string>, accounts = {} as Record<Role, string>
  for (const role of roles) {
    const name = `ARCADE_${role.toUpperCase()}_KEY`, key = env[name]
    insist(key !== undefined && key !== "", `${name} is required; OWNER must supply all six funded roles`)
    try {
      if (!hash(key)) throw new Error()
      accounts[role] = privateKeyToAccount(key).address; keys[role] = key
    } catch { throw new EvidenceError(`${name} is invalid`) }
  }
  insist(new Set(Object.values(accounts).map(v => v.toLowerCase())).size === 6, "all six role addresses must be distinct")
  insist(address(consent) && same(consent, accounts.operator), "explicit --approve-operator ADDRESS must match the operator; approval permits transfer of ALL current and future identity NFTs")
  const splitter = env["ARCADE_FEE_SPLITTER"]
  insist(address(splitter), "ARCADE_FEE_SPLITTER must be this seller's deployed Arc testnet FeeSplitterV2")
  insist(env["SELLER"] === undefined || same(env["SELLER"], accounts.seller), "SELLER does not match the seller role")
  return { ...accounts, keys, splitter, rpcUrl: RPC, skillId: SKILL }
}
export const assertHubEvidence = (c: EvidenceConfig, value: unknown): void => {
  const hub = record(value, "invalid public hub configuration"), r = record(hub["registries"], "hub registries missing")
  insist(hub["armed"] === true && hub["chainId"] === CHAIN_ID && hub["caip2"] === `eip155:${CHAIN_ID}`, "hub is not armed on Arc testnet")
  insist(["operator", "validator", "attester"].every(role => same(hub[role], c[role as Role])), "hub roles do not match the six-role preflight")
  insist(Object.entries(registries).every(([name, value]) => same(r[name], value)), "hub registries are not the pinned Arc deployment")
}
/** Actual types/selectors from contracts/FeeSplitterV2.sol, checked before registration. */
export const assertSplitterEvidence = (c: EvidenceConfig, value: unknown): void => {
  const facts = record(value, "splitter facts missing")
  insist(same(facts["seller"], c.seller) && facts["feeBps"] === 500 && facts["version"] === 2 && same(facts["usdc"], USDC),
    "splitter must be this seller's FeeSplitterV2 with the exact Arc USDC asset and 5% fee")
}
export const assertCommittedBytes = (bytes: string, expectedHash: unknown): void => {
  insist(typeof bytes === "string" && Buffer.byteLength(bytes) <= 1_048_576 && hash(expectedHash), "invalid document commitment")
  try { insist(docBytes(JSON.parse(bytes)) === bytes, "document must use exact compact JSON bytes") }
  catch { throw new EvidenceError("document must use exact compact JSON bytes") }
  insist(same(digest(bytes), expectedHash), "document bytes do not match the on-chain commitment")
}
export interface EvidenceBundle {
  origin: string; startBlock: bigint; chainId: unknown; manifest: unknown; job: unknown; receipt: unknown; agent: unknown
  owner: unknown; tokenURI: unknown; approved: unknown; registrationBytes: string
  requestBytes: string; responseBytes: string; feedbackBytes: string; persistedBytes: Record<string, string>
  registrationReceipt: unknown; approvalReceipt?: unknown; settlementReceipt: unknown
  requestReceipt: unknown; responseReceipt: unknown; feedbackReceipt: unknown
  validationStatus: unknown; feedbackState: unknown
}
const EVENTS = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
  "event Settled(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce)",
  "event SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)"
])
const events = (receipt: Record<string, unknown>, abi: Abi, eventName: string, emitter: string): Record<string, unknown>[] => {
  const logs = receipt["logs"]
  insist(Array.isArray(logs) && logs.length <= 4096, "missing or excessive receipt logs")
  const found: Record<string, unknown>[] = []
  for (const log of logs) {
    if (!object(log) || !same(log["address"], emitter) || log["removed"] === true || !Array.isArray(log["topics"]) || typeof log["data"] !== "string") continue
    try {
      const decoded = decodeEventLog({ abi, topics: log["topics"] as [Hex, ...Hex[]], data: log["data"] as Hex })
      if (decoded.eventName === eventName && object(decoded.args)) found.push(decoded.args)
    } catch { /* unrelated logs are not evidence */ }
  }
  return found
}
const fields = (actual: Record<string, unknown>, expected: Record<string, unknown>) => Object.entries(expected).every(([key, value]) =>
  typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value) ? same(actual[key], value) : actual[key] === value)
const oneEvent = (r: Record<string, unknown>, abi: Abi, name: string, emitter: string, expected: Record<string, unknown>) => {
  const matches = events(r, abi, name, emitter).filter(event => fields(event, expected))
  insist(matches.length === 1, `exactly one matching ${name} event is required`)
  return matches[0]!
}
/** A successful RPC envelope is not proof it answered the requested hash. Apply this to
 * EVERY receipt read, including hashes discovered from registry events, before returning. */
export const assertReceiptCorrelation = (requestedHash: unknown, value: unknown): Record<string, unknown> => {
  const r = record(value, "chain receipt missing")
  insist(hash(requestedHash) && hash(r["transactionHash"]) && same(r["transactionHash"], requestedHash),
    "receipt does not match the requested transaction hash")
  const logs = r["logs"]
  insist(Array.isArray(logs) && logs.length <= 4096, "missing or excessive receipt logs")
  const sameQuantity = (a: unknown, b: unknown) => {
    try { return quantity(a) === quantity(b) } catch { return false }
  }
  for (const raw of logs) {
    const log = record(raw, "invalid receipt log")
    insist((log["removed"] === undefined || log["removed"] === false) &&
      (log["transactionHash"] === undefined || hash(log["transactionHash"]) && same(log["transactionHash"], requestedHash)) &&
      (log["blockNumber"] === undefined || sameQuantity(log["blockNumber"], r["blockNumber"])) &&
      (log["blockHash"] === undefined || hash(log["blockHash"]) && same(log["blockHash"], r["blockHash"])) &&
      (log["transactionIndex"] === undefined || sameQuantity(log["transactionIndex"], r["transactionIndex"])),
      "receipt log is removed or belongs to another transaction/block")
  }
  return r
}
const chainReceipt = (v: unknown, from: string, to: string, startBlock: bigint, expectedHash?: unknown) => {
  const candidate = record(v, "chain receipt missing")
  const r = assertReceiptCorrelation(expectedHash ?? candidate["transactionHash"], candidate)
  insist(r["status"] === "0x1" && hash(r["transactionHash"]) && same(r["from"], from) && same(r["to"], to), "chain receipt has wrong status, sender or contract")
  insist(expectedHash === undefined || same(r["transactionHash"], expectedHash), "chain receipt has wrong transaction hash")
  scanRange(startBlock, quantity(r["blockNumber"]))
  return r
}
/** Verify identity independently BEFORE the one paid purchase, and again in final proof. */
export const assertIdentityEvidence = (c: EvidenceConfig, e: Pick<EvidenceBundle, "chainId" | "origin" | "startBlock" |
  "agent" | "manifest" | "registrationBytes" | "owner" | "tokenURI" | "approved" | "registrationReceipt" | "approvalReceipt">) => {
  insist(quantity(e.chainId) === BigInt(CHAIN_ID), "RPC is not Arc testnet")
  insist(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(e.origin) && Number(new URL(e.origin).port) <= 65535, "evidence origin must be its actual bound loopback port")
  const a = record(e.agent, "recorded agent missing"), m = record(e.manifest, "manifest missing")
  const agentId = a["agentId"]
  insist(typeof agentId === "string" && /^(0|[1-9][0-9]{0,77})$/.test(agentId) && BigInt(agentId) < 2n ** 256n, "agent id is not a canonical uint256")
  const agentURI = `${e.origin}/listings/${SKILL}/agent-registration.json`
  insist(a["chainId"] === CHAIN_ID && same(a["registry"], registries.identity) && a["agentURI"] === agentURI &&
    same(a["operator"], c.operator) && same(e.owner, c.seller) && e.tokenURI === agentURI && e.approved === true, "mint ownership, token URI, provenance or operator approval does not match")
  insist(hash(a["registrationTx"]), "registration hash missing")
  const mint = chainReceipt(e.registrationReceipt, c.seller, registries.identity, e.startBlock, a["registrationTx"])
  oneEvent(mint, IDENTITY_REGISTRY_ABI, "Registered", registries.identity, { agentId: BigInt(agentId), owner: c.seller, agentURI })
  oneEvent(mint, IDENTITY_REGISTRY_ABI, "Transfer", registries.identity, { from: `0x${"0".repeat(40)}`, to: c.seller, tokenId: BigInt(agentId) })
  if (a["approvalTx"] !== undefined) {
    insist(hash(a["approvalTx"]), "invalid recorded approval hash")
    oneEvent(chainReceipt(e.approvalReceipt, c.seller, registries.identity, e.startBlock, a["approvalTx"]), EVENTS,
      "ApprovalForAll", registries.identity, { owner: c.seller, operator: c.operator, approved: true })
  } else insist(e.approvalReceipt === undefined, "unexpected approval receipt")
  insist(m["id"] === SKILL && m["price"] === "$0.01" && typeof m["version"] === "string" &&
    typeof m["serviceName"] === "string" && typeof m["description"] === "string", "canonical $0.01 listing changed")
  const registration = buildAgentRegistration({ origin: e.origin, skillId: SKILL, serviceName: m["serviceName"], description: m["description"],
    seller: c.seller, chainId: CHAIN_ID, identityRegistry: registries.identity, agentId, active: true })
  insist(e.registrationBytes === docBytes(registration), "registration document differs from the live listing or advertises extra endpoints")
  return { agentId, registrationTx: a["registrationTx"] }
}
/** Chain receipts/state + exact durable/served commitments. Cached hub counts or log
 * lines never turn an incomplete run into PASS. Returned evidence has no job payloads. */
export const assertErc8004Evidence = (c: EvidenceConfig, e: EvidenceBundle) => {
  const { agentId, registrationTx } = assertIdentityEvidence(c, e)
  const r = record(e.receipt, "durable receipt missing"), j = record(e.job, "durable job missing"), m = record(e.manifest, "manifest missing")
  const outcome = record(j["outcome"], "job outcome missing"), jobId = r["jobId"]
  insist(typeof jobId === "string" && /^job_[a-zA-Z0-9]{16,}$/.test(jobId), "invalid job identity")
  insist(typeof m["version"] === "string", "invalid skill version")
  insist(r["skillId"] === SKILL && r["skillVersion"] === m["version"] && r["settled"] === true && r["canary"] !== true &&
    r["rail"] === "eip3009" && r["network"] === `eip155:${CHAIN_ID}` && same(r["buyer"], c.buyer) && same(r["seller"], c.seller) && hash(r["settleTx"]), "receipt does not describe this real buyer purchase")
  insist(atomic(r["priceAtomic"]) === 10000n && atomic(r["sellerAtomic"]) === 9500n && atomic(r["feeAtomic"]) === 500n && r["feeBps"] === 500, "receipt does not prove the exact $0.01 / 5% split")
  insist(j["id"] === jobId && j["skillId"] === SKILL && j["status"] === "succeeded" && outcome["status"] === "succeeded" &&
    same(j["buyer"], c.buyer) && same(j["seller"], c.seller) && docBytes(j["input"]) === docBytes({ address: c.buyer }), "durable job does not match the single requested flow-check")
  // The receipt records an empty tree locally. The paid pipeline calls V2 settle()
  // for this childless job, so its on-chain proof is Settled, not a tree commitment.
  insist(r["rootJobId"] === jobId && r["parentJobId"] === undefined && r["hop"] === 0 &&
    Array.isArray(r["ancestors"]) && r["ancestors"].length === 0 && Array.isArray(r["children"]) && r["children"].length === 0 &&
    same(r["treeHash"], treeHashOf(jobId, [])) && atomic(r["treeCommittedAtomic"]) === 0n && hash(r["authorizationNonce"]),
    "receipt must describe the exact childless job")
  const settlement = chainReceipt(e.settlementReceipt, c.facilitator, c.splitter, e.startBlock, r["settleTx"])
  oneEvent(settlement, EVENTS, "Transfer", USDC, { from: c.buyer, to: c.splitter, value: 10000n })
  oneEvent(settlement, EVENTS, "Transfer", USDC, { from: c.splitter, to: c.seller, value: 9500n })
  insist(events(settlement, EVENTS, "SettledTree", c.splitter).length === 0, "childless settlement must not emit SettledTree")
  oneEvent(settlement, EVENTS, "Settled", c.splitter, { buyer: c.buyer, total: 10000n, sellerAmount: 9500n, feeAmount: 500n,
    nonce: r["authorizationNonce"] })
  const at = r["createdAtMs"]
  insist(typeof at === "number" && Number.isSafeInteger(at) && at >= 0, "invalid receipt timestamp")
  insist(outcome["stopReason"] === undefined || typeof outcome["stopReason"] === "string", "invalid job stop reason")
  const input = { origin: e.origin, jobId, agentId, skillId: SKILL, skillVersion: m["version"], input: j["input"], output: outcome["output"],
    outputSchema: m["outputSchema"], status: "succeeded", stopReason: outcome["stopReason"], settled: true, reason: "ok",
    priceAtomic: 10000n, settleTx: r["settleTx"], createdAtMs: at, seller: c.seller, buyer: c.buyer, payTo: c.splitter,
    chainId: CHAIN_ID, identityRegistry: registries.identity }
  const requestBytes = docBytes(buildValidationRequest(input)), requestHash = digest(requestBytes)
  const responseBytes = docBytes(buildValidationResponse({ ...input, requestHash, decidedAtMs: at })), responseHash = digest(responseBytes)
  const feedback = buildFeedback({ ...input, attester: c.attester }), feedbackBytes = docBytes(feedback), feedbackHash = digest(feedbackBytes)
  for (const [kind, actual, expected] of [["validation-request", e.requestBytes, requestBytes],
    ["validation-response", e.responseBytes, responseBytes], ["feedback", e.feedbackBytes, feedbackBytes]]) {
    insist(actual === expected && e.persistedBytes[kind!] === actual, "served/durable document bytes differ from the actual paid job")
    assertCommittedBytes(actual!, digest(expected!))
  }
  const request = chainReceipt(e.requestReceipt, c.operator, registries.validation, e.startBlock)
  const response = chainReceipt(e.responseReceipt, c.validator, registries.validation, e.startBlock)
  const feedbackReceipt = chainReceipt(e.feedbackReceipt, c.attester, registries.reputation, e.startBlock)
  oneEvent(request, VALIDATION_REGISTRY_ABI, "ValidationRequest", registries.validation, {
    validatorAddress: c.validator, agentId: BigInt(agentId), requestHash, requestURI: `${e.origin}/receipts/${jobId}/validation-request.json` })
  oneEvent(response, VALIDATION_REGISTRY_ABI, "ValidationResponse", registries.validation, {
    validatorAddress: c.validator, agentId: BigInt(agentId), requestHash, response: 100, responseHash,
    responseURI: `${e.origin}/receipts/${jobId}/validation-response.json`, tag: "arcade-settle" })
  const feedbackEvent = oneEvent(feedbackReceipt, REPUTATION_REGISTRY_ABI, "NewFeedback", registries.reputation, {
    agentId: BigInt(agentId), clientAddress: c.attester, value: 1n, valueDecimals: 0, tag1: "arcade-settled", tag2: SKILL,
    endpoint: feedback.endpoint, feedbackURI: `${e.origin}/receipts/${jobId}/feedback.json`, feedbackHash })
  const status = e.validationStatus, state = e.feedbackState
  insist(Array.isArray(status) && status.length === 6 && same(status[0], c.validator) && status[1] === BigInt(agentId) &&
    status[2] === 100 && same(status[3], responseHash) && status[4] === "arcade-settle" && typeof status[5] === "bigint" && status[5] > 0n, "current validation status does not match this exact commitment")
  insist(Array.isArray(state) && state.length === 7 && state.every(column => Array.isArray(column) && column.length === 1) &&
    same(state[0][0], c.attester) && state[1][0] === feedbackEvent["feedbackIndex"] && state[2][0] === 1n && state[3][0] === 0 &&
    state[4][0] === "arcade-settled" && state[5][0] === SKILL && state[6][0] === false, "current exact-agent feedback does not match the attester event")
  const hashes = [registrationTx, r["settleTx"], request["transactionHash"], response["transactionHash"], feedbackReceipt["transactionHash"]]
  insist(new Set(hashes.map(v => String(v).toLowerCase())).size === 5, "distinct registry/payment transactions are required")
  return { agentId, jobId, network: `eip155:${CHAIN_ID}`, seller: c.seller, buyer: c.buyer, facilitator: c.facilitator,
    operator: c.operator, validator: c.validator, attester: c.attester, splitter: c.splitter,
    registrationTx, settlementTx: r["settleTx"], requestTx: request["transactionHash"],
    responseTx: response["transactionHash"], feedbackTx: feedbackReceipt["transactionHash"], requestHash, responseHash, feedbackHash }
}
export const scanRange = (from: bigint, to: bigint) => {
  insist(from > 0n && to >= from && to - from < 2048n, "event range exceeds the fresh-run 2048-block bound")
  return { fromBlock: toHex(from), toBlock: toHex(to) }
}
const bounded = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new EvidenceError(message)), ms)
  promise.then(value => { clearTimeout(timer); resolve(value) }, () => { clearTimeout(timer); reject(new EvidenceError(message)) })
})
export const readBoundedBody = async (response: Response, maxBytes = 1_048_576, timeoutMs = 5000): Promise<string> => {
  insist(response.ok && !response.redirected, "HTTP evidence request failed or redirected")
  insist(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 1_048_576 && Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 10000, "invalid body read bounds")
  insist(Number(response.headers.get("content-length")) <= maxBytes && response.body !== null, "HTTP evidence body exceeds its bound or is absent")
  const reader = response.body.getReader()
  try {
    return await bounded((async () => {
      let total = 0, text = ""; const decoder = new TextDecoder("utf-8", { fatal: true })
      for (;;) {
        const part = await reader.read()
        if (part.done) return text + decoder.decode()
        total += part.value.byteLength; insist(total <= maxBytes, "HTTP evidence body exceeds its bound")
        text += decoder.decode(part.value, { stream: true })
      }
    })(), timeoutMs, "HTTP evidence body failed or exceeded its deadline")
  } finally { void reader.cancel().catch(() => {}) }
}
export const roleEnvironment = (c: EvidenceConfig, role: "hub" | "seller" | "buyer"): Record<string, string> => ({
  PATH: process.env["PATH"] ?? "/usr/bin:/bin", LANG: "en_US.UTF-8",
  ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "eip3009", ARCADE_RPC_URL: RPC, ARCADE_CHAIN_CHECK: "1",
  ...Object.fromEntries((role === "hub" ? ["facilitator", "operator", "validator", "attester"] : [role])
    .map(name => [`ARCADE_${name.toUpperCase()}_KEY`, c.keys[name as Role]]))
})
export interface OwnedProcess { readonly child: ChildProcess; readonly exited: Promise<void>; done: boolean }
export class OwnedProcesses {
  private readonly owned = new Set<OwnedProcess>()
  get size() { return this.owned.size }
  launch(args: string[], env: Record<string, string>, onOutput?: (text: string) => void): OwnedProcess {
    const child = spawn(process.execPath, ["--no-env-file", ...args], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] })
    const entry: OwnedProcess = { child, done: false, exited: new Promise(resolve => {
      child.once("close", () => { entry.done = true; resolve() })
      child.on("error", () => {
        // A failed signal is NOT an exit. Only spawn failure (no pid) or close proves
        // the owned process cannot still be spending; otherwise cleanup must time out.
        if (child.pid === undefined) { entry.done = true; resolve() }
      })
    }) }
    this.owned.add(entry)
    child.stdout?.on("data", chunk => onOutput?.(String(chunk)))
    child.stderr?.resume() // Never persist raw child/provider diagnostics or private output.
    return entry
  }
  async stop(entry: OwnedProcess): Promise<void> {
    insist(this.owned.has(entry), "refusing to stop an unowned process")
    if (!entry.done) {
      insist(Number.isSafeInteger(entry.child.pid) && entry.child.pid! > 1, "refusing to signal an invalid PID")
      entry.child.kill("SIGTERM")
      try { await bounded(entry.exited, 3000, "child did not stop") }
      catch { entry.child.kill("SIGKILL"); await bounded(entry.exited, 3000, "owned child could not be reaped") }
    }
    this.owned.delete(entry)
  }
  async close(): Promise<void> {
    let failed = false
    for (const child of [...this.owned].reverse()) try { await this.stop(child) } catch { failed = true }
    insist(!failed, "an owned process could not be confirmed stopped")
  }
}
const parentGuard = `const parentPid = process.ppid;
setInterval(() => { if (process.ppid !== parentPid) process.exit(2); }, 100).unref();
setTimeout(() => process.exit(2), 360000).unref();\n`
export const skillEntrySource = () => `${parentGuard}\nawait import("./run.ts");\n`
export const hubPreloadSource = () => `${parentGuard}
const serve = Bun.serve;
Bun.serve = options => {
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0 });
  process.env.ARCADE_PUBLIC_URL = "http://127.0.0.1:" + server.port;
  console.log("[erc8004-evidence-port] " + server.port);
  return server;
};\n`

/** ONLY live entry point. Every send is invoked once; uncertain failures retain the
 * isolated registration journal/database and require manual reconciliation. */
export const runLiveEvidence = async (c: EvidenceConfig): Promise<void> => {
  const controller = new AbortController(), owned = new OwnedProcesses()
  const onSignal = () => controller.abort()
  process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal)
  const timer = setTimeout(onSignal, 300000)
  let directory: string | undefined, database: import("bun:sqlite").Database | undefined
  const check = () => insist(!controller.signal.aborted, "evidence interrupted or exceeded five minutes; reconcile retained state before any rerun")
  const pause = async (ms: number) => { check(); await new Promise(resolve => setTimeout(resolve, ms)); check() }
  const text = async (url: string, init?: RequestInit): Promise<string> => {
    check()
    try {
      const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
      return await readBoundedBody(response)
    } catch { throw new EvidenceError("HTTP/RPC evidence read failed; no raw diagnostics printed") }
  }
  const json = async (url: string, init?: RequestInit): Promise<unknown> => {
    try { return JSON.parse(await text(url, init)) } catch { throw new EvidenceError("HTTP/RPC evidence JSON read failed") }
  }
  const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
    const body = record(await json(RPC, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), "invalid RPC envelope")
    insist(body["error"] === undefined && Object.hasOwn(body, "result"), "RPC read failed")
    return body["result"]
  }
  const call = async (address: string, abi: Abi, functionName: string, args: unknown[]): Promise<unknown> => {
    const data = encodeFunctionData({ abi, functionName, args })
    const result = await rpc("eth_call", [{ to: address, data }, "latest"])
    insist(typeof result === "string" && /^0x[0-9a-fA-F]*$/.test(result), "invalid contract result")
    return decodeFunctionResult({ abi, functionName, data: result as Hex })
  }
  const until = async <T>(action: () => Promise<T | undefined>, message: string, ms = 90000): Promise<T> => {
    const deadline = Date.now() + ms
    do { check(); const result = await action(); if (result !== undefined) return result; await pause(1500) } while (Date.now() < deadline)
    throw new EvidenceError(message)
  }
  const receipt = async (tx: unknown) => {
    insist(hash(tx), "missing transaction hash")
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await rpc("eth_getTransactionReceipt", [tx])
      if (result !== null) return assertReceiptCorrelation(tx, result)
      if (attempt < 4) await pause(Math.min(1500 * 2 ** attempt, 12000))
    }
    throw new EvidenceError("transaction did not confirm; no transaction will be resent")
  }
  let summary: ReturnType<typeof assertErc8004Evidence> | undefined
  try {
    insist(quantity(await rpc("eth_chainId", [])) === BigInt(CHAIN_ID), "RPC is not Arc testnet chain 5042002")
    const startBlock = quantity(await rpc("eth_blockNumber", []))
    // Native gas balance uses 18 decimals; payment uses the six-decimal ERC-20 interface.
    for (const role of roles) insist(quantity(await rpc("eth_getBalance", [c[role], "latest"])) > 0n, "all six OWNER roles need native Arc USDC for gas; no funds were provisioned")
    const balanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"])
    insist(atomic(await call(USDC, balanceAbi, "balanceOf", [c.buyer])) >= 10000n, "buyer lacks the fixed $0.01 payment budget")
    const splitterAbi = parseAbi(["function seller() view returns (address)", "function feeBps() view returns (uint16)",
      "function version() pure returns (uint8)", "function usdc() view returns (address)"])
    assertSplitterEvidence(c, { seller: await call(c.splitter, splitterAbi, "seller", []), feeBps: await call(c.splitter, splitterAbi, "feeBps", []),
      version: await call(c.splitter, splitterAbi, "version", []), usdc: await call(c.splitter, splitterAbi, "usdc", []) })
    directory = await mkdtemp(join(tmpdir(), "arcade-erc8004-evidence-"))
    console.log(`Local evidence directory: ${directory}`)
    console.log("One $0.01 real purchase plus registry/settlement gas. Operator approval covers ALL current and future identity NFTs. Registration URI is temporary loopback; exported evidence survives, HTTP URLs do not.")
    const configPath = join(directory, "runner-config.json"), dbPath = join(directory, "hub.sqlite")
    const skillsDir = join(directory, "skills"), skillDir = join(skillsDir, SKILL)
    await mkdir(skillDir, { recursive: true })
    const manifest = record(JSON.parse(await readFile(join(ROOT, "skills", SKILL, "arcade.json"), "utf8")), "manifest missing")
    insist(manifest["id"] === SKILL && manifest["price"] === "$0.01" && object(manifest["engine"]) && manifest["engine"]["adapter"] === "script" &&
      manifest["engine"]["entry"] === "run.ts", "canonical flow-check changed; review before buying")
    // Only the private entry path changes: guard the original skill's subprocess against
    // orphaning, without replacing its real RPC work or altering the public listing.
    await writeFile(join(skillDir, "arcade.json"), JSON.stringify({ ...manifest, engine: { ...manifest["engine"], entry: "guarded-run.ts" } }))
    await copyFile(join(ROOT, "skills", SKILL, "run.ts"), join(skillDir, "run.ts"))
    await writeFile(join(skillDir, "guarded-run.ts"), skillEntrySource())
    const preload = join(directory, "loopback.ts"), guard = join(directory, "parent-guard.ts")
    await writeFile(preload, hubPreloadSource()); await writeFile(guard, parentGuard)
    let origin = "", portBuffer = ""
    const hub = owned.launch(["run", "--preload", preload, "apps/hub/src/server.ts"], {
      ...roleEnvironment(c, "hub"), ARCADE_DB: dbPath, PORT: "0" }, chunk => {
      if (origin) return
      portBuffer = (portBuffer + chunk).slice(-4096)
      const port = /\[erc8004-evidence-port\] ([0-9]{1,5})\b/.exec(portBuffer)?.[1]
      if (port && Number(port) > 0 && Number(port) <= 65535) origin = `http://127.0.0.1:${port}`
    })
    await until(async () => {
      insist(!hub.done, "hub exited before becoming ready")
      if (!origin) return undefined
      try { return record(await json(origin + "/healthz"), "health document missing") } catch { return undefined }
    }, "hub readiness deadline")
    assertHubEvidence(c, await json(origin + "/erc8004"))
    await writeFile(configPath, JSON.stringify({ runnerId: `rnr_erc8004_${crypto.randomUUID().replaceAll("-", "")}`,
      sellerAddress: c.seller, hubUrl: origin, maxConcurrency: 1 }), { mode: 0o600, flag: "wx" })
    const sellerEnv = { ...roleEnvironment(c, "seller"), ARCADE_CONFIG_PATH: configPath, ARCADE_FEE_SPLITTER: c.splitter }
    const launchRunner = () => owned.launch(["run", "--preload", guard, "packages/runner/src/cli.ts", "start", "--skills", skillsDir], sellerEnv)
    let runner = launchRunner()
    const waitListing = async (agent?: string) => until(async () => {
      insist(!hub.done && !runner.done, "hub or runner exited before verified listing")
      try {
        const listing = record(await json(`${origin}/listings/${SKILL}`), "listing missing")
        if (listing["id"] !== SKILL || !same(listing["seller"], c.seller) || listing["price"] !== "$0.01") return undefined
        if (agent !== undefined) {
          const erc = record(listing["erc8004"], "verified agent missing")
          if (erc["agentId"] !== agent || erc["verified"] !== true) return undefined
        }
        return listing
      } catch { return undefined }
    }, "listing never became ownership-verified")
    await waitListing()
    const command = async (args: string[], env: Record<string, string>, timeoutMs: number) => {
      check(); const child = owned.launch(["run", "--preload", guard, ...args], env)
      await until(async () => child.done ? true : undefined, "command deadline; outcome may be unknown; do not resend", timeoutMs)
      insist(child.child.exitCode === 0, "command failed; preserve checkpoints and inspect chain before retrying")
      await owned.stop(child)
    }
    // No init, keychain access, HOME replacement, operator inference or automatic resume.
    await command(["packages/runner/src/cli.ts", "identity", "register", SKILL, "--approve-operator", c.operator, "--skills", skillsDir], sellerEnv, 120000)
    const saved = record(JSON.parse(await readFile(configPath, "utf8")), "isolated config missing")
    const agent = record(record(saved["agents"], "no identity recorded")[SKILL], "registered identity missing")
    insist(typeof agent["agentId"] === "string", "registered identity id missing")
    await owned.stop(runner); runner = launchRunner(); await waitListing(agent["agentId"])
    const registrationBytes = await text(`${origin}/listings/${SKILL}/agent-registration.json`)
    const id = BigInt(agent["agentId"])
    assertIdentityEvidence(c, { origin, startBlock, agent, manifest, registrationBytes, chainId: await rpc("eth_chainId", []),
      owner: await call(registries.identity, IDENTITY_REGISTRY_ABI, "ownerOf", [id]),
      tokenURI: await call(registries.identity, IDENTITY_REGISTRY_ABI, "tokenURI", [id]),
      approved: await call(registries.identity, IDENTITY_REGISTRY_ABI, "isApprovedForAll", [c.seller, c.operator]),
      registrationReceipt: await receipt(agent["registrationTx"]),
      ...(agent["approvalTx"] === undefined ? {} : { approvalReceipt: await receipt(agent["approvalTx"]) }) })
    await command(["packages/buyer/src/cli.ts", SKILL, "--hub", origin, "--seller", c.seller,
      "--input", JSON.stringify({ address: c.buyer }), "--max-amount", "0.01"], roleEnvironment(c, "buyer"), 90000)
    const { Database } = await import("bun:sqlite")
    database = new Database(dbPath, { readonly: true })
    const receipts = database.query<{ json: string }, []>("SELECT json FROM receipts").all()
    insist(receipts.length === 1, "the isolated run must contain exactly one durable purchase")
    const paid = record(JSON.parse(receipts[0]!.json), "durable purchase missing"), jobId = paid["jobId"]
    insist(typeof jobId === "string" && /^job_[a-zA-Z0-9]{16,}$/.test(jobId) && paid["settled"] === true, "the single paid job did not settle")
    const jobRow = database.query<{ json: string }, [string]>("SELECT json FROM jobs WHERE id=?").get(jobId)
    insist(jobRow, "durable job missing")
    const persistedBytes = await until(async () => {
      const rows = database!.query<{ kind: string; bytes: string }, [string]>("SELECT kind,bytes FROM erc8004_docs WHERE job_id=?").all(jobId)
      return rows.length === 3 ? Object.fromEntries(rows.map(row => [row.kind, row.bytes])) : undefined
    }, "committed documents were not persisted")
    const requestBytes = await text(`${origin}/receipts/${jobId}/validation-request.json`)
    const responseBytes = await text(`${origin}/receipts/${jobId}/validation-response.json`)
    const feedbackBytes = await text(`${origin}/receipts/${jobId}/feedback.json`)
    const requestHash = digest(requestBytes)
    const searches = [
      { name: "request", address: registries.validation, topics: encodeEventTopics({ abi: VALIDATION_REGISTRY_ABI, eventName: "ValidationRequest", args: { validatorAddress: c.validator as Hex, agentId: id, requestHash } }) },
      { name: "response", address: registries.validation, topics: encodeEventTopics({ abi: VALIDATION_REGISTRY_ABI, eventName: "ValidationResponse", args: { validatorAddress: c.validator as Hex, agentId: id, requestHash } }) },
      { name: "feedback", address: registries.reputation, topics: encodeEventTopics({ abi: REPUTATION_REGISTRY_ABI, eventName: "NewFeedback", args: { agentId: id, clientAddress: c.attester as Hex, indexedTag1: "arcade-settled" } }) }
    ]
    const discovered = new Map<string, string>(); let cursor = startBlock
    await until(async () => {
      insist(!hub.done && !runner.done, "hub/runner exited before attestation confirmed")
      const latest = quantity(await rpc("eth_blockNumber", [])); scanRange(startBlock, latest)
      if (latest < cursor) return undefined
      const range = scanRange(cursor, latest)
      for (const search of searches) {
        const logs = await rpc("eth_getLogs", [{ ...range, address: search.address, topics: search.topics }])
        insist(Array.isArray(logs) && logs.length <= 16, "registry event query exceeded bound")
        for (const raw of logs) {
          const log = record(raw, "invalid registry log")
          insist(log["removed"] !== true && same(log["address"], search.address) && hash(log["transactionHash"]), "invalid registry log provenance")
          scanRange(cursor, quantity(log["blockNumber"]))
          const previous = discovered.get(search.name)
          insist(previous === undefined || same(previous, log["transactionHash"]), "multiple attestation transactions require manual reconciliation")
          discovered.set(search.name, log["transactionHash"])
        }
      }
      cursor = latest + 1n
      return discovered.size === 3 ? true : undefined
    }, "registry writes did not all confirm; no sends will be retried", 120000)
    // Stop send-capable children BEFORE read-back proof. No autonomous canary is armed.
    await owned.stop(runner); await owned.stop(hub)
    const evidence: EvidenceBundle = {
      origin, startBlock, chainId: await rpc("eth_chainId", []), manifest, job: JSON.parse(jobRow.json), receipt: paid, agent,
      owner: await call(registries.identity, IDENTITY_REGISTRY_ABI, "ownerOf", [id]),
      tokenURI: await call(registries.identity, IDENTITY_REGISTRY_ABI, "tokenURI", [id]),
      approved: await call(registries.identity, IDENTITY_REGISTRY_ABI, "isApprovedForAll", [c.seller, c.operator]),
      registrationBytes, requestBytes, responseBytes, feedbackBytes, persistedBytes,
      registrationReceipt: await receipt(agent["registrationTx"]), settlementReceipt: await receipt(paid["settleTx"]),
      ...(agent["approvalTx"] === undefined ? {} : { approvalReceipt: await receipt(agent["approvalTx"]) }),
      requestReceipt: await receipt(discovered.get("request")), responseReceipt: await receipt(discovered.get("response")),
      feedbackReceipt: await receipt(discovered.get("feedback")),
      validationStatus: await call(registries.validation, VALIDATION_REGISTRY_ABI, "getValidationStatus", [requestHash]),
      feedbackState: await call(registries.reputation, REPUTATION_REGISTRY_ABI, "readAllFeedback", [id, [c.attester], "arcade-settled", SKILL, false])
    }
    summary = assertErc8004Evidence(c, evidence)
    // Public exports only. SQLite contains the owned test job, not keys; do not upload
    // that private store or raw seller output as a public proof artifact.
    for (const [name, bytes] of [["registration", registrationBytes], ["validation-request", requestBytes], ["validation-response", responseBytes], ["feedback", feedbackBytes]]) {
      await writeFile(join(directory, `${name}.json`), bytes!, { mode: 0o600 })
    }
    await writeFile(join(directory, "evidence.json"), JSON.stringify({ ...summary, verifiedAt: new Date().toISOString(),
      registrationURI: agent["agentURI"], note: "Loopback document URLs are no longer served after cleanup; retained bytes match verified commitments." }, null, 2), { mode: 0o600 })
  } finally {
    clearTimeout(timer); process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal)
    try { await owned.close() } finally {
      database?.close()
      if (directory) console.log(`Retained isolated evidence/checkpoints (no keys): ${directory}. Reconcile before rerunning; no automatic remint or send retry.`)
    }
  }
  // PASS only AFTER all owned processes are reaped, including failure cleanup.
  insist(summary, "no verified evidence produced")
  console.log(`PASS — ERC-8004 on Arc testnet: agent #${summary.agentId}, job ${summary.jobId}; six distinct roles independently checked.`)
  for (const [label, tx] of [["Registered", summary.registrationTx], ["ValidationRequest", summary.requestTx],
    ["ValidationResponse", summary.responseTx], ["NewFeedback", summary.feedbackTx], ["Settlement", summary.settlementTx]]) {
    console.log(`${label}: https://testnet.arcscan.app/tx/${tx}`)
  }
}
export const main = async (argv = process.argv.slice(2)): Promise<number> => {
  if (argv.length === 1 && argv[0] === "--help") {
    console.log("Usage: bash scripts/e2e-erc8004.sh --approve-operator ADDRESS\nRequires six distinct OWNER-funded ARCADE_SELLER_KEY, ARCADE_BUYER_KEY, ARCADE_FACILITATOR_KEY, ARCADE_OPERATOR_KEY, ARCADE_VALIDATOR_KEY, ARCADE_ATTESTER_KEY and the seller's ARCADE_FEE_SPLITTER. Arc testnet only; one $0.01 job plus gas. Approval permits the operator to transfer ALL current and future identity NFTs in the registry. The minted registration URI is temporary loopback; exported public document bytes remain after shutdown. No keys are created/read from Keychain/stored. No HOME or existing config changes. Failures retain a journal: reconcile before rerunning; never automatically retry an uncertain send.")
    return 0
  }
  try {
    insist(argv.length === 0 || argv.length === 2 && argv[0] === "--approve-operator", "unsupported arguments; use --help")
    await runLiveEvidence(readEvidenceConfig(process.env, argv[1]))
    return 0
  } catch (error) {
    console.error(`FAIL: ${error instanceof EvidenceError ? error.message : "evidence run failed; private diagnostics withheld; reconcile any retained journal before retrying"}`)
    return 1
  }
}
if (import.meta.main) process.exitCode = await main()
