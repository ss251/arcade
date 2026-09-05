import { Cause, Effect, Either, Schema } from "effect"
import { JobOutcome, Receipt, ReceiptChild, SessionConflict, SessionStorageUnavailable, treeHashOf } from "@arcade/core"
import type { SettleTree } from "@arcade/payments"
import type { Broker } from "./broker.ts"
import type { Store } from "./store.ts"
import type { makeSessions } from "./sessions.ts"
import type { AttestTag } from "./attest.ts"
import type { RunJobArgs } from "./pipeline.ts"
import { ceilingAtomicFor } from "./lineage.ts"
import { prepareSessionOutcome, releasedSessionTerminal, sessionCallData, sessionReleaseCost, settledSessionTerminal, type PreparedSessionCall } from "./session-call.ts"

export interface SessionExecutionOptions {
  readonly store: Store; readonly broker: Broker; readonly sessions: ReturnType<typeof makeSessions>
  readonly hireCapability?: string; readonly now?: () => number
  readonly attest?: RunJobArgs["attest"]
  readonly attester?: typeof AttestTag.Service
}

/** One issued attempt, not a job registry/restart resumer. F5 alone owns money. */
export const runSessionJob = (call: PreparedSessionCall, options: SessionExecutionOptions) => {
  let attempted = false, began = false, terminal = false
  const { store, broker, sessions, now = Date.now, hireCapability, attester: service } = options
  const context = options.attest === undefined ? undefined : { ...options.attest }
  const unavailable = () => new SessionStorageUnavailable()
  const job = Effect.gen(function* () {
    const dispatch = Effect.suspend(() => broker.dispatch({ jobId: call.job.id, skillId: call.listing.id, skillVersion: call.listing.version,
      input: call.job.input, timeoutSec: call.listing.bounds.timeoutSec,
      ...(hireCapability === undefined ? {} : { hireCapability }) }))
    const raw = yield* dispatch.pipe(Effect.timeout(`${call.listing.bounds.timeoutSec + 5} seconds`),
      Effect.catchAll(() => Effect.succeed(JobOutcome.make({ status: "rejected", startedAtMs: call.job.createdAtMs, finishedAtMs: now() }))))
    const checked = yield* Effect.try({ try: () => prepareSessionOutcome(call, raw, now()), catch: unavailable }).pipe(Effect.either)
    const release = () => Effect.gen(function* () {
      const value = yield* Effect.try({ try: () => releasedSessionTerminal(call, now(), sessionReleaseCost(raw)), catch: unavailable })
      yield* sessions.release(value); terminal = true
      yield* attest(value.job.outcome!, value.receipt)
      return { outcome: value.job.outcome!, receipt: value.receipt }
    })
    if (Either.isLeft(checked)) return yield* release()
    const outcome = checked.right

    // Only an eligible EIP V2 splitter root reads the separate A tree evidence.
    // This legacy global API is NOT used by session status/polling.
    let tree: SettleTree | undefined
    if (call.rail.name === "eip3009" && call.splitterVersion === 2) {
      const st = yield* store.treeState(call.job.id)
      if (st.children.length > 0) {
        const receipts = yield* store.allReceipts
        const checkedTree = yield* Effect.try({ try: () => {
          let total = 0n
          const children: ReceiptChild[] = []
          const selected = new Map<string, Receipt>()
          for (const child of st.children) {
            const rows = receipts.filter(r => r.jobId === child.childJobId)
            if (rows.length !== 1 || selected.has(child.childJobId)) throw unavailable()
            const receipt = Schema.decodeUnknownSync(Receipt, { onExcessProperty: "error" })(sessionCallData(rows[0]))
            if (receipt.sessionId !== undefined || receipt.rootJobId !== call.job.id || receipt.priceAtomic !== child.amountAtomic ||
              receipt.priceAtomic < 0n || receipt.priceAtomic >= 1n << 256n ||
              receipt.rail !== "eip3009" || receipt.network !== call.binding.network ||
              !/^[a-z0-9][a-z0-9-]{0,127}$/.test(receipt.skillId) ||
              receipt.parentJobId === undefined || receipt.hop === undefined || !Number.isSafeInteger(receipt.hop) || receipt.hop < 1 ||
              receipt.ancestors?.length !== receipt.hop || receipt.ancestors[0] !== call.listing.id ||
              (child.state === "committed" ? !receipt.settled : child.state !== "released" || receipt.settled)) throw unavailable()
            selected.set(receipt.jobId, receipt)
            if (child.state === "committed") {
              if (typeof receipt.settleTx !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(receipt.settleTx) || /^0x0{64}$/.test(receipt.settleTx) ||
                receipt.settleRefKind !== undefined && receipt.settleRefKind !== "onchain") throw unavailable()
              total += receipt.priceAtomic
              children.push(ReceiptChild.make({ jobId: receipt.jobId, skillId: receipt.skillId, priceAtomic: receipt.priceAtomic,
                settled: true, settleTx: receipt.settleTx }))
            }
          }
          // A's rows are FLAT descendants. Correlate their actual parent chain;
          // never assume every row is direct or invent a missing receipt.
          for (const receipt of selected.values()) {
            if (receipt.hop === 1) { if (receipt.parentJobId !== call.job.id) throw unavailable() }
            else {
              const parent = selected.get(receipt.parentJobId!)
              if (parent === undefined || parent.hop !== receipt.hop! - 1 ||
                JSON.stringify(receipt.ancestors) !== JSON.stringify([...(parent.ancestors ?? []), parent.skillId])) throw unavailable()
            }
          }
          if (total !== st.committedAtomic || st.reservedAtomic !== 0n || total > ceilingAtomicFor(call.listing.bounds.maxSubSpendUsd)) throw unavailable()
          return children.length === 0 ? undefined : { treeHash: treeHashOf(call.job.id, children), childCount: children.length, childTotalAtomic: total }
        }, catch: unavailable }).pipe(Effect.either)
        if (Either.isLeft(checkedTree)) return yield* release()
        tree = checkedTree.right
      }
    }
    // Current-window check before the barrier. Never interpret expiry AFTER it as release authority.
    const current = now()
    if (!Number.isSafeInteger(current) || current < call.job.createdAtMs ||
      BigInt(Math.floor(current / 1000)) < call.binding.validAfter || BigInt(Math.floor(current / 1000)) >= call.binding.validBefore) return yield* release()
    const claim = yield* sessions.beginSettlement(call.binding.sessionId, call.job.id)
    if (!claim.claimed) return yield* new SessionConflict()
    began = true
    const payment = yield* Effect.suspend(() => call.rail.settle(call.verified, tree)).pipe(Effect.timeout("30 seconds"))
    const value = yield* Effect.try({ try: () => settledSessionTerminal(call, outcome, now(), payment), catch: unavailable })
    yield* sessions.commit(value); terminal = true
    yield* attest(outcome, value.receipt)
    return { outcome, receipt: value.receipt }
  })
  const attest = (outcome: JobOutcome, receipt: import("@arcade/core").Receipt) => {
    if (call.rail.name !== "eip3009" || context === undefined || service === undefined) return Effect.void
    return Effect.suspend(() => service.onTerminal({ jobId: call.job.id, agentId: context.agentId, skillId: call.listing.id,
      skillVersion: call.listing.version, seller: call.binding.seller, buyer: call.binding.buyer, payTo: call.binding.payTo,
      origin: context.origin, input: call.job.input, output: receipt.settled ? outcome.output : undefined,
      outputSchema: call.listing.outputSchema, status: outcome.status, stopReason: outcome.stopReason,
      settled: receipt.settled, reason: receipt.reason, priceAtomic: receipt.priceAtomic,
      ...(receipt.settleTx === undefined ? {} : { settleTx: receipt.settleTx }), createdAtMs: receipt.createdAtMs,
      chainId: context.chainId, identityRegistry: context.identityRegistry })).pipe(
      Effect.timeoutOption("50 millis"), Effect.asVoid, Effect.catchAllCause(() => Effect.void))
  }
  const owned = job.pipe(Effect.onError(() => began && !terminal
    ? Effect.suspend(() => sessions.markUncertain(call.binding.sessionId, call.job.id)).pipe(
      // onError cleanup is uninterruptible; its child must be interruptible for
      // the local deadline to finish. Marker failure never releases the hold.
      Effect.interruptible, Effect.timeoutOption("50 millis"), Effect.asVoid, Effect.catchAllCause(() => Effect.void)) : Effect.void),
    Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.failCause(cause) : Effect.fail(unavailable())))
  // A rejected observer never enters the owner's cleanup, even while settlement
  // is active. This latch belongs to this issued Effect, not each evaluation.
  return Effect.suspend(() => {
    if (attempted) return Effect.fail(new SessionConflict())
    attempted = true
    return owned
  })
}
