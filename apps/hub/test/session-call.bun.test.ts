import { describe, expect, it } from "bun:test"
import { createHmac } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createConnection } from "node:net"
import { Bounds, Job, JobOutcome, PublicListing, Receipt, helloDigest, loadChainConfig } from "@arcade/core"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { Effect, Ref } from "effect"
import { makeTestRail, makeTestState } from "@arcade/payments"
import { makeStore, type StoreState } from "../src/store.ts"
import { sessionRequestDigest } from "../src/session-ledger.ts"
import { makeSessions } from "../src/sessions.ts"
import { makeRails } from "../src/rails.ts"
import { BrokerLive, BrokerTag } from "../src/broker.ts"
import { makeSessionCallRoutes } from "../src/server-session-calls.ts"

const root = new URL("../../..", import.meta.url).pathname, secret = "offline-session-call-secret"
const sessionId = `ses_${"1".repeat(32)}`, jobId = `job_${"1".repeat(20)}`
const token = (domain: string) => createHmac("sha256", secret).update(domain).digest("hex").slice(0, 32)
const bounded = async <T>(p: Promise<T>, ms = 5000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([p, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(Error("Owned fixture deadline")), ms) })]) }
  finally { if (timer !== undefined) clearTimeout(timer) }
}
async function hub(check: (origin: string) => Promise<void>, env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "--no-env-file", "--preload", "./apps/hub/test/fixtures/session-call-preload.ts", "apps/hub/src/server.ts"], {
    cwd: root, env: { PATH: "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0",
      ARCADE_HUB_SECRET: secret, TEST_SESSION_CALL_FIXTURE: "1", ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  let output = "", origin = ""
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(), decoder = new TextDecoder()
    try { while (true) { const next = await reader.read(); if (next.done) break
      output = (output + decoder.decode(next.value, { stream: true })).slice(-32768)
      const port = /\[session-call-port\] (\d+)/.exec(output)?.[1]; if (port) origin = `http://127.0.0.1:${port}`
    } } finally { reader.releaseLock() }
  }
  const drains = Promise.all([drain(child.stdout), drain(child.stderr)])
  try {
    const deadline = Date.now() + 6000
    while (!origin && child.exitCode === null && child.signalCode === null && Date.now() < deadline) await Bun.sleep(10)
    if (!origin) throw Error(`Owned fixture did not bind: ${output}`)
    await check(origin)
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM")
      try { await bounded(child.exited, 500) } catch { child.kill("SIGKILL"); await bounded(child.exited, 1000) } }
    await bounded(drains)
    expect(output).not.toContain(secret); expect(output).not.toContain("RETAINED_UNPAID_OUTPUT")
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    if (origin) await expect(fetch(origin, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
  }
}
const get = (origin: string, path: string, headers: Record<string, string> = {}) => fetch(origin + path,
  { headers, signal: AbortSignal.timeout(5000), redirect: "error", credentials: "omit" })
const post = (origin: string, path: string, body: unknown, headers: Record<string, string> = {}) => fetch(origin + path,
  { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers }, signal: AbortSignal.timeout(7000), redirect: "error" })
const privateResponse = (r: Response) => { expect(r.headers.get("cache-control")).toBe("private, no-store"); return r }
const stats = async (origin: string) => (await get(origin, "/__session_call_fixture")).json()
async function buy(origin: string, skill = "demo") {
  const buyer = `0x${"a".repeat(40)}`
  const opened = await (await post(origin, "/sessions", { buyer, budgetUsd: "1", rail: "test" })).json()
  const headers = { "x-arcade-session": opened.session_id, "x-session-token": opened.session_token }
  const probe = privateResponse(await post(origin, `/x/${skill}/${skill}`, {}, headers))
  expect(probe.status).toBe(402)
  const requirements = (await probe.json()).accepts[0], seconds = Math.floor(Date.now() / 1000)
  const payment = { x402Version: 2, accepted: requirements, payload: { signature: "0xgood", authorization: { from: `0x${"A".repeat(40)}`,
    to: requirements.payTo, value: requirements.amount, validAfter: String(seconds - 1), validBefore: String(seconds + 600),
    nonce: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}` } } }
  const accepted = privateResponse(await post(origin, `/x/${skill}/${skill}`, {}, { ...headers, "payment-signature": Buffer.from(JSON.stringify(payment)).toString("base64") }))
  expect(accepted.status).toBe(202)
  const handle = await accepted.json()
  expect(handle.poll_url).toBe(`${origin}/jobs/${handle.job_id}/result`)
  expect(handle.job_token).toMatch(/^[0-9a-f]{32}$/)
  expect(handle.job_token).not.toBe(token(`arcade-job:${handle.job_id}`))
  return { headers, handle }
}
async function poll(origin: string, headers: Record<string, string>, handle: { job_id: string; job_token: string }) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const response = privateResponse(await get(origin, `/jobs/${handle.job_id}/result`, { ...headers, "x-job-token": handle.job_token }))
    if (response.status !== 202) { expect(response.status).toBe(200); return response.json() }
    expect(await response.json()).toEqual({ job_id: handle.job_id, status: "pending" }); await Bun.sleep(10)
  }
  throw Error("Owned result timeout")
}
async function raw(origin: string, head: string, body: string, late?: string) {
  const socket = createConnection({ host: "127.0.0.1", port: Number(new URL(origin).port) }), chunks: Buffer[] = []
  try {
    await bounded(new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject) }))
    const response = new Promise<string>((resolve, reject) => {
      socket.on("data", chunk => {
        chunks.push(Buffer.from(chunk)); const bytes = Buffer.concat(chunks)
        if (bytes.length > 65536) { reject(Error("Owned raw response bound")); return }
        const split = bytes.indexOf("\r\n\r\n")
        if (split < 0) return
        const length = /\r\ncontent-length: ([0-9]+)\r\n/i.exec(bytes.subarray(0, split + 2).toString("ascii"))?.[1]
        if (length !== undefined && bytes.length === split + 4 + Number(length)) resolve(bytes.toString("utf8"))
      }); socket.once("error", reject)
    })
    socket.write(head); socket.write(body)
    const text = await bounded(response, 7500)
    if (late !== undefined) { socket.write(late); await Bun.sleep(50) }
    return text
  } finally {
    // Observe the complete bounded HTTP response; Bun peer EOF is not asserted.
    const closed = socket.closed ? Promise.resolve() : new Promise<void>(resolve => socket.once("close", () => resolve()))
    socket.destroy(); await bounded(closed)
  }
}
describe("session paid production router", () => {
  it("delivers only the original actual memory terminal pair, then refuses subsequent corrupted state", async () => {
    const state = Effect.runSync(Ref.make<StoreState>({ sessions: new Map(), sessionCalls: new Map(), listings: new Map(), runners: new Map(),
      jobs: new Map(), receipts: [], ratings: [], trees: new Map(), payTests: new Map(), erc8004Docs: new Map() }))
    const store = makeStore(state), chain = loadChainConfig("arc-testnet"), buyer = `0x${"a".repeat(40)}`, seller = `0x${"b".repeat(40)}`
    const rail = makeTestRail(Effect.runSync(Ref.make(makeTestState({}, 1000n)))), rails = makeRails(rail, [])
    const sessions = makeSessions({ store, rails, chain }), broker = await Effect.runPromise(BrokerTag.pipe(Effect.provide(BrokerLive)))
    await Effect.runPromise(store.openSession({ id: sessionId, buyer, budgetAtomic: 100n, rail: "test", network: chain.caip2, openedAtMs: 1 }))
    const input = {}, job = Job.make({ id: jobId, skillId: "demo", buyer, seller, priceAtomic: 30n, input, status: "queued", createdAtMs: 2, rootJobId: jobId, hop: 0, ancestors: [] })
    await Effect.runPromise(store.reserveSessionJob({ sessionId, jobId, buyer, seller, skillId: "demo", skillVersion: "1.0.0", rail: "test", network: chain.caip2,
      asset: chain.usdc.address, verifyingContract: chain.usdc.address, domainName: chain.usdc.eip712Name, domainVersion: chain.usdc.eip712Version,
      payTo: seller, amountAtomic: 30n, nonce: `0x${"f".repeat(64)}`, validAfter: 1n, validBefore: 600n, requestDigest: sessionRequestDigest(input) }, job))
    await Effect.runPromise(store.beginSessionSettlement(sessionId, jobId))
    const outcome = JobOutcome.make({ status: "succeeded", output: { original: true }, startedAtMs: 2, finishedAtMs: 3 })
    const terminal = Job.make({ ...job, status: "succeeded", outcome }), txHash = `0xtest${"f".repeat(14)}`
    const receipt = Receipt.make({ jobId, skillId: "demo", skillVersion: "1.0.0", buyer, seller, priceAtomic: 30n, sellerAtomic: 30n, feeAtomic: 0n, feeBps: 0,
      rail: "test", network: chain.caip2, latencyMs: 1, settled: true, reason: "ok", createdAtMs: 3, sessionId, rootJobId: jobId, hop: 0, ancestors: [], settleTx: txHash, settleRefKind: "test" })
    await Effect.runPromise(store.finishSessionJob({ kind: "settled", sessionId, jobId, job: terminal, receipt, settlement: { payer: buyer, amountAtomic: 30n, txHash } }))
    // Original Red used getSessionReceipt + a later getJob and delivered the
    // mutation. With a one-read pair, this same interleaving retains original data.
    const wrapped = { ...store, getSessionTerminal: (...args: Parameters<typeof store.getSessionTerminal>) => store.getSessionTerminal(...args).pipe(
      Effect.tap(() => Ref.update(state, s => ({ ...s, jobs: new Map(s.jobs).set(jobId, Job.make({ ...terminal,
        outcome: JobOutcome.make({ ...outcome, output: { forgedAfterValidation: true } }) })) })))) }
    const route = makeSessionCallRoutes({ store: wrapped, sessions, broker, rails, chain, hubSecret: secret, publicOrigin: url => url.origin })
    const request = () => new Request(`http://127.0.0.1/jobs/${jobId}/result`, { headers: { "x-arcade-session": sessionId,
      "x-session-token": token(`arcade-session:${sessionId}`), "x-job-token": token(`arcade-session-job:${sessionId}:${jobId}`) } })
    const response = await route(request())
    expect(response?.status).toBe(200)
    expect(await response?.json()).toMatchObject({ result: { original: true } })
    const later = await route(request())
    expect(later?.status).toBe(503); expect(await later?.json()).toEqual({ error: "session_unavailable" })
  })
  it("enforces actual raw paid1MiB/+1 and whole-body5second timeout without late admission", async () => {
    await hub(async origin => {
      const auth = `x-arcade-session: ${sessionId}\r\nx-session-token: ${token(`arcade-session:${sessionId}`)}\r\n`
      for (const extra of [0, 1]) {
        const body = JSON.stringify({ x: "a".repeat(1048576 - 8 + extra) })
        const response = await raw(origin, `POST /x/demo/demo HTTP/1.1\r\nHost: 127.0.0.1\r\n${auth}Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n`, body)
        expect(response).toContain(extra ? "400" : "402"); expect(response.toLowerCase()).toContain("cache-control: private, no-store")
      }
      const before = await stats(origin), started = performance.now()
      const response = await raw(origin, `POST /x/demo/demo HTTP/1.1\r\nHost: 127.0.0.1\r\n${auth}Content-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n`, "{", "}")
      expect(performance.now() - started).toBeGreaterThanOrEqual(4900)
      expect(response).toContain("400"); expect(response.toLowerCase()).toContain("cache-control: private, no-store")
      expect(await stats(origin)).toEqual(before)
      expect(before.dispatches).toBe(0); expect(before.networkRequests).toBe(0)
    })
  }, 16000)
  it("refuses metadata access with session headers even when given an ordinary token for legally retained released output", async () => {
    await hub(async origin => {
      const response = await get(origin, `/jobs/${jobId}`, { "x-arcade-session": sessionId,
        "x-session-token": token(`arcade-session:${sessionId}`), "x-job-token": token(`arcade-job:${jobId}`) })
      const body = await response.text()
      expect(body).not.toContain("RETAINED_UNPAID_OUTPUT")
      expect(body).not.toContain("PRIVATE_PROVIDER_DIAGNOSTIC")
      expect(response.status).toBe(404)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(await stats(origin)).toMatchObject({ reads: 0, networkRequests: 0, dispatches: 0 })
    })
  }, 10000)
  it("withholds retained released output and uses only actual private terminal evidence", async () => {
    await hub(async origin => {
      const response = privateResponse(await get(origin, `/jobs/${jobId}/result`, { "x-arcade-session": sessionId,
        "x-session-token": token(`arcade-session:${sessionId}`), "x-job-token": token(`arcade-session-job:${sessionId}:${jobId}`) }))
      expect(response.status).toBe(200)
      const body = await response.text(); expect(body).not.toContain("RETAINED_UNPAID_OUTPUT"); expect(body).not.toContain("PRIVATE_PROVIDER_DIAGNOSTIC")
      expect(JSON.parse(body)).toMatchObject({ job_id: jobId, status: "rejected", result: null, detail: "session_released", receipt: { settled: false, explorer: null } })
    })
  }, 10000)
  it("rejects new-domain tokens on both ordinary endpoints before all private reads", async () => {
    await hub(async origin => {
      const capability = token(`arcade-session-job:${sessionId}:${jobId}`)
      for (const path of [`/jobs/${jobId}`, `/jobs/${jobId}/result`]) for (const query of [false, true]) {
        const response = privateResponse(await get(origin, path + (query ? `?token=${capability}` : ""), query ? {} : { "x-job-token": capability }))
        expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "not_found" })
      }
      expect(await stats(origin)).toMatchObject({ reads: 0, networkRequests: 0 })
    })
  }, 10000)
  it("completes actual mixed-case TestRail paid calls through the real Broker with zero fee", async () => {
    await hub(async origin => {
      const { headers, handle } = await buy(origin), result = await poll(origin, headers, handle)
      expect(result).toMatchObject({ status: "succeeded", result: { answer: "owned paid output" },
        receipt: { rail: "test", settleRefKind: "test", feeAtomic: "0", sellerAtomic: "100000", explorer: null } })
      const snapshot = await (await get(origin, `/sessions/${headers["x-arcade-session"]}`, { "x-session-token": headers["x-session-token"] })).json()
      expect(snapshot).toMatchObject({ spent: "$0.10", held: "$0.00", complete: true })
      expect(await stats(origin)).toMatchObject({ networkRequests: 0, dispatches: 1 })
    })
  }, 10000)
  it("keeps seller-funded child calls ordinary and accounts only the admitted root", async () => {
    await hub(async origin => {
      const { headers, handle } = await buy(origin, "root-loop"), result = await poll(origin, headers, handle)
      expect(result.receipt).toMatchObject({ priceAtomic: "100000", settled: true, sessionId: headers["x-arcade-session"] })
      expect(result.receipt.children).toBeUndefined(); expect(result.receipt.treeHash).toBeUndefined()
      expect(await stats(origin)).toMatchObject({ networkRequests: 0, dispatches: 2,
        childHeaders: [{ session: false, sessionToken: false, hire: true }], children: [{ buyer: `0x${"b".repeat(40)}`, settled: true }] })
      expect((await (await get(origin, `/sessions/${headers["x-arcade-session"]}`, { "x-session-token": headers["x-session-token"] })).json()).calls).toHaveLength(1)
    })
  }, 12000)
  it("reopens the actual SQLite terminal with the original capability and no execution replay", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arcade-session-call-")), db = join(directory, "owned.sqlite")
    let saved: Awaited<ReturnType<typeof buy>> | undefined
    try {
      await hub(async origin => { saved = await buy(origin); await poll(origin, saved.headers, saved.handle) }, { ARCADE_DB: db })
      await hub(async origin => {
        if (saved === undefined) throw Error("Missing owned handle")
        expect((await poll(origin, saved.headers, saved.handle)).receipt.settled).toBe(true)
        expect(await stats(origin)).toMatchObject({ dispatches: 0, networkRequests: 0 })
      }, { ARCADE_DB: db })
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }, 15000)
  it.each([false, true])("stamps successful handshake observations only (unreadable=%s)", async unreadable => {
    const account = privateKeyToAccount(generatePrivateKey()) // Ephemeral offline signing, never funded.
    await hub(async origin => {
      const ws = new WebSocket(origin.replace("http:", "ws:") + "/ws")
      try {
        await bounded(new Promise<void>((resolve, reject) => { ws.addEventListener("open", () => resolve(), { once: true }); ws.addEventListener("error", () => reject(Error("Owned WebSocket failed")), { once: true }) }))
        const ack = bounded(new Promise<{ ok: boolean }>(resolve => ws.addEventListener("message", e => {
          const msg = JSON.parse(String(e.data)); if (msg._tag === "Ack") resolve(msg)
        })))
        const listing = PublicListing.make({ id: "observed", serviceName: "observed", version: "1.0.0", tags: [], description: "Offline Hello", price: "$0.10",
          inputSchema: {}, outputSchema: {}, bounds: Bounds.make({ timeoutSec: 5 }) })
        const nonce = `${Date.now()}-${crypto.randomUUID()}`, runnerId = "rnr_observed", feeSplitter = `0x${"c".repeat(40)}`
        const signature = await account.signMessage({ message: helloDigest({ runnerId, seller: account.address, nonce, skillIds: [listing.id], feeSplitter }) })
        ws.send(JSON.stringify({ _tag: "Hello", runnerId, seller: account.address, listings: [listing], maxConcurrency: 1, agentVersion: "test", nonce, signature, feeSplitter }))
        expect(await ack).toMatchObject({ ok: true })
        const facts = (await stats(origin)).handshakeFacts.find((f: { id: string }) => f.id === "observed")
        expect(facts).toEqual(unreadable ? { id: "observed", verified: false } : { id: "observed", fee: 500, network: "eip155:5042002", verified: true })
      } finally {
        const closed = new Promise<void>(resolve => ws.addEventListener("close", () => resolve(), { once: true }))
        ws.close(); await bounded(closed)
      }
    }, { TEST_HELLO_SELLER: account.address, ...(unreadable ? { TEST_SPLITTER_UNREADABLE: "1" } : {}) })
  }, 12000)
})
