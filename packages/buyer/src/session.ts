import { Data, Effect } from "effect"
import { fenceResult, loadChainConfig, type ChainConfig, type RailName } from "@arcade/core"
import { encodeHeader, signAuthorization, signGatewayAuthorization, type PaymentRequirements } from "@arcade/payments"
import { recoverTypedDataAddress, type Account, type Hex } from "viem"
import type { SkillResult } from "./index.ts"
import { sessionRequest, SessionHttpFailure } from "./session-http.ts"
import { sessionAddress, sessionBudget, sessionData, sessionFreeze, sessionOrigin, sessionService, sessionSkillId,
  decodeSessionOpen, decodeSessionStatus, decodeSessionClosed, decodeSessionListing, decodeSessionChallenge, decodeSessionAccepted, decodeSessionResult,
  type SessionIdentity, type SessionHubStatus, type SessionReceiptJson, type SessionListing } from "./session-wire.ts"

export type { SessionReceiptJson, SessionCallJson } from "./session-wire.ts"
export type BuyerSessionCode = "input_invalid" | "already_attempted" | "session_closed" | "session_busy" | "session_pending" | "session_unavailable" |
  "budget_exceeded" | "invalid_response" | "transport_unavailable" | "signing_failed" | "settlement_uncertain" | "deadline_exceeded" | "session_refused"
export type BuyerSessionPhase = "unsigned" | "issued" | "mutation-uncertain"
/** Fixed protocol failure. Amount is locally observed authority, never provider JSON. */
export class BuyerSessionFailure extends Data.TaggedError("BuyerSessionFailure")<{
  readonly code: BuyerSessionCode; readonly phase: BuyerSessionPhase; readonly authorizedAmountAtomic: bigint
}> {}
export interface OpenSessionArgs {
  readonly hubUrl: string; readonly account: Account; readonly budgetUsd: string; readonly rail?: RailName; readonly fetch?: typeof fetch
}
export interface SessionCallArgs {
  /** Historical name: the lower-case URL service segment, not a wallet address. */
  readonly seller: string; readonly skillId: string; readonly input: unknown; readonly maxAmountAtomic?: bigint
  readonly maxWaitMs?: number; readonly pollIntervalMs?: number
}
export interface SessionQuoteArgs { readonly seller: string; readonly skillId: string; readonly input: unknown; readonly maxWaitMs?: number }
export interface SessionQuote { readonly priceAtomic: bigint; readonly rail: RailName; readonly network: string; readonly serviceName: string;
  readonly skillId: string; readonly skillVersion: string; readonly seller: string }
export interface BuyerSessionStatus extends SessionHubStatus {
  readonly localIssuedAtomic: bigint; readonly localConfirmedAtomic: bigint; readonly localExposureAtomic: bigint
}
export interface BuyerSession extends SessionIdentity {
  readonly quote: (args: SessionQuoteArgs) => Effect.Effect<SessionQuote, BuyerSessionFailure>
  readonly call: (args: SessionCallArgs) => Effect.Effect<SkillResult, BuyerSessionFailure>
  readonly status: () => Effect.Effect<BuyerSessionStatus, BuyerSessionFailure>
  readonly close: () => Effect.Effect<SessionReceiptJson, BuyerSessionFailure>
}
const fail = (code: BuyerSessionCode, phase: BuyerSessionPhase = "unsigned", amount = 0n) => new BuyerSessionFailure({ code, phase, authorizedAmountAtomic: amount })
const own = (value: unknown, allowed?: readonly string[]): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail("input_invalid")
  const out: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== "string" || allowed !== undefined && !allowed.includes(key) || !d.enumerable || !("value" in d)) throw fail("input_invalid")
    out[key] = d.value
  }
  return out
}
const cap = (v: unknown): bigint => typeof v === "bigint" && v >= 0n && v < 1n << 256n ? v : (() => { throw fail("input_invalid") })()
const bound = (v: unknown, fallback: number, max: number): number => {
  const n = v === undefined ? fallback : v
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || n > max) throw fail("input_invalid")
  return n
}
interface Authority { readonly origin: string; readonly buyer: string; readonly signer: NonNullable<Account["signTypedData"]>;
  readonly chain: ChainConfig; readonly budgetAtomic: bigint; readonly budgetUsd: string; readonly rail?: RailName; readonly fetch: typeof fetch }
const capture = (args: OpenSessionArgs): Authority => {
  const v = own(args, ["hubUrl", "account", "budgetUsd", "rail", "fetch"]), a = own(v.account)
  const origin = sessionOrigin(v.hubUrl), buyer = sessionAddress(a.address), budgetAtomic = sessionBudget(v.budgetUsd), chain = loadChainConfig()
  if (typeof a.signTypedData !== "function" || chain.status !== "ready" || chain.caip2 !== `eip155:${chain.chainId}` ||
    v.rail !== undefined && !["gateway", "eip3009", "test"].includes(v.rail as string) || v.rail === "gateway" && chain.gateway === null) throw fail("input_invalid")
  const fetcher = v.fetch ?? globalThis.fetch
  if (typeof fetcher !== "function") throw fail("input_invalid")
  return Object.freeze({ origin, buyer, signer: a.signTypedData as NonNullable<Account["signTypedData"]>, chain: sessionFreeze(chain), budgetAtomic,
    budgetUsd: v.budgetUsd as string, ...(v.rail === undefined ? {} : { rail: v.rail as RailName }), fetch: fetcher as typeof fetch })
}
interface Attempt { used: boolean; phase: BuyerSessionPhase; amount: bigint }
const attempt = (): Attempt => ({ used: false, phase: "unsigned", amount: 0n })
const operation = <A>(a: Attempt, run: (signal: AbortSignal) => Promise<A>): Effect.Effect<A, BuyerSessionFailure> => Effect.suspend(() => {
  if (a.used) return Effect.fail(fail("already_attempted", a.phase, a.amount))
  a.used = true
  return Effect.tryPromise({ try: run, catch: error => error instanceof BuyerSessionFailure
    ? fail(error.code, a.phase, a.amount) : fail(error instanceof SessionHttpFailure ? "transport_unavailable" : "invalid_response", a.phase, a.amount) })
})
/** Finite signer/wait boundary. Rejection/abort never resumes a late signer. */
const bounded = <A>(work: Promise<A>, signal: AbortSignal, deadline: number): Promise<A> => new Promise((resolve, reject) => {
  let done = false, timer: ReturnType<typeof setTimeout> | undefined
  const finish = (ok: boolean, value: unknown) => {
    if (done) return; done = true; if (timer !== undefined) clearTimeout(timer); signal.removeEventListener("abort", abort)
    if (ok) resolve(value as A); else reject(value)
  }
  const abort = () => finish(false, fail("deadline_exceeded"))
  if (signal.aborted || performance.now() >= deadline) { abort(); void work.catch(() => {}); return }
  signal.addEventListener("abort", abort, { once: true }); timer = setTimeout(abort, Math.max(1, deadline - performance.now()))
  work.then(value => { if (signal.aborted || performance.now() >= deadline) abort(); else finish(true, value) }, error => finish(false, error))
})
const pause = (millis: number, signal: AbortSignal, deadline: number): Promise<void> => new Promise((resolve, reject) => {
  let timer: ReturnType<typeof setTimeout> | undefined, done = false
  const finish = () => {
    if (done) return; done = true
    if (timer !== undefined) clearTimeout(timer)
    signal.removeEventListener("abort", finish)
    if (signal.aborted || performance.now() >= deadline) reject(fail("deadline_exceeded")); else resolve()
  }
  if (signal.aborted || performance.now() >= deadline) { finish(); return }
  signal.addEventListener("abort", finish, { once: true })
  timer = setTimeout(finish, Math.min(millis, Math.max(1, deadline - performance.now())))
})
const refusal = (status: number, body: unknown): BuyerSessionCode => {
  const v = own(sessionData(body, 16384), ["error"])
  const known: Readonly<Record<string, readonly [number, BuyerSessionCode]>> = {
    session_pending: [409, "session_pending"], session_closed: [409, "session_closed"], session_budget_exceeded: [402, "budget_exceeded"],
    session_unavailable: [503, "session_unavailable"], session_rail_unavailable: [409, "session_refused"], session_conflict: [409, "session_refused"],
    session_capacity: [429, "session_busy"], session_not_found: [404, "session_refused"], not_found: [404, "session_refused"], input_invalid: [400, "session_refused"],
    payment_invalid: [402, "session_refused"], session_buyer_mismatch: [403, "session_refused"], listing_delisted: [403, "session_refused"], lineage_invalid: [402, "session_refused"] }
  const k = typeof v.error === "string" ? known[v.error] : undefined
  return k !== undefined && k[0] === status ? k[1] : "invalid_response"
}
const types = () => sessionFreeze({ TransferWithAuthorization: [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }
] as const })
type SignedMessage = { from: Hex; to: Hex; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex }
const domainFor = (authority: Authority, rail: RailName) => ({ name: rail === "gateway" ? "GatewayWalletBatched" : authority.chain.usdc.eip712Name,
  version: rail === "gateway" ? "1" : authority.chain.usdc.eip712Version, chainId: authority.chain.chainId,
  verifyingContract: (rail === "gateway" ? authority.chain.gateway!.wallet : authority.chain.usdc.address).toLowerCase() as Hex })
// Only fully decoded, bounded closed artifacts reach this explicit projection.
// Object key order is irrelevant; persisted calls/reference sequence is retained.
const closedReceiptFingerprint = (r: SessionReceiptJson): string => JSON.stringify([
  r.sessionId, r.buyer, r.rail, r.network, r.budgetAtomic, r.spentAtomic, r.heldAtomic,
  r.calls.map(c => [c.jobId, c.skillId, c.priceAtomic, c.state, c.settled, c.createdAtMs, c.settleRef ?? null, c.settleRefKind ?? null]),
  r.settledCalls, r.settlementRefs, r.complete, r.openedAtMs, r.closedAtMs
])

export const openSession = (args: OpenSessionArgs): Effect.Effect<BuyerSession, BuyerSessionFailure> => {
  const opening = attempt()
  let authority: Authority | undefined
  try { authority = capture(args) } catch { /* keep the fixed pre-IO failure inside Effect */ }
  return operation(opening, async signal => {
    if (authority === undefined) throw fail("input_invalid")
    const auth = authority
    if (signal.aborted) throw fail("deadline_exceeded")
    opening.phase = "mutation-uncertain"
    const response = await sessionRequest(auth.fetch, `${auth.origin}/sessions`, { method: "POST", headers: {},
      body: JSON.stringify({ buyer: auth.buyer, budgetUsd: auth.budgetUsd, ...(auth.rail === undefined ? {} : { rail: auth.rail }) }) },
    { signal, deadlineMs: performance.now() + 5000, maxBytes: 16384 })
    if (response.status !== 201) throw fail(refusal(response.status, response.body))
    const opened = decodeSessionOpen(response.body, { buyer: auth.buyer, chain: auth.chain, budgetAtomic: auth.budgetAtomic, ...(auth.rail === undefined ? {} : { rail: auth.rail }) })
    const { token, ...identity } = opened
    const headers = Object.freeze({ "x-arcade-session": identity.id, "x-session-token": token })
    let state: "open" | "closing" | "close-uncertain" | "closed" = "open", activeCalls = 0, issued = 0n, reserved = 0n
    let firstClosedFingerprint: string | undefined
    interface Issuance { amount: bigint; skillId: string; jobId?: string; ref?: string; confirmed: boolean }
    const issuedCalls: Issuance[] = []
    const reconcile = (snapshot: SessionHubStatus, known = new Set(issuedCalls.filter(r => r.jobId !== undefined))) => {
      // Consult the current terminal observation after IO, not the read's start.
      // Contradictory terminal evidence must fail before any accounting mutation.
      if (state === "closed" && !snapshot.closed) throw fail("invalid_response")
      let fingerprint: string | undefined
      if (snapshot.closed) {
        if (snapshot.closedReceipt === undefined) throw fail("invalid_response")
        fingerprint = closedReceiptFingerprint(snapshot.closedReceipt)
        if (firstClosedFingerprint !== undefined && fingerprint !== firstClosedFingerprint) throw fail("invalid_response")
      }
      const updates: Array<{ record: Issuance; ref: string }> = []
      for (const record of issuedCalls) {
        if (record.jobId === undefined || !known.has(record)) continue
        const call = snapshot.calls.find(c => c.jobId === record.jobId)
        if (call === undefined || call.priceAtomic !== record.amount.toString() || call.skillId !== record.skillId || record.confirmed && call.state !== "settled") throw fail("invalid_response")
        if (call?.state === "settled") {
          if (record.ref !== undefined && record.ref !== call.settleRef) throw fail("invalid_response")
          if (issuedCalls.some(r => r !== record && r.ref === call.settleRef)) throw fail("invalid_response")
          updates.push({ record, ref: call.settleRef! })
        }
      }
      for (const { record, ref } of updates) { record.ref = ref; record.confirmed = true }
      if (snapshot.closed) { firstClosedFingerprint = fingerprint; state = "closed" }
    }
    const readStatus = async (signal: AbortSignal, deadline: number): Promise<SessionHubStatus> => {
      // Concurrent calls accepted after this read began are not evidence that its
      // earlier snapshot lost a job. Already-known immutable membership must remain.
      const known = new Set(issuedCalls.filter(r => r.jobId !== undefined))
      const response = await sessionRequest(auth.fetch, `${auth.origin}/sessions/${identity.id}`, { method: "GET", headers }, { signal, deadlineMs: deadline, maxBytes: 131072 })
      if (response.status !== 200) throw fail(refusal(response.status, response.body))
      const snapshot = decodeSessionStatus(response.body, identity)
      reconcile(snapshot, known); return snapshot
    }
    const local = (snapshot: SessionHubStatus): BuyerSessionStatus => {
      const confirmed = issuedCalls.filter(c => c.confirmed).reduce((sum, c) => sum + c.amount, 0n)
      return sessionFreeze({ ...snapshot, localIssuedAtomic: issued, localConfirmedAtomic: confirmed, localExposureAtomic: issued - confirmed })
    }
    const discover = async (p: { service: string; skill: string; body: string }, signal: AbortSignal, deadline: number, check: () => void) => {
      check()
      const listingResponse = await sessionRequest(auth.fetch, `${auth.origin}/listings/${p.skill}`, { method: "GET", headers: {} }, { signal, deadlineMs: deadline, maxBytes: 1048576 })
      if (listingResponse.status !== 200) throw fail(refusal(listingResponse.status, listingResponse.body))
      const listing = decodeSessionListing(listingResponse.body, p.service, p.skill), resource = `${auth.origin}/x/${p.service}/${p.skill}`
      check()
      const probe = await sessionRequest(auth.fetch, resource, { method: "POST", headers, body: p.body }, { signal, deadlineMs: deadline, maxBytes: 16384 })
      if (probe.status !== 402 || !Object.hasOwn(own(sessionData(probe.body, 16384)), "accepts")) throw fail(refusal(probe.status, probe.body))
      const requirements = decodeSessionChallenge(probe.body, identity, auth.chain, listing, resource)
      check(); return { listing, resource, requirements }
    }
    const call = (input: SessionCallArgs): Effect.Effect<SkillResult, BuyerSessionFailure> => {
      const a = attempt(); let prepared: { service: string; skill: string; body: string; cap: bigint; wait: number; poll: number } | undefined
      try {
        const v = own(input, ["seller", "skillId", "input", "maxAmountAtomic", "maxWaitMs", "pollIntervalMs"])
        prepared = { service: sessionService(v.seller), skill: sessionSkillId(v.skillId), body: JSON.stringify(sessionData(v.input)),
          cap: v.maxAmountAtomic === undefined ? auth.budgetAtomic : cap(v.maxAmountAtomic), wait: bound(v.maxWaitMs, 900000, 900000), poll: bound(v.pollIntervalMs, 1000, 900000) }
      } catch { /* fixed pre-IO failure below */ }
      return operation(a, async signal => {
        if (prepared === undefined) throw fail("input_invalid")
        if (state !== "open") throw fail("session_closed")
        const p = prepared, deadline = performance.now() + p.wait
        let active = true, held = 0n
        const check = () => { if (!active || signal.aborted || performance.now() >= deadline) throw fail("deadline_exceeded") }
        const admission = () => { check(); if (state !== "open") throw fail("session_closed") }
        activeCalls++
        try {
          admission()
          const snapshot = await readStatus(signal, deadline); admission()
          const { listing, resource, requirements } = await discover(p, signal, deadline, admission)
          admission()
          if (JSON.stringify(loadChainConfig()) !== JSON.stringify(auth.chain)) throw fail("session_refused")
          const unmatched = snapshot.calls.filter(c => c.state !== "released" && !issuedCalls.some(r => r.jobId === c.jobId && r.amount.toString() === c.priceAtomic && r.skillId === c.skillId))
            .reduce((sum, c) => sum + BigInt(c.priceAtomic), 0n)
          if (listing.priceAtomic > p.cap || listing.priceAtomic > snapshot.remainingAtomic || issued + reserved + unmatched + listing.priceAtomic > auth.budgetAtomic || issuedCalls.length >= 100) throw fail("budget_exceeded")
          held = listing.priceAtomic; reserved += held
          const record: Issuance = { amount: held, skillId: listing.id, confirmed: false }
          let message: SignedMessage | undefined, entered = false
          const domain = sessionFreeze(domainFor(auth, identity.rail))
          const signer = async (raw: unknown): Promise<Hex> => {
            admission()
            if (JSON.stringify(loadChainConfig()) !== JSON.stringify(auth.chain)) throw fail("session_refused")
            if (entered) throw fail("already_attempted")
            const request = own(raw, ["domain", "types", "primaryType", "message"]), d = own(request.domain, ["name", "version", "chainId", "verifyingContract"]), m = own(request.message, ["from", "to", "value", "validAfter", "validBefore", "nonce"])
            if (request.primaryType !== "TransferWithAuthorization" || d.name !== domain.name || d.version !== domain.version || d.chainId !== domain.chainId || sessionAddress(d.verifyingContract) !== domain.verifyingContract ||
              JSON.stringify(request.types) !== JSON.stringify(types()) || sessionAddress(m.from) !== auth.buyer || sessionAddress(m.to) !== requirements.payTo ||
              m.value !== listing.priceAtomic || typeof m.validAfter !== "bigint" || typeof m.validBefore !== "bigint" || m.validAfter < 0n || m.validBefore <= m.validAfter ||
              typeof m.nonce !== "string" || !/^0x[0-9a-f]{64}$/.test(m.nonce) || /^0x0{64}$/.test(m.nonce)) throw fail("signing_failed")
            const now = BigInt(Math.floor(Date.now() / 1000))
            if (m.validAfter > now || m.validBefore <= now || m.validBefore > now + 604900n || identity.rail === "gateway" && m.validBefore - m.validAfter > 605500n) throw fail("signing_failed")
            message = sessionFreeze({ from: auth.buyer as Hex, to: requirements.payTo as Hex, value: m.value as bigint, validAfter: m.validAfter, validBefore: m.validBefore, nonce: m.nonce as Hex })
            // Entering a real signer can issue authority even if its Promise never resolves.
            entered = true; issued += held; reserved -= held; held = 0n; a.phase = "issued"; a.amount = record.amount; issuedCalls.push(record)
            const signature = await auth.signer.call(Object.freeze({ address: auth.buyer }), sessionFreeze({ domain, types: types(), primaryType: "TransferWithAuthorization" as const, message }))
            check()
            if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw fail("signing_failed")
            return signature
          }
          const account = { address: auth.buyer as Hex, type: "local", signTypedData: signer } as Account
          const signing = identity.rail === "gateway" ? signGatewayAuthorization({ account, to: requirements.payTo, valueAtomic: listing.priceAtomic, requirements, chain: auth.chain })
            : signAuthorization({ account, to: requirements.payTo, valueAtomic: listing.priceAtomic, validForSeconds: 604900, chain: auth.chain })
          let signed: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string; signature: Hex }
          try { signed = await bounded(Effect.runPromise(signing, { signal }), signal, deadline) } catch { throw fail("signing_failed") }
          admission()
          if (!entered || message === undefined || signed.from.toLowerCase() !== auth.buyer || signed.to.toLowerCase() !== requirements.payTo ||
            signed.value !== message.value.toString() || signed.validAfter !== message.validAfter.toString() || signed.validBefore !== message.validBefore.toString() || signed.nonce !== message.nonce) throw fail("signing_failed")
          const recovered = await bounded(recoverTypedDataAddress({ domain, types: types(), primaryType: "TransferWithAuthorization", message, signature: signed.signature }), signal, deadline)
          admission(); if (recovered.toLowerCase() !== auth.buyer) throw fail("signing_failed")
          const { signature, ...authorization } = signed
          const paid = await sessionRequest(auth.fetch, resource, { method: "POST", body: p.body, headers: { ...headers,
            "payment-signature": encodeHeader({ x402Version: 2, payload: { authorization, signature }, accepted: requirements }) } }, { signal, deadlineMs: deadline, maxBytes: 16384 })
          check()
          if (paid.status !== 202) throw fail(refusal(paid.status, paid.body))
          const accepted = decodeSessionAccepted(paid.body, auth.origin, listing.priceAtomic)
          if (issuedCalls.some(r => r !== record && r.jobId === accepted.jobId)) throw fail("invalid_response")
          record.jobId = accepted.jobId
          while (true) {
            check()
            const response = await sessionRequest(auth.fetch, accepted.pollUrl, { method: "GET", headers: { ...headers, "x-job-token": accepted.jobToken } }, { signal, deadlineMs: deadline, maxBytes: 2_113_536 })
            const decoded = decodeSessionResult(response.status, response.body, { identity, chain: auth.chain, listing, jobId: accepted.jobId, nonce: signed.nonce, amountAtomic: listing.priceAtomic, requirements })
            if (decoded.kind === "uncertain") throw fail("settlement_uncertain")
            if (decoded.kind === "terminal") {
              if (record.confirmed && decoded.status !== "succeeded") throw fail("invalid_response")
              if (decoded.status === "succeeded") {
                const ref = decoded.receipt.settleTx
                if (typeof ref !== "string" || record.ref !== undefined && record.ref !== ref || issuedCalls.some(r => r !== record && r.ref === ref)) throw fail("invalid_response")
                record.ref = ref; record.confirmed = true
              }
              return sessionFreeze({ jobId: decoded.jobId, status: decoded.status, result: decoded.result, receipt: { ...decoded.receipt },
                fencedResult: fenceResult(decoded.result, listing.seller), authorizedAmountAtomic: listing.priceAtomic })
            }
            await pause(p.poll, signal, deadline)
          }
        } finally { active = false; reserved -= held; activeCalls-- }
      })
    }
    return Object.freeze({ ...identity, call,
      quote: (input: SessionQuoteArgs) => {
        const a = attempt(); let p: { service: string; skill: string; body: string; wait: number } | undefined
        try {
          const v = own(input, ["seller", "skillId", "input", "maxWaitMs"])
          p = { service: sessionService(v.seller), skill: sessionSkillId(v.skillId), body: JSON.stringify(sessionData(v.input)), wait: bound(v.maxWaitMs, 5000, 900000) }
        } catch { /* fixed pre-IO refusal below */ }
        return operation(a, async signal => {
          if (p === undefined) throw fail("input_invalid")
          const deadline = performance.now() + p.wait
          const check = () => { if (signal.aborted || performance.now() >= deadline) throw fail("deadline_exceeded"); if (state !== "open") throw fail("session_closed") }
          const { listing } = await discover(p, signal, deadline, check)
          return sessionFreeze({ priceAtomic: listing.priceAtomic, rail: identity.rail, network: identity.network,
            serviceName: listing.serviceName, skillId: listing.id, skillVersion: listing.version, seller: listing.seller })
        })
      },
      status: () => operation(attempt(), async signal => local(await readStatus(signal, performance.now() + 5000))),
      close: () => {
        const a = attempt()
        return operation(a, async signal => {
          if (state !== "open") throw fail("session_closed")
          if (activeCalls !== 0) throw fail("session_busy")
          if (signal.aborted) throw fail("deadline_exceeded")
          state = "closing"; a.phase = "mutation-uncertain"
          try {
            const response = await sessionRequest(auth.fetch, `${auth.origin}/sessions/${identity.id}/close`, { method: "POST", headers, body: "{}" }, { signal, deadlineMs: performance.now() + 5000, maxBytes: 131072 })
            if (response.status !== 200) {
              const code = refusal(response.status, response.body)
              // A concurrent authenticated status may already prove persisted close.
              // A late pending reply cannot undo that terminal local observation.
              if (code === "session_pending" && (state as string) === "closing") state = "open"
              throw fail(code)
            }
            const receipt = decodeSessionClosed(response.body, identity)
            reconcile({ ...identity, spentAtomic: BigInt(receipt.spentAtomic), heldAtomic: 0n, remainingAtomic: identity.budgetAtomic - BigInt(receipt.spentAtomic), calls: receipt.calls, complete: true, closed: true, closedReceipt: receipt })
            state = "closed"; return receipt
          } finally { if (state === "closing") state = "close-uncertain" }
        })
      }
    })
  })
}

export interface SessionPromiseOptions { readonly signal?: AbortSignal }
export interface BuyerSessionPromise extends SessionIdentity {
  readonly quote: (args: SessionQuoteArgs, options?: SessionPromiseOptions) => Promise<SessionQuote>
  readonly call: (args: SessionCallArgs, options?: SessionPromiseOptions) => Promise<SkillResult>
  readonly status: (options?: SessionPromiseOptions) => Promise<BuyerSessionStatus>
  readonly close: (options?: SessionPromiseOptions) => Promise<SessionReceiptJson>
}
const promise = async <A>(effect: Effect.Effect<A, BuyerSessionFailure>, options?: SessionPromiseOptions): Promise<A> => {
  const raw = options === undefined ? {} : own(options, ["signal"])
  if (raw.signal !== undefined && !(raw.signal instanceof AbortSignal)) throw fail("input_invalid")
  const result = await Effect.runPromise(Effect.either(effect), raw.signal === undefined ? {} : { signal: raw.signal as AbortSignal })
  if (result._tag === "Left") throw result.left
  return result.right
}
export const openSessionPromise = async (args: OpenSessionArgs, options?: SessionPromiseOptions): Promise<BuyerSessionPromise> => {
  const session = await promise(openSession(args), options)
  return Object.freeze({ id: session.id, buyer: session.buyer, rail: session.rail, network: session.network, budgetAtomic: session.budgetAtomic,
    quote: (args: SessionQuoteArgs, options?: SessionPromiseOptions) => promise(session.quote(args), options),
    call: (args: SessionCallArgs, options?: SessionPromiseOptions) => promise(session.call(args), options),
    status: (options?: SessionPromiseOptions) => promise(session.status(), options), close: (options?: SessionPromiseOptions) => promise(session.close(), options) })
}
