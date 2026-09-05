import { Effect, Layer } from "effect"
import { Bounds, PublicListing, Receipt, ReceiptChild, treeHashOf } from "@arcade/core"
import { StoreLive, StoreTag, type Store } from "../src/store.ts"
import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url)), SELF = fileURLToPath(import.meta.url)
const SELLER = "0xcf821769ED3c0E55e152745377bb833d7155A78a"
const SUBBUY = "0xd3Ad4D10D4d24bD57740A5430ED5Fd28c6824634"
const OTHER = `0x${"12".repeat(20)}`, BUYER = `0x${"34".repeat(20)}`, BAD = `0x${"56".repeat(20)}`, UNKNOWN = `0x${"78".repeat(20)}`
const TX = `0x${"ab".repeat(32)}`

// This file is a private preload only in the explicitly owned test child. No
// production debugging endpoint/seam, external fetch or credential lookup is added.
if (process.env["ARCADE_SUMMARY_FIXTURE"] === "1") {
  const { mock } = await import("bun:test")
  const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive))), now = Date.now()
  await Effect.runPromise(store.putListing({ listing: PublicListing.make({ id: "summary-skill", version: "1", serviceName: "Summary fixture",
    description: "Offline", tags: [], price: "$0.12", bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: {}, outputSchema: {} }),
    seller: SELLER, runnerId: "PRIVATE_RUNNER", publishedAtMs: now - 50, ensName: "summary-skill.fixture.arcade.eth",
    agentId: "42", agentVerified: true, registrationTx: TX }))
  await Effect.runPromise(store.putRunner({ runnerId: "PRIVATE_RUNNER", seller: SELLER, skillIds: ["summary-skill"], maxConcurrency: 2,
    connectedAtMs: now - 100, lastSeenMs: now, activeJobs: 0 }))
  const root = (jobId: string, over: Partial<Receipt> = {}) => Receipt.make({ jobId, skillId: "summary-skill", skillVersion: "1", buyer: BUYER,
    seller: SELLER, priceAtomic: 120_000n, sellerAtomic: 114_000n, feeAtomic: 6_000n, feeBps: 500, rail: "eip3009",
    network: "eip155:5042002", latencyMs: 10, settled: true, reason: "PRIVATE_PROVIDER_ERROR", createdAtMs: now - 100,
    sellerCostUsd: 0.02, settleTx: TX, rootJobId: jobId, hop: 0, ancestors: [], children: [], treeCommittedAtomic: 0n,
    authorizationNonce: "PRIVATE_NONCE", receiptSignature: "PRIVATE_SIGNATURE", ...over })
  const descendant = Receipt.make({ jobId: "job_PRIVATE_CHILD", skillId: "child-skill", skillVersion: "1", buyer: SUBBUY, seller: OTHER,
    priceAtomic: 50_000n, sellerAtomic: 47_500n, feeAtomic: 2_500n, feeBps: 500, rail: "eip3009", network: "eip155:5042002",
    latencyMs: 5, settled: true, reason: "ok", createdAtMs: now - 100, sellerCostUsd: 0, settleTx: TX,
    rootJobId: "job_PRIVATE_ROOT", parentJobId: "job_PRIVATE_ROOT", hop: 1, ancestors: ["summary-skill"] })
  const children = [ReceiptChild.make({ jobId: descendant.jobId, skillId: descendant.skillId, priceAtomic: descendant.priceAtomic, settled: true, settleTx: TX })]
  const { sellerCostUsd: _cost, ...withoutCost } = root("job_PRIVATE_UNKNOWN")
  for (const r of [root("job_PRIVATE_ROOT", { children, treeCommittedAtomic: 50_000n, treeHash: treeHashOf("job_PRIVATE_ROOT", children) }),
    Receipt.make(withoutCost), root("job_PRIVATE_FAILED", { settled: false, sellerCostUsd: 0.01 }), descendant,
    root("job_PRIVATE_BAD", { seller: BAD, feeAtomic: 1n })]) {
    await Effect.runPromise(store.putReceipt(Object.assign(r, { sessionId: "PRIVATE_SESSION", token: "PRIVATE_TOKEN", future: "PRIVATE_FUTURE" })))
  }
  let writes = 0, reads = 0, external = 0, failNextReceiptRead = false
  const guarded = Object.fromEntries(Object.entries(store).map(([name, value]) => [name,
    typeof value === "function" && /^(put|record|remove|drop|touch|backfill|reserve|commit|release)/.test(name)
      ? () => Effect.sync(() => { writes++; throw new Error("unexpected mutation") }) : value])) as unknown as Store
  const counted: Store = { ...guarded,
    allListings: store.allListings.pipe(Effect.tap(() => Effect.sync(() => { reads++ }))),
    allReceipts: Effect.suspend(() => {
      reads++
      if (failNextReceiptRead) {
        failNextReceiptRead = false
        return Effect.die(new Error("PRIVATE_STORAGE_DIAGNOSTIC job_PRIVATE_ROOT"))
      }
      return store.allReceipts
    }),
    allRunners: store.allRunners.pipe(Effect.tap(() => Effect.sync(() => { reads++ }))) }
  mock.module("../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, counted) }))
  globalThis.fetch = Object.assign(async () => { external++; throw new Error("external fetch disabled") },
    { preconnect: () => { external++; throw new Error("external preconnect disabled") } })
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const original = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch(req, server) {
      const url = new URL(req.url)
      if (url.pathname === "/__summary_fixture") {
        if (url.searchParams.get("failNextReceiptRead") === "1") failNextReceiptRead = true
        return Response.json({ reads, writes, external })
      }
      return original.call(this, req, server)
    } } as Parameters<typeof Bun.serve>[0])
    console.log(`[summary-fixture-port] ${server.port}`)
    return server
  }) as typeof Bun.serve
} else {
  const { beforeAll, afterAll, describe, expect, test } = await import("bun:test")
  describe("actual seller-summary route with isolated raw ledger", () => {
    let child: ChildProcess | undefined, base = "", closed: Promise<void> = Promise.resolve()
    beforeAll(async () => {
      child = spawn(process.execPath, ["--no-env-file", "--preload", SELF, "apps/hub/src/server.ts"], { cwd: ROOT,
        env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_SUMMARY_FIXTURE: "1", ARCADE_NETWORK: "arc-testnet",
          ARCADE_RAIL: "test", ARCADE_HUB_SECRET: "offline-summary-fixture" }, stdio: ["ignore", "pipe", "pipe"] })
      closed = new Promise<void>((resolve, reject) => { child!.once("close", resolve); child!.once("error", reject) })
      let output = ""
      const capture = (part: Buffer) => { output = (output + part.toString()).slice(-16_384)
        const port = /\[summary-fixture-port\] (\d+)/.exec(output)?.[1]
        if (port) base = `http://127.0.0.1:${port}` }
      child.stdout!.on("data", capture); child.stderr!.on("data", capture)
      const deadline = Date.now() + 8_000
      while (!base && child.exitCode === null && child.signalCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      if (!base) throw new Error("owned summary fixture did not start")
    }, 10_000)
    afterAll(async () => {
      if (child === undefined) return
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM")
      const kill = setTimeout(() => { if (child!.exitCode === null && child!.signalCode === null) child!.kill("SIGKILL") }, 1_000)
      let timer: ReturnType<typeof setTimeout> | undefined
      try { await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("owned summary fixture did not close")), 3_000) })]) }
      finally { clearTimeout(kill); clearTimeout(timer) }
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
      if (base) await expect(fetch(base + "/healthz", { signal: AbortSignal.timeout(500) })).rejects.toThrow()
    }, 5_000)
    const get = (path: string, method = "GET") => fetch(base + path, { method, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(2_000) })
    test("serves real fields from complete raw receipts and preserves unknown costs/funding", async () => {
      const response = await get(`/sellers/${SELLER}/summary`)
      expect(response.status).toBe(200)
      const value = await response.json()
      expect(value).toMatchObject({ seller: SELLER.toLowerCase(), calls: 3, settled: 2, revenueAtomic: "240000", feesAtomic: "12000", netAtomic: "228000",
        inferenceCostAtomic: null, knownInferenceCostAtomic: "30000", subSpendAtomic: null, knownSubSpendAtomic: "0", marginAtomic: null,
        inferenceCostComplete: false, subSpendComplete: false })
      expect(value.listings).toHaveLength(1)
      expect(value.listings[0]).toMatchObject({ id: "summary-skill", live: true, agentId: "42", agentVerified: true, ensName: "summary-skill.fixture.arcade.eth", marginPerCall: null })
      for (const secret of ["PRIVATE", BUYER, SUBBUY, "parentJobId", "rootJobId", "authorizationNonce", "ensExpired", "validationPassCount"]) expect(JSON.stringify(value)).not.toContain(secret)
      expect(await (await get(`/sellers/${SELLER.toLowerCase()}/summary`)).json()).toEqual(value)
    })
    test("returns honest empty totals for an unknown canonical seller", async () => {
      const response = await get(`/sellers/${UNKNOWN}/summary`)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ seller: UNKNOWN, calls: 0, settled: 0, revenueAtomic: "0", marginAtomic: "0", listings: [] })
    })
    test("refuses malformed/zero addresses and non-GET methods before store reads", async () => {
      const before = await (await get("/__summary_fixture")).json()
      for (const address of ["0xshort", `0x${"0".repeat(40)}`, `${SELLER}extra`, "private%2Fjob"]) {
        const response = await get(`/sellers/${address}/summary`)
        expect(response.status).toBe(404)
        expect(await response.text()).not.toContain("PRIVATE")
      }
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect((await get(`/sellers/${SELLER}/summary`, method)).status).toBe(404)
      expect(await (await get("/__summary_fixture")).json()).toEqual(before)
    })
    test("returns only fixed unavailable diagnostics and does not expose private jobs or mutate", async () => {
      const response = await get(`/sellers/${BAD}/summary`)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: "seller_summary_unavailable" })
      for (const path of ["/jobs/job_PRIVATE_ROOT", "/jobs/job_PRIVATE_ROOT/result"]) expect((await get(path)).status).toBe(404)
      expect(await (await get("/__summary_fixture")).json()).toMatchObject({ writes: 0, external: 0 })
      expect((await get("/stats")).status).toBe(200)
      expect((await get("/receipts")).status).toBe(200)
    })
    test("contains exactly one private store defect and recovers without mutations or external requests", async () => {
      const before = await (await get("/__summary_fixture?failNextReceiptRead=1")).json()
      const failed = await get(`/sellers/${SELLER}/summary`)
      expect(failed.status).toBe(503)
      const body = await failed.text()
      expect(body).toBe(JSON.stringify({ error: "seller_summary_unavailable" }, null, 2))
      expect(body).not.toContain("PRIVATE")
      expect(body).not.toContain("STORAGE")
      expect(await (await get("/__summary_fixture")).json()).toEqual({ reads: before.reads + 2, writes: 0, external: 0 })
      const recovered = await get(`/sellers/${SELLER}/summary`)
      expect(recovered.status).toBe(200)
      expect(await recovered.json()).toMatchObject({ seller: SELLER.toLowerCase(), calls: 3, settled: 2, marginAtomic: null })
      expect(await (await get("/__summary_fixture")).json()).toEqual({ reads: before.reads + 5, writes: 0, external: 0 })
    })
  })
}
