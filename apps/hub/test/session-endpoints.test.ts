import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect, Ref } from "effect"
import { Job, JobOutcome, Receipt, SessionCapacity, SessionPending, SessionStorageUnavailable, loadChainConfig, formatPrice, type RailName } from "@arcade/core"
import { PaymentPayload } from "@arcade/payments"
import { makeTestRail, makeTestState } from "../../../packages/payments/src/test-rail.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { makeRails } from "../src/rails.ts"
import { makeSessions } from "../src/sessions.ts"
import { makeSessionRoutes, sessionToken, timingSafeTokenOk } from "../src/server-sessions.ts"
import { sessionRequestDigest, type SessionBinding, type SessionSnapshot, type SessionStore } from "../src/session-ledger.ts"

const chain = loadChainConfig("arc-testnet"), buyer = `0x${"a".repeat(40)}`, secret = "offline-session-fixture-secret"
const run = Effect.runPromise
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`http://127.0.0.1${path}`,
  { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
const setup = async (override: Partial<SessionStore> = {}, configuredHubSecret: string | undefined = secret, defaultName: RailName = "test") => {
  const original = await run(StoreTag.pipe(Effect.provide(StoreLive)))
  const reads = vi.fn(override.getSessionSnapshot ?? original.getSessionSnapshot), writes = vi.fn(override.openSession ?? original.openSession), closes = vi.fn(override.closeSession ?? original.closeSession)
  const store = { ...original, ...override, getSessionSnapshot: reads, openSession: writes, closeSession: closes }
  const rail = makeTestRail(await run(Ref.make(makeTestState({})))), rails = makeRails(rail, [])
  const built = defaultName === "test" ? rails : makeRails({ ...rail, name: defaultName }, [rail])
  const sessions = makeSessions({ store, rails: built, chain })
  const handle = makeSessionRoutes({ sessions, rails: built, sessionStorage: store.sessionStorage, hubSecret: secret, configuredHubSecret })
  return { original, store, sessions, rails: built, handle, reads, writes, closes }
}
const privateResponse = (response: Response | undefined): Response => {
  if (response === undefined) throw Error("Expected session response")
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8")
  return response
}
afterEach(() => vi.useRealTimers())
const streamRequest = (stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}, signal?: AbortSignal) => new Request("http://127.0.0.1/sessions",
  { method: "POST", body: stream, headers: { "content-type": "application/json", ...headers }, ...(signal === undefined ? {} : { signal }), duplex: "half" } as RequestInit)
const open = async (f: Awaited<ReturnType<typeof setup>>, budgetUsd = "1") => {
  const response = privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd, rail: "test" })))
  expect(response.status).toBe(201)
  return response.json() as Promise<{ session_id: string; session_token: string }>
}
const read = (id: string, token: string) => new Request(`http://127.0.0.1/sessions/${id}`, { headers: { "x-session-token": token } })
const reserve = async (f: Awaited<ReturnType<typeof setup>>, id: string, n = 1, amountAtomic = 30n) => {
  const seller = `0x${"b".repeat(40)}`, jobId = `job_${n.toString(16).padStart(20, "0")}`, input = { request: "PRIVATE_INPUT" }, at = Date.now()
  const now = BigInt(Math.floor(at / 1000))
  const binding: SessionBinding = { sessionId: id, jobId, buyer, seller, skillId: "fixture", skillVersion: "1.0.0", rail: "test",
    network: chain.caip2, asset: chain.usdc.address, verifyingContract: chain.usdc.address, domainName: chain.usdc.eip712Name,
    domainVersion: chain.usdc.eip712Version, payTo: seller, amountAtomic, nonce: `0x${n.toString(16).padStart(64, "0")}`,
    validAfter: now - 1n, validBefore: now + 600n, requestDigest: sessionRequestDigest(input) }
  const job = Job.make({ id: jobId, buyer, seller, skillId: "fixture", priceAtomic: amountAtomic, input, status: "queued",
    createdAtMs: at, rootJobId: jobId, hop: 0, ancestors: [] })
  await run(f.sessions.reserve(binding, job)); return { binding, job }
}
const terminal = (a: Awaited<ReturnType<typeof reserve>>, accepted: boolean, ref?: string) => {
  const { binding: b, job } = a, at = Date.now(), outcome = JobOutcome.make({ status: accepted ? "succeeded" : "refused", startedAtMs: job.createdAtMs,
    finishedAtMs: at, ...(accepted ? { output: { ok: true } } : {}) })
  return { sessionId: b.sessionId, jobId: b.jobId, job: Job.make({ ...job, status: outcome.status, outcome }),
    receipt: Receipt.make({ jobId: b.jobId, buyer, seller: b.seller, skillId: b.skillId, skillVersion: b.skillVersion,
      priceAtomic: b.amountAtomic, sellerAtomic: b.amountAtomic, feeAtomic: 0n, feeBps: 0, rail: "test", network: chain.caip2,
      latencyMs: at - job.createdAtMs, settled: accepted, reason: accepted ? "ok" : "session_released", createdAtMs: at,
      sessionId: b.sessionId, rootJobId: b.jobId, hop: 0, ancestors: [], ...(accepted ? { settleTx: ref!, settleRefKind: "test" as const } : {}) }) }
}
describe("private session HTTP contract", () => {
  it("opens a local test budget with exactly six private fields", async () => {
    const f = await setup(), res = privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1.00" })))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(["budget", "network", "note", "rail", "session_id", "session_token"])
    expect(body).toMatchObject({ budget: "$1.00", rail: "test", network: chain.caip2 })
    expect(body.session_id).toMatch(/^ses_[0-9a-f]{32}$/)
    expect(body.session_token).toBe(sessionToken(secret, body.session_id))
  })
  it("refuses numeric rather than canonical string budgets without opening", async () => {
    const f = await setup(), res = privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: 1 })))
    expect(res.status).toBe(400); expect(await res.json()).toEqual({ error: "input_invalid" })
    expect(await run(f.store.allSessions)).toHaveLength(0)
  })
  it("uses no query token fallback and returns the same private not-found body", async () => {
    const f = await setup(), open = await privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1" }))).json()
    const res = privateResponse(await f.handle(new Request(`http://127.0.0.1/sessions/${open.session_id}?token=${open.session_token}`)))
    expect(res.status).toBe(404); expect(await res.json()).toEqual({ error: "session_not_found" })
  })
  it("closes atomically and recovers the identical closed receipt from status", async () => {
    const f = await setup(), open = await privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1" }))).json()
    const headers = { "x-session-token": open.session_token }
    const closed = privateResponse(await f.handle(post(`/sessions/${open.session_id}/close`, {}, headers)))
    expect(closed.status).toBe(200); const receipt = await closed.json()
    const status = privateResponse(await f.handle(new Request(`http://127.0.0.1/sessions/${open.session_id}`, { headers })))
    expect((await status.json()).closed_receipt).toEqual(receipt)
    const repeat = privateResponse(await f.handle(post(`/sessions/${open.session_id}/close`, {}, headers)))
    expect(repeat.status).toBe(409); expect(await repeat.json()).toEqual({ error: "session_closed" })
  })
  it("canonical ASCII comparison refuses Unicode without throwing", () => {
    expect(timingSafeTokenOk("a".repeat(32), "é".repeat(32))).toBe(false)
    expect(timingSafeTokenOk("a".repeat(32), "a".repeat(32))).toBe(true)
  })
  it.each([null, [], {}, 1, true, "0", "-1", "+1", "$1", "1e2", "01", "00.1", ".1", "1.", " 1", "1 ", "1.0000001", "1".repeat(81), "115792089237316195423570985008687907853269984665640564039457584007913129.639936"])("refuses malformed or overlarge budget %# before any write", async budgetUsd => {
    const f = await setup(), response = privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd })))
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: "input_invalid" }); expect(f.writes).not.toHaveBeenCalled()
  })
  it.each(["0.000001", "9007199254.740993", "115792089237316195423570985008687907853269984665640564039457584007913129.639935"])("preserves exact atomic budget %s", async budgetUsd => {
    const f = await setup(), value = await open(f, budgetUsd)
    const [whole, fraction = ""] = budgetUsd.split("."), atomic = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))
    expect((await run(f.sessions.snapshot(value.session_id))).session.budgetAtomic).toBe(atomic)
    expect(await privateResponse(await f.handle(read(value.session_id, value.session_token))).json()).toMatchObject({ budget: formatPrice(atomic), remaining: formatPrice(atomic), calls: [], complete: true, closed: false })
  })
  it("normalizes case and rejects nonobjects, zero buyer and excess request coordinates", async () => {
    const f = await setup()
    for (const body of [null, [], {}, { buyer: `0x${"0".repeat(40)}`, budgetUsd: "1" }, { buyer, budgetUsd: "1", network: chain.caip2 },
      { buyer, budgetUsd: "1", rail: null }, { buyer, budgetUsd: "1", rail: "__proto__" }, { buyer, budgetUsd: "1", rail: "" }]) {
      expect(privateResponse(await f.handle(post("/sessions", body))).status).toBe(400)
    }
    expect(f.writes).not.toHaveBeenCalled()
    const response = privateResponse(await f.handle(post("/sessions", { buyer: buyer.toUpperCase().replace("0X", "0x"), budgetUsd: "1" })))
    expect(response.status).toBe(201); expect(f.writes.mock.calls[0]?.[0].buyer).toBe(buyer)
  })
  it("refuses known unavailable rails without default fallback or input reflection", async () => {
    const f = await setup(), response = privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1", rail: "gateway" })))
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "session_rail_unavailable" }); expect(f.writes).not.toHaveBeenCalled()
  })
  it.each(["", "different", "é".repeat(2049)])("keeps test usable but refuses real admission with invalid configured secret %#", async configured => {
    const f = await setup({ sessionStorage: "durable" }, configured, "gateway")
    const response = privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1" })))
    expect(response.status).toBe(503); expect(f.writes).not.toHaveBeenCalled(); await open(f)
  })
  it("requires actual durability even with a stable secret and real rail on loopback", async () => {
    const f = await setup({}, secret, "gateway")
    expect(privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1" }))).status).toBe(503)
    expect(f.writes).not.toHaveBeenCalled(); await open(f)
  })
  it("keeps every malformed namespace route/method private without Store reads", async () => {
    const f = await setup()
    for (const [path, method] of [["/sessions", "GET"], ["/sessions/", "GET"], ["/sessions/ses_bad", "GET"],
      ["/sessions/" + "a".repeat(1000), "GET"], ["/sessions/ses_" + "a".repeat(32) + "/close/extra", "POST"], ["/sessions/ses_" + "a".repeat(32), "DELETE"]] as const) {
      const response = privateResponse(await f.handle(new Request(`http://127.0.0.1${path}`, { method })))
      expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "session_not_found" })
    }
    expect(f.reads).not.toHaveBeenCalled(); expect(f.closes).not.toHaveBeenCalled(); expect(f.writes).not.toHaveBeenCalled()
    expect(await f.handle(new Request("http://127.0.0.1/sessionless"))).toBeUndefined()
  })
  it("rejects wrong, malformed, duplicate, uppercase, foreign and query capabilities before Store IO", async () => {
    const f = await setup(), a = await open(f), b = await open(f)
    for (const presented of [null, "", "x", "é".repeat(32), "A".repeat(32), a.session_token + ", " + a.session_token, b.session_token]) {
      for (const close of [false, true]) {
        const request = new Request(`http://127.0.0.1/sessions/${a.session_id}${close ? "/close" : ""}?token=${a.session_token}`,
          { method: close ? "POST" : "GET", headers: presented === null ? {} : { "x-session-token": presented } })
        const response = privateResponse(await f.handle(request))
        expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "session_not_found" })
      }
    }
    expect(f.reads).not.toHaveBeenCalled(); expect(f.closes).not.toHaveBeenCalled()
    const absent = `ses_${"f".repeat(32)}`, response = privateResponse(await f.handle(read(absent, sessionToken(secret, absent))))
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "session_not_found" }); expect(f.reads).toHaveBeenCalledTimes(1)
    expect(sessionToken(secret, a.session_id)).not.toBe(sessionToken(secret, b.session_id))
  })
  it("rejects nonempty close fields, and only one concurrent atomic close can succeed", async () => {
    const f = await setup(), a = await open(f), headers = { "x-session-token": a.session_token }
    for (const body of [null, [], { atMs: 1 }, { sessionId: a.session_id }, "", 1]) {
      expect(privateResponse(await f.handle(post(`/sessions/${a.session_id}/close`, body, headers))).status).toBe(400)
    }
    expect(f.closes).not.toHaveBeenCalled()
    const responses = await Promise.all([0, 1].map(() => f.handle(new Request(`http://127.0.0.1/sessions/${a.session_id}/close`, { method: "POST", headers }))))
    expect(responses.map(r => privateResponse(r).status).sort()).toEqual([200, 409])
    const accepted = responses.find(r => r?.status === 200)!, receipt = await accepted.json()
    expect((await privateResponse(await f.handle(read(a.session_id, a.session_token))).json()).closed_receipt).toEqual(receipt)
  })
  it.each(["throw", "die", "typed"])("maps one %s storage failure to fixed503 and permits healthy next request", async mode => {
    let failures = 1
    const original = await run(StoreTag.pipe(Effect.provide(StoreLive)))
    const f = await setup({ openSession: input => {
      if (failures-- > 0) { if (mode === "throw") throw Error("PRIVATE_STORE_DIAGNOSTIC")
        return mode === "die" ? Effect.die("PRIVATE_STORE_DIAGNOSTIC") : Effect.fail(new SessionStorageUnavailable()) }
      return original.openSession(input)
    } })
    const response = privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1" })))
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "session_unavailable" }); expect(f.writes).toHaveBeenCalledTimes(1)
    await open(f); expect(f.writes).toHaveBeenCalledTimes(2)
  })
  it.each([[new SessionCapacity(), 429, "session_capacity"], [new SessionPending(), 409, "session_pending"]] as const)("maps bounded tagged refusal %# without error payload spread", async (error, code, message) => {
    const f = await setup({ openSession: () => Effect.fail(error) })
    const response = privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1" })))
    expect(response.status).toBe(code); expect(await response.json()).toEqual({ error: message })
  })
  it("rejects absent/incorrect media types, invalid UTF8, declared/actual size and malformed JSON before writes", async () => {
    const f = await setup(), text = JSON.stringify({ buyer, budgetUsd: "1" }), bytes = new TextEncoder().encode(text)
    for (const [value, headers] of [[bytes, { "content-type": "text/plain" }], [bytes, { "content-length": "1" }],
      [bytes, { "content-length": String(bytes.length + 1) }], [bytes, { "content-length": "16385" }], [bytes, { "content-length": "1e2" }],
      [new Uint8Array([0xff]), {}], [new Uint8Array(16385), {}], [new TextEncoder().encode(text + "{}"), {}]] as Array<[Uint8Array, Record<string, string>]>) {
      const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(value); c.close() } })
      const response = privateResponse(await f.handle(streamRequest(stream, headers)))
      expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: "input_invalid" })
    }
    expect(f.writes).not.toHaveBeenCalled()
    const chunks = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, 20)); c.enqueue(bytes.slice(20)); c.close() } })
    expect(privateResponse(await f.handle(streamRequest(chunks, { "content-length": String(bytes.length) }))).status).toBe(201)
  })
  it("cancels a stalled body at the single five-second deadline and cannot write after late bytes", async () => {
    vi.useFakeTimers(); const f = await setup(), cancel = vi.fn(), holder: { controller?: ReadableStreamDefaultController<Uint8Array> } = {}
    const request = streamRequest(new ReadableStream<Uint8Array>({ start(c) { holder.controller = c; c.enqueue(new TextEncoder().encode("{")) }, cancel }))
    const result = f.handle(request); await vi.advanceTimersByTimeAsync(5000)
    expect(privateResponse(await result).status).toBe(400); expect(cancel).toHaveBeenCalledTimes(1); expect(f.writes).not.toHaveBeenCalled()
    expect(() => holder.controller!.enqueue(new TextEncoder().encode("}"))).toThrow()
    await vi.runAllTimersAsync(); expect(f.writes).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })
  it("aborts the owned body reader and interrupts a pending Store read without a retry", async () => {
    const cancel = vi.fn(), abort = new AbortController(), f = await setup()
    const pending = f.handle(streamRequest(new ReadableStream<Uint8Array>({ cancel }), {}, abort.signal))
    abort.abort(); expect(privateResponse(await pending).status).toBe(400); expect(cancel).toHaveBeenCalledTimes(1); expect(f.writes).not.toHaveBeenCalled()
    let started = false, finalized = 0
    const a = await open(f), slow = await setup({ getSessionSnapshot: () => Effect.zipRight(Effect.sync(() => { started = true }),
      Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => { finalized++ })))) })
    const signal = new AbortController(), result = slow.handle(new Request(read(a.session_id, a.session_token), { signal: signal.signal }))
    for (let i = 0; !started && i < 10; i++) await Promise.resolve()
    expect(started).toBe(true); signal.abort(); expect(privateResponse(await result).status).toBe(503)
    expect(finalized).toBe(1); expect(slow.reads).toHaveBeenCalledTimes(1); expect(slow.closes).not.toHaveBeenCalled()
  })
  it("keeps invalid capabilities uniformly404 while32 authenticated handlers occupy capacity", async () => {
    const f = await setup(), a = await open(f), cancels = Array.from({ length: 32 }, () => new AbortController())
    const pending = cancels.map(signal => f.handle(new Request(`http://127.0.0.1/sessions/${a.session_id}/close`, {
      method: "POST", headers: { "x-session-token": a.session_token }, body: new ReadableStream<Uint8Array>(), signal: signal.signal, duplex: "half"
    } as RequestInit)))
    try {
      const invalid = privateResponse(await f.handle(read(a.session_id, "")))
      expect(invalid.status).toBe(404); expect(await invalid.json()).toEqual({ error: "session_not_found" }); expect(f.reads).not.toHaveBeenCalled()
      const overloaded = privateResponse(await f.handle(read(a.session_id, a.session_token)))
      expect(overloaded.status).toBe(429); expect(await overloaded.json()).toEqual({ error: "session_capacity" })
      expect(privateResponse(await f.handle(post("/sessions", { buyer, budgetUsd: "1" }))).status).toBe(429)
    } finally { cancels.forEach(c => c.abort()); await Promise.all(pending) }
    expect(privateResponse(await f.handle(read(a.session_id, a.session_token))).status).toBe(200)
    expect(f.closes).not.toHaveBeenCalled()
  })
  it.each(["reserved", "settling", "uncertain"])("reports authoritative %s hold and refuses close without releasing it", async state => {
    const f = await setup(), a = await open(f, "0.0001"), p = await reserve(f, a.session_id)
    if (state !== "reserved") await run(f.sessions.beginSettlement(a.session_id, p.job.id))
    if (state === "uncertain") await run(f.sessions.markUncertain(a.session_id, p.job.id))
    f.reads.mockClear()
    const status = await privateResponse(await f.handle(read(a.session_id, a.session_token))).json()
    expect(Object.keys(status).sort()).toEqual(["budget", "calls", "closed", "complete", "held", "network", "rail", "remaining", "session_id", "spent"])
    expect(status).toMatchObject({ held: "$0.00003", remaining: "$0.00007", spent: "$0.00", complete: false, closed: false,
      calls: [{ jobId: p.job.id, state, priceAtomic: "30", settled: false }] })
    expect(f.reads).toHaveBeenCalledTimes(1)
    const response = privateResponse(await f.handle(post(`/sessions/${a.session_id}/close`, {}, { "x-session-token": a.session_token })))
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "session_pending" })
    expect((await run(f.sessions.snapshot(a.session_id))).calls[0]?.state).toBe(state)
    expect(f.closes).toHaveBeenCalledTimes(1)
  })
  it("roundtrips actual RailTest evidence and released calls, with same-snapshot closed recovery", async () => {
    const f = await setup(), a = await open(f, "9007199254.740993"), p = await reserve(f, a.session_id)
    const railState = await run(Ref.make(makeTestState({ [buyer]: 100n }))), rail = makeTestRail(railState)
    const requirements = await run(rail.challenge({ payTo: p.binding.payTo, priceAtomic: p.binding.amountAtomic, resource: "http://127.0.0.1/no-network" }))
    const verified = await run(rail.verify(PaymentPayload.make({ x402Version: 2, accepted: requirements, payload: {
      authorization: { from: buyer, to: p.binding.payTo, value: "30", validAfter: String(p.binding.validAfter), validBefore: String(p.binding.validBefore), nonce: p.binding.nonce }, signature: "0x0000"
    } }), requirements))
    await run(f.sessions.beginSettlement(a.session_id, p.job.id)); const settlement = await run(rail.settle(verified))
    await run(f.sessions.commit({ kind: "settled", ...terminal(p, true, settlement.txHash), settlement }))
    const q = await reserve(f, a.session_id, 2, 20n); await run(f.sessions.release({ kind: "released", ...terminal(q, false) }))
    const before = await privateResponse(await f.handle(read(a.session_id, a.session_token))).json()
    expect(before).toMatchObject({ spent: "$0.00003", held: "$0.00", remaining: "$9007199254.740963", complete: true, closed: false,
      calls: [{ state: "settled", settleRef: settlement.txHash, settleRefKind: "test", priceAtomic: "30" }, { state: "released", priceAtomic: "20" }] })
    expect(before).not.toHaveProperty("closed_receipt")
    const receipt = await privateResponse(await f.handle(post(`/sessions/${a.session_id}/close`, {}, { "x-session-token": a.session_token }))).json()
    f.reads.mockClear(); f.closes.mockClear()
    const seen: SessionSnapshot[] = []
    const projection = vi.fn(f.sessions.sessionReceipt), once = vi.fn((id: string) => f.sessions.snapshot(id).pipe(Effect.tap(s => Effect.sync(() => { seen.push(s) }))))
    const handle = makeSessionRoutes({ sessions: { ...f.sessions, snapshot: once, sessionReceipt: projection }, rails: f.rails,
      sessionStorage: "volatile", hubSecret: secret, configuredHubSecret: "" })
    const recovered = await privateResponse(await handle(read(a.session_id, a.session_token))).json()
    expect(recovered.closed_receipt).toEqual(receipt); expect(receipt.settlementRefs).toEqual([settlement.txHash])
    expect(receipt.budgetAtomic).toBe("9007199254740993"); expect(receipt.spentAtomic).toBe("30")
    expect(f.reads).toHaveBeenCalledTimes(1); expect(once).toHaveBeenCalledTimes(1); expect(projection).toHaveBeenCalledTimes(1)
    expect(projection.mock.calls[0]?.[0]).toBe(seen[0]); expect(seen).toHaveLength(1)
    expect(f.closes).not.toHaveBeenCalled()
    expect(JSON.stringify(recovered)).not.toContain("PRIVATE_INPUT"); expect(JSON.stringify(recovered)).not.toContain("requestDigest")
    expect((await run(Ref.get(railState))).balances.get(buyer)).toBe(70n)
  })
  it("does not wait for an uncooperative cancellation or admit late valid bytes", async () => {
    vi.useFakeTimers(); const f = await setup(), cancels = vi.fn(() => new Promise<void>(() => {}))
    const holder: { controller?: ReadableStreamDefaultController<Uint8Array> } = {}
    const result = f.handle(streamRequest(new ReadableStream<Uint8Array>({ start(c) { holder.controller = c }, cancel: cancels })))
    await vi.advanceTimersByTimeAsync(5000)
    expect(privateResponse(await result).status).toBe(400); expect(cancels).toHaveBeenCalledTimes(1)
    expect(() => holder.controller!.enqueue(new TextEncoder().encode(JSON.stringify({ buyer, budgetUsd: "1" })))).toThrow()
    expect(f.writes).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
    await open(f); expect(f.writes).toHaveBeenCalledTimes(1)
  })
  it("does not read the wrong-capability close body and preserves complete-read rather than per-chunk deadline", async () => {
    vi.useFakeTimers(); const f = await setup(), a = await open(f), stream = new ReadableStream<Uint8Array>(), reader = vi.spyOn(stream, "getReader")
    const wrong = new Request(`http://127.0.0.1/sessions/${a.session_id}/close`, { method: "POST", body: stream, duplex: "half" } as RequestInit)
    expect(privateResponse(await f.handle(wrong)).status).toBe(404); expect(reader).not.toHaveBeenCalled(); expect(f.closes).not.toHaveBeenCalled()
    const holder: { controller?: ReadableStreamDefaultController<Uint8Array> } = {}, cancel = vi.fn()
    const pending = f.handle(streamRequest(new ReadableStream<Uint8Array>({ start(c) { holder.controller = c }, cancel })))
    await vi.advanceTimersByTimeAsync(4000); holder.controller!.enqueue(new TextEncoder().encode("{"))
    await vi.advanceTimersByTimeAsync(1000); expect(privateResponse(await pending).status).toBe(400)
    expect(cancel).toHaveBeenCalledTimes(1); expect(f.writes).toHaveBeenCalledTimes(1)
  })
  it("accepts exactly16KiB JSON bytes and refuses the next byte without a write", async () => {
    const f = await setup(), json = JSON.stringify({ buyer, budgetUsd: "1" })
    const exact = json.padEnd(16384, " ")
    const good = privateResponse(await f.handle(new Request("http://127.0.0.1/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: exact })))
    expect(good.status).toBe(201)
    const bad = privateResponse(await f.handle(new Request("http://127.0.0.1/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: exact + " " })))
    expect(bad.status).toBe(400); expect(f.writes).toHaveBeenCalledTimes(1)
  })
  it("interrupts pending close exactly once without retrying or claiming a receipt", async () => {
    const f = await setup(), a = await open(f); let started = false, finalized = 0
    const slow = await setup({ closeSession: () => Effect.zipRight(Effect.sync(() => { started = true }),
      Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => { finalized++ })))) })
    const abort = new AbortController(), result = slow.handle(new Request(`http://127.0.0.1/sessions/${a.session_id}/close`,
      { method: "POST", headers: { "x-session-token": a.session_token }, signal: abort.signal }))
    for (let i = 0; !started && i < 20; i++) await Promise.resolve()
    expect(started).toBe(true); abort.abort()
    const response = privateResponse(await result); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "session_unavailable" })
    expect(finalized).toBe(1); expect(slow.closes).toHaveBeenCalledTimes(1); expect(slow.writes).not.toHaveBeenCalled(); expect(slow.reads).not.toHaveBeenCalled()
    expect((await run(f.sessions.snapshot(a.session_id))).session.closedAtMs).toBeUndefined()
  })
  it("keeps captured missing-secret admission unavailable without hiding existing real-rail evidence", async () => {
    const f = await setup({ sessionStorage: "durable" }, secret, "gateway")
    const initial = await run(f.sessions.openSession({ buyer, budgetAtomic: 100n, openedAtMs: Date.now(), rail: "gateway" }))
    const handle = makeSessionRoutes({ sessions: f.sessions, rails: f.rails, sessionStorage: "durable", hubSecret: secret })
    const response = privateResponse(await handle(post("/sessions", { buyer, budgetUsd: "1" })))
    expect(response.status).toBe(503)
    expect(privateResponse(await handle(read(initial.id, sessionToken(secret, initial.id)))).status).toBe(200)
    expect(privateResponse(await handle(post(`/sessions/${initial.id}/close`, {}, { "x-session-token": sessionToken(secret, initial.id) }))).status).toBe(200)
  })
  it("enforces elapsed monotonic deadline even when body microtasks precede the timer callback", async () => {
    const f = await setup(); let elapsed = 0
    const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed)
    try {
      const stream = new ReadableStream<Uint8Array>({ pull(c) {
        elapsed = 5001; c.enqueue(new Uint8Array()); c.enqueue(new TextEncoder().encode(JSON.stringify({ buyer, budgetUsd: "1" }))); c.close()
      } })
      const response = privateResponse(await f.handle(streamRequest(stream)))
      expect(response.status).toBe(400); expect(f.writes).not.toHaveBeenCalled()
    } finally { clock.mockRestore() }
  })
  it("ignores a reader that resolves valid bytes only after timeout while cancellation never resolves", async () => {
    vi.useFakeTimers(); const f = await setup(), stream = new ReadableStream<Uint8Array>()
    const request = streamRequest(stream), reader = stream.getReader()
    type ReadResult = Awaited<ReturnType<typeof reader.read>>
    let resolveRead: ((result: ReadResult) => void) | undefined
    vi.spyOn(reader, "read").mockImplementation(() => new Promise<ReadResult>(resolve => { resolveRead = resolve }))
    vi.spyOn(reader, "cancel").mockImplementation(() => new Promise<void>(() => {})); vi.spyOn(reader, "releaseLock")
    vi.spyOn(stream, "getReader").mockReturnValue(reader)
    const result = f.handle(request); await vi.advanceTimersByTimeAsync(5000)
    expect(privateResponse(await result).status).toBe(400); expect(reader.releaseLock).toHaveBeenCalledTimes(1)
    resolveRead!({ done: false, value: new TextEncoder().encode(JSON.stringify({ buyer, budgetUsd: "1" })) })
    await vi.runAllTimersAsync(); expect(f.writes).not.toHaveBeenCalled(); expect(reader.read).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
