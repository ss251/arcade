// Real router/pipeline, isolated store and explicitly SIMULATED payment service.
import { mock } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { Bounds, JobOutcome, PublicListing, loadChainConfig } from "@arcade/core"
import { StoreLive, StoreTag } from "../../src/store.ts"
import { BrokerTag, type Broker } from "../../src/broker.ts"
import type { Attest } from "../../src/attest.ts"
const payments = { ...await import("@arcade/payments") }
const erc = { ...await import("../../src/erc8004.ts") }
const attest = { ...await import("../../src/attest.ts") }
const mode = process.env["TEST_ATTEST_MODE"]
const seller = `0x${"2".repeat(40)}`, payTo = `0x${"3".repeat(40)}`
const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive)))
await Effect.runPromise(store.putListing({ listing: PublicListing.make({ id: "http-attest", version: "1.0.0",
  serviceName: "Offline attestation fixture", description: "SIMULATED", tags: [], price: "$0.01",
  bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: { type: "object" }, outputSchema: { type: "object", required: ["ok"] } }),
  runnerId: "rnr_attest", seller, feeSplitter: payTo, publishedAtMs: Date.now(),
  ...(mode === "missing" ? {} : { agentId: "42", registrationTx: `0x${"a".repeat(64)}`, agentVerified: mode !== "unverified" }) }))
mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, store) }))
const rail = payments.makeTestRail(Effect.runSync(Ref.make(payments.makeTestState({}, 1_000_000n))))
// Real Gateway metadata/payee, simulated verification and settlement only.
mock.module("@arcade/payments", () => ({ ...payments,
  GatewayLive: (options: Parameters<typeof payments.GatewayLive>[0]) => Layer.effect(payments.RailTag, Effect.gen(function* () {
    const gateway = yield* payments.RailTag.pipe(Effect.provide(payments.GatewayLive(options)))
    return { ...gateway, verify: rail.verify, settle: rail.settle }
  })) }))
const broker: Broker = { register: () => Effect.void, unregister: () => Effect.void, complete: () => Effect.void,
  runnerFor: () => Effect.succeed("rnr_attest"), runnerForJob: () => Effect.succeed("rnr_attest"),
  dispatch: () => Effect.succeed(JobOutcome.make({ status: "succeeded", stopReason: "end_turn", startedAtMs: 0, finishedAtMs: 1,
    output: mode === "failed" ? { private: "OUTPUT_PRIVATE" } : { ok: true, private: "OUTPUT_PRIVATE" } })) }
mock.module("../../src/broker.ts", () => ({ BrokerTag, BrokerLive: Layer.succeed(BrokerTag, broker) }))
mock.module("../../src/erc8004.ts", () => ({ ...erc, Erc8004FromEnv: () => Layer.succeed(erc.Erc8004Tag, {
  ...erc.noopErc8004("offline fixture"), armed: mode !== "unarmed", registries: loadChainConfig("arc-testnet").erc8004!,
  addresses: { operator: `0x${"4".repeat(40)}`, validator: `0x${"5".repeat(40)}`, attester: `0x${"6".repeat(40)}` }
}) }))
mock.module("../../src/attest.ts", () => ({ ...attest, AttestLive: Layer.succeed(attest.AttestTag, {
  onTerminal: job => Effect.gen(function* () {
    const receipt = (yield* store.allReceipts).find(receipt => receipt.jobId === job.jobId)
    console.log("[attest-enqueued] " + JSON.stringify({ jobId: job.jobId, agentId: job.agentId, seller: job.seller,
      buyer: job.buyer, payTo: job.payTo, origin: job.origin, chainId: job.chainId, identityRegistry: job.identityRegistry,
      settled: job.settled, settleTx: job.settleTx, receiptExists: receipt !== undefined,
      timestampMatches: receipt?.createdAtMs === job.createdAtMs, inputMatches: (job.input as { private?: string }).private === "INPUT_PRIVATE",
      outputMatches: (job.output as { private?: string }).private === "OUTPUT_PRIVATE" }))
    if (mode === "broken") yield* Effect.die("QUEUE_PRIVATE")
  }), idle: Effect.void
} satisfies Attest) }))
globalThis.fetch = Object.assign(async () => { throw new Error("external calls disabled in offline attestation fixture") },
  { preconnect() { throw Error("external preconnect disabled in offline attestation fixture") } })
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0 } as Parameters<typeof Bun.serve>[0])
  console.log(`[attest-http-port] ${server.port}`); return server
}) as typeof Bun.serve
