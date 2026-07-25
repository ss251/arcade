import { describe, expect, it } from "vitest"
import { Effect, Layer, Ref } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import {
  ARC_CAIP2,
  Bounds,
  JobOutcome,
  PublicListing,
  parsePrice
} from "@arcade/core"
import {
  PaymentPayload,
  RailTag,
  makeTestRail,
  makeTestState,
  signAuthorization,
  type VerifiedPayment
} from "@arcade/payments"
import { BrokerTag, type Broker } from "../src/broker.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { runJob } from "../src/pipeline.ts"

/**
 * D2 END TO END, offline.
 *
 * Every way a job can fail must leave the buyer's balance untouched and produce an honest
 * unsettled receipt. Running this against `RailTest` means we assert real balance movement
 * (and real NON-movement) without a chain, a faucet, or a network.
 */

const buyer = privateKeyToAccount(generatePrivateKey())
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const PRICE = parsePrice("$0.25")
const START = 10_000_000n

const listing = PublicListing.make({
  id: "demo-skill",
  version: "1.0.0",
  serviceName: "Demo",
  description: "d",
  tags: [],
  price: "$0.25",
  bounds: Bounds.make({ timeoutSec: 5 }),
  inputSchema: { type: "object" },
  outputSchema: { type: "object", required: ["ok"] }
})

/** A broker that returns a scripted outcome instead of talking to a real runner. */
const stubBroker = (outcome: JobOutcome): Broker => ({
  register: () => Effect.void,
  unregister: () => Effect.void,
  dispatch: () => Effect.succeed(outcome),
  complete: () => Effect.void,
  runnerFor: () => Effect.succeed("rnr_test")
})

const setup = async (outcome: JobOutcome) => {
  const stateRef = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: START })))
  const rail = makeTestRail(stateRef)

  const signed = await Effect.runPromise(
    signAuthorization({ account: buyer, to: SELLER, valueAtomic: PRICE })
  )
  const payload = PaymentPayload.make({
    x402Version: 2,
    scheme: "exact",
    network: ARC_CAIP2,
    payload: signed
  })
  const requirements = await Effect.runPromise(
    rail.challenge({ priceAtomic: PRICE, resource: "/x/s/demo-skill", payTo: SELLER })
  )
  const verified: VerifiedPayment = await Effect.runPromise(rail.verify(payload, requirements))

  const layer = Layer.mergeAll(
    StoreLive,
    Layer.succeed(RailTag, rail),
    Layer.succeed(BrokerTag, stubBroker(outcome))
  )

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const out = yield* runJob({
        jobId: "job_testtesttesttest01",
        listing,
        seller: SELLER,
        input: {},
        verified
      })
      const store = yield* StoreTag
      const receipts = yield* store.allReceipts
      return { out, receipts }
    }).pipe(Effect.provide(layer))
  )

  const state = Effect.runSync(Ref.get(stateRef))
  return { ...result, state }
}

const outcome = (over: Partial<Parameters<typeof JobOutcome.make>[0]>) =>
  JobOutcome.make({
    status: "succeeded",
    output: { ok: true },
    startedAtMs: 0,
    finishedAtMs: 10,
    ...over
  } as Parameters<typeof JobOutcome.make>[0])

describe("hub settle pipeline", () => {
  it("settles a clean success and moves exactly the price", async () => {
    const { out, state } = await setup(outcome({}))
    expect(out.receipt.settled).toBe(true)
    expect(out.receipt.settleTx).toBeDefined()
    expect(state.balances.get(buyer.address.toLowerCase())).toBe(START - PRICE)
    expect(state.balances.get(SELLER.toLowerCase())).toBe(PRICE)
    // Take-rate is exact and visible.
    expect(out.receipt.sellerAtomic + out.receipt.feeAtomic).toBe(out.receipt.priceAtomic)
    expect(out.receipt.feeAtomic).toBe(12_500n)
  })

  it.each([
    ["engine refusal", outcome({ stopReason: "refusal" }), "refused"],
    ["timeout", outcome({ status: "timeout" }), "timeout"],
    ["bounds exceeded", outcome({ status: "bounds_exceeded" }), "bounds"],
    ["runner lost", outcome({ status: "runner_lost" }), "runner_lost"],
    ["empty output", outcome({ output: {} }), "empty"],
    ["null output", outcome({ output: null }), "empty"],
    ["schema-invalid output", outcome({ output: { nope: 1 } }), "outputSchema"]
  ])("does NOT settle on %s — buyer balance untouched", async (_label, o) => {
    const { out, state } = await setup(o)
    expect(out.receipt.settled).toBe(false)
    expect(out.receipt.settleTx).toBeUndefined()
    // THE invariant: a failed job costs the buyer nothing.
    expect(state.balances.get(buyer.address.toLowerCase())).toBe(START)
    expect(state.balances.get(SELLER.toLowerCase())).toBeUndefined()
    expect(state.settlements).toHaveLength(0)
  })

  it("writes an honest receipt even when it does not settle", async () => {
    const { out, receipts } = await setup(outcome({ stopReason: "refusal" }))
    expect(receipts).toHaveLength(1)
    expect(out.receipt.reason).toContain("refused")
    // The receipt still records what WOULD have been charged — auditable, not hidden.
    expect(out.receipt.priceAtomic).toBe(PRICE)
  })

  it("does not attach a fee accrual id to an unsettled receipt", async () => {
    const { out } = await setup(outcome({ status: "failed" }))
    expect(out.receipt.feeAccrualId).toBeUndefined()
  })
})
