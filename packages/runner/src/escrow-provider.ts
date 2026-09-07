/** One original socket's provider signing authority. Never broadcasts or auto-retries. */
import { Schema } from "effect"
import { EscrowProviderRequest, EscrowProviderReply, type PublicListing } from "@arcade/core"
import { assertEscrowProviderSignature, assertEscrowProviderJob, boundEscrowIO, captureEscrowIdentity, captureEscrowProviderIntent,
  createEscrowProviderReader, escrowActionContext, escrowAddress, escrowCheck, escrowContextFromWire,
  escrowProviderContextHash, escrowProviderTypedData, escrowRecord, escrowSeconds,
  providerAuthorizationDeadline, randomProviderNonce, type EscrowActionContext,
  type EscrowProviderClaim, type EscrowProviderJournal, type EscrowSnapshot } from "@arcade/payments"
import type { Hex } from "viem"
import { captureLocalEscrowAssignment, captureLocalEscrowCompletion, captureLocalEscrowListing } from "./escrow-local.ts"
export interface EscrowProviderSessionOptions {
  readonly identity: unknown; readonly provider: Hex
  readonly currentListing: (skillId: string) => { readonly listing: PublicListing; readonly providerAgentId: bigint } | undefined
  readonly resourceFor: (skillId: string) => string
  /** Must refer to the exact original socket, not whichever socket is current now. */
  readonly isCurrent: () => boolean; readonly nowSeconds: () => number
  readonly operationTimeoutMs: number; readonly journal: EscrowProviderJournal; readonly fetch?: typeof fetch
  readonly acquireSigner: (signal: AbortSignal) => Promise<{ readonly address: Hex
    readonly signTypedData: (typed: ReturnType<typeof escrowProviderTypedData>, signal: AbortSignal) => Promise<Hex> }>
}
interface LocalJob { contextHash: Hex; listingHash: Hex; phase: "assigned" | "ended"; outputHash: Hex | undefined }
export function createEscrowProviderSession(input: EscrowProviderSessionOptions) {
  let config: EscrowProviderSessionOptions, identity: ReturnType<typeof captureEscrowIdentity>, provider: Hex
  try {
    identity = captureEscrowIdentity(input.identity); provider = escrowAddress(input.provider)
    escrowCheck(provider !== identity.evaluator && input.journal.durability === "durable" &&
      Number.isSafeInteger(input.operationTimeoutMs) && input.operationTimeoutMs > 0 && input.operationTimeoutMs <= 300000)
    for (const fn of [input.currentListing, input.resourceFor, input.isCurrent, input.nowSeconds, input.acquireSigner,
      input.journal.claim, input.journal.signed, input.journal.uncertain]) escrowCheck(typeof fn === "function")
    config = Object.freeze({ ...input, identity, provider, journal: Object.freeze({ ...input.journal }) })
  } catch { throw Error("escrow_provider_unavailable") }
  const lifetime = new AbortController(), jobs = new Map<string, LocalJob>(), seen = new Set<string>()
  let closed = false, busy = false, activeJobs = 0, previous = 0
  const live = () => {
    escrowCheck(!closed && !lifetime.signal.aborted && config.isCurrent())
    const now = escrowSeconds(config.nowSeconds()); escrowCheck(now >= previous); previous = now; return now
  }
  const local = (context: EscrowActionContext) => {
    live(); escrowCheck(context.call.provider === provider && context.treasury === identity.treasury)
    for (const key of ["escrow", "hook", "evaluator", "token"] as const) escrowCheck(context.call[key] === identity[key])
    escrowCheck(context.call.resource === config.resourceFor(context.call.skillId))
    const current = config.currentListing(context.call.skillId); escrowCheck(current !== undefined)
    return captureLocalEscrowListing({ context, listing: current.listing, seller: provider, providerAgentId: current.providerAgentId })
  }
  const assign = (raw: unknown) => {
    try {
      live(); const a = escrowRecord(raw, ["hubJobId", "context", "input"]), context = escrowActionContext(a.context), facts = local(context)
      const assignment = captureLocalEscrowAssignment({ ...a, listing: facts.listing, seller: provider,
        providerAgentId: context.call.providerAgentId })
      escrowCheck(!jobs.has(assignment.hubJobId) && jobs.size < 1000 && activeJobs < 64)
      const record: LocalJob = { contextHash: escrowProviderContextHash(context), listingHash: facts.listingHash,
        phase: "assigned", outputHash: undefined }
      jobs.set(assignment.hubJobId, record); activeJobs++
      // Only the local exec caller gets this closure. The cache holds no input/output.
      return Object.freeze({ input: assignment.input, complete: (outcome: unknown) => {
        try {
          escrowCheck(record.phase === "assigned"); record.phase = "ended"; activeJobs--
          live(); escrowCheck(jobs.get(assignment.hubJobId) === record && local(context).listingHash === record.listingHash)
          const completed = captureLocalEscrowCompletion({ hubJobId: assignment.hubJobId, context, input: assignment.input,
            outcome, listing: assignment.listing, seller: provider, providerAgentId: context.call.providerAgentId })
          record.outputHash = completed.outputHash
        } catch { throw Error("escrow_provider_refused") }
      } })
    } catch { throw Error("escrow_provider_refused") }
  }
  const authorize = async (raw: unknown): Promise<typeof EscrowProviderReply.Type> => {
    let request: typeof EscrowProviderRequest.Type
    try { request = Schema.decodeUnknownSync(EscrowProviderRequest)(raw) } catch { throw Error("escrow_provider_refused") }
    const kind = request._tag === "EscrowBudgetRequest" ? "budget" : "submit"
    const refused = () => Schema.decodeUnknownSync(EscrowProviderReply)({ _tag: "EscrowAuthorizationRefused",
      requestId: request.requestId, operation: kind, reason: "authorization_refused" })
    if (busy || seen.has(request.requestId) || seen.size >= 1000) return refused()
    busy = true; seen.add(request.requestId)
    let claim: EscrowProviderClaim | undefined, finished = false
    const cleanup = async () => {
      if (!claim) return
      try { await boundEscrowIO(() => config.journal.uncertain(claim!), new AbortController().signal, performance.now() + 1000, 1000) }
      catch { /* Existing claim remains reserved even if uncertainty recording fails. */ }
    }
    try {
      const context = escrowContextFromWire(request.context), initial = local(context), deadlineMs = performance.now() + config.operationTimeoutMs
      return await boundEscrowIO(async active => {
        let authorizationDeadline: bigint | undefined
        let snapshot: EscrowSnapshot | undefined
        const guard = () => {
          escrowCheck(!finished && !active.aborted && performance.now() < deadlineMs)
          escrowCheck(local(context).listingHash === initial.listingHash)
          if (request._tag === "EscrowSubmitRequest") {
            const job = jobs.get(request.hubJobId)
            escrowCheck(job?.phase === "ended" && job.contextHash === escrowProviderContextHash(context) &&
              job.listingHash === initial.listingHash && job.outputHash === request.outputHash)
          }
          const now = live(); escrowCheck(authorizationDeadline === undefined || BigInt(now) < authorizationDeadline)
          if (snapshot !== undefined) assertEscrowProviderJob(context, snapshot, kind, now)
          return now
        }
        const io = <T>(work: (signal: AbortSignal) => Promise<T>) => boundEscrowIO(work, active, deadlineMs)
        guard()
        const nonce = randomProviderNonce(), reader = createEscrowProviderReader({ identity, provider, signal: active,
          deadlineMs, nowSeconds: config.nowSeconds, ...(config.fetch === undefined ? {} : { fetch: config.fetch }) })
        snapshot = await reader.read(context, kind, nonce, active); const issuedAt = guard()
        const intent = captureEscrowProviderIntent({ requestId: request.requestId, context, kind, issuedAt, nonce,
          deadline: providerAuthorizationDeadline(issuedAt), hubJobId: request._tag === "EscrowSubmitRequest" ? request.hubJobId : null,
          outputHash: request._tag === "EscrowSubmitRequest" ? request.outputHash : null })
        authorizationDeadline = intent.deadline
        const owned = await io(async () => {
          const value = await config.journal.claim(intent)
          if (value) { claim = value; if (finished || active.aborted) await cleanup() }
          return value
        })
        escrowCheck(owned !== undefined); guard()
        const signer = await io(config.acquireSigner); guard()
        escrowCheck(escrowAddress(signer.address) === provider && typeof signer.signTypedData === "function")
        const signature = await io(signal => signer.signTypedData(escrowProviderTypedData(intent), signal)); guard()
        const captured = await io(() => assertEscrowProviderSignature(intent, signature)); guard()
        await io(() => config.journal.signed(owned, captured)); guard()
        snapshot = await reader.read(context, kind, nonce, active); guard()
        return Schema.decodeUnknownSync(EscrowProviderReply)({ _tag: kind === "budget" ? "EscrowBudgetSigned" : "EscrowSubmitSigned",
          requestId: intent.requestId, escrow: context.call.escrow, jobId: context.jobId.toString(),
          nonce: nonce.toString(), deadline: intent.deadline.toString(), signature: captured })
      }, lifetime.signal, deadlineMs, config.operationTimeoutMs)
    } catch { await cleanup(); return refused() }
    finally { finished = true; busy = false }
  }
  return Object.freeze({ assign, authorize, close: () => { if (!closed) { closed = true; lifetime.abort(); jobs.clear() } } })
}
