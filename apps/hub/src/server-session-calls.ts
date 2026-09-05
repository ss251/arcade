import { Cause, Effect, Exit, Option, Schema } from "effect"
import { createHmac } from "node:crypto"
import { HIRE_CAPABILITY_HEADER, SessionBudgetExceeded, SessionCapacity, SessionClosed, SessionConflict, SessionInvalid,
  SessionNotFound, SessionRailUnavailable, SessionStorageUnavailable, formatPrice, mintHireCapability, shouldSettle, parsePrice, type ChainConfig } from "@arcade/core"
import { HEADER_PAYMENT_LEGACY, HEADER_PAYMENT_SIGNATURE, PaymentPayload, decodeHeaderJson } from "@arcade/payments"
import type { Store } from "./store.ts"
import type { Rails } from "./rails.ts"
import type { makeSessions } from "./sessions.ts"
import type { SessionExecutionOptions } from "./pipeline-sessions.ts"
import { runSessionJob } from "./pipeline-sessions.ts"
import { canonicalSessionRequirements, canonicalSessionPayment, checkSessionRequirements, prepareSessionCall, sessionCallData, sessionFee, sessionJobIdOk, sessionListing } from "./session-call.ts"
import { sessionJobCopy, sessionReceiptCopy } from "./session-ledger.ts"
import { discardSessionBody, readSessionBody, sessionJsonResponse as json, sessionRefusal as refusal, sessionTokenOk, timingSafeTokenOk } from "./server-sessions.ts"
import { inputGate } from "./input-gate.ts"
import { claimedPayerOf, delistRefusal } from "./delisted.ts"

export const hasSessionHeaders = (req: Request): boolean => req.headers.has("x-arcade-session") || req.headers.has("x-session-token")
export const sessionJobToken = (secret: string, sessionId: string, jobId: string): string => {
  if (!/^ses_[0-9a-f]{32}$/.test(sessionId) || !sessionJobIdOk(jobId)) throw new SessionInvalid()
  return createHmac("sha256", secret).update(`arcade-session-job:${sessionId}:${jobId}`).digest("hex").slice(0, 32)
}
interface SessionCallRoutesOptions extends Pick<SessionExecutionOptions, "broker" | "attester"> {
  readonly store: Store; readonly sessions: ReturnType<typeof makeSessions>; readonly rails: Rails; readonly chain: ChainConfig
  readonly hubSecret: string; readonly configuredHubSecret?: string | undefined
  readonly publicOrigin: (url: URL) => string; readonly canaryAddress?: string | undefined
  readonly attestationArmed?: boolean; readonly now?: () => number; readonly newJobId?: () => string
}
const errorResponse = (e: unknown) => {
  if (e instanceof SessionNotFound) return refusal("session_not_found", 404)
  if (e instanceof SessionClosed) return refusal("session_closed", 409)
  if (e instanceof SessionBudgetExceeded) return refusal("session_budget_exceeded", 402)
  if (e instanceof SessionCapacity) return refusal("session_capacity", 429)
  if (e instanceof SessionRailUnavailable) return refusal("session_rail_unavailable", 409)
  if (e instanceof SessionConflict) return refusal("session_conflict", 409)
  if (e instanceof SessionInvalid) return refusal("payment_invalid", 402)
  return refusal("session_unavailable", 503)
}
/** Session-only HTTP transport. No money or execution registry lives here. */
export const makeSessionCallRoutes = (options: SessionCallRoutesOptions) => {
  const { store, sessions, rails, chain, hubSecret, now = Date.now, newJobId = () => `job_${crypto.randomUUID().replaceAll("-", "")}` } = options
  const configured = options.configuredHubSecret
  const realAdmission = store.sessionStorage === "durable" && typeof configured === "string" && configured.length > 0 &&
    configured.length <= 4096 && Buffer.byteLength(configured) <= 4096 && configured === hubSecret
  let active = 0
  return async (req: Request): Promise<Response | undefined> => {
    const url = new URL(req.url), path = url.pathname
    if (!hasSessionHeaders(req) || (path !== "/x" && path !== "/jobs" && !path.startsWith("/x/") && !path.startsWith("/jobs/"))) return undefined
    const paid = /^\/x\/([a-z0-9-]+)\/([a-z0-9][a-z0-9-]{0,127})$/.exec(path)
    const result = /^\/jobs\/(job_[A-Za-z0-9]{16,128})\/result$/.exec(path)
    const id = req.headers.get("x-arcade-session") ?? ""
    if (!(paid !== null && req.method === "POST" || result !== null && req.method === "GET") ||
      !sessionTokenOk(hubSecret, id, req.headers.get("x-session-token")) || url.searchParams.has("token") ||
      (result !== null && !timingSafeTokenOk(sessionJobToken(hubSecret, id, result[1]!), req.headers.get("x-job-token")))) {
      discardSessionBody(req); return refusal("not_found", 404)
    }
    if (req.headers.has(HIRE_CAPABILITY_HEADER)) { discardSessionBody(req); return refusal("lineage_invalid", 402) }
    if (active >= 32) { discardSessionBody(req); return refusal("session_capacity", 429) }
    active++
    const execute = async <A, E>(op: () => Effect.Effect<A, E>): Promise<A> => {
      if (req.signal.aborted) throw new SessionStorageUnavailable()
      const exit = await Effect.runPromiseExit(Effect.suspend(op), { signal: req.signal })
      if (Exit.isSuccess(exit)) return exit.value
      const failure = Cause.failureOption(exit.cause)
      throw Option.isSome(failure) ? failure.value : new SessionStorageUnavailable()
    }
    try {
      if (result !== null) {
        const jobId = result[1]!, snapshot = await execute(() => sessions.snapshot(id).pipe(Effect.mapError(e =>
          e instanceof SessionNotFound ? e : new SessionStorageUnavailable()))), call = snapshot.calls.find(c => c.jobId === jobId)
        if (call === undefined) return refusal("not_found", 404)
        if (call.state === "reserved" || call.state === "settling") return json({ job_id: jobId, status: "pending" }, 202)
        if (call.state === "uncertain") return json({ error: "session_settlement_uncertain", settlement_status: "uncertain" }, 503)
        const original = await execute(() => store.getSessionTerminal(id, jobId).pipe(Effect.mapError(() => new SessionStorageUnavailable())))
        if (original === undefined) throw new SessionStorageUnavailable()
        // The pair is read and digest-validated in ONE selected Store operation.
        // No later Job read may swap out the output that this receipt authorized.
        if (original === null || typeof original !== "object" || Reflect.ownKeys(original).length !== 2) throw new SessionStorageUnavailable()
        const fields = Object.getOwnPropertyDescriptors(original)
        if (fields.job === undefined || !("value" in fields.job) || !fields.job.enumerable ||
          fields.receipt === undefined || !("value" in fields.receipt) || !fields.receipt.enumerable) throw new SessionStorageUnavailable()
        let receipt: ReturnType<typeof sessionReceiptCopy>
        try { receipt = sessionReceiptCopy(fields.receipt.value) } catch { throw new SessionStorageUnavailable() }
        if (receipt.jobId !== jobId || receipt.sessionId !== id || receipt.buyer !== snapshot.session.buyer || receipt.rail !== snapshot.session.rail ||
          receipt.network !== snapshot.session.network || receipt.skillId !== call.skillId || receipt.priceAtomic !== call.priceAtomic ||
          receipt.settled !== call.settled || receipt.settleTx !== call.settleRef || receipt.settleRefKind !== call.settleRefKind ||
          receipt.reason !== (call.settled ? "ok" : "session_released") || receipt.rootJobId !== jobId || receipt.hop !== 0 || receipt.parentJobId !== undefined ||
          receipt.ancestors?.length !== 0 || receipt.children !== undefined || receipt.treeHash !== undefined || receipt.treeCeilingAtomic !== undefined ||
          receipt.treeCommittedAtomic !== undefined || receipt.receiptSignature !== undefined || receipt.feeAccrualId !== undefined || receipt.feeSweepTx !== undefined ||
          receipt.sellerAtomic < 0n || receipt.feeAtomic < 0n || receipt.sellerAtomic + receipt.feeAtomic !== receipt.priceAtomic || receipt.feeBps < 0 || receipt.feeBps > 10000 ||
          receipt.feeAtomic !== receipt.priceAtomic * BigInt(receipt.feeBps) / 10000n ||
          !Number.isSafeInteger(receipt.createdAtMs) || receipt.createdAtMs < call.createdAtMs || !Number.isSafeInteger(receipt.latencyMs) || receipt.latencyMs < 0 ||
          receipt.sellerCostUsd !== undefined && (!Number.isFinite(receipt.sellerCostUsd) || receipt.sellerCostUsd < 0)) throw new SessionStorageUnavailable()
        const explorer = receipt.settled && receipt.rail === "eip3009" && receipt.network === chain.caip2 && receipt.settleRefKind === "onchain" &&
          /^0x[0-9a-f]{64}$/.test(receipt.settleTx ?? "") && !/^0x0{64}$/.test(receipt.settleTx!) ? `${chain.explorerBaseUrl}/tx/${receipt.settleTx}` : null
        const publicResult = { ...receipt, price: formatPrice(receipt.priceAtomic), sellerShare: formatPrice(receipt.sellerAtomic), fee: formatPrice(receipt.feeAtomic), explorer }
        if (call.state === "released") return json({ job_id: jobId, status: "rejected", result: null, detail: "session_released", receipt: publicResult })
        let job: ReturnType<typeof sessionJobCopy>
        try { job = sessionJobCopy(fields.job.value) } catch { throw new SessionStorageUnavailable() }
        if (job.id !== jobId || job.buyer !== receipt.buyer || job.seller !== receipt.seller || job.skillId !== receipt.skillId ||
          job.priceAtomic !== receipt.priceAtomic || job.createdAtMs !== call.createdAtMs || job.status !== "succeeded" || job.outcome?.status !== "succeeded" ||
          job.rootJobId !== jobId || job.parentJobId !== undefined || job.hop !== 0 || job.ancestors?.length !== 0 ||
          !shouldSettle(job.outcome, true).settle || !Number.isSafeInteger(job.outcome.startedAtMs) || job.outcome.startedAtMs < job.createdAtMs ||
          !Number.isSafeInteger(job.outcome.finishedAtMs) || job.outcome.finishedAtMs < job.outcome.startedAtMs || job.outcome.finishedAtMs > receipt.createdAtMs) throw new SessionStorageUnavailable()
        return json({ job_id: jobId, status: "succeeded", result: job.outcome.output, receipt: publicResult })
      }
      let input: unknown
      try { const text = await readSessionBody(req, 1048576); input = sessionCallData(text === "" ? {} : JSON.parse(text)) }
      catch { return refusal("input_invalid", 400) }
      const found = await execute(() => store.getListing(paid![2]!).pipe(Effect.either))
      if (found._tag === "Left") return refusal("not_found", 404)
      const record = sessionListing(found.right), listing = record.listing
      if (listing.serviceName !== paid![1]) return refusal("not_found", 404)
      if (inputGate(listing, input) !== null) return refusal("input_invalid", 400)
      const header = req.headers.get(HEADER_PAYMENT_SIGNATURE) ?? req.headers.get(HEADER_PAYMENT_LEGACY)
      if (header !== null && header.length > 32768) return refusal("payment_invalid", 402)
      if (!(header === null && options.canaryAddress !== undefined) && delistRefusal(record, claimedPayerOf(req), options.canaryAddress) !== null) return refusal("listing_delisted", 403)
      const snapshot = await execute(() => sessions.snapshot(id).pipe(Effect.mapError(e =>
        e instanceof SessionNotFound ? e : new SessionStorageUnavailable()))), s = snapshot.session
      if (s.closedAtMs !== undefined) return refusal("session_closed", 409)
      const rail = rails.get(s.rail)
      if (rail === undefined || rail.name !== s.rail) return refusal("session_rail_unavailable", 409)
      if (rail.name !== "test" && !realAdmission) return refusal("session_unavailable", 503)
      const fee = sessionFee(record, rail, chain), priceAtomic = parsePrice(listing.price), resource = `${options.publicOrigin(url)}${path}`
      const challenged = canonicalSessionRequirements(await execute(() => rail.challenge({ priceAtomic, resource, payTo: record.seller, description: listing.description,
        ...(fee.splitterVersion === undefined ? {} : { feeSplitter: fee.payTo, feeSplitterVersion: fee.splitterVersion }) })))
      checkSessionRequirements(challenged, record, rail, chain, resource)
      if (header === null) return json({ x402Version: 2, error: "payment required", accepts: [challenged] }, 402)
      let payload: PaymentPayload
      try {
        if (header.length > 32768) throw new SessionInvalid()
        payload = canonicalSessionPayment(Schema.decodeUnknownSync(PaymentPayload, { onExcessProperty: "error" })(sessionCallData(decodeHeaderJson(header), 16384)))
      } catch { return refusal("payment_invalid", 402) }
      const verification = await execute(() => rail.verify(payload, challenged).pipe(Effect.either))
      if (verification._tag === "Left") return refusal("payment_invalid", 402)
      const verified = verification.right
      // Never inspect a returned routing getter before the own-data boundary.
      const verifiedData = sessionCallData(verified, 32768) as { payer?: unknown }
      if (typeof verifiedData.payer !== "string" || verifiedData.payer.toLowerCase() !== s.buyer) return refusal("session_buyer_mismatch", 403)
      if (delistRefusal(record, verifiedData.payer, options.canaryAddress) !== null) return refusal("listing_delisted", 403)
      const call = prepareSessionCall({ snapshot, record, chain, rail, verified, requirements: challenged, jobId: newJobId(), input, createdAtMs: now(),
        ...(options.canaryAddress !== undefined && verifiedData.payer.toLowerCase() === options.canaryAddress.toLowerCase() ? { canary: true } : {}) })
      const admitted = await execute(() => sessions.reserve(call.binding, call.job))
      if (admitted.created) {
        const hireCapability = (listing.bounds.maxSubSpendUsd ?? 0) > 0
          ? mintHireCapability(hubSecret, admitted.jobId, call.job.createdAtMs + (listing.bounds.timeoutSec + 60) * 1000) : undefined
        const attest = rail.name !== "eip3009" || options.attestationArmed !== true || record.agentVerified !== true ||
          record.agentId === undefined || chain.erc8004 === undefined ? undefined : { agentId: record.agentId, payTo: call.binding.payTo,
            origin: options.publicOrigin(url), chainId: chain.chainId, identityRegistry: chain.erc8004.identity }
        // The issued attempt owns execution independently of the HTTP request's lifetime.
        void Effect.runPromiseExit(runSessionJob(call, { store, sessions, broker: options.broker,
          ...(options.attester === undefined ? {} : { attester: options.attester }), ...(attest === undefined ? {} : { attest }),
          ...(hireCapability === undefined ? {} : { hireCapability }) })).catch(() => {})
      }
      return json({ job_id: admitted.jobId, status: "queued", poll_url: `${url.origin}/jobs/${admitted.jobId}/result`,
        job_token: sessionJobToken(hubSecret, id, admitted.jobId), price: formatPrice(priceAtomic) }, 202)
    } catch (e) { return errorResponse(e) }
    finally { active--; discardSessionBody(req) }
  }
}
