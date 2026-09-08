import { describe, expect, it } from "vitest"
import { Effect, Exit, Layer, Ref } from "effect"
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
/** Different outcomes for different skills — needed once a test dispatches both the root and the child. */
const stubBySkill = (bySkill: Record<string, JobOutcome>): Broker => ({
  register: () => Effect.void,
  unregister: () => Effect.void,
  dispatch: (args) => Effect.succeed(bySkill[args.skillId] ?? ok),
  complete: () => Effect.void,
  runnerFor: () => Effect.succeed("r"),
  runnerForJob: () => Effect.succeed("r")
})
/** A broker whose dispatch dies before ever producing an outcome — the pre-`finish` defect the crash net exists for. */
const dyingBroker: Broker = {
  register: () => Effect.void,
  unregister: () => Effect.void,
  dispatch: () => Effect.die(new Error("boom")),
  complete: () => Effect.void,
  runnerFor: () => Effect.succeed("r"),
  runnerForJob: () => Effect.succeed("r")
}

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

  it("releases the reservation when the child does not settle (outcome failed) — the root's tree comes back empty", async () => {
    const stateRef = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 10_000_000n })))
    const rail = makeTestRail(stateRef)
    const failed = JobOutcome.make({ status: "failed", startedAtMs: 0, finishedAtMs: 1, error: "boom" })
    const layer = Layer.mergeAll(StoreLive, Layer.succeed(RailTag, rail), Layer.succeed(BrokerTag, stubBySkill({ child: failed })))
    const out = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const store = yield* StoreTag
      const rootId = "job_rootfailed00000a", childId = "job_childfailed0000a"
      const rootLineage = ROOT_LINEAGE(rootId)
      yield* store.reserveTree(rootId, childId, parsePrice("$0.01"), parsePrice("$0.05"))
      const c = yield* runJob({ jobId: childId, listing: child, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.01"))), lineage: childLineage({ ...rootLineage, skillId: "parent" }, rootId) })
      const r = yield* runJob({ jobId: rootId, listing: root, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.25"))), lineage: rootLineage })
      const st = yield* store.treeState(rootId)
      return { c, r, st }
    }), layer))
    expect(out.c.receipt.settled).toBe(false)
    expect(out.st.reservedAtomic).toBe(0n)
    expect(out.st.committedAtomic).toBe(0n)
    expect(out.r.receipt.children).toEqual([])
  })

  it("releases the reservation when the child's outcome succeeds but the rail settle fails", async () => {
    const stateRef = Effect.runSync(
      Ref.make({ ...makeTestState({ [buyer.address]: 10_000_000n }), failSettlement: true })
    )
    const rail = makeTestRail(stateRef)
    const layer = Layer.mergeAll(StoreLive, Layer.succeed(RailTag, rail), Layer.succeed(BrokerTag, stub(ok)))
    const out = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const store = yield* StoreTag
      const rootId = "job_rootsettlefail0a", childId = "job_childsettlefail0"
      const rootLineage = ROOT_LINEAGE(rootId)
      yield* store.reserveTree(rootId, childId, parsePrice("$0.01"), parsePrice("$0.05"))
      const c = yield* runJob({ jobId: childId, listing: child, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.01"))), lineage: childLineage({ ...rootLineage, skillId: "parent" }, rootId) })
      const st = yield* store.treeState(rootId)
      return { c, st }
    }), layer))
    expect(out.c.receipt.settled).toBe(false)
    expect(out.c.receipt.settleTx).toBeUndefined()
    // Nothing was broadcast, so the buyer really was not charged and the receipt may say so.
    expect(out.c.receipt.unresolvedSettleTx).toBeUndefined()
    expect(out.c.receipt.reason).not.toMatch(/unconfirmed/)
    expect(out.st.reservedAtomic).toBe(0n)
    expect(out.st.committedAtomic).toBe(0n)
  })

  it("records a broadcast-but-unreadable settlement as unknown rather than as 'not charged'", async () => {
    /*
     * The live eip3009 rail gives up reading the receipt after a bounded number of polls
     * and fails with the transaction hash attached, because the transaction IS on the wire.
     * That receipt must not carry the same "you were not charged" meaning as a settle that
     * never broadcast: the buyer's USDC may already have moved.
     */
    const txHash = `0x${"ab".repeat(32)}`
    const stateRef = Effect.runSync(
      Ref.make({ ...makeTestState({ [buyer.address]: 10_000_000n }), failSettlement: true, failSettlementTxHash: txHash })
    )
    const rail = makeTestRail(stateRef)
    const layer = Layer.mergeAll(StoreLive, Layer.succeed(RailTag, rail), Layer.succeed(BrokerTag, stub(ok)))
    const out = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const store = yield* StoreTag
      const rootId = "job_rootunconfirmed0a", childId = "job_childunconfirmed0"
      const rootLineage = ROOT_LINEAGE(rootId)
      yield* store.reserveTree(rootId, childId, parsePrice("$0.01"), parsePrice("$0.05"))
      const c = yield* runJob({ jobId: childId, listing: child, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.01"))), lineage: childLineage({ ...rootLineage, skillId: "parent" }, rootId) })
      const st = yield* store.treeState(rootId)
      return { c, st }
    }), layer))
    expect(out.c.receipt.settled).toBe(false)
    // Never presented as proof of payment: settleTx stays absent, so nothing downstream
    // that gates on it will release the paid output.
    expect(out.c.receipt.settleTx).toBeUndefined()
    expect(out.c.receipt.unresolvedSettleTx).toBe(txHash)
    expect(out.c.receipt.reason).toContain("unconfirmed")
    expect(out.c.receipt.reason).toContain(txHash)
    expect(out.c.receipt.reason).not.toContain("you were not charged")
    // The reservation still releases: an unconfirmed settlement must not hold budget.
    expect(out.st.reservedAtomic).toBe(0n)
    expect(out.st.committedAtomic).toBe(0n)
  })

  it("releases the reservation when the child's dispatch dies before `finish` ever runs", async () => {
    const stateRef = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 10_000_000n })))
    const rail = makeTestRail(stateRef)
    const layer = Layer.mergeAll(StoreLive, Layer.succeed(RailTag, rail), Layer.succeed(BrokerTag, dyingBroker))
    const rootId = "job_rootcrash00000a0", childId = "job_childcrash00000a"
    const rootLineage = ROOT_LINEAGE(rootId)
    const out = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const store = yield* StoreTag
      yield* store.reserveTree(rootId, childId, parsePrice("$0.01"), parsePrice("$0.05"))
      const verified = yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.01")))
      const exit = yield* Effect.exit(
        runJob({
          jobId: childId,
          listing: child,
          seller: SELLER,
          input: {},
          verified,
          lineage: childLineage({ ...rootLineage, skillId: "parent" }, rootId)
        })
      )
      const st = yield* store.treeState(rootId)
      return { exit, st }
    }), layer))
    expect(Exit.isFailure(out.exit)).toBe(true)
    expect(out.st.reservedAtomic).toBe(0n)
    expect(out.st.committedAtomic).toBe(0n)
  })
})
