import { describe, expect, it } from "vitest"
import { Effect, Layer, Ref } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { Bounds, JobOutcome, PublicListing, ROOT_LINEAGE } from "@arcade/core"
import { makeTestRail, makeTestState, PaymentPayload, RailTag, signAuthorization, type Rail } from "@arcade/payments"
import { BrokerTag, type Broker } from "../src/broker.ts"
import { runJob } from "../src/pipeline.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { railsLayerFrom } from "../src/rails.ts"

const account = privateKeyToAccount(`0x${"01".repeat(32)}`), seller = `0x${"2".repeat(40)}`
const listing = PublicListing.make({ id: "rail-fixture", version: "1.0.0", serviceName: "Rail fixture", description: "Offline simulated balances",
  tags: [], price: "$0.01", bounds: Bounds.make({ timeoutSec: 1 }), inputSchema: { type: "object" }, outputSchema: { type: "object", required: ["ok"] } })
async function run(override: boolean, success = true) {
  const fallbackState = Effect.runSync(Ref.make(makeTestState({ [account.address]: 100000n })))
  const extraState = Effect.runSync(Ref.make(makeTestState({ [account.address]: 100000n })))
  const fallback = makeTestRail(fallbackState)
  // Named fake only: actual in-memory balances, not a Gateway provider or proof.
  const extra: Rail = { ...makeTestRail(extraState), name: "gateway" }
  const selected = override ? extra : fallback
  const requirements = await Effect.runPromise(selected.challenge({ priceAtomic: 10000n, payTo: seller, resource: "/fixture" }))
  const { signature, ...authorization } = await Effect.runPromise(signAuthorization({ account, to: seller, valueAtomic: 10000n }))
  const verified = await Effect.runPromise(selected.verify(PaymentPayload.make({ x402Version: 2, accepted: requirements, payload: { signature, authorization } }), requirements))
  const broker: Broker = { register: () => Effect.void, unregister: () => Effect.void, complete: () => Effect.void,
    runnerForJob: () => Effect.succeed(undefined),
    runnerFor: () => Effect.succeed("rnr_fixture"), dispatch: () => Effect.succeed(JobOutcome.make({ status: "succeeded",
      ...(success ? {} : { stopReason: "refusal" }), startedAtMs: 0, finishedAtMs: 1, output: { ok: true } })) }
  const args = { jobId: "job_railfixture00001", listing, seller, input: {}, verified, lineage: ROOT_LINEAGE("job_railfixture00001"), ...(override ? { rail: extra } : {}) }
  const result = await Effect.runPromise(Effect.gen(function* () {
    const provided = yield* RailTag
    const outcome = yield* runJob(args)
    const store = yield* StoreTag
    return { outcome, receipts: yield* store.allReceipts, defaultIdentity: provided === fallback }
  }).pipe(Effect.provide(Layer.mergeAll(StoreLive, railsLayerFrom(fallback, [extra]), Layer.succeed(BrokerTag, broker)))))
  return { ...result, fallback: Effect.runSync(Ref.get(fallbackState)), extra: Effect.runSync(Ref.get(extraState)) }
}
describe("pipeline rail selection without session accounting", () => {
  it("uses the explicitly supplied rail for settlement and receipt, not the default", async () => {
    const r = await run(true)
    expect(r.defaultIdentity).toBe(true); expect(r.outcome.receipt).toMatchObject({ rail: "gateway", settled: true })
    expect(r.receipts).toHaveLength(1); expect(r.receipts[0]!.rail).toBe("gateway")
    expect(r.fallback.settlements).toHaveLength(0); expect(r.extra.settlements).toHaveLength(1)
    expect(r.fallback.balances.get(account.address.toLowerCase())).toBe(100000n)
    expect(r.extra.balances.get(account.address.toLowerCase())).toBe(90000n)
    expect(r.outcome.receipt).not.toHaveProperty("sessionId")
  })
  it("keeps the exact default for ordinary root callers", async () => {
    const r = await run(false)
    expect(r.defaultIdentity).toBe(true); expect(r.outcome.receipt).toMatchObject({ rail: "test", settled: true })
    expect(r.fallback.settlements).toHaveLength(1); expect(r.extra.settlements).toHaveLength(0)
  })
  it("records the chosen rail but settles neither rail for failed output", async () => {
    const r = await run(true, false)
    expect(r.outcome.receipt).toMatchObject({ rail: "gateway", settled: false })
    expect(r.fallback.settlements).toHaveLength(0); expect(r.extra.settlements).toHaveLength(0)
  })
})
