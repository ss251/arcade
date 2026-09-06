// Real hub/router/store/pipeline, deterministic offline ENS and simulated payment rail.
import { mock } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { Bounds, JobOutcome, PublicListing } from "@arcade/core"
import { StoreLive, StoreTag } from "../../src/store.ts"
import { BrokerTag, type Broker } from "../../src/broker.ts"
const buyer = { ...await import("@arcade/buyer") }
const payments = { ...await import("@arcade/payments") }
const seller = `0x${"2".repeat(40)}`, payTo = `0x${"3".repeat(40)}`
const ids = ["ens-live", "ens-gone", "ens-down", "ens-delisted"]
let origin = "", live = true, stuck = false, reads = 0
let held = process.env["TEST_ENS_HELD"] === "1", metadataWrites = 0
const pendingReads: Array<() => void> = []
const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
await Effect.runPromise(Effect.gen(function* () {
  yield* store.putRunner({ runnerId: "rnr_ens", seller, skillIds: ids, maxConcurrency: 4,
    connectedAtMs: Date.now(), lastSeenMs: Date.now(), activeJobs: 0 })
  for (const id of ids) yield* store.putListing({ listing: PublicListing.make({ id, version: "1.0.0",
    serviceName: id, description: "SIMULATED ENS fixture", tags: [], price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }),
    inputSchema: { type: "object" }, outputSchema: { type: "object", required: ["ok"] } }),
    seller, feeSplitter: payTo, runnerId: "rnr_ens", publishedAtMs: 1, agentId: "42", agentVerified: true })
  for (const atMs of [1, 2, 3]) yield* store.recordPayTest({ skillId: "ens-delisted", seller, atMs,
    jobId: `job_${atMs}`, ok: false, reason: "PRIVATE_CANARY_REASON" })
}))
mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, {
  ...store, putListing: rec => Effect.sync(() => {
    if (rec.listing.id === "ens-live" && rec.ensName !== undefined) metadataWrites++
  }).pipe(Effect.zipRight(store.putListing(rec)))
}) }))
mock.module("@arcade/buyer", () => ({ ...buyer, sepoliaEnsReader: () => ({
  getEnsText: async ({ name, key }: { name: string; key: string }) => {
    reads++
    if (!process.env["ARCADE_ENS_ROOT"]) throw Error("PRIVATE_DISABLED_RPC")
    if (stuck) return await new Promise<null>(() => {})
    if (held) await new Promise<void>(resolve => pendingReads.push(resolve))
    const id = name.split(".")[0]!
    if (id === "ens-down") throw Error("PRIVATE_RPC_CREDENTIAL")
    if (!live || id === "ens-gone" || !ids.includes(id)) return null
    return ({ "arcade.endpoint": `${origin}/x/${seller}/${id}`, "arcade.payTo": payTo,
      "arcade.chain": "eip155:5042002", "arcade.priceAtomic": "10000" } as Record<string, string>)[key] ?? null
  }
}) }))
const rail = payments.makeTestRail(Effect.runSync(Ref.make(payments.makeTestState({}, 1_000_000n))))
// Real Gateway metadata/payee, simulated verification and settlement only.
mock.module("@arcade/payments", () => ({ ...payments,
  GatewayLive: (options: Parameters<typeof payments.GatewayLive>[0]) => Layer.effect(payments.RailTag, Effect.gen(function* () {
    const gateway = yield* payments.RailTag.pipe(Effect.provide(payments.GatewayLive(options)))
    return { ...gateway, verify: rail.verify, settle: rail.settle }
  })) }))
const broker: Broker = { register: () => Effect.void, unregister: () => Effect.void, complete: () => Effect.void,
  runnerFor: () => Effect.succeed("rnr_ens"), runnerForJob: () => Effect.succeed("rnr_ens"),
  dispatch: () => Effect.succeed(JobOutcome.make({ status: "succeeded", stopReason: "end_turn", startedAtMs: 0, finishedAtMs: 1, output: { ok: true } })) }
mock.module("../../src/broker.ts", () => ({ BrokerTag, BrokerLive: Layer.succeed(BrokerTag, broker) }))
globalThis.fetch = Object.assign(async () => { throw Error("external network disabled in offline ENS fixture") },
  { preconnect() { throw Error("external preconnect disabled in offline ENS fixture") } })
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const original = options.fetch!
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch: async (request, server) => {
    const path = new URL(request.url).pathname
    if (path.startsWith("/__ens_fixture/")) {
      if (path.endsWith("/missing")) live = false
      if (path.endsWith("/live")) live = true
      if (path.endsWith("/stuck")) stuck = true
      if (path.endsWith("/replace")) {
        await Effect.runPromise(Effect.gen(function* () {
          const previous = yield* store.getListing("ens-live")
          const { ensName: _old, ...record } = previous
          yield* store.putListing({ ...record, runnerId: "rnr_replacement", publishedAtMs: 2 })
        }))
        held = false
        for (const release of pendingReads.splice(0)) release()
      }
      return Response.json({ reads, pending: pendingReads.length, metadataWrites })
    }
    return original.call(server, request, server)
  } } as Parameters<typeof Bun.serve>[0])
  origin = `http://127.0.0.1:${server.port}`
  console.log(`[ens-http-port] ${server.port}`)
  return server
}) as typeof Bun.serve
