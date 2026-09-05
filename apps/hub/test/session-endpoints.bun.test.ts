import { describe, expect, it } from "bun:test"
import { createHmac } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createConnection } from "node:net"
import { Effect } from "effect"
import { Job, JobOutcome, Receipt, loadChainConfig } from "@arcade/core"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { sessionRequestDigest, type SessionBinding } from "../src/session-ledger.ts"

const root = new URL("../../..", import.meta.url).pathname, secret = "offline-session-fixture-secret"
const buyer = `0x${"a".repeat(40)}`, sessionId = `ses_${"1".repeat(32)}`, legacyId = `job_${"2".repeat(20)}`
const token = (domain: string, id: string, key = secret) => createHmac("sha256", key).update(`arcade-${domain}:${id}`).digest("hex").slice(0, 32)
const bounded = async <T>(promise: Promise<T>, ms = 5000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(Error("Owned fixture deadline")), ms) })]) }
  finally { if (timer !== undefined) clearTimeout(timer) }
}
async function hub(env: Record<string, string>, check: (origin: string, output: () => string) => Promise<void>) {
  const child = Bun.spawn([process.execPath, "--no-env-file", "--preload", "./apps/hub/test/fixtures/session-endpoints-preload.ts", "apps/hub/src/server.ts"], {
    cwd: root, env: { PATH: "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0",
      ARCADE_HUB_SECRET: secret, TEST_SESSION_FIXTURE: "1", ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe"
  })
  let output = "", origin = ""
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(), decoder = new TextDecoder()
    try { while (true) { const part = await reader.read(); if (part.done) break
      output = (output + decoder.decode(part.value, { stream: true })).slice(-32768)
      const port = /\[session-port\] (\d+)/.exec(output)?.[1]; if (port) origin = `http://127.0.0.1:${port}`
    } } finally { reader.releaseLock() }
  }
  const streams = Promise.all([drain(child.stdout), drain(child.stderr)])
  try {
    const deadline = Date.now() + 6000
    while (!origin && child.exitCode === null && child.signalCode === null && Date.now() < deadline) await Bun.sleep(10)
    if (!origin) throw Error(`Owned fixture did not bind: ${output}`)
    await check(origin, () => output)
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM")
      try { await bounded(child.exited, 500) } catch { child.kill("SIGKILL"); await bounded(child.exited, 1000) } }
    await bounded(streams)
    expect(output).not.toContain(secret); expect(output).not.toContain("PRIVATE_SESSION_INPUT")
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    if (origin) await expect(fetch(origin, { signal: AbortSignal.timeout(500), redirect: "error", credentials: "omit" })).rejects.toThrow()
  }
}
const get = (origin: string, path: string, init?: RequestInit) => fetch(origin + path,
  { ...init, signal: AbortSignal.timeout(7000), redirect: "error", credentials: "omit" })
const privateResponse = (response: Response) => { expect(response.headers.get("cache-control")).toBe("private, no-store"); return response }
const stats = async (origin: string) => (await get(origin, "/__session_fixture")).json() as Promise<{ reads: number; writes: number; networkRequests: number; activeHandlers: number }>
const post = (origin: string, path: string, body: unknown, headers: Record<string, string> = {}) => get(origin, path,
  { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
const raw = async (origin: string, head: string, body: Uint8Array | string, lateBody?: string) => {
  const socket = createConnection({ host: "127.0.0.1", port: Number(new URL(origin).port) }), chunks: Buffer[] = []
  let ended = false
  try {
    await bounded(new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject) }))
    const done = new Promise<void>((resolve, reject) => {
      socket.on("data", c => {
        chunks.push(Buffer.from(c)); const bytes = Buffer.concat(chunks)
        if (bytes.length > 65536) { reject(Error("Owned response byte bound")); return }
        const split = bytes.indexOf("\r\n\r\n")
        if (split < 0) return
        const length = /\r\ncontent-length: ([0-9]+)\r\n/i.exec(bytes.subarray(0, split + 2).toString("ascii"))?.[1]
        if (length === undefined) { reject(Error("Owned response needs exact length")); return }
        if (bytes.length === split + 4 + Number(length)) resolve()
      })
      socket.once("end", () => { ended = true; reject(Error("Owned response ended before full body")) }); socket.once("error", reject)
    })
    socket.write(head); socket.write(body)
    await bounded(done, 7500)
    // Bun may keep the connection alive despite request Connection:close. The
    // complete response is observed; peer EOF is not a cleanup guarantee here.
    if (lateBody !== undefined) { socket.write(lateBody); await Bun.sleep(50) }
    return { text: Buffer.concat(chunks).toString("utf8"), ended }
  } finally {
    const closed = socket.closed ? Promise.resolve() : new Promise<void>(resolve => socket.once("close", () => resolve()))
    socket.destroy(); await bounded(closed)
  }
}
describe("actual production session router, owned loopback only", () => {
  it("serves the real POST route", async () => {
    await hub({}, async origin => {
      const response = await get(origin, "/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ buyer, budgetUsd: "1" }) })
      expect(response.status).toBe(201); privateResponse(response)
      expect((await response.json()).session_id).toMatch(/^ses_[0-9a-f]{32}$/)
    })
  }, 10000)
  it("refuses a 32-character non-ASCII job token without crashing the existing route", async () => {
    await hub({}, async origin => {
      // URLSearchParams decodes to 32 Unicode characters; HTTP header bytes may
      // instead arrive as a longer string, so the header alone is not this Red.
      const unicode = await get(origin, `/jobs/${legacyId}?token=${encodeURIComponent("é".repeat(32))}`)
      expect(unicode.status).toBe(404); expect(await unicode.json()).toEqual({ error: "not_found" })
      const invalid = await get(origin, `/jobs/${legacyId}`, { headers: { "x-job-token": "é".repeat(32) } })
      expect(invalid.status).toBe(404); expect(await invalid.json()).toEqual({ error: "not_found" })
      const valid = await get(origin, `/jobs/${legacyId}`, { headers: { "x-job-token": token("job", legacyId) } })
      expect(valid.status).toBe(200); expect((await valid.json()).id).toBe(legacyId)
    })
  }, 10000)
  it("does not publish real session-owned receipt identifiers", async () => {
    await hub({}, async origin => {
      const text = await (await get(origin, "/receipts")).text()
      expect(text).not.toContain(sessionId); expect(text).not.toContain("sessionId")
      expect(text).not.toContain(`job_${"1".repeat(20)}`); expect(text).not.toContain(buyer)
      expect(JSON.parse(text)[0]).toMatchObject({ skillId: "fixture", priceAtomic: "30", settled: false })
      for (const path of ["/", "/_feed"]) {
        const html = await (await get(origin, path)).text()
        expect(html).not.toContain(sessionId); expect(html).not.toContain(buyer); expect(html).not.toContain("PRIVATE_SESSION_INPUT")
      }
      expect((await stats(origin)).networkRequests).toBe(0)
    })
  }, 10000)
  it("authenticates before Store IO and keeps malformed namespace responses private", async () => {
    await hub({}, async origin => {
      const before = await stats(origin), valid = token("session", sessionId)
      for (const [path, init] of [[`/sessions/${sessionId}`, {}], [`/sessions/${sessionId}?token=${valid}`, {}],
        [`/sessions/${sessionId}`, { headers: { "x-session-token": "é".repeat(32) } }],
        [`/sessions/${sessionId}`, { headers: [["x-session-token", valid], ["x-session-token", valid]] }],
        [`/sessions/${sessionId}/close`, { method: "POST", body: "{}", headers: { "x-session-token": "" } }],
        ["/sessions/invalid", {}], ["/sessions", {}], [`/sessions/${sessionId}/close`, { method: "GET" }]] as Array<[string, RequestInit]>) {
        const response = privateResponse(await get(origin, path, init)); expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: "session_not_found" })
      }
      expect(await stats(origin)).toEqual(before)
      const response = privateResponse(await get(origin, `/sessions/${sessionId}`, { headers: { "x-session-token": valid } }))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ calls: [{ state: "released", priceAtomic: "30" }], held: "$0.00", spent: "$0.00", complete: true })
      expect((await stats(origin)).reads).toBe(before.reads + 1)
      expect((await stats(origin)).networkRequests).toBe(0)
    })
  }, 10000)
  it.each([{}, { ARCADE_DB: ":memory:" }, { ARCADE_HUB_SECRET: "" }, { TEST_SESSION_OMIT_SECRET: "1" }])("refuses real sessions on loopback with unavailable admission %# while test works", async env => {
    await hub(env, async origin => {
      const response = privateResponse(await post(origin, "/sessions", { buyer, budgetUsd: "1", rail: "gateway" }))
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "session_unavailable" })
      expect((await stats(origin)).writes).toBe(0)
      expect(privateResponse(await post(origin, "/sessions", { buyer, budgetUsd: "1", rail: "test" })).status).toBe(201)
      expect((await stats(origin)).networkRequests).toBe(0)
    })
  }, 10000)
  it("keeps issued capabilities and closed receipts across actual disk restart and rejects a changed secret", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arcade-session-http-")), path = join(directory, "ledger.sqlite")
    let opened: { session_id: string; session_token: string } | undefined, closed: unknown
    try {
      await hub({ ARCADE_DB: path }, async origin => {
        const response = privateResponse(await post(origin, "/sessions", { buyer, budgetUsd: "9007199254.740993" }))
        expect(response.status).toBe(201); opened = await response.json()
        if (opened === undefined) throw Error("Missing owned session")
        const second = openSqliteStore(path, "owned-second-handle"), cfg = loadChainConfig("arc-testnet"), seller = `0x${"b".repeat(40)}`
        const jobId = `job_${"3".repeat(20)}`, input = { private: "PRIVATE_SECOND_INPUT" }, at = Date.now()
        const binding: SessionBinding = { sessionId: opened.session_id, jobId, buyer, seller, skillId: "fixture", skillVersion: "1.0.0", rail: "test",
          network: cfg.caip2, asset: cfg.usdc.address, verifyingContract: cfg.usdc.address, domainName: cfg.usdc.eip712Name,
          domainVersion: cfg.usdc.eip712Version, payTo: seller, amountAtomic: 40n, nonce: `0x${"3".repeat(64)}`, validAfter: 1n,
          validBefore: 601n, requestDigest: sessionRequestDigest(input) }
        const job = Job.make({ id: jobId, skillId: "fixture", buyer, seller, priceAtomic: 40n, input, status: "queued", createdAtMs: at,
          rootJobId: jobId, hop: 0, ancestors: [] })
        try {
          expect(second.store.sessionStorage).toBe("durable")
          await Effect.runPromise(second.store.reserveSessionJob(binding, job))
          const pending = privateResponse(await get(origin, `/sessions/${opened.session_id}`, { headers: { "x-session-token": opened.session_token } }))
          expect(await pending.json()).toMatchObject({ held: "$0.00004", remaining: "$9007199254.740953", complete: false, calls: [{ state: "reserved" }] })
          const blocked = privateResponse(await post(origin, `/sessions/${opened.session_id}/close`, {}, { "x-session-token": opened.session_token }))
          expect(blocked.status).toBe(409); expect(await blocked.json()).toEqual({ error: "session_pending" })
          const finish = Date.now(), outcome = JobOutcome.make({ status: "refused", startedAtMs: at, finishedAtMs: finish })
          await Effect.runPromise(second.store.finishSessionJob({ kind: "released", sessionId: opened.session_id, jobId,
            job: Job.make({ ...job, status: "refused", outcome }), receipt: Receipt.make({ jobId, skillId: "fixture", skillVersion: "1.0.0", buyer, seller,
              priceAtomic: 40n, sellerAtomic: 40n, feeAtomic: 0n, feeBps: 0, rail: "test", network: cfg.caip2, latencyMs: finish - at,
              settled: false, reason: "session_released", createdAtMs: finish, sessionId: opened.session_id, rootJobId: jobId, hop: 0, ancestors: [] }) }))
        } finally { second.close() }
        const result = privateResponse(await post(origin, `/sessions/${opened.session_id}/close`, {}, { "x-session-token": opened.session_token }))
        expect(result.status).toBe(200); closed = await result.json()
        expect(closed).toMatchObject({ sessionId: opened.session_id, budgetAtomic: "9007199254740993", calls: [{ state: "released" }], complete: true })
        const gateway = privateResponse(await post(origin, "/sessions", { buyer, budgetUsd: "1", rail: "gateway" }))
        expect(gateway.status).toBe(201); const body = await gateway.json()
        expect(body.note).toContain("not mined batches"); expect((await stats(origin)).networkRequests).toBe(0)
      })
      if (opened === undefined) throw Error("Missing owned restart session")
      const original = opened
      await hub({ ARCADE_DB: path }, async origin => {
        const before = await stats(origin)
        const response = privateResponse(await get(origin, `/sessions/${original.session_id}`, { headers: { "x-session-token": original.session_token } }))
        expect(response.status).toBe(200); expect((await response.json()).closed_receipt).toEqual(closed)
        expect((await stats(origin)).writes).toBe(before.writes)
        const repeat = privateResponse(await post(origin, `/sessions/${original.session_id}/close`, {}, { "x-session-token": original.session_token }))
        expect(repeat.status).toBe(409); expect(await repeat.json()).toEqual({ error: "session_closed" })
      })
      await hub({ ARCADE_DB: path, ARCADE_HUB_SECRET: "different-owned-secret" }, async origin => {
        const response = privateResponse(await get(origin, `/sessions/${original.session_id}`, { headers: { "x-session-token": original.session_token } }))
        expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "session_not_found" }); expect((await stats(origin)).reads).toBe(0)
      })
    } finally { rmSync(directory, { recursive: true }) }
  }, 15000)
  it("bounds actual chunked/invalid UTF8/stalled request bodies with application-private errors", async () => {
    await hub({}, async origin => {
      const before = await stats(origin), head = "POST /sessions HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nConnection: close\r\n"
      for (const [headers, body] of [["Content-Length: 1\r\n", new Uint8Array([0xff])],
        ["Transfer-Encoding: chunked\r\n", "4001\r\n" + " ".repeat(16385) + "\r\n0\r\n\r\n"], ["Content-Length: 80\r\n", "{"]] as const) {
        const late = headers === "Content-Length: 80\r\n" ? JSON.stringify({ buyer, budgetUsd: "1" }).padEnd(80, " ").slice(1) : undefined
        const response = await raw(origin, head + headers + "\r\n", body, late)
        expect(response.text).toContain("400 Bad Request"); expect(response.text.toLowerCase()).toContain("cache-control: private, no-store")
        expect(response.text).toContain('{"error":"input_invalid"}')
      }
      expect(await stats(origin)).toEqual(before)
      expect(privateResponse(await post(origin, "/sessions", { buyer, budgetUsd: "1" })).status).toBe(201)
    })
  }, 15000)
  it("enforces32 active handlers on the actual router while unauthenticated requests remain404", async () => {
    await hub({}, async origin => {
      const sockets: ReturnType<typeof createConnection>[] = []
      try {
        await Promise.all(Array.from({ length: 32 }, async () => {
          const socket = createConnection({ host: "127.0.0.1", port: Number(new URL(origin).port) }); sockets.push(socket)
          await bounded(new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject) }))
          socket.write(`POST /sessions/${sessionId}/close HTTP/1.1\r\nHost: localhost\r\nx-session-token: ${token("session", sessionId)}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{`)
        }))
        const deadline = Date.now() + 2000
        while ((await stats(origin)).activeHandlers !== 32 && Date.now() < deadline) await Bun.sleep(10)
        const before = await stats(origin); expect(before.activeHandlers).toBe(32)
        const invalid = privateResponse(await get(origin, `/sessions/${sessionId}`))
        expect(invalid.status).toBe(404); expect(await invalid.json()).toEqual({ error: "session_not_found" })
        const overloaded = privateResponse(await get(origin, `/sessions/${sessionId}`, { headers: { "x-session-token": token("session", sessionId) } }))
        expect(overloaded.status).toBe(429); expect(await overloaded.json()).toEqual({ error: "session_capacity" })
        const other = privateResponse(await post(origin, "/sessions", { buyer, budgetUsd: "1" })); expect(other.status).toBe(429)
        expect((await stats(origin)).writes).toBe(before.writes); expect((await stats(origin)).reads).toBe(before.reads)
      } finally {
        await Promise.all(sockets.map(async socket => {
          const closed = socket.closed ? Promise.resolve() : new Promise<void>(resolve => socket.once("close", () => resolve()))
          socket.destroy(); await bounded(closed)
        }))
      }
      const deadline = Date.now() + 6000
      while ((await stats(origin)).activeHandlers !== 0 && Date.now() < deadline) await Bun.sleep(10)
      expect((await stats(origin)).activeHandlers).toBe(0); expect((await stats(origin)).networkRequests).toBe(0)
      expect(privateResponse(await get(origin, `/sessions/${sessionId}`, { headers: { "x-session-token": token("session", sessionId) } })).status).toBe(200)
    })
  }, 15000)
})
