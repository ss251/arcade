// Actual production boot/router/builders. Only selected config and seeded Store
// are fixture-controlled; no real RPC, facilitator support call or payment occurs.
import { mock } from "bun:test"
import { Effect, Layer } from "effect"
import { StoreLive, StoreTag } from "../../src/store.ts"
const core = { ...await import("@arcade/core") }, payments = { ...await import("@arcade/payments") }
const cfg = core.loadChainConfig()
const selected = process.env.TEST_NO_GATEWAY === "1" ? { ...cfg, gateway: null } : cfg
mock.module("@arcade/core", () => ({ ...core, loadChainConfig: () => selected }))
const eip: unknown[] = [], gateway: unknown[] = []
let networkRequests = 0
mock.module("@arcade/payments", () => ({ ...payments,
  Eip3009Live: (options: Parameters<typeof payments.Eip3009Live>[0]) => {
    eip.push({ rpcUrl: options.rpcUrl, chainId: options.chain.chainId, facilitator: options.facilitator.address, feeSplitter: options.feeSplitter })
    return payments.Eip3009Live(options)
  },
  GatewayLive: (options: Parameters<typeof payments.GatewayLive>[0]) => { gateway.push(options); return payments.GatewayLive(options) }
}))
const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
for (const [id, seller, splitter] of [["first", "2", "3"], ["second", "4", "5"]] as const) {
  await Effect.runPromise(store.putListing({ listing: core.PublicListing.make({ id, version: "1.0.0", serviceName: id,
    description: "Offline rail construction fixture", tags: [], price: "$0.01", bounds: core.Bounds.make({ timeoutSec: 1 }),
    inputSchema: { type: "object" }, outputSchema: { type: "object" } }), seller: `0x${seller.repeat(40)}`,
    feeSplitter: `0x${splitter.repeat(40)}`, splitterVersion: 2, runnerId: "rnr_fixture", publishedAtMs: 1 }))
}
mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, store) }))
globalThis.fetch = Object.assign(async () => { networkRequests++; throw Error("Offline fixture forbids network") }, { preconnect() { throw Error("No preconnect") } })
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const original = options.fetch!
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch: (req, server) =>
    new URL(req.url).pathname === "/__rails_fixture" ? Response.json({ eip, gateway, networkRequests }) : original.call(server, req, server)
  } as Parameters<typeof Bun.serve>[0])
  console.log(`[rails-port] ${server.port}`)
  return server
}) as typeof Bun.serve
