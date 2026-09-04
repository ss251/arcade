import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { helloDigest } from "@arcade/core"

/** Real scheduled fiber + HTTP buyer + signed runner, with offline cryptographic test rail. */
it("automatically delists, retains the verdict across a reconnect, and relists after a marked settled purchase", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url))
  const directory = mkdtempSync(join(tmpdir(), "arcade-canary-http-"))
  const key = generatePrivateKey() // Ephemeral, never funded.
  const seller = privateKeyToAccount(generatePrivateKey())
  const listing = { id: "automatic-canary", version: "1.0.0", serviceName: "Automatic Canary", description: "test",
    tags: [], price: "$0.01", bounds: { timeoutSec: 5 }, canaryInput: { text: "test" },
    inputSchema: { type: "object", required: ["text"] }, outputSchema: { type: "object", required: ["ok"] } }
  let hub: ChildProcessWithoutNullStreams | undefined
  let ws: WebSocket | undefined
  let output = "", base = ""
  let mode: "fail" | "hold" | "pass" = "fail"
  const pending: string[] = []
  const waitFor = async (check: () => Promise<boolean>, label: string) => {
    const until = Date.now() + 12_000
    do {
      if (await check().catch(() => false)) return
      if (hub?.exitCode !== null) throw new Error(`hub stopped before ${label}: ${output}`)
      await new Promise(resolve => setTimeout(resolve, 20))
    } while (Date.now() < until)
    throw new Error(`waiting for ${label}: ${output}`)
  }
  const reply = (jobId: string) => ws!.send(JSON.stringify({ _tag: "JobResult", jobId,
    outcome: { status: "succeeded", stopReason: "end_turn", startedAtMs: Date.now(), finishedAtMs: Date.now(),
      output: mode === "pass" ? { ok: true } : {} } }))
  const connect = async () => {
    ws = new WebSocket(base.replace("http:", "ws:") + "/ws")
    await new Promise<void>((resolve, reject) => {
      ws!.addEventListener("open", () => { void (async () => {
        const runnerId = "rnr_automatic_canary", nonce = `${Date.now()}-${crypto.randomUUID()}`
        const signature = await seller.signMessage({ message: helloDigest({ runnerId, seller: seller.address, nonce, skillIds: [listing.id] }) })
        ws!.send(JSON.stringify({ _tag: "Hello", runnerId, seller: seller.address, nonce, signature,
          listings: [listing], maxConcurrency: 1, agentVersion: "test" }))
      })().catch(reject) })
      ws!.addEventListener("error", () => reject(new Error("test runner connection failed")))
      ws!.addEventListener("message", event => {
        const msg = JSON.parse(String(event.data))
        if (msg._tag === "Ack") { if (msg.ok) resolve(); else reject(new Error("test Hello refused")) }
        if (msg._tag === "JobAssignment") { if (mode === "hold") pending.push(msg.jobId); else reply(msg.jobId) }
      })
    })
  }
  try {
    hub = spawn("bun", ["run", "--preload", "./apps/hub/test/fixtures/delisted-http-preload.ts", "apps/hub/src/server.ts"], {
      cwd: root, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0",
        ARCADE_NETWORK: "arc-testnet", ARCADE_DB: join(directory, "hub.sqlite"), ARCADE_HUB_SECRET: "canary-http-test-only",
        ARCADE_TEST_BALANCE: "$1000", ARCADE_CANARY_KEY: key, ARCADE_CANARY_INTERVAL: "100ms", ARCADE_CANARY_TICK: "100ms",
        TEST_AUTO_CANARY: "1" }
    })
    const capture = (chunk: Buffer) => {
      output += String(chunk)
      const port = /\[delist-test-port\] (\d+)/.exec(output)?.[1]
      if (port !== undefined) base = `http://127.0.0.1:${port}`
    }
    hub.stdout.on("data", capture); hub.stderr.on("data", capture)
    await waitFor(async () => base !== "" && (await fetch(`${base}/healthz`)).ok, "boot")
    await connect()
    const detail = async () => (await fetch(`${base}/listings/${listing.id}`)).json()
    await waitFor(async () => (await detail()).delisted === true, "three automatic failures")
    expect((await detail()).payTestHistory.slice(-3).every((r: { ok: boolean }) => !r.ok)).toBe(true)
    ws!.close()
    await waitFor(async () => (await fetch(`${base}/listings/${listing.id}`)).status === 404, "runner disconnection")
    mode = "hold"
    await connect()
    expect((await detail()).delisted).toBe(true)
    expect(await (await fetch(`${base}/skill/${listing.id}`)).text()).toContain("delisted: failed pay-test")
    for (const path of ["/listings", "/openapi.json", "/.well-known/x402", "/skill.md"]) {
      expect(await (await fetch(base + path)).text()).not.toContain(listing.id)
    }
    mode = "pass"
    for (const jobId of pending.splice(0)) reply(jobId)
    await waitFor(async () => (await detail()).payTested?.ok === true, "automatic recovery purchase")
    const recovered = await detail()
    expect(recovered.delisted).toBe(false)
    expect(recovered.payTested.settleTx).toMatch(/^0xtest/)
    expect(recovered.payTested.jobId).toMatch(/^job_/)
    const receipts = await (await fetch(`${base}/receipts`)).json()
    expect(receipts.some((r: { settled: boolean; canary?: boolean; settleTx?: string }) =>
      r.settled && r.canary === true && r.settleTx === recovered.payTested.settleTx)).toBe(true)
    expect(receipts.every((r: { buyer?: string }) => r.buyer === undefined)).toBe(true)
    expect(await (await fetch(`${base}/listings`)).text()).toContain(listing.id)
    expect(await (await fetch(`${base}/skill/${listing.id}`)).text()).toContain("pay-tested")
    expect(output).toContain("[canary] on — buyer")
    expect(output).not.toContain(key)
  } finally {
    ws?.close()
    if (hub !== undefined && hub.exitCode === null && hub.signalCode === null) {
      const child = hub
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => child.kill("SIGKILL"), 2_000)
        child.once("close", () => { clearTimeout(timeout); resolve() })
        child.kill("SIGTERM")
      })
    }
    rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)
