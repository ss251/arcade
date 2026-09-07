/** Funded root escrow execution. Never use the legacy uncashed-authorization refund path. */
import { Data, Effect, Option, Schema } from "effect"
import { Bounds, hashJson, Job, JobOutcome, PublicListing, Receipt, ReceiptChild, assertOutputSize,
  mintHireCapability, parsePrice, shouldSettle, treeHashOf, validateJson } from "@arcade/core"
import { captureEscrowRequirements, escrowActionContext, escrowAddress, escrowCheck, escrowCompletionProjection,
  escrowContextToWire, escrowFeeQuote, escrowProviderContextHash, escrowRecord, ERC8183_ZERO_HASH,
  type Erc8183Rail, type VerifiedEscrow, type EscrowActionProof } from "@arcade/payments"
import { BrokerTag } from "./broker.ts"
import { StoreTag, type Store } from "./store.ts"
import { AttestTag } from "./attest.ts"
import type { RunJobArgs } from "./pipeline.ts"
import type { EscrowRootTreeState } from "./escrow-tree.ts"
import { ceilingAtomicFor } from "./lineage.ts"
import { decodeEscrowJob, decodeEscrowReceipt, escrowEvidenceBytes, escrowJobWire, escrowReceiptWire,
  escrowTerminalEvidence, type EscrowTerminal } from "./escrow-terminal.ts"
export class EscrowPipelineUnavailable extends Data.TaggedError("EscrowPipelineUnavailable") {}
export interface RunEscrowJobArgs {
  readonly jobId: string; readonly verified: VerifiedEscrow; readonly rail: Erc8183Rail
  /** Trusted hub HMAC secret, never a caller-supplied capability. Not persisted. */
  readonly hireSecret?: string
  readonly attest?: RunJobArgs["attest"]
}
/** Only declared public data classes; no getters, extra fields or private manifests. */
function plain(raw: unknown, model: { prototype: object; fields: Record<string, unknown> }): unknown {
  escrowCheck(raw && typeof raw === "object" && [Object.prototype, model.prototype].includes(Object.getPrototypeOf(raw)))
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(raw)) {
    escrowCheck(typeof key === "string" && Object.hasOwn(model.fields, key))
    const d = Object.getOwnPropertyDescriptor(raw, key); escrowCheck(d && d.enumerable && "value" in d)
    if (d.value !== undefined) result[key] = model === PublicListing && key === "bounds" ? plain(d.value, Bounds) : d.value
  }
  return JSON.parse(escrowEvidenceBytes(result))
}
const capturedOutcome = (raw: unknown, queued: Job, now: number) => {
  const outcome = Schema.decodeUnknownSync(JobOutcome, { onExcessProperty: "error" })(plain(raw, JobOutcome))
  escrowCheck(!["queued", "running"].includes(outcome.status) && Number.isSafeInteger(outcome.startedAtMs) &&
    Number.isSafeInteger(outcome.finishedAtMs) && outcome.startedAtMs >= queued.createdAtMs &&
    outcome.finishedAtMs >= outcome.startedAtMs && outcome.finishedAtMs <= now &&
    (outcome.costUsd === undefined || Number.isFinite(outcome.costUsd) && outcome.costUsd >= 0))
  return outcome
}
/** Build from full stored child evidence, not a runner-claimed compact manifest. */
const actualTree = (store: Store, root: Job, state: EscrowRootTreeState) => Effect.gen(function* () {
  escrowCheck(state.closed && state.reservedAtomic === 0n)
  const all = yield* store.allReceipts, children: ReceiptChild[] = []
  const committed = state.children.filter(row => row.state === "committed")
  const full = new Map<string, Receipt>()
  for (const row of committed) {
    const matches = all.filter(receipt => receipt.jobId === row.childJobId); escrowCheck(matches.length === 1)
    const r = decodeEscrowReceipt(escrowReceiptWire(matches[0]!))
    escrowCheck(r.rail !== "erc8183" && r.escrow === undefined && r.sessionId === undefined && r.network === "eip155:5042002" &&
      r.rootJobId === root.id && r.hop !== undefined && r.hop > 0 && r.parentJobId !== undefined && r.settled && r.priceAtomic === row.amountAtomic &&
      r.settleTx !== undefined && r.settleTx.length > 0 && r.settleTx.length <= 256)
    full.set(r.jobId, r)
  }
  for (const r of full.values()) {
    let descendant = r
    for (let depth = 0; ; depth++) {
      escrowCheck(depth < 1000)
      const matches = descendant.parentJobId === root.id ? [] : all.filter(candidate => candidate.jobId === descendant.parentJobId)
      escrowCheck(descendant.parentJobId === root.id || matches.length === 1)
      const parent = descendant.parentJobId === root.id ? root : decodeEscrowReceipt(escrowReceiptWire(matches[0]!))
      if (parent instanceof Receipt) escrowCheck(parent.rail !== "erc8183" && parent.escrow === undefined && parent.sessionId === undefined &&
        parent.network === "eip155:5042002" && parent.rootJobId === root.id)
      escrowCheck(descendant.hop === parent.hop! + 1 && descendant.buyer.toLowerCase() === parent.seller.toLowerCase() &&
        descendant.ancestors !== undefined && JSON.stringify(descendant.ancestors) === JSON.stringify([...(parent.ancestors ?? []), parent.skillId]))
      if (parent === root) break
      descendant = parent as Receipt
    }
    children.push(ReceiptChild.make({ jobId: r.jobId, skillId: r.skillId, priceAtomic: r.priceAtomic, settled: true, settleTx: r.settleTx }))
  }
  escrowCheck(children.reduce((n, r) => n + r.priceAtomic, 0n) === state.committedAtomic)
  return { children, treeHash: children.length ? treeHashOf(root.id, children) : ERC8183_ZERO_HASH,
    ceiling: state.ceilingAtomic, committed: state.committedAtomic }
})
type Tree = Effect.Effect.Success<ReturnType<typeof actualTree>>
/** Clock seam is internal/test-only. Production uses the hub clock; no HTTP override. */
export function runEscrowJob(args: RunEscrowJobArgs, clock: () => number = Date.now) {
  let claimed = false, durable = false, cleanup: (() => Effect.Effect<void>) | undefined
  let previous = 0
  const now = () => { const value = clock(); escrowCheck(Number.isSafeInteger(value) && value >= previous && value >= 0); previous = value; return value }
  const program = Effect.gen(function* () {
    const store = yield* StoreTag, broker = yield* BrokerTag, escrow = store.escrow
    escrowCheck(escrow?.durability === "durable" && args.rail.name === "erc8183")
    const raw = escrowRecord(args.verified, ["rail", "stage", "payer", "payTo", "amountAtomic", "network", "context", "requirements"])
    const context = escrowActionContext(raw.context), c = context.call, terms = captureEscrowRequirements(raw.requirements)
    escrowCheck(raw.rail === "erc8183" && raw.stage === "funded" && raw.network === "eip155:5042002" &&
      raw.payer === context.client && raw.payTo === c.provider && raw.amountAtomic === c.amount &&
      escrowProviderContextHash({ ...context, call: terms.call }) === escrowProviderContextHash(context))
    const owned = yield* escrow.get(args.jobId)
    escrowCheck(owned && escrowProviderContextHash(owned.context) === escrowProviderContextHash(context))
    if (owned.state !== "admitted") return { kind: "existing" as const, jobId: owned.job.id }
    const queued = decodeEscrowJob(escrowJobWire(owned.job)), current = yield* store.getListing(c.skillId)
    const listing = Schema.decodeUnknownSync(PublicListing, { onExcessProperty: "error" })(plain(current.listing, PublicListing))
    escrowCheck(!current.delisted && current.agentVerified === true && current.agentId === String(c.providerAgentId) &&
      escrowAddress(current.seller) === c.provider && listing.rails?.includes("erc8183") && listing.id === c.skillId &&
      listing.version === c.skillVersion && parsePrice(listing.price) === c.amount && listing.bounds.timeoutSec === c.timeoutSeconds &&
      hashJson(queued.input) === c.inputHash && validateJson(queued.input, listing.inputSchema))
    const at = now(), ceiling = ceilingAtomicFor(listing.bounds.maxSubSpendUsd)
    escrowCheck(at >= queued.createdAtMs && context.expiredAt - Math.floor(at / 1000) >= c.timeoutSeconds + 600)
    if (ceiling > 0n) escrowCheck(typeof args.hireSecret === "string" && args.hireSecret.length >= 32)
    const acquired = yield* escrow.begin(context, queued.id)
    if (!acquired.claimed) return { kind: "existing" as const, jobId: queued.id }
    claimed = true
    cleanup = () => Effect.gen(function* () {
      yield* escrow.closeTree(context, queued.id).pipe(Effect.catchAllCause(() => Effect.void))
      yield* escrow.uncertain(context, queued.id).pipe(Effect.catchAllCause(() => Effect.void))
    })
    yield* escrow.prepareTree(context, queued.id, ceiling)
    const hireCapability = ceiling === 0n ? undefined : mintHireCapability(args.hireSecret!, queued.id, at + (listing.bounds.timeoutSec + 60) * 1000)
    const rawOutcome = yield* broker.dispatch({ jobId: queued.id, skillId: listing.id, skillVersion: listing.version, input: queued.input,
      timeoutSec: listing.bounds.timeoutSec, escrow: escrowContextToWire(context), ...(hireCapability === undefined ? {} : { hireCapability }) }).pipe(
      Effect.timeoutFail({ duration: `${listing.bounds.timeoutSec + 5} seconds`, onTimeout: () => JobOutcome.make({ status: "timeout",
        startedAtMs: at, finishedAtMs: now(), error: "escrow runner timeout" }) }),
      Effect.catchAll(e => Effect.succeed(e instanceof JobOutcome ? e : JobOutcome.make({ status: e._tag === "NoRunnerAvailable" ? "failed" : "runner_lost",
        startedAtMs: at, finishedAtMs: now(), error: "escrow runner unavailable" }))))
    const closed = yield* escrow.closeTree(context, queued.id)
    let outcome: JobOutcome
    try { outcome = capturedOutcome(rawOutcome, queued, now()) }
    catch { outcome = JobOutcome.make({ status: "invalid", startedAtMs: at, finishedAtMs: now(), error: "escrow runner result invalid" }) }
    const finish = (proof: EscrowActionProof | null, submission: EscrowTerminal["submission"], tree?: Tree) => Effect.gen(function* () {
      const evidence = escrowTerminalEvidence(context, proof), settled = evidence.state === "settled", createdAtMs = now(), fee = escrowFeeQuote(c.amount)
      const reason = settled ? "ok" : evidence.state === "refunded" ? "escrow refunded" : "escrow outcome uncertain; reconciliation required"
      const receipt = Receipt.make({ jobId: queued.id, skillId: listing.id, skillVersion: listing.version, buyer: context.client, seller: c.provider,
        priceAtomic: c.amount, sellerAtomic: fee.sellerAtomic, feeAtomic: fee.feeAtomic, feeBps: 500,
        ...(outcome.costUsd === undefined ? {} : { sellerCostUsd: outcome.costUsd }), rail: "erc8183", network: "eip155:5042002",
        settled, reason, createdAtMs, latencyMs: createdAtMs - queued.createdAtMs, rootJobId: queued.id, hop: 0, ancestors: [], escrow: evidence,
        ...(settled ? { settleTx: proof!.txHash, settleRefKind: "onchain" as const } : {}),
        ...(tree === undefined ? {} : { children: tree.children, treeHash: tree.treeHash, treeCeilingAtomic: tree.ceiling, treeCommittedAtomic: tree.committed }) })
      const completion = settled ? escrowCompletionProjection(context, { hubJobId: queued.id, outputHash: hashJson(outcome.output),
        treeHash: tree!.treeHash, childCount: tree!.children.length, childTotalAtomic: tree!.committed }) : null
      const saved = yield* escrow.finish(context, { job: Job.make({ ...queued, status: outcome.status, outcome }), receipt, proof, submission, completion })
      durable = true
      if (saved.created && proof !== null && args.attest !== undefined) {
        const service = yield* Effect.serviceOption(AttestTag), a = args.attest
        if (Option.isSome(service)) yield* Effect.suspend(() => service.value.onTerminal({ jobId: queued.id, agentId: a.agentId,
          skillId: listing.id, skillVersion: listing.version, seller: c.provider, buyer: context.client, payTo: c.provider, origin: a.origin,
          input: queued.input, output: outcome.output, outputSchema: listing.outputSchema, status: outcome.status, stopReason: outcome.stopReason,
          settled, reason, priceAtomic: c.amount, ...(settled ? { settleTx: proof.txHash } : {}), createdAtMs,
          chainId: 5042002, identityRegistry: a.identityRegistry })).pipe(Effect.timeoutOption("50 millis"), Effect.asVoid, Effect.catchAllCause(() => Effect.void))
      }
      return { kind: "terminal" as const, outcome, receipt }
    })
    if (closed.reservedAtomic !== 0n) return yield* finish(null, null)
    const tree = yield* actualTree(store, queued, closed)
    let valid = false
    try { assertOutputSize(outcome.output); valid = validateJson(outcome.output, listing.outputSchema) } catch { /* Refuse oversized output. */ }
    if (!shouldSettle(outcome, valid).settle) {
      const rejected = yield* Effect.either(args.rail.reject(args.verified, "output_invalid"))
      return yield* finish(rejected._tag === "Right" ? rejected.right : null, null, tree)
    }
    const outputHash = hashJson(outcome.output), submitted = yield* Effect.either(args.rail.submit(args.verified, outputHash))
    if (submitted._tag === "Left") return yield* finish(null, null, tree)
    escrowCheck(submitted.right.kind === "submit" && submitted.right.sellerAtomic === 0n && submitted.right.feeAtomic === 0n &&
      submitted.right.refundAtomic === 0n && submitted.right.submittedAt === submitted.right.blockTimestamp &&
      submitted.right.blockTimestamp * 1000 <= now())
    const complete = yield* Effect.either(args.rail.settle(args.verified, { treeHash: tree.treeHash, childCount: tree.children.length,
      childTotalAtomic: tree.committed }, { hubJobId: queued.id, outputHash }))
    if (complete._tag === "Left") return yield* finish(null, null, tree)
    escrowCheck(complete.right.txHash === complete.right.proof.txHash && complete.right.payer === context.client &&
      complete.right.amountAtomic === c.amount && complete.right.settlementKind === "onchain")
    return yield* finish(complete.right.proof, { proof: submitted.right, outputHash }, tree)
  })
  return program.pipe(Effect.onError(() => claimed && !durable && cleanup ? cleanup() : Effect.void),
    Effect.catchAllCause(() => Effect.fail(new EscrowPipelineUnavailable())))
}
