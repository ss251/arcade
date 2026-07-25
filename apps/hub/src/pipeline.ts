import { Effect } from "effect"
import {
  DEFAULT_FEE_BPS,
  Job,
  JobOutcome,
  Receipt,
  parsePrice,
  shouldSettle,
  splitFee,
  type PublicListing
} from "@arcade/core"
import { RailTag, type VerifiedPayment } from "@arcade/payments"
import { BrokerTag } from "./broker.ts"
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
}

export const runJob = (args: RunJobArgs) =>
  Effect.gen(function* () {
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
            outcome
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
          createdAtMs: Date.now()
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
        timeoutSec: args.listing.bounds.timeoutSec
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
