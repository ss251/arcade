import { mock } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { Bounds, PublicListing, loadChainConfig } from "@arcade/core"
import { StoreLive, StoreTag } from "../../src/store.ts"
const erc = { ...await import("../../src/erc8004.ts") }, payments = { ...await import("@arcade/payments") }
const seller = `0x${"1".repeat(40)}`, store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
for (const [id, agentId] of [["fresh", "1"], ["transferred", "2"], ["stale", "3"], ["unreadable", "4"], ["unverified", "5"], ["missing", undefined]]) {
  await Effect.runPromise(store.putListing({ listing: PublicListing.make({ id: `evidence-${id}`, version: "1.0.0",
    serviceName: "Offline identity fixture", description: "SIMULATED registry reads", tags: [], price: "$0.01",
    bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: { type: "object" }, outputSchema: { type: "object" } }),
    seller, runnerId: "rnr_evidence", publishedAtMs: Date.now(), agentVerified: id !== "unverified",
    ...(agentId === undefined ? {} : { agentId, registrationTx: `0x${"a".repeat(64)}` }) }))
}
mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, store) }))
const rail = payments.makeTestRail(Effect.runSync(Ref.make(payments.makeTestState())))
// Real Gateway metadata/payee, simulated verification and settlement only.
mock.module("@arcade/payments", () => ({ ...payments,
  GatewayLive: (options: Parameters<typeof payments.GatewayLive>[0]) => Layer.effect(payments.RailTag, Effect.gen(function* () {
    const gateway = yield* payments.RailTag.pipe(Effect.provide(payments.GatewayLive(options)))
    return { ...gateway, verify: rail.verify, settle: rail.settle }
  })) }))
mock.module("../../src/erc8004.ts", () => ({ ...erc, Erc8004FromEnv: () => Layer.succeed(erc.Erc8004Tag, {
  ...erc.noopErc8004("offline fixture"), armed: true, registries: loadChainConfig("arc-testnet").erc8004!,
  addresses: { operator: `0x${"4".repeat(40)}`, validator: `0x${"5".repeat(40)}`, attester: `0x${"6".repeat(40)}` },
  ownerOf: (agentId: string) => Effect.suspend(() => {
    console.log(`[owner-read] ${agentId}`)
    if (agentId === "4") return Effect.fail(new erc.Erc8004Failed({ op: "ownerOf", reason: "PRIVATE_RPC" }))
    return Effect.succeed(agentId === "2" ? `0x${"9".repeat(40)}` : seller)
  }),
  evidenceFor: (agentId: string) => Effect.sync(() => {
    console.log(`[evidence-read] ${agentId}`)
    return { validationPasses: 7, validationsRead: 8, settlementFeedback: 5, stale: agentId === "3", private: "PRIVATE_SERVICE" }
  })
}) }))
globalThis.fetch = Object.assign(async () => { throw new Error("external calls disabled in offline identity fixture") },
  { preconnect() { throw Error("external preconnect disabled in offline identity fixture") } })
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0 } as Parameters<typeof Bun.serve>[0])
  console.log(`[identity-http-port] ${server.port}`); return server
}) as typeof Bun.serve
