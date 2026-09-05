import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { helloDigest } from "@arcade/core"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))
const seller = privateKeyToAccount(generatePrivateKey()) // Ephemeral offline signing fixture, never funded.
const HASH = `0x${"a".repeat(64)}`
const listing = (id: string) => ({ id, version: "1.0.0", serviceName: id, description: "Public Hello fixture",
  tags: [], price: "$0.01", bounds: { timeoutSec: 5 }, inputSchema: { type: "object" }, outputSchema: { type: "object" } })
const claim = (skillId: string, agentId: string) => ({ skillId, agentId, registrationTx: HASH })
const waitFor = async (check: () => boolean | Promise<boolean>, what: string) => {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw new Error(`timed out: ${what}`)
}
const stop = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>(resolve => { const timer = setTimeout(() => child.kill("SIGKILL"), 1500)
    child.once("close", () => { clearTimeout(timer); resolve() }); child.kill("SIGTERM") })
}
type Snapshot = { runner?: { activeJobs: number }; route?: string; assigned?: string;
  result: { status: string; tag?: string; outcome?: { output?: { source?: string } } } | null }
const withHub = async (check: (h: { base: string; output(): string; release(): void;
  control(op: "dispatch" | "state", runnerId: string, jobId: string, skillId: string): Promise<Snapshot>;
  hello(runnerId: string, ids: string[], agents?: ReturnType<typeof claim>[], reuse?: WebSocket): Promise<{ ws: WebSocket; ack: Promise<{ ok: boolean }> }> }) => Promise<void>) => {
  const child = spawn("bun", ["run", "--preload", "./apps/hub/test/fixtures/erc8004-hello-preload.ts", "apps/hub/src/server.ts"], {
    cwd: ROOT, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0",
      ARCADE_NETWORK: "arc-testnet", ARCADE_HUB_SECRET: "hello-fixture-only", TEST_SELLER: seller.address }
  })
  let output = "", base = ""
  const sockets: WebSocket[] = []
  const record = (part: Buffer) => { output = (output + String(part)).slice(-200_000)
    const port = /\[hello-test-port\] (\d+)/.exec(output)?.[1]; if (port) base = `http://127.0.0.1:${port}` }
  child.stdout.on("data", record); child.stderr.on("data", record)
  try {
    await waitFor(() => !!base, "hub start").catch(error => { throw new Error(`${String(error)}\n${output}`) })
    await check({ base, output: () => output, release: () => { child.stdin.write("release\n") },
      control: async (op, runnerId, jobId, skillId) => {
        const id = crypto.randomUUID()
        child.stdin.write(JSON.stringify({ id, op, runnerId, jobId, skillId }) + "\n")
        let snapshot: Snapshot | undefined
        await waitFor(() => {
          for (const line of output.slice(0, output.lastIndexOf("\n")).split("\n").filter(line => line.startsWith("[hello-control] "))) {
            const value = JSON.parse(line.slice(16)) as Snapshot & { id: string }
            if (value.id === id) snapshot = value
          }
          return snapshot !== undefined
        }, "fixture snapshot")
        return snapshot!
      },
      hello: async (runnerId, ids, agents, reuse) => {
        const ws = reuse ?? new WebSocket(base.replace("http:", "ws:") + "/ws"); if (!reuse) sockets.push(ws)
        const ack = new Promise<{ ok: boolean }>(resolve => {
          ws.addEventListener("message", e => { const msg = JSON.parse(String(e.data)); if (msg._tag === "Ack") resolve(msg) })
          ws.addEventListener("close", () => resolve({ ok: false }))
          ws.addEventListener("error", () => resolve({ ok: false }))
        })
        await waitFor(() => ws.readyState === WebSocket.OPEN, "WebSocket open")
        const nonce = `${Date.now()}-${crypto.randomUUID()}`
        const signature = await seller.signMessage({ message: helloDigest({ runnerId, seller: seller.address, nonce, skillIds: ids }) })
        ws.send(JSON.stringify({ _tag: "Hello", runnerId, seller: seller.address, listings: ids.map(listing),
          maxConcurrency: 2, agentVersion: "test", nonce, signature, ...(agents === undefined ? {} : { agents }) }))
        return { ws, ack }
      } })
    expect(output).not.toContain("PRIVATE_PROVIDER_KEY")
  } finally { for (const ws of sockets) ws.close(); await stop(child) }
}
const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(3000) })
describe("actual signed Hello identity claims", () => {
  it("keeps valid old v2 Hello messages working with no claim reads", async () => {
    await withHub(async h => {
      const old = await h.hello("rnr_old", ["old-listing"])
      expect(await old.ack).toMatchObject({ ok: true })
      expect((await (await get(`${h.base}/listings/old-listing/agent-registration.json`)).json()).registrations).toEqual([])
      expect(h.output()).not.toContain("[claim-read]")
    })
  }, 15_000)
  it("stores proven/unavailable claims, drops wrong owners and duplicates, and filters unannounced skills before reads", async () => {
    await withHub(async h => {
      const ids = ["claim-proven", "claim-unverified", "claim-wrong", "claim-duplicate"]
      const current = await h.hello("rnr_claims", ids, [claim(ids[0]!, "1"), claim(ids[1]!, "3"), claim(ids[2]!, "2"),
        claim(ids[3]!, "4"), claim(ids[3]!, "5"), claim("not-announced", "99")])
      expect(await current.ack).toMatchObject({ ok: true })
      const rows = h.output().split("\n").filter(line => line.startsWith("[claim-stored] ")).map(line => JSON.parse(line.slice(15)))
      expect(rows.find(row => row.id === ids[0])).toMatchObject({ agentId: "1", agentVerified: true })
      expect(rows.find(row => row.id === ids[1])).toMatchObject({ agentId: "3", agentVerified: false })
      expect(rows.find(row => row.id === ids[2])).toMatchObject({ agentId: null, agentVerified: null })
      expect(rows.find(row => row.id === ids[3])).toMatchObject({ agentId: null, agentVerified: null })
      expect(h.output()).not.toMatch(/\[claim-read\] (99|4|5)\b/)
      for (const [id, agentId] of [[ids[0], "1"], [ids[1], "3"], [ids[2], undefined], [ids[3], undefined]]) {
        const doc = await (await get(`${h.base}/listings/${id}/agent-registration.json`)).json()
        expect(doc.active).toBe(true); expect(doc.registrations[0]?.agentId).toBe(agentId)
      }
    })
  }, 15_000)
  it("does not resurrect a closed Hello when its delayed owner read completes after replacement", async () => {
    await withHub(async h => {
      const old = await h.hello("rnr_shared", ["old-delayed"], [claim("old-delayed", "4")])
      await waitFor(() => h.output().includes("[claim-read] 4"), "delayed owner read")
      old.ws.close(); await old.ack
      const current = await h.hello("rnr_shared", ["new-current"], [claim("new-current", "5")])
      expect(await current.ack).toMatchObject({ ok: true })
      h.release(); await waitFor(() => h.output().includes("[claims-done] 4"), "old verification completion")
      expect((await get(`${h.base}/listings/old-delayed`)).status).toBe(404)
      expect((await get(`${h.base}/listings/new-current`)).status).toBe(200)
    })
  }, 15_000)
  it("does not let a slower earlier Hello overwrite a newer authenticated connection", async () => {
    await withHub(async h => {
      const old = await h.hello("rnr_shared", ["old-delayed"], [claim("old-delayed", "4")])
      await waitFor(() => h.output().includes("[claim-read] 4"), "delayed owner read")
      const current = await h.hello("rnr_shared", ["new-current"], [claim("new-current", "5")])
      expect(await current.ack).toMatchObject({ ok: true })
      h.release(); await waitFor(() => h.output().includes("[claims-done] 4"), "old verification completion")
      expect((await get(`${h.base}/listings/old-delayed`)).status).toBe(404)
      old.ws.close()
      expect((await get(`${h.base}/listings/new-current`)).status).toBe(200)
    })
  }, 15_000)
  it("an old authenticated socket closing cannot remove the replacement runner", async () => {
    await withHub(async h => {
      const old = await h.hello("rnr_shared", ["old-current"], [claim("old-current", "1")]); expect((await old.ack).ok).toBe(true)
      const current = await h.hello("rnr_shared", ["new-current"], [claim("new-current", "5")]); expect((await current.ack).ok).toBe(true)
      old.ws.close(); await waitFor(() => old.ws.readyState === WebSocket.CLOSED, "old socket close")
      expect((await get(`${h.base}/listings/new-current`)).status).toBe(200)
      expect((await (await get(`${h.base}/runners`)).json()).map((r: { runnerId: string }) => r.runnerId)).toEqual(["rnr_shared"])
      expect((await get(`${h.base}/listings/old-current`)).status).toBe(404)
      expect(JSON.stringify(await (await get(`${h.base}/listings`)).json())).not.toContain("old-current")
      expect((await h.control("state", "rnr_shared", "unused", "old-current")).route).toBeUndefined()
    })
  }, 15_000)
  it("fails old pending jobs when a different socket replaces the same runner id", async () => {
    await withHub(async h => {
      const old = await h.hello("rnr_shared", ["old-current"]); expect((await old.ack).ok).toBe(true)
      await h.control("dispatch", "rnr_shared", "job_oldpending", "old-current")
      expect((await h.control("state", "rnr_shared", "job_oldpending", "old-current")).assigned).toBe("rnr_shared")
      const current = await h.hello("rnr_shared", ["new-current"]); expect((await current.ack).ok).toBe(true)
      expect((await h.control("state", "rnr_shared", "job_oldpending", "old-current")).result)
        .toEqual({ status: "failed", tag: "RunnerDisconnected" })
    })
  }, 15_000)
  it("ignores results and heartbeats from a superseded socket while accepting its successor", async () => {
    await withHub(async h => {
      const old = await h.hello("rnr_shared", ["same-skill"]); expect((await old.ack).ok).toBe(true)
      const current = await h.hello("rnr_shared", ["same-skill"]); expect((await current.ack).ok).toBe(true)
      await h.control("dispatch", "rnr_shared", "job_successor", "same-skill")
      const result = (source: string) => JSON.stringify({ _tag: "JobResult", jobId: "job_successor",
        outcome: { status: "succeeded", output: { source }, startedAtMs: 0, finishedAtMs: 1 } })
      old.ws.send(result("old"))
      old.ws.send(JSON.stringify({ _tag: "Heartbeat", runnerId: "rnr_shared", atMs: 123, activeJobs: 99 }))
      await waitFor(() => h.output().includes("[message-done] Heartbeat 123") &&
        h.output().includes("[message-done] JobResult job_successor"), "old result and heartbeat handled")
      const snapshot = await h.control("state", "rnr_shared", "job_successor", "same-skill")
      expect(snapshot.result).toBeNull(); expect(snapshot.assigned).toBe("rnr_shared")
      expect(snapshot.runner?.activeJobs).toBe(0)
      current.ws.send(result("new"))
      current.ws.send(JSON.stringify({ _tag: "Heartbeat", runnerId: "rnr_shared", atMs: 456, activeJobs: 2 }))
      await waitFor(() => h.output().includes("[message-done] Heartbeat 456"), "successor heartbeat handled")
      const completed = await h.control("state", "rnr_shared", "job_successor", "same-skill")
      expect(completed.result?.outcome?.output).toEqual({ source: "new" }); expect(completed.runner?.activeJobs).toBe(2)
    })
  }, 15_000)
  it("refreshes the same socket's skills without losing its in-flight job", async () => {
    await withHub(async h => {
      const current = await h.hello("rnr_shared", ["old-current"]); expect((await current.ack).ok).toBe(true)
      await h.control("dispatch", "rnr_shared", "job_refresh", "old-current")
      const refreshed = await h.hello("rnr_shared", ["new-current"], undefined, current.ws)
      expect((await refreshed.ack).ok).toBe(true)
      const snapshot = await h.control("state", "rnr_shared", "job_refresh", "old-current")
      expect(snapshot.assigned).toBe("rnr_shared"); expect(snapshot.result).toBeNull(); expect(snapshot.route).toBeUndefined()
      expect((await get(`${h.base}/listings/old-current`)).status).toBe(404)
      current.ws.send(JSON.stringify({ _tag: "JobResult", jobId: "job_refresh",
        outcome: { status: "succeeded", output: { source: "same" }, startedAtMs: 0, finishedAtMs: 1 } }))
      await waitFor(() => h.output().includes("[message-done] JobResult job_refresh"), "refresh result handled")
      expect((await h.control("state", "rnr_shared", "job_refresh", "new-current")).result?.outcome?.output).toEqual({ source: "same" })
    })
  }, 15_000)
  it("does not switch an authenticated socket to another runner identity", async () => {
    await withHub(async h => {
      const connected = await h.hello("rnr_original", ["original-listing"])
      expect((await connected.ack).ok).toBe(true)
      const second = new Promise<{ ok: boolean }>(resolve => connected.ws.addEventListener("message", event => {
        const message = JSON.parse(String(event.data)); if (message._tag === "Ack") resolve(message)
      }, { once: true }))
      const nonce = `${Date.now()}-${crypto.randomUUID()}`
      const signature = await seller.signMessage({ message: helloDigest({ runnerId: "rnr_changed", seller: seller.address,
        nonce, skillIds: ["changed-listing"] }) })
      connected.ws.send(JSON.stringify({ _tag: "Hello", runnerId: "rnr_changed", seller: seller.address,
        listings: [listing("changed-listing")], maxConcurrency: 2, agentVersion: "test", nonce, signature }))
      expect((await second).ok).toBe(false)
      await waitFor(() => connected.ws.readyState === WebSocket.CLOSED, "identity-change socket close")
      expect(await (await get(`${h.base}/runners`)).json()).toEqual([])
      expect((await get(`${h.base}/listings/changed-listing`)).status).toBe(404)
    })
  }, 15_000)
})
