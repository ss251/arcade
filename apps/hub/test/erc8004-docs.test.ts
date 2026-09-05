import { describe, expect, it, vi } from "vitest"
import { Effect, Layer } from "effect"
import { docBytes, docHash, buildValidationRequest, buildValidationResponse, buildFeedback, loadChainConfig } from "@arcade/core"
import { Erc8004Tag, noopErc8004, type Erc8004 } from "../src/erc8004.ts"
import { AttestLive, AttestTag, makeAttest, processOne, type AttestJob } from "../src/attest.ts"
import { StoreLive, StoreTag, type Erc8004DocKind } from "../src/store.ts"

const address = (s: string) => `0x${s.repeat(40)}`, hash = (s: string) => `0x${s.repeat(64)}`
const chain = loadChainConfig("arc-testnet")
const job: AttestJob = { jobId: "job_documents", agentId: "42", skillId: "doc-test", skillVersion: "1.0.0",
  seller: address("1"), buyer: address("2"), payTo: address("3"), origin: "https://hub.example",
  input: { secret: "INPUT_PRIVATE" }, output: { secret: "OUTPUT_PRIVATE" }, outputSchema: { type: "object" },
  status: "succeeded", stopReason: "end_turn", settled: true, reason: "PRIVATE_REASON", priceAtomic: 10_000n,
  settleTx: hash("a"), createdAtMs: 1760000000000, chainId: chain.chainId, identityRegistry: chain.erc8004!.identity }
const run = Effect.runPromise
const setup = async () => {
  const store = await run(StoreTag.pipe(Effect.provide(StoreLive))), calls: string[] = []
  const committed: Record<string, string> = {}
  const capture = (kind: Erc8004DocKind, expected: string) => Effect.gen(function* () {
    calls.push(kind)
    const bytes = yield* store.getErc8004Doc(job.jobId, kind)
    expect(bytes).toBeDefined(); expect(docHash(JSON.parse(bytes!))).toBe(expected)
    expect(bytes).toBe(docBytes(JSON.parse(bytes!))); committed[kind] = bytes!
    return hash("b")
  })
  const erc: Erc8004 = { ...noopErc8004("off"), armed: true, registries: chain.erc8004!,
    addresses: { operator: address("4"), validator: address("5"), attester: address("6") }, ownerOf: () => Effect.succeed(job.seller),
    requestValidation: args => capture("validation-request", args.requestHash),
    respondValidation: args => capture("validation-response", args.responseHash),
    giveFeedback: args => capture("feedback", args.feedbackHash) }
  return { store, erc, calls, committed }
}
describe("persist exact committed bytes before registry writes", () => {
  it("persists all three immutable documents before the first broadcast", async () => {
    const { store, erc, calls, committed } = await setup()
    const writes: Erc8004DocKind[] = []
    const sink = (id: string, kind: Erc8004DocKind, bytes: string) => {
      expect(calls).toHaveLength(0); writes.push(kind); return store.putErc8004Doc(id, kind, bytes)
    }
    expect((await run(processOne(erc, job, sink))).errors).toEqual([])
    expect(writes).toEqual(["validation-request", "validation-response", "feedback"])
    expect(calls).toEqual(writes)
    const request = buildValidationRequest({ ...job, agentId: job.agentId! })
    const response = buildValidationResponse({ ...job, requestHash: docHash(request), decidedAtMs: job.createdAtMs })
    const feedback = buildFeedback({ ...job, agentId: job.agentId!, settleTx: job.settleTx!, attester: erc.addresses.attester })
    expect(committed).toEqual({ "validation-request": docBytes(request), "validation-response": docBytes(response), feedback: docBytes(feedback) })
    expect(JSON.stringify(committed)).not.toMatch(/INPUT_PRIVATE|OUTPUT_PRIVATE|PRIVATE_REASON/)
  })
  it.each(["validation-request", "validation-response", "feedback"] as const)("a persistence failure at %s prevents all broadcasts", async failAt => {
    const { store, erc, calls } = await setup()
    const out = await run(processOne(erc, job, (id, kind, bytes) => kind === failAt ? Effect.die("PRIVATE_DISK") : store.putErc8004Doc(id, kind, bytes)))
    expect(calls).toEqual([]); expect(out.errors).toHaveLength(1); expect(JSON.stringify(out)).not.toContain("PRIVATE_DISK")
  })
  it("contains synchronous sink throws and refuses immutable conflicts before any chain write", async () => {
    const { store, erc, calls } = await setup()
    expect((await run(processOne(erc, job, () => { throw new Error("PRIVATE_SINK") }))).errors).toHaveLength(1)
    await run(store.putErc8004Doc(job.jobId, "validation-response", '{"different":true}'))
    const out = await run(processOne(erc, job, store.putErc8004Doc))
    expect(out.errors).toHaveLength(1); expect(calls).toEqual([])
    expect(await run(store.getErc8004Doc(job.jobId, "validation-response"))).toBe('{"different":true}')
  })
  it("persists failure documents without feedback or a invented payment", async () => {
    const { store, erc, calls } = await setup()
    expect((await run(processOne(erc, { ...job, settled: false, settleTx: undefined }, store.putErc8004Doc))).errors).toEqual([])
    expect(calls).toEqual(["validation-request", "validation-response"])
    expect(await run(store.getErc8004Doc(job.jobId, "feedback"))).toBeUndefined()
  })
  it("wires the same sink into the scoped worker", async () => {
    const { store, erc, calls } = await setup()
    await run(Effect.scoped(Effect.gen(function* () {
      const attest = yield* makeAttest(erc, store.putErc8004Doc)
      yield* attest.onTerminal(job); yield* attest.idle
    })))
    expect(calls).toEqual(["validation-request", "validation-response", "feedback"])
  })
  it("the production layer consumes the provided store rather than an independent memory store", async () => {
    const { store, erc, calls } = await setup()
    await run(Effect.gen(function* () {
      const attest = yield* AttestTag
      yield* attest.onTerminal(job); yield* attest.idle
    }).pipe(Effect.provide(AttestLive.pipe(Layer.provide(Layer.merge(
      Layer.succeed(StoreTag, store), Layer.succeed(Erc8004Tag, erc)))))))
    expect(calls).toEqual(["validation-request", "validation-response", "feedback"])
  })
  it("bounds a stalled sink before broadcasts and preserves cancellation", async () => {
    const { erc, calls } = await setup()
    vi.useFakeTimers()
    try {
      const pending = run(processOne(erc, job, () => Effect.never))
      await vi.advanceTimersByTimeAsync(5001)
      expect((await pending).errors).toHaveLength(1); expect(calls).toEqual([])
    } finally { vi.useRealTimers() }
    expect((await run(Effect.exit(processOne(erc, job, () => Effect.interrupt))))._tag).toBe("Failure")
    expect(calls).toEqual([])
  })
})
