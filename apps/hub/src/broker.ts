import { Context, Deferred, Effect, Layer, Ref } from "effect"
import {
  type JobOutcome,
  NoRunnerAvailable,
  RunnerDisconnected,
  type HubMessage,
  type EscrowContextWire
} from "@arcade/core"
import { makeEscrowBroker, type EscrowBroker } from "./escrow-broker.ts"

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
  /** Stable authenticated socket identity across same-socket Hello refreshes. */
  readonly connectionId?: object
  readonly isCurrent?: () => boolean
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
  readonly escrow?: EscrowBroker
  readonly register: (conn: RunnerConn, skillIds: ReadonlyArray<string>) => Effect.Effect<void>
  readonly unregister: (runnerId: string) => Effect.Effect<void>
  readonly dispatch: (args: {
    readonly jobId: string
    readonly skillId: string
    readonly skillVersion: string
    readonly input: unknown
    readonly timeoutSec: number
    readonly parentJobId?: string
    readonly hireCapability?: string
    readonly escrow?: EscrowContextWire
  }) => Effect.Effect<JobOutcome, NoRunnerAvailable | RunnerDisconnected>
  readonly complete: (jobId: string, outcome: JobOutcome) => Effect.Effect<void>
  /** Routing: which connected runner can serve this SKILL. */
  readonly runnerFor: (skillId: string) => Effect.Effect<string | undefined>
  /** Ownership: which runner this JOB was dispatched to. Used to authorise its result. */
  readonly runnerForJob: (jobId: string) => Effect.Effect<string | undefined>
}

export class BrokerTag extends Context.Tag("@arcade/hub/Broker")<BrokerTag, Broker>() {}

export const makeBroker = (ref: Ref.Ref<BrokerState>, options: { readonly nowSeconds?: () => number } = {}): Broker => {
  const escrow = makeEscrowBroker({ nowSeconds: options.nowSeconds ?? (() => Math.floor(Date.now() / 1000)),
    current: rid => Effect.runSync(Ref.get(ref)).conns.get(rid),
    routes: skill => { const s = Effect.runSync(Ref.get(ref)); return [...(s.routes.get(skill) ?? [])]
      .flatMap(rid => { const conn = s.conns.get(rid); return conn ? [conn] : [] }) } })
  const register: Broker["register"] = (conn, skillIds) =>
    Ref.update(ref, (s) => {
      const previous = s.conns.get(conn.runnerId)
      if (previous && (previous.connectionId !== conn.connectionId || previous.seller.toLowerCase() !== conn.seller.toLowerCase())) escrow.disconnected(conn.runnerId)
      const conns = new Map(s.conns)
      conns.set(conn.runnerId, conn)
      const routes = new Map(s.routes)
      // Hello is a complete serving snapshot, not an additive subscription. Keep other
      // runners and this socket's in-flight assignments while removing withdrawn skills.
      for (const [id, runners] of routes) {
        const next = new Set(runners)
        next.delete(conn.runnerId)
        if (next.size === 0) routes.delete(id)
        else routes.set(id, next)
      }
      for (const id of skillIds) {
        const set = new Set(routes.get(id) ?? [])
        set.add(conn.runnerId)
        routes.set(id, set)
      }
      return { ...s, conns, routes }
    })

  const unregister: Broker["unregister"] = (runnerId) =>
    Effect.gen(function* () {
      escrow.disconnected(runnerId)
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
      if (args.escrow !== undefined) {
        const waiter = yield* Deferred.make<JobOutcome, RunnerDisconnected>()
        const cleanup = Ref.update(ref, st => {
          const waiters = new Map(st.waiters), assigned = new Map(st.assigned)
          if (waiters.get(args.jobId) === waiter) { waiters.delete(args.jobId); assigned.delete(args.jobId) }
          return { ...st, waiters, assigned }
        })
        yield* Effect.try({ try: () => {
          const s = Effect.runSync(Ref.get(ref))
          if (s.waiters.has(args.jobId) || s.assigned.has(args.jobId)) throw Error("escrow_assignment_refused")
          const { conn, message } = escrow.bind({ ...args, escrow: args.escrow! })
          // No await between exact-socket binding, waiter installation and one send.
          Effect.runSync(Ref.update(ref, st => ({ ...st,
            waiters: new Map(st.waiters).set(args.jobId, waiter), assigned: new Map(st.assigned).set(args.jobId, conn.runnerId) })))
          try { conn.send(message) } catch { escrow.failed(args.jobId); Effect.runSync(cleanup); throw Error("escrow_assignment_refused") }
        }, catch: () => new NoRunnerAvailable({ skillId: args.skillId }) })
        return yield* Deferred.await(waiter).pipe(
          Effect.onInterrupt(() => Effect.sync(() => escrow.failed(args.jobId))), Effect.ensuring(cleanup))
      }
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
        timeoutSec: args.timeoutSec,
        ...(args.parentJobId === undefined ? {} : { parentJobId: args.parentJobId }),
        ...(args.hireCapability === undefined ? {} : { hireCapability: args.hireCapability })
      } as HubMessage)

      return yield* Deferred.await(waiter)
    })

  const complete: Broker["complete"] = (jobId, outcome) =>
    Effect.gen(function* () {
      const s = yield* Ref.get(ref)
      const waiter = s.waiters.get(jobId)
      if (waiter !== undefined) {
        escrow.complete(jobId, outcome)
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

  return { register, unregister, dispatch, complete, runnerFor, runnerForJob, escrow: escrow.facade }
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
