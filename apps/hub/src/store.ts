import { Effect, Layer, Context, Ref } from "effect"
import type { PublicListing, Receipt, Rating, ObjectiveStats, Job } from "@arcade/core"
import { ListingNotFound, Session, SessionConflict, SessionInvalid, SessionNotFound, SessionStorageUnavailable } from "@arcade/core"
import { transitionSession, sessionSnapshot, validateSessionLedger, sessionError,
  sessionJobCopy, sessionReceiptCopy, type SessionStore, type SessionLedgerState, type SessionCommand, type SessionTransition } from "./session-ledger.ts"

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

/** Public evidence from a hub-owned purchase, not a customer-demand claim. */
export interface PayTest {
  readonly atMs: number
  /** Empty when the hub served no job (for example, the runner was offline). */
  readonly jobId: string
  readonly settleTx?: string | undefined
  readonly ok: boolean
}

export interface PayTestRow extends PayTest {
  readonly skillId: string
  readonly seller: string
  /** Operator diagnostic, excluded from public history and marketplace rows. */
  readonly reason: string
}

export interface PayTestState {
  readonly last?: PayTest | undefined
  readonly consecutiveFailures: number
  readonly delisted: boolean
}

export const DELIST_AFTER = 3
export const PAY_TEST_HISTORY = 20
export const payTestKey = (skillId: string, seller: string): string => `${skillId}\u0000${seller.toLowerCase()}`
const chronological = (rows: ReadonlyArray<PayTestRow>): Array<PayTestRow> =>
  [...rows].sort((a, b) => a.atMs - b.atMs)
const publicPayTest = (r: PayTest): PayTest => ({
  atMs: r.atMs, jobId: r.jobId, ok: r.ok,
  ...(r.settleTx === undefined ? {} : { settleTx: r.settleTx })
})

/** Reconnects cannot erase history: only a newer passing purchase clears the verdict. */
export const payTestStateOf = (history: ReadonlyArray<PayTestRow>, threshold = DELIST_AFTER): PayTestState => {
  const sorted = chronological(history)
  let consecutiveFailures = 0
  for (let index = sorted.length - 1; index >= 0; index--) {
    if (sorted[index]!.ok) break
    consecutiveFailures++
  }
  const last = sorted[sorted.length - 1]
  return {
    ...(last === undefined ? {} : { last: publicPayTest(last) }),
    consecutiveFailures,
    delisted: consecutiveFailures >= threshold
  }
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
  /**
   * Whether the announced splitter was actually read on chain.
   *
   * The `feeBps` check fails OPEN when the RPC is unreachable, because refusing a seller
   * for someone else's outage is the wrong trade. But admitting them silently meant the
   * page printed a fee claim nothing had verified. Carrying it as state instead of a gate
   * lets a reconnect storm degrade what the page ASSERTS rather than what the marketplace
   * SERVES — the listing still sells, the unbacked claim is simply withheld.
   */
  readonly splitterVerified?: boolean | undefined
  /** Observed at a successful splitter handshake, not inferred from later boot configuration. */
  readonly splitterFeeBps?: number | undefined
  readonly splitterNetwork?: string | undefined
  /**
   * The announced splitter's contract version, read at handshake via `version()` (added in
   * v2). `1` covers both "genuinely v1" and "reverted" — v1 has no `version()` selector at
   * all, so a revert IS the v1 signal, not a distinct unknown. Absent when the read never
   * ran (no splitter announced, or the RPC was unreachable — the same fail-open posture as
   * `splitterVerified`).
   */
  readonly splitterVersion?: 1 | 2 | undefined
  /** Filled from persisted history by the store, never trusted from a caller. */
  readonly payTested?: PayTest | undefined
  /** Derived from three trailing failed pay-tests, never stored as a mutable flag. */
  readonly delisted?: boolean | undefined
  /** Announced identity; listing/runner bindings are re-established on each connection. */
  readonly agentId?: string | undefined
  readonly registrationTx?: string | undefined
  /** True only after IdentityRegistry.ownerOf(agentId) was read and matched the seller. */
  readonly agentVerified?: boolean | undefined
  /** Optional future ENS binding; exposed as ens in the registration document. */
  readonly ensName?: string | undefined
  readonly runnerId: string
  readonly publishedAtMs: number
}

const decorate = (rec: ListingRecord, state: PayTestState): ListingRecord => {
  const { payTested: _claimedEvidence, delisted: _claimedVerdict, ...listing } = rec
  return { ...listing, ...(state.last === undefined ? {} : { payTested: state.last }), delisted: state.delisted }
}

export interface TreeRow {
  readonly childJobId: string
  readonly amountAtomic: bigint
  state: "reserved" | "committed" | "released"
}

export interface StoreState extends SessionLedgerState {
  readonly listings: Map<string, ListingRecord>
  readonly runners: Map<string, RunnerRecord>
  readonly jobs: Map<string, Job>
  readonly receipts: Array<Receipt>
  readonly ratings: Array<Rating>
  readonly trees: Map<string, Array<TreeRow>>
  /** Authorization identity -> the job that claimed it first. See `claimAuthorization`. */
  readonly authorizations: Map<string, string>
  readonly payTests: Map<string, Array<PayTestRow>>
  readonly erc8004Docs: Map<string, string>
}

const empty = (): StoreState => ({
  listings: new Map(),
  runners: new Map(),
  jobs: new Map(),
  receipts: [],
  ratings: [],
  trees: new Map(),
  authorizations: new Map(),
  payTests: new Map(),
  erc8004Docs: new Map(),
  sessions: new Map(),
  sessionCalls: new Map()
})

export type Erc8004DocKind = "validation-request" | "validation-response" | "feedback"
export const erc8004DocKey = (jobId: string, kind: Erc8004DocKind): string => {
  if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(jobId) ||
    !["validation-request", "validation-response", "feedback"].includes(kind)) throw new Error("invalid registry document key")
  return `${jobId}/${kind}`
}
/** Persist exact JSON object bytes, never re-serialize a committed document. */
export const validateErc8004DocBytes = (bytes: string): void => {
  if (typeof bytes !== "string" || bytes.length > 1_048_576 || new TextEncoder().encode(bytes).byteLength > 1_048_576) {
    throw new Error("registry document exceeds the storage limit")
  }
  let doc: unknown
  try { doc = JSON.parse(bytes) } catch { throw new Error("registry document must be a JSON object") }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) throw new Error("registry document must be a JSON object")
}

export interface Store extends SessionStore {
  /** Available only through the concrete SQLite adapter; activation requires durable. */
  readonly escrow?: import("./escrow-store.ts").EscrowStore
  /** Identical retries succeed; conflicting bytes fail before any registry write. */
  readonly putErc8004Doc: (jobId: string, kind: Erc8004DocKind, bytes: string) => Effect.Effect<void>
  readonly getErc8004Doc: (jobId: string, kind: Erc8004DocKind) => Effect.Effect<string | undefined>
  readonly putListing: (rec: ListingRecord) => Effect.Effect<void>
  readonly getListing: (skillId: string) => Effect.Effect<ListingRecord, ListingNotFound>
  readonly allListings: Effect.Effect<ReadonlyArray<ListingRecord>>
  readonly recordPayTest: (row: PayTestRow) => Effect.Effect<void>
  readonly payTestState: (skillId: string, seller: string) => Effect.Effect<PayTestState>
  readonly payTestHistory: (skillId: string, seller: string) => Effect.Effect<ReadonlyArray<PayTest>>
  readonly allPayTested: Effect.Effect<ReadonlyArray<{
    readonly skillId: string; readonly seller: string; readonly state: PayTestState
  }>>
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
  /** Provenance seam: changing this requires changing the statistics' actual data source. */
  readonly statsSource: Effect.Effect<"subgraph" | "hub">
  readonly backfillFeeSweep: (accrualId: string, txHash: string) => Effect.Effect<number>

  readonly putRating: (r: Rating) => Effect.Effect<void>
  readonly ratingsFor: (skillId: string) => Effect.Effect<ReadonlyArray<Rating>>
  readonly statsFor: (skillId: string) => Effect.Effect<ObjectiveStats>

  readonly reserveTree: (
    rootJobId: string,
    childJobId: string,
    amountAtomic: bigint,
    ceilingAtomic: bigint
  ) => Effect.Effect<boolean>
  /**
   * Claim a payment authorization for one job, atomically. False means it was already used.
   *
   * USDC records each (authorizer, nonce) pair once, so a replayed authorization can only
   * SETTLE once — but settlement is the last thing that happens, minutes after the seller's
   * agent has run. Until then the nonce is unspent on chain, so the rail's
   * `authorizationState` read says "fresh" for every copy of the same header, and the hub
   * dispatched a fresh job for each one. The seller burned N inference runs and was paid
   * for one. The chain cannot close that window; only the hub can, by claiming the
   * authorization the moment it is accepted rather than when it settles.
   *
   * A claim is never released. A nonce is single use by definition, and a buyer whose job
   * failed signs a fresh one offline for nothing — refusing a repeat is the safe direction,
   * because the alternative is paying for work twice.
   */
  readonly claimAuthorization: (key: string, jobId: string) => Effect.Effect<boolean>
  readonly commitTree: (childJobId: string) => Effect.Effect<void>
  readonly releaseTree: (childJobId: string) => Effect.Effect<void>
  readonly treeState: (rootJobId: string) => Effect.Effect<{
    readonly reservedAtomic: bigint
    readonly committedAtomic: bigint
    readonly children: ReadonlyArray<TreeRow>
  }>
}

export class StoreTag extends Context.Tag("@arcade/hub/Store")<StoreTag, Store>() {}

const percentile = (sorted: ReadonlyArray<number>, p: number): number => {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx] ?? 0
}

const setTreeState = (s: StoreState, childJobId: string, state: TreeRow["state"]): StoreState => {
  const trees = new Map(s.trees)
  for (const [root, rows] of trees) {
    if (rows.some((r) => r.childJobId === childJobId)) {
      trees.set(root, rows.map((r) => (r.childJobId === childJobId ? { ...r, state } : r)))
    }
  }
  return { ...s, trees }
}

/** Synchronous adapters cannot yield between the transaction and publication. */
export const sessionStoreApi = (
  read: (sessionId?: string) => SessionLedgerState,
  mutate: (command: SessionCommand) => SessionTransition["result"],
  sessionStorage: SessionStore["sessionStorage"],
  list?: () => ReadonlyArray<Session>
): SessionStore => {
  const safe = <A>(body: () => A) => Effect.uninterruptible(Effect.try({ try: body, catch: error => sessionError(error, sessionStorage === "durable") }))
  const command = <A>(input: SessionCommand) => safe(() => mutate(input) as A)
  const getSessionTerminal: SessionStore["getSessionTerminal"] = (sessionId, jobId) => safe(() => {
      // Exact scalar lengths and suffix alphabets precede even the selected
      // backend read; whitespace and coercible objects are not identifiers.
      if (typeof sessionId !== "string" || sessionId.length !== 36 || !/^ses_[0-9a-f]{32}$/.test(sessionId) ||
        typeof jobId !== "string" || !jobId.startsWith("job_") || jobId.length < 20 || jobId.length > 132 ||
        /[^A-Za-z0-9]/.test(jobId.slice(4))) throw new SessionInvalid()
      let state: SessionLedgerState
      try { state = read(sessionId); validateSessionLedger(state) }
      catch { throw new SessionStorageUnavailable() }
      const call = state.sessionCalls.get(jobId)
      if (!state.sessions.has(sessionId) || call === undefined || call.binding.sessionId !== sessionId) {
        throw new SessionNotFound({ sessionId })
      }
      if (call.state === "reserved" || call.state === "settling" || call.state === "uncertain") return undefined
      // The ledger validates the actual persisted Job/Receipt digests and all
      // terminal relationships. Never reconstruct evidence from the call row.
      try {
        const receipt = state.receipts.find(row => row.jobId === jobId), job = state.jobs.get(jobId)
        if (receipt === undefined || job === undefined) throw new SessionStorageUnavailable()
        // Both copies belong to this validated read. A later global Job read
        // would not retain this snapshot's terminal digest authority.
        return { job: sessionJobCopy(job), receipt: sessionReceiptCopy(receipt) }
      } catch { throw new SessionStorageUnavailable() }
    })
  return { sessionStorage,
    openSession: input => command({ kind: "open", input }),
    getSession: id => safe(() => sessionSnapshot(read(id), id)?.session),
    getSessionSnapshot: id => safe(() => sessionSnapshot(read(id), id)),
    getSessionTerminal,
    getSessionReceipt: (sessionId, jobId) => getSessionTerminal(sessionId, jobId).pipe(Effect.map(pair => pair?.receipt)),
    allSessions: safe(() => { if (list !== undefined) return list(); const st = read(); validateSessionLedger(st); return [...st.sessions.values()].map(session => Session.make({ ...session })) }),
    reserveSessionJob: (binding, job) => command({ kind: "reserve", binding, job }),
    beginSessionSettlement: (sessionId, jobId) => command({ kind: "begin", sessionId, jobId }),
    finishSessionJob: terminal => command({ kind: "finish", terminal }),
    markSessionUncertain: (sessionId, jobId) => command({ kind: "uncertain", sessionId, jobId }),
    closeSession: (sessionId, atMs) => command({ kind: "close", sessionId, atMs }) }
}
export const makeStore = (ref: Ref.Ref<StoreState>): Store => ({
  ...sessionStoreApi(() => Effect.runSync(Ref.get(ref)), command => {
    type Attempt = { readonly ok: true; readonly value: SessionTransition["result"] } | { readonly ok: false; readonly error: unknown }
    const result = Effect.runSync(Ref.modify(ref, (st): readonly [Attempt, StoreState] => {
      try { const t = transitionSession(st, command); return [{ ok: true as const, value: t.result }, { ...st, ...t.state }] as const }
      catch (error) { return [{ ok: false as const, error }, st] as const }
    }))
    if (!result.ok) throw result.error
    return result.value
  }, "volatile"),
  putErc8004Doc: (jobId, kind, bytes) => Ref.update(ref, s => {
    const key = erc8004DocKey(jobId, kind)
    validateErc8004DocBytes(bytes)
    const existing = s.erc8004Docs.get(key)
    if (existing !== undefined) {
      if (existing !== bytes) throw new Error("registry document already exists with different bytes")
      return s
    }
    const erc8004Docs = new Map(s.erc8004Docs)
    erc8004Docs.set(key, bytes)
    return { ...s, erc8004Docs }
  }),
  getErc8004Doc: (jobId, kind) => Effect.map(Ref.get(ref), s => s.erc8004Docs.get(erc8004DocKey(jobId, kind))),
  putListing: (rec) =>
    Ref.update(ref, (s) => {
      const listings = new Map(s.listings)
      const history = s.payTests.get(payTestKey(rec.listing.id, rec.seller)) ?? []
      listings.set(rec.listing.id, decorate(rec, payTestStateOf(history)))
      return { ...s, listings }
    }),

  recordPayTest: (row) =>
    Ref.update(ref, (s) => {
      const key = payTestKey(row.skillId, row.seller)
      const payTests = new Map(s.payTests)
      const owned: PayTestRow = { ...publicPayTest(row), skillId: row.skillId,
        seller: row.seller.toLowerCase(), reason: row.reason }
      const history = chronological([...(payTests.get(key) ?? []), owned]).slice(-PAY_TEST_HISTORY)
      payTests.set(key, history)
      const listings = new Map(s.listings)
      const rec = listings.get(row.skillId)
      if (rec !== undefined && rec.seller.toLowerCase() === row.seller.toLowerCase()) {
        listings.set(row.skillId, decorate(rec, payTestStateOf(history)))
      }
      return { ...s, payTests, listings }
    }),

  payTestState: (skillId, seller) =>
    Effect.map(Ref.get(ref), (s) => payTestStateOf(s.payTests.get(payTestKey(skillId, seller)) ?? [])),

  payTestHistory: (skillId, seller) =>
    Effect.map(Ref.get(ref), (s) => (s.payTests.get(payTestKey(skillId, seller)) ?? []).map(publicPayTest)),

  allPayTested: Effect.map(Ref.get(ref), (s) => [...s.payTests.values()]
    .filter((history) => history.length > 0)
    .map((history) => ({ skillId: history[0]!.skillId, seller: history[0]!.seller, state: payTestStateOf(history) }))),

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
      if (s.sessionCalls.has(job.id)) throw new SessionConflict()
      const jobs = new Map(s.jobs)
      jobs.set(job.id, job)
      return { ...s, jobs }
    }),

  getJob: (jobId) => Effect.map(Ref.get(ref), (s) => {
    const job = s.jobs.get(jobId)
    return job !== undefined && s.sessionCalls.has(jobId) ? sessionJobCopy(job) : job
  }),

  // One current receipt per job, matching SQLite's primary-key/upsert contract.
  // Preserve its original array position and remove any legacy duplicate of that job.
  putReceipt: (r) => Ref.update(ref, (s) => {
    if (r.sessionId !== undefined || s.sessionCalls.has(r.jobId)) throw new SessionConflict()
    const index = s.receipts.findIndex(existing => existing.jobId === r.jobId)
    const receipts = index < 0 ? [...s.receipts, r] : s.receipts.flatMap((existing, i) =>
      existing.jobId === r.jobId ? i === index ? [r] : [] : [existing])
    return { ...s, receipts }
  }),
  allReceipts: Effect.map(Ref.get(ref), (s) => s.receipts.map(r => s.sessionCalls.has(r.jobId) ? sessionReceiptCopy(r) : r)),
  statsSource: Effect.succeed("hub" as const),

  /**
   * Fee accrual sweep: one on-chain tx covers many receipts, and its hash is written back
   * into each so the take-rate stays individually auditable despite being batched.
   */
  backfillFeeSweep: (accrualId, txHash) =>
    Ref.modify(ref, (s) => {
      let n = 0
      const receipts = s.receipts.map((r) => {
        if (!s.sessionCalls.has(r.jobId) && r.sessionId === undefined && r.feeAccrualId === accrualId && r.feeSweepTx === undefined) {
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
    }),

  reserveTree: (rootJobId, childJobId, amountAtomic, ceilingAtomic) =>
    Ref.modify(ref, (s) => {
      // A child job id is unique hub-wide. A caller asking to reserve the same one twice is
      // a bug upstream — refusing is the safe direction, because silently accepting it would
      // collapse to one sqlite row on the next restart (child_job_id is the PRIMARY KEY) and
      // `held` would under-report what is actually committed against the ceiling.
      if (amountAtomic <= 0n) return [false, s]
      for (const rows of s.trees.values()) {
        if (rows.some((r) => r.childJobId === childJobId)) return [false, s]
      }
      const rows = s.trees.get(rootJobId) ?? []
      const held = rows.filter((r) => r.state !== "released").reduce((n, r) => n + r.amountAtomic, 0n)
      if (held + amountAtomic > ceilingAtomic) return [false, s]
      const trees = new Map(s.trees)
      trees.set(rootJobId, [...rows, { childJobId, amountAtomic, state: "reserved" }])
      return [true, { ...s, trees }]
    }),

  claimAuthorization: (key, jobId) =>
    Ref.modify(ref, (s) => {
      if (s.authorizations.has(key)) return [false, s]
      const authorizations = new Map(s.authorizations)
      authorizations.set(key, jobId)
      return [true, { ...s, authorizations }]
    }),

  commitTree: (childJobId) => Ref.update(ref, (s) => setTreeState(s, childJobId, "committed")),
  releaseTree: (childJobId) => Ref.update(ref, (s) => setTreeState(s, childJobId, "released")),

  treeState: (rootJobId) =>
    Effect.map(Ref.get(ref), (s) => {
      const rows = s.trees.get(rootJobId) ?? []
      const sum = (st: TreeRow["state"]) => rows.filter((r) => r.state === st).reduce((n, r) => n + r.amountAtomic, 0n)
      return { reservedAtomic: sum("reserved"), committedAtomic: sum("committed"), children: rows }
    })
})

export const StoreLive = Layer.effect(
  StoreTag,
  Effect.map(Ref.make(empty()), makeStore)
)
