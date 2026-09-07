/** Owned synthetic boot/shutdown only. Real config/SQLite/journal/routes; no chain or wallet calls. */
import { mock } from "bun:test"
import { Effect, Layer } from "effect"
import { Bounds, PublicListing } from "@arcade/core"
import { StoreTag } from "../../src/store.ts"
const payments = { ...await import("@arcade/payments") }, journal = { ...await import("@arcade/payments/erc8183-journal") }
const sqlite = { ...await import("../../src/store-sqlite.ts") }, brokers = { ...await import("../../src/broker.ts") }
let networkRequests = 0, constructions = 0, journalOpens = 0, storeCopies = 0
const mode = process.env["TEST_ESCROW_MODE"]
mock.module("@arcade/payments/erc8183-journal", () => ({ ...journal, openEscrowActionJournal: (path: string) => {
  journalOpens++; const opened = journal.openEscrowActionJournal(path)
  return { ...opened, close: () => { opened.close(); console.log("[escrow-journal-closed]") } }
} }))
mock.module("@arcade/payments", () => ({ ...payments, makeErc8183Rail: (config: Parameters<typeof payments.makeErc8183Rail>[0]) => {
  constructions++; const rail = payments.makeErc8183Rail(config)
  const verified = <Stage extends "funded" | "budget">(stage: Stage, payment: Parameters<typeof rail.verify>[0], current: Parameters<typeof rail.verify>[1]) => {
    const terms = payments.captureEscrowRequirements(current), captured = payments.captureEscrowPayment(payment)
    const client = "0x" + "6".repeat(40), expiredAt = Math.floor(Date.now() / 1000) + 1800
    const context = payments.escrowActionContext({ call: terms.call, client, expiredAt, jobId: BigInt(captured.payload.jobId),
      treasury: (config.identity as { treasury: string }).treasury,
      requestHash: payments.escrowRequestDescription(terms.call, client, expiredAt, captured.payload.capability).slice("arcade:erc8183:request:v1:".length) })
    return { rail: "erc8183" as const, stage, payer: context.client, payTo: context.call.provider,
      amountAtomic: context.call.amount, network: "eip155:5042002" as const, context, requirements: terms.requirements }
  }
  if (mode === "verify") return { ...rail, verifyBudget: () => Effect.sync(() => console.log("[escrow-verification-entered]")).pipe(
    Effect.zipRight(Effect.never), Effect.ensuring(Effect.promise(async () => {
      console.log("[escrow-verification-cleanup-start]"); await Bun.sleep(100); console.log("[escrow-verification-cleaned]")
    }))) }
  if (mode === "root") return { ...rail, verify: (payment: Parameters<typeof rail.verify>[0], current: Parameters<typeof rail.verify>[1]) =>
    Effect.sync(() => verified("funded", payment, current)) }
  if (mode === "budget") return { ...rail, verifyBudget: (payment: Parameters<typeof rail.verify>[0], current: Parameters<typeof rail.verify>[1]) =>
    Effect.sync(() => verified("budget", payment, current)), budget: () => Effect.sync(() => console.log("[escrow-budget-entered]")).pipe(
      Effect.zipRight(Effect.never), Effect.ensuring(Effect.promise(async () => { await Bun.sleep(10); console.log("[escrow-budget-cleaned]") }))) }
  return rail
} }))
mock.module("../../src/store-sqlite.ts", () => ({ ...sqlite, StoreFromEnv: () => {
  const layer = sqlite.StoreFromEnv()
  return Layer.effect(StoreTag, Effect.gen(function* () {
    const store = yield* StoreTag.pipe(Effect.provide(layer)); storeCopies++
    yield* store.putListing({ listing: PublicListing.make({ id: "skill", version: "1.0.0", serviceName: "Offline escrow boot",
      description: "Synthetic fixture, not live verification", price: "$0.30", tags: [], rails: ["gateway", "eip3009", "erc8183"],
      bounds: Bounds.make({ timeoutSec: 60 }), inputSchema: { type: "object" }, outputSchema: { type: "object" } }),
      seller: "0x" + "9".repeat(40), agentId: "8", agentVerified: true, runnerId: "fixture", publishedAtMs: 1 })
    return store
  }))
} }))
if (mode === "root") mock.module("../../src/broker.ts", () => ({ ...brokers, BrokerLive: Layer.effect(brokers.BrokerTag,
  Effect.map(brokers.BrokerTag.pipe(Effect.provide(brokers.BrokerLive)), broker => ({ ...broker,
    dispatch: () => Effect.sync(() => console.log("[escrow-job-entered]")).pipe(Effect.zipRight(Effect.never),
      Effect.ensuring(Effect.promise(async () => { await Bun.sleep(10); console.log("[escrow-job-cleaned]") }))) }))) }))
globalThis.fetch = Object.assign(async () => { networkRequests++; throw Error("PRIVATE_NETWORK_FORBIDDEN") }, { preconnect() { throw Error("no preconnect") } })
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const original = options.fetch!
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch: async (req, server) => {
    if (new URL(req.url).pathname === "/__escrow_fixture") return Response.json({ networkRequests, constructions, journalOpens, storeCopies })
    return original.call(server, req, server)
  } } as Parameters<typeof Bun.serve>[0])
  console.log(`[escrow-test-port] ${server.port}`); return server
}) as typeof Bun.serve
