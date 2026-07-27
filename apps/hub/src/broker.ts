import { Context, Deferred, Effect, Layer, Ref } from "effect"
import {
  type JobOutcome,
  NoRunnerAvailable,
  RunnerDisconnected,
  type HubMessage
} from "@arcade/core"

/**
 * Job broker.
 *
 * Runners dial OUT and are held here as live sockets. Dispatch resolves a `Deferred` when
 * the runner reports an outcome, so the settle pipeline can simply await it — with a hard
 * timeout supplied by the caller. If a socket dies, every job waiting on it fails with
 * `RunnerDisconnected` rather than hanging forever.
 */

export interface RunnerConn {
  readonly runnerId: string
  readonly seller: string
  readonly send: (msg: HubMessage) => void
  readonly close: () => void
}

interface BrokerState {
  readonly conns: Map<string, RunnerConn>
  /** skillId -> runnerIds able to serve it */
  readonly routes: Map<string, Set<string>>
  /** jobId -> waiter */
  readonly waiters: Map<string, Deferred.Deferred<JobOutcome, RunnerDisconnected>>
  /** jobId -> runnerId */
  readonly assigned: Map<string, string>
}

export interface Broker {
  readonly register: (conn: RunnerConn, skillIds: ReadonlyArray<string>) => Effect.Effect<void>
  readonly unregister: (runnerId: string) => Effect.Effect<void>
  readonly dispatch: (args: {
    readonly jobId: string
    readonly skillId: string
    readonly skillVersion: string
    readonly input: unknown
    readonly timeoutSec: number
  }) => Effect.Effect<JobOutcome, NoRunnerAvailable | RunnerDisconnected>
  readonly complete: (jobId: string, outcome: JobOutcome) => Effect.Effect<void>
  /** Routing: which connected runner can serve this SKILL. */
  readonly runnerFor: (skillId: string) => Effect.Effect<string | undefined>
  /** Ownership: which runner this JOB was dispatched to. Used to authorise its result. */
  readonly runnerForJob: (jobId: string) => Effect.Effect<string | undefined>
}

export class BrokerTag extends Context.Tag("@arcade/hub/Broker")<BrokerTag, Broker>() {}

export const makeBroker = (ref: Ref.Ref<BrokerState>): Broker => {
  const register: Broker["register"] = (conn, skillIds) =>
    Ref.update(ref, (s) => {
      const conns = new Map(s.conns)
      conns.set(conn.runnerId, conn)
      const routes = new Map(s.routes)
      for (const id of skillIds) {
        const set = new Set(routes.get(id) ?? [])
        set.add(conn.runnerId)
        routes.set(id, set)
      }
      return { ...s, conns, routes }
    })

  const unregister: Broker["unregister"] = (runnerId) =>
    Effect.gen(function* () {
      const s = yield* Ref.get(ref)
      // Fail every job this runner was holding — never leave a buyer's request hanging.
      const orphaned = [...s.assigned.entries()].filter(([, rid]) => rid === runnerId)
      for (const [jobId] of orphaned) {
        const waiter = s.waiters.get(jobId)
        if (waiter !== undefined) {
          yield* Deferred.fail(waiter, new RunnerDisconnected({ runnerId, jobId }))
        }
      }
      yield* Ref.update(ref, (st) => {
        const conns = new Map(st.conns)
        conns.delete(runnerId)
        const routes = new Map(st.routes)
        for (const [skill, set] of routes) {
          const next = new Set(set)
          next.delete(runnerId)
          if (next.size === 0) routes.delete(skill)
          else routes.set(skill, next)
        }
        const waiters = new Map(st.waiters)
        const assigned = new Map(st.assigned)
        for (const [jobId] of orphaned) {
          waiters.delete(jobId)
          assigned.delete(jobId)
        }
        return { ...st, conns, routes, waiters, assigned }
      })
    })

  const runnerFor: Broker["runnerFor"] = (skillId) =>
    Effect.map(Ref.get(ref), (s) => {
      const set = s.routes.get(skillId)
      if (set === undefined || set.size === 0) return undefined
      // Simple round-robin-ish pick: first live conn.
      for (const rid of set) if (s.conns.has(rid)) return rid
      return undefined
    })

  /**
   * Which runner a JOB was dispatched to — not which runner serves a skill.
   *
   * These are different questions with identical signatures (`string => string | undefined`),
   * which is how the ownership check on `JobResult` came to call `runnerFor` with a job id.
   * It looked a skill id up in the routing table, found nothing, and dropped every result
   * as "assigned to nobody" — so no job could complete and no call could settle.
   */
  const runnerForJob: Broker["runnerForJob"] = (jobId) =>
    Effect.map(Ref.get(ref), (s) => s.assigned.get(jobId))

  const dispatch: Broker["dispatch"] = (args) =>
    Effect.gen(function* () {
      const rid = yield* runnerFor(args.skillId)
      if (rid === undefined) {
        return yield* new NoRunnerAvailable({ skillId: args.skillId })
      }
      const s = yield* Ref.get(ref)
      const conn = s.conns.get(rid)
      if (conn === undefined) {
        return yield* new NoRunnerAvailable({ skillId: args.skillId })
      }

      const waiter = yield* Deferred.make<JobOutcome, RunnerDisconnected>()
      yield* Ref.update(ref, (st) => {
        const waiters = new Map(st.waiters)
        waiters.set(args.jobId, waiter)
        const assigned = new Map(st.assigned)
        assigned.set(args.jobId, rid)
        return { ...st, waiters, assigned }
      })

      conn.send({
        _tag: "JobAssignment",
        jobId: args.jobId,
        skillId: args.skillId,
        skillVersion: args.skillVersion,
        input: args.input,
        timeoutSec: args.timeoutSec
      } as HubMessage)

      return yield* Deferred.await(waiter)
    })

  const complete: Broker["complete"] = (jobId, outcome) =>
    Effect.gen(function* () {
      const s = yield* Ref.get(ref)
      const waiter = s.waiters.get(jobId)
      if (waiter !== undefined) {
        yield* Deferred.succeed(waiter, outcome)
      }
      yield* Ref.update(ref, (st) => {
        const waiters = new Map(st.waiters)
        waiters.delete(jobId)
        const assigned = new Map(st.assigned)
        assigned.delete(jobId)
        return { ...st, waiters, assigned }
      })
    })

  return { register, unregister, dispatch, complete, runnerFor, runnerForJob }
}

export const BrokerLive = Layer.effect(
  BrokerTag,
  Effect.map(
    Ref.make<BrokerState>({
      conns: new Map(),
      routes: new Map(),
      waiters: new Map(),
      assigned: new Map()
    }),
    makeBroker
  )
)
