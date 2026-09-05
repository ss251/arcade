import { describe, expect, it } from "vitest"
import { Effect, Layer, Ref } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { Bounds, JobOutcome, PublicListing, ROOT_LINEAGE, loadChainConfig, parsePrice, type Receipt } from "@arcade/core"
import { PaymentPayload, RailTag, makeTestRail, makeTestState, signAuthorization } from "@arcade/payments"
import { BrokerTag, type Broker } from "../src/broker.ts"
import { StoreLive, StoreTag, type Store } from "../src/store.ts"
import { AttestTag, type Attest, type AttestJob } from "../src/attest.ts"
import { runJob } from "../src/pipeline.ts"

// Entirely simulated payment test fixture; no RPC, environment key or registry writer.
const buyer = privateKeyToAccount(`0x${"1".repeat(64)}`)
const seller = `0x${"2".repeat(40)}`, payTo = `0x${"3".repeat(40)}`
const chain = loadChainConfig("arc-testnet"), price = parsePrice("$0.25")
const jobId = "job_attesttesttesttest01"
const listing = PublicListing.make({ id: "pipeline-attest", version: "1.0.0", serviceName: "A", description: "d", tags: [],
  price: "$0.25", bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: { type: "object" },
  outputSchema: { type: "object", required: ["ok"] } })
const outcome = (success = true) => JobOutcome.make({ status: "succeeded", stopReason: "end_turn",
  output: success ? { ok: true } : { nope: true }, startedAtMs: 0, finishedAtMs: 1 })
const broker = (o: JobOutcome): Broker => ({ register: () => Effect.void, unregister: () => Effect.void,
  dispatch: () => Effect.succeed(o), complete: () => Effect.void, runnerFor: () => Effect.succeed("r"),
  runnerForJob: () => Effect.succeed("r") })
const run = Effect.runPromise

const setup = async (options: { success?: boolean; testRail?: boolean; omitArgs?: boolean; absentService?: boolean;
  onTerminal?: Attest["onTerminal"]; store?: (store: Store) => Store } = {}) => {
  const state = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 1_000_000n })))
  const rail = makeTestRail(state)
  const signed = await run(signAuthorization({ account: buyer, to: payTo, valueAtomic: price }))
  const req = await run(rail.challenge({ priceAtomic: price, resource: "/x", payTo }))
  const { signature, ...authorization } = signed
  const verified = await run(rail.verify(PaymentPayload.make({ x402Version: 2, payload: { authorization, signature }, accepted: req }), req))
  const store = await run(Effect.provide(StoreTag, StoreLive))
  const seen: AttestJob[] = [], recorded: Receipt[][] = []
  const service: Attest = { onTerminal: options.onTerminal ?? (job => Effect.gen(function* () {
    recorded.push([...(yield* store.allReceipts)]); seen.push(job)
  })), idle: Effect.void }
  const base = Layer.mergeAll(Layer.succeed(StoreTag, options.store?.(store) ?? store),
    // Named production only at the injected contract boundary to exercise its opt-in;
    // balances and transaction outcomes are still exclusively makeTestRail simulations.
    Layer.succeed(RailTag, { ...rail, name: options.testRail ? "test" as const : "eip3009" as const }),
    Layer.succeed(BrokerTag, broker(outcome(options.success))))
  const layers = options.absentService ? base : Layer.mergeAll(base, Layer.succeed(AttestTag, service))
  const result = await run(Effect.either(runJob({ jobId, listing, seller, input: { private: "payload" }, verified,
    lineage: ROOT_LINEAGE(jobId), canary: true,
    ...(options.omitArgs ? {} : { attest: { agentId: "42", payTo, origin: "https://hub.example", chainId: chain.chainId,
      identityRegistry: chain.erc8004!.identity } })
  }).pipe(Effect.provide(layers))))
  return { result, seen, recorded, receipts: await run(store.allReceipts), state: Effect.runSync(Ref.get(state)) }
}

describe("receipt-first attestation hook", () => {
  it("enqueues the exact terminal facts only after durable receipt persistence", async () => {
    const out = await setup()
    expect(out.result._tag).toBe("Right"); expect(out.seen).toHaveLength(1); expect(out.recorded[0]).toHaveLength(1)
    const receipt = out.receipts[0]!
    expect(out.seen[0]).toMatchObject({ jobId: receipt.jobId, agentId: "42", skillId: listing.id,
      skillVersion: listing.version, buyer: buyer.address, seller, payTo, settled: true, settleTx: receipt.settleTx,
      priceAtomic: receipt.priceAtomic, createdAtMs: receipt.createdAtMs, reason: receipt.reason,
      input: { private: "payload" }, output: { ok: true }, outputSchema: listing.outputSchema })
    expect(receipt.canary).toBe(true); expect(receipt.rootJobId).toBe(jobId); expect(receipt.hop).toBe(0)
    expect(out.state.settlements).toHaveLength(1)
  })
  it("enqueues a failed terminal verdict without fabricating a payment", async () => {
    const out = await setup({ success: false })
    expect(out.seen[0]).toMatchObject({ settled: false })
    expect(out.seen[0]?.settleTx).toBeUndefined(); expect(out.state.settlements).toHaveLength(0)
    expect(out.receipts[0]!.settled).toBe(false)
  })
  it.each([{ omitArgs: true }, { absentService: true }, { testRail: true }])("leaves the normal or simulated path untouched: %j", async options => {
    const out = await setup(options)
    expect(out.seen).toHaveLength(0); expect(out.receipts[0]!.settled).toBe(true); expect(out.state.settlements).toHaveLength(1)
  })
  it.each([() => { throw new Error("PRIVATE_SYNC") }, () => Effect.die("PRIVATE_DEFECT"), () => Effect.never])(
    "a broken or stalled queue never changes settlement or leaves the caller hanging", async onTerminal => {
      const started = Date.now()
      const out = await setup({ onTerminal })
      expect(Date.now() - started).toBeLessThan(1000)
      expect(out.result._tag).toBe("Right"); expect(out.receipts[0]!.settled).toBe(true)
      expect(out.receipts[0]!.reason).toBe("ok"); expect(out.state.settlements).toHaveLength(1)
    })
  it("does not enqueue when the receipt cannot be persisted", async () => {
    let queued = 0
    await expect(setup({ onTerminal: () => Effect.sync(() => { queued++ }), store: store => ({ ...store,
      putReceipt: () => Effect.die("disk failed") }) })).rejects.toThrow()
    expect(queued).toBe(0)
  })
})
