// Owned child only: actual Store, service and production router; no external IO.
import { mock } from "bun:test"
import { Effect, Layer } from "effect"
import { Job, JobOutcome, Receipt, loadChainConfig } from "@arcade/core"
import { StoreLive, StoreTag } from "../../src/store.ts"
import { openSqliteStore } from "../../src/store-sqlite.ts"
import { sessionRequestDigest, type SessionBinding } from "../../src/session-ledger.ts"

if (process.env["TEST_SESSION_FIXTURE"] === "1") {
  if (process.env["TEST_SESSION_OMIT_SECRET"] === "1") delete process.env["ARCADE_HUB_SECRET"]
  const cfg = loadChainConfig("arc-testnet"), db = process.env["ARCADE_DB"]
  const disk = db === undefined ? undefined : openSqliteStore(db, "owned-session-http")
  const store = disk?.store ?? await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
  const buyer = `0x${"a".repeat(40)}`, seller = `0x${"b".repeat(40)}`
  const sessionId = `ses_${"1".repeat(32)}`, jobId = `job_${"1".repeat(20)}`, legacyId = `job_${"2".repeat(20)}`
  const input = { secret: "PRIVATE_SESSION_INPUT" }, amount = 30n
  if (await Effect.runPromise(store.getSession(sessionId)) === undefined) {
    await Effect.runPromise(store.openSession({ id: sessionId, buyer, budgetAtomic: 100n, rail: "test", network: cfg.caip2, openedAtMs: 1 }))
    const binding: SessionBinding = { sessionId, jobId, buyer, seller, skillId: "fixture", skillVersion: "1.0.0", rail: "test",
      network: cfg.caip2, asset: cfg.usdc.address, verifyingContract: cfg.usdc.address, domainName: cfg.usdc.eip712Name,
      domainVersion: cfg.usdc.eip712Version, payTo: seller, amountAtomic: amount, nonce: `0x${"1".repeat(64)}`,
      validAfter: 1n, validBefore: 601n, requestDigest: sessionRequestDigest(input) }
    const job = Job.make({ id: jobId, skillId: "fixture", buyer, seller, priceAtomic: amount, input, status: "queued",
      createdAtMs: 2, rootJobId: jobId, hop: 0, ancestors: [] })
    await Effect.runPromise(store.reserveSessionJob(binding, job))
    const outcome = JobOutcome.make({ status: "refused", startedAtMs: 2, finishedAtMs: 3 })
    await Effect.runPromise(store.finishSessionJob({ kind: "released", sessionId, jobId, job: Job.make({ ...job, status: "refused", outcome }),
      receipt: Receipt.make({ jobId, skillId: "fixture", skillVersion: "1.0.0", buyer, seller, priceAtomic: amount, sellerAtomic: amount,
        feeAtomic: 0n, feeBps: 0, rail: "test", network: cfg.caip2, latencyMs: 1, settled: false, reason: "session_released",
        createdAtMs: 3, sessionId, rootJobId: jobId, hop: 0, ancestors: [] }) }))
    await Effect.runPromise(store.putJob(Job.make({ ...job, id: legacyId, rootJobId: legacyId, status: "refused", outcome })))
  }
  let reads = 0, writes = 0, networkRequests = 0, activeHandlers = 0
  const wrapped = { ...store,
    getSessionSnapshot: (id: string) => { reads++; return store.getSessionSnapshot(id) },
    openSession: (...args: Parameters<typeof store.openSession>) => { writes++; return store.openSession(...args) },
    closeSession: (...args: Parameters<typeof store.closeSession>) => { writes++; return store.closeSession(...args) }
  }
  mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, wrapped) }))
  globalThis.fetch = Object.assign(async () => { networkRequests++; throw Error("Owned fixture forbids network") },
    { preconnect() { throw Error("Owned fixture forbids preconnect") } })
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const original = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch: async (request, server) => {
      const path = new URL(request.url).pathname
      if (path === "/__session_fixture") return Response.json({ reads, writes, networkRequests, activeHandlers })
      const counted = path === "/sessions" || path.startsWith("/sessions/")
      if (counted) activeHandlers++
      try { return await original.call(server, request, server) }
      finally { if (counted) activeHandlers-- }
    }
    } as Parameters<typeof Bun.serve>[0])
    console.log(`[session-port] ${server.port}`)
    return server
  }) as typeof Bun.serve
}
