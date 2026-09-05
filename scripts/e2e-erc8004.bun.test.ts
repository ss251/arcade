import { describe, expect, it } from "bun:test"
import { encodeAbiParameters, encodeEventTopics, parseAbi, parseAbiParameters } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  IDENTITY_REGISTRY_ABI, VALIDATION_REGISTRY_ABI, REPUTATION_REGISTRY_ABI,
  buildAgentRegistration, buildValidationRequest, buildValidationResponse, buildFeedback,
  docBytes, docHash, loadChainConfig, treeHashOf
} from "@arcade/core"
import { readEvidenceConfig, assertHubEvidence, assertSplitterEvidence, assertIdentityEvidence, assertErc8004Evidence, assertCommittedBytes, assertReceiptCorrelation,
  readBoundedBody, scanRange, roleEnvironment, OwnedProcesses, hubPreloadSource,
  type EvidenceBundle } from "./e2e-erc8004.ts"

// Fixed, unfunded offline keys. Never invoke the live entry point with this environment.
const roles = ["SELLER", "BUYER", "FACILITATOR", "OPERATOR", "VALIDATOR", "ATTESTER"] as const
const env: Record<string, string> = Object.fromEntries(roles.map((role, i) =>
  [`ARCADE_${role}_KEY`, `0x${String(i + 1).repeat(64)}`]))
env.ARCADE_FEE_SPLITTER = `0x${"7".repeat(40)}`
const operator = privateKeyToAccount(env.ARCADE_OPERATOR_KEY as `0x${string}`).address
const config = () => readEvidenceConfig(env, operator)
const registries = loadChainConfig("arc-testnet").erc8004!
const tx = (digit: string) => `0x${digit.repeat(64)}` as `0x${string}`
const origin = "http://127.0.0.1:32123"
const skillId = "usdc-flow-check", agentId = "123", jobId = "job_1234567890abcdef"
const event = (abi: readonly unknown[], name: string, args: Record<string, unknown>, types: string, values: unknown[], address: string) => ({
  address, topics: encodeEventTopics({ abi, eventName: name, args }),
  data: types === "" ? "0x" : encodeAbiParameters(parseAbiParameters(types), values)
})
const fixture = (): EvidenceBundle => {
  const c = config(), at = 1_800_000_000_000
  const manifest = { id: skillId, version: "0.1.0", serviceName: "USDC Flow Check", description: "Read USDC",
    tags: ["arc"], price: "$0.01", bounds: { timeoutSec: 30 }, inputSchema: { type: "object" },
    outputSchema: { type: "object", required: ["chainId"] } }
  const receipt = { jobId, skillId, skillVersion: "0.1.0", buyer: c.buyer, seller: c.seller, settled: true,
    rail: "eip3009", network: "eip155:5042002", settleTx: tx("a"), priceAtomic: "10000", sellerAtomic: "9500",
    feeAtomic: "500", feeBps: 500, authorizationNonce: tx("b"), treeHash: treeHashOf(jobId, []), createdAtMs: at }
  const job = { id: jobId, skillId, buyer: c.buyer, seller: c.seller, status: "succeeded",
    input: { address: c.buyer }, outcome: { status: "succeeded", stopReason: "end_turn", output: { chainId: 5042002 } } }
  const input = { ...receipt, origin, agentId, payTo: c.splitter, input: job.input, output: job.outcome.output,
    outputSchema: manifest.outputSchema, status: "succeeded", stopReason: "end_turn", priceAtomic: 10000n,
    reason: "PRIVATE-PROVIDER-REASON", chainId: 5042002, identityRegistry: registries.identity }
  const request = buildValidationRequest(input), requestHash = docHash(request)
  const response = buildValidationResponse({ ...input, requestHash, decidedAtMs: at })
  const feedback = buildFeedback({ ...input, attester: c.attester })
  const registration = buildAgentRegistration({ skillId, serviceName: manifest.serviceName, description: manifest.description, seller: c.seller, origin, agentId,
    chainId: 5042002, identityRegistry: registries.identity, active: true })
  const uri = `${origin}/listings/${skillId}/agent-registration.json`
  const receiptOf = (hash: string, from: string, to: string, logs: unknown[]) => ({
    transactionHash: hash, status: "0x1", from, to, blockNumber: "0x65", logs })
  const erc20 = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"])
  const tree = parseAbi(["event SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)"])
  const transfer = (from: string, to: string, amount: bigint) => event(erc20, "Transfer", { from, to }, "uint256", [amount], "0x3600000000000000000000000000000000000000")
  return {
    origin, startBlock: 100n, chainId: "0x4cef52", manifest, job, receipt,
    agent: { agentId, registrationTx: tx("c"), registry: registries.identity, chainId: 5042002, agentURI: uri,
      operator: c.operator, approvalTx: tx("d") },
    owner: c.seller, tokenURI: uri, approved: true, registrationBytes: docBytes(registration),
    requestBytes: docBytes(request), responseBytes: docBytes(response), feedbackBytes: docBytes(feedback),
    persistedBytes: { "validation-request": docBytes(request), "validation-response": docBytes(response), feedback: docBytes(feedback) },
    registrationReceipt: receiptOf(tx("c"), c.seller, registries.identity, [
      event(IDENTITY_REGISTRY_ABI, "Registered", { agentId: 123n, owner: c.seller }, "string", [uri], registries.identity),
      event(IDENTITY_REGISTRY_ABI, "Transfer", { from: `0x${"0".repeat(40)}`, to: c.seller, tokenId: 123n }, "", [], registries.identity)
    ]),
    approvalReceipt: receiptOf(tx("d"), c.seller, registries.identity, [event(
      parseAbi(["event ApprovalForAll(address indexed owner, address indexed operator, bool approved)"]),
      "ApprovalForAll", { owner: c.seller, operator: c.operator }, "bool", [true], registries.identity)]),
    settlementReceipt: receiptOf(tx("a"), c.facilitator, c.splitter, [transfer(c.buyer, c.splitter, 10000n), transfer(c.splitter, c.seller, 9500n),
      event(tree, "SettledTree", { buyer: c.buyer, nonce: receipt.authorizationNonce, treeHash: receipt.treeHash },
        "uint256,uint256,uint256,uint32,uint256", [10000n, 9500n, 500n, 0, 0n], c.splitter)]),
    requestReceipt: receiptOf(tx("e"), c.operator, registries.validation, [event(VALIDATION_REGISTRY_ABI, "ValidationRequest",
      { validatorAddress: c.validator, agentId: 123n, requestHash }, "string", [`${origin}/receipts/${jobId}/validation-request.json`], registries.validation)]),
    responseReceipt: receiptOf(tx("f"), c.validator, registries.validation, [event(VALIDATION_REGISTRY_ABI, "ValidationResponse",
      { validatorAddress: c.validator, agentId: 123n, requestHash }, "uint8,string,bytes32,string",
      [100, `${origin}/receipts/${jobId}/validation-response.json`, docHash(response), "arcade-settle"], registries.validation)]),
    feedbackReceipt: receiptOf(tx("9"), c.attester, registries.reputation, [event(REPUTATION_REGISTRY_ABI, "NewFeedback",
      { agentId: 123n, clientAddress: c.attester, indexedTag1: "arcade-settled" }, "uint64,int128,uint8,string,string,string,string,bytes32",
      [1n, 1n, 0, "arcade-settled", skillId, feedback.endpoint, `${origin}/receipts/${jobId}/feedback.json`, docHash(feedback)], registries.reputation)]),
    validationStatus: [c.validator, 123n, 100, docHash(response), "arcade-settle", 1800000000n],
    feedbackState: [[c.attester], [1n], [1n], [0], ["arcade-settled"], [skillId], [false]]
  }
}
const rec = (value: unknown) => value as Record<string, unknown>

describe("ERC-8004 evidence preflight", () => {
  it("requires all six explicit, pairwise-distinct funded-role keys without fallback", () => {
    for (const role of roles) expect(() => readEvidenceConfig({ ...env, [`ARCADE_${role}_KEY`]: undefined }, operator)).toThrow(`ARCADE_${role}_KEY`)
    for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) {
      expect(() => readEvidenceConfig({ ...env, [`ARCADE_${roles[j]}_KEY`]: env[`ARCADE_${roles[i]}_KEY`] }, operator)).toThrow("distinct")
    }
    expect(config().operator).toBe(operator)
  })
  it("requires explicit blanket approval consent matching the operator", () => {
    expect(() => readEvidenceConfig(env)).toThrow("--approve-operator")
    expect(() => readEvidenceConfig(env, config().seller)).toThrow("--approve-operator")
  })
  it("refuses wrong network, rail, RPC, splitter, role mismatch and arbitrary job controls", () => {
    for (const override of [{ ARCADE_NETWORK: "arc-mainnet" }, { ARCADE_RAIL: "test" }, { ARCADE_RPC_URL: "https://rpc.other.test" },
      { ARCADE_FEE_SPLITTER: `0x${"0".repeat(40)}` }, { SELLER: config().buyer }, { SKILL: "other" }, { INPUT: "{}" }]) {
      expect(() => readEvidenceConfig({ ...env, ...override }, operator)).toThrow()
    }
  })
  it("never includes invalid secrets in errors", () => {
    expect(() => readEvidenceConfig({ ...env, ARCADE_SELLER_KEY: "DO-NOT-PRINT" }, operator)).toThrow("ARCADE_SELLER_KEY is invalid")
    try { readEvidenceConfig({ ...env, ARCADE_SELLER_KEY: "DO-NOT-PRINT" }, operator) } catch (error) { expect(String(error)).not.toContain("DO-NOT-PRINT") }
  })
  it("checks every advertised public role and pinned registry before any approval", () => {
    const c = config(), hub = { armed: true, chainId: 5042002, caip2: "eip155:5042002", registries,
      operator: c.operator, validator: c.validator, attester: c.attester }
    expect(() => assertHubEvidence(c, hub)).not.toThrow()
    for (const override of [{ armed: false }, { chainId: 1 }, { operator: c.seller }, { validator: c.attester },
      { attester: c.validator }, { registries: { ...registries, validation: c.seller } }]) expect(() => assertHubEvidence(c, { ...hub, ...override })).toThrow()
  })
  it("refuses a non-V2 or wrong-asset splitter before any mint or paid purchase", () => {
    const c = config(), facts = { seller: c.seller, feeBps: 500, version: 2, usdc: "0x3600000000000000000000000000000000000000" }
    expect(() => assertSplitterEvidence(c, facts)).not.toThrow()
    for (const override of [{ version: 1 }, { version: "2" }, { version: undefined }, { feeBps: 1000 },
      { seller: c.buyer }, { usdc: c.buyer }]) expect(() => assertSplitterEvidence(c, { ...facts, ...override })).toThrow("splitter")
  })
})

describe("independently checked facts, never transaction hashes alone", () => {
  it("correlates every RPC receipt with its requested discovery hash before accepting it", () => {
    const receipt = rec(fixture().responseReceipt)
    expect(assertReceiptCorrelation(tx("f"), receipt)).toBe(receipt)
    expect(() => assertReceiptCorrelation(tx("e"), receipt)).toThrow("requested")
    expect(() => assertReceiptCorrelation(tx("f"), { ...rec(receipt), transactionHash: tx("1") })).toThrow("requested")
    expect(() => assertReceiptCorrelation("not-a-hash", receipt)).toThrow()
  })
  it("refuses removed or cross-transaction/block logs inside a returned receipt", () => {
    for (const override of [{ removed: true }, { transactionHash: tx("1") }, { blockNumber: "0x66" }, { blockHash: tx("2") }]) {
      const receipt = rec(fixture().responseReceipt)
      receipt.blockHash = tx("3")
      receipt.logs = (receipt.logs as unknown[]).map(log => ({ ...rec(log), ...override }))
      expect(() => assertReceiptCorrelation(tx("f"), receipt)).toThrow("log")
    }
    const good = rec(fixture().responseReceipt)
    good.blockHash = tx("3")
    good.logs = (good.logs as unknown[]).map(log => ({ ...rec(log), removed: false, transactionHash: tx("f"), blockNumber: "0x65", blockHash: tx("3") }))
    expect(() => assertReceiptCorrelation(tx("f"), good)).not.toThrow()
  })
  it("accepts exact mint, approval, settlement, writer events, status and committed bytes", () => {
    const result = assertErc8004Evidence(config(), fixture())
    expect(result).toMatchObject({ agentId, jobId, settlementTx: tx("a"), registrationTx: tx("c"), requestTx: tx("e"), responseTx: tx("f"), feedbackTx: tx("9") })
    expect(JSON.stringify(result)).not.toContain("PRIVATE-PROVIDER-REASON")
  })
  it("can verify the mint and blanket approval independently before spending on a job", () => {
    const proof = fixture()
    expect(assertIdentityEvidence(config(), proof)).toEqual({ agentId, registrationTx: tx("c") })
    expect(() => assertIdentityEvidence(config(), { ...proof, approved: false })).toThrow()
  })
  it.each(["registrationReceipt", "approvalReceipt", "settlementReceipt", "requestReceipt", "responseReceipt", "feedbackReceipt"] as const)("requires real successful exact-sender %s and matching contract logs", field => {
    for (const override of [{ status: "0x0" }, { from: config().buyer }, { to: config().buyer }, { logs: [] }, { blockNumber: "0x63" }]) {
      const proof = fixture(); proof[field] = { ...rec(proof[field]), ...override }
      expect(() => assertErc8004Evidence(config(), proof)).toThrow()
    }
  })
  it("rejects mint logs from another contract and a non-mint transfer", () => {
    const proof = fixture(), r = rec(proof.registrationReceipt), logs = r.logs as Record<string, unknown>[]
    r.logs = logs.map(log => ({ ...log, address: config().buyer }))
    expect(() => assertErc8004Evidence(config(), proof)).toThrow()
    const second = fixture(), rr = rec(second.registrationReceipt)
    rr.logs = [(rr.logs as unknown[])[0], event(IDENTITY_REGISTRY_ABI, "Transfer", { from: config().buyer, to: config().seller, tokenId: 123n }, "", [], registries.identity)]
    expect(() => assertErc8004Evidence(config(), second)).toThrow()
  })
  it("requires current ownership, exact URI, approval and real testnet", () => {
    for (const override of [{ owner: config().buyer }, { tokenURI: "https://elsewhere.test" }, { approved: false }, { chainId: "0x1" }]) {
      expect(() => assertErc8004Evidence(config(), { ...fixture(), ...override })).toThrow()
    }
  })
  it("rejects payment/job/amount/lineage mismatches and a simulated canary", () => {
    for (const override of [{ skillId: "other" }, { buyer: config().seller }, { settled: false }, { rail: "test" },
      { priceAtomic: "9999" }, { feeAtomic: "0" }, { canary: true }, { treeHash: tx("8") }]) {
      const proof = fixture(); proof.receipt = { ...rec(proof.receipt), ...override }
      expect(() => assertErc8004Evidence(config(), proof)).toThrow()
    }
  })
  it("requires exact document bytes both from durable storage and public HTTP", () => {
    for (const field of ["requestBytes", "responseBytes", "feedbackBytes", "registrationBytes"] as const) {
      const proof = fixture(); proof[field] += "\n"
      expect(() => assertErc8004Evidence(config(), proof)).toThrow()
    }
    const proof = fixture(); proof.persistedBytes.feedback = "{}"
    expect(() => assertErc8004Evidence(config(), proof)).toThrow()
    expect(() => assertCommittedBytes('{"ok":true}', docHash({ ok: true }))).not.toThrow()
    expect(() => assertCommittedBytes('{"ok":true}\n', docHash({ ok: true }))).toThrow()
  })
  it("does not accept a valid document paired with another on-chain hash", () => {
    expect(() => assertCommittedBytes('{"ok":true}', tx("1"))).toThrow("commitment")
    expect(() => assertCommittedBytes('{"ok":true,"ok":false}', docHash({ ok: false }))).toThrow("compact")
    const proof = fixture()
    const response = rec(proof.responseReceipt)
    response.logs = [event(VALIDATION_REGISTRY_ABI, "ValidationResponse", {
      validatorAddress: config().validator, agentId: 123n, requestHash: docHash(JSON.parse(proof.requestBytes)) },
      "uint8,string,bytes32,string", [100, `${origin}/receipts/${jobId}/validation-response.json`, tx("1"), "arcade-settle"], registries.validation)]
    expect(() => assertErc8004Evidence(config(), proof)).toThrow("ValidationResponse")
  })
  it("does not accept unrelated/failed validation or aggregate/unrelated feedback", () => {
    for (const validationStatus of [[config().attester, 123n, 100, docHash({}), "arcade-settle", 1n],
      [config().validator, 124n, 100, docHash({}), "arcade-settle", 1n],
      [config().validator, 123n, 0, docHash({}), "arcade-settle", 1n]]) {
      expect(() => assertErc8004Evidence(config(), { ...fixture(), validationStatus })).toThrow()
    }
    const proof = fixture(); proof.feedbackState = [[config().seller], [1n], [1n], [0], ["arcade-settled"], [skillId], [false]]
    expect(() => assertErc8004Evidence(config(), proof)).toThrow()
    const revoked = fixture(); (revoked.feedbackState as unknown[][])[6] = [true]
    expect(() => assertErc8004Evidence(config(), revoked)).toThrow()
  })
})

describe("bounded read-only discovery and process ownership", () => {
  it("bounds event scans to the fresh run, with no genesis scan or backwards range", () => {
    expect(scanRange(100n, 101n)).toEqual({ fromBlock: "0x64", toBlock: "0x65" })
    for (const end of [99n, 100n + 2048n]) expect(() => scanRange(100n, end)).toThrow()
  })
  it("bounds HTTP body bytes, rejects redirects/status failures, and times out hung reads", async () => {
    expect(await readBoundedBody(new Response("abc"), 3, 100)).toBe("abc")
    await expect(readBoundedBody(new Response("abcd"), 3, 100)).rejects.toThrow()
    await expect(readBoundedBody(new Response("secret", { status: 500 }), 100, 100)).rejects.toThrow()
    await expect(readBoundedBody(new Response(null, { status: 302 }), 100, 100)).rejects.toThrow()
    await expect(readBoundedBody(new Response(new ReadableStream({ start() {} })), 100, 20)).rejects.toThrow("deadline")
  })
  it("gives child roles only required keys, never inherited HOME or injection options", () => {
    const c = config()
    expect(Object.keys(roleEnvironment(c, "hub")).filter(key => key.endsWith("_KEY")).sort()).toEqual([
      "ARCADE_ATTESTER_KEY", "ARCADE_FACILITATOR_KEY", "ARCADE_OPERATOR_KEY", "ARCADE_VALIDATOR_KEY"])
    expect(Object.keys(roleEnvironment(c, "seller")).filter(key => key.endsWith("_KEY"))).toEqual(["ARCADE_SELLER_KEY"])
    expect(Object.keys(roleEnvironment(c, "buyer")).filter(key => key.endsWith("_KEY"))).toEqual(["ARCADE_BUYER_KEY"])
    expect(roleEnvironment(c, "seller")).not.toHaveProperty("HOME")
    expect(roleEnvironment(c, "seller")).not.toHaveProperty("NODE_OPTIONS")
  })
  it("stops and reaps only its real owned process, with bounded escalation", async () => {
    const owned = new OwnedProcesses(), child = owned.launch(["-e", "setInterval(() => {}, 1000)"], { PATH: process.env.PATH ?? "/usr/bin:/bin" })
    await owned.stop(child)
    expect(child.done).toBe(true)
    expect(owned.size).toBe(0)
    await owned.close()
  })
  it("refuses another manager's real child without signaling it", async () => {
    const owner = new OwnedProcesses(), other = new OwnedProcesses()
    const child = owner.launch(["-e", "setInterval(() => {}, 1000)"], { PATH: process.env.PATH ?? "/usr/bin:/bin" })
    try {
      await expect(other.stop(child)).rejects.toThrow("unowned")
      expect(child.done).toBe(false)
    } finally { await owner.close() }
  })
  it("disables automatic dotenv loading in actual owned Bun children", async () => {
    const owner = new OwnedProcesses()
    let output = ""
    const child = owner.launch(["-e", "console.log(JSON.stringify(process.execArgv))"], { PATH: process.env.PATH ?? "/usr/bin:/bin" }, text => { output += text })
    try {
      await child.exited
      expect(output).toContain("--no-env-file")
    } finally { await owner.close() }
  })
  it("uses actual loopback port discovery and orphan deadlines without protocol mocks", () => {
    const preload = hubPreloadSource()
    expect(preload).toContain('hostname: "127.0.0.1"')
    expect(preload).toContain("server.port")
    expect(preload).toContain("process.ppid")
    expect(preload).not.toContain("mock.module")
  })
  it("shell help is import-safe and missing keys refuse before setup without leaking injected env", () => {
    const shell = fileURLToPath(new URL("./e2e-erc8004.sh", import.meta.url))
    const clean = { PATH: process.env.PATH ?? "/usr/bin:/bin" }
    const help = spawnSync("bash", [shell, "--help"], { env: clean, encoding: "utf8", timeout: 10000 })
    expect(help.status).toBe(0); expect(help.stdout).toContain("--approve-operator")
    expect(help.stdout).toContain("ALL current and future")
    const refusal = spawnSync("bash", [shell], { env: clean, encoding: "utf8", timeout: 10000 })
    expect(refusal.status).toBe(1); expect(refusal.stderr).toContain("ARCADE_SELLER_KEY")
    expect(refusal.stdout).not.toContain("Local evidence directory")
  })
  it("refuses an invalid network before module initialization without reflecting its value", () => {
    const shell = fileURLToPath(new URL("./e2e-erc8004.sh", import.meta.url))
    const result = spawnSync("bash", [shell], { env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ARCADE_NETWORK: "SECRET-NETWORK-VALUE" },
      encoding: "utf8", timeout: 10000 })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Arc testnet")
    expect(result.stderr).not.toContain("SECRET-NETWORK-VALUE")
  })
})
