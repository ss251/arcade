import { Effect, Layer, Ref } from "effect"
import { Bounds, Job, JobOutcome, PublicListing, Receipt } from "@arcade/core"
import { StoreLive, StoreTag } from "../src/store.ts"
import { BrokerLive, BrokerTag } from "../src/broker.ts"
import { createHmac } from "node:crypto"
import { fileURLToPath } from "node:url"

const SELF = fileURLToPath(import.meta.url), REPO = fileURLToPath(new URL("../../..", import.meta.url))
const WEB = "https://browser.example", PUBLIC = "https://hub.example", SELLER = `0x${"b".repeat(40)}`
const JOB = `job_${"1".repeat(20)}`, SECRET = "owned-h10a-offline-fixture", PATH = `/x/${SELLER}/demo`
const TOKEN = createHmac("sha256", SECRET).update(`arcade-job:${JOB}`).digest("hex").slice(0, 32)
const bounded = async <T>(work: Promise<T>, ms = 3000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Owned fixture deadline")), ms) })]) }
  finally { clearTimeout(timer) }
}

if (process.env["H10A_CORS_FIXTURE"] === "1") {
  const { mock } = await import("bun:test")
  const payments = { ...await import("@arcade/payments") }
  const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
  const broker = await Effect.runPromise(BrokerTag.pipe(Effect.provide(BrokerLive)))
  const listing = PublicListing.make({ id: "demo", serviceName: "Demo", version: "1.0.0", description: "Owned test listing",
    tags: [], price: "$0.10", inputSchema: { type: "object" }, outputSchema: { type: "object" }, bounds: Bounds.make({ timeoutSec: 5 }) })
  await Effect.runPromise(store.putListing({ listing, seller: SELLER, runnerId: "owned", publishedAtMs: 1 }))
  const outcome = JobOutcome.make({ status: "succeeded", output: { value: "owned result" }, startedAtMs: 1, finishedAtMs: 2 })
  await Effect.runPromise(store.putJob(Job.make({ id: JOB, skillId: "demo", buyer: SELLER, seller: SELLER,
    priceAtomic: 100000n, input: {}, status: "succeeded", createdAtMs: 1, outcome })))
  await Effect.runPromise(store.putReceipt(Receipt.make({ jobId: JOB, skillId: "demo", skillVersion: "1.0.0", buyer: SELLER,
    seller: SELLER, priceAtomic: 100000n, sellerAtomic: 95000n, feeAtomic: 5000n, feeBps: 500, rail: "test",
    network: "eip155:5042002", settled: true, reason: "ok", latencyMs: 1, createdAtMs: 2, rootJobId: JOB, hop: 0, ancestors: [] })))
  const counts = { reads: 0, writes: 0, challenge: 0, verify: 0, settle: 0, dispatch: 0, external: 0, active: 0, interrupted: 0 }
  let hold = false, fail = false
  const releases = new Set<() => void>()
  const counted = { ...store,
    getListing: (id: string) => Effect.suspend(() => { counts.reads++; return store.getListing(id) }),
    getJob: (id: string) => Effect.suspend(() => { counts.reads++; return store.getJob(id) }),
    putJob: (job: Job) => Effect.suspend(() => { counts.writes++; return store.putJob(job) }),
    allReceipts: Effect.suspend(() => {
      counts.reads++
      if (fail) { fail = false; return Effect.die(Error("PRIVATE_STORE_DIAGNOSTIC")) }
      if (!hold) return store.allReceipts
      return Effect.async<ReadonlyArray<Receipt>>(resume => {
        counts.active++
        const release = () => { releases.delete(release); counts.active--; resume(Effect.succeed([])) }
        releases.add(release)
        return Effect.sync(() => { if (releases.delete(release)) { counts.active--; counts.interrupted++ } })
      })
    }) }
  mock.module("../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, counted) }))
  await Effect.runPromise(broker.register({ runnerId: "owned", seller: SELLER, close() {}, send(message) {
    if (message._tag === "JobAssignment") { counts.dispatch++; void Effect.runPromise(broker.complete(message.jobId, outcome)) }
  } }, ["demo"]))
  mock.module("../src/broker.ts", () => ({ BrokerTag, BrokerLive: Layer.succeed(BrokerTag, broker) }))
  const rail = payments.makeTestRail(Effect.runSync(Ref.make(payments.makeTestState({}, 1000000n))))
  mock.module("@arcade/payments", () => ({ ...payments, RailTest: () => Layer.succeed(payments.RailTag, { ...rail,
    challenge: (input: Parameters<typeof rail.challenge>[0]) => Effect.suspend(() => { counts.challenge++; return rail.challenge(input) }),
    verify: (...args: Parameters<typeof rail.verify>) => Effect.suspend(() => { counts.verify++; return rail.verify(...args) }),
    settle: (...args: Parameters<typeof rail.settle>) => Effect.suspend(() => { counts.settle++; return rail.settle(...args) }) }) }))
  globalThis.fetch = Object.assign(async () => { counts.external++; throw Error("Owned external request refused") },
    { preconnect() { counts.external++; throw Error("Owned preconnect refused") } })
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const original = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0, async fetch(req, server) {
      const url = new URL(req.url)
      if (url.pathname === "/__cors_fixture") {
        if (url.searchParams.has("hold")) hold = url.searchParams.get("hold") === "1"
        if (url.searchParams.has("release")) for (const release of [...releases]) release()
        if (url.searchParams.has("fail")) fail = true
        return Response.json(counts)
      }
      return original.call(server, req, server)
    } } as Parameters<typeof Bun.serve>[0])
    console.log(`[cors-port] ${server.port}`)
    const fuse = setTimeout(() => process.exit(93), 30000); fuse.unref()
    return server
  }) as typeof Bun.serve
} else {
  const { describe, test, expect } = await import("bun:test")
  async function hub(check: (base: string) => Promise<void>, armed = true) {
    const child = Bun.spawn([process.execPath, "--no-env-file", "--preload", SELF, "apps/hub/src/server.ts"], {
      cwd: REPO, env: { PATH: "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", ARCADE_HUB_SECRET: SECRET,
        H10A_CORS_FIXTURE: "1", ...(armed ? { ARCADE_WEB_ORIGIN: WEB, ARCADE_PUBLIC_URL: PUBLIC, ARCADE_DB: "owned-memory-override" } : {}) },
      stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    let output = "", base = ""
    const drain = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader()
      try { while (true) { const next = await reader.read(); if (next.done) break
        output = (output + new TextDecoder().decode(next.value)).slice(-16384)
        const port = /\[cors-port\] (\d+)/.exec(output)?.[1]; if (port) base = `http://127.0.0.1:${port}`
      } } finally { reader.releaseLock() }
    }
    const drains = Promise.all([drain(child.stdout), drain(child.stderr)])
    try {
      const deadline = performance.now() + 7000
      while (!base && child.exitCode === null && child.signalCode === null && performance.now() < deadline) await Bun.sleep(10)
      if (!base) throw Error("Owned router did not start")
      await check(base)
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM"); try { await bounded(child.exited, 800) } catch { child.kill("SIGKILL"); await bounded(child.exited, 1500) }
      }
      await bounded(drains)
      expect(output).not.toContain(SECRET); expect(output).not.toContain(TOKEN); expect(output).not.toContain("PRIVATE_STORE_DIAGNOSTIC")
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
      if (base) await expect(fetch(base + "/healthz", { signal: AbortSignal.timeout(500) })).rejects.toThrow()
    }
  }
  const request = (base: string, path = PATH, init: RequestInit = {}) => fetch(base + path, {
    ...init, signal: init.signal ?? AbortSignal.timeout(3000), redirect: "error", credentials: "omit" })
  const stats = async (base: string, query = "") => await (await request(base, "/__cors_fixture" + query)).json() as Record<string, number>
  const post = (base: string, headers: Record<string, string> = {}, body = "{}") => request(base, PATH,
    { method: "POST", headers: { origin: WEB, "content-type": "application/json", ...headers }, body })
  describe("ordinary browser production-router boundary", () => {
    test("preflights allowed ordinary paths without business IO", () => hub(async base => {
      const before = await stats(base)
      for (const [path, method, headers] of [[PATH, "POST", "content-type,payment-signature,x-payment"],
        [`/jobs/${JOB}/result`, "GET", "x-job-token"], [`/trees/${JOB}`, "GET", "x-job-token"]]) {
        const r = await request(base, path, { method: "OPTIONS", headers: { origin: WEB, "access-control-request-method": method!, "access-control-request-headers": headers! } })
        expect(r.status).toBe(204); expect(await r.text()).toBe("")
        expect(r.headers.get("access-control-allow-origin")).toBe(WEB)
      }
      expect(await stats(base)).toEqual(before)
    })),
    test("rejects foreign origins and F/lineage headers before business IO", () => hub(async base => {
      const before = await stats(base)
      for (const headers of [{ origin: "https://foreign.example" }, { "x-arcade-session": "" }, { "x-session-token": "" },
        { "x-arcade-hire-capability": "" }, { authorization: "PRIVATE" }]) {
        const r = await post(base, headers); expect(r.status).toBe(403)
        expect(r.headers.get("access-control-allow-origin")).toBeNull(); expect(await r.text()).not.toContain("PRIVATE")
      }
      expect(await stats(base)).toEqual(before)
    })),
    test("reports actual Test rail and preserves challenge requirements and input bytes", () => hub(async base => {
      const body = '{ "value": "é", "n": 2 }'
      const allowed = await post(base, {}, body), legacy = await request(base, PATH, { method: "POST", headers: { "content-type": "application/json" }, body })
      expect(allowed.status).toBe(402); const a = await allowed.json(), b = await legacy.json()
      expect(a.rail).toBe("test"); expect(a.accepts).toEqual(b.accepts)
      expect(a.accepts[0].resource).toBe(PUBLIC + PATH)
      expect(allowed.headers.get("access-control-allow-origin")).toBe(WEB)
      expect(allowed.headers.get("cache-control")).toBe("private, no-store")
    })),
    test("bounds ordinary JSON input before challenge or admission", () => hub(async base => {
      const before = await stats(base), r = await post(base, {}, JSON.stringify({ value: "x".repeat(131072) }))
      expect(r.status).toBe(400); expect(await r.json()).toMatchObject({ error: "input_invalid" })
      expect((await stats(base)).challenge).toBe(before.challenge); expect((await stats(base)).verify).toBe(0)
    })),
    test("acceptance binds public origin and terminal reads remain private", () => hub(async base => {
      const probe = await (await post(base)).json(), accepted = probe.accepts[0], now = Math.floor(Date.now() / 1000)
      const payment = { x402Version: 2, accepted, payload: { signature: "0xgood", authorization: { from: SELLER, to: accepted.payTo,
        value: accepted.amount, validAfter: String(now - 1), validBefore: String(now + 600), nonce: `0x${"f".repeat(64)}` } } }
      const encoded = Buffer.from(JSON.stringify(payment)).toString("base64")
      const r = await post(base, { "payment-signature": encoded, "x-payment": encoded })
      expect(r.status).toBe(202); expect(r.headers.get("cache-control")).toBe("private, no-store")
      const handle = await r.json(); expect(handle.poll_url).toBe(`${PUBLIC}/jobs/${handle.job_id}/result?token=${handle.job_token}`)
      expect(handle.job_token).toMatch(/^[a-f0-9]{32}$/)
      const result = await request(base, `/jobs/${JOB}/result`, { headers: { origin: WEB, "x-job-token": TOKEN } })
      expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store")
      expect(result.headers.get("access-control-allow-origin")).toBe(WEB); expect((await result.json()).result).toEqual({ value: "owned result" })
    })),
    test("caller abort interrupts a pending actual Store read without further polling", () => hub(async base => {
      await stats(base, "?hold=1")
      const controller = new AbortController(), work = request(base, `/jobs/${JOB}/result`, { headers: { "x-job-token": TOKEN }, signal: controller.signal }).catch(() => undefined)
      try {
        const end = performance.now() + 1500
        while ((await stats(base)).active !== 1 && performance.now() < end) await Bun.sleep(10)
        expect((await stats(base)).active).toBe(1); controller.abort(); await work
        const stopped = performance.now() + 800
        while ((await stats(base)).active !== 0 && performance.now() < stopped) await Bun.sleep(10)
        expect((await stats(base)).active).toBe(0); expect((await stats(base)).interrupted).toBe(1)
      } finally { controller.abort(); await stats(base, "?hold=0&release=1"); await work }
    })),
    test("default closed browser policy preserves no-Origin probes", () => hub(async base => {
      expect((await post(base)).status).toBe(403)
      const r = await request(base, PATH, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      expect(r.status).toBe(402); expect(r.headers.get("access-control-allow-origin")).toBeNull()
    }, false)),
    test("refuses unsupported preflight methods, query capability and header grants before IO", () => hub(async base => {
      const before = await stats(base)
      for (const [path, method, requested] of [[PATH, "PUT", "content-type"], [PATH, "POST", "authorization"],
        [PATH, "POST", "x-session-token"], [PATH, "POST", "x-arcade-hire-capability"],
        [`/jobs/${JOB}/result?token=PRIVATE`, "GET", "x-job-token"], ["/sessions", "POST", "content-type"]]) {
        const r = await request(base, path, { method: "OPTIONS", headers: { origin: WEB,
          "access-control-request-method": method!, "access-control-request-headers": requested! } })
        expect(r.status).toBe(403); expect(r.headers.has("access-control-allow-origin")).toBe(false)
        expect(await r.text()).toBe(JSON.stringify({ error: "browser_forbidden" }))
      }
      expect(await stats(base)).toEqual(before)
    })),
    test("decorates actual authentication, input and Store failures without diagnostics or cookies", () => hub(async base => {
      const denied = await request(base, `/jobs/${JOB}/result`, { headers: { origin: WEB, "x-job-token": "wrong" } })
      const invalid = await post(base, {}, "{")
      await stats(base, "?fail=1")
      const result = await request(base, `/jobs/${JOB}/result`, { headers: { origin: WEB, "x-job-token": TOKEN } })
      await stats(base, "?fail=1")
      const tree = await request(base, `/trees/${JOB}`, { headers: { origin: WEB, "x-job-token": TOKEN } })
      for (const [r, status] of [[denied, 404], [invalid, 400], [result, 503], [tree, 503]] as const) {
        expect(r.status).toBe(status); expect(r.headers.get("access-control-allow-origin")).toBe(WEB)
        expect(r.headers.get("cache-control")).toBe("private, no-store"); expect(r.headers.get("vary")).toContain("Origin")
        expect(r.headers.has("set-cookie")).toBe(false); expect(r.headers.has("access-control-allow-credentials")).toBe(false)
        expect(await r.text()).not.toContain("PRIVATE")
      }
      const good = await request(base, `/trees/${JOB}`, { headers: { origin: WEB, "x-job-token": TOKEN } })
      expect(good.status).toBe(200); expect((await good.json()).rootJobId).toBe(JOB)
    })),
    test("accepts either payment header or identical dual headers, rejecting empty/conflicting fields before IO", () => hub(async base => {
      const accepted = (await (await post(base)).json()).accepts[0], now = Math.floor(Date.now() / 1000)
      for (const [index, headerNames] of [[0, ["payment-signature"]], [1, ["x-payment"]], [2, ["payment-signature", "x-payment"]]] as const) {
        const payment = { x402Version: 2, accepted, payload: { signature: "0xgood", authorization: { from: SELLER, to: accepted.payTo,
          value: accepted.amount, validAfter: String(now - 1), validBefore: String(now + 600), nonce: `0x${String(index).repeat(64)}` } } }
        const encoded = Buffer.from(JSON.stringify(payment)).toString("base64")
        const response = await post(base, Object.fromEntries(headerNames.map(name => [name, encoded])))
        expect(response.status).toBe(202); await response.arrayBuffer()
      }
      const before = await stats(base)
      for (const headers of [{ "payment-signature": "" }, { "x-payment": "" }, { "payment-signature": "a", "x-payment": "b" }]) {
        const r = await post(base, headers); expect(r.status).toBe(403); await r.arrayBuffer()
      }
      const after = await stats(base)
      expect(after.verify).toBe(3); expect(after.reads).toBe(before.reads); expect(after.challenge).toBe(before.challenge)
    })),
    test("refuses malformed armed origin configuration before listening with fixed output", async () => {
      for (const config of [{ ARCADE_WEB_ORIGIN: "" }, { ARCADE_WEB_ORIGIN: WEB + "/" },
        { ARCADE_WEB_ORIGIN: WEB }, { ARCADE_WEB_ORIGIN: WEB, ARCADE_PUBLIC_URL: "PRIVATE_BAD_ORIGIN" }]) {
        const child = Bun.spawn([process.execPath, "--no-env-file", "--preload", SELF, "apps/hub/src/server.ts"], { cwd: REPO,
          env: { PATH: "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", H10A_CORS_FIXTURE: "1", ...config },
          stdin: "ignore", stdout: "pipe", stderr: "pipe" })
        let output = ""
        const drain = async (stream: ReadableStream<Uint8Array>) => {
          const reader = stream.getReader()
          try { while (true) { const part = await reader.read(); if (part.done) break
            output = (output + new TextDecoder().decode(part.value)).slice(-16384)
          } } finally { reader.releaseLock() }
        }
        const drains = Promise.all([drain(child.stdout), drain(child.stderr)])
        try { expect(await bounded(child.exited, 2500)).toBe(2); await bounded(drains) }
        finally {
          if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await bounded(child.exited) }
          await bounded(drains)
        }
        expect(output).toBe("[hub] refusing to start: browser transport configuration invalid\n")
        expect(output).not.toContain("[cors-port]"); expect(output).not.toContain("PRIVATE_BAD_ORIGIN")
      }
    })
  })
}
