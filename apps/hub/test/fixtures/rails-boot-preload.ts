// Actual production boot/router/builders. Only selected config and seeded Store
// are fixture-controlled; no real RPC, facilitator support call or payment occurs.
import { mock } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import type { Rail, RailTag } from "@arcade/payments"
import { BrokerTag, type Broker } from "../../src/broker.ts"
import { StoreLive, StoreTag } from "../../src/store.ts"
const core = { ...await import("@arcade/core") }, payments = { ...await import("@arcade/payments") }
const cfg = core.loadChainConfig()
const selected = process.env.TEST_NO_GATEWAY === "1" ? { ...cfg, gateway: null } : cfg
mock.module("@arcade/core", () => ({ ...core, loadChainConfig: () => selected }))
const eip: unknown[] = [], gateway: unknown[] = []
let networkRequests = 0
const paidFixture = process.env["TEST_RAIL_PAYMENTS"] === "1"
const verifies: string[] = [], settlements: string[] = []
let dispatches = 0, jobWrites = 0, reservations = 0
// Opt-in named simulations preserve the REAL constructors and challenges but
// replace verification/settlement with separate in-memory balances. No live proof.
const simulated = (layer: Layer.Layer<RailTag>): Layer.Layer<RailTag> => paidFixture
  ? Layer.effect(payments.RailTag, Effect.gen(function* () {
      const real = yield* payments.RailTag.pipe(Effect.provide(layer))
      const state = yield* Ref.make(payments.makeTestState({}, 1_000_000n))
      const fake = payments.makeTestRail(state)
      const rail: Rail = { ...real,
        verify: (payload, requirements) => Effect.suspend(() => { verifies.push(real.name); return fake.verify(payload, requirements) }),
        settle: (verified, tree) => Effect.suspend(() => { settlements.push(real.name); return fake.settle(verified, tree) }) }
      return rail
    })) : layer
mock.module("@arcade/payments", () => ({ ...payments,
  Eip3009Live: (options: Parameters<typeof payments.Eip3009Live>[0]) => {
    eip.push({ rpcUrl: options.rpcUrl, chainId: options.chain.chainId, facilitator: options.facilitator.address, feeSplitter: options.feeSplitter })
    return simulated(payments.Eip3009Live(options))
  },
  GatewayLive: (options: Parameters<typeof payments.GatewayLive>[0]) => { gateway.push(options); return simulated(payments.GatewayLive(options)) }
}))
const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
for (const [id, seller, splitter] of [["first", "2", "3"], ["second", "4", "5"]] as const) {
  await Effect.runPromise(store.putListing({ listing: core.PublicListing.make({ id, version: "1.0.0", serviceName: id,
    description: "Offline rail construction fixture", tags: [], price: "$0.01", bounds: core.Bounds.make({ timeoutSec: 1, maxSubSpendUsd: 0.05 }),
    inputSchema: { type: "object" }, outputSchema: { type: "object" } }), seller: `0x${seller.repeat(40)}`,
    feeSplitter: `0x${splitter.repeat(40)}`, splitterVersion: 2, runnerId: "rnr_fixture", publishedAtMs: 1 }))
}
if (paidFixture) {
  for (const name of ["gateway", "eip3009", "erc8183"] as const) await Effect.runPromise(store.putListing({
    listing: core.PublicListing.make({ id: `only-${name}`, version: "1.0.0", serviceName: "Limited rail", description: "Offline simulation",
      rails: [name], price: "$0.01", bounds: core.Bounds.make({ timeoutSec: 1 }), inputSchema: { type: "object" }, outputSchema: { type: "object", required: ["ok"] } }),
    seller: `0x${"2".repeat(40)}`, feeSplitter: `0x${"3".repeat(40)}`, splitterVersion: 2, runnerId: "rnr_fixture", publishedAtMs: 1 }))
  const broker: Broker = { register: () => Effect.void, unregister: () => Effect.void, complete: () => Effect.void,
    runnerFor: () => Effect.succeed("rnr_fixture"), runnerForJob: () => Effect.succeed(undefined),
    dispatch: args => Effect.sync(() => { dispatches++; return core.JobOutcome.make({ status: "succeeded", startedAtMs: 1, finishedAtMs: 2,
      output: (args.input as { fail?: boolean }).fail ? {} : { ok: true } }) }) }
  mock.module("../../src/broker.ts", () => ({ BrokerTag, BrokerLive: Layer.succeed(BrokerTag, broker) }))
}
mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, { ...store,
  putJob: (...args: Parameters<typeof store.putJob>) => Effect.suspend(() => { jobWrites++; return store.putJob(...args) }),
  reserveTree: (...args: Parameters<typeof store.reserveTree>) => Effect.suspend(() => { reservations++; return store.reserveTree(...args) })
}) }))
globalThis.fetch = Object.assign(async () => { networkRequests++; throw Error("Offline fixture forbids network") }, { preconnect() { throw Error("No preconnect") } })
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const original = options.fetch!
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch: async (req, server) => {
    const path = new URL(req.url).pathname
    if (path === "/__rails_fixture") return Response.json({ eip, gateway, networkRequests,
      ...(paidFixture ? { verifies, settlements, dispatches, jobWrites, reservations,
        receipts: (await Effect.runPromise(store.allReceipts)).map(r => ({ rail: r.rail, settled: r.settled, hop: r.hop })) } : {}) })
    if (path === "/__rails_child" && paidFixture) {
      const id = "job_railsparent00001"
      await Effect.runPromise(store.putJob(core.Job.make({ id, skillId: "first", seller: `0x${"2".repeat(40)}`, buyer: `0x${"a".repeat(40)}`,
        priceAtomic: 10000n, input: {}, status: "running", createdAtMs: Date.now(), rootJobId: id, hop: 0, ancestors: [] })))
      return Response.json({ capability: core.mintHireCapability("public-offline-fixture", id, Date.now() + 60_000) })
    }
    return original.call(server, req, server)
  }
  } as Parameters<typeof Bun.serve>[0])
  console.log(`[rails-port] ${server.port}`)
  return server
}) as typeof Bun.serve
