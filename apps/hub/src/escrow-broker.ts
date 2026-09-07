/** Original-socket correlation only. Durable admission and chain checks remain separate. */
import { Schema } from "effect"
import { assertOutputSize, docBytes, EscrowProviderReply, hashJson, shouldSettle,
  type EscrowContextWire, type EscrowProviderRequest, type HubMessage, type JobOutcome } from "@arcade/core"
import { boundEscrowIO, encodeSetBudgetRelay, encodeSubmitRelay, escrowActionContext, escrowAddress,
  escrowBytes32, escrowCheck, escrowContextFromWire, escrowContextToWire, escrowProviderContextHash,
  escrowRecord, escrowSeconds, setBudgetAuthorization, submitAuthorization, type EscrowActionContext } from "@arcade/payments"
import type { Hex } from "viem"
import type { RunnerConn } from "./broker.ts"
type Authorization = Readonly<{ nonce: bigint; deadline: bigint; signature: Hex }>
export interface EscrowBroker {
  authorize(context: unknown, operation: unknown, signal: AbortSignal): Promise<Authorization>
  /** Caller supplies the authenticated original socket token, never a message's runner ID. */
  accept(connectionId: object, reply: unknown): Promise<boolean>
}
interface Lease { readonly conn: RunnerConn; readonly token: object; readonly provider: Hex; invalid: boolean }
interface Job { readonly context: EscrowActionContext; readonly hash: Hex; readonly lease: Lease
  hubJobId?: string; ended: boolean; outputHash?: Hex; readonly attempts: Set<string> }
interface Pending { readonly job: Job; readonly request: EscrowProviderRequest; readonly signal: AbortSignal
  readonly stop: () => void; readonly resolve: (authorization: Authorization) => void; verifying: boolean }
export function makeEscrowBroker(options: {
  readonly current: (runnerId: string) => RunnerConn | undefined
  readonly routes: (skillId: string) => readonly RunnerConn[]
  readonly nowSeconds: () => number
}) {
  const jobs = new Map<string, Job>(), hubJobs = new Map<string, Job>(), pending = new Map<string, Pending>()
  let previous = 0
  const refused = () => Error("escrow_broker_refused")
  const now = () => { const n = escrowSeconds(options.nowSeconds()); escrowCheck(n >= previous); previous = n; return n }
  const key = (c: EscrowActionContext) => `${c.call.chainId}:${c.call.escrow}:${c.jobId}`
  const live = (lease: Lease) => {
    const current = options.current(lease.conn.runnerId)
    escrowCheck(!lease.invalid && current !== undefined && current.connectionId === lease.token &&
      escrowAddress(current.seller) === lease.provider && current.isCurrent?.() === true && lease.conn.isCurrent?.() === true)
    now()
  }
  const lookup = (context: EscrowActionContext, routeRequired: boolean): Job => {
    const existing = jobs.get(key(context)), hash = escrowProviderContextHash(context)
    if (existing) {
      escrowCheck(existing.hash === hash); live(existing.lease)
      if (routeRequired) escrowCheck(options.routes(context.call.skillId).some(c => c.connectionId === existing.lease.token && c.runnerId === existing.lease.conn.runnerId))
      return existing
    }
    escrowCheck(jobs.size < 1000)
    const conn = options.routes(context.call.skillId).find(c => c.seller.toLowerCase() === context.call.provider &&
      c.connectionId !== undefined && c.isCurrent?.() === true)
    escrowCheck(conn !== undefined && conn.connectionId !== undefined)
    const lease: Lease = { conn, token: conn.connectionId, provider: context.call.provider, invalid: false }; live(lease)
    const job: Job = { context, hash, lease, ended: false, attempts: new Set() }
    jobs.set(key(context), job); return job
  }
  const invalidate = (lease: Lease) => {
    lease.invalid = true
    for (const p of pending.values()) if (p.job.lease === lease) p.stop()
  }
  const bind = (args: { jobId: string; skillId: string; skillVersion: string; input: unknown; timeoutSec: number
    parentJobId?: string; hireCapability?: string; escrow: EscrowContextWire }) => {
    try {
      const context = escrowContextFromWire(args.escrow)
      // Internal pipeline may forward its hub-minted root capability. The receiving
      // ordinary child route still verifies its MAC and durable root admission.
      escrowCheck(/^job_[A-Za-z0-9]{16,128}$/.test(args.jobId) && args.parentJobId === undefined &&
        (args.hireCapability === undefined || typeof args.hireCapability === "string" && args.hireCapability.length <= 1024 &&
          /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(args.hireCapability)) &&
        args.skillId === context.call.skillId && args.skillVersion === context.call.skillVersion && args.timeoutSec === context.call.timeoutSeconds)
      const input: unknown = JSON.parse(docBytes(args.input)); escrowCheck(hashJson(input) === context.call.inputHash)
      const job = lookup(context, true)
      escrowCheck(job.hubJobId === undefined && !job.ended && !hubJobs.has(args.jobId))
      job.hubJobId = args.jobId; hubJobs.set(args.jobId, job)
      return { conn: job.lease.conn, message: { _tag: "JobAssignment", jobId: args.jobId, skillId: args.skillId,
        skillVersion: args.skillVersion, timeoutSec: args.timeoutSec, input, escrow: escrowContextToWire(context),
        ...(args.hireCapability === undefined ? {} : { hireCapability: args.hireCapability }) } as HubMessage }
    } catch { throw refused() }
  }
  const complete = (hubJobId: string, outcome: JobOutcome) => {
    const job = hubJobs.get(hubJobId)
    if (!job || job.ended) return
    job.ended = true
    try {
      live(job.lease); assertOutputSize(outcome.output)
      // This only commits the actual result. Pipeline + runner independently validate schema.
      escrowCheck(shouldSettle(outcome, true).settle)
      job.outputHash = hashJson(outcome.output)
    } catch { /* Failed/invalid completion never authorizes submit. */ }
  }
  const authorize: EscrowBroker["authorize"] = async (raw, input, signal) => {
    let owned: Pending | undefined
    try {
      escrowCheck(!signal.aborted && pending.size < 64); now()
      const context = escrowActionContext(raw)
      const kind = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "kind")?.value : undefined
      escrowCheck(kind === "budget" || kind === "submit")
      const operation = escrowRecord(input, kind === "budget" ? ["kind"] : ["kind", "outputHash"])
      const job = kind === "budget" ? lookup(context, true) : jobs.get(key(context))
      escrowCheck(job !== undefined && job.hash === escrowProviderContextHash(context)); live(job.lease)
      escrowCheck(!job.attempts.has(kind))
      const outputHash = kind === "submit" ? escrowBytes32(operation.outputHash, false) : undefined
      if (kind === "submit") escrowCheck(job.ended && job.hubJobId !== undefined && job.outputHash === outputHash)
      else escrowCheck(job.hubJobId === undefined && !job.ended)
      const requestId = escrowBytes32("0x" + [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, "0")).join(""), false)
      escrowCheck(!pending.has(requestId))
      const request: EscrowProviderRequest = kind === "budget" ? { _tag: "EscrowBudgetRequest", requestId, context: escrowContextToWire(context) } :
        { _tag: "EscrowSubmitRequest", requestId, context: escrowContextToWire(context), hubJobId: job.hubJobId!, outputHash: outputHash! }
      job.attempts.add(kind) // Even an uncertain send is never retried by this broker.
      // Same five-minute ceiling as the action executor; caller's shorter abort wins.
      return await boundEscrowIO(active => new Promise<Authorization>((resolve, reject) => {
        escrowCheck(pending.size < 64)
        const stop = () => reject(refused())
        owned = { job, request, signal: active, stop, resolve, verifying: false }; pending.set(requestId, owned)
        active.addEventListener("abort", stop, { once: true })
        try { live(job.lease); escrowCheck(!active.aborted); job.lease.conn.send(request as HubMessage) }
        catch { stop() }
      }), signal, performance.now() + 300000, 300000)
    } catch { throw refused() }
    finally {
      if (owned) { pending.delete(owned.request.requestId); owned.signal.removeEventListener("abort", owned.stop) }
    }
  }
  const accept: EscrowBroker["accept"] = async (token, raw) => {
    let item: Pending | undefined
    try {
      const reply = Schema.decodeUnknownSync(EscrowProviderReply)(raw)
      const p = pending.get(reply.requestId)
      if (!p || p.job.lease.token !== token || p.verifying) return false
      item = p; p.verifying = true
      const guard = () => { escrowCheck(pending.get(reply.requestId) === p && !p.signal.aborted); live(p.job.lease); return now() }
      const at = guard(), context = p.job.context, c = context.call, budget = p.request._tag === "EscrowBudgetRequest"
      escrowCheck(reply._tag !== "EscrowAuthorizationRefused")
      escrowCheck(reply._tag === (budget ? "EscrowBudgetSigned" : "EscrowSubmitSigned") && reply.escrow === c.escrow && reply.jobId === context.jobId.toString())
      const base = { chainId: c.chainId, escrow: c.escrow, signer: c.provider, jobId: context.jobId,
        nonce: BigInt(reply.nonce), deadline: BigInt(reply.deadline) }
      if (budget) {
        const terms = { ...base, token: c.token, amount: c.amount }
        await encodeSetBudgetRelay(terms, reply.signature, at); setBudgetAuthorization(terms, guard())
      } else {
        escrowCheck(p.request._tag === "EscrowSubmitRequest" && p.job.outputHash === p.request.outputHash)
        const terms = { ...base, deliverable: p.request.outputHash }
        await encodeSubmitRelay(terms, reply.signature, at); submitAuthorization(terms, guard())
      }
      p.resolve(Object.freeze({ nonce: base.nonce, deadline: base.deadline, signature: reply.signature as Hex })); return true
    } catch { item?.stop(); return false }
  }
  return Object.freeze({ facade: Object.freeze({ authorize, accept }), bind, complete,
    disconnected: (runnerId: string) => { for (const job of jobs.values()) if (job.lease.conn.runnerId === runnerId) invalidate(job.lease) },
    failed: (hubJobId: string) => { const job = hubJobs.get(hubJobId); if (job) invalidate(job.lease) } })
}
