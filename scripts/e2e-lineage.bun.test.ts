import { describe, expect, it } from "bun:test"
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, parseAbi, parseAbiParameters } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Database } from "bun:sqlite"
import { treeHashOf } from "@arcade/core"
import { readLineageConfig, lineageEnvironment, assertLineageEvidence, cycleObservation,
  guardedSkillSource, lineagePreloadSource, assertCanonicalListings, prepareLineageSkillsFromSourcesForTest,
  prepareHistoricalLineageSkillsForTest, verifyHistoricalLineageSourcesForTest, lineageRunnerConfig,
  assertPublishedLineage, assertLineageChallenge, type LineageSkillFiles, type LineageConfig,
  type LineageBundle } from "./e2e-lineage.ts"
import { OwnedProcesses } from "./e2e-erc8004.ts"

const roles = ["seller", "buyer", "facilitator", "subbuyer"] as const
const names = { seller: "ARCADE_SELLER_KEY", buyer: "ARCADE_BUYER_KEY", facilitator: "ARCADE_FACILITATOR_KEY", subbuyer: "ARCADE_SUBBUY_KEY" }
const keys = Object.fromEntries(roles.map((r, i) => [r, `0x${String(i + 1).repeat(64)}`])) as Record<typeof roles[number], `0x${string}`>
const accounts = Object.fromEntries(roles.map(r => [r, privateKeyToAccount(keys[r]).address])) as Record<typeof roles[number], string>
const env = Object.fromEntries(roles.map(r => [names[r], keys[r]]))
env.ARCADE_FEE_SPLITTER = `0x${"7".repeat(40)}`
const config = (): LineageConfig => readLineageConfig(env, accounts)
const tx = (c: string) => `0x${c.repeat(64)}` as `0x${string}`
const id = (c: string) => `job_${c.repeat(20)}`
const skills = ["loop-probe", "wallet-risk-note", "usdc-flow-check"] as const
const prices = [300000n, 50000n, 10000n]
const rec = (v: unknown) => v as Record<string, unknown>
const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Settled(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce)",
  "event SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)"
])
const event = (name: "Transfer" | "Settled" | "SettledTree", args: Record<string, unknown>, types: string, values: unknown[], address: string) => ({
  address, topics: encodeEventTopics({ abi: ABI, eventName: name, args }), data: encodeAbiParameters(parseAbiParameters(types), values)
})
const fixture = (): LineageBundle => {
  const c = config(), ids = [id("a"), id("b"), id("c")], hashes = [tx("a"), tx("b"), tx("c")]
  const children = [1, 2].map(i => ({ jobId: ids[i]!, skillId: skills[i]!, priceAtomic: prices[i]!, settled: true, settleTx: hashes[i]! }))
  const treeHash = treeHashOf(ids[0]!, children)
  const receipts = skills.map((skillId, i) => ({ jobId: ids[i], skillId, skillVersion: "0.1.0", buyer: i === 0 ? c.buyer : c.subbuyer,
    seller: c.seller, priceAtomic: prices[i], sellerAtomic: prices[i]! * 95n / 100n, feeAtomic: prices[i]! / 20n, feeBps: 500,
    rail: "eip3009", network: "eip155:5042002", settled: true, settleTx: hashes[i], authorizationNonce: tx(String(i + 1)),
    rootJobId: ids[0], ...(i === 0 ? { children, treeHash, treeCommittedAtomic: 60000n, treeCeilingAtomic: 250000n } : { parentJobId: ids[i - 1] }),
    hop: i, ancestors: skills.slice(0, i) }))
  const jobs = receipts.map((r, i) => ({ id: r.jobId, skillId: r.skillId, seller: r.seller, buyer: r.buyer, priceAtomic: r.priceAtomic,
    rootJobId: r.rootJobId, ...(i === 0 ? {} : { parentJobId: ids[i - 1] }), hop: i, ancestors: skills.slice(0, i), status: "succeeded",
    input: { address: c.buyer }, outcome: { status: "succeeded", stopReason: "end_turn", output: i === 0 ? { ok: true, hired: ["settled", "loop-probe refused: lineage_cycle"] }
      : i === 1 ? { address: c.buyer, sourcedFrom: { skillId: "usdc-flow-check", paidUsdc: "$0.0100" }, verdict: "ok" }
      : { address: c.buyer, chainId: 5042002, balanceUsdc: "2.000000" } } }))
  const chainReceipts = receipts.map((r, i) => ({ status: "0x1", transactionHash: hashes[i], from: c.facilitator, to: c.splitter,
    blockNumber: `0x${(101 + i).toString(16)}`, logs: [
      event("Transfer", { from: r.buyer, to: c.splitter }, "uint256", [r.priceAtomic], "0x3600000000000000000000000000000000000000"),
      event("Transfer", { from: c.splitter, to: c.seller }, "uint256", [r.sellerAtomic], "0x3600000000000000000000000000000000000000"),
      i === 0 ? event("SettledTree", { buyer: r.buyer, nonce: r.authorizationNonce, treeHash }, "uint256,uint256,uint256,uint32,uint256", [r.priceAtomic, r.sellerAtomic, r.feeAtomic, 2, 60000n], c.splitter)
        : event("Settled", { buyer: r.buyer, nonce: r.authorizationNonce }, "uint256,uint256,uint256", [r.priceAtomic, r.sellerAtomic, r.feeAtomic], c.splitter)
    ] }))
  return { chainId: "0x4cef52", startBlock: 100n, receipts, jobs, chainReceipts,
    reservations: children.map(child => ({ child_job_id: child.jobId, root_job_id: ids[0], amount_atomic: child.priceAtomic.toString(), state: "committed" })),
    cycle: [{ path: `/x/${c.seller}/loop-probe`, status: 402, error: "lineage_cycle", hadLineage: true, hadPayment: false }],
    balances: { buyerBefore: 1000000n, buyerAfter: 700000n, subbuyerBefore: 1000000n, subbuyerAfter: 940000n } }
}

describe("isolated lineage preflight", () => {
  it("requires supplied roles, allows only seller/facilitator reuse and checks expected owner addresses", () => {
    expect(config().buyer).toBe(accounts.buyer)
    for (const role of roles) expect(() => readLineageConfig({ ...env, [names[role]]: undefined }, accounts)).toThrow("required")
    expect(() => readLineageConfig(env)).toThrow("owner")
    const reused = { ...env, ARCADE_FACILITATOR_KEY: keys.seller }
    expect(() => readLineageConfig(reused, { ...accounts, facilitator: accounts.seller })).not.toThrow()
    for (const role of ["seller", "buyer", "facilitator"] as const) {
      expect(() => readLineageConfig({ ...env, ARCADE_SUBBUY_KEY: keys[role] }, { ...accounts, subbuyer: accounts[role] })).toThrow("distinct")
    }
  })
  it("refuses selectors, arbitrary input/hub and unsafe rail/RPC before any setup without reflecting secrets", () => {
    for (const override of [{ ARCADE_NETWORK: "mainnet" }, { ARCADE_RAIL: "test" }, { ARCADE_RPC_URL: "https://wrong" },
      { SKILL: "other" }, { INPUT: "{}" }, { ARCADE_HUB: "https://remote" }, { ARCADE_SELLER_KEY: "PRIVATE-KEY" }]) {
      expect(() => readLineageConfig({ ...env, ...override }, accounts)).toThrow()
      try { readLineageConfig({ ...env, ...override }, accounts) } catch (e) { expect(String(e)).not.toContain("PRIVATE-KEY") }
    }
  })
  it("gives each owned process only its role keys and never canary/injection/config/HOME state", () => {
    const c = config(), hub = lineageEnvironment(c, "hub"), seller = lineageEnvironment(c, "seller"), buyer = lineageEnvironment(c, "buyer")
    expect(hub.ARCADE_FACILITATOR_KEY).toBe(keys.facilitator)
    expect(seller.ARCADE_SUBBUY_KEY).toBe(keys.subbuyer)
    expect(seller.ARCADE_SELLER_KEY).toBe(keys.seller)
    expect(buyer.ARCADE_BUYER_KEY).toBe(keys.buyer)
    for (const e of [hub, seller, buyer]) for (const name of ["HOME", "ARCADE_CONFIG_PATH", "ARCADE_CANARY_KEY", "ARCADE_OPERATOR_KEY", "NODE_OPTIONS", "BUN_OPTIONS"])
      expect(e[name]).toBeUndefined()
    expect(hub.ARCADE_BUYER_KEY).toBeUndefined(); expect(buyer.ARCADE_SUBBUY_KEY).toBeUndefined()
  })
  it("fixes concurrency at three and refuses an overlong Unix socket path or non-loopback hub", () => {
    const c = config(), cfg = lineageRunnerConfig(c, "http://127.0.0.1:12345", "/tmp/arcade-a9-short")
    expect(cfg.maxConcurrency).toBe(3); expect(cfg.sellerAddress).toBe(c.seller)
    expect(JSON.stringify(cfg)).not.toContain(keys.seller)
    expect(() => lineageRunnerConfig(c, "http://127.0.0.1:12345", "/tmp/" + "long".repeat(40))).toThrow("socket")
    expect(() => lineageRunnerConfig(c, "https://external.example", "/tmp/a9")).toThrow("loopback")
  })
  it("uses actual public listing fields and separately requires unsigned x402 V2 routing before buying", () => {
    const c = config(), published = skills.map((skillId, i) => ({ id: skillId, version: "0.1.0", seller: c.seller, price: ["$0.30", "$0.05", "$0.01"][i] }))
    expect(() => assertPublishedLineage(c, published)).not.toThrow()
    expect(() => assertPublishedLineage(c, published.map((r, i) => i === 1 ? { ...r, price: "$0.15" } : r))).toThrow()
    for (const [i, skill] of skills.entries()) {
      const resource = `http://127.0.0.1:12345/x/${c.seller}/${skill}`
      const requirement = { scheme: "exact", network: "eip155:5042002", amount: prices[i]!.toString(), asset: "0x3600000000000000000000000000000000000000",
        payTo: c.splitter, resource, extra: { feeSplitter: c.splitter, feeSplitterVersion: 2 } }
      expect(() => assertLineageChallenge(c, skill, resource, 402, { x402Version: 2, accepts: [requirement] })).not.toThrow()
      for (const override of [{ amount: "1" }, { payTo: c.seller }, { asset: c.seller }, { resource: "http://other" },
        { network: "eip155:1" }, { extra: { feeSplitter: c.splitter, feeSplitterVersion: 1 } }, { extra: {} }]) {
        expect(() => assertLineageChallenge(c, skill, resource, 402, { x402Version: 2, accepts: [{ ...requirement, ...override }] })).toThrow()
      }
      expect(() => assertLineageChallenge(c, skill, resource, 200, { x402Version: 2, accepts: [requirement] })).toThrow()
    }
  })
})
describe("exact current three-settlement proof", () => {
  it("accepts three correlated transactions with only the root tree event and two ordinary child settlements", () => {
    const result = assertLineageEvidence(config(), fixture())
    expect(result.settlements.map(r => r.skillId)).toEqual([...skills])
    expect(result.childTotalAtomic).toBe("60000")
    expect<unknown>(result.treeHash).toBe(rec(fixture().receipts[0]).treeHash)
    expect(JSON.stringify(result)).not.toContain("hired")
  })
  it("rejects missing, additional, duplicate or simulated jobs and receipts", () => {
    for (const field of ["jobs", "receipts", "chainReceipts"] as const) for (const change of ["missing", "extra", "duplicate"]) {
      const e = fixture(), rows = e[field] as unknown[]
      e[field] = change === "missing" ? rows.slice(1) : change === "extra" ? [...rows, rows[0]] : [rows[0], rows[0], rows[2]]
      expect(() => assertLineageEvidence(config(), e)).toThrow()
    }
    for (const override of [{ rail: "test" }, { settled: false }, { canary: true }, { settleTx: tx("a") }, { buyer: accounts.seller },
      { feeBps: 1000 }, { feeAtomic: 1n }, { priceAtomic: 1n }, { network: "eip155:1" }]) {
      const e = fixture(); e.receipts[1] = { ...rec(e.receipts[1]), ...override }
      expect(() => assertLineageEvidence(config(), e)).toThrow()
    }
  })
  it("requires exact root/parent/ancestor lineage and committed reservations, not seller text", () => {
    for (const override of [{ rootJobId: id("9") }, { parentJobId: id("a") }, { hop: 1 }, { ancestors: ["loop-probe"] }]) {
      const e = fixture(); e.receipts[2] = { ...rec(e.receipts[2]), ...override }
      expect(() => assertLineageEvidence(config(), e)).toThrow()
    }
    for (const override of [{ treeHash: tx("9") }, { treeCommittedAtomic: 50000n }, { treeCeilingAtomic: 200000n }, { children: [] }]) {
      const e = fixture(); e.receipts[0] = { ...rec(e.receipts[0]), ...override }
      expect(() => assertLineageEvidence(config(), e)).toThrow()
    }
    for (const override of [{ state: "reserved" }, { state: "released" }, { amount_atomic: "1" }, { root_job_id: id("9") }]) {
      const e = fixture(); e.reservations[0] = { ...rec(e.reservations[0]), ...override }
      expect(() => assertLineageEvidence(config(), e)).toThrow()
    }
    const e = fixture(); e.cycle = []; expect(() => assertLineageEvidence(config(), e)).toThrow("cycle")
  })
  it("requires independently observed unsigned 402 cycle refusal and exact payer balance deltas", () => {
    for (const override of [{ status: 200 }, { hadPayment: true }, { hadLineage: false }, { error: "payment required" }, { path: "/x/other/loop-probe" }]) {
      const e = fixture(); e.cycle[0] = { ...rec(e.cycle[0]), ...override }
      expect(() => assertLineageEvidence(config(), e)).toThrow("cycle")
    }
    for (const override of [{ buyerAfter: 699999n }, { subbuyerAfter: 939999n }]) {
      const e = fixture(); e.balances = { ...e.balances, ...override }
      expect(() => assertLineageEvidence(config(), e)).toThrow("balance")
    }
    const negative = fixture()
    negative.balances.buyerBefore = -1n; negative.balances.buyerAfter = -300001n
    expect(() => assertLineageEvidence(config(), negative)).toThrow("atomic")
  })
  it("rejects wrong transaction, stale or removed events, wrong emitter and contradictory event types", () => {
    for (const override of [{ status: "0x0" }, { transactionHash: tx("9") }, { from: accounts.buyer }, { to: accounts.buyer }, { blockNumber: "0x63" }]) {
      const e = fixture(); e.chainReceipts[0] = { ...rec(e.chainReceipts[0]), ...override }
      expect(() => assertLineageEvidence(config(), e)).toThrow()
    }
    for (const override of [{ removed: true }, { transactionHash: tx("9") }, { address: accounts.buyer }, { blockNumber: "0x1" }]) {
      const e = fixture(), r = rec(e.chainReceipts[2]), logs = r.logs as unknown[]
      r.logs = [...logs.slice(0, 2), { ...rec(logs[2]), ...override }]
      expect(() => assertLineageEvidence(config(), e)).toThrow()
    }
    for (const i of [0, 1]) {
      const e = fixture(), r = rec(e.chainReceipts[i]), other = rec(e.chainReceipts[i === 0 ? 1 : 0])
      r.logs = [...r.logs as unknown[], (other.logs as unknown[])[2]]
      expect(() => assertLineageEvidence(config(), e)).toThrow()
    }
  })
  it("requires every event's exact nonce, payer and amounts and the root's actual tree commitment", () => {
    const c = config()
    for (const i of [0, 1, 2]) for (const override of [{ buyer: c.seller }, { nonce: tx("9") }, { total: 1n }, { sellerAmount: 1n }, { feeAmount: 1n },
      ...(i === 0 ? [{ treeHash: tx("9") }, { childCount: 1 }, { childTotalAtomic: 50000n }] : [])]) {
      const e = fixture(), r = rec(e.receipts[i]), chain = rec(e.chainReceipts[i]), logs = chain.logs as unknown[]
      const facts = { buyer: r.buyer, nonce: r.authorizationNonce, total: prices[i]!, sellerAmount: prices[i]! * 95n / 100n,
        feeAmount: prices[i]! / 20n, treeHash: rec(e.receipts[0]).treeHash, childCount: 2, childTotalAtomic: 60000n, ...override }
      chain.logs = [...logs.slice(0, 2), i === 0
        ? event("SettledTree", { buyer: facts.buyer, nonce: facts.nonce, treeHash: facts.treeHash }, "uint256,uint256,uint256,uint32,uint256",
          [facts.total, facts.sellerAmount, facts.feeAmount, facts.childCount, facts.childTotalAtomic], c.splitter)
        : event("Settled", { buyer: facts.buyer, nonce: facts.nonce }, "uint256,uint256,uint256", [facts.total, facts.sellerAmount, facts.feeAmount], c.splitter)]
      expect(() => assertLineageEvidence(c, e)).toThrow("events required")
    }
  })
})
describe("passive observation and canonical entry guards", () => {
  it("projects only cycle facts, never request capability, payment or response details", async () => {
    const req = new Request(`http://127.0.0.1:1234/x/${accounts.seller}/loop-probe`, { method: "POST",
      headers: { "x-arcade-hire-capability": "PRIVATE-CAPABILITY" } })
    const response = Response.json({ error: "lineage_cycle", detail: "PRIVATE-DETAIL" }, { status: 402 })
    expect(await cycleObservation(req, response)).toEqual({ path: `/x/${accounts.seller}/loop-probe`, status: 402, error: "lineage_cycle", hadLineage: true, hadPayment: false })
    expect(await response.json()).toEqual({ error: "lineage_cycle", detail: "PRIVATE-DETAIL" })
    expect(await cycleObservation(new Request(req.url), Response.json({ error: "lineage_cycle" }, { status: 402 }))).toBeUndefined()
  })
  it("preserves original main execution and emits no secret-bearing source", () => {
    const source = '#!/usr/bin/env bun\nif (import.meta.main) console.log("canonical")\n'
    const guarded = guardedSkillSource(source)
    expect(guarded).toContain('if (import.meta.main) console.log("canonical")')
    expect(guarded).not.toContain("await import(")
    expect(lineagePreloadSource()).toContain("127.0.0.1")
    expect(lineagePreloadSource()).toContain("cycleObservation")
  })
})

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const HISTORICAL = join(ROOT, "scripts", "fixtures", "lineage-a9-2026-09-05")
const sourceFiles = async (base: string, program: "run.ts" | "run.ts.txt"): Promise<ReadonlyArray<LineageSkillFiles>> =>
  Promise.all(skills.map(async skill => ({
    skill,
    manifestBytes: await readFile(join(base, skill, "arcade.json"), "utf8"),
    sourceBytes: await readFile(join(base, skill, program), "utf8")
  })))
const sha256 = async (value: string): Promise<string> => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
)).map(byte => byte.toString(16).padStart(2, "0")).join("")

describe("immutable historical A9 skill inputs", () => {
  it("pins every manifest and program byte to the 381093e checkpoint and rejects source mutation", async () => {
    const files = await sourceFiles(HISTORICAL, "run.ts.txt")
    const expected = [
      ["bfb1cf68e85d957935b81828aa72dbc30df786930545f791e86138f238491c3f", "e70ba39feba972bca6b06b2ca0bd7e8cf62f35595a6ecec1869be4e529d0bd19"],
      ["1577e89bcf048a3a1f7851b2eec5072ad6555be043ac720851941713774466df", "a713128d33f8b56c9a55298f83afbb37b8d4165a0b00797fb442624eb3368b62"],
      ["760df29360dba616e10aa51f075b07861368279556b1761c53b9334ba5a6230e", "2f605bd93956b753f7463fa7a24d898fba393cefd8cd5efafa79e136086e9f7b"]
    ] as const
    const readme = await readFile(join(HISTORICAL, "README.md"), "utf8")
    for (const [i, file] of files.entries()) {
      expect(await sha256(file.manifestBytes)).toBe(expected[i]![0])
      expect(await sha256(file.sourceBytes)).toBe(expected[i]![1])
      expect(readme).toContain(expected[i]![0]); expect(readme).toContain(expected[i]![1])
    }
    await expect(verifyHistoricalLineageSourcesForTest(files)).resolves.toBeUndefined()
    const changed = files.map((file, i) => i === 1 ? { ...file, sourceBytes: file.sourceBytes + "\n// drift" } : file)
    await expect(verifyHistoricalLineageSourcesForTest(changed)).rejects.toThrow("historical A9 fixture bytes changed")
  })

  it("keeps the current live loader's shared builder closed to canonical manifest drift", async () => {
    const files = await sourceFiles(join(ROOT, "skills"), "run.ts")
    const wallet = JSON.parse(files[1]!.manifestBytes) as Record<string, unknown>
    const changed = files.map((file, i) => i === 1
      ? { ...file, manifestBytes: JSON.stringify({ ...wallet, price: "$0.15" }) }
      : file)
    const dir = await mkdtemp("/tmp/arcade-a9-drift-")
    try {
      await expect(prepareLineageSkillsFromSourcesForTest(dir, changed)).rejects.toThrow("canonical no-provider script/pricing changed")
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it("builds guarded executables from the frozen programs without changing their bytes", async () => {
    const files = await sourceFiles(HISTORICAL, "run.ts.txt")
    const dir = await mkdtemp("/tmp/arcade-a9-historical-")
    try {
      const { skillsDir, manifests } = await prepareHistoricalLineageSkillsForTest(dir)
      expect(() => assertCanonicalListings(manifests)).not.toThrow()
      for (const [i, skill] of skills.entries()) {
        expect(await readFile(join(skillsDir, skill, "guarded-run.ts"), "utf8")).toBe(guardedSkillSource(files[i]!.sourceBytes))
      }
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

describe("actual isolated entry points", () => {
  it("offers import-safe help and refuses missing keys without inherited dotenv/injection or setup", () => {
    const run = (args: string[], extra = {}) => spawnSync("bash", ["scripts/e2e-lineage.sh", ...args], {
      cwd: ROOT, env: { PATH: process.env.PATH ?? "", ...extra }, encoding: "utf8", timeout: 5000 })
    const help = run(["--help"], { NODE_OPTIONS: "--require PRIVATE-INJECTION", BUN_OPTIONS: "PRIVATE-INJECTION" })
    expect(help.status).toBe(0); expect(help.stdout).toContain("maxConcurrency=3")
    expect(help.stdout + help.stderr).not.toContain("PRIVATE-INJECTION")
    const missing = run([]); expect(missing.status).toBe(1)
    expect(missing.stdout).not.toContain("directory:"); expect(missing.stderr).toContain("required")
    const wrong = run([], { ARCADE_NETWORK: "PRIVATE-WRONG-NETWORK" })
    expect(wrong.status).toBe(1); expect(wrong.stderr).not.toContain("PRIVATE-WRONG-NETWORK")
  })
  it("runs a guarded canonical loop-probe copy as main with workspace imports and no automatic dotenv", async () => {
    const dir = await mkdtemp("/tmp/arcade-a9-entry-")
    try {
      const { skillsDir, manifests } = await prepareHistoricalLineageSkillsForTest(dir)
      expect(() => assertCanonicalListings(manifests)).not.toThrow()
      expect(() => assertCanonicalListings(manifests.map((v, i) => i === 0 ? { ...v, price: "$0.20" } : v))).toThrow()
      const entry = join(skillsDir, "loop-probe", "guarded-run")
      await writeFile(join(skillsDir, "loop-probe", ".env"), "BUN_OPTIONS=PRIVATE-INJECTION\n")
      const result = spawnSync(entry, [], { cwd: join(skillsDir, "loop-probe"), env: { PATH: process.env.PATH ?? "" },
        input: JSON.stringify({ input: { address: accounts.buyer } }), encoding: "utf8", timeout: 5000 })
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ stopReason: "refusal", output: { ok: false } })
      expect(result.stdout + result.stderr).not.toContain("PRIVATE-INJECTION")
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

/** Actual HTTP + signed SDK purchase + canonical scripts + Unix hire broker. Only
 * external RPC results and payment settlement are simulated, never the cycle response. */
const offlineCycle = async (maxConcurrency: number) => {
  const c = config(), dir = await mkdtemp("/tmp/arcade-a9-offline-"), owned = new OwnedProcesses()
  let database: Database | undefined
  const pause = () => new Promise(resolve => setTimeout(resolve, 25))
  const wait = async (fn: () => Promise<boolean>, why: string) => {
    const deadline = Date.now() + 20000
    do { if (await fn()) return; await pause() } while (Date.now() < deadline)
    throw new Error(`offline lineage deadline: ${why}`)
  }
  try {
    const { skillsDir } = await prepareHistoricalLineageSkillsForTest(dir)
    const flowPath = join(skillsDir, "usdc-flow-check", "guarded-run.ts")
    const flow = await readFile(flowPath, "utf8")
    await writeFile(flowPath, `// OFFLINE TEST ONLY: no network and no live payment evidence.\n
globalThis.fetch = async (url, init) => {
  if (String(url) !== "https://rpc.testnet.arc.network") throw new Error("offline unexpected URL");
  const body = JSON.parse(init.body);
  const results = { eth_call: "0x1e8480", eth_getCode: "0x", eth_getTransactionCount: "0x1", eth_blockNumber: "0x64", eth_chainId: "0x4cef52" };
  if (!(body.method in results)) throw new Error("offline unexpected RPC");
  return Response.json({ jsonrpc: "2.0", id: body.id, result: results[body.method] });
};\n` + flow)
    const abi = parseAbi(["function seller() view returns (address)", "function treasury() view returns (address)",
      "function feeBps() view returns (uint16)", "function version() view returns (uint8)"])
    const encode = (type: string, value: unknown) => encodeAbiParameters(parseAbiParameters(type), [value])
    const replies = Object.fromEntries((["seller", "treasury", "feeBps", "version"] as const).map(name => [encodeFunctionData({ abi, functionName: name }),
      encode(name === "seller" || name === "treasury" ? "address" : "uint256",
        name === "seller" ? c.seller : name === "treasury" ? c.facilitator : name === "feeBps" ? 500n : 2n)]))
    const preload = join(dir, "hub.ts")
    await writeFile(preload, `// OFFLINE TEST ONLY: splitter read fixture, production RailTest.\n
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  if (req.url !== "https://rpc.testnet.arc.io/") throw new Error("offline unexpected URL");
  const body = await req.json();
  const replies = ${JSON.stringify(replies)};
  const result = body.method === "eth_chainId" ? "0x4cef52" : body.method === "eth_call" ? replies[body.params[0].data] : undefined;
  if (result === undefined) throw new Error("offline unexpected RPC");
  return Response.json({ jsonrpc: "2.0", id: body.id, result });
};\n` + lineagePreloadSource("lineage-offline"))
    let origin = "", output = ""
    const cycle: unknown[] = []
    const hub = owned.launch(["run", "--preload", preload, "apps/hub/src/server.ts"], {
      ...lineageEnvironment(c, "hub"), ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0", ARCADE_TEST_BALANCE: "$1000",
      ARCADE_DB: join(dir, "hub.sqlite"), PORT: "0" }, chunk => {
      output = (output + chunk).slice(-16000)
      const port = /\[lineage-offline-port\] (\d+)/.exec(output)?.[1]
      if (port) origin = `http://127.0.0.1:${port}`
      for (const match of output.matchAll(/^\[lineage-offline-cycle\] (.+)$/gm)) {
        const observed = JSON.parse(match[1]!); if (!cycle.some(v => JSON.stringify(v) === JSON.stringify(observed))) cycle.push(observed)
      }
    })
    let diagnostics = ""
    hub.child.stderr?.on("data", chunk => { diagnostics = (diagnostics + String(chunk)).slice(-4000) })
    await wait(async () => { if (hub.done) throw new Error("offline hub exited: " + diagnostics.replace(/0x[0-9a-fA-F]{64}/g, "[redacted]")); return origin !== "" && (await fetch(origin + "/healthz")).ok }, "hub")
    const configPath = join(dir, "runner.json")
    await writeFile(configPath, JSON.stringify({ ...lineageRunnerConfig(c, origin, dir), maxConcurrency }))
    const runner = owned.launch(["run", "packages/runner/src/cli.ts", "start", "--skills", skillsDir], {
      ...lineageEnvironment(c, "seller"), ARCADE_CONFIG_PATH: configPath, ARCADE_FEE_SPLITTER: c.splitter, TMPDIR: dir,
      ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0" })
    await wait(async () => {
      if (runner.done || hub.done) throw new Error("offline runner/hub exited")
      const listings = await (await fetch(origin + "/listings")).json() as unknown[]
      if (listings.length !== 3) return false
      assertPublishedLineage(c, listings)
      return true
    }, "listings")
    const buyer = owned.launch(["run", "packages/buyer/src/cli.ts", "loop-probe", "--hub", origin, "--seller", c.seller,
      "--input", JSON.stringify({ address: c.buyer }), "--max-amount", "0.35"], lineageEnvironment(c, "buyer"))
    await wait(async () => buyer.done, "buyer")
    expect(buyer.child.exitCode).toBe(0)
    await owned.close()
    database = new Database(join(dir, "hub.sqlite"), { readonly: true })
    const load = (table: "jobs" | "receipts") => database!.query<{ json: string }, []>(`SELECT json FROM ${table}`).all().map(v => JSON.parse(v.json) as Record<string, unknown>)
    return { jobs: load("jobs"), receipts: load("receipts"), reservations: database.query<Record<string, unknown>, []>("SELECT * FROM tree_reservations").all(), cycle }
  } finally { await owned.close(); database?.close(); await rm(dir, { recursive: true, force: true }) }
}
it("proves the canonical three-hop cycle offline with capacity 3, and exposes why the default capacity 2 fails", async () => {
  const tooSmall = await offlineCycle(2)
  expect(tooSmall.receipts.some(r => r.skillId === "loop-probe" && r.settled === false)).toBe(true)
  const actual = await offlineCycle(3)
  expect(actual.jobs).toHaveLength(3); expect(actual.receipts).toHaveLength(3); expect(actual.reservations).toHaveLength(2)
  expect(actual.receipts.every(r => r.settled === true && r.rail === "test")).toBe(true)
  const root = actual.receipts.find(r => r.skillId === "loop-probe")!
  const wallet = actual.receipts.find(r => r.skillId === "wallet-risk-note")!
  const flow = actual.receipts.find(r => r.skillId === "usdc-flow-check")!
  expect(wallet.parentJobId).toBe(root.jobId); expect(flow.parentJobId).toBe(wallet.jobId)
  expect(flow.ancestors).toEqual(["loop-probe", "wallet-risk-note"])
  expect(actual.reservations.every(r => r.state === "committed")).toBe(true)
  expect(actual.cycle).toEqual(fixture().cycle)
  expect(() => assertLineageEvidence(config(), { ...fixture(), ...actual })).toThrow("settlement hashes")
}, 60000)
