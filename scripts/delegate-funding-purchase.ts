/** Owned loopback first-party call following independently proved J5 delivery. */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { decodeEventLog, parseAbi, type Hex } from "viem"
import type { privateKeyToAccount } from "viem/accounts"
import { treeHashOf } from "@arcade/core"
import { callSkillPromise } from "../packages/buyer/src/index.ts"
import { paymentChoices } from "../packages/buyer/src/accept-selection.ts"
import { OwnedProcesses, readBoundedBody } from "./e2e-erc8004.ts"
import { guardedSkillSource, lineagePreloadSource } from "./e2e-lineage.ts"
import { DELEGATE_PROOF as P, proofAddress, proofCheck, proofHash, type ProofLog } from "./delegate-funding-proof.ts"
import { PROOF_FACILITATOR } from "./delegate-proof-keys.ts"
import type { DelegateProofChain } from "./delegate-funding-chain.ts"
const ROOT = fileURLToPath(new URL("../", import.meta.url)), SKILL = "usdc-flow-check"
const ABI = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)",
  "event SettledTree(address indexed buyer,uint256 total,uint256 sellerAmount,uint256 feeAmount,bytes32 indexed nonce,bytes32 indexed treeHash,uint32 childCount,uint256 childTotalAtomic)",
  "event Settled(address indexed buyer,uint256 total,uint256 sellerAmount,uint256 feeAmount,bytes32 indexed nonce)",
  "function seller() view returns(address)", "function treasury() view returns(address)", "function feeBps() view returns(uint16)",
  "function usdc() view returns(address)", "function version() pure returns(uint8)", "function accruedFees() view returns(uint256)"])
const atomic = (v: unknown): bigint => {
  const value = v && typeof v === "object" ? (v as Record<string, unknown>).__bigint : v
  proofCheck(typeof value === "bigint" || typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value))
  return BigInt(value)
}
export function assertDelegatePurchase(receipt: Record<string, unknown>, job: Record<string, unknown>, logs: readonly ProofLog[]) {
  const jobId = receipt.jobId
  proofCheck(typeof jobId === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(jobId) && job.id === jobId &&
    receipt.skillId === SKILL && receipt.skillVersion === "0.1.0" && receipt.rail === "eip3009" &&
    receipt.network === "eip155:5042002" && receipt.settled === true && receipt.canary !== true &&
    proofAddress(receipt.buyer) === P.delegate && proofAddress(receipt.seller) === P.seller &&
    atomic(receipt.priceAtomic) === P.paymentAtomic && atomic(receipt.sellerAtomic) === 9500n &&
    atomic(receipt.feeAtomic) === 500n && receipt.feeBps === 500 &&
    receipt.rootJobId === jobId && receipt.parentJobId === undefined && receipt.hop === 0 &&
    Array.isArray(receipt.ancestors) && receipt.ancestors.length === 0 &&
    Array.isArray(receipt.children) && receipt.children.length === 0 && atomic(receipt.treeCommittedAtomic) === 0n)
  const treeHash = treeHashOf(jobId, []), nonce = proofHash(receipt.authorizationNonce)
  proofCheck(proofHash(receipt.treeHash) === treeHash && job.skillId === SKILL && job.status === "succeeded" &&
    proofAddress(job.buyer) === P.delegate && proofAddress(job.seller) === P.seller &&
    atomic(job.priceAtomic) === P.paymentAtomic && JSON.stringify(job.input) === JSON.stringify({ address: P.delegate }))
  const outcome = job.outcome as Record<string, unknown>, output = outcome?.output as Record<string, unknown>
  proofCheck(outcome?.status === "succeeded" && outcome.stopReason === "end_turn" &&
    proofAddress(output?.address) === P.delegate && output.chainId === 5042002 && typeof output.balanceUsdc === "string")
  proofCheck(logs.length <= 128)
  let incoming = 0, seller = 0, settled = 0
  for (const log of logs) {
    let event
    try { event = decodeEventLog({ abi: ABI, topics: log.topics as [Hex, ...Hex[]], data: log.data, strict: true }) } catch { continue }
    if (event.eventName === "Transfer" && proofAddress(log.address) === P.token) {
      const e = event.args
      if (proofAddress(e.from) === P.delegate && proofAddress(e.to) === P.splitter) { proofCheck(e.value === 10000n); incoming++ }
      if (proofAddress(e.from) === P.splitter && proofAddress(e.to) === P.seller) {
        proofCheck(e.value === 9500n); seller++
      }
    }
    if (proofAddress(log.address) === P.splitter && event.eventName !== "Transfer") {
      proofCheck(event.eventName === "Settled")
      const e = event.args
      proofCheck(proofAddress(e.buyer) === P.delegate && e.total === 10000n && e.sellerAmount === 9500n && e.feeAmount === 500n &&
        e.nonce === nonce)
      settled++
    }
  }
  proofCheck(incoming === 1 && seller === 1 && settled === 1)
  return Object.freeze({ txHash: proofHash(receipt.settleTx), jobId, amount: P.paymentAtomic, treeHash })
}
export interface OwnedDelegatePurchaseOptions {
  readonly directory: string; readonly chain: DelegateProofChain; readonly signal: AbortSignal
  readonly deadlineMs: number; readonly acquireDelegate: () => Promise<ReturnType<typeof privateKeyToAccount>>
}
export async function ownedDelegatePurchase(o: OwnedDelegatePurchaseOptions) {
  const owned = new OwnedProcesses(), nativeFetch = globalThis.fetch
  const active = () => proofCheck(!o.signal.aborted && performance.now() < o.deadlineMs)
  let database: import("bun:sqlite").Database | undefined
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "en_US.UTF-8",
    ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "eip3009", ARCADE_RPC_URL: P.rpc, ARCADE_CHAIN_CHECK: "1" }
  const keysModule = fileURLToPath(new URL("./delegate-proof-keys.ts", import.meta.url))
  const guardModule = fileURLToPath(new URL("./delegate-purchase-guard.ts", import.meta.url))
  const marker = "j5-" + crypto.randomUUID()
  const preload = join(o.directory, "hub-preload.ts"), sellerPreload = join(o.directory, "seller-preload.ts")
  let origin = "", buffer = "", requests = 0, paymentPosts = 0, signed = false
  const http = (async (input, init) => {
    active()
    const request = new Request(input, init), url = new URL(request.url)
    proofCheck(origin && url.origin === origin && ++requests <= 200)
    const paid = request.headers.has("payment-signature") || request.headers.has("x-payment")
    if (paid) {
      proofCheck(paymentPosts === 0 && request.method === "POST" && url.pathname === `/x/${P.seller}/${SKILL}`)
      paymentPosts++
    }
    const response = await nativeFetch(request, { redirect: "error", credentials: "omit",
      signal: AbortSignal.any([o.signal, request.signal, AbortSignal.timeout(5000)]) })
    const body = await readBoundedBody(new Response(response.body, { headers: response.headers }), 262144)
    active(); return new Response(body, { status: response.status, headers: response.headers })
  }) as typeof fetch
  const json = async (path: string) => (await http(origin + path)).json()
  const until = async (condition: () => Promise<boolean>, duration: number) => {
    const deadline = Math.min(o.deadlineMs, performance.now() + duration)
    do { active(); if (await condition()) return; await o.chain.pause(250) } while (performance.now() < deadline)
    proofCheck(false)
  }
  try {
    const block = await o.chain.finalized(), at = { blockNumber: block.blockNumber }
    for (const [name, expected] of [["seller", P.seller], ["treasury", P.seller], ["usdc", P.token]] as const)
      proofCheck(proofAddress(await o.chain.client.readContract({ address: P.splitter, abi: ABI, functionName: name, ...at })) === expected)
    proofCheck(await o.chain.client.readContract({ address: P.splitter, abi: ABI, functionName: "feeBps", ...at }) === 500 &&
      await o.chain.client.readContract({ address: P.splitter, abi: ABI, functionName: "version", ...at }) === 2 &&
      await o.chain.client.getBalance({ address: PROOF_FACILITATOR, ...at }) >= P.perTransactionGasCapWei)
    const before = await o.chain.client.getBalance({ address: P.delegate, ...at })
    const sellerBefore = await o.chain.client.getBalance({ address: P.seller, ...at })
    const feesBefore = await o.chain.client.readContract({ address: P.splitter, abi: ABI, functionName: "accruedFees", ...at })
    proofCheck(before >= P.paymentAtomic * 1000000000000n)
    const manifestBytes = await readFile(join(ROOT, "skills", SKILL, "arcade.json"), "utf8"), manifest = JSON.parse(manifestBytes)
    proofCheck(manifest.id === SKILL && manifest.price === "$0.01" && manifest.version === "0.1.0" &&
      manifest.engine?.adapter === "script" && manifest.engine.entry === "run.ts" && !manifest.engine.args &&
      manifest.bounds?.timeoutSec === 30 && manifest.secrets?.length === 0 && !manifest.engine.capabilities)
    const skillDir = join(o.directory, "skills", SKILL)
    await mkdir(skillDir, { recursive: true, mode: 0o700 })
    const entry = join(skillDir, "guarded-run.ts"), executable = join(skillDir, "guarded-run")
    await writeFile(entry, guardedSkillSource(await readFile(join(ROOT, "skills", SKILL, "run.ts"), "utf8")), { flag: "wx", mode: 0o600 })
    const q = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'"
    await writeFile(executable, "#!/bin/sh\nexec " + q(process.execPath) + " --no-env-file run " + q(entry) + "\n", { flag: "wx", mode: 0o700 })
    await writeFile(join(skillDir, "arcade.json"), JSON.stringify({ ...manifest, engine: { ...manifest.engine, entry: "guarded-run" }, rails: ["eip3009"] }), { flag: "wx", mode: 0o600 })
    await writeFile(preload, lineagePreloadSource(marker) +
      `\nimport {proofPrivateKey} from ${JSON.stringify(keysModule)};\nimport {installProofRelayGuard} from ${JSON.stringify(guardModule)};\nawait installProofRelayGuard(${JSON.stringify(join(o.directory, "relay.jsonl"))});\nprocess.env.ARCADE_FACILITATOR_KEY = await proofPrivateKey("facilitator");\n`, { flag: "wx", mode: 0o600 })
    await writeFile(sellerPreload, guardedSkillSource(`import {proofPrivateKey} from ${JSON.stringify(keysModule)};\nprocess.env.ARCADE_SELLER_KEY = await proofPrivateKey("seller");\n`), { flag: "wx", mode: 0o600 })
    const db = join(o.directory, "hub.sqlite")
    const hub = owned.launch(["run", "--preload", preload, "apps/hub/src/server.ts"], { ...env, ARCADE_DB: db, PORT: "0" }, text => {
      buffer = (buffer + text).slice(-16384)
      const match = buffer.match(new RegExp("\\[" + marker + "-port\\] ([0-9]{1,5})(?:\\r?\\n)"))
      if (match && Number(match[1]) > 0 && Number(match[1]) <= 65535) origin = "http://127.0.0.1:" + match[1]
    })
    await until(async () => {
      proofCheck(!hub.done)
      if (!origin) return false
      try { return (await json("/healthz")).ok === true } catch { return false }
    }, 15000)
    const runnerId = "rnr_j5_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10), config = join(o.directory, "runner.json")
    proofCheck(Buffer.byteLength(`${o.directory}/arcade-hire-${runnerId}.sock`) < 104)
    await writeFile(config, JSON.stringify({ runnerId, sellerAddress: P.seller, hubUrl: origin, maxConcurrency: 1 }), { flag: "wx", mode: 0o600 })
    const runner = owned.launch(["run", "--preload", sellerPreload, "packages/runner/src/cli.ts", "start", "--skills", join(o.directory, "skills")],
      { ...env, ARCADE_CONFIG_PATH: config, ARCADE_FEE_SPLITTER: P.splitter, TMPDIR: o.directory })
    await until(async () => {
      proofCheck(!hub.done && !runner.done)
      const listings = await json("/listings")
      return Array.isArray(listings) && listings.length === 1 && listings[0].id === SKILL &&
        listings[0].price === "$0.01" && proofAddress(listings[0].seller) === P.seller
    }, 30000)
    const target = `${origin}/x/${P.seller}/${SKILL}`
    const challenge = await http(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: P.delegate }) })
    const body = await challenge.json(), choices = paymentChoices(body.accepts, ["eip3009"])
    proofCheck(challenge.status === 402 && body.x402Version === 2 && choices.length === 1 && choices[0]!.amountAtomic === P.paymentAtomic &&
      choices[0]!.requirements.network === "eip155:5042002" &&
      proofAddress(choices[0]!.requirements.payTo) === P.splitter && proofAddress(choices[0]!.requirements.asset) === P.token &&
      choices[0]!.requirements.resource === target && choices[0]!.requirements.extra?.feeSplitterVersion === 2)
    const account = await o.acquireDelegate()
    proofCheck(proofAddress(account.address) === P.delegate)
    const paidAccount: ReturnType<typeof privateKeyToAccount> = { ...account, signTypedData: async input => {
      active(); proofCheck(!signed); signed = true; return account.signTypedData(input)
    } }
    const result = await callSkillPromise({ hubUrl: origin, expectedHubUrl: origin, seller: P.seller, skillId: SKILL,
      input: { address: P.delegate }, maxAmountAtomic: P.paymentAtomic, preferRail: ["eip3009"], pollIntervalMs: 1000, maxWaitMs: 60000, fetch: http,
      account: paidAccount })
    proofCheck(paymentPosts === 1 && signed && result.authorizedRail === "eip3009" && result.authorizedAmountAtomic === P.paymentAtomic)
    await owned.close()
    const { Database } = await import("bun:sqlite"); database = new Database(db, { readonly: true })
    const jobs = database.query<{ json: string }, []>("SELECT json FROM jobs LIMIT 2").all()
    const receipts = database.query<{ json: string }, []>("SELECT json FROM receipts LIMIT 2").all()
    proofCheck(jobs.length === 1 && receipts.length === 1)
    const receipt = JSON.parse(receipts[0]!.json), job = JSON.parse(jobs[0]!.json)
    const txHash = proofHash(receipt.settleTx)
    proofCheck(result.jobId === receipt.jobId && proofHash(result.receipt.settleTx) === txHash)
    const relay = JSON.parse((await readFile(join(o.directory, "relay.jsonl"), "utf8")).trim())
    proofCheck(relay.stage === "settlement_prepared" && relay.txHash === txHash)
    const proved = await o.chain.confirmed(txHash, PROOF_FACILITATOR, P.splitter)
    proofCheck(proved.gasWei <= P.perTransactionGasCapWei &&
      before - await o.chain.client.getBalance({ address: P.delegate, blockNumber: proved.blockNumber }) === P.paymentAtomic * 1000000000000n)
    proofCheck(await o.chain.client.getBalance({ address: P.seller, blockNumber: proved.blockNumber }) - sellerBefore === 9500n * 1000000000000n &&
      await o.chain.client.readContract({ address: P.splitter, abi: ABI, functionName: "accruedFees", blockNumber: proved.blockNumber }) - feesBefore === 500n)
    const summary = assertDelegatePurchase(receipt, job, proved.receipt.logs)
    await o.chain.canonical(proved.blockNumber, proved.blockHash)
    return { ...summary, blockNumber: proved.blockNumber, blockHash: proved.blockHash, gasWei: proved.gasWei }
  } finally { try { await owned.close() } finally { database?.close() } }
}
