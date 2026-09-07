import { afterEach, describe, expect, it } from "vitest"
import { Effect, Fiber, Ref, Schema } from "effect"
import { EscrowProviderRequest, hashJson, JobOutcome, type HubMessage } from "@arcade/core"
import { escrowActionContext, escrowBytes32, escrowContextToWire, setBudgetAuthorization, submitAuthorization } from "@arcade/payments"
import { fixture, provider } from "../../../packages/payments/test/fixtures/erc8183-action.ts"
import { makeBroker, type RunnerConn } from "../src/broker.ts"
const jobId = "job_" + "a".repeat(32)
const outcome = JobOutcome.make({ status: "succeeded", output: { ok: true }, startedAtMs: 1000000, finishedAtMs: 1000001 })
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const setup = async () => {
  const f = await fixture("budget"), context = escrowActionContext({ ...f.context, call: { ...f.context.call, inputHash: hashJson({}) } })
  let clock = 1000
  const broker = makeBroker(Effect.runSync(Ref.make({ conns: new Map(), routes: new Map(), waiters: new Map(), assigned: new Map() })), { nowSeconds: () => clock })
  const sent: HubMessage[] = [], connectionId = {}; let current = true
  const conn: RunnerConn = { runnerId: "r1", seller: provider.address, connectionId, isCurrent: () => current,
    send: m => { sent.push(m) }, close: () => { current = false } }
  await Effect.runPromise(broker.register(conn, ["skill"]))
  cleanup.push(() => Effect.runPromise(broker.unregister("r1")))
  const assign = () => Effect.runPromise(broker.dispatch({ jobId, skillId: "skill", skillVersion: "1.0.0", input: {},
    timeoutSec: 60, escrow: escrowContextToWire(context) }))
  return { broker, context, sent, conn, connectionId, assign, disconnect: () => { current = false }, clock: (n: number) => { clock = n } }
}
async function response(raw: unknown, context: Awaited<ReturnType<typeof setup>>["context"], changed: Record<string, unknown> = {}) {
  const request = Schema.decodeUnknownSync(EscrowProviderRequest)(raw)
  const base = { chainId: 5042002, escrow: context.call.escrow, signer: provider.address, jobId: context.jobId, nonce: 2n, deadline: 1600n }
  const typed = request._tag === "EscrowBudgetRequest" ? setBudgetAuthorization({ ...base, token: context.call.token, amount: context.call.amount }, 1000) :
    submitAuthorization({ ...base, deliverable: escrowBytes32(request.outputHash, false) }, 1000)
  return { _tag: request._tag === "EscrowBudgetRequest" ? "EscrowBudgetSigned" : "EscrowSubmitSigned", requestId: request.requestId,
    escrow: context.call.escrow, jobId: context.jobId.toString(), nonce: "2", deadline: "1600", signature: await provider.signTypedData(typed), ...changed }
}
describe("actual broker escrow ownership", () => {
  it("preserves the closed assignment and original owner after legacy result cleanup", async () => {
    const h = await setup(), work = h.assign()
    expect(h.sent[0]).toMatchObject({ _tag: "JobAssignment", escrow: escrowContextToWire(h.context) })
    await Effect.runPromise(h.broker.complete(jobId, outcome)); await work
    expect(await Effect.runPromise(h.broker.runnerForJob(jobId))).toBeUndefined()
    const pending = h.broker.escrow!.authorize(h.context, { kind: "submit", outputHash: hashJson(outcome.output) }, new AbortController().signal)
    await Promise.resolve()
    const request = h.sent.at(-1)!
    expect(request).toMatchObject({ _tag: "EscrowSubmitRequest", hubJobId: jobId })
    expect(await h.broker.escrow!.accept(h.connectionId, await response(request, h.context))).toBe(true)
    await expect(pending).resolves.toMatchObject({ nonce: 2n, deadline: 1600n })
  })
  it("correlates a budget signature to the exact socket and refuses a duplicate attempt", async () => {
    const h = await setup(), pending = h.broker.escrow!.authorize(h.context, { kind: "budget" }, new AbortController().signal)
    await Promise.resolve()
    const reply = await response(h.sent[0], h.context)
    expect(await h.broker.escrow!.accept({}, reply)).toBe(false)
    expect(await h.broker.escrow!.accept(h.connectionId, reply)).toBe(true)
    await expect(pending).resolves.toMatchObject({ signature: reply.signature })
    expect(await h.broker.escrow!.accept(h.connectionId, reply)).toBe(false)
    await expect(h.broker.escrow!.authorize(h.context, { kind: "budget" }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    expect(h.sent).toHaveLength(1)
  })
  it("retains original submit ownership across same-socket refresh and withdrawn routing", async () => {
    const h = await setup(), work = h.assign()
    await Effect.runPromise(h.broker.complete(jobId, outcome)); await work
    await Effect.runPromise(h.broker.register({ ...h.conn }, []))
    expect(await Effect.runPromise(h.broker.runnerFor("skill"))).toBeUndefined()
    const pending = h.broker.escrow!.authorize(h.context, { kind: "submit", outputHash: hashJson(outcome.output) }, new AbortController().signal)
    await Promise.resolve()
    expect(await h.broker.escrow!.accept(h.connectionId, await response(h.sent.at(-1), h.context))).toBe(true)
    await expect(pending).resolves.toMatchObject({ nonce: 2n })
  })
  it.each(["disconnect", "replacement", "abort"])("immediately fences a pending request on %s and rejects late replies", async mode => {
    const h = await setup(), controller = new AbortController()
    const pending = h.broker.escrow!.authorize(h.context, { kind: "budget" }, controller.signal)
    const rejected = expect(pending).rejects.toThrow("escrow_broker_refused")
    await Promise.resolve(); const reply = await response(h.sent[0], h.context)
    if (mode === "disconnect") await Effect.runPromise(h.broker.unregister("r1"))
    else if (mode === "replacement") await Effect.runPromise(h.broker.register({ ...h.conn, connectionId: {} }, ["skill"]))
    else controller.abort(Error("PRIVATE_ABORT_DETAIL"))
    await rejected
    expect(await h.broker.escrow!.accept(h.connectionId, reply)).toBe(false)
    await expect(h.broker.escrow!.authorize(h.context, { kind: "budget" }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    expect(h.sent).toHaveLength(1)
  })
  it.each(["tag", "job", "escrow", "nonce", "signature", "amount", "deadline", "refusal"])("rejects authenticated but invalid %s without exposing private detail", async mode => {
    const h = await setup(), pending = h.broker.escrow!.authorize(h.context, { kind: "budget" }, new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow("escrow_broker_refused")
    await Promise.resolve()
    let reply: Record<string, unknown> = await response(h.sent[0], mode === "amount" ?
      escrowActionContext({ ...h.context, call: { ...h.context.call, amount: 400000n } }) : h.context)
    if (mode === "tag") reply._tag = "EscrowSubmitSigned"
    if (mode === "job") reply.jobId = "8"
    if (mode === "escrow") reply.escrow = h.context.call.hook
    if (mode === "nonce") reply.nonce = "3"
    if (mode === "signature") reply.signature = "0x" + "0".repeat(130)
    if (mode === "deadline") h.clock(1600)
    if (mode === "refusal") reply = { _tag: "EscrowAuthorizationRefused", requestId: reply.requestId, operation: "budget", reason: "authorization_refused" }
    expect(await h.broker.escrow!.accept(h.connectionId, reply)).toBe(false); await rejected
  })
  it.each(["clock", "socket"])("rechecks %s after asynchronous signature verification", async mode => {
    const h = await setup(), pending = h.broker.escrow!.authorize(h.context, { kind: "budget" }, new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow("escrow_broker_refused")
    await Promise.resolve(); const reply = await response(h.sent[0], h.context)
    const accepted = h.broker.escrow!.accept(h.connectionId, reply)
    if (mode === "clock") h.clock(1600)
    else h.disconnect()
    expect(await accepted).toBe(false); await rejected
  })
  it("ignores malformed/unknown requests and stops on the caller's short deadline", async () => {
    const h = await setup(), pending = h.broker.escrow!.authorize(h.context, { kind: "budget" }, AbortSignal.timeout(40))
    const rejected = expect(pending).rejects.toThrow("escrow_broker_refused")
    await Promise.resolve(); const reply = await response(h.sent[0], h.context)
    expect(await h.broker.escrow!.accept(h.connectionId, { ...reply, private: "PRIVATE_VALUE" })).toBe(false)
    expect(await h.broker.escrow!.accept(h.connectionId, { ...reply, requestId: "0x" + "1".repeat(64) })).toBe(false)
    await rejected; expect(h.sent).toHaveLength(1)
  })
  it("requires this job's actual completed output and full admitted context", async () => {
    const h = await setup(), submit = { kind: "submit", outputHash: hashJson(outcome.output) }
    await expect(h.broker.escrow!.authorize(h.context, submit, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    const work = h.assign()
    await expect(h.broker.escrow!.authorize(h.context, submit, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    await Effect.runPromise(h.broker.complete(jobId, outcome)); await work
    await expect(h.broker.escrow!.authorize(h.context, { ...submit, outputHash: hashJson({ other: true }) }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    await expect(h.broker.escrow!.authorize({ ...h.context, requestHash: hashJson({ other: true }) }, submit, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    expect(h.sent).toHaveLength(1)
  })
  it("refuses failed completion and cannot resurrect it with a duplicate successful result", async () => {
    const h = await setup(), work = h.assign()
    await Effect.runPromise(h.broker.complete(jobId, JobOutcome.make({ status: "failed", startedAtMs: 1, finishedAtMs: 2 }))); await work
    await Effect.runPromise(h.broker.complete(jobId, outcome))
    await expect(h.broker.escrow!.authorize(h.context, { kind: "submit", outputHash: hashJson(outcome.output) }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    expect(h.sent).toHaveLength(1)
  })
  it("captures input once and rejects duplicate assignment or wrong root metadata before sending", async () => {
    const h = await setup()
    const base = { jobId, skillId: "skill", skillVersion: "1.0.0", input: {}, timeoutSec: 60, escrow: escrowContextToWire(h.context) }
    for (const changed of [{ input: { wrong: true } }, { parentJobId: "parent" }, { hireCapability: "unexpected" },
      { skillId: "other" }, { skillVersion: "2" }, { timeoutSec: 61 }, { escrow: { ...base.escrow, extra: true } }]) {
      expect((await Effect.runPromiseExit(h.broker.dispatch({ ...base, ...changed })))._tag).toBe("Failure")
    }
    expect(h.sent).toHaveLength(0)
    const work = h.assign()
    expect((await Effect.runPromiseExit(h.broker.dispatch(base)))._tag).toBe("Failure")
    await Effect.runPromise(h.broker.complete(jobId, outcome)); await work
    expect((await Effect.runPromiseExit(h.broker.dispatch(base)))._tag).toBe("Failure")
    expect(h.sent).toHaveLength(1)
  })
  it("cleans the ordinary waiter and revokes submit authority if dispatch is interrupted", async () => {
    const h = await setup(), fiber = Effect.runFork(h.broker.dispatch({ jobId, skillId: "skill", skillVersion: "1.0.0", input: {},
      timeoutSec: 60, escrow: escrowContextToWire(h.context) }))
    await Effect.runPromise(Effect.yieldNow())
    expect(h.sent).toHaveLength(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(await Effect.runPromise(h.broker.runnerForJob(jobId))).toBeUndefined()
    await Effect.runPromise(h.broker.complete(jobId, outcome))
    await expect(h.broker.escrow!.authorize(h.context, { kind: "submit", outputHash: hashJson(outcome.output) }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
  })
  it("bounds concurrently scheduled requests before sending and never loops a failed send", async () => {
    const h = await setup(), controller = new AbortController()
    const pending = Array.from({ length: 65 }, (_, i) => h.broker.escrow!.authorize({ ...h.context, jobId: BigInt(i + 1) },
      { kind: "budget" }, controller.signal).then(() => "signed", () => "refused"))
    await Promise.resolve(); expect(h.sent).toHaveLength(64)
    controller.abort(); expect(await Promise.all(pending)).toEqual(Array(65).fill("refused"))
    await Effect.runPromise(h.broker.register({ ...h.conn, send: () => { throw Error("PRIVATE_SOCKET_VALUE") } }, ["skill"]))
    const context = { ...h.context, jobId: 100n }
    await expect(h.broker.escrow!.authorize(context, { kind: "budget" }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    await expect(h.broker.escrow!.authorize(context, { kind: "budget" }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
  })
  it("bounds retained bindings without evicting one-shot ownership", async () => {
    const h = await setup()
    await Effect.runPromise(h.broker.register({ ...h.conn, send: () => { throw Error("offline send refused") } }, ["skill"]))
    for (let i = 1; i <= 1000; i++) await h.broker.escrow!.authorize({ ...h.context, jobId: BigInt(i) }, { kind: "budget" }, new AbortController().signal).catch(() => {})
    await Effect.runPromise(h.broker.register(h.conn, ["skill"]))
    await expect(h.broker.escrow!.authorize({ ...h.context, jobId: 1001n }, { kind: "budget" }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    await expect(h.broker.escrow!.authorize({ ...h.context, jobId: 1n }, { kind: "budget" }, new AbortController().signal)).rejects.toThrow("escrow_broker_refused")
    expect(h.sent).toHaveLength(0)
  })
})
