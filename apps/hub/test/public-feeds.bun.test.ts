import { Effect, Layer } from "effect"
import { Bounds, PublicListing, Receipt, ReceiptChild } from "@arcade/core"
import { StoreLive, StoreTag, type Store } from "../src/store.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { fileURLToPath } from "node:url"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const self = fileURLToPath(import.meta.url)
const hash = `0x${"a".repeat(64)}`

// The test file doubles as a private preload only in the owned child. No exported
// production seam or on-disk fixture is required; all external fetches are disabled.
if (process.env["ARCADE_PUBLIC_FEEDS_FIXTURE"] === "1") {
  const { mock } = await import("bun:test")
  const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
  for (const [id, seller] of [["feed-skill", `0x${"a".repeat(40)}`], ["second-skill", `0x${"A".repeat(40)}`]]) {
    await Effect.runPromise(store.putListing({ listing: PublicListing.make({ id: id!, version: "1.0.0", serviceName: "Public feed fixture",
      description: "Offline fixture", tags: [], price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }),
      inputSchema: { type: "object" }, outputSchema: { type: "object" } }), seller: seller!, runnerId: "rnr_fixture", publishedAtMs: 1 }))
  }
  for (let i = 0; i < 105; i++) {
    await Effect.runPromise(store.putReceipt(Receipt.make({
      jobId: `job_PRIVATE_${i}`, skillId: i === 104 ? "second-skill" : "feed-skill", skillVersion: "1.0.0",
      buyer: "PRIVATE_BUYER", seller: `0x${"a".repeat(40)}`, priceAtomic: 10_000n,
      sellerAtomic: 9_500n, feeAtomic: 500n, feeBps: 500, rail: i === 104 ? "gateway" : "eip3009",
      network: "eip155:5042002", settled: i !== 103, reason: i === 103 ? "PRIVATE_ERROR" : "ok",
      latencyMs: 1, createdAtMs: i, settleTx: hash, authorizationNonce: "PRIVATE_NONCE", receiptSignature: "PRIVATE_SIGNATURE",
      ancestors: ["PRIVATE_ANCESTOR"], rootJobId: `job_PRIVATE_${i}`, canary: i === 102,
      ...(i === 102 ? { treeHash: hash, children: [ReceiptChild.make({ jobId: "job_PRIVATE_DESCENDANT",
        skillId: "second-skill", priceAtomic: 1n, settled: true, settleTx: hash })] } : {})
    })))
  }
  let writes = 0, sourceReads = 0, kindReads = 0, source: "hub" | "subgraph" = "hub"
  const guarded = Object.fromEntries(Object.entries(store).map(([key, value]) => [key,
    typeof value === "function" && /^(put|record|remove|drop|touch|backfill|reserve|commit|release|open|begin|finish|mark|close)/.test(key)
      ? () => Effect.sync(() => { writes++; throw new Error("unexpected feed mutation") }) : value])) as unknown as Store
  const sourceGuarded: Store = { ...guarded, statsSource: Effect.sync(() => { sourceReads++; return source }),
    // Adversarial projection inputs, never ordinary writes with session markers.
    // Fresh copies preserve the real Store/session guard and its underlying rows.
    allReceipts: store.allReceipts.pipe(Effect.map(rows => rows.map(r => {
      const copy = Object.assign(Receipt.make({ ...r }), {
        sessionId: "PRIVATE_SESSION", session: true, token: "PRIVATE_TOKEN", future: "PRIVATE_FUTURE"
      })
      if (r.createdAtMs === 99) Object.setPrototypeOf(copy, { settleRefKind: "onchain" })
      if (r.createdAtMs === 100) Object.defineProperty(copy, "settleRefKind", {
        enumerable: true, get() { kindReads++; throw Error("PRIVATE_KIND_ACCESSOR") }
      })
      if (r.createdAtMs === 101) Object.defineProperty(copy, "settleRefKind", { enumerable: true, value: undefined })
      if (r.createdAtMs === 102) Object.defineProperty(copy, "settleRefKind", { enumerable: true, value: "onchain" })
      if (r.createdAtMs === 104) Object.defineProperty(copy, "settleRefKind", { enumerable: true, value: "gateway-transfer" })
      return copy
    }))) }
  mock.module("../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, sourceGuarded) }))
  globalThis.fetch = Object.assign(async () => { throw new Error("external fetch disabled") },
    { preconnect: () => { throw new Error("external preconnect disabled") } })
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const originalFetch = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0,
      fetch(req, server) {
        if (new URL(req.url).pathname === "/__fixture_writes") return Response.json({ writes, kindReads })
        if (new URL(req.url).pathname === "/__fixture_source") {
          source = new URL(req.url).searchParams.get("value") === "subgraph" ? "subgraph" : "hub"
          return Response.json({ sourceReads })
        }
        return originalFetch.call(this, req, server)
      }
    } as Parameters<typeof Bun.serve>[0])
    console.log(`[public-feed-port] ${server.port}`)
    return server
  }) as typeof Bun.serve
} else {
  const { afterAll, beforeAll, describe, expect, test } = await import("bun:test")
  describe("actual offline public-feed HTTP routes", () => {
    let child: ChildProcess, base = "", output = "", closed: Promise<void>
    beforeAll(async () => {
      child = spawn(process.execPath, ["--no-env-file", "--preload", self, "apps/hub/src/server.ts"], {
        cwd: root, env: { PATH: process.env["PATH"] ?? "", ARCADE_PUBLIC_FEEDS_FIXTURE: "1", PORT: "0",
          ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", ARCADE_HUB_SECRET: "offline-public-feed-only" },
        stdio: ["ignore", "pipe", "pipe"]
      })
      closed = new Promise<void>((resolve, reject) => { child.once("close", () => resolve()); child.once("error", reject) })
      const capture = (part: Buffer) => {
        output = (output + part.toString()).slice(-20_000)
        const port = /\[public-feed-port\] (\d+)/.exec(output)?.[1]
        if (port) base = `http://127.0.0.1:${port}`
      }
      child.stdout!.on("data", capture); child.stderr!.on("data", capture)
      const until = Date.now() + 8000
      while (!base && child.exitCode === null && child.signalCode === null && Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      if (!base) throw new Error(`owned offline hub did not start: ${output}`)
    }, 10_000)
    afterAll(async () => {
      if (!child) return
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM")
      const kill = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL") }, 1000)
      let deadline: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([closed, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("owned hub did not close")), 3000) })])
      } finally { clearTimeout(kill); clearTimeout(deadline) }
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
      if (base) await expect(fetch(base + "/stats", { signal: AbortSignal.timeout(500) })).rejects.toThrow()
    }, 5000)
    const get = (path: string, method = "GET") => fetch(base + path, { method, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(2000) })
    test("counts only settled receipt amounts and marks store-derived statistics honestly", async () => {
      const response = await get("/stats")
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ listings: 2, sellers: 1, calls: 105, settled: 104,
        volumeAtomic: "1040000", volume: "$1.04", feesAtomic: "52000", fees: "$0.052", trees: 1, source: "hub" })
      expect(await (await get("/__fixture_source")).json()).toEqual({ sourceReads: 1 })
    })
    test("will not relabel local counts when the store reports an unavailable indexed source", async () => {
      try {
        await get("/__fixture_source?value=subgraph")
        const response = await get("/stats")
        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: "stats_unavailable" })
      } finally { await get("/__fixture_source") }
    })
    test("serves the requested newest-first bounded feed and preserves unlisted historical behavior", async () => {
      const response = await get("/listings/feed-skill/receipts")
      expect(response.status).toBe(200)
      const rows = await response.json()
      expect(rows.length).toBe(20)
      expect(rows.map((r: { createdAtMs: number }) => r.createdAtMs)).toEqual(Array.from({ length: 20 }, (_, i) => 103 - i))
      expect(rows.every((r: { skillId: string }) => r.skillId === "feed-skill")).toBe(true)
      expect(await (await get("/listings/unknown/receipts")).json()).toEqual([])
      for (const [value, count] of [["2", 2], ["1000", 100], ["0", 1], ["-5", 1], ["2.9", 2], ["NaN", 20], ["Infinity", 20]]) {
        expect((await (await get(`/listings/feed-skill/receipts?limit=${value}`)).json()).length).toBe(count)
      }
      expect((await get("/listings/feed-skill/receipts?limit=1&limit=2")).status).toBe(400)
    })
    test("uses identical privacy projection on both feeds with canary and no Gateway fake link", async () => {
      const all = await (await get("/receipts")).json()
      const scoped = await (await get("/listings/feed-skill/receipts?limit=2")).json()
      expect(scoped).toEqual(all.filter((r: { skillId: string }) => r.skillId === "feed-skill").reverse().slice(0, 2))
      expect(JSON.stringify(all)).not.toContain("PRIVATE")
      expect(all.every((r: { session: boolean }) => r.session === false)).toBe(true)
      expect(scoped[1]).toMatchObject({ canary: true, children: [{ skillId: "second-skill", price: "$0.000001" }] })
      for (const index of [99, 100, 101]) expect(all[index]).toMatchObject({ settleRefKind: "unrecognized", explorer: null })
      expect(all[98]).not.toHaveProperty("settleRefKind")
      expect(all[102]).toMatchObject({ settleRefKind: "onchain", explorer: `https://testnet.arcscan.app/tx/${hash}` })
      expect(all[104].settleRefKind).toBe("gateway-transfer")
      expect(all[104].explorer).toBeNull()
      expect(all[103]).toMatchObject({ reason: "not settled", settled: false, explorer: null })
      expect(all[103]).not.toHaveProperty("settleTx")
    })
    test("does not route feed paths to listing detail, accept mutations, or expose private jobs", async () => {
      expect((await get("/listings/feed-skill")).status).toBe(200)
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) for (const path of ["/stats", "/listings/feed-skill/receipts", "/receipts"]) {
        expect((await get(path, method)).status).toBe(404)
      }
      expect((await get("/jobs/job_PRIVATE_1")).status).toBe(404)
      expect((await get("/jobs/job_PRIVATE_1/result")).status).toBe(404)
      expect(await (await get("/__fixture_writes")).json()).toEqual({ writes: 0, kindReads: 0 })
    })
  })
  test("SQLite inherits the same hub source seam after reopening without a new persistence subsystem", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arcade-public-feeds-"))
    let opened = openSqliteStore(join(directory, "hub.sqlite"), "first")
    try {
      expect(opened.store).toHaveProperty("statsSource")
      expect(await Effect.runPromise(opened.store.statsSource)).toBe("hub")
      const row = Receipt.make({ jobId: "job_duplicate", skillId: "fixture", skillVersion: "1",
        buyer: "buyer", seller: "seller", priceAtomic: 10_000n, sellerAtomic: 9_500n, feeAtomic: 500n,
        feeBps: 500, settled: true, reason: "ok", rail: "test", network: "eip155:5042002",
        createdAtMs: 1, latencyMs: 1 })
      await Effect.runPromise(opened.store.putReceipt(row))
      await Effect.runPromise(opened.store.putReceipt(row))
      const before = await Effect.runPromise(opened.store.allReceipts)
      expect(before).toHaveLength(1)
      opened.close(); opened = openSqliteStore(join(directory, "hub.sqlite"), "second")
      expect(await Effect.runPromise(opened.store.statsSource)).toBe("hub")
      expect(await Effect.runPromise(opened.store.allReceipts)).toEqual(before)
    } finally { opened.close(); rmSync(directory, { recursive: true, force: true }) }
  })
}
