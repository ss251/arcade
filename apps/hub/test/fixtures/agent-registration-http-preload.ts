// Real HTTP router and in-memory store; only configuration/services are offline fixtures.
import { mock } from "bun:test"
import { Effect, Layer } from "effect"
import { StoreLive, StoreTag } from "../../src/store.ts"
const core = { ...await import("@arcade/core") }
const erc = { ...await import("../../src/erc8004.ts") }
const mode = process.env["TEST_ERC_MODE"]
if (mode === "no-registry") mock.module("@arcade/core", () => ({ ...core, loadChainConfig: (...args: Parameters<typeof core.loadChainConfig>) => {
  const { erc8004: _ignored, ...chain } = core.loadChainConfig(...args)
  return chain
} }))

const seller = "0x1111111111111111111111111111111111111111"
const store = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
  const state = yield* StoreTag
  yield* state.putRunner({ runnerId: "rnr_metadata", seller, skillIds: ["metadata-live", "metadata-delisted"],
    maxConcurrency: 2, connectedAtMs: Date.now(), lastSeenMs: Date.now(), activeJobs: 0 })
  for (const id of ["metadata-live", "metadata-delisted", "metadata-offline"]) {
    yield* state.putListing({ listing: core.PublicListing.make({ id, version: "1.0.0", serviceName: id,
      description: "Public metadata fixture", tags: [], price: "$0.01", bounds: core.Bounds.make({ timeoutSec: 5 }),
      inputSchema: { type: "object" }, outputSchema: { type: "object" } }), seller,
      runnerId: id === "metadata-offline" ? "rnr_missing" : "rnr_metadata", publishedAtMs: Date.now(),
      agentId: "42", registrationTx: `0x${"a".repeat(64)}`, agentVerified: true, ensName: "metadata.arcade.eth" })
  }
  for (const atMs of [1, 2, 3]) yield* state.recordPayTest({ skillId: "metadata-delisted", seller, atMs,
    jobId: `job_${atMs}`, ok: false, reason: "PRIVATE_PAY_TEST_REASON" })
  return state
}), StoreLive))
mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, store) }))
if (mode === "armed") mock.module("../../src/erc8004.ts", () => ({ ...erc,
  Erc8004FromEnv: () => Layer.succeed(erc.Erc8004Tag, { ...erc.noopErc8004("fixture"), armed: true,
    registries: core.loadChainConfig("arc-testnet").erc8004!,
    addresses: { operator: seller, validator: "0x2222222222222222222222222222222222222222",
      attester: "0x3333333333333333333333333333333333333333" },
    private: "PRIVATE_SERVICE_KEY", provider: "PRIVATE_PROVIDER_URL" }) }))

// Accidental remote calls fail; no key or paid rail is used by this fixture.
globalThis.fetch = async () => { throw new Error("external network disabled in registration fixture") }
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0 } as Parameters<typeof Bun.serve>[0])
  console.log(`[registration-test-port] ${server.port}`)
  return server
}) as typeof Bun.serve
