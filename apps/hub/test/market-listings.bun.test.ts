import { Effect, Layer } from "effect"
import { Bounds, PublicListing } from "@arcade/core"
import { StoreLive, StoreTag, type Store } from "../src/store.ts"
import { decodeListings } from "../../web/src/lib/hub-decode.ts"
import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const self = fileURLToPath(import.meta.url)
const seller = `0x${"a".repeat(40)}`
const hash = `0x${"b".repeat(64)}`
const ids = ["market-none", "market-pass", "market-fail", "market-dead", "market-badref", "market-zeroref"]

// Only this allowlisted child preloads fixtures; the actual production router runs.
if (process.env["ARCADE_MARKET_LISTINGS_FIXTURE"] === "1") {
  const { mock } = await import("bun:test")
  const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
  for (const id of ids) {
    await Effect.runPromise(store.putListing({ listing: PublicListing.make({ id, version: "1.0.0",
      serviceName: id, description: "Owned offline marketplace fixture", tags: [], price: "$0.01",
      bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: { type: "object" }, outputSchema: { type: "object" } }),
      seller, runnerId: "PRIVATE_RUNNER", publishedAtMs: 1 }))
  }
  for (const [skillId, ok, settleTx] of [
    ["market-pass", true, hash], ["market-fail", false, hash],
    ["market-badref", true, "PRIVATE_REFERENCE"], ["market-zeroref", true, `0x${"0".repeat(64)}`]
  ] as const) {
    await Effect.runPromise(store.recordPayTest({ skillId, seller, atMs: 1_000, jobId: "job_PRIVATE_CANARY",
      ok, reason: "PRIVATE_REASON", ...(settleTx === undefined ? {} : { settleTx }) }))
  }
  for (const atMs of [1, 2, 3]) await Effect.runPromise(store.recordPayTest({ skillId: "market-dead", seller,
    atMs, jobId: "job_PRIVATE_DEAD", ok: false, reason: "PRIVATE_REASON" }))
  let writes = 0, forbiddenReads = 0, listReads = 0, external = 0
  const guarded = Object.fromEntries(Object.entries(store).map(([key, value]) => [key,
    typeof value === "function" && /^(put|record|remove|drop|touch|backfill|reserve|commit|release)/.test(key)
      ? () => Effect.sync(() => { writes++; throw Error("Unexpected marketplace mutation") }) : value])) as unknown as Store
  const exposed: Store = { ...guarded,
    allListings: Effect.sync(() => { listReads++ }).pipe(Effect.zipRight(store.allListings)),
    getListing: () => Effect.sync(() => { forbiddenReads++; throw Error("Unexpected listing detail read") }),
    statsFor: () => Effect.sync(() => { forbiddenReads++; throw Error("Unexpected per-listing stats read") }),
    allReceipts: Effect.sync(() => { forbiddenReads++; throw Error("Unexpected receipt fanout") })
  }
  mock.module("../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, exposed) }))
  globalThis.fetch = Object.assign(async () => { external++; throw Error("External request disabled") },
    { preconnect() { external++; throw Error("External preconnect disabled") } })
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const original = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0,
      fetch(request, server) {
        if (new URL(request.url).pathname === "/__market_fixture") return Response.json({ writes, forbiddenReads, listReads, external })
        return original.call(this, request, server)
      }
    } as Parameters<typeof Bun.serve>[0])
    console.log(`[market-listings-port] ${server.port}`)
    return server
  }) as typeof Bun.serve
  setTimeout(() => process.exit(1), 30_000).unref()
} else {
  const { afterAll, beforeAll, describe, expect, test } = await import("bun:test")
  describe("H6 actual catalog evidence projection", () => {
    let child: ChildProcess | undefined, origin = "", output = "", didClose = false
    let closed: Promise<void> = Promise.resolve()
    const bounded = async (promise: Promise<unknown>, ms: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try { return await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("Owned fixture deadline")), ms)
      })]) } finally { clearTimeout(timer) }
    }
    const get = (path: string, method = "GET") => fetch(origin + path, {
      method, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(2_000)
    })
    beforeAll(async () => {
      child = spawn(process.execPath, ["--no-env-file", "--preload", self, "apps/hub/src/server.ts"], {
        cwd: root, env: { PATH: process.env["PATH"] ?? "", ARCADE_MARKET_LISTINGS_FIXTURE: "1",
          ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", PORT: "0", ARCADE_HUB_SECRET: "owned-market-fixture-only" },
        stdio: ["ignore", "pipe", "pipe"]
      })
      closed = new Promise<void>((resolve, reject) => {
        child!.once("close", () => { didClose = true; resolve() }); child!.once("error", reject)
      })
      const capture = (part: Buffer) => {
        output = (output + part.toString()).slice(-16_384)
        const port = /\[market-listings-port\] (\d+)/.exec(output)?.[1]
        if (port) origin = `http://127.0.0.1:${port}`
      }
      child.stdout!.on("data", capture); child.stderr!.on("data", capture)
      await bounded((async () => {
        while (!origin && !didClose) await new Promise(resolve => setTimeout(resolve, 10))
        if (!origin) throw Error("Owned marketplace fixture failed to start")
      })(), 8_000)
    }, 10_000)
    afterAll(async () => {
      if (child && !didClose) child.kill("SIGTERM")
      try { await bounded(closed, 1_000) } catch {
        if (child && !didClose) child.kill("SIGKILL")
        await bounded(closed, 2_000)
      }
      expect(didClose).toBe(true)
      if (origin) await expect(get("/healthz")).rejects.toThrow()
    }, 4_000)
    test("projects explicit no-history, passing and failed facts through the real H4 decoder", async () => {
      const response = await get("/listings")
      expect(response.status).toBe(200)
      const raw = await response.json()
      const decoded = decodeListings(raw)
      const byId = new Map(decoded.map(row => [row.id, row]))
      expect(byId.get("market-none")).toMatchObject({ payTested: null, delisted: false })
      expect(byId.get("market-pass")).toMatchObject({ payTested: { atMs: 1_000, ok: true, jobId: "", settleTx: hash }, delisted: false })
      expect(byId.get("market-fail")).toMatchObject({ payTested: { atMs: 1_000, ok: false, jobId: "" }, delisted: false })
      expect(byId.get("market-fail")?.payTested).not.toHaveProperty("settleTx")
      expect(decoded.map(row => row.id)).toEqual(ids.filter(id => id !== "market-dead"))
    })
    test("does not publish private identifiers, diagnostics, invalid references or explorer authority", async () => {
      const response = await get("/listings"), bytes = await response.text()
      expect(bytes).not.toContain("PRIVATE")
      const rows = JSON.parse(bytes) as Array<Record<string, unknown>>
      for (const id of ["market-badref", "market-zeroref"]) {
        expect(rows.find(row => row.id === id)?.payTested).toEqual({ atMs: 1_000, ok: true, jobId: "" })
      }
      for (const row of rows) {
        expect(row).not.toHaveProperty("runnerId")
        expect(row).not.toHaveProperty("stats")
        if (row.payTested !== null) {
          const evidence = row.payTested as Record<string, unknown>
          expect(Object.keys(evidence).sort()).toEqual(evidence.settleTx === undefined
            ? ["atMs", "jobId", "ok"] : ["atMs", "jobId", "ok", "settleTx"])
          for (const key of ["reason", "token", "buyer", "nonce", "rail", "network", "explorer"]) expect(evidence).not.toHaveProperty(key)
        }
      }
    })
    test("performs one current listing read, with no mutation, detail fanout or external request", async () => {
      const before = await (await get("/__market_fixture")).json()
      await get("/listings")
      const after = await (await get("/__market_fixture")).json()
      expect(after).toEqual({ ...before, listReads: before.listReads + 1 })
      expect(after).toMatchObject({ writes: 0, forbiddenReads: 0, external: 0 })
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect((await get("/listings", method)).status).toBe(404)
    })
  })
}
