import { spawn, type ChildProcess } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { decodeEventLog, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import type { RunnerConfig } from "../packages/runner/src/config.ts"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const SKILL = "usdc-flow-check"
const RPC = "https://rpc.testnet.arc.io"
const USDC = "0x3600000000000000000000000000000000000000"
const NETWORK = "eip155:5042002"
const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
const hash = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase()
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
class EvidenceError extends Error {}
function insist(ok: unknown, message: string): asserts ok { if (!ok) throw new EvidenceError(message) }

export interface EvidenceConfig {
  readonly skillId: string; readonly rpcUrl: string; readonly buyer: string; readonly seller: string
  readonly facilitator: string; readonly splitter: string
  readonly canaryKey: string; readonly sellerKey: string; readonly facilitatorKey: string
}

/** Presence/identity checks only. Never look up, mint, fund, print or persist a key. */
export const readEvidenceConfig = (env: Record<string, string | undefined>): EvidenceConfig => {
  insist(env["ARCADE_NETWORK"] === undefined || env["ARCADE_NETWORK"] === "arc-testnet", "this evidence runs only on Arc testnet")
  insist(env["ARCADE_RAIL"] === undefined || env["ARCADE_RAIL"] === "eip3009", "this evidence requires the real eip3009 rail")
  insist(env["ARCADE_RPC_URL"] === undefined || env["ARCADE_RPC_URL"] === RPC, "this evidence requires the canonical Arc testnet RPC")
  const identity = (name: string) => {
    const key = env[name]
    insist(key !== undefined && key !== "", `${name} is required; OWNER must provision the dedicated funded canary key`)
    try {
      if (!hash(key)) throw new Error()
      return { key, account: privateKeyToAccount(key as `0x${string}`).address }
    } catch { throw new EvidenceError(`${name} is invalid`) }
  }
  const canary = identity("ARCADE_CANARY_KEY"), seller = identity("ARCADE_SELLER_KEY"), facilitator = identity("ARCADE_FACILITATOR_KEY")
  insist(!same(canary.account, seller.account) && !same(canary.account, facilitator.account), "the dedicated canary must be distinct from seller and facilitator")
  const splitter = env["ARCADE_FEE_SPLITTER"]
  insist(address(splitter) && !/^0x0{40}$/i.test(splitter), "ARCADE_FEE_SPLITTER must name the seller's deployed Arc testnet FeeSplitterV2")
  insist(env["SELLER"] === undefined || same(env["SELLER"], seller.account), "SELLER does not match ARCADE_SELLER_KEY")
  return { skillId: SKILL, rpcUrl: RPC, buyer: canary.account, seller: seller.account, facilitator: facilitator.account,
    splitter, canaryKey: canary.key, sellerKey: seller.key, facilitatorKey: facilitator.key }
}

export interface EvidenceRow {
  readonly skillId: string; readonly seller: string; readonly atMs: number; readonly jobId: string
  readonly ok: boolean; readonly settleTx?: string
}
export interface EvidenceSnapshot {
  readonly detailStatus: number; readonly pageStatus: number; readonly detail: unknown; readonly page: string
  readonly listings: unknown; readonly openapi: unknown; readonly wellKnown: unknown; readonly skillMd: string
}

const discovery = (snapshot: EvidenceSnapshot, seller: string, visible: boolean) => {
  insist(Array.isArray(snapshot.listings), "invalid /listings evidence")
  insist(object(snapshot.openapi) && object(snapshot.openapi["paths"]), "invalid /openapi.json evidence")
  insist(object(snapshot.wellKnown) && Array.isArray(snapshot.wellKnown["resources"]), "invalid /.well-known/x402 evidence")
  const target = `/x/${seller}/${SKILL}`.toLowerCase()
  const present = [
    snapshot.listings.some((entry) => object(entry) && entry["id"] === SKILL && same(entry["seller"], seller)),
    Object.keys(snapshot.openapi["paths"]).some((path) => path.toLowerCase() === target),
    snapshot.wellKnown["resources"].some((entry) => object(entry) && typeof entry["resource"] === "string" && entry["resource"].toLowerCase().endsWith(target)),
    snapshot.skillMd.includes(SKILL)
  ]
  insist(present.every((found) => found === visible), visible ? "listing is missing from restored discovery" : "listing is still advertised")
}

export const assertOfflineEvidence = (snapshot: EvidenceSnapshot, rows: ReadonlyArray<EvidenceRow>, seller: string, disconnectedAt: number): void => {
  insist(snapshot.detailStatus === 404 && snapshot.pageStatus === 404, "offline listing must return 404 on both detail surfaces")
  discovery(snapshot, seller, false)
  const recent = rows.filter((row) => row.atMs >= disconnectedAt)
  insist(recent.length >= 3 && recent.every((row) => row.skillId === SKILL && same(row.seller, seller)), "need three durable failures for this skill and seller after disconnect")
  const tail = [...recent].sort((a, b) => a.atMs - b.atMs).slice(-3)
  insist(tail.every((row) => row.ok === false && row.jobId === "" && row.settleTx === undefined), "offline evidence must end in three jobless failed purchases")
}

export const assertHiddenEvidence = (snapshot: EvidenceSnapshot, seller: string): void => {
  insist(snapshot.detailStatus === 200 && snapshot.pageStatus === 200 && object(snapshot.detail), "reconnected listing must have explanatory detail, not 404")
  insist(snapshot.detail["id"] === SKILL && same(snapshot.detail["seller"], seller) && snapshot.detail["delisted"] === true &&
    object(snapshot.detail["payTested"]) && snapshot.detail["payTested"]["ok"] === false, "reconnecting must preserve the failed pay-test verdict")
  insist(snapshot.page.includes("delisted: failed pay-test"), "listing page must explain its delisting")
  discovery(snapshot, seller, false)
}

export const assertRestoredEvidence = (snapshot: EvidenceSnapshot, row: EvidenceRow, seller: string): void => {
  insist(snapshot.detailStatus === 200 && snapshot.pageStatus === 200 && object(snapshot.detail) && row.ok === true, "recovery needs a passing pay-test and live detail")
  insist(snapshot.detail["id"] === SKILL && same(snapshot.detail["seller"], seller) && snapshot.detail["delisted"] === false &&
    object(snapshot.detail["payTested"]) && snapshot.detail["payTested"]["ok"] === true &&
    snapshot.detail["payTested"]["jobId"] === row.jobId &&
    same(snapshot.detail["payTested"]["settleTx"], row.settleTx), "recovery detail must name the new passing purchase")
  discovery(snapshot, seller, true)
}

const EVENTS = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)"
])
const atomic = (value: unknown): bigint => {
  const raw = object(value) ? value["__bigint"] : value
  insist(typeof raw === "bigint" || typeof raw === "string" && /^\d+$/.test(raw), "invalid receipt amount")
  return BigInt(raw)
}

/** Independent chain evidence, not a printed hash or a simulated receipt. */
export const assertSettledEvidence = (row: EvidenceRow, receipt: unknown, chain: unknown, cfg: EvidenceConfig): void => {
  insist(row.skillId === SKILL && same(row.seller, cfg.seller) && row.ok === true && row.jobId !== "" && hash(row.settleTx), "missing successful pay-test identity")
  insist(object(receipt) && receipt["jobId"] === row.jobId && receipt["skillId"] === SKILL && receipt["canary"] === true &&
    receipt["settled"] === true && receipt["rail"] === "eip3009" && receipt["network"] === NETWORK &&
    same(receipt["buyer"], cfg.buyer) && same(receipt["seller"], cfg.seller) && same(receipt["settleTx"], row.settleTx), "durable canary receipt does not match this purchase")
  insist(atomic(receipt["priceAtomic"]) === 10_000n && atomic(receipt["sellerAtomic"]) === 9_500n &&
    atomic(receipt["feeAtomic"]) === 500n && receipt["feeBps"] === 500, "receipt must prove the exact $0.01 / 5% split")
  insist(object(chain) && chain["status"] === "0x1" && same(chain["transactionHash"], row.settleTx) &&
    same(chain["from"], cfg.facilitator) && same(chain["to"], cfg.splitter) && Array.isArray(chain["logs"]), "transaction is not the successful configured Arc settlement")
  let incoming = false, outgoing = false, settled = false
  for (const log of chain["logs"]) {
    if (!object(log) || !Array.isArray(log["topics"]) || typeof log["data"] !== "string") continue
    try {
      const decoded = decodeEventLog({ abi: EVENTS, topics: log["topics"] as [`0x${string}`, ...`0x${string}`[]], data: log["data"] as `0x${string}` })
      if (decoded.eventName === "Transfer" && same(log["address"], USDC)) {
        incoming ||= same(decoded.args.from, cfg.buyer) && same(decoded.args.to, cfg.splitter) && decoded.args.value === 10_000n
        outgoing ||= same(decoded.args.from, cfg.splitter) && same(decoded.args.to, cfg.seller) && decoded.args.value === 9_500n
      }
      if (decoded.eventName === "SettledTree" && same(log["address"], cfg.splitter)) {
        settled ||= same(decoded.args.buyer, cfg.buyer) && decoded.args.total === 10_000n && decoded.args.sellerAmount === 9_500n &&
          decoded.args.feeAmount === 500n && same(decoded.args.nonce, receipt["authorizationNonce"]) &&
          same(decoded.args.treeHash, receipt["treeHash"]) && decoded.args.childCount === 0 && decoded.args.childTotalAtomic === 0n
      }
    } catch { /* Other token/native logs are not evidence for this receipt. */ }
  }
  insist(incoming && outgoing && settled, "matching ERC-20 transfers and FeeSplitterV2 tree event are required")
}

interface RecoveryControls {
  readonly openGate: () => Promise<void>; readonly closeGate: () => Promise<void>
  readonly startRunner: () => Promise<void>; readonly stopRunner: () => Promise<void>
  readonly waitForPass: () => Promise<EvidenceRow>; readonly proveOffline: () => Promise<void>; readonly proveHidden: () => Promise<void>
}
export const runRecoverySequence = async (controls: RecoveryControls): Promise<{ first: EvidenceRow; second: EvidenceRow }> => {
  await controls.openGate(); await controls.startRunner()
  const first = await controls.waitForPass()
  await controls.closeGate(); await controls.stopRunner(); await controls.proveOffline()
  await controls.startRunner(); await controls.proveHidden(); await controls.openGate()
  const second = await controls.waitForPass()
  await controls.closeGate(); await controls.stopRunner()
  return { first, second }
}

// These temporary local wrappers are controls, never substitutes for production buying,
// scheduling, signature verification, settlement, or the original on-chain skill.
const parentGuard = `const parentPid = process.ppid;
setInterval(() => { if (process.ppid !== parentPid) process.exit(2); }, 100).unref();
setTimeout(() => process.exit(2), 360000).unref();\n`
export const hubPreloadSource = (): string => `${parentGuard}
const serve = Bun.serve;
Bun.serve = (options) => {
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0 });
  process.env.ARCADE_PUBLIC_URL = "http://127.0.0.1:" + server.port;
  console.log("[canary-evidence-port] " + server.port);
  return server;
};\n`
export const gatedEntrySource = (): string => `${parentGuard}
await Bun.write(new URL("./evidence-waiting", import.meta.url), "waiting\\n");
while (!(await Bun.file(new URL("./evidence-allow", import.meta.url)).exists())) await Bun.sleep(25);
await import("./run.ts");\n`

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const bounded = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new EvidenceError(message)), ms)
  promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
})
export interface OwnedProcess { readonly child: ChildProcess; readonly exited: Promise<void>; done: boolean }

/** One ownership boundary for the evidence command's subprocesses. */
export class OwnedProcesses {
  private readonly owned = new Set<OwnedProcess>()
  launch(file: string, env: Record<string, string>, preload?: string, read?: (text: string) => void): OwnedProcess {
    const child = spawn("bun", ["--no-env-file", "run", ...(preload === undefined ? [] : ["--preload", preload]), file], {
      cwd: ROOT, env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", LANG: "en_US.UTF-8", ...env }, stdio: ["ignore", "pipe", "pipe"]
    })
    let entry: OwnedProcess
    const exited = new Promise<void>((resolve) => {
      child.on("error", () => {
        // Signal errors do not prove exit. Only failed spawn (no PID) or close does.
        if (child.pid === undefined) { entry.done = true; resolve() }
      })
      child.once("close", () => { entry.done = true; resolve() })
    })
    entry = { child, exited, done: false }; this.owned.add(entry)
    child.stdout?.on("data", (chunk) => read?.(String(chunk)))
    child.stderr?.resume() // Never print or persist child diagnostics that might contain secrets.
    return entry
  }
  async stop(entry: OwnedProcess | undefined): Promise<void> {
    if (entry === undefined || !this.owned.has(entry)) return
    if (!entry.done) {
      insist(Number.isInteger(entry.child.pid) && entry.child.pid! > 1, "refusing to signal an invalid child PID")
      entry.child.kill("SIGTERM")
      try { await bounded(entry.exited, 3_000, "child did not stop") }
      catch { entry.child.kill("SIGKILL"); await bounded(entry.exited, 3_000, "owned child could not be reaped") }
    }
    this.owned.delete(entry)
  }
  async close(): Promise<void> {
    let cleanupFailed = false
    for (const entry of [...this.owned].reverse()) { try { await this.stop(entry) } catch { cleanupFailed = true } }
    if (cleanupFailed) throw new EvidenceError("an owned process could not be confirmed stopped")
  }
}

/** A verified result is publishable only after every owned process is confirmed stopped. */
export const withEvidenceCleanup = async <T>(
  work: () => Promise<T>, cleanup: () => Promise<void>, publish: (proof: T) => void
): Promise<void> => {
  let proof: T
  try { proof = await work() } finally { await cleanup() }
  publish(proof)
}

/** Live execution is called only by the command entry point after explicit key preflight. */
export const runLiveEvidence = async (cfg: EvidenceConfig): Promise<void> => {
  const controller = new AbortController()
  const onSignal = () => controller.abort()
  process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal)
  const timer = setTimeout(onSignal, 300_000)
  const owned = new OwnedProcesses()
  let directory: string | undefined
  let runner: OwnedProcess | undefined
  let hub: OwnedProcess | undefined
  let database: import("bun:sqlite").Database | undefined
  const launch = owned.launch.bind(owned), stop = owned.stop.bind(owned)
  const check = () => insist(!controller.signal.aborted, "evidence run interrupted or exceeded five minutes")
  const request = async (url: string, init?: RequestInit) => {
    check()
    return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]) })
  }
  const rpc = async (method: string, params: unknown[]) => {
    const response = await request(RPC, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
    insist(response.ok, "Arc testnet RPC request failed")
    const body: unknown = await response.json()
    insist(object(body) && body["error"] === undefined, "Arc testnet RPC request failed")
    return body["result"]
  }
  const until = async <T>(predicate: () => Promise<T | undefined>, message: string): Promise<T> => {
    const end = Date.now() + 90_000
    do {
      check()
      const value = await predicate()
      if (value !== undefined) return value
      await delay(250)
    } while (Date.now() < end)
    throw new EvidenceError(message)
  }
  await withEvidenceCleanup(async () => {
    insist(await rpc("eth_chainId", []) === "0x4cef52", "RPC is not Arc testnet chain 5042002")
    directory = await mkdtemp(join(tmpdir(), "arcade-canary-evidence-"))
    console.log(`Local evidence directory: ${directory}`)
    const dbPath = join(directory, "hub.sqlite"), skillsDir = join(directory, "skills"), skillDir = join(skillsDir, SKILL)
    await mkdir(skillDir, { recursive: true })
    const manifest = JSON.parse(await readFile(join(ROOT, "skills", SKILL, "arcade.json"), "utf8")) as Record<string, unknown>
    insist(manifest["id"] === SKILL && manifest["price"] === "$0.01" && object(manifest["engine"]) && manifest["engine"]["adapter"] === "script", "canonical flow-check listing changed; review the evidence fixture before buying")
    await copyFile(join(ROOT, "skills", SKILL, "run.ts"), join(skillDir, "run.ts"))
    await writeFile(join(skillDir, "arcade.json"), JSON.stringify({ ...manifest, engine: { ...manifest["engine"], entry: "gated-run.ts" } }, null, 2))
    await writeFile(join(skillDir, "gated-run.ts"), gatedEntrySource())
    const preload = join(directory, "loopback.ts")
    await writeFile(preload, hubPreloadSource())
    let base = "", hubText = ""
    hub = launch(join(ROOT, "apps/hub/src/server.ts"), {
      ARCADE_NETWORK: "arc-testnet", ARCADE_RPC_URL: RPC, ARCADE_RAIL: "eip3009", ARCADE_CHAIN_CHECK: "1",
      ARCADE_CANARY_KEY: cfg.canaryKey, ARCADE_FACILITATOR_KEY: cfg.facilitatorKey,
      ARCADE_CANARY_INTERVAL: "15s", ARCADE_CANARY_TICK: "1s", ARCADE_CANARY_MAX_PRICE: "$0.01",
      ARCADE_DB: dbPath, PORT: "0"
    }, preload, (chunk) => {
      if (base !== "") return
      hubText = (hubText + chunk).slice(-4096)
      const port = /\[canary-evidence-port\] (\d+)/.exec(hubText)?.[1]
      if (port !== undefined && Number(port) > 0) base = `http://127.0.0.1:${port}`
    })
    await until(async () => {
      insist(!hub!.done, "hub exited before becoming ready")
      if (base === "") return undefined
      try { return (await request(`${base}/healthz`)).ok ? true : undefined } catch { return undefined }
    }, "hub did not become ready")
    const { Database } = await import("bun:sqlite")
    database = new Database(dbPath, { readonly: true })
    const rows = (): EvidenceRow[] => database!.query<{
      skill_id: string; seller: string; at_ms: number; job_id: string; ok: number; settle_tx: string | null
    }, [string, string]>(`SELECT skill_id,seller,at_ms,job_id,ok,settle_tx FROM pay_tests
      WHERE skill_id=? AND seller=? COLLATE NOCASE ORDER BY at_ms ASC,rowid ASC`).all(SKILL, cfg.seller).map((r) => ({
        skillId: r.skill_id, seller: r.seller, atMs: r.at_ms, jobId: r.job_id, ok: r.ok === 1,
        ...(r.settle_tx === null ? {} : { settleTx: r.settle_tx })
      }))
    const snapshot = async (): Promise<EvidenceSnapshot> => {
      const urls = [`/listings/${SKILL}`, `/skill/${SKILL}`, "/listings", "/openapi.json", "/.well-known/x402", "/skill.md"]
      const responses = await Promise.all(urls.map((path) => request(base + path)))
      for (const response of responses.slice(2)) insist(response.status === 200, "discovery request failed; failure is not proof of omission")
      return { detailStatus: responses[0]!.status, pageStatus: responses[1]!.status, detail: await responses[0]!.json(),
        page: await responses[1]!.text(), listings: await responses[2]!.json(), openapi: await responses[3]!.json(),
        wellKnown: await responses[4]!.json(), skillMd: await responses[5]!.text() }
    }
    const runnerFile = join(directory, "runner.ts")
    const runnerConfig: RunnerConfig = { runnerId: `rnr_evidence_${crypto.randomUUID().replaceAll("-", "")}`, sellerAddress: cfg.seller,
      hubUrl: base, hubWsUrl: base.replace("http:", "ws:") + "/ws", maxConcurrency: 1, agents: {} }
    await writeFile(runnerFile, `${parentGuard}
import { Effect } from ${JSON.stringify(pathToFileURL(join(ROOT, "packages/runner/node_modules/effect/dist/esm/index.js")).href)};
import { startDaemon } from ${JSON.stringify(pathToFileURL(join(ROOT, "packages/runner/src/daemon.ts")).href)};
const config = ${JSON.stringify(runnerConfig)};
Effect.runPromise(startDaemon({ config, skillsDir: ${JSON.stringify(skillsDir)} })).catch(() => process.exit(2));\n`)
    const gateFile = join(skillDir, "evidence-allow")
    let disconnectedAt = 0, lastPass: EvidenceRow | undefined, offlineRows: EvidenceRow[] = []
    const proof = await runRecoverySequence({
      openGate: () => writeFile(gateFile, "allowed\n"),
      closeGate: async () => { try { await unlink(gateFile) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error } },
      startRunner: async () => {
        runner = launch(runnerFile, { ARCADE_NETWORK: "arc-testnet", ARCADE_SELLER_KEY: cfg.sellerKey, ARCADE_FEE_SPLITTER: cfg.splitter })
      },
      stopRunner: async () => { disconnectedAt = Date.now(); await stop(runner); runner = undefined },
      waitForPass: async () => {
        const candidate = await until(async () => {
          insist(runner !== undefined && !runner.done && !hub!.done, "a required process exited before the passing pay-test")
          const latest = rows().at(-1)
          return latest?.ok && latest.settleTx !== lastPass?.settleTx ? latest : undefined
        }, "no new passing paid canary purchase within 90 seconds")
        assertRestoredEvidence(await snapshot(), candidate, cfg.seller)
        lastPass = candidate
        console.log("A new passing purchase is durable; stopping execution before chain verification.")
        return candidate
      },
      proveOffline: async () => {
        await until(async () => {
          const history = rows(), observed = await snapshot()
          try { assertOfflineEvidence(observed, history, cfg.seller, disconnectedAt) } catch { return undefined }
          offlineRows = history.filter((row) => row.atMs >= disconnectedAt).slice(-3)
          return true
        }, "missing three durable offline failures and confirmed 404/discovery omission")
        console.log("Runner offline: both details are 404; three durable failed purchases and all discovery omissions are verified.")
      },
      proveHidden: async () => {
        await until(async () => {
          insist(runner !== undefined && !runner.done, "runner exited during reconnect")
          const observed = await snapshot()
          if (observed.detailStatus === 404) return undefined
          assertHiddenEvidence(observed, cfg.seller)
          return true
        }, "runner did not reannounce while retaining its delist verdict")
        console.log("Runner reconnected while the skill gate is closed: still delisted, still hidden, page explains why.")
      }
    })
    await stop(hub); hub = undefined
    insist(!same(proof.first.settleTx, proof.second.settleTx), "recovery must have a distinct settlement transaction")
    const receiptRows = database.query<{ json: string }, []>("SELECT json FROM receipts ORDER BY created_at_ms").all()
    const receipts: unknown[] = receiptRows.map((r) => JSON.parse(r.json))
    insist(receipts.filter((r) => object(r) && r["settled"] === true).length === 2, "unexpected extra paid receipt; inspect retained evidence before claiming the two-purchase proof")
    for (const purchase of [proof.first, proof.second]) {
      const receipt = receipts.find((r) => object(r) && r["jobId"] === purchase.jobId)
      let chain: unknown
      for (let attempt = 0; attempt < 5; attempt++) {
        try { chain = await rpc("eth_getTransactionReceipt", [purchase.settleTx]) }
        catch { check(); chain = undefined }
        if (chain !== null && chain !== undefined) break
        if (attempt < 4) await delay(Math.min(1_500 * 2 ** attempt, 12_000))
      }
      assertSettledEvidence(purchase, receipt, chain, cfg)
    }
    await writeFile(join(directory, "evidence.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), network: NETWORK,
      skillId: SKILL, seller: cfg.seller, buyer: cfg.buyer, splitter: cfg.splitter,
      first: proof.first, offlineFailures: offlineRows, recovery: proof.second,
      claims: ["offline details return 404", "three durable offline failures", "all four catalogues omit the listing",
        "reconnect alone preserves delisting", "distinct paid recovery restores discovery", "both receipts and on-chain transfers/tree events match"] }, null, 2))
    return proof
  }, async () => {
    clearTimeout(timer); process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal)
    try { await owned.close() } finally {
      database?.close()
      if (directory !== undefined) console.log(`Retained local evidence (no keys): ${directory}`)
    }
  }, proof => {
    console.log("PASS — two independently verified Arc testnet purchases; genuine scheduled canary, no payment mocks.")
    console.log(`First: https://testnet.arcscan.app/tx/${proof.first.settleTx}`)
    console.log(`Recovery: https://testnet.arcscan.app/tx/${proof.second.settleTx}`)
  })
}

export const main = async (argv: string[] = process.argv.slice(2)): Promise<number> => {
  if (argv.length === 1 && argv[0] === "--help") {
    console.log("Usage: bash scripts/e2e-canary.sh\nRequires ARCADE_CANARY_KEY (dedicated OWNER-funded arcade-canary-key), ARCADE_FACILITATOR_KEY, ARCADE_SELLER_KEY and ARCADE_FEE_SPLITTER. Arc testnet only; two $0.01 paid checks plus facilitator gas. Keys are supplied only by the consuming command, never files. No runner init or saved configuration is changed.")
    return 0
  }
  try {
    insist(argv.length === 0, "unsupported argument; use --help")
    await runLiveEvidence(readEvidenceConfig(process.env))
    return 0
  } catch (error) {
    console.error(`FAIL: ${error instanceof EvidenceError ? error.message : "evidence run failed; no raw diagnostics printed"}`)
    return 1
  }
}

if (import.meta.main) process.exitCode = await main()
