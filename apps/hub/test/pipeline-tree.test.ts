import { describe, expect, it } from "vitest"
import { Effect, Layer, Ref } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { Bounds, JobOutcome, PublicListing, ROOT_LINEAGE, childLineage, parsePrice, treeHashOf } from "@arcade/core"
import { PaymentPayload, RailTag, makeTestRail, makeTestState, signAuthorization } from "@arcade/payments"
import { BrokerTag, type Broker } from "../src/broker.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { runJob } from "../src/pipeline.ts"

const buyer = privateKeyToAccount(generatePrivateKey())
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const root = PublicListing.make({ id: "parent", version: "1.0.0", serviceName: "P", description: "d", tags: [], price: "$0.25", bounds: Bounds.make({ timeoutSec: 5, maxSubSpendUsd: 0.05 }), inputSchema: { type: "object" }, outputSchema: { type: "object", required: ["ok"] } })
const child = PublicListing.make({ ...root, id: "child", price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }) })
const ok = JobOutcome.make({ status: "succeeded", stopReason: "end_turn", output: { ok: true }, startedAtMs: 0, finishedAtMs: 1 })
const stub = (o: JobOutcome): Broker => ({ register: () => Effect.void, unregister: () => Effect.void, dispatch: () => Effect.succeed(o), complete: () => Effect.void, runnerFor: () => Effect.succeed("r"), runnerForJob: () => Effect.succeed("r") })

const verifiedFor = async (rail: ReturnType<typeof makeTestRail>, price: bigint) => {
  const signed = await Effect.runPromise(signAuthorization({ account: buyer, to: SELLER, valueAtomic: price }))
  const req = await Effect.runPromise(rail.challenge({ priceAtomic: price, resource: "/x", payTo: SELLER }))
  const { signature, ...authorization } = signed
  return Effect.runPromise(rail.verify(PaymentPayload.make({ x402Version: 2, payload: { authorization, signature }, accepted: req }), req))
}

describe("receipt tree", () => {
  it("root receipt lists the settled child and commits the tree hash", async () => {
    const stateRef = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 10_000_000n })))
    const rail = makeTestRail(stateRef)
    const layer = Layer.mergeAll(StoreLive, Layer.succeed(RailTag, rail), Layer.succeed(BrokerTag, stub(ok)))
    const out = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const store = yield* StoreTag
      const rootId = "job_root000000000000", childId = "job_child00000000000"
      const rootLineage = ROOT_LINEAGE(rootId)
      yield* store.reserveTree(rootId, childId, parsePrice("$0.01"), parsePrice("$0.05"))
      const c = yield* runJob({ jobId: childId, listing: child, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.01"))), lineage: childLineage({ ...rootLineage, skillId: "parent" }, rootId) })
      const r = yield* runJob({ jobId: rootId, listing: root, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.25"))), lineage: rootLineage })
      const st = yield* store.treeState(rootId)
      return { c, r, st }
    }), layer))
    expect(out.c.receipt.settled).toBe(true)
    expect(out.st.committedAtomic).toBe(10_000n)
    expect(out.r.receipt.children?.[0]).toMatchObject({ jobId: "job_child00000000000", settled: true })
    expect(out.r.receipt.treeHash).toBe(treeHashOf("job_root000000000000", out.r.receipt.children!))
    expect(out.r.receipt.treeCommittedAtomic).toBe(10_000n)
  })
})
