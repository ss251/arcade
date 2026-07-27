import { describe, expect, it } from "vitest"
import { Effect, Ref } from "effect"
import { JobOutcome, type HubMessage } from "@arcade/core"
import { makeBroker } from "../src/broker.ts"

/**
 * The broker holds live seller sockets. Its failure modes are the ones that would hang a
 * buyer's paid request forever, so they get explicit tests: no runner, runner vanishing
 * mid-job, and a result arriving for a job nobody is waiting on.
 */

/** vitest runs under Node, not the Bun runtime — no `Bun.sleep` here. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const emptyState = () => ({
  conns: new Map(),
  routes: new Map(),
  waiters: new Map(),
  assigned: new Map()
})

const fakeConn = (runnerId: string, sent: Array<HubMessage> = []) => ({
  runnerId,
  seller: "0xSeller",
  send: (m: HubMessage) => void sent.push(m),
  close: () => {}
})

const outcome = JobOutcome.make({
  status: "succeeded",
  output: { ok: true },
  startedAtMs: 0,
  finishedAtMs: 5
})

describe("broker", () => {
  it("fails fast with NoRunnerAvailable instead of hanging", async () => {
    const broker = makeBroker(Effect.runSync(Ref.make(emptyState())))
    const exit = await Effect.runPromiseExit(
      broker.dispatch({ jobId: "j1", skillId: "nope", skillVersion: "1", input: {}, timeoutSec: 5 })
    )
    expect(exit._tag).toBe("Failure")
  })

  it("routes a job to a registered runner and resolves on completion", async () => {
    const broker = makeBroker(Effect.runSync(Ref.make(emptyState())))
    const sent: Array<HubMessage> = []
    await Effect.runPromise(broker.register(fakeConn("r1", sent), ["demo"]))

    const pending = Effect.runPromise(
      broker.dispatch({ jobId: "j1", skillId: "demo", skillVersion: "1", input: { a: 1 }, timeoutSec: 5 })
    )
    await sleep(20)

    // The runner must actually have been handed the assignment.
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ _tag: "JobAssignment", jobId: "j1", skillId: "demo" })

    await Effect.runPromise(broker.complete("j1", outcome))
    await expect(pending).resolves.toMatchObject({ status: "succeeded" })
  })

  it("reports which runner a JOB was assigned to, not which serves a skill", async () => {
    // The bug this exists for shipped and broke every paid call. The ownership check on
    // `JobResult` called `runnerFor(jobId)` — the SKILL routing lookup — which found
    // nothing, so the hub logged "assigned to nobody" and dropped every result. Jobs
    // always timed out and nothing ever settled.
    //
    // Both functions are `string => string | undefined`, so the compiler could not see it
    // and no test asked the question. This one asks it directly: the two lookups must not
    // be interchangeable.
    const broker = makeBroker(Effect.runSync(Ref.make(emptyState())))
    await Effect.runPromise(broker.register(fakeConn("r1"), ["demo"]))

    void Effect.runPromise(
      broker.dispatch({ jobId: "j1", skillId: "demo", skillVersion: "1", input: {}, timeoutSec: 5 })
    )
    await sleep(20)

    expect(await Effect.runPromise(broker.runnerForJob("j1"))).toBe("r1")
    // A job id is not a skill id, and a skill id is not a job id.
    expect(await Effect.runPromise(broker.runnerFor("j1"))).toBeUndefined()
    expect(await Effect.runPromise(broker.runnerForJob("demo"))).toBeUndefined()

    await Effect.runPromise(broker.complete("j1", outcome))
    // …and the assignment is released once the job is done, so a late duplicate result
    // from the same runner cannot complete it twice.
    expect(await Effect.runPromise(broker.runnerForJob("j1"))).toBeUndefined()
  })

  it("fails every in-flight job when its runner disconnects — never leaves one hanging", async () => {
    const broker = makeBroker(Effect.runSync(Ref.make(emptyState())))
    await Effect.runPromise(broker.register(fakeConn("r1"), ["demo"]))

    const a = Effect.runPromiseExit(
      broker.dispatch({ jobId: "j1", skillId: "demo", skillVersion: "1", input: {}, timeoutSec: 30 })
    )
    const b = Effect.runPromiseExit(
      broker.dispatch({ jobId: "j2", skillId: "demo", skillVersion: "1", input: {}, timeoutSec: 30 })
    )
    await sleep(20)

    await Effect.runPromise(broker.unregister("r1"))

    // Both must resolve — a buyer whose runner died gets an answer, not a stalled request.
    expect((await a)._tag).toBe("Failure")
    expect((await b)._tag).toBe("Failure")
  })

  it("stops routing to a runner once it unregisters", async () => {
    const broker = makeBroker(Effect.runSync(Ref.make(emptyState())))
    await Effect.runPromise(broker.register(fakeConn("r1"), ["demo"]))
    expect(await Effect.runPromise(broker.runnerFor("demo"))).toBe("r1")

    await Effect.runPromise(broker.unregister("r1"))
    expect(await Effect.runPromise(broker.runnerFor("demo"))).toBeUndefined()
  })

  it("survives a result for an unknown job", async () => {
    const broker = makeBroker(Effect.runSync(Ref.make(emptyState())))
    // A late or duplicated JobResult must not crash the hub.
    await expect(Effect.runPromise(broker.complete("ghost", outcome))).resolves.toBeUndefined()
  })

  it("routes only skills the runner actually declared", async () => {
    const broker = makeBroker(Effect.runSync(Ref.make(emptyState())))
    await Effect.runPromise(broker.register(fakeConn("r1"), ["alpha"]))
    expect(await Effect.runPromise(broker.runnerFor("alpha"))).toBe("r1")
    expect(await Effect.runPromise(broker.runnerFor("beta"))).toBeUndefined()
  })

  it("keeps serving a skill when one of two runners drops", async () => {
    const broker = makeBroker(Effect.runSync(Ref.make(emptyState())))
    await Effect.runPromise(broker.register(fakeConn("r1"), ["demo"]))
    await Effect.runPromise(broker.register(fakeConn("r2"), ["demo"]))

    await Effect.runPromise(broker.unregister("r1"))
    expect(await Effect.runPromise(broker.runnerFor("demo"))).toBe("r2")
  })
})
