import { Effect } from "effect"
import {
  DEFAULT_FEE_BPS,
  Job,
  JobOutcome,
  Receipt,
  ReceiptChild,
  parsePrice,
  shouldSettle,
  splitFee,
  treeHashOf,
  type Lineage,
  type PublicListing
} from "@arcade/core"
import { RailTag, type VerifiedPayment } from "@arcade/payments"
import { BrokerTag } from "./broker.ts"
import { ceilingAtomicFor } from "./lineage.ts"
import { StoreTag } from "./store.ts"
import { validateOutput } from "./validate.ts"

/**
 * THE PIPELINE: verify → execute → validate → settle.
 *
 * Payment is verified BEFORE the seller does any work, and cashed only AFTER the output
 * passes. Every failure path below produces a receipt with `settled: false` and no
 * settlement transaction, which IS the refund — the buyer's signed authorization simply
 * expires uncashed.
 *
 * This ordering is why Circle's Express middleware can't be used: it settles inside the
 * HTTP request, but our jobs finish minutes after the request returned 202.
 */

export interface RunJobArgs {
  readonly jobId: string
  readonly listing: PublicListing
  readonly seller: string
  readonly input: unknown
  readonly verified: VerifiedPayment
  readonly feeBps?: number
  readonly accrualId?: string
  readonly lineage: Lineage
  readonly hireCapability?: string
}

export const runJob = (args: RunJobArgs) => {
  // Whether THIS job's tree reservation has already been resolved (committed or released).
  // Starts `true` for a root — it never held one — and is flipped by `finish` the instant
  // its commit/release call succeeds, so the crash net below knows not to touch a
  // reservation a second time.
  let ledgerResolved = args.lineage.hop <= 0

  const job = Effect.gen(function* () {
    const rail = yield* RailTag
    const broker = yield* BrokerTag
    const store = yield* StoreTag

    const startedAtMs = Date.now()
    const feeBps = args.feeBps ?? DEFAULT_FEE_BPS
    const priceAtomic = parsePrice(args.listing.price)
    const { sellerAtomic, feeAtomic } = splitFee(priceAtomic, feeBps)

    const finish = (
      outcome: JobOutcome,
      settled: boolean,
      reason: string,
      settleTx?: string
    ) =>
      Effect.gen(function* () {
        // Ledger: a child's outcome commits or releases its reservation against the root's
        // ceiling. This covers every ORDINARY terminal branch below — settled, unsettled,
        // timeout, runner lost — because every one of them calls `finish`. It does NOT, by
        // itself, cover a defect raised before this line ever runs (a schema throw building
        // the receipt below, a store defect, `validateOutput` throwing): server.ts's
        // `catchAllCause` around `runJob` only logs such a crash, it does not touch the
        // ledger. That gap is closed by the `Effect.onError` net wrapped around the whole
        // job at the bottom of this function, which releases on escape UNLESS this line has
        // already run — hence flipping `ledgerResolved` right here, before anything below
        // that could still throw.
        if (args.lineage.hop > 0) {
          yield* settled ? store.commitTree(args.jobId) : store.releaseTree(args.jobId)
          ledgerResolved = true
        }

        // Persist the job with its outcome so /jobs/:id/result can return the actual output.
        yield* store.putJob(
          Job.make({
            id: args.jobId,
            skillId: args.listing.id,
            seller: args.seller,
            buyer: args.verified.payer,
            priceAtomic,
            input: args.input,
            status: outcome.status,
            createdAtMs: startedAtMs,
            outcome,
            rootJobId: args.lineage.rootJobId,
            ...(args.lineage.parentJobId === undefined ? {} : { parentJobId: args.lineage.parentJobId }),
            hop: args.lineage.hop,
            ancestors: args.lineage.ancestors
          })
        )

        const receipt = Receipt.make({
          jobId: args.jobId,
          skillId: args.listing.id,
          skillVersion: args.listing.version,
          buyer: args.verified.payer,
          seller: args.seller,
          priceAtomic,
          sellerAtomic,
          ...(outcome.costUsd === undefined ? {} : { sellerCostUsd: outcome.costUsd }),
          feeAtomic,
          feeBps,
          ...(settleTx === undefined ? {} : { settleTx }),
          ...(args.accrualId === undefined || !settled ? {} : { feeAccrualId: args.accrualId }),
          rail: rail.name,
          network: args.verified.network,
          latencyMs: Date.now() - startedAtMs,
          settled,
          reason,
          createdAtMs: Date.now(),
          rootJobId: args.lineage.rootJobId,
          ...(args.lineage.parentJobId === undefined ? {} : { parentJobId: args.lineage.parentJobId }),
          hop: args.lineage.hop,
          ancestors: args.lineage.ancestors,
          ...(tree === undefined
            ? {}
            : {
                children: tree.children,
                treeHash: tree.treeHash,
                treeCeilingAtomic: tree.ceiling,
                treeCommittedAtomic: tree.committed
              }),
          authorizationNonce: args.verified.payload.payload.authorization.nonce
        })
        yield* store.putReceipt(receipt)
        return { outcome, receipt }
      })

    // ---- execute ------------------------------------------------------------
    const outcome = yield* broker
      .dispatch({
        jobId: args.jobId,
        skillId: args.listing.id,
        skillVersion: args.listing.version,
        input: args.input,
        timeoutSec: args.listing.bounds.timeoutSec,
        ...(args.lineage.parentJobId === undefined ? {} : { parentJobId: args.lineage.parentJobId }),
        ...(args.hireCapability === undefined ? {} : { hireCapability: args.hireCapability })
      })
      .pipe(
        // Belt and braces: the runner enforces its own timeout, and so do we. A runner that
        // hangs or lies cannot hold a buyer's request open.
        Effect.timeoutFail({
          duration: `${args.listing.bounds.timeoutSec + 5} seconds`,
          onTimeout: () =>
            JobOutcome.make({
              status: "timeout",
              startedAtMs,
              finishedAtMs: Date.now(),
              error: `exceeded ${args.listing.bounds.timeoutSec}s`
            })
        }),
        Effect.catchAll((e) =>
          Effect.succeed(
            e instanceof JobOutcome
              ? e
              : JobOutcome.make({
                  status: e._tag === "NoRunnerAvailable" ? "failed" : "runner_lost",
                  startedAtMs,
                  finishedAtMs: Date.now(),
                  error: e._tag
                })
          )
        )
      )

    // ---- tree (roots only) ----------------------------------------------------
    // A root's children are terminal BY CONSTRUCTION at this point: a child call only ever
    // reaches its own `broker.dispatch` from inside the parent's sandboxed run, which the
    // parent's own `broker.dispatch` awaits — so every hire the parent made has already
    // committed or released before this outcome could come back. That is what makes
    // `treeHash` and `treeCommittedAtomic` a stable pair: nothing can commit or release a
    // child of THIS root after they are computed here. Computed before the settle decision,
    // not inside `finish`, so Task 7's `rail.settle` can carry `tree.treeHash` into the
    // on-chain commitment; nothing after this point may change what it committed to.
    let tree:
      | { readonly children: ReadonlyArray<ReceiptChild>; readonly treeHash: `0x${string}`; readonly ceiling: bigint; readonly committed: bigint }
      | undefined
    if (args.lineage.hop === 0) {
      const st = yield* store.treeState(args.jobId)
      const receipts = yield* store.allReceipts
      const children = st.children
        .filter((c) => c.state !== "released")
        .map((c) => {
          const cr = receipts.find((r) => r.jobId === c.childJobId)
          // Falling back to the child's OWN job id (rather than "") keeps a receipt whose
          // child hasn't landed yet identifiable in the tree instead of blank.
          return ReceiptChild.make({
            jobId: c.childJobId,
            skillId: cr?.skillId ?? c.childJobId,
            priceAtomic: c.amountAtomic,
            settled: cr?.settled ?? false,
            ...(cr?.settleTx === undefined ? {} : { settleTx: cr.settleTx })
          })
        })
      const ceiling = ceilingAtomicFor(args.listing.bounds.maxSubSpendUsd)
      tree = { children, treeHash: treeHashOf(args.jobId, children), ceiling, committed: st.committedAtomic }
    }

    // ---- validate -----------------------------------------------------------
    const schemaValid = validateOutput(outcome.output, args.listing.outputSchema)
    const decision = shouldSettle(outcome, schemaValid)

    if (!decision.settle) {
      // No settlement. The authorization is never broadcast, so the buyer pays nothing.
      return yield* finish(outcome, false, decision.reason)
    }

    // ---- settle -------------------------------------------------------------
    const settled = yield* rail.settle(args.verified).pipe(
      Effect.map((s) => ({ ok: true as const, txHash: s.txHash })),
      Effect.catchAll((e) => Effect.succeed({ ok: false as const, reason: e._tag }))
    )

    if (!settled.ok) {
      return yield* finish(outcome, false, `settlement failed (${settled.reason})`)
    }

    return yield* finish(outcome, true, "ok", settled.txHash)
  })

  // Crash net. `finish` above resolves the ledger for every ORDINARY terminal branch, but a
  // defect that escapes before `finish` ever runs — a broker/store defect, a schema throw —
  // would otherwise leave a child's reservation held forever: server.ts wraps `runJob` in
  // `catchAllCause` only to log it. `Effect.onError` fires on a typed failure, a defect, OR
  // an interruption, so this is the one place that has to be right; `ledgerResolved` (set by
  // `finish`, above) is what keeps it from double-releasing a reservation `finish` already
  // resolved. A no-op for a root, which never held a reservation to begin with.
  return job.pipe(
    Effect.onError(() =>
      ledgerResolved
        ? Effect.void
        : Effect.flatMap(StoreTag, (store) => store.releaseTree(args.jobId))
    )
  )
}
