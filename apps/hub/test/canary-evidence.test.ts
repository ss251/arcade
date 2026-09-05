import { describe, expect, it } from "vitest"
import { privateKeyToAccount } from "viem/accounts"
import { encodeAbiParameters, encodeEventTopics, parseAbi, parseAbiParameters } from "viem"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { treeHashOf } from "@arcade/core"
import {
  assertHiddenEvidence, assertOfflineEvidence, assertRestoredEvidence, assertSettledEvidence,
  gatedEntrySource, hubPreloadSource, readEvidenceConfig, runRecoverySequence,
  type EvidenceSnapshot, type EvidenceRow
} from "../../../scripts/e2e-canary.ts"

// Unfunded offline fixture keys, never passed to the live executable.
const key = (digit: string) => `0x${digit.repeat(64)}` as `0x${string}`
const env = { ARCADE_CANARY_KEY: key("1"), ARCADE_FACILITATOR_KEY: key("2"),
  ARCADE_SELLER_KEY: key("3"), ARCADE_FEE_SPLITTER: `0x${"4".repeat(40)}` }
const seller = privateKeyToAccount(env.ARCADE_SELLER_KEY).address
const buyer = privateKeyToAccount(env.ARCADE_CANARY_KEY).address
const facilitator = privateKeyToAccount(env.ARCADE_FACILITATOR_KEY).address
const splitter = env.ARCADE_FEE_SPLITTER
const tx = `0x${"a".repeat(64)}`
const nonce = `0x${"b".repeat(64)}`
const treeHash = treeHashOf("job_100", [])
const id = "usdc-flow-check"
const row = (atMs = 100, ok = true): EvidenceRow => ({ skillId: id, seller, atMs,
  jobId: ok ? `job_${atMs}` : "", ok, ...(ok ? { settleTx: tx } : {}) })
const snapshot = (mode: "offline" | "hidden" | "restored"): EvidenceSnapshot => ({
  detailStatus: mode === "offline" ? 404 : 200,
  pageStatus: mode === "offline" ? 404 : 200,
  detail: mode === "offline" ? { error: "not_found" } : { id, seller, delisted: mode === "hidden",
    payTested: mode === "hidden" ? row(103, false) : row() },
  page: mode === "hidden" ? "delisted: failed pay-test" : mode === "restored" ? "pay-tested" : "no such listing",
  listings: mode === "restored" ? [{ id, seller }] : [],
  openapi: { paths: mode === "restored" ? { [`/x/${seller}/${id}`]: {} } : {} },
  wellKnown: { resources: mode === "restored" ? [{ resource: `http://127.0.0.1:123/x/${seller}/${id}` }] : [] },
  skillMd: mode === "restored" ? id : "No listings"
})

describe("canary evidence preflight", () => {
  it("requires the dedicated canary key with no fallback to seller or facilitator", () => {
    expect(() => readEvidenceConfig({ ...env, ARCADE_CANARY_KEY: undefined })).toThrow("ARCADE_CANARY_KEY")
    for (const substitute of [env.ARCADE_SELLER_KEY, env.ARCADE_FACILITATOR_KEY]) {
      expect(() => readEvidenceConfig({ ...env, ARCADE_CANARY_KEY: substitute })).toThrow("distinct")
    }
  })
  it("rejects non-testnet, simulated rails, alternative RPCs, bad splitters and mismatched sellers", () => {
    for (const over of [{ ARCADE_NETWORK: "arc-mainnet" }, { ARCADE_RAIL: "test" },
      { ARCADE_RPC_URL: "https://rpc.other.test" }, { ARCADE_FEE_SPLITTER: "0x0" }, { SELLER: buyer }]) {
      expect(() => readEvidenceConfig({ ...env, ...over })).toThrow()
    }
  })
  it("returns canonical public identities and sanitizes malformed key errors", () => {
    expect(readEvidenceConfig(env)).toMatchObject({ seller, buyer, facilitator, splitter,
      rpcUrl: "https://rpc.testnet.arc.io", skillId: id })
    expect(() => readEvidenceConfig({ ...env, ARCADE_CANARY_KEY: "SECRET-DO-NOT-PRINT" })).toThrow("ARCADE_CANARY_KEY is invalid")
    try { readEvidenceConfig({ ...env, ARCADE_CANARY_KEY: "SECRET-DO-NOT-PRINT" }) }
    catch (error) { expect(String(error)).not.toContain("SECRET-DO-NOT-PRINT") }
  })
})

describe("offline, reconnect and recovery are different evidence", () => {
  const failures = [row(101, false), row(102, false), row(103, false)]
  it("requires both offline 404s and three new durable failures for the exact seller and skill", () => {
    expect(() => assertOfflineEvidence(snapshot("offline"), failures, seller, 100)).not.toThrow()
    for (const bad of [[], failures.slice(0, 2), [row(101, false), row(102, false), row(103, true)],
      failures.map((entry) => ({ ...entry, seller: buyer })), failures.map((entry) => ({ ...entry, skillId: "other" }))]) {
      expect(() => assertOfflineEvidence(snapshot("offline"), bad, seller, 100)).toThrow()
    }
    expect(() => assertOfflineEvidence(snapshot("hidden"), failures, seller, 100)).toThrow()
    expect(() => assertOfflineEvidence(snapshot("offline"), failures, seller, 104)).toThrow()
  })
  it("requires hidden reconnect details, never equating a 404 with delisting", () => {
    expect(() => assertHiddenEvidence(snapshot("hidden"), seller)).not.toThrow()
    expect(() => assertHiddenEvidence(snapshot("offline"), seller)).toThrow()
    expect(() => assertHiddenEvidence(snapshot("restored"), seller)).toThrow()
    expect(() => assertHiddenEvidence({ ...snapshot("hidden"), page: "Connected" }, seller)).toThrow()
  })
  it.each(["listings", "openapi", "wellKnown", "skillMd"] as const)("checks discovery surface %s in both hidden phases", (surface) => {
    const leaked = { ...snapshot("hidden"), [surface]: snapshot("restored")[surface] }
    expect(() => assertHiddenEvidence(leaked, seller)).toThrow()
  })
  it("requires a second pass and complete restored discovery", () => {
    expect(() => assertRestoredEvidence(snapshot("restored"), row(), seller)).not.toThrow()
    expect(() => assertRestoredEvidence(snapshot("hidden"), row(), seller)).toThrow()
    expect(() => assertRestoredEvidence({ ...snapshot("restored"), openapi: { paths: {} } }, row(), seller)).toThrow()
    expect(() => assertRestoredEvidence({ ...snapshot("restored"), detail: {
      id: "another-skill", seller, delisted: false, payTested: row()
    } }, row(), seller)).toThrow()
    expect(() => assertRestoredEvidence({ ...snapshot("restored"), detail: {
      id, seller: buyer, delisted: false, payTested: row()
    } }, row(), seller)).toThrow()
  })
  it("does not treat malformed catalogue documents as proof of absence", () => {
    for (const bad of [{ listings: {} }, { openapi: {} }, { wellKnown: { resources: null } }]) {
      expect(() => assertHiddenEvidence({ ...snapshot("hidden"), ...bad }, seller)).toThrow()
    }
  })
})

describe("real offline entry points", () => {
  const shell = fileURLToPath(new URL("../../../scripts/e2e-canary.sh", import.meta.url))
  const cleanEnv = { PATH: process.env["PATH"] ?? "/usr/bin:/bin" }
  it("runs bash help from an unrelated directory without keys or side effects", () => {
    const directory = mkdtempSync(join(tmpdir(), "canary-shell-test-"))
    try {
      const result = spawnSync("bash", [shell, "--help"], { cwd: directory, env: cleanEnv, encoding: "utf8", timeout: 10_000 })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("Usage:")
      expect(result.stdout).toContain("dedicated OWNER-funded")
      expect(existsSync(join(directory, ".arcade"))).toBe(false)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
  it("refuses a missing canary key before any process or live evidence setup", () => {
    const result = spawnSync("bash", [shell], { cwd: tmpdir(), env: cleanEnv, encoding: "utf8", timeout: 10_000 })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("ARCADE_CANARY_KEY is required")
    expect(result.stdout).not.toContain("Local evidence directory")
  })
  it("holds an actual Bun skill process until the local release gate opens", async () => {
    const directory = mkdtempSync(join(tmpdir(), "canary-gate-test-"))
    writeFileSync(join(directory, "gated-run.ts"), gatedEntrySource())
    writeFileSync(join(directory, "run.ts"), 'process.stdout.write("ORIGINAL-SKILL-RAN");\n')
    const child = spawn("bun", ["run", join(directory, "gated-run.ts")], { cwd: directory, env: cleanEnv,
      stdio: ["ignore", "pipe", "pipe"] })
    let output = ""
    child.stdout.on("data", (chunk) => { output += String(chunk) })
    child.stderr.resume()
    const exited = new Promise<number | null>((resolve) => child.once("close", resolve))
    try {
      const end = Date.now() + 2_000
      while (!existsSync(join(directory, "evidence-waiting")) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 10))
      expect(existsSync(join(directory, "evidence-waiting"))).toBe(true)
      expect(output).toBe("")
      expect(child.exitCode).toBeNull()
      writeFileSync(join(directory, "evidence-allow"), "allowed\n")
      expect(await exited).toBe(0)
      expect(output).toBe("ORIGINAL-SKILL-RAN")
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
      await exited
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe("paid evidence requires real matching settlement logs", () => {
  const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"])
  // FeeSplitterV2.settle (the actual childless pipeline) emits Settled, not SettledTree.
  const settledAbi = parseAbi(["event Settled(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce)"])
  const treeAbi = parseAbi(["event SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)"])
  const transfer = (from: string, to: string, amount: bigint) => ({
    address: "0x3600000000000000000000000000000000000000",
    topics: encodeEventTopics({ abi: transferAbi, eventName: "Transfer", args: { from: from as `0x${string}`, to: to as `0x${string}` } }),
    data: encodeAbiParameters(parseAbiParameters("uint256"), [amount])
  })
  const receipt = { jobId: "job_100", skillId: id, buyer, seller, canary: true, settled: true,
    rail: "eip3009", network: "eip155:5042002", settleTx: tx, priceAtomic: "10000", sellerAtomic: "9500",
    feeAtomic: "500", feeBps: 500, authorizationNonce: nonce, treeHash, rootJobId: "job_100", hop: 0,
    ancestors: [], children: [], treeCeilingAtomic: { __bigint: "0" }, treeCommittedAtomic: { __bigint: "0" } }
  const settledLog = ({ paidBy = buyer, paidNonce = nonce, total = 10000n, sellerAmount = 9500n, feeAmount = 500n } = {}) => ({
    address: splitter,
    topics: encodeEventTopics({ abi: settledAbi, eventName: "Settled", args: {
      buyer: paidBy, nonce: paidNonce as `0x${string}` } }),
    data: encodeAbiParameters(parseAbiParameters("uint256,uint256,uint256"), [total, sellerAmount, feeAmount])
  })
  const treeLog = {
    address: splitter,
    topics: encodeEventTopics({ abi: treeAbi, eventName: "SettledTree", args: {
      buyer, nonce: nonce as `0x${string}`, treeHash } }),
    data: encodeAbiParameters(parseAbiParameters("uint256,uint256,uint256,uint32,uint256"), [10000n, 9500n, 500n, 0, 0n])
  }
  const chain = { transactionHash: tx, status: "0x1", from: facilitator, to: splitter,
    logs: [transfer(buyer, splitter, 10000n), transfer(splitter, seller, 9500n), settledLog()] }
  it("accepts the real childless V2 Settled event with exact transfers and durable marked root", () => {
    expect(() => assertSettledEvidence(row(), receipt, chain, readEvidenceConfig(env))).not.toThrow()
  })
  it("does not invent an on-chain tree commitment for a childless purchase", () => {
    expect(() => assertSettledEvidence(row(), receipt, { ...chain, logs: [...chain.logs.slice(0, 2), treeLog] }, readEvidenceConfig(env))).toThrow()
    expect(() => assertSettledEvidence(row(), receipt, { ...chain, logs: [...chain.logs, treeLog] }, readEvidenceConfig(env))).toThrow()
  })
  it("requires the canonical childless root, not another root or an actual lineage parent", () => {
    for (const over of [{ rootJobId: "job_other" }, { rootJobId: undefined }, { parentJobId: "job_parent" },
      { hop: 1 }, { ancestors: ["job_parent"] }, { ancestors: undefined }, { children: undefined },
      { children: [{ jobId: "job_child", priceAtomic: "1" }] }, { treeHash: `0x${"e".repeat(64)}` },
      { treeCommittedAtomic: "1" }, { authorizationNonce: undefined }, { authorizationNonce: "not-a-nonce" }]) {
      expect(() => assertSettledEvidence(row(), { ...receipt, ...over }, chain, readEvidenceConfig(env))).toThrow()
    }
  })
  it("requires the Settled event to bind this payer, authorization nonce and exact split", () => {
    for (const over of [{ paidBy: seller }, { paidNonce: `0x${"d".repeat(64)}` },
      { total: 10001n }, { sellerAmount: 9501n }, { feeAmount: 499n }]) {
      expect(() => assertSettledEvidence(row(), receipt, { ...chain,
        logs: [...chain.logs.slice(0, 2), settledLog(over)] }, readEvidenceConfig(env))).toThrow()
    }
    expect(() => assertSettledEvidence(row(), { ...receipt, authorizationNonce: `0x${"d".repeat(64)}` }, chain, readEvidenceConfig(env))).toThrow()
  })
  it("rejects matching-looking logs with wrong emitter, removed status or transaction provenance", () => {
    for (const index of [0, 1, 2]) {
      for (const over of [{ address: buyer }, { removed: true }, { transactionHash: `0x${"d".repeat(64)}` }]) {
        const logs = chain.logs.map((log, i) => i === index ? { ...log, ...over } : log)
        expect(() => assertSettledEvidence(row(), receipt, { ...chain, logs }, readEvidenceConfig(env))).toThrow()
      }
    }
  })
  it("still independently requires both exact ERC-20 payment legs", () => {
    for (const logs of [
      [transfer(seller, splitter, 10000n), chain.logs[1]!, settledLog()],
      [transfer(buyer, seller, 10000n), chain.logs[1]!, settledLog()],
      [transfer(buyer, splitter, 10001n), chain.logs[1]!, settledLog()],
      [chain.logs[0]!, transfer(splitter, buyer, 9500n), settledLog()],
      [chain.logs[0]!, transfer(splitter, seller, 9499n), settledLog()]
    ]) expect(() => assertSettledEvidence(row(), receipt, { ...chain, logs }, readEvidenceConfig(env))).toThrow()
  })
  it("rejects duplicate matching settlement events rather than choosing an ambiguous proof", () => {
    expect(() => assertSettledEvidence(row(), receipt, { ...chain, logs: [...chain.logs, settledLog()] }, readEvidenceConfig(env))).toThrow()
  })
  it("rejects a hash alone, wrong chain/identity, simulated payment and arithmetic mismatch", () => {
    for (const over of [{ canary: false }, { rail: "test" }, { network: "eip155:1" },
      { buyer: seller }, { seller: buyer }, { jobId: "another" }, { priceAtomic: "9999" }, { feeAtomic: "0" }]) {
      expect(() => assertSettledEvidence(row(), { ...receipt, ...over }, chain, readEvidenceConfig(env))).toThrow()
    }
    for (const over of [{ logs: [] }, { status: "0x0" }, { transactionHash: `0x${"f".repeat(64)}` }, { to: buyer }]) {
      expect(() => assertSettledEvidence(row(), receipt, { ...chain, ...over }, readEvidenceConfig(env))).toThrow()
    }
    expect(() => assertSettledEvidence(row(), receipt, { ...chain, logs: chain.logs.slice(1) }, readEvidenceConfig(env))).toThrow()
    expect(() => assertSettledEvidence(row(), receipt, { ...chain, logs: chain.logs.slice(0, 2) }, readEvidenceConfig(env))).toThrow()
  })
})

describe("deterministic evidence controls", () => {
  it("proves reconnect while the skill gate stays closed, then releases and stops after recovery", async () => {
    const events: string[] = []
    const step = (name: string) => async () => { events.push(name) }
    let pass = 0
    await runRecoverySequence({ startRunner: step("start"), stopRunner: step("stop"),
      closeGate: step("close"), openGate: step("open"), proveOffline: step("offline"), proveHidden: step("hidden"),
      waitForPass: async () => { events.push("pass"); return row(++pass, true) } })
    expect(events).toEqual(["open", "start", "pass", "close", "stop", "offline", "start", "hidden", "open", "pass", "close", "stop"])
  })
  it("never opens the gate when hidden-state proof fails", async () => {
    const events: string[] = []
    const step = (name: string) => async () => { events.push(name) }
    await expect(runRecoverySequence({ startRunner: step("start"), stopRunner: step("stop"), closeGate: step("close"),
      openGate: step("open"), proveOffline: step("offline"), proveHidden: async () => { throw new Error("not hidden") },
      waitForPass: async () => row() })).rejects.toThrow("not hidden")
    expect(events.filter((event) => event === "open")).toHaveLength(1)
  })
  it("generates only loopback/gating controls, without replacing the scheduler or paid skill", () => {
    const hub = hubPreloadSource()
    expect(hub).toContain('hostname: "127.0.0.1"')
    expect(hub).toContain("ARCADE_PUBLIC_URL")
    expect(hub).not.toContain("mock.module")
    const entry = gatedEntrySource()
    expect(entry).toContain("evidence-allow")
    expect(entry).toContain('import("./run.ts")')
    expect(entry).toContain("process.ppid")
    expect(entry).not.toContain("ARCADE_CANARY_KEY")
  })
})
