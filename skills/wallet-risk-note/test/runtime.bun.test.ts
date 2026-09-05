import { afterEach, describe, expect, it } from "bun:test"
import { Effect, Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { execSkill } from "../../../packages/runner/src/exec.ts"
import { startHireBroker, type PurchaseFn } from "../../../packages/runner/src/hire-broker.ts"
import { createServer, type Server } from "node:http"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ENTRY = join(SKILL_DIR, "run.ts")
const MANIFEST = Schema.decodeUnknownSync(SkillManifest)(JSON.parse(readFileSync(join(SKILL_DIR, "arcade.json"), "utf8")))
const ADDRESS = `0x${"a".repeat(40)}`
const SELLER = `0x${"b".repeat(40)}`
const HASH = `0x${"c".repeat(64)}`
const SUBGRAPH = "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
const PARENT = "job_runtimeparent0000"
const PRIVATE_DIAGNOSTIC = "PRIVATE_POST_DISPATCH_PROVIDER_DIAGNOSTIC"

const within = async <T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Promise.resolve(promise), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("owned fixture deadline exceeded")), timeoutMs)
    })])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}
/** Signals only a handle spawned by this fixture, and never returns before reap. */
const reap = async (proc: Bun.Subprocess): Promise<void> => {
  if (proc.exitCode === null && proc.signalCode === null) {
    try { proc.kill("SIGTERM") } catch { /* may have exited between the check and signal */ }
  }
  try { await within(proc.exited, 250) }
  catch {
    if (proc.exitCode === null && proc.signalCode === null) {
      try { proc.kill("SIGKILL") } catch { /* the exit promise remains authoritative */ }
    }
    await within(proc.exited, 1_000)
  }
}
const waitFor = async (condition: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error("owned fixture did not become ready")
    await Bun.sleep(5)
  }
}
const closeServer = async (server: Server): Promise<void> => {
  server.closeAllConnections()
  if (server.listening) await within(new Promise<void>(resolveClose => server.close(() => resolveClose())), 1_000)
}
const flowResult = () => ({
  address: ADDRESS, balanceUsdc: "2.000000", balanceAtomic: "2000000", nonce: 3,
  isContract: false, chainId: 5_042_002, blockNumber: "123456", checkedAt: new Date().toISOString()
})
const graphResult = () => ({
  address: ADDRESS, verdict: "manual-review", identities: [], attesterSettledCount: 0,
  contradictions: ["no-erc8004-identity"],
  sources: [{ name: "agent0-identities",
    endpoint: `https://gateway.thegraph.com/api/x402/subgraphs/id/${SUBGRAPH}`, subgraphId: SUBGRAPH,
    block: 12, blockHash: HASH, chain: "eip155:8453", costAtomic: "10000", paymentTx: HASH }],
  evidenceFlags: ["payment-proof-unverified"]
})

let activeServer: Server | undefined
let activeDirectory: string | undefined
afterEach(async () => {
  const server = activeServer, directory = activeDirectory
  activeServer = undefined; activeDirectory = undefined
  try { if (server !== undefined) await closeServer(server) }
  finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }) }
})

const withBroker = async <T>(purchase: PurchaseFn, work: (grant: { socketPath: string; jobId: string; token: string }) => Promise<T>): Promise<T> => {
  activeDirectory = mkdtempSync(join(tmpdir(), "wallet-risk-runtime-"))
  const socketPath = join(activeDirectory, "broker.sock")
  const originalFetch = globalThis.fetch
  globalThis.fetch = Object.assign(async () => Response.json({ seller: SELLER }),
    { preconnect: () => { throw new Error("unexpected external preconnect") } })
  const broker = startHireBroker({ hubUrl: "http://owned.invalid", subBuyKey: `0x${"1".repeat(64)}`, socketPath, purchase })
  try {
    await waitFor(() => existsSync(socketPath))
    const token = broker.openJob(PARENT, 0.08, "test.runtime.lineage")
    return await work({ socketPath, jobId: PARENT, token })
  } finally {
    broker.closeJob(PARENT); broker.stop(); globalThis.fetch = originalFetch
    await waitFor(() => !existsSync(socketPath))
  }
}
const execute = async (hire?: { socketPath: string; jobId: string; token: string }, logs: string[] = []) => {
  // Serial test-only interception records only this exact skill entry. Production
  // Scope sends TERM on interruption; the fixture additionally awaits/reaps it.
  const originalSpawn = Bun.spawn, owned: Bun.Subprocess[] = []
  Bun.spawn = ((...args: Parameters<typeof Bun.spawn>) => {
    const proc = originalSpawn(...args)
    if (Array.isArray(args[0]) && args[0][0] === "bun" && args[0][1] === "--no-env-file" &&
      args[0][2] === "run" && args[0][3] === ENTRY) owned.push(proc)
    return proc
  }) as typeof Bun.spawn
  try {
    return await Effect.runPromise(Effect.scoped(execSkill({ manifest: MANIFEST, skillDir: SKILL_DIR,
      jobId: PARENT, input: { address: ADDRESS, minUsdc: 1 }, ...(hire === undefined ? {} : { hire }),
      onLog: line => logs.push(line) })).pipe(Effect.timeoutFail({ duration: 5_000,
        onTimeout: () => new Error("owned fixture deadline exceeded") })))
  } finally {
    Bun.spawn = originalSpawn
    await Promise.all(owned.map(reap))
  }
}

describe("actual wallet entry through execSkill and the owned broker", () => {
  it("interrupts and reaps the owned scoped child before an observer deadline returns", async () => {
    activeDirectory = mkdtempSync(join(tmpdir(), "wallet-risk-observer-"))
    const socketPath = join(activeDirectory, "stall.sock")
    let requests = 0
    activeServer = createServer(req => { requests++; req.resume() })
    await new Promise<void>((resolveListen, reject) => {
      activeServer!.once("error", reject); activeServer!.listen(socketPath, resolveListen)
    })
    const originalSpawn = Bun.spawn, owned: Bun.Subprocess[] = []
    Bun.spawn = ((...args: Parameters<typeof Bun.spawn>) => {
      const proc = originalSpawn(...args)
      owned.push(proc)
      return proc
    }) as typeof Bun.spawn
    try {
      await expect(execute({ socketPath, jobId: PARENT, token: "d".repeat(64) })).rejects.toThrow()
      expect(requests).toBe(1)
      expect(owned).toHaveLength(1)
      // No wait here: the fixture must not return before its exact child is reaped.
      expect(owned[0]!.exitCode !== null || owned[0]!.signalCode !== null).toBe(true)
      await within(owned[0]!.exited, 500)
    } finally {
      Bun.spawn = originalSpawn
      // The Red itself must not strand the old helper's still-running child.
      for (const proc of owned) {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGTERM")
        try { await within(proc.exited, 500) }
        catch { proc.kill("SIGKILL"); await within(proc.exited, 1_000) }
      }
    }
  }, 10_000)

  it("executes two dummy settled children and emits a single validated result", async () => {
    const calls: Parameters<PurchaseFn>[0][] = []
    const purchase: PurchaseFn = async args => {
      calls.push(args)
      const flow = args.skillId === "usdc-flow-check"
      return { jobId: flow ? "job_runtimeflow00000" : "job_runtimegraph0000", settled: true,
        result: flow ? flowResult() : graphResult(), fenced: "bounded\nfixture", paidAtomic: flow ? 10_000n : 50_000n }
    }
    const logs: string[] = []
    const outcome = await withBroker(purchase, grant => execute(grant, logs))
    expect(outcome.status).toBe("succeeded")
    expect(outcome.output).toMatchObject({ verdict: "caution", counterparty: { verdict: "manual-review" },
      sourcedFrom: { paidUsdc: "$0.0100", budgetLeftUsd: "$0.0200",
        counterpartyGraph: { paidUsdc: "$0.0500" } } })
    expect(calls.map(call => [call.skillId, call.maxAmountAtomic, call.lineage])).toEqual([
      ["usdc-flow-check", 10_000n, "test.runtime.lineage"],
      ["counterparty-graph", 50_000n, "test.runtime.lineage"]
    ])
    expect(logs).toEqual([])
  }, 12_000)

  it("settles the flow-only note after the broker definitively reports Graph nonsettlement", async () => {
    const purchase: PurchaseFn = async args => args.skillId === "usdc-flow-check"
      ? { jobId: "job_runtimeflow00000", settled: true, result: flowResult(), fenced: "fixture", paidAtomic: 10_000n }
      : { jobId: "job_runtimegraph0000", settled: false, result: null,
          fenced: "<<<UNTRUSTED>>>\nnull\n<<<END>>>", paidAtomic: 0n }
    const outcome = await withBroker(purchase, grant => execute(grant))
    expect(outcome.status).toBe("succeeded")
    expect(outcome.output).toMatchObject({ verdict: "caution", counterparty: null,
      sourcedFrom: { budgetLeftUsd: "$0.0700", counterpartyGraph: null } })
  }, 12_000)

  it("refuses a post-dispatch broker failure once without reflecting its diagnostic", async () => {
    let dispatches = 0
    const purchase: PurchaseFn = async () => { dispatches++; throw new Error(PRIVATE_DIAGNOSTIC) }
    const logs: string[] = []
    const outcome = await withBroker(purchase, grant => execute(grant, logs))
    expect(outcome.status).toBe("refused")
    expect(outcome.stopReason).toBe("refusal")
    expect(dispatches).toBe(1)
    expect(JSON.stringify({ outcome, logs })).not.toContain(PRIVATE_DIAGNOSTIC)
    expect(logs).toEqual([])
  }, 12_000)

  it("refuses an actual launch with no grant and emits no inherited sensitive marker", async () => {
    const prior = process.env["WALLET_RUNTIME_PRIVATE_MARKER"]
    process.env["WALLET_RUNTIME_PRIVATE_MARKER"] = PRIVATE_DIAGNOSTIC
    const logs: string[] = []
    try {
      const outcome = await execute(undefined, logs)
      expect(outcome.status).toBe("refused")
      expect(JSON.stringify({ outcome, logs })).not.toContain(PRIVATE_DIAGNOSTIC)
      expect(logs).toEqual([])
    } finally {
      if (prior === undefined) delete process.env["WALLET_RUNTIME_PRIVATE_MARKER"]
      else process.env["WALLET_RUNTIME_PRIVATE_MARKER"] = prior
    }
  }, 8_000)
})

interface ProcessResult { readonly stdout: string; readonly stderr: string; readonly exitCode: number }
const observeProcess = async (proc: Bun.Subprocess<"pipe" | "ignore", "pipe", "pipe">, timeoutMs: number): Promise<ProcessResult> => {
  const observed = Promise.resolve().then(() => Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited
  ]))
  try {
    const [stdout, stderr, exitCode] = await within(observed, timeoutMs)
    return { stdout, stderr, exitCode }
  } finally {
    await reap(proc)
    await within(observed.then(() => undefined, () => undefined), 1_000)
  }
}
const spawnEntry = async (raw: string, environment: Record<string, string> = {}, timeoutMs = 4_000): Promise<ProcessResult> => {
  const proc = Bun.spawn(["bun", "--no-env-file", "run", ENTRY], { cwd: SKILL_DIR,
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", HOME: SKILL_DIR, LANG: "en_US.UTF-8", ...environment },
    stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  try {
    proc.stdin.write(raw); proc.stdin.end()
    return await observeProcess(proc, timeoutMs)
  } finally { await reap(proc) }
}
const oneRefusal = (result: ProcessResult, error: string): void => {
  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe("")
  const parsed = JSON.parse(result.stdout) as unknown
  expect(result.stdout).toBe(JSON.stringify(parsed))
  expect(parsed).toEqual({ stopReason: "refusal", error })
  expect(result.stdout).not.toContain(PRIVATE_DIAGNOSTIC)
}

describe("actual CLI framing and bounds", () => {
  it("reaps a TERM-resistant direct child before a failed observation returns", async () => {
    let ready = false
    const proc = Bun.spawn([process.execPath, "--no-env-file", "-e",
      'process.on("SIGTERM", () => {}); process.send?.("READY"); setInterval(() => {}, 1000)'], {
      env: {}, stdin: "ignore", stdout: "pipe", stderr: "pipe", ipc(message) { if (message === "READY") ready = true }
    })
    try {
      await waitFor(() => ready)
      await expect(observeProcess(proc, 50)).rejects.toThrow("owned fixture deadline exceeded")
      expect(proc.exitCode !== null || proc.signalCode !== null).toBe(true)
      expect(proc.signalCode).toBe("SIGKILL")
    } finally {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL")
      await within(proc.exited, 1_000)
    }
  }, 6_000)

  it("imports without reading stdin, writing output or leaving a timer", async () => {
    const target = pathToFileURL(ENTRY).href
    const proc = Bun.spawn(["bun", "--no-env-file", "-e", `await import(${JSON.stringify(target)})`], {
      cwd: SKILL_DIR, env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", HOME: SKILL_DIR },
      stdin: "ignore", stdout: "pipe", stderr: "pipe"
    })
    expect(await observeProcess(proc, 3_000)).toEqual({ stdout: "", stderr: "", exitCode: 0 })
  }, 7_000)

  it.each([
    ["invalid envelope", "[]"],
    ["truncated JSON", `{"jobId":${JSON.stringify(PARENT)},"input":`],
    ["oversized stdin", JSON.stringify({ jobId: PARENT, input: { address: ADDRESS }, padding: "x".repeat(70_000) })]
  ])("returns one bounded refusal for %s", async (_name, raw) => {
    oneRefusal(await spawnEntry(raw, { WALLET_RUNTIME_PRIVATE_MARKER: PRIVATE_DIAGNOSTIC }), "Wallet Risk Note input refused")
  }, 8_000)

  it("times out a dispatched Unix request and does not retry", async () => {
    activeDirectory = mkdtempSync(join(tmpdir(), "wallet-risk-timeout-"))
    const socketPath = join(activeDirectory, "stall.sock")
    let requests = 0
    activeServer = createServer(req => { requests++; req.resume() })
    await new Promise<void>((resolveListen, reject) => {
      activeServer!.once("error", reject); activeServer!.listen(socketPath, resolveListen)
    })
    const started = Date.now()
    const result = await spawnEntry(JSON.stringify({ jobId: PARENT, input: { address: ADDRESS } }), {
      ARCADE_HIRE_SOCKET: socketPath, ARCADE_JOB_ID: PARENT, ARCADE_JOB_TOKEN: "d".repeat(64),
      WALLET_RUNTIME_PRIVATE_MARKER: PRIVATE_DIAGNOSTIC
    }, 36_000)
    const elapsed = Date.now() - started
    oneRefusal(result, "Wallet Risk Note could not establish paid evidence; settlement refused")
    expect(requests).toBe(1)
    expect(elapsed).toBeGreaterThanOrEqual(31_000)
    expect(elapsed).toBeLessThan(36_000)
  }, 40_000)
})
