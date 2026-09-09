import { Effect, Layer } from "effect"
import { Bounds, PublicListing, Receipt } from "@arcade/core"
import { StoreLive, StoreTag, type Store } from "../src/store.ts"
import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../..", import.meta.url)), self = fileURLToPath(import.meta.url)
const SELLER = `0x${"a".repeat(40)}`, SPLITTER = `0x${"b".repeat(40)}`
const ENDPOINT = "https://graph-fixture.invalid/query", KEY = "PRIVATE_GRAPH_FIXTURE_KEY"
const evidence = { agentId: "5042002:7", settlementCount: 11, feedbackCount: 5, validationPassCount: 4 }
const meta = { block: { number: 90 }, hasIndexingErrors: false }
if (process.env["ARCADE_GRAPH_ROUTES_FIXTURE"] === "1") {
  const { mock } = await import("bun:test")
  const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
  for (const id of ["graph-skill", "graph-hidden"]) await Effect.runPromise(store.putListing({
    listing: PublicListing.make({ id, version: "1.0.0", serviceName: id, description: "Offline graph route fixture",
      tags: [], price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: {}, outputSchema: {} }),
    seller: SELLER, runnerId: "PRIVATE_RUNNER", publishedAtMs: 1
  }))
  for (const atMs of [1, 2, 3]) await Effect.runPromise(store.recordPayTest({ skillId: "graph-hidden", seller: SELLER,
    atMs, jobId: "job_PRIVATE_CANARY", ok: false, reason: "offline fixture" }))
  await Effect.runPromise(store.putReceipt(Receipt.make({ jobId: "job_graph_fixture", skillId: "graph-skill",
    skillVersion: "1", seller: SELLER, buyer: "PRIVATE_BUYER", priceAtomic: 10000n, sellerAtomic: 9500n,
    feeAtomic: 500n, feeBps: 500, rail: "test", network: "eip155:5042002", settled: true, reason: "ok",
    createdAtMs: 1, latencyMs: 1 })))
  let mode = "ready", graphRequests = 0, external = 0, writes = 0, receiptReads = 0
  const listingRequests: string[] = []
  const guarded = Object.fromEntries(Object.entries(store).map(([key, value]) => [key,
    typeof value === "function" && /^(put|record|remove|drop|touch|backfill|reserve|commit|release|open|begin|finish|mark|close)/.test(key)
      ? () => Effect.sync(() => { writes++; throw Error("Fixture mutation refused") }) : value])) as unknown as Store
  mock.module("../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, { ...guarded,
    allReceipts: Effect.sync(() => { receiptReads++; if (mode === "store-defect") throw Error(KEY) }).pipe(Effect.zipRight(store.allReceipts))
  }) }))
  globalThis.fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) !== ENDPOINT || init?.method !== "POST" || init.redirect !== "error" || init.credentials !== "omit" ||
      new Headers(init.headers).get("authorization") !== `Bearer ${KEY}`) { external++; throw Error(KEY) }
    graphRequests++
    if (mode === "malformed" || mode === "store-defect") return Response.json({ errors: [{ message: KEY }] })
    const request = JSON.parse(String(init.body)) as { query: string; variables: { id?: string } }
    if (request.query.includes("query Stats")) return Response.json({ data: { _meta: meta, marketplace: {
      id: "arcade", settlementCount: "2", treeCount: "1", settledVolumeAtomic: "300000", feeAtomic: "15000",
      childTotalAtomic: "20000", agentCount: "1", feedbackCount: "5", validationPassCount: "4"
    } } })
    const id = request.variables.id
    if (typeof id !== "string") { external++; throw Error(KEY) }
    listingRequests.push(id)
    return Response.json({ data: { _meta: meta, listing: {
      id, agent: { id: "5042002:7", chainId: "5042002", agentId: "7", agentURI: null,
        feedbackCount: "5", validationPassCount: "4", listing: { id } },
      feeSplitter: { id: SPLITTER, firstSeenBlock: "80", settlementCount: "11", settledVolumeAtomic: "550000", listing: { id } }
    } } })
  }, { preconnect() { external++; throw Error(KEY) } }) as typeof fetch
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const original = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0, async fetch(req, server) {
      const url = new URL(req.url)
      if (url.pathname === "/__graph_fixture") {
        mode = url.searchParams.get("mode") ?? mode
        // The configured 1ms cache is deliberately expired at this control boundary.
        await new Promise(resolve => setTimeout(resolve, 5))
        return Response.json({ graphRequests, listingRequests, external, writes, receiptReads })
      }
      return original.call(this, req, server)
    } } as Parameters<typeof Bun.serve>[0])
    console.log(`[graph-routes-port] ${server.port}`); return server
  }) as typeof Bun.serve
  setTimeout(() => process.exit(1), 30000).unref()
} else {
  const { afterAll, beforeAll, describe, expect, test } = await import("bun:test")
  describe("G8 actual hub routes with real Graph decoding", () => {
    let child: ChildProcess | undefined, origin = "", output = "", didClose = false, closed = Promise.resolve()
    const bounded = async (pending: Promise<unknown>, ms: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try { return await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("Owned graph fixture deadline")), ms)
      })]) } finally { clearTimeout(timer) }
    }
    const get = (path: string, method = "GET") => fetch(origin + path, {
      method, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(2000)
    })
    beforeAll(async () => {
      child = spawn(process.execPath, ["--no-env-file", "--preload", self, "apps/hub/src/server.ts"], {
        cwd: root, env: { PATH: process.env["PATH"] ?? "", ARCADE_GRAPH_ROUTES_FIXTURE: "1",
          ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", PORT: "0", ARCADE_HUB_SECRET: "offline-graph-route-only",
          ARCADE_GRAPH_URL: ENDPOINT, ARCADE_GRAPH_KEY: KEY, ARCADE_GRAPH_TTL_MS: "1" },
        stdio: ["ignore", "pipe", "pipe"]
      })
      closed = new Promise<void>((resolve, reject) => { child!.once("close", () => { didClose = true; resolve() }); child!.once("error", reject) })
      const capture = (part: Buffer) => {
        output = (output + part.toString()).slice(-16384)
        const port = /\[graph-routes-port\] (\d+)/.exec(output)?.[1]; if (port) origin = `http://127.0.0.1:${port}`
      }
      child.stdout!.on("data", capture); child.stderr!.on("data", capture)
      await bounded((async () => { while (!origin && !didClose) await new Promise(resolve => setTimeout(resolve, 10))
        if (!origin) throw Error("Owned graph fixture did not start") })(), 8000)
    }, 10000)
    afterAll(async () => {
      if (child && !didClose) child.kill("SIGTERM")
      try { await bounded(closed, 1000) } catch { if (child && !didClose) child.kill("SIGKILL"); await bounded(closed, 2000) }
      expect(didClose).toBe(true)
      if (origin) await expect(get("/healthz")).rejects.toThrow()
      expect(output).not.toContain(KEY)
    }, 4000)
    test("returns indexed aggregates without reading or relabelling the local ledger", async () => {
      const before = await (await get("/__graph_fixture?mode=ready")).json()
      const response = await get("/graph/stats")
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ source: "subgraph", indexedBlock: 90, settlementCount: 2, treeCount: 1,
        settledVolumeAtomic: "300000", feeAtomic: "15000", childTotalAtomic: "20000", agentCount: 1,
        feedbackCount: 5, validationPassCount: 4 })
      const after = await (await get("/__graph_fixture")).json()
      expect(after.receiptReads).toBe(before.receiptReads)
      expect(await (await get("/stats")).json()).toMatchObject({ source: "hub", settled: 1, volumeAtomic: "10000" })
    })
    test("adds only four optional fields and preserves catalog and detail evidence", async () => {
      await get("/__graph_fixture?mode=ready")
      const rows = await (await get("/listings")).json()
      expect(rows.map((row: { id: string }) => row.id)).toEqual(["graph-skill"])
      expect(rows[0]).toMatchObject({ graph: evidence, payTested: null, delisted: false })
      expect(Object.keys(rows[0].graph).sort()).toEqual(Object.keys(evidence).sort())
      const detail = await (await get("/listings/graph-skill")).json()
      expect(detail).toMatchObject({ graph: evidence, stats: { calls: 1 }, ratings: { count: 0 }, ensName: null,
        ensExpired: false, delisted: false, payTested: null, payTestHistory: [] })
      const observed = await (await get("/__graph_fixture")).json()
      expect(observed.listingRequests).not.toContain("graph-hidden")
      expect(JSON.stringify({ rows, detail })).not.toContain(KEY)
    })
    test("malformed Graph falls back to hub totals and absent listing evidence", async () => {
      await get("/__graph_fixture?mode=malformed")
      expect(await (await get("/graph/stats")).json()).toEqual({ source: "hub", settlementCount: 1, settledVolumeAtomic: "10000" })
      const rows = await (await get("/listings")).json(), detail = await (await get("/listings/graph-skill")).json()
      expect(rows).toHaveLength(1); expect(rows[0]).not.toHaveProperty("graph"); expect(detail).not.toHaveProperty("graph")
    })
    test("a failed fallback is unavailable, not an empty or zero ledger", async () => {
      try {
        await get("/__graph_fixture?mode=store-defect")
        const response = await get("/graph/stats")
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "graph_stats_unavailable" })
      } finally { await get("/__graph_fixture?mode=ready") }
    })
    test("unsupported methods do not query Graph or mutate Store; missing listing remains 404", async () => {
      const before = await (await get("/__graph_fixture")).json()
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) expect((await get("/graph/stats", method)).status).toBe(404)
      expect((await get("/listings/missing")).status).toBe(404)
      const after = await (await get("/__graph_fixture")).json()
      expect(after).toEqual(before); expect(after).toMatchObject({ external: 0, writes: 0 })
    })
  })
}
