import { Effect, Layer, Context, Ref } from "effect"
import type { PublicListing, Receipt, Rating, ObjectiveStats, Job } from "@arcade/core"
import { ListingNotFound } from "@arcade/core"

/**
 * Hub state.
 *
 * Deliberately an in-memory Ref behind a service tag: swapping in `@effect/sql` +
 * `bun:sqlite` later is a Layer change, and tests get a real store with no fixtures.
 */

export interface RunnerRecord {
  readonly runnerId: string
  readonly seller: string
  readonly skillIds: ReadonlyArray<string>
  readonly maxConcurrency: number
  readonly connectedAtMs: number
  lastSeenMs: number
  activeJobs: number
}

export interface ListingRecord {
  readonly listing: PublicListing
  readonly seller: string
  /**
   * This seller's fee splitter, from their signed handshake. Per listing because it is per
   * SELLER — `FeeSplitter.seller` is immutable, so one seller's contract can never pay
   * another, and a single global splitter would route everyone else's revenue into the
   * first seller's contract irrecoverably.
   */
  readonly feeSplitter?: string | undefined
  /**
   * Read off the splitter at handshake, not configured. Whether the fee returns to the
   * seller is a fact about a contract the seller announced, so a process-wide boolean
   * would be wrong for any seller it did not describe — and would go stale silently the
   * day a second seller lists with a genuinely separate treasury.
   */
  readonly treasuryIsSeller?: boolean | undefined
  readonly runnerId: string
  readonly publishedAtMs: number
}

export interface StoreState {
  readonly listings: Map<string, ListingRecord>
  readonly runners: Map<string, RunnerRecord>
  readonly jobs: Map<string, Job>
  readonly receipts: Array<Receipt>
  readonly ratings: Array<Rating>
}

const empty = (): StoreState => ({
  listings: new Map(),
  runners: new Map(),
  jobs: new Map(),
  receipts: [],
  ratings: []
})

export interface Store {
  readonly putListing: (rec: ListingRecord) => Effect.Effect<void>
  readonly getListing: (skillId: string) => Effect.Effect<ListingRecord, ListingNotFound>
  readonly allListings: Effect.Effect<ReadonlyArray<ListingRecord>>
  readonly removeListingsForRunner: (runnerId: string) => Effect.Effect<void>

  readonly putRunner: (rec: RunnerRecord) => Effect.Effect<void>
  readonly getRunner: (runnerId: string) => Effect.Effect<RunnerRecord | undefined>
  readonly allRunners: Effect.Effect<ReadonlyArray<RunnerRecord>>
  readonly dropRunner: (runnerId: string) => Effect.Effect<void>
  readonly touchRunner: (runnerId: string, activeJobs: number) => Effect.Effect<void>

  readonly putJob: (job: Job) => Effect.Effect<void>
  readonly getJob: (jobId: string) => Effect.Effect<Job | undefined>

  readonly putReceipt: (r: Receipt) => Effect.Effect<void>
  readonly allReceipts: Effect.Effect<ReadonlyArray<Receipt>>
  readonly backfillFeeSweep: (accrualId: string, txHash: string) => Effect.Effect<number>

  readonly putRating: (r: Rating) => Effect.Effect<void>
  readonly ratingsFor: (skillId: string) => Effect.Effect<ReadonlyArray<Rating>>
  readonly statsFor: (skillId: string) => Effect.Effect<ObjectiveStats>
}

export class StoreTag extends Context.Tag("@arcade/hub/Store")<StoreTag, Store>() {}

const percentile = (sorted: ReadonlyArray<number>, p: number): number => {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx] ?? 0
}

export const makeStore = (ref: Ref.Ref<StoreState>): Store => ({
  putListing: (rec) =>
    Ref.update(ref, (s) => {
      const listings = new Map(s.listings)
      listings.set(rec.listing.id, rec)
      return { ...s, listings }
    }),

  getListing: (skillId) =>
    Effect.flatMap(Ref.get(ref), (s) => {
      const rec = s.listings.get(skillId)
      return rec === undefined ? Effect.fail(new ListingNotFound({ skillId })) : Effect.succeed(rec)
    }),

  allListings: Effect.map(Ref.get(ref), (s) => [...s.listings.values()]),

  removeListingsForRunner: (runnerId) =>
    Ref.update(ref, (s) => {
      const listings = new Map(s.listings)
      for (const [id, rec] of listings) if (rec.runnerId === runnerId) listings.delete(id)
      return { ...s, listings }
    }),

  putRunner: (rec) =>
    Ref.update(ref, (s) => {
      const runners = new Map(s.runners)
      runners.set(rec.runnerId, rec)
      return { ...s, runners }
    }),

  getRunner: (runnerId) => Effect.map(Ref.get(ref), (s) => s.runners.get(runnerId)),
  allRunners: Effect.map(Ref.get(ref), (s) => [...s.runners.values()]),

  dropRunner: (runnerId) =>
    Ref.update(ref, (s) => {
      const runners = new Map(s.runners)
      runners.delete(runnerId)
      return { ...s, runners }
    }),

  touchRunner: (runnerId, activeJobs) =>
    Ref.update(ref, (s) => {
      const runners = new Map(s.runners)
      const r = runners.get(runnerId)
      if (r !== undefined) runners.set(runnerId, { ...r, lastSeenMs: Date.now(), activeJobs })
      return { ...s, runners }
    }),

  putJob: (job) =>
    Ref.update(ref, (s) => {
      const jobs = new Map(s.jobs)
      jobs.set(job.id, job)
      return { ...s, jobs }
    }),

  getJob: (jobId) => Effect.map(Ref.get(ref), (s) => s.jobs.get(jobId)),

  putReceipt: (r) => Ref.update(ref, (s) => ({ ...s, receipts: [...s.receipts, r] })),
  allReceipts: Effect.map(Ref.get(ref), (s) => s.receipts),

  /**
   * Fee accrual sweep: one on-chain tx covers many receipts, and its hash is written back
   * into each so the take-rate stays individually auditable despite being batched.
   */
  backfillFeeSweep: (accrualId, txHash) =>
    Ref.modify(ref, (s) => {
      let n = 0
      const receipts = s.receipts.map((r) => {
        if (r.feeAccrualId === accrualId && r.feeSweepTx === undefined) {
          n++
          return Object.assign(Object.create(Object.getPrototypeOf(r)), r, { feeSweepTx: txHash }) as Receipt
        }
        return r
      })
      return [n, { ...s, receipts }]
    }),

  putRating: (r) => Ref.update(ref, (s) => ({ ...s, ratings: [...s.ratings, r] })),
  ratingsFor: (skillId) => Effect.map(Ref.get(ref), (s) => s.ratings.filter((r) => r.skillId === skillId)),

  statsFor: (skillId) =>
    Effect.map(Ref.get(ref), (s) => {
      const rs = s.receipts.filter((r) => r.skillId === skillId)
      const settled = rs.filter((r) => r.settled)
      const lat = settled.map((r) => r.latencyMs).sort((a, b) => a - b)
      const runners = [...s.runners.values()].filter((r) => r.skillIds.includes(skillId))
      return {
        skillId,
        calls: rs.length,
        settled: settled.length,
        successRate: rs.length === 0 ? 0 : settled.length / rs.length,
        p50LatencyMs: percentile(lat, 50),
        p95LatencyMs: percentile(lat, 95),
        availability: runners.length > 0 ? 1 : 0
      } as ObjectiveStats
    })
})

export const StoreLive = Layer.effect(
  StoreTag,
  Effect.map(Ref.make(empty()), makeStore)
)
