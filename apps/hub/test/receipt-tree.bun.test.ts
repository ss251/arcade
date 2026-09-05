import { Effect, Layer } from "effect"
import { Job, Receipt, ReceiptChild, treeHashOf } from "@arcade/core"
import { StoreLive, StoreTag, type Store } from "../src/store.ts"
import { createHmac } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"

const REPO = fileURLToPath(new URL("../../..", import.meta.url)), SELF = fileURLToPath(import.meta.url)
const ROOT = "job_root000000000000", CHILD = "job_child00000000000", GRAND = "job_grand00000000000"
const PENDING = "job_pending000000000", RESERVED = "job_reserved00000000", UNKNOWN = "job_unknown000000000"
const BUYER = `0x${"9".repeat(40)}`, SUBBUY = `0x${"7".repeat(40)}`, SELLER = `0x${"8".repeat(40)}`
const SECRET = "offline-tree-fixture-not-a-key"
const token = (id: string) => createHmac("sha256", SECRET).update(`arcade-job:${id}`).digest("hex").slice(0, 32)
const tx = (digit: string) => `0x${digit.repeat(64)}`
const rows = (): Receipt[] => {
  const row = (jobId: string, skillId: string, rootJobId: string, hop: number, parentJobId?: string) => Receipt.make({
    jobId, skillId, skillVersion: "1", buyer: hop === 0 ? BUYER : SUBBUY, seller: SELLER,
    priceAtomic: 50_000n, sellerAtomic: 47_500n, feeAtomic: 2_500n, feeBps: 500,
    rail: "eip3009", network: "eip155:5042002", settled: true, reason: "PRIVATE_PROVIDER_ERROR", latencyMs: 10,
    createdAtMs: 1, rootJobId, hop, ...(parentJobId === undefined ? {} : { parentJobId }),
    settleTx: tx(hop === 0 ? "a" : hop === 1 ? "b" : "c"),
    authorizationNonce: "PRIVATE_NONCE", receiptSignature: "PRIVATE_SIGNATURE" })
  const child = row(CHILD, "child-skill", ROOT, 1, ROOT), grand = row(GRAND, "grand-skill", ROOT, 2, CHILD)
  // Actual root manifests are flat descendants, deliberately reversed here. Edges
  // must instead follow each full receipt's parent/hop evidence.
  const children = [grand, child].map(r => ReceiptChild.make({ jobId: r.jobId, skillId: r.skillId,
    priceAtomic: r.priceAtomic, settled: true, settleTx: r.settleTx }))
  const reserved = Receipt.make({ ...row(RESERVED, "reserved-skill", PENDING, 1, PENDING), settled: false, settleTx: undefined })
  const pendingChildren = [ReceiptChild.make({ jobId: RESERVED, skillId: reserved.skillId, priceAtomic: reserved.priceAtomic, settled: false })]
  return [grand, Receipt.make({ ...row(ROOT, "root-skill", ROOT, 0), children, treeHash: treeHashOf(ROOT, children),
    treeCeilingAtomic: 200_000n, treeCommittedAtomic: 100_000n }), child,
    Receipt.make({ ...row(PENDING, "pending-skill", PENDING, 0), children: pendingChildren,
      treeHash: treeHashOf(PENDING, pendingChildren), treeCeilingAtomic: 100_000n, treeCommittedAtomic: 0n }), reserved]
    .map(r => Object.assign(r, { sessionId: "PRIVATE_SESSION", future: "PRIVATE_FUTURE" }))
}

// Test-only preload: the real production router runs with a real in-memory Store,
// no external transports, no keys and no production debug endpoints.
if (process.env["ARCADE_TREE_FIXTURE"] === "1") {
  const { mock } = await import("bun:test")
  const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
  for (const receipt of rows()) await Effect.runPromise(store.putReceipt(receipt))
  await Effect.runPromise(store.putJob(Job.make({ id: ROOT, skillId: "root-skill", seller: SELLER, buyer: BUYER,
    priceAtomic: 50_000n, input: "PRIVATE_INPUT", status: "succeeded", createdAtMs: 1 })))
  let reads = 0, writes = 0, external = 0, failNextReceiptRead = false
  const guarded = Object.fromEntries(Object.entries(store).map(([name, value]) => {
    if (typeof value === "function") {
      if (/^(put|record|remove|drop|touch|backfill|reserve|commit|release)/.test(name)) {
        return [name, () => Effect.sync(() => { writes++; throw new Error("unexpected mutation") })]
      }
      return [name, (...args: unknown[]) => Effect.suspend(() => {
        reads++
        const result: unknown = Reflect.apply(value, store, args)
        return Effect.isEffect(result) ? result : Effect.die(new Error("unexpected store result"))
      })]
    }
    return [name, Effect.isEffect(value) ? Effect.suspend(() => { reads++; return value }) : value]
  })) as unknown as Store
  const counted: Store = { ...guarded, allReceipts: Effect.suspend(() => {
    reads++
    if (failNextReceiptRead) { failNextReceiptRead = false; return Effect.die(new Error(`PRIVATE_STORAGE_DIAGNOSTIC ${CHILD}`)) }
    return store.allReceipts
  }) }
  mock.module("../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, counted) }))
  globalThis.fetch = Object.assign(async () => { external++; throw new Error("external fetch disabled") },
    { preconnect: () => { external++; throw new Error("external preconnect disabled") } })
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const original = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch(req, server) {
      const url = new URL(req.url)
      if (url.pathname === "/__tree_fixture") {
        if (url.searchParams.get("failNextReceiptRead") === "1") failNextReceiptRead = true
        return Response.json({ reads, writes, external })
      }
      return original.call(this, req, server)
    } } as Parameters<typeof Bun.serve>[0])
    console.log(`[tree-fixture-port] ${server.port}`)
    return server
  }) as typeof Bun.serve
} else {
  const { beforeAll, afterAll, describe, expect, test } = await import("bun:test")
  describe("actual authenticated receipt-tree route", () => {
    let child: ChildProcess | undefined, base = "", output = "", closed: Promise<void> = Promise.resolve()
    beforeAll(async () => {
      child = spawn(process.execPath, ["--no-env-file", "--preload", SELF, "apps/hub/src/server.ts"], { cwd: REPO,
        env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_TREE_FIXTURE: "1", ARCADE_NETWORK: "arc-testnet",
          ARCADE_RAIL: "test", ARCADE_HUB_SECRET: SECRET }, stdio: ["ignore", "pipe", "pipe"] })
      closed = new Promise<void>((resolve, reject) => { child!.once("close", resolve); child!.once("error", reject) })
      const capture = (part: Buffer) => { output = (output + part.toString()).slice(-16_384)
        const port = /\[tree-fixture-port\] (\d+)/.exec(output)?.[1]
        if (port) base = `http://127.0.0.1:${port}` }
      child.stdout!.on("data", capture); child.stderr!.on("data", capture)
      const deadline = Date.now() + 8_000
      while (!base && child.exitCode === null && child.signalCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      if (!base) throw new Error("owned tree fixture did not start")
    }, 10_000)
    afterAll(async () => {
      if (child === undefined) return
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM")
      const kill = setTimeout(() => { if (child!.exitCode === null && child!.signalCode === null) child!.kill("SIGKILL") }, 1_000)
      let timer: ReturnType<typeof setTimeout> | undefined
      try { await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("owned tree fixture did not close")), 3_000) })]) }
      finally { clearTimeout(kill); clearTimeout(timer) }
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
      if (base) await expect(fetch(base + "/healthz", { signal: AbortSignal.timeout(500) })).rejects.toThrow()
      for (const value of [token(ROOT), token(CHILD), token(PENDING), "PRIVATE_STORAGE_DIAGNOSTIC"]) expect(output).not.toContain(value)
    }, 5_000)
    const get = (path: string, options: RequestInit = {}) => fetch(base + path, { ...options,
      redirect: "error", credentials: "omit", signal: AbortSignal.timeout(2_000) })
    const authorized = (id = ROOT) => `/trees/${id}?token=${token(id)}`
    const observe = async () => await (await get("/__tree_fixture")).json() as { reads: number; writes: number; external: number }
    const privateResponse = (response: Response) => {
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(response.headers.get("set-cookie")).toBeNull()
      expect(response.headers.get("location")).toBeNull()
    }
    const notFound = async (response: Response) => {
      expect(response.status).toBe(404); privateResponse(response)
      expect(await response.text()).toBe(JSON.stringify({ error: "not_found" }, null, 2))
    }
    test("rejects a 32-character non-ASCII token on existing job routes without throwing or reading", async () => {
      const before = await observe()
      for (const suffix of ["", "/result"]) {
        const response = await get(`/jobs/${ROOT}${suffix}?token=${encodeURIComponent("é".repeat(32))}`)
        expect(response.status).toBe(404)
        expect(await response.text()).toBe(JSON.stringify({ error: "not_found" }, null, 2))
      }
      expect(await observe()).toEqual(before)
    })
    test("draws positional edges from complete raw flat descendants without leaking capabilities or child handles", async () => {
      const before = await observe(), response = await get(authorized())
      expect(response.status).toBe(200); privateResponse(response)
      const view = await response.json()
      expect(view).toMatchObject({ rootJobId: ROOT, complete: true, evidenceFlags: [], ceiling: "$0.20", committed: "$0.10",
        treeHash: rows().find(r => r.jobId === ROOT)!.treeHash })
      expect(view.nodes.map((n: { nodeId: string; parentNodeId: string | null; skillId: string; hop: number }) =>
        [n.nodeId, n.parentNodeId, n.skillId, n.hop])).toEqual([
        ["0", null, "root-skill", 0], ["0.0", "0", "child-skill", 1], ["0.0.0", "0.0", "grand-skill", 2]])
      expect(view.nodes[1]).toMatchObject({ priceAtomic: "50000", settled: true, reason: "settled", settleTx: tx("b"),
        explorer: `https://testnet.arcscan.app/tx/${tx("b")}` })
      for (const secret of [CHILD, GRAND, BUYER, SUBBUY, "PRIVATE", "authorizationNonce", "receiptSignature", "sessionId", "parentJobId", token(ROOT)]) {
        expect(JSON.stringify(view)).not.toContain(secret)
      }
      expect(JSON.stringify(view.nodes)).not.toContain(ROOT)
      expect(await observe()).toEqual({ reads: before.reads + 1, writes: 0, external: 0 })
      expect(await (await get(`/trees/${ROOT}`, { headers: { "x-job-token": token(ROOT) } })).json()).toEqual(view)
    })
    test("keeps unresolved reservations explicit rather than claiming complete settlement", async () => {
      const response = await get(authorized(PENDING))
      expect(response.status).toBe(200); privateResponse(response)
      const view = await response.json()
      expect(view).toMatchObject({ rootJobId: PENDING, complete: false, evidenceFlags: ["reservation-unresolved"], committed: "$0.00" })
      expect(view.nodes).toHaveLength(2)
      expect(view.nodes[1]).toMatchObject({ nodeId: "0.0", parentNodeId: "0", settled: false, reason: "not settled", explorer: null })
      expect(JSON.stringify(view)).not.toContain(RESERVED)
    })
    test("makes missing, malformed, foreign and wrong root tokens indistinguishable before any store IO", async () => {
      const before = await observe()
      for (const presented of [undefined, "", "0".repeat(32), "f".repeat(31), "g".repeat(32), token(ROOT).toUpperCase(),
        "é".repeat(32), token(CHILD), token(UNKNOWN)]) {
        await notFound(await get(`/trees/${ROOT}${presented === undefined ? "" : `?token=${encodeURIComponent(presented)}`}`))
      }
      // Header authority wins: a valid query cannot rescue a malformed header.
      await notFound(await get(authorized(), { headers: { "x-job-token": "bad" } }))
      expect(await observe()).toEqual(before)
    })
    test("refuses malformed or oversized root IDs and non-GET methods without store IO", async () => {
      const before = await observe()
      for (const id of ["job_short", `job_${"a".repeat(129)}`, `job_${"a".repeat(15)}`, "job_root00000000000_", "root0000000000000000", "job_root000000000000%2Fextra"]) {
        await notFound(await get(`/trees/${id}?token=${token(id)}`))
      }
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) await notFound(await get(authorized(), { method }))
      const head = await get(authorized(), { method: "HEAD" })
      expect(head.status).toBe(404); privateResponse(head); expect(await head.text()).toBe("")
      await notFound(await get("/trees"))
      expect(await observe()).toEqual(before)
    })
    test("never promotes a child with its own valid token and keeps unknown valid roots unavailable", async () => {
      const before = await observe()
      await notFound(await get(authorized(CHILD)))
      await notFound(await get(authorized(UNKNOWN)))
      expect(await observe()).toEqual({ reads: before.reads + 2, writes: 0, external: 0 })
      const response = await get(`/jobs/${ROOT}?token=${token(ROOT)}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ id: ROOT, status: "succeeded" })
    })
    test("contains one private store defect as fixed503 and recovers without writes or external requests", async () => {
      const before = await (await get("/__tree_fixture?failNextReceiptRead=1")).json()
      const failed = await get(authorized())
      expect(failed.status).toBe(503); privateResponse(failed)
      expect(await failed.text()).toBe(JSON.stringify({ error: "tree_unavailable" }, null, 2))
      expect(await observe()).toEqual({ reads: before.reads + 1, writes: 0, external: 0 })
      const response = await get(authorized())
      expect(response.status).toBe(200); privateResponse(response)
      expect(await response.json()).toMatchObject({ rootJobId: ROOT, complete: true })
      expect(await observe()).toEqual({ reads: before.reads + 2, writes: 0, external: 0 })
    })
  })
}
