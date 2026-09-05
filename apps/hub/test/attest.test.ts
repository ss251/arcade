import { describe, expect, it, vi } from "vitest"
import { Deferred, Effect, Fiber } from "effect"
import { buildValidationRequest, docHash, loadChainConfig } from "@arcade/core"
import { Erc8004Failed, noopErc8004, type Erc8004 } from "../src/erc8004.ts"
import { makeAttest, processOne, type AttestJob } from "../src/attest.ts"

const address = (s: string) => `0x${s.repeat(40)}`
const hash = (s: string) => `0x${s.repeat(64)}`
const chain = loadChainConfig("arc-testnet")
const job = (over: Partial<AttestJob> = {}): AttestJob => ({
  jobId: "job_abc", agentId: "42", skillId: "diff-triage", skillVersion: "1.0.0",
  seller: address("1"), buyer: address("2"), payTo: address("3"), origin: "https://hub.example",
  input: { secret: "INPUT_PRIVATE" }, output: { text: "OUTPUT_PRIVATE" }, outputSchema: { type: "object" },
  status: "succeeded", stopReason: "end_turn", settled: true, reason: "PRIVATE_DIAGNOSTIC",
  priceAtomic: 10_000n, settleTx: hash("a"), createdAtMs: 1_760_000_000_000,
  chainId: chain.chainId, identityRegistry: chain.erc8004!.identity, ...over
})
const spy = (over: Partial<Erc8004> = {}) => {
  const calls: { op: string; args: unknown }[] = []
  const svc: Erc8004 = { ...noopErc8004("off"), armed: true,
    addresses: { operator: address("4"), validator: address("5"), attester: address("6") }, registries: chain.erc8004!,
    ownerOf: () => Effect.succeed(address("1")),
    requestValidation: args => Effect.sync(() => { calls.push({ op: "request", args }); return hash("b") }),
    respondValidation: args => Effect.sync(() => { calls.push({ op: "response", args }); return hash("c") }),
    giveFeedback: args => Effect.sync(() => { calls.push({ op: "feedback", args }); return hash("d") }), ...over }
  return { svc, calls }
}
const run = Effect.runPromise

describe("best-effort registry processing", () => {
  it.each([() => Effect.succeed(address("9")), () => Effect.succeed("invalid"),
    () => Effect.fail(new Erc8004Failed({ op: "ownerOf", reason: "PRIVATE_RPC" })),
    () => { throw new Error("PRIVATE_THROW") }])("requires a fresh seller ownership check before every job's writes", async ownerOf => {
    const { svc, calls } = spy({ ownerOf })
    const out = await run(processOne(svc, job()))
    expect(calls).toHaveLength(0)
    expect(out.errors.length + Number(out.skipped !== undefined)).toBeGreaterThan(0)
    expect(JSON.stringify(out)).not.toContain("PRIVATE")
  })
  it("bounds unavailable current ownership without broadcasting", async () => {
    vi.useFakeTimers()
    try {
      const { svc, calls } = spy({ ownerOf: () => Effect.never })
      const pending = run(processOne(svc, job()))
      await vi.advanceTimersByTimeAsync(5001)
      expect((await pending).errors.length).toBeGreaterThan(0)
      expect(calls).toHaveLength(0)
    } finally { vi.useRealTimers() }
  })
  it("writes request, response100 and settled feedback in order with exact commitments", async () => {
    const { svc, calls } = spy()
    expect(await run(processOne(svc, job()))).toEqual({ requestTx: hash("b"), responseTx: hash("c"), feedbackTx: hash("d"), errors: [] })
    expect(calls.map(c => c.op)).toEqual(["request", "response", "feedback"])
    expect(calls[0]!.args).toEqual({ agentId: "42", requestURI: "https://hub.example/receipts/job_abc/validation-request.json",
      requestHash: docHash(buildValidationRequest({ ...job(), agentId: "42" })) })
    expect(calls[1]!.args).toMatchObject({ response: 100 })
    expect(JSON.stringify(calls)).not.toMatch(/INPUT_PRIVATE|OUTPUT_PRIVATE|PRIVATE_DIAGNOSTIC/)
  })
  it("answers0 and never vouches for an unsettled receipt", async () => {
    const { svc, calls } = spy()
    const out = await run(processOne(svc, job({ settled: false, status: "invalid", settleTx: undefined })))
    expect(calls.map(c => c.op)).toEqual(["request", "response"])
    expect(calls[1]!.args).toMatchObject({ response: 0 }); expect(out.feedbackTx).toBeUndefined()
  })
  it.each([undefined, "", "not-a-chain-hash"])("does not attest a settled claim without a genuine transaction hash: %s", async settleTx => {
    const { svc, calls } = spy()
    const out = await run(processOne(svc, job({ settleTx })))
    expect(calls).toHaveLength(0); expect(out.errors.length + Number(out.skipped !== undefined)).toBeGreaterThan(0)
  })
  it("does not answer a request which never confirmed, and does not leak provider diagnostics", async () => {
    const fail = vi.fn(() => new Erc8004Failed({ op: "request", reason: "PRIVATE_RPC_KEY", retryable: false }))
    const { svc, calls } = spy({ requestValidation: fail })
    const out = await run(processOne(svc, job()))
    expect(fail).toHaveBeenCalledTimes(1); expect(calls).toHaveLength(0)
    expect(out.errors).toHaveLength(1); expect(JSON.stringify(out)).not.toContain("PRIVATE_RPC_KEY")
  })
  it.each([false, undefined])("does not retry an uncertain/unspecified send: %s", async retryable => {
    const fail = vi.fn(() => new Erc8004Failed({ op: "write", reason: "unknown", ...(retryable === undefined ? {} : { retryable }) }))
    const { svc } = spy({ giveFeedback: fail })
    const out = await run(processOne(svc, job()))
    expect(fail).toHaveBeenCalledTimes(1); expect(out.responseTx).toBe(hash("c")); expect(out.errors).toHaveLength(1)
  })
  it("retries a declared safe failure exactly once, by invoking the operation again", async () => {
    const fail = vi.fn(() => new Erc8004Failed({ op: "write", reason: "safe preflight", retryable: true }))
    const { svc } = spy({ giveFeedback: fail })
    expect((await run(processOne(svc, job()))).errors).toHaveLength(1); expect(fail).toHaveBeenCalledTimes(2)
  })
  it("a failed response cannot fabricate success but does not erase actual payment feedback", async () => {
    const { svc, calls } = spy({ respondValidation: () => new Erc8004Failed({ op: "response", reason: "failed", retryable: false }) })
    const out = await run(processOne(svc, job()))
    expect(out.responseTx).toBeUndefined(); expect(out.feedbackTx).toBe(hash("d")); expect(out.errors).toHaveLength(1)
    expect(calls.map(c => c.op)).toEqual(["request", "feedback"])
  })
  it("skips missing identities and unarmed hubs without inventing chain evidence", async () => {
    const { svc, calls } = spy()
    expect((await run(processOne(svc, job({ agentId: undefined })))).skipped).toMatch(/no agent/)
    expect((await run(processOne(noopErc8004("PRIVATE"), job())))).toEqual({ skipped: "hub is not armed for ERC-8004", errors: [] })
    expect(calls).toHaveLength(0)
  })
  it.each([() => { throw new Error("PRIVATE_SYNC") }, () => Effect.die("PRIVATE_DEFECT")])("contains synchronous defects", async fail => {
    const { svc } = spy({ requestValidation: fail })
    const out = await run(processOne(svc, job()))
    expect(out.errors).toHaveLength(1); expect(JSON.stringify(out)).not.toContain("PRIVATE")
  })
  it("rejects malformed document inputs and mismatched chain provenance before any write", async () => {
    const { svc, calls } = spy()
    for (const over of [{ input: { x: () => 1 } }, { agentId: "-1" }, { chainId: 1 }, { identityRegistry: address("7") }]) {
      expect((await run(processOne(svc, job(over)))).errors).toHaveLength(1)
    }
    expect(calls).toHaveLength(0)
  })
  it("preserves cancellation rather than turning it into retryable failure", async () => {
    const { svc } = spy({ requestValidation: () => Effect.interrupt })
    expect((await run(Effect.exit(processOne(svc, job()))))._tag).toBe("Failure")
  })
  it("bounds a stalled write and never retries its unknown outcome", async () => {
    vi.useFakeTimers()
    const send = vi.fn(() => Effect.never)
    try {
      const { svc } = spy({ requestValidation: send })
      const pending = run(processOne(svc, job()))
      await vi.advanceTimersByTimeAsync(90_001)
      const out = await pending
      expect(send).toHaveBeenCalledTimes(1)
      expect(out.errors).toHaveLength(1); expect(out.requestTx).toBeUndefined()
    } finally { vi.useRealTimers() }
  })
})

describe("bounded scoped attestation queue", () => {
  it("onTerminal returns before blocked writes, and idle waits until the last item completes", async () => {
    await run(Effect.scoped(Effect.gen(function* () {
      const released = yield* Deferred.make<void>()
      const started = yield* Deferred.make<void>()
      const { svc, calls } = spy()
      const service = { ...svc, requestValidation: (a: Parameters<Erc8004["requestValidation"]>[0]) =>
        Deferred.succeed(started, undefined).pipe(Effect.zipRight(Deferred.await(released)), Effect.zipRight(svc.requestValidation(a))) }
      const attest = yield* makeAttest(service)
      yield* attest.onTerminal(job())
      const idle = yield* Effect.fork(attest.idle)
      yield* Deferred.await(started)
      expect((yield* Fiber.poll(idle))._tag).toBe("None")
      yield* Deferred.succeed(released, undefined)
      yield* Fiber.join(idle)
      expect(calls.map(c => c.op)).toEqual(["request", "response", "feedback"])
    })))
  })
  it("survives a job defect and processes the next job", async () => {
    const { svc, calls } = spy()
    let attempts = 0
    await run(Effect.scoped(Effect.gen(function* () {
      const attest = yield* makeAttest({ ...svc, requestValidation: a => ++attempts === 1 ? Effect.die("PRIVATE") : svc.requestValidation(a) })
      yield* attest.onTerminal(job()); yield* attest.onTerminal(job({ jobId: "job_next" })); yield* attest.idle
    })))
    expect(attempts).toBe(2); expect(calls.map(c => c.op)).toEqual(["request", "response", "feedback"])
  })
  it("drops overflow without blocking producers or retaining unbounded jobs", async () => {
    const { svc } = spy()
    let writes = 0
    await run(Effect.scoped(Effect.gen(function* () {
      const released = yield* Deferred.make<void>()
      const started = yield* Deferred.make<void>()
      const attest = yield* makeAttest({ ...svc, requestValidation: a => Effect.gen(function* () {
        writes++; yield* Deferred.succeed(started, undefined); yield* Deferred.await(released); return yield* svc.requestValidation(a)
      }) })
      yield* attest.onTerminal(job()); yield* Deferred.await(started)
      for (let i = 0; i < 520; i++) yield* attest.onTerminal(job({ jobId: `job_${i}` }))
      yield* Deferred.succeed(released, undefined); yield* attest.idle
    })))
    expect(writes).toBe(513)
  })
  it("scope closure cancels a stalled worker without spinning or blocking shutdown", async () => {
    const started = await run(Deferred.make<void>())
    const { svc } = spy({ requestValidation: () => Deferred.succeed(started, undefined).pipe(Effect.zipRight(Effect.never)) })
    await run(Effect.scoped(Effect.gen(function* () {
      const attest = yield* makeAttest(svc); yield* attest.onTerminal(job()); yield* Deferred.await(started)
    })))
  })
  it("calls retained after scope closure return harmlessly without queuing new work", async () => {
    const { svc, calls } = spy()
    const attest = await run(Effect.scoped(makeAttest(svc)))
    await run(attest.onTerminal(job())); await run(attest.idle)
    expect(calls).toHaveLength(0)
  })
})
