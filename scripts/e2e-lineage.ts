import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { decodeEventLog, decodeFunctionResult, encodeFunctionData, parseAbi, type Abi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { HIRE_CAPABILITY_HEADER, treeHashOf } from "@arcade/core"
import { OwnedProcesses, readBoundedBody, assertReceiptCorrelation, scanRange } from "./e2e-erc8004.ts"

// Import-safe. Only main's explicit live entry point uses supplied OWNER keys.
const ROOT = fileURLToPath(new URL("../", import.meta.url))
const RPC = "https://rpc.testnet.arc.io", CHAIN = 5042002
const USDC = "0x3600000000000000000000000000000000000000"
const SKILLS = ["loop-probe", "wallet-risk-note", "usdc-flow-check"] as const
const PRICES = [300000n, 50000n, 10000n] as const
const DOLLARS = ["$0.30", "$0.05", "$0.01"] as const
const ROLES = ["seller", "buyer", "facilitator", "subbuyer"] as const
type Role = typeof ROLES[number]
type Hex = `0x${string}`
const KEY_NAMES = { seller: "ARCADE_SELLER_KEY", buyer: "ARCADE_BUYER_KEY", facilitator: "ARCADE_FACILITATOR_KEY", subbuyer: "ARCADE_SUBBUY_KEY" }
const OWNER_ROLES: Readonly<Record<Role, string>> = {
  seller: "0xcf821769ED3c0E55e152745377bb833d7155A78a", facilitator: "0xcf821769ED3c0E55e152745377bb833d7155A78a",
  buyer: "0xdaACA688cE93d6EA0BDf4cdA9925C5526f3cA5e1", subbuyer: "0xd3Ad4D10D4d24bD57740A5430ED5Fd28c6824634"
}
const OWNER_SPLITTER = "0x9e304ec13dd862c81ee8caa8fd262dac426fbedf"
class LineageEvidenceError extends Error {}
function insist(ok: unknown, message: string): asserts ok { if (!ok) throw new LineageEvidenceError(message) }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v)
function record(v: unknown): Record<string, unknown> { insist(object(v), "evidence object missing"); return v }
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase()
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v)
const address = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v)
const jobId = (v: unknown): v is string => typeof v === "string" && /^job_[a-zA-Z0-9]{16,}$/.test(v)
const atomic = (v: unknown): bigint => {
  const raw = object(v) ? v["__bigint"] : v
  insist(typeof raw === "bigint" || typeof raw === "string" && /^(0|[1-9][0-9]{0,77})$/.test(raw), "invalid atomic amount")
  const amount = BigInt(raw)
  insist(amount >= 0n && amount < 2n ** 256n, "atomic amount must be a uint256")
  return amount
}
const quantity = (v: unknown): bigint => {
  insist(typeof v === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(v), "invalid chain quantity")
  return BigInt(v)
}
const rows = (v: unknown, count: number, why: string): Record<string, unknown>[] => {
  insist(Array.isArray(v) && v.length === count, why); return v.map(record)
}
export type LineageConfig = Readonly<Record<Role, string>> & {
  readonly keys: Readonly<Record<Role, string>>; readonly splitter: string
}
/** expected is an explicit offline fixture seam, never supplied by CLI/environment. */
export const readLineageConfig = (env: Record<string, string | undefined>, expected = OWNER_ROLES): LineageConfig => {
  insist(env["ARCADE_NETWORK"] === undefined || env["ARCADE_NETWORK"] === "arc-testnet", "only Arc testnet is permitted")
  insist(env["ARCADE_RAIL"] === undefined || env["ARCADE_RAIL"] === "eip3009", "real eip3009 payments are required")
  insist(env["ARCADE_RPC_URL"] === undefined || env["ARCADE_RPC_URL"] === RPC, "canonical Arc testnet RPC is required")
  insist(["SKILL", "INPUT", "ARCADE_HUB"].every(name => env[name] === undefined), "arbitrary job or existing hub overrides are refused")
  const keys = {} as Record<Role, string>, accounts = {} as Record<Role, string>
  for (const role of ROLES) {
    const key = env[KEY_NAMES[role]]
    insist(key !== undefined && key !== "", `${KEY_NAMES[role]} is required`)
    try { if (!hash(key)) throw new Error(); accounts[role] = privateKeyToAccount(key).address; keys[role] = key }
    catch { throw new LineageEvidenceError(`${KEY_NAMES[role]} is invalid`) }
  }
  insist(new Set([accounts.seller, accounts.buyer, accounts.subbuyer].map(v => v.toLowerCase())).size === 3 &&
    !same(accounts.facilitator, accounts.buyer) && !same(accounts.facilitator, accounts.subbuyer), "buyer/subbuyer/seller must be distinct; facilitator may only reuse seller")
  insist(ROLES.every(r => same(accounts[r], expected[r])), "supplied keys do not match the expected owner role addresses")
  const splitter = env["ARCADE_FEE_SPLITTER"]
  insist(address(splitter) && (expected !== OWNER_ROLES || same(splitter, OWNER_SPLITTER)), "expected owner FeeSplitterV2 is required")
  return { ...accounts, keys, splitter }
}
export const lineageEnvironment = (c: LineageConfig, role: "hub" | "seller" | "buyer"): Record<string, string> => ({
  PATH: process.env["PATH"] ?? "/usr/bin:/bin", LANG: "en_US.UTF-8",
  ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "eip3009", ARCADE_RPC_URL: RPC, ARCADE_CHAIN_CHECK: "1",
  ...Object.fromEntries((role === "hub" ? ["facilitator"] : role === "seller" ? ["seller", "subbuyer"] : ["buyer"])
    .map(r => [KEY_NAMES[r as Role], c.keys[r as Role]]))
})
export const lineageRunnerConfig = (c: LineageConfig, origin: string, directory: string) => {
  insist(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin) && Number(new URL(origin).port) <= 65535, "owned loopback hub required")
  const runnerId = `rnr_a9_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
  // macOS sockaddr_un is only 104 bytes; its default long TMPDIR can exceed that
  // before the first hire. The owned /tmp directory and short ID keep this bounded.
  insist(directory.startsWith("/") && Buffer.byteLength(`${directory}/arcade-hire-${runnerId}.sock`) < 104, "owned hire socket path exceeds the platform bound")
  return { runnerId, sellerAddress: c.seller, hubUrl: origin, maxConcurrency: 3 }
}
export const assertCanonicalListings = (values: unknown): Record<string, unknown>[] => {
  const manifests = rows(values, 3, "exactly three canonical listings are required")
  for (const [i, manifest] of manifests.entries()) {
    const engine = record(manifest["engine"]), bounds = record(manifest["bounds"])
    insist(manifest["id"] === SKILLS[i] && manifest["price"] === DOLLARS[i] && manifest["version"] === "0.1.0" &&
      engine["adapter"] === "script" && engine["entry"] === "run.ts" && engine["args"] === undefined &&
      (manifest["secrets"] === undefined || Array.isArray(manifest["secrets"]) && manifest["secrets"].length === 0), "canonical no-provider script/pricing changed; review before buying")
    insist(bounds["timeoutSec"] === (i === 2 ? 30 : 60) && bounds["maxSubSpendUsd"] === (i === 0 ? 0.25 : i === 1 ? 0.02 : undefined),
      "canonical time or hiring budget changed")
    insist(i === 2 ? engine["capabilities"] === undefined || Array.isArray(engine["capabilities"]) && engine["capabilities"].length === 0
      : Array.isArray(engine["capabilities"]) && engine["capabilities"].length === 1 && engine["capabilities"][0] === "hire-skills", "canonical capability changed")
  }
  return manifests
}
/** /listings intentionally publishes no private splitter record fields. */
export const assertPublishedLineage = (c: LineageConfig, values: unknown) => {
  const listings = rows(values, 3, "exactly three online listings required")
  insist(SKILLS.every((skill, i) => listings.filter(r => r["id"] === skill && r["version"] === "0.1.0" && r["price"] === DOLLARS[i] &&
    same(r["seller"], c.seller)).length === 1), "online listing prices or seller changed")
}
/** Read-only unsigned probes verify the actual paid route before the buyer signs. */
export const assertLineageChallenge = (c: LineageConfig, skill: typeof SKILLS[number], resource: string, status: number, value: unknown) => {
  const body = record(value), requirements = rows(body["accepts"], 1, "one exact x402 challenge required"), req = requirements[0]!, extra = record(req["extra"])
  insist(status === 402 && body["x402Version"] === 2 && req["scheme"] === "exact" && req["network"] === `eip155:${CHAIN}` &&
    req["amount"] === PRICES[SKILLS.indexOf(skill)]!.toString() && same(req["asset"], USDC) && same(req["payTo"], c.splitter) &&
    req["resource"] === resource && same(extra["feeSplitter"], c.splitter) && extra["feeSplitterVersion"] === 2, "unsigned x402 challenge must route the exact price to this V2 splitter")
}
export interface LineageBundle {
  chainId: unknown; startBlock: bigint; receipts: unknown[]; jobs: unknown[]; reservations: unknown[]; chainReceipts: unknown[]; cycle: unknown[]
  balances: { buyerBefore: unknown; buyerAfter: unknown; subbuyerBefore: unknown; subbuyerAfter: unknown }
}
const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Settled(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce)",
  "event SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)"
])
/** Strict live proof; a simulated/offline run can NEVER satisfy this function. */
export const assertLineageEvidence = (c: LineageConfig, e: LineageBundle) => {
  insist(quantity(e.chainId) === BigInt(CHAIN), "chain must be Arc testnet")
  const all = rows(e.receipts, 3, "exactly three receipts required"), jobs = rows(e.jobs, 3, "exactly three jobs required")
  const receipts = SKILLS.map(skill => { const matches = all.filter(r => r["skillId"] === skill); insist(matches.length === 1, "unique canonical receipt required"); return matches[0]! })
  const ids = receipts.map(r => r["jobId"]), hashes = receipts.map(r => r["settleTx"]), nonces = receipts.map(r => r["authorizationNonce"])
  insist(ids.every(jobId) && new Set(ids).size === 3 && hashes.every(hash) && new Set(hashes.map(v => v.toLowerCase())).size === 3 &&
    nonces.every(hash) && new Set(nonces.map(v => v.toLowerCase())).size === 3, "three unique jobs, settlement hashes and authorizations are required")
  const root = receipts[0]!, rootId = ids[0]!
  for (const [i, r] of receipts.entries()) {
    const payer = i === 0 ? c.buyer : c.subbuyer, price = PRICES[i]!
    insist(r["skillVersion"] === "0.1.0" && r["settled"] === true && r["rail"] === "eip3009" && r["network"] === `eip155:${CHAIN}` &&
      r["canary"] !== true && same(r["buyer"], payer) && same(r["seller"], c.seller), "receipt must describe the real intended purchase")
    insist(atomic(r["priceAtomic"]) === price && atomic(r["sellerAtomic"]) === price * 95n / 100n && atomic(r["feeAtomic"]) === price / 20n &&
      r["feeBps"] === 500, "receipt amount or split differs from the fixed three-hop prices")
    const lineage = (value: Record<string, unknown>) => value["rootJobId"] === rootId && value["parentJobId"] === (i === 0 ? undefined : ids[i - 1]) &&
      value["hop"] === i && JSON.stringify(value["ancestors"]) === JSON.stringify(SKILLS.slice(0, i))
    insist(lineage(r), "receipt root/parent/hop/ancestors do not form the exact three-hop lineage")
    if (i > 0) insist(["children", "treeHash", "treeCommittedAtomic", "treeCeilingAtomic"].every(k => r[k] === undefined), "only the root may carry the aggregated tree")
    const matching = jobs.filter(j => j["id"] === r["jobId"]); insist(matching.length === 1, "unique matching durable job required")
    const j = matching[0]!, output = record(record(j["outcome"])["output"])
    insist(j["skillId"] === SKILLS[i] && same(j["seller"], c.seller) && same(j["buyer"], payer) && atomic(j["priceAtomic"]) === price &&
      j["status"] === "succeeded" && record(j["outcome"])["status"] === "succeeded" && record(j["outcome"])["stopReason"] === "end_turn" &&
      lineage(j) && JSON.stringify(j["input"]) === JSON.stringify({ address: c.buyer }), "durable job differs from the requested lineage purchase")
    insist(i === 0 ? output["ok"] === true && Array.isArray(output["hired"]) && output["hired"].length === 2 &&
      output["hired"].some(v => typeof v === "string" && v.includes("lineage_cycle"))
      : same(output["address"], c.buyer) && (i === 1 ? record(output["sourcedFrom"])["skillId"] === SKILLS[2] &&
        record(output["sourcedFrom"])["paidUsdc"] === "$0.0100" : output["chainId"] === CHAIN && typeof output["balanceUsdc"] === "string"), "canonical skill outcome missing")
  }
  const children = rows(root["children"], 2, "root must have exactly two descendants")
  const expectedChildren = receipts.slice(1).map((r, i) => ({ jobId: ids[i + 1]!, skillId: SKILLS[i + 1]!, priceAtomic: PRICES[i + 1]!, settled: true, settleTx: hashes[i + 1]! }))
  for (const child of expectedChildren) {
    const matches = children.filter(v => v["jobId"] === child.jobId)
    insist(matches.length === 1 && matches[0]!["skillId"] === child.skillId && matches[0]!["settled"] === true &&
      same(matches[0]!["settleTx"], child.settleTx) && atomic(matches[0]!["priceAtomic"]) === child.priceAtomic, "root child differs from its actual settled receipt")
  }
  const treeHash = treeHashOf(rootId, expectedChildren)
  insist(same(root["treeHash"], treeHash) && atomic(root["treeCommittedAtomic"]) === 60000n && atomic(root["treeCeilingAtomic"]) === 250000n, "root tree hash or budget does not match its actual children")
  const reservations = rows(e.reservations, 2, "exactly two committed reservations required")
  for (const child of expectedChildren) {
    const matches = reservations.filter(r => r["child_job_id"] === child.jobId)
    insist(matches.length === 1 && matches[0]!["root_job_id"] === rootId && matches[0]!["state"] === "committed" &&
      atomic(matches[0]!["amount_atomic"]) === child.priceAtomic, "reservation does not match the committed child")
  }
  const cycle = rows(e.cycle, 1, "exactly one actual cycle refusal must be observed")[0]!
  insist(cycle["path"] === `/x/${c.seller}/loop-probe` && cycle["status"] === 402 && cycle["error"] === "lineage_cycle" &&
    cycle["hadLineage"] === true && cycle["hadPayment"] === false, "cycle was not refused on the actual unsigned capability probe")
  insist(atomic(e.balances.buyerBefore) - atomic(e.balances.buyerAfter) === 300000n &&
    atomic(e.balances.subbuyerBefore) - atomic(e.balances.subbuyerAfter) === 60000n, "payer balance changes differ from the exact three purchases")
  const chains = rows(e.chainReceipts, 3, "exactly three chain receipts required")
  for (const [i, r] of receipts.entries()) {
    const matches = chains.filter(chain => same(chain["transactionHash"], r["settleTx"]))
    insist(matches.length === 1, "exactly one matching chain transaction required")
    const chain = assertReceiptCorrelation(r["settleTx"], matches[0]), price = PRICES[i]!, payer = i === 0 ? c.buyer : c.subbuyer
    insist(chain["status"] === "0x1" && same(chain["from"], c.facilitator) && same(chain["to"], c.splitter), "transaction has wrong sender, target or status")
    scanRange(e.startBlock, quantity(chain["blockNumber"]))
    let incoming = 0, outgoing = 0, ordinary = 0, tree = 0, matched = 0
    for (const raw of chain["logs"] as unknown[]) {
      const log = record(raw); if (!Array.isArray(log["topics"]) || typeof log["data"] !== "string") continue
      try {
        const event = decodeEventLog({ abi: ABI, topics: log["topics"] as [Hex, ...Hex[]], data: log["data"] as Hex })
        if (event.eventName === "Transfer" && same(log["address"], USDC)) {
          if (same(event.args.from, payer) && same(event.args.to, c.splitter) && event.args.value === price) incoming++
          if (same(event.args.from, c.splitter) && same(event.args.to, c.seller) && event.args.value === price * 95n / 100n) outgoing++
        }
        if (same(log["address"], c.splitter) && event.eventName !== "Transfer") {
          if (event.eventName === "Settled") ordinary++; else tree++
          if (same(event.args.buyer, payer) && same(event.args.nonce, r["authorizationNonce"]) && event.args.total === price &&
            event.args.sellerAmount === price * 95n / 100n && event.args.feeAmount === price / 20n &&
            (i === 0 ? event.eventName === "SettledTree" && same(event.args.treeHash, treeHash) && event.args.childCount === 2 && event.args.childTotalAtomic === 60000n
              : event.eventName === "Settled")) matched++
        }
      } catch { /* Unrelated logs cannot prove settlement. */ }
    }
    insist(incoming === 1 && outgoing === 1 && matched === 1 && ordinary === (i === 0 ? 0 : 1) && tree === (i === 0 ? 1 : 0),
      "exact transfers, root SettledTree and ordinary child Settled events required")
  }
  return { network: `eip155:${CHAIN}`, seller: c.seller, buyer: c.buyer, subbuyer: c.subbuyer, facilitator: c.facilitator, splitter: c.splitter,
    treeHash, childTotalAtomic: "60000", cycle: { status: 402, error: "lineage_cycle", hadPayment: false },
    settlements: SKILLS.map((skillId, i) => ({ skillId, hop: i, settleTx: hashes[i], priceAtomic: PRICES[i]!.toString() })) }
}
export const cycleObservation = async (request: Request, response: Response) => {
  const path = new URL(request.url).pathname
  if (request.method !== "POST" || !/^\/x\/0x[0-9a-fA-F]{40}\/loop-probe$/.test(path) || !request.headers.has(HIRE_CAPABILITY_HEADER) || response.status !== 402) return undefined
  try {
    // The body reader normally requires successful HTTP status. This observation
    // specifically requires the real 402 above; normalize only the private clone.
    const body = JSON.parse(await readBoundedBody(new Response(response.clone().body, { headers: response.headers }), 4096, 500)) as unknown
    if (!object(body) || body["error"] !== "lineage_cycle") return undefined
    return { path, status: response.status, error: "lineage_cycle", hadLineage: true,
      hadPayment: request.headers.has("payment-signature") || request.headers.has("x-payment") }
  } catch { return undefined }
}
const parentGuard = `const evidenceParent = process.ppid;
setInterval(() => { if (process.ppid !== evidenceParent) process.exit(2); }, 100).unref();
setTimeout(() => process.exit(2), 240000).unref();\n`
export const guardedSkillSource = (original: string) => parentGuard + original.replace(/^#![^\n]*(?:\n|$)/, "")
export const lineagePreloadSource = (marker = "lineage-evidence") => `${parentGuard}
import { cycleObservation } from ${JSON.stringify(fileURLToPath(import.meta.url))};
const originalServe = Bun.serve;
Bun.serve = options => {
  const originalFetch = options.fetch;
  const server = originalServe({ ...options, hostname: "127.0.0.1", port: 0, fetch: async (req, server) => {
    const response = await originalFetch(req, server);
    if (response instanceof Response) {
      const observation = await cycleObservation(req, response);
      if (observation) console.log(${JSON.stringify(`[${marker}-cycle] `)} + JSON.stringify(observation));
    }
    return response;
  }});
  process.env.ARCADE_PUBLIC_URL = "http://127.0.0.1:" + server.port;
  console.log(${JSON.stringify(`[${marker}-port] `)} + server.port);
  return server;
};\n`
/** Original seller programs are preserved byte-for-byte after a parent/deadline guard.
 * The private executable shell only execs Bun with dotenv explicitly disabled. */
export const prepareLineageSkills = async (directory: string) => {
  const skillsDir = join(directory, "skills")
  const manifests = assertCanonicalListings(await Promise.all(SKILLS.map(async skill => JSON.parse(await readFile(join(ROOT, "skills", skill, "arcade.json"), "utf8")))))
  await mkdir(skillsDir, { recursive: true })
  // Inherit the actual workspace aliases so the copied canonical loop-probe resolves
  // @arcade/buyer/hire without changing its import or import.meta.main semantics.
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ extends: join(ROOT, "tsconfig.json") }), { mode: 0o600, flag: "wx" })
  const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`
  for (const [i, skill] of SKILLS.entries()) {
    const dir = join(skillsDir, skill); await mkdir(dir)
    const entry = join(dir, "guarded-run.ts")
    await writeFile(entry, guardedSkillSource(await readFile(join(ROOT, "skills", skill, "run.ts"), "utf8")), { mode: 0o600 })
    await writeFile(join(dir, "guarded-run"), `#!/bin/sh\nexec ${quote(process.execPath)} --no-env-file run ${quote(entry)}\n`, { mode: 0o700 })
    await writeFile(join(dir, "arcade.json"), JSON.stringify({ ...manifests[i], engine: { ...record(manifests[i]!["engine"]), entry: "guarded-run" } }), { mode: 0o600 })
  }
  return { skillsDir, manifests }
}
/** One fresh bounded run. Every payment-capable CLI is launched once, never retried. */
export const runLiveLineage = async (c: LineageConfig): Promise<void> => {
  const owned = new OwnedProcesses(), controller = new AbortController()
  const abort = () => controller.abort(), timer = setTimeout(abort, 180000)
  process.on("SIGINT", abort); process.on("SIGTERM", abort)
  let directory: string | undefined, database: import("bun:sqlite").Database | undefined, summary: ReturnType<typeof assertLineageEvidence> | undefined
  const check = () => insist(!controller.signal.aborted, "lineage evidence interrupted or exceeded three minutes; reconcile before any rerun")
  const pause = async (ms: number) => { check(); await new Promise(resolve => setTimeout(resolve, ms)); check() }
  const json = async (url: string, init?: RequestInit): Promise<unknown> => {
    check()
    try { return JSON.parse(await readBoundedBody(await fetch(url, { ...init, redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) }))) }
    catch { throw new LineageEvidenceError("bounded HTTP/RPC evidence read failed; private diagnostics withheld") }
  }
  const rpc = async (method: string, params: unknown[]) => {
    const response = record(await json(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }))
    insist(response["error"] === undefined && Object.hasOwn(response, "result"), "RPC read failed")
    return response["result"]
  }
  const call = async (target: string, abi: Abi, functionName: string, args: unknown[]) => {
    const result = await rpc("eth_call", [{ to: target, data: encodeFunctionData({ abi, functionName, args }) }, "latest"])
    insist(typeof result === "string" && /^0x[0-9a-fA-F]*$/.test(result), "invalid contract result")
    return decodeFunctionResult({ abi, functionName, data: result as Hex })
  }
  const until = async <T>(action: () => Promise<T | undefined>, why: string, ms: number): Promise<T> => {
    const deadline = Date.now() + ms
    do { check(); const result = await action(); if (result !== undefined) return result; await pause(250) } while (Date.now() < deadline)
    throw new LineageEvidenceError(why)
  }
  const receipt = async (tx: unknown) => {
    insist(hash(tx), "settlement hash missing")
    for (let i = 0; i < 5; i++) { const r = await rpc("eth_getTransactionReceipt", [tx]); if (r !== null) return assertReceiptCorrelation(tx, r); if (i < 4) await pause(Math.min(1000 * 2 ** i, 8000)) }
    throw new LineageEvidenceError("settlement did not confirm; no transaction will be resent")
  }
  try {
    insist(quantity(await rpc("eth_chainId", [])) === BigInt(CHAIN), "RPC is not Arc testnet")
    const startBlock = quantity(await rpc("eth_blockNumber", []))
    const balanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"])
    const balance = (payer: string) => call(USDC, balanceAbi, "balanceOf", [payer]).then(atomic)
    const buyerBefore = await balance(c.buyer), subbuyerBefore = await balance(c.subbuyer)
    insist(buyerBefore >= 300000n && subbuyerBefore >= 60000n && quantity(await rpc("eth_getBalance", [c.facilitator, "latest"])) > 0n, "OWNER roles need the exact purchase budgets and facilitator gas; no funding is performed")
    const splitterAbi = parseAbi(["function seller() view returns (address)", "function feeBps() view returns (uint16)", "function version() pure returns (uint8)", "function usdc() view returns (address)"])
    insist(same(await call(c.splitter, splitterAbi, "seller", []), c.seller) && await call(c.splitter, splitterAbi, "feeBps", []) === 500 &&
      await call(c.splitter, splitterAbi, "version", []) === 2 && same(await call(c.splitter, splitterAbi, "usdc", []), USDC), "actual V2 seller/asset/5% split must match")
    directory = await mkdtemp("/tmp/arcade-lineage-")
    console.log(`Isolated lineage evidence directory: ${directory}. One $0.30 root + $0.06 descendant spend, plus facilitator gas. No retry.`)
    const { skillsDir } = await prepareLineageSkills(directory)
    const dbPath = join(directory, "hub.sqlite"), configPath = join(directory, "runner.json"), preload = join(directory, "hub-preload.ts"), guard = join(directory, "guard.ts")
    const marker = `lineage-${crypto.randomUUID()}`, cycle: unknown[] = []
    await writeFile(preload, lineagePreloadSource(marker), { mode: 0o600 }); await writeFile(guard, parentGuard, { mode: 0o600 })
    let origin = "", buffer = ""
    const hub = owned.launch(["run", "--preload", preload, "apps/hub/src/server.ts"], { ...lineageEnvironment(c, "hub"), ARCADE_DB: dbPath, PORT: "0" }, chunk => {
      buffer += chunk
      if (buffer.length > 16384) buffer = buffer.slice(-16384)
      let newline: number
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        if (line.startsWith(`[${marker}-port] `)) {
          const port = line.slice(marker.length + 8)
          if (/^[0-9]{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535) origin = `http://127.0.0.1:${port}`
        }
        if (line.startsWith(`[${marker}-cycle] `) && cycle.length < 16) {
          try { cycle.push(JSON.parse(line.slice(marker.length + 9))) } catch { cycle.push(null) }
        }
      }
    })
    await until(async () => { insist(!hub.done, "owned hub exited before readiness"); if (!origin) return undefined; try { return await json(origin + "/healthz") } catch { return undefined } }, "hub readiness deadline", 15000)
    const health = record(await json(origin + "/healthz"))
    insist(health["ok"] === true && health["rail"] === "eip3009" && health["network"] === `eip155:${CHAIN}`, "owned hub is not on the real Arc testnet rail")
    await writeFile(configPath, JSON.stringify(lineageRunnerConfig(c, origin, directory)), { flag: "wx", mode: 0o600 })
    const runner = owned.launch(["run", "--preload", guard, "packages/runner/src/cli.ts", "start", "--skills", skillsDir], {
      ...lineageEnvironment(c, "seller"), ARCADE_CONFIG_PATH: configPath, ARCADE_FEE_SPLITTER: c.splitter, TMPDIR: directory })
    await until(async () => {
      insist(!hub.done && !runner.done, "owned hub/runner exited before listings")
      try {
        assertPublishedLineage(c, await json(origin + "/listings"))
        return true
      } catch { return undefined }
    }, "canonical verified listings deadline", 30000)
    for (const skill of SKILLS) {
      check()
      const resource = `${origin}/x/${c.seller}/${skill}`
      try {
        const response = await fetch(resource, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: c.buyer }),
          redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
        const body = JSON.parse(await readBoundedBody(new Response(response.body, { headers: response.headers }))) as unknown
        assertLineageChallenge(c, skill, resource, response.status, body)
      } catch { throw new LineageEvidenceError("unsigned x402 preflight failed; no buyer purchase was launched") }
    }
    const buyer = owned.launch(["run", "--preload", guard, "packages/buyer/src/cli.ts", "loop-probe", "--hub", origin,
      "--seller", c.seller, "--input", JSON.stringify({ address: c.buyer }), "--max-amount", "0.35"], lineageEnvironment(c, "buyer"))
    await until(async () => buyer.done ? true : undefined, "one purchase exceeded its deadline; do not retry an unknown outcome", 90000)
    insist(buyer.child.exitCode === 0, "one purchase failed; reconcile retained database and chain before any rerun")
    await owned.stop(buyer); await owned.stop(runner); await owned.stop(hub)
    const { Database } = await import("bun:sqlite"); database = new Database(dbPath, { readonly: true })
    const load = (table: "jobs" | "receipts") => database!.query<{ json: string }, []>(`SELECT json FROM ${table} LIMIT 4`).all().map(r => JSON.parse(r.json) as unknown)
    const receipts = load("receipts"), jobs = load("jobs")
    const reservations = database.query<Record<string, unknown>, []>("SELECT * FROM tree_reservations LIMIT 3").all()
    insist(receipts.length === 3 && jobs.length === 3, "isolated run did not produce exactly three jobs/receipts")
    const chainReceipts: unknown[] = []
    for (const r of receipts) chainReceipts.push(await receipt(record(r)["settleTx"]))
    summary = assertLineageEvidence(c, { chainId: await rpc("eth_chainId", []), startBlock, jobs, receipts, reservations, cycle, chainReceipts,
      balances: { buyerBefore, subbuyerBefore, buyerAfter: await balance(c.buyer), subbuyerAfter: await balance(c.subbuyer) } })
    await writeFile(join(directory, "evidence.json"), JSON.stringify({ ...summary, verifiedAt: new Date().toISOString(),
      note: "Actual independent chain readback; private database retained separately. Canonical flow skill reads Arc's alternate RPC; payment/proof use rpc.testnet.arc.io." }, null, 2), { mode: 0o600 })
  } finally {
    clearTimeout(timer); process.off("SIGINT", abort); process.off("SIGTERM", abort)
    try { await owned.close() } finally { database?.close(); if (directory) console.log(`Retained isolated checkpoints (no keys): ${directory}. Reconcile before any rerun.`) }
  }
  insist(summary, "no verified lineage evidence")
  console.log("PASS — three real Arc settlements, exact two-descendant tree and actual unsigned lineage-cycle refusal; owned processes stopped.")
  for (const settlement of summary.settlements) console.log(`${settlement.skillId}: https://testnet.arcscan.app/tx/${settlement.settleTx}`)
}
export const main = async (argv = process.argv.slice(2)) => {
  if (argv.length === 1 && argv[0] === "--help") {
    console.log("Usage: bash scripts/e2e-lineage.sh\nOWNER supplies ARCADE_SELLER_KEY, ARCADE_BUYER_KEY, ARCADE_SUBBUY_KEY, ARCADE_FACILITATOR_KEY and ARCADE_FEE_SPLITTER matching the configured public A9 roles. One real Arc testnet $0.30 root, $0.05 + $0.01 descendants, plus facilitator gas. No keychain lookup, provisioning, owner HOME/config changes or existing services. Uses three canonical skills in an isolated maxConcurrency=3 runner. No uncertain-send retries. Reconcile retained private checkpoints before rerunning. No live proof can come from simulated tests.")
    return 0
  }
  try { insist(argv.length === 0, "unsupported arguments; use --help"); await runLiveLineage(readLineageConfig(process.env)); return 0 }
  catch (error) { console.error(`FAIL: ${error instanceof LineageEvidenceError ? error.message : "lineage evidence failed; private diagnostics withheld; reconcile retained checkpoints before retrying"}`); return 1 }
}
if (import.meta.main) process.exitCode = await main()
