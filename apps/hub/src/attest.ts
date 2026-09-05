import { Cause, Context, Effect, Layer, Queue, Ref, Schedule, type Scope } from "effect"
import { buildFeedback, buildValidationRequest, buildValidationResponse, docHash, feedbackUrl,
  loadChainConfig, validationRequestUrl, validationResponseUrl } from "@arcade/core"
import { Erc8004Failed, Erc8004Tag, type Erc8004 } from "./erc8004.ts"

/** Only terminal receipt facts enter this best-effort service; it never decides payment. */
export interface AttestJob {
  readonly jobId: string
  readonly agentId?: string | undefined
  readonly skillId: string
  readonly skillVersion: string
  readonly seller: string
  readonly buyer: string
  readonly payTo: string
  readonly origin: string
  readonly input: unknown
  readonly output: unknown
  readonly outputSchema: unknown
  readonly status: string
  readonly stopReason?: string | undefined
  readonly settled: boolean
  readonly reason: string
  readonly priceAtomic: bigint
  readonly settleTx?: string | undefined
  readonly createdAtMs: number
  readonly chainId: number
  readonly identityRegistry: string
}
export interface AttestOutcome {
  readonly skipped?: string
  readonly requestTx?: string
  readonly responseTx?: string
  readonly feedbackTx?: string
  readonly errors: ReadonlyArray<string>
}
export interface Attest {
  readonly onTerminal: (job: AttestJob) => Effect.Effect<void>
  readonly idle: Effect.Effect<void>
}
export class AttestTag extends Context.Tag("@arcade/hub/Attest")<AttestTag, Attest>() {}

const QUEUE_CAPACITY = 512
const WRITE_TIMEOUT_MS = 90_000
const hashOk = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
const log = (message: string) => Effect.sync(() => { try { console.warn(message) } catch { /* Diagnostics are best effort too. */ } })
const invalid = (): AttestOutcome => ({ errors: ["attestation input could not be validated"] })

/** A retry is allowed only for an explicitly safe pre-broadcast refusal. A missing
 * retryable flag is not proof of safety; a timeout or lost RPC reply may already have sent. */
const write = (op: string, action: () => Effect.Effect<string, Erc8004Failed>) => Effect.suspend(action).pipe(
  Effect.timeoutFail({ duration: WRITE_TIMEOUT_MS,
    onTimeout: () => new Erc8004Failed({ op, reason: "write deadline exceeded", retryable: false }) }),
  Effect.retry({ times: 1, while: error => error.retryable === true }),
  Effect.flatMap(tx => hashOk(tx) ? Effect.succeed(tx) : Effect.fail(new Erc8004Failed({ op, reason: "invalid hash", retryable: false }))),
  Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt :
    Effect.fail(new Erc8004Failed({ op, reason: `${op} did not confirm; inspect chain before retrying`, retryable: false }))),
  Effect.either
)

export const processOne = (erc8004: Erc8004, job: AttestJob): Effect.Effect<AttestOutcome> => Effect.gen(function* () {
  if (!erc8004.armed) return { skipped: "hub is not armed for ERC-8004", errors: [] }
  if (job.agentId === undefined) return { skipped: "no agent registered for this listing", errors: [] }
  const chain = loadChainConfig("arc-testnet")
  if (job.chainId !== chain.chainId || job.identityRegistry.toLowerCase() !== chain.erc8004!.identity.toLowerCase() ||
    job.identityRegistry.toLowerCase() !== erc8004.registries.identity.toLowerCase() || (job.settled && !hashOk(job.settleTx))) return invalid()

  // Validate ALL documents before a write. No public document contains raw payloads or
  // provider reasons. A receipt's timestamp is reused so commitments are reproducible.
  const requestDoc = buildValidationRequest({ ...job, agentId: job.agentId })
  const requestHash = docHash(requestDoc)
  const responseDoc = buildValidationResponse({ ...job, requestHash, decidedAtMs: job.createdAtMs })
  const responseHash = docHash(responseDoc)
  const feedbackDoc = job.settled && job.settleTx !== undefined ? buildFeedback({ ...job, agentId: job.agentId,
    settleTx: job.settleTx, attester: erc8004.addresses.attester }) : undefined
  const feedbackHash = feedbackDoc === undefined ? undefined : docHash(feedbackDoc)
  // A verified Hello is only a dated snapshot. The NFT may have transferred while the
  // job ran; an operator approved by its new owner must not attest the old seller's job.
  const owner = yield* Effect.suspend(() => erc8004.ownerOf(job.agentId!)).pipe(
    Effect.timeoutFail({ duration: 5000, onTimeout: () => new Erc8004Failed({ op: "ownerOf", reason: "ownership read deadline exceeded" }) })
  )
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner) || owner.toLowerCase() !== job.seller.toLowerCase()) {
    return { skipped: "current seller ownership could not be confirmed", errors: [] }
  }
  const request = yield* write("validationRequest", () => erc8004.requestValidation({ agentId: job.agentId!,
    requestURI: validationRequestUrl(job.origin, job.jobId), requestHash }))
  if (request._tag === "Left") return { errors: [request.left.reason] }
  const errors: string[] = []
  const response = yield* write("validationResponse", () => erc8004.respondValidation({ requestHash,
    response: responseDoc.response, responseURI: validationResponseUrl(job.origin, job.jobId), responseHash }))
  if (response._tag === "Left") errors.push(response.left.reason)
  let feedbackTx: string | undefined
  if (feedbackDoc !== undefined && feedbackHash !== undefined) {
    const feedback = yield* write("giveFeedback", () => erc8004.giveFeedback({ agentId: job.agentId!, skillId: job.skillId,
      endpoint: feedbackDoc.endpoint, feedbackURI: feedbackUrl(job.origin, job.jobId), feedbackHash }))
    if (feedback._tag === "Left") errors.push(feedback.left.reason)
    else feedbackTx = feedback.right
  }
  return { requestTx: request.right, ...(response._tag === "Right" ? { responseTx: response.right } : {}),
    ...(feedbackTx === undefined ? {} : { feedbackTx }), errors }
}).pipe(Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt : Effect.succeed(invalid())))

/** Single scoped worker keeps wallet nonces serialized. Count accepted work BEFORE
 * offering it, so idle cannot observe an empty queue between take and processing. */
export const makeAttest = (erc8004: Erc8004): Effect.Effect<Attest, never, Scope.Scope> => Effect.gen(function* () {
  const queue = yield* Effect.acquireRelease(Queue.dropping<AttestJob>(QUEUE_CAPACITY), Queue.shutdown)
  const pending = yield* Ref.make(0)
  let closed = false
  yield* Effect.addFinalizer(() => Effect.sync(() => { closed = true }))
  const worker = Effect.gen(function* () {
    const job = yield* Queue.take(queue)
    yield* processOne(erc8004, job).pipe(
      Effect.flatMap(out => out.errors.length ? log("[hub] ERC-8004 attestation incomplete; receipt unchanged") : Effect.void),
      Effect.ensuring(Ref.update(pending, n => n - 1))
    )
  }).pipe(Effect.forever)
  yield* Effect.forkScoped(worker)
  return {
    onTerminal: job => Effect.uninterruptible(Effect.gen(function* () {
      if (closed) return
      yield* Ref.update(pending, n => n + 1)
      const accepted = yield* Queue.offer(queue, job).pipe(Effect.onExit(exit =>
        exit._tag === "Failure" ? Ref.update(pending, n => n - 1) : Effect.void))
      if (!accepted) {
        yield* Ref.update(pending, n => n - 1)
        yield* log("[hub] ERC-8004 queue full; attestation dropped, receipt unchanged")
      }
    })),
    idle: Effect.repeat(Ref.get(pending), { while: n => n > 0 && !closed, schedule: Schedule.spaced("5 millis") }).pipe(Effect.asVoid)
  }
})
export const AttestLive: Layer.Layer<AttestTag, never, Erc8004Tag> = Layer.scoped(AttestTag, Effect.flatMap(Erc8004Tag, makeAttest))
