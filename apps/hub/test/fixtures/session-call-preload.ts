// Owned production-router process. Dummy data only; external network is forbidden.
import { mock } from "bun:test"
import { Effect, Layer } from "effect"
import { Bounds, HIRE_CAPABILITY_HEADER, Job, JobOutcome, PublicListing, Receipt, loadChainConfig } from "@arcade/core"
import { StoreLive, StoreTag } from "../../src/store.ts"
import { openSqliteStore } from "../../src/store-sqlite.ts"
import { sessionRequestDigest, type SessionBinding } from "../../src/session-ledger.ts"
import { BrokerLive, BrokerTag } from "../../src/broker.ts"
const viem = { ...await import("viem") }

if (process.env["TEST_SESSION_CALL_FIXTURE"] === "1") {
  const cfg = loadChainConfig("arc-testnet"), db = process.env["ARCADE_DB"]
  const disk = db === undefined ? undefined : openSqliteStore(db, "owned-session-call")
  const store = disk?.store ?? await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
  const broker = await Effect.runPromise(BrokerTag.pipe(Effect.provide(BrokerLive)))
  const buyer = `0x${"a".repeat(40)}`, seller = `0x${"b".repeat(40)}`
  const sessionId = `ses_${"1".repeat(32)}`, jobId = `job_${"1".repeat(20)}`
  if (await Effect.runPromise(store.getSession(sessionId)) === undefined) {
    await Effect.runPromise(store.openSession({ id: sessionId, buyer, budgetAtomic: 100n, rail: "test", network: cfg.caip2, openedAtMs: 1 }))
    const input = { value: "private input" }, amount = 30n
    const binding: SessionBinding = { sessionId, jobId, buyer, seller, skillId: "fixture", skillVersion: "1.0.0", rail: "test",
      network: cfg.caip2, asset: cfg.usdc.address, verifyingContract: cfg.usdc.address, domainName: cfg.usdc.eip712Name,
      domainVersion: cfg.usdc.eip712Version, payTo: seller, amountAtomic: amount, nonce: `0x${"1".repeat(64)}`,
      validAfter: 1n, validBefore: 601n, requestDigest: sessionRequestDigest(input) }
    const queued = Job.make({ id: jobId, skillId: "fixture", buyer, seller, priceAtomic: amount, input, status: "queued",
      createdAtMs: 2, rootJobId: jobId, hop: 0, ancestors: [] })
    await Effect.runPromise(store.reserveSessionJob(binding, queued))
    // F5 legally permits retained output on a definite release. HTTP must withhold it.
    const outcome = JobOutcome.make({ status: "succeeded", output: { secret: "RETAINED_UNPAID_OUTPUT" },
      error: "PRIVATE_PROVIDER_DIAGNOSTIC", startedAtMs: 2, finishedAtMs: 3 })
    await Effect.runPromise(store.finishSessionJob({ kind: "released", sessionId, jobId,
      job: Job.make({ ...queued, status: outcome.status, outcome }), receipt: Receipt.make({ jobId, skillId: "fixture", skillVersion: "1.0.0",
        buyer, seller, priceAtomic: amount, sellerAtomic: amount, feeAtomic: 0n, feeBps: 0, rail: "test", network: cfg.caip2,
        latencyMs: 1, settled: false, reason: "session_released", createdAtMs: 3, sessionId, rootJobId: jobId, hop: 0, ancestors: [] }) }))
  }
  const demo = (id: string) => PublicListing.make({ id, serviceName: id, version: "1.0.0", description: "Owned offline paid fixture", tags: [],
    price: id === "child" ? "$0.01" : "$0.10", inputSchema: { type: "object" }, outputSchema: { type: "object" },
    bounds: Bounds.make({ timeoutSec: 10, ...(id === "root-loop" ? { maxSubSpendUsd: 0.02 } : {}) }) })
  for (const id of ["demo", "root-loop", "child"]) await Effect.runPromise(store.putListing({ listing: demo(id), seller, runnerId: "runner_fixture", publishedAtMs: Date.now() }))
  let reads = 0, networkRequests = 0, dispatches = 0, origin = ""
  const childHeaders: Array<{ session: boolean; sessionToken: boolean; hire: boolean }> = []
  const handshakeFacts: Array<{ id: string; fee?: number; network?: string; verified?: boolean }> = []
  const nativeFetch = globalThis.fetch
  const ownFetch = (path: string, init?: RequestInit) => nativeFetch(origin + path, { ...init, signal: AbortSignal.timeout(5000), redirect: "error" })
  await Effect.runPromise(broker.register({ runnerId: "runner_fixture", seller, close() {}, send(message) {
    if (message._tag !== "JobAssignment") return
    dispatches++
    const startedAtMs = Date.now()
    void (async () => {
      if (message.skillId === "root-loop") {
        const headers = { "content-type": "application/json", [HIRE_CAPABILITY_HEADER]: message.hireCapability! }
        const probe = await ownFetch("/x/child/child", { method: "POST", headers, body: "{}" })
        const requirements = (await probe.json()).accepts[0], seconds = Math.floor(Date.now() / 1000)
        const payment = { x402Version: 2, accepted: requirements, payload: { signature: "0xgood", authorization: { from: seller, to: requirements.payTo,
          value: requirements.amount, validAfter: String(seconds - 1), validBefore: String(seconds + 600), nonce: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}` } } }
        const paidHeaders = { ...headers, "payment-signature": Buffer.from(JSON.stringify(payment)).toString("base64") }
        childHeaders.push({ session: Object.hasOwn(paidHeaders, "x-arcade-session"), sessionToken: Object.hasOwn(paidHeaders, "x-session-token"), hire: !!message.hireCapability })
        const accepted = await ownFetch("/x/child/child", { method: "POST", headers: paidHeaders, body: "{}" })
        if (accepted.status !== 202) throw Error("Owned child admission failed")
        const handle = await accepted.json(), polled = await nativeFetch(handle.poll_url, { signal: AbortSignal.timeout(5000), redirect: "error" })
        if (!(await polled.json()).receipt?.settled) throw Error("Owned child unsettled")
      }
      const outcome = JobOutcome.make({ status: "succeeded", output: { answer: "owned paid output" }, startedAtMs, finishedAtMs: Date.now() })
      await Effect.runPromise(broker.complete(message.jobId, outcome))
    })().catch(() => Effect.runPromise(broker.complete(message.jobId,
      JobOutcome.make({ status: "failed", startedAtMs, finishedAtMs: Date.now() }))))
  } }, ["demo", "root-loop", "child"]))
  mock.module("../../src/broker.ts", () => ({ BrokerTag, BrokerLive: Layer.succeed(BrokerTag, broker) }))
  // Existing handshake read only, controlled entirely in this owned process.
  mock.module("viem", () => ({ ...viem, createPublicClient: () => ({ readContract: async ({ functionName }: { functionName: string }) => {
    if (process.env["TEST_SPLITTER_UNREADABLE"] === "1") throw Error("Owned unavailable contract")
    return functionName === "feeBps" ? 500 : functionName === "version" ? 2 : process.env["TEST_HELLO_SELLER"] ?? seller
  } }) }))
  const wrapped = { ...store,
    getJob: (...args: Parameters<typeof store.getJob>) => { reads++; return store.getJob(...args) },
    getSessionSnapshot: (...args: Parameters<typeof store.getSessionSnapshot>) => { reads++; return store.getSessionSnapshot(...args) },
    getListing: (...args: Parameters<typeof store.getListing>) => { reads++; return store.getListing(...args) },
    putListing: (record: Parameters<typeof store.putListing>[0]) => store.putListing(record).pipe(Effect.tap(() => Effect.sync(() => {
      handshakeFacts.push({ id: record.listing.id, ...(record.splitterFeeBps === undefined ? {} : { fee: record.splitterFeeBps }),
        ...(record.splitterNetwork === undefined ? {} : { network: record.splitterNetwork }), ...(record.splitterVerified === undefined ? {} : { verified: record.splitterVerified }) })
    }))),
    allReceipts: Effect.suspend(() => { reads++; return store.allReceipts }) }
  mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, wrapped) }))
  globalThis.fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (origin && url.origin === origin) return nativeFetch(input, init)
    networkRequests++; throw Error("Owned fixture forbids network") },
    { preconnect() { throw Error("Owned fixture forbids preconnect") } })
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const original = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch: async (request, server) => {
      if (new URL(request.url).pathname === "/__session_call_fixture") return Response.json({ reads, networkRequests, dispatches, childHeaders, handshakeFacts,
        children: (await Effect.runPromise(store.allReceipts)).filter(r => r.skillId === "child").map(r => ({ buyer: r.buyer, settled: r.settled, sessionId: r.sessionId })) })
      return original.call(server, request, server)
    } } as Parameters<typeof Bun.serve>[0])
    origin = `http://127.0.0.1:${server.port}`
    console.log(`[session-call-port] ${server.port}`)
    return server
  }) as typeof Bun.serve
}
