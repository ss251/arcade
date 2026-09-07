/** Explicit escrow transport. Read-only capability verification precedes any durable admission or relay. */
import { Effect } from "effect"
import { HIRE_CAPABILITY_HEADER, Job, ROOT_LINEAGE, formatPrice } from "@arcade/core"
import { captureEscrowPayment, captureEscrowRequirements, escrowActionContext, escrowCheck, escrowProviderContextHash,
  escrowRecord, type VerifiedEscrow, type EscrowActionProof } from "@arcade/payments"
import type { Store } from "./store.ts"
import type { Rails } from "./rails.ts"
import type { RunEscrowJobArgs } from "./escrow-pipeline.ts"
import { escrowListingChallenge } from "./escrow-listing.ts"
import { hasSessionHeaders } from "./server-session-calls.ts"
import { readOrdinaryBody } from "./ordinary-http.ts"
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "private, no-store" } })
class Refusal extends Error { constructor(readonly error: string, readonly status: number) { super(error) } }
const refuse = (error: string, status: number): never => { throw new Refusal(error, status) }
interface Options {
  readonly store: Store; readonly rails: Rails; readonly hubSecret: string; readonly configuredHubSecret?: string | undefined
  readonly publicOrigin: (url: URL) => string; readonly jobToken: (jobId: string) => string
  /** Must acknowledge a hub-scope-owned fiber, not await execution or detach it. */
  readonly start: (args: RunEscrowJobArgs) => Promise<void>
  readonly attestation?: (agentId: string, payTo: string, origin: string) => RunEscrowJobArgs["attest"]
  readonly now?: () => number
}
export function makeEscrowRoutes(options: Options) {
  const { store, rails, now = Date.now } = options
  const armed = rails.escrow !== undefined && rails.default.name !== "test" && store.escrow?.durability === "durable" &&
    typeof options.configuredHubSecret === "string" && options.configuredHubSecret === options.hubSecret &&
    options.hubSecret.length >= 32 && Buffer.byteLength(options.hubSecret) <= 4096
  // Escrow-only process abuse bounds, not authorization validity or a spending allowance.
  // No eviction: retained per-payer/action quotas fail closed until an operator restarts.
  let active = 0, attempts = 0, previous = 0
  const payers = new Map<string, { count: number; last: number }>(), jobs = new Set<string>()
  const shutdown = new AbortController(), pending = new Set<Promise<Response>>()
  const clock = () => { const n = now(); escrowCheck(Number.isSafeInteger(n) && n >= previous && n >= 0); previous = n; return n }
  const execute = <A, E>(req: Request, effect: Effect.Effect<A, E>) => {
    if (req.signal.aborted || shutdown.signal.aborted) return Promise.reject(new Refusal("escrow_unavailable", 503))
    return Effect.runPromise(effect, { signal: AbortSignal.any([req.signal, shutdown.signal]) })
  }
  const current = async (req: Request, input: unknown, budget: boolean) => {
    const url = new URL(req.url), path = budget ? url.pathname.slice(0, -7) : url.pathname
    const match = /^\/x\/(0x[0-9a-fA-F]{40})\/([a-z0-9-]+)$/.exec(path)
    if (!match || url.search || req.method !== "POST" || hasSessionHeaders(req) || req.headers.has(HIRE_CAPABILITY_HEADER)) return refuse("escrow_request_invalid", 400)
    const found = await execute(req, store.getListing(match[2]!).pipe(Effect.either))
    if (found._tag === "Left") return refuse("not_found", 404)
    let captured: ReturnType<typeof escrowListingChallenge>
    try { captured = escrowListingChallenge(found.right, input, `${options.publicOrigin(url)}${path}`) }
    catch { return refuse("escrow_listing_unavailable", 409) }
    if (captured.seller !== match[1]!.toLowerCase()) return refuse("not_found", 404)
    const requirements = await execute(req, rails.escrow!.challenge(captured.challenge))
    return { ...captured, requirements }
  }
  const checkVerified = (value: VerifiedEscrow<"budget" | "funded">, stage: "budget" | "funded",
    payment: ReturnType<typeof captureEscrowPayment>, terms: ReturnType<typeof captureEscrowRequirements>) => {
    const raw = escrowRecord(value, ["rail", "stage", "payer", "payTo", "amountAtomic", "network", "context", "requirements"])
    const context = escrowActionContext(raw.context)
    escrowCheck(raw.rail === "erc8183" && raw.stage === stage && raw.network === "eip155:5042002" && raw.payer === context.client &&
      raw.payTo === context.call.provider && raw.amountAtomic === context.call.amount && context.jobId.toString() === payment.payload.jobId &&
      JSON.stringify(captureEscrowRequirements(raw.requirements).requirements) === JSON.stringify(terms.requirements) &&
      escrowProviderContextHash({ ...context, call: terms.call }) === escrowProviderContextHash(context))
    return context
  }
  const owned = async (req: Request, work: () => Promise<Response>) => {
    const discard = () => { if (req.body && !req.body.locked) void req.body.cancel().catch(() => {}) }
    if (!armed || shutdown.signal.aborted) { discard(); return json({ error: "escrow_unavailable" }, 503) }
    if (active >= 4) { discard(); return json({ error: "escrow_capacity" }, 429) }
    active++
    const result = (async () => {
      try { clock(); if (req.signal.aborted) return refuse("escrow_unavailable", 503); return await work() }
      catch (e) { return json({ error: e instanceof Refusal ? e.error : "escrow_unavailable" }, e instanceof Refusal ? e.status : 503) }
      finally { active--; discard() }
    })()
    pending.add(result)
    try { return await result } finally { pending.delete(result) }
  }
  const parse = (raw: unknown) => { try { return captureEscrowPayment(raw) } catch { return refuse("escrow_payment_invalid", 400) } }
  const termsMatch = (payment: ReturnType<typeof captureEscrowPayment>, requirements: unknown) => {
    const terms = captureEscrowRequirements(requirements)
    if (JSON.stringify(payment.accepted) !== JSON.stringify(terms.requirements)) return refuse("escrow_payment_invalid", 402)
    return terms
  }
  const budget = async (req: Request): Promise<Response | undefined> => {
    if (!/^\/x\/[^/]+\/[a-z0-9-]+\/escrow$/.test(new URL(req.url).pathname)) return undefined
    return owned(req, async () => {
      if (req.method !== "POST" || hasSessionHeaders(req) || req.headers.has(HIRE_CAPABILITY_HEADER) ||
        req.headers.has("payment-signature") || req.headers.has("x-payment")) return refuse("escrow_request_invalid", 400)
      let body: Record<string, unknown>
      try { body = escrowRecord(JSON.parse(await readOrdinaryBody(req)), ["input", "payment"]) }
      catch { return refuse("escrow_request_invalid", 400) }
      const payment = parse(body.payment), before = await current(req, body.input, true), terms = termsMatch(payment, before.requirements)
      const checked = await execute(req, rails.escrow!.verifyBudget(payment, terms.requirements).pipe(Effect.either))
      if (checked._tag === "Left") return refuse("escrow_payment_invalid", 402)
      const verified = checked.right, context = checkVerified(verified, "budget", payment, terms)
      // Async verification cannot retain permission from a delisted/repriced listing.
      termsMatch(payment, (await current(req, before.input, true)).requirements)
      const at = clock(), payer = context.client, quota = payers.get(payer)
      const key = `${context.call.chainId}:${context.call.escrow}:${context.jobId}`
      if (jobs.has(key)) return refuse("escrow_budget_already_attempted", 409)
      if (attempts >= 1000 || quota && (quota.count >= 10 || at - quota.last < 60000)) return refuse("escrow_capacity", 429)
      // Consumed before action, including uncertain/refused actions. Never reset on failure.
      attempts++; jobs.add(key); payers.set(payer, { count: (quota?.count ?? 0) + 1, last: at })
      let proof: EscrowActionProof
      try { proof = await execute(req, rails.escrow!.budget(verified)) }
      catch { return refuse("escrow_budget_uncertain", 503) }
      if (proof.kind !== "budget" || !/^0x[0-9a-f]{64}$/.test(proof.txHash) || /^0x0{64}$/.test(proof.txHash) ||
        proof.feeAtomic !== 0n || proof.sellerAtomic !== 0n || proof.refundAtomic !== 0n) return refuse("escrow_budget_uncertain", 503)
      return json({ status: "budget_set", jobId: context.jobId.toString(), budget: context.call.amount.toString(),
        token: context.call.token, escrow: context.call.escrow, budgetTx: proof.txHash,
        fundBy: context.expiredAt - context.call.timeoutSeconds - 600 }, 200)
    })
  }
  const root = (req: Request, input: unknown, raw: unknown): Promise<Response> => owned(req, async () => {
    const payment = parse(raw), before = await current(req, input, false), terms = termsMatch(payment, before.requirements)
    const checked = await execute(req, rails.escrow!.verify(payment, terms.requirements).pipe(Effect.either))
    if (checked._tag === "Left") return refuse("escrow_payment_invalid", 402)
    const verified = checked.right, context = checkVerified(verified, "funded", payment, terms)
    termsMatch(payment, (await current(req, before.input, false)).requirements)
    if (req.signal.aborted || shutdown.signal.aborted) return refuse("escrow_unavailable", 503)
    const proposed = `job_${crypto.randomUUID().replaceAll("-", "")}`
    const queued = Job.make({ id: proposed, skillId: before.listing.id, seller: context.call.provider, buyer: context.client,
      priceAtomic: context.call.amount, input: before.input, status: "queued", createdAtMs: clock(), ...ROOT_LINEAGE(proposed) })
    // From durable admission through acknowledged fork, HTTP disconnect cannot interrupt
    // ownership. The start callback must attach work/cleanup to the hub's closing scope.
    const admitted = await Effect.runPromise(store.escrow!.admit(context, queued))
    if (admitted.created) {
      try {
        const attest = options.attestation?.(String(context.call.providerAgentId), context.call.provider, options.publicOrigin(new URL(req.url)))
        await options.start({ jobId: admitted.jobId, verified, rail: rails.escrow!, hireSecret: options.hubSecret,
          ...(attest === undefined ? {} : { attest }) })
      } catch {
        await Effect.runPromise(store.escrow!.uncertain(context, admitted.jobId).pipe(Effect.ignore))
        return refuse("escrow_unavailable", 503)
      }
    }
    const token = options.jobToken(admitted.jobId)
    return json({ job_id: admitted.jobId, status: "queued", job_token: token, price: formatPrice(context.call.amount),
      poll_url: `${options.publicOrigin(new URL(req.url))}/jobs/${admitted.jobId}/result?token=${token}` }, 202)
  })
  return Object.freeze({ budget, root, close: async () => { shutdown.abort(); await Promise.all([...pending]) } })
}
