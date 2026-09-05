import { describe, expect, it, vi } from "vitest"
import { Cause, Effect, Exit } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { decodeHeaderJson, TRANSFER_TYPES } from "@arcade/payments"
import { recoverTypedDataAddress } from "viem"
import { formatPrice, loadChainConfig } from "@arcade/core"
import { sessionData, sessionBudget, sessionOrigin, decodeSessionOpen, decodeSessionStatus, decodeSessionClosed,
  decodeSessionListing, decodeSessionChallenge, decodeSessionAccepted, decodeSessionResult } from "../src/session-wire.ts"
import { openSession } from "../src/session.ts"

const chain = loadChainConfig(), buyer = `0x${"11".repeat(20)}`, seller = `0x${"22".repeat(20)}`
const id = `ses_${"ab".repeat(16)}`, token = "cd".repeat(16), jobId = `job_${"ab".repeat(16)}`, nonce = `0x${"34".repeat(32)}`
const identity = { id, buyer, rail: "test" as const, network: chain.caip2, budgetAtomic: 10_000_000n }
const open = () => ({ session_id: id, session_token: token, rail: "test", network: chain.caip2, budget: "$10.00", note: "Untrusted note" })
const call = () => ({ jobId, skillId: "flow", priceAtomic: "1000000", state: "settled", settled: true,
  settleRef: `0xtest${"ab".repeat(16)}`, settleRefKind: "test", createdAtMs: 1000 })
const closed = () => ({ sessionId: id, buyer, rail: "test", network: chain.caip2, budgetAtomic: "10000000", spentAtomic: "1000000", heldAtomic: "0",
  calls: [call()], settledCalls: 1, settlementRefs: [call().settleRef], complete: true, openedAtMs: 1000, closedAtMs: 2000 })
const status = () => ({ session_id: id, rail: "test", network: chain.caip2, budget: "$10.00", spent: "$1.00", held: "$0.00", remaining: "$9.00", calls: [call()], complete: true, closed: false })
const listing = () => ({ id: "flow", serviceName: "service", version: "1.0.0", seller, price: "$1.00", stats: { advisory: true } })
const resource = "https://hub.example/x/service/flow"
const requirements = () => ({ scheme: "exact", network: chain.caip2, asset: chain.usdc.address.toLowerCase(), amount: "1000000", payTo: seller,
  resource, mimeType: "application/json", maxTimeoutSeconds: 604900, extra: { name: chain.usdc.eip712Name, version: chain.usdc.eip712Version } })
const accepted = () => ({ job_id: jobId, status: "queued", poll_url: `https://hub.example/jobs/${jobId}/result`, job_token: token, price: "$1.00" })
const receipt = () => ({ jobId, skillId: "flow", skillVersion: "1.0.0", buyer, seller, priceAtomic: "1000000", sellerAtomic: "1000000", feeAtomic: "0", feeBps: 0,
  rail: "test", network: chain.caip2, latencyMs: 1000, createdAtMs: 2000, settled: true, reason: "ok", rootJobId: jobId, hop: 0, ancestors: [],
  authorizationNonce: nonce, sessionId: id, settleTx: call().settleRef, settleRefKind: "test", price: "$1.00", sellerShare: "$1.00", fee: "$0.00", explorer: null })

describe("buyer session wire boundary", () => {
  it("accepts exact integer money above Number precision and refuses noncanonical budgets", () => {
    const amount = 9007199254740993n
    expect(sessionBudget("9007199254.740993")).toBe(amount)
    expect(sessionBudget(((1n << 256n) - 1n) / 1_000_000n + "." + (((1n << 256n) - 1n) % 1_000_000n).toString().padStart(6, "0"))).toBe((1n << 256n) - 1n)
    for (const bad of ["0", "01", "+1", "1e1", " 1", "$1", "1.0000001", 1, (1n << 256n).toString()]) expect(() => sessionBudget(bad)).toThrow()
  })
  it("captures only exact safe origins", () => {
    for (const origin of ["https://hub.example", "http://127.0.0.1:8787", "http://[::1]:8787"]) expect(sessionOrigin(origin)).toBe(origin)
    for (const bad of ["http://hub.example", "https://hub.example/", "https://hub.example/x", "https://u:p@hub.example", "https://hub.example?", "https://hub.example#", " https://hub.example", "https:\\hub.example"]) expect(() => sessionOrigin(bad)).toThrow()
  })
  it("normalizes own JSON before getters/serialization and preserves immutable input", () => {
    let gets = 0
    const source = { a: [1, { x: "initial" }] }, copied = sessionData(source)
    source.a[1] = { x: "changed" }; expect(copied).toEqual({ a: [1, { x: "initial" }] })
    expect(() => sessionData({ get x() { gets++; return "PRIVATE" } })).toThrow(); expect(gets).toBe(0)
    for (const bad of [{ __bigint: "1" }, new Date(), [undefined], new Array(2), { x: NaN }, { ["\"".repeat(16385)]: 1 }]) expect(() => sessionData(bad, 16384)).toThrow()
  })
  it("binds the six-field open response and never exports its remote note", () => {
    const decoded = decodeSessionOpen(open(), { buyer, chain, budgetAtomic: 10_000_000n, rail: "test" })
    expect(decoded).toEqual({ ...identity, token }); expect(JSON.stringify(decoded, (_k, v) => typeof v === "bigint" ? v.toString() : v)).not.toContain("Untrusted")
    for (const delta of [{ network: "eip155:1" }, { rail: "gateway" }, { budget: "$10.000000" }, { session_id: "ses_1" }, { session_token: token.toUpperCase() }, { unknown: 1 }])
      expect(() => decodeSessionOpen({ ...open(), ...delta }, { buyer, chain, budgetAtomic: 10_000_000n, rail: "test" })).toThrow()
  })
  it("validates full status arithmetic, unique calls and closed artifact identity", () => {
    expect(decodeSessionStatus(status(), identity)).toMatchObject({ remainingAtomic: 9_000_000n, complete: true, closed: false })
    expect(decodeSessionClosed(closed(), identity)).toEqual(closed())
    expect(decodeSessionStatus({ ...status(), closed: true, closed_receipt: closed() }, identity)).toMatchObject({ closed: true, closedReceipt: closed() })
    for (const delta of [{ held: "$1.00" }, { remaining: "$10.00" }, { calls: [call(), call()] }, { closed: true }, { closed_receipt: closed() }, { calls: [{ ...call(), jobId: `job_${"a".repeat(129)}` }] }])
      expect(() => decodeSessionStatus({ ...status(), ...delta }, identity)).toThrow()
    for (const delta of [{ buyer: seller }, { settlementRefs: [] }, { heldAtomic: "1" }, { calls: [{ ...call(), settleRefKind: "onchain" }] }]) expect(() => decodeSessionClosed({ ...closed(), ...delta }, identity)).toThrow()
  })
  it("matches same closed calls independent of JSON object key order", () => {
    const reversed = Object.fromEntries(Object.entries(call()).reverse())
    expect(decodeSessionStatus({ ...status(), closed: true, closed_receipt: { ...closed(), calls: [reversed] } }, identity)).toMatchObject({ closed: true })
  })
  it("projects bounded listing authority and requires the session rail's exact challenge", () => {
    const l = decodeSessionListing(listing(), "service", "flow")
    expect(l).toEqual({ id: "flow", serviceName: "service", version: "1.0.0", seller, priceAtomic: 1_000_000n })
    expect(decodeSessionChallenge({ x402Version: 2, error: "payment required", accepts: [requirements()] }, identity, chain, l, resource).amount).toBe("1000000")
    for (const delta of [{ payTo: buyer }, { resource: resource + "?token=x" }, { amount: "1000001" }, { extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway?.wallet } }])
      expect(() => decodeSessionChallenge({ x402Version: 2, error: "payment required", accepts: [{ ...requirements(), ...delta }] }, identity, chain, l, resource)).toThrow()
  })
  it("requires opaque explicit job token and exact query-free result URL", () => {
    expect(decodeSessionAccepted(accepted(), "https://hub.example", 1_000_000n)).toMatchObject({ jobId, jobToken: token })
    for (const delta of [{ poll_url: accepted().poll_url + `?token=${token}` }, { poll_url: `https://evil.example/jobs/${jobId}/result` }, { job_token: "" }, { job_id: `job_${"a".repeat(129)}` }, { price: formatPrice(2n) }])
      expect(() => decodeSessionAccepted({ ...accepted(), ...delta }, "https://hub.example", 1_000_000n)).toThrow()
  })
  it("binds terminal output to local authorization, never a contradictory or released output", () => {
    const context = { identity, chain, listing: decodeSessionListing(listing(), "service", "flow"), jobId, nonce, amountAtomic: 1_000_000n, requirements: requirements() }
    const success = { job_id: jobId, status: "succeeded", result: { ok: true }, receipt: receipt() }
    expect(decodeSessionResult(200, success, context)).toMatchObject({ kind: "terminal", status: "succeeded", result: { ok: true } })
    for (const delta of [{ authorizationNonce: `0x${"56".repeat(32)}` }, { seller: buyer }, { settleRefKind: "onchain" }, { feeAtomic: "1" }, { reason: "not paid" }, { skillVersion: "other" }, { sessionId: `ses_${"12".repeat(16)}` }])
      expect(() => decodeSessionResult(200, { ...success, receipt: { ...receipt(), ...delta } }, context)).toThrow()
    expect(decodeSessionResult(202, { job_id: jobId, status: "pending" }, context)).toEqual({ kind: "pending" })
    expect(decodeSessionResult(503, { error: "session_settlement_uncertain", settlement_status: "uncertain" }, context)).toEqual({ kind: "uncertain" })
    expect(() => decodeSessionResult(202, { job_id: jobId, status: "pending", result: "PRIVATE" }, context)).toThrow()
  })
  it("rejects successful empty output even beside a syntactically correlated receipt", () => {
    const context = { identity, chain, listing: decodeSessionListing(listing(), "service", "flow"), jobId, nonce, amountAtomic: 1_000_000n, requirements: requirements() }
    for (const result of [null, " ", [], {}]) expect(() => decodeSessionResult(200, { job_id: jobId, status: "succeeded", result, receipt: receipt() }, context)).toThrow()
  })
  it("schema failures in pure session decoders do not retain private malformed values", () => {
    let caught: unknown
    try { decodeSessionClosed({ ...closed(), closedAtMs: "PRIVATE_SCHEMA_SENTINEL" }, identity) } catch (error) { caught = error }
    expect(caught).toBeDefined(); expect(String(caught)).not.toContain("PRIVATE_SCHEMA_SENTINEL")
  })
  for (const trap of ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"] as const) it(`normalizes a throwing ${trap} proxy to the fixed pure error`, () => {
    const value = new Proxy({ ok: true }, { [trap]: () => { throw Error("PRIVATE_PROXY_SENTINEL") } }); let caught: unknown
    try { sessionData(value) } catch (error) { caught = error }
    expect(caught).toMatchObject({ _tag: "SessionWireInvalid" }); expect(String(caught)).not.toContain("PRIVATE_PROXY_SENTINEL")
  })
})

const dummyAccount = privateKeyToAccount(`0x${"01".repeat(32)}`)
function sdkFixture(mode: "success" | "lost-paid" | "unsigned202" | "uncertain" | "lost-close" | "pending-close" = "success", amount = 1_000_000n, rail: "test" | "gateway" | "eip3009" = "test") {
  const seen: Request[] = []; let signs = 0, paid = 0, closedState = false, authNonce = nonce
  const fixtureReceipt = () => ({ ...receipt(), buyer: dummyAccount.address.toLowerCase(), authorizationNonce: authNonce,
    priceAtomic: amount.toString(), sellerAtomic: amount.toString(), price: formatPrice(amount), sellerShare: formatPrice(amount), rail,
    settleTx: fixtureCall().settleRef, settleRefKind: fixtureCall().settleRefKind,
    explorer: rail === "eip3009" ? `${chain.explorerBaseUrl}/tx/${fixtureCall().settleRef}` : null })
  const fixtureCall = () => ({ ...call(), priceAtomic: amount.toString(), settleRefKind: rail === "gateway" ? "gateway-transfer" : rail === "eip3009" ? "onchain" : "test",
    settleRef: rail === "gateway" ? "12345678-1234-4234-8234-123456789abc" : rail === "eip3009" ? `0x${"ab".repeat(32)}` : call().settleRef })
  const fixtureClosed = () => ({ ...closed(), buyer: dummyAccount.address.toLowerCase(), calls: paid ? [fixtureCall()] : [], rail,
    spentAtomic: paid ? amount.toString() : "0", settledCalls: paid ? 1 : 0, settlementRefs: paid ? [fixtureCall().settleRef] : [] })
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(String(url), init); seen.push(req)
    const path = new URL(req.url).pathname
    if (path === "/sessions" && req.method === "POST") return Response.json({ ...open(), rail }, { status: 201 })
    if (path === `/sessions/${id}/close`) {
      if (mode === "pending-close") return Response.json({ error: "session_pending" }, { status: 409 })
      closedState = true
      if (mode === "lost-close") throw Error(`PRIVATE_CLOSE ${token}`)
      return Response.json(fixtureClosed())
    }
    if (path === `/sessions/${id}`) return Response.json({ ...status(), rail, spent: paid ? formatPrice(amount) : "$0.00", remaining: paid ? formatPrice(10_000_000n - amount) : "$10.00",
      calls: paid ? [fixtureCall()] : [], closed: closedState, ...(closedState ? { closed_receipt: fixtureClosed() } : {}) })
    if (path === "/listings/flow") return Response.json({ ...listing(), price: formatPrice(amount) })
    if (path === `/jobs/${jobId}/result`) return mode === "uncertain"
      ? Response.json({ error: "session_settlement_uncertain", settlement_status: "uncertain" }, { status: 503 })
      : Response.json({ job_id: jobId, status: "succeeded", result: { bought: true }, receipt: fixtureReceipt() })
    if (path === "/x/service/flow") {
      const payment = req.headers.get("payment-signature")
      if (!payment) return mode === "unsigned202" ? Response.json(accepted(), { status: 202 })
        : Response.json({ x402Version: 2, error: "payment required", accepts: [{ ...requirements(), amount: amount.toString(),
          ...(rail === "gateway" ? { extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway!.wallet } } : {}) }] }, { status: 402 })
      const p = decodeHeaderJson(payment) as { payload: { authorization: { nonce: string } } }; authNonce = p.payload.authorization.nonce
      if (mode === "lost-paid") throw Error(`PRIVATE_PAID ${payment}`)
      paid++
      return Response.json({ ...accepted(), price: formatPrice(amount) }, { status: 202 })
    }
    throw Error("Unexpected fixture route")
  }) as typeof fetch
  const account = { ...dummyAccount, signTypedData: ((args: Parameters<typeof dummyAccount.signTypedData>[0]) => { signs++; return dummyAccount.signTypedData(args) }) as typeof dummyAccount.signTypedData }
  return { fetcher, account, seen, signs: () => signs, paid: () => paid }
}
const sdkArgs = (f: ReturnType<typeof sdkFixture>) => ({ hubUrl: "https://hub.example", account: f.account, budgetUsd: "10", rail: "test" as const, fetch: f.fetcher })
const buy = { seller: "service", skillId: "flow", input: { requested: true }, maxWaitMs: 1000, pollIntervalMs: 1 }
const temporalClosed = () => ({ ...closed(), buyer: dummyAccount.address.toLowerCase() })
const temporalStatus = (proof?: ReturnType<typeof temporalClosed>) => ({ ...status(), closed: proof !== undefined,
  ...(proof === undefined ? {} : { calls: proof.calls, spent: formatPrice(BigInt(proof.spentAtomic)),
    remaining: formatPrice(10_000_000n - BigInt(proof.spentAtomic)), closed_receipt: proof }) })
function temporalFixture(handler: (path: string) => Promise<Response>) {
  const f = sdkFixture(); let requests = 0
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    requests++; const path = new URL(String(url)).pathname
    return path === "/sessions" ? f.fetcher(url, init) : handler(path)
  }) as typeof fetch
  return { create: () => Effect.runPromise(openSession({ ...sdkArgs(f), fetch: fetcher })), signs: f.signs, requests: () => requests }
}
describe("buyer session lifecycle", () => {
  it("refuses an in-flight open status after a concurrent close has already been proved", async () => {
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    const f = temporalFixture(async path => {
      if (path.endsWith("/close")) return Response.json(temporalClosed())
      entered(); await gate; return Response.json(temporalStatus())
    })
    const s = await f.create(), pending = Effect.runPromise(Effect.either(s.status()))
    try {
      await started; expect((await Effect.runPromise(s.close())).closedAtMs).toBe(2000)
      release(); expect(await pending).toMatchObject({ _tag: "Left", left: { code: "invalid_response" } })
      const before = f.requests()
      expect(await Effect.runPromise(Effect.either(s.call(buy)))).toMatchObject({ _tag: "Left", left: { code: "session_closed" } })
      expect(f.requests()).toBe(before); expect(f.signs()).toBe(0)
    } finally { release(); await pending }
  })
  it("refuses changed closed evidence and preserves the first proof without reopening signing", async () => {
    let reads = 0
    const first = temporalClosed(), f = temporalFixture(async () => Response.json(temporalStatus(++reads === 2 ? { ...first, closedAtMs: 3000 } : first)))
    const s = await f.create(), original = await Effect.runPromise(s.status())
    expect(original.closedReceipt?.closedAtMs).toBe(2000)
    expect(await Effect.runPromise(Effect.either(s.status()))).toMatchObject({ _tag: "Left", left: { code: "invalid_response" } })
    expect(await Effect.runPromise(s.status())).toEqual(original)
    const before = f.requests()
    expect(await Effect.runPromise(Effect.either(s.call(buy)))).toMatchObject({ _tag: "Left", left: { code: "session_closed" } })
    expect(f.requests()).toBe(before); expect(f.signs()).toBe(0)
  })
  it("retains the complete closed projection including changed calls and settlement references", async () => {
    const first = temporalClosed(), changedRef = `0xtest${"cd".repeat(16)}`
    const changes = [
      { ...first, openedAtMs: 999 },
      { ...first, calls: [{ ...call(), skillId: "different" }] },
      { ...first, calls: [{ ...call(), createdAtMs: 1001 }] },
      { ...first, calls: [{ ...call(), settleRef: changedRef }], settlementRefs: [changedRef] },
      { ...first, calls: [{ ...call(), priceAtomic: "2000000" }], spentAtomic: "2000000" }
    ]
    for (const changed of changes) {
      let reads = 0
      const f = temporalFixture(async () => Response.json(temporalStatus(++reads === 1 ? first : changed))), s = await f.create()
      await Effect.runPromise(s.status())
      expect(await Effect.runPromise(Effect.either(s.status()))).toMatchObject({ _tag: "Left", left: { code: "invalid_response" } })
      expect(f.signs()).toBe(0)
    }
  })
  it("accepts repeated identical closed evidence despite nested object key ordering", async () => {
    let reads = 0
    const reverse = (value: object) => Object.fromEntries(Object.entries(value).reverse())
    const f = temporalFixture(async () => {
      const original = temporalStatus(temporalClosed())
      return Response.json(++reads === 1 ? original : reverse({ ...original, calls: original.calls.map(reverse),
        closed_receipt: reverse({ ...temporalClosed(), calls: temporalClosed().calls.map(reverse) }) }))
    })
    const s = await f.create(), first = await Effect.runPromise(s.status())
    expect(await Effect.runPromise(s.status())).toEqual(first); expect(f.signs()).toBe(0)
  })
  it("quotes actual input with the captured session rail without signer entry or exposure", async () => {
    const f = sdkFixture(), s = await Effect.runPromise(openSession(sdkArgs(f)))
    const quote = await Effect.runPromise(s.quote({ seller: "service", skillId: "flow", input: { quote: true } }))
    expect(quote).toEqual({ priceAtomic: 1_000_000n, rail: "test", network: chain.caip2, serviceName: "service", skillId: "flow", skillVersion: "1.0.0", seller })
    expect(f.signs()).toBe(0); expect(f.paid()).toBe(0)
    const probe = f.seen.find(r => new URL(r.url).pathname.startsWith("/x/"))!
    expect(probe.headers.get("x-arcade-session")).toBe(id); expect(probe.headers.get("x-session-token")).toBe(token)
    expect(await probe.text()).toBe('{"quote":true}')
    expect(await Effect.runPromise(s.status())).toMatchObject({ localIssuedAtomic: 0n, localExposureAtomic: 0n })
  })
  it("opens, signs once, polls with separate capabilities and returns fenced correlated output", async () => {
    const f = sdkFixture(), s = await Effect.runPromise(openSession(sdkArgs(f))), result = await Effect.runPromise(s.call(buy))
    expect(result).toMatchObject({ jobId, status: "succeeded", result: { bought: true }, authorizedAmountAtomic: 1_000_000n })
    expect(result.fencedResult).toContain("bought"); expect(f.signs()).toBe(1); expect(f.paid()).toBe(1)
    for (const request of f.seen.filter(r => new URL(r.url).pathname.startsWith("/x/"))) {
      expect(request.headers.get("x-arcade-session")).toBe(id); expect(request.headers.get("x-session-token")).toBe(token)
    }
    const poll = f.seen.find(r => new URL(r.url).pathname.endsWith("/result"))!
    expect(poll.headers.get("x-job-token")).toBe(token); expect(new URL(poll.url).search).toBe("")
    expect(JSON.stringify(s, (_k, v) => typeof v === "bigint" ? v.toString() : v)).not.toContain(token)
    expect(await Effect.runPromise(s.status())).toMatchObject({ localIssuedAtomic: 1_000_000n, localConfirmedAtomic: 1_000_000n, localExposureAtomic: 0n })
  })
  it("claims one open/call/close Effect outside repeated and concurrent evaluation", async () => {
    const f = sdkFixture(), opening = openSession(sdkArgs(f)), s = await Effect.runPromise(opening)
    expect((await Effect.runPromise(Effect.either(opening)))._tag).toBe("Left")
    const op = s.call(buy), results = await Promise.all([Effect.runPromise(Effect.either(op)), Effect.runPromise(Effect.either(op))])
    expect(results.filter(r => r._tag === "Right")).toHaveLength(1); expect(f.signs()).toBe(1)
    const closeOp = s.close(); await Effect.runPromise(closeOp); expect((await Effect.runPromise(Effect.either(closeOp)))._tag).toBe("Left")
    expect(f.seen.filter(r => new URL(r.url).pathname.endsWith("/close"))).toHaveLength(1)
  })
  it("retains a lost signed6 against budget10 and refuses the next explicit6 even when hub reports no job", async () => {
    const f = sdkFixture("lost-paid", 6_000_000n), s = await Effect.runPromise(openSession(sdkArgs(f)))
    const first = await Effect.runPromise(Effect.either(s.call(buy))), second = await Effect.runPromise(Effect.either(s.call(buy)))
    expect(first).toMatchObject({ _tag: "Left", left: { phase: "issued", authorizedAmountAtomic: 6_000_000n } })
    expect(second._tag).toBe("Left"); expect(f.signs()).toBe(1)
    expect(await Effect.runPromise(s.status())).toMatchObject({ heldAtomic: 0n, remainingAtomic: 10_000_000n, localIssuedAtomic: 6_000_000n, localExposureAtomic: 6_000_000n })
    expect(JSON.stringify(first, (_k, v) => typeof v === "bigint" ? v.toString() : v)).not.toMatch(/PRIVATE|payment-signature/)
  })
  it("does not treat an unsigned202 as a paid operation or poll for output", async () => {
    const f = sdkFixture("unsigned202"), s = await Effect.runPromise(openSession(sdkArgs(f)))
    expect((await Effect.runPromise(Effect.either(s.call(buy))))._tag).toBe("Left"); expect(f.signs()).toBe(0)
    expect(f.seen.some(r => new URL(r.url).pathname.endsWith("/result"))).toBe(false)
  })
  it("uncertain503 stops polling without payment retry", async () => {
    const f = sdkFixture("uncertain"), s = await Effect.runPromise(openSession(sdkArgs(f)))
    expect(await Effect.runPromise(Effect.either(s.call(buy)))).toMatchObject({ _tag: "Left", left: { code: "settlement_uncertain", phase: "issued" } })
    expect(f.signs()).toBe(1); expect(f.seen.filter(r => new URL(r.url).pathname.endsWith("/result"))).toHaveLength(1)
  })
  it("lost close blocks calls and recovers only through the matching read-only closed receipt", async () => {
    const f = sdkFixture("lost-close"), s = await Effect.runPromise(openSession(sdkArgs(f)))
    expect((await Effect.runPromise(Effect.either(s.close())))._tag).toBe("Left")
    expect((await Effect.runPromise(Effect.either(s.call(buy))))._tag).toBe("Left"); expect(f.signs()).toBe(0)
    expect(await Effect.runPromise(s.status())).toMatchObject({ closed: true, closedReceipt: { sessionId: id } })
    expect((await Effect.runPromise(Effect.either(s.close())))._tag).toBe("Left")
    expect(f.seen.filter(r => new URL(r.url).pathname.endsWith("/close"))).toHaveLength(1)
  })
  it("does not accept a later snapshot that erases a previously confirmed job", async () => {
    const f = sdkFixture(); let erased = false
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => erased && new URL(String(url)).pathname === `/sessions/${id}`
      ? Response.json({ ...status(), spent: "$0.00", remaining: "$10.00", calls: [] }) : f.fetcher(url, init)) as typeof fetch
    const s = await Effect.runPromise(openSession({ ...sdkArgs(f), fetch: fetcher })); await Effect.runPromise(s.call(buy)); erased = true
    expect((await Effect.runPromise(Effect.either(s.status())))._tag).toBe("Left")
  })
  it("retains signer-entry exposure after cancellation and never forwards a late signature", async () => {
    const f = sdkFixture(), controller = new AbortController(); let entered!: () => void, release!: () => void
    const entry = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    const account = { ...dummyAccount, signTypedData: (async (raw: Parameters<typeof dummyAccount.signTypedData>[0]) => { entered(); await gate; return dummyAccount.signTypedData(raw) }) as typeof dummyAccount.signTypedData }
    const s = await Effect.runPromise(openSession({ ...sdkArgs(f), account })), op = s.call(buy)
    const running = Effect.runPromiseExit(op, { signal: controller.signal }); await entry; controller.abort("PRIVATE_ABORT"); const exit = await running
    expect(Exit.isFailure(exit) && Cause.isInterrupted(exit.cause)).toBe(true)
    release(); await new Promise(resolve => setTimeout(resolve, 20))
    expect(f.seen.filter(r => r.headers.has("payment-signature"))).toHaveLength(0)
    expect((await Effect.runPromise(Effect.either(op)))._tag).toBe("Left")
    expect(await Effect.runPromise(s.status())).toMatchObject({ localIssuedAtomic: 1_000_000n, localExposureAtomic: 1_000_000n })
  })
  it("captures account/origin/fetch and queued input before evaluation", async () => {
    const f = sdkFixture(), args = sdkArgs(f), opening = openSession(args)
    args.hubUrl = "https://evil.example"; args.budgetUsd = "100"; args.account.address = buyer as typeof args.account.address
    args.fetch = Object.assign(async () => { throw Error("MUTATED_FETCH") }, { preconnect() {} })
    const s = await Effect.runPromise(opening), input = { x: "original" }, op = s.call({ ...buy, input }); input.x = "changed"
    await Effect.runPromise(op)
    const sent = f.seen.filter(r => new URL(r.url).pathname.startsWith("/x/"))
    expect(await Promise.all(sent.map(r => r.text()))).toEqual(['{"x":"original"}', '{"x":"original"}'])
    expect(s.buyer).toBe(dummyAccount.address.toLowerCase()); expect(s.budgetAtomic).toBe(10_000_000n)
  })
  it("bounds concurrent distinct lost purchases by one monotonic local budget", async () => {
    const f = sdkFixture("lost-paid", 6_000_000n), s = await Effect.runPromise(openSession(sdkArgs(f)))
    await Promise.all([Effect.runPromise(Effect.either(s.call(buy))), Effect.runPromise(Effect.either(s.call(buy)))])
    expect(f.signs()).toBe(1); expect(await Effect.runPromise(s.status())).toMatchObject({ localIssuedAtomic: 6_000_000n })
  })
  it("a strictly valid pending close refusal preserves the open client", async () => {
    const f = sdkFixture("pending-close"), s = await Effect.runPromise(openSession(sdkArgs(f)))
    expect(await Effect.runPromise(Effect.either(s.close()))).toMatchObject({ _tag: "Left", left: { code: "session_pending" } })
    await Effect.runPromise(s.call(buy)); expect(f.signs()).toBe(1)
  })
  it("a late pending close reply cannot reopen a client already recovered closed by status", async () => {
    const f = sdkFixture(); let respond!: () => void, closing!: () => void, reads = 0
    const started = new Promise<void>(resolve => { closing = resolve }), gate = new Promise<void>(resolve => { respond = resolve })
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith("/close")) { closing(); await gate; return Response.json({ error: "session_pending" }, { status: 409 }) }
      if (path === `/sessions/${id}`) { reads++; return Response.json({ ...status(), spent: "$0.00", remaining: "$10.00", calls: [], closed: true,
        closed_receipt: { ...closed(), buyer: dummyAccount.address.toLowerCase(), calls: [], spentAtomic: "0", settledCalls: 0, settlementRefs: [] } }) }
      return f.fetcher(url, init)
    }) as typeof fetch
    const s = await Effect.runPromise(openSession({ ...sdkArgs(f), fetch: fetcher })), op = Effect.runPromise(Effect.either(s.close()))
    await started; await Effect.runPromise(s.status()); respond(); await op
    const before = reads
    expect((await Effect.runPromise(Effect.either(s.call(buy))))._tag).toBe("Left"); expect(reads).toBe(before)
  })
  for (const rail of ["gateway", "eip3009"] as const) it(`uses actual ${rail} signer recovery and honest terminal reference category`, async () => {
    const f = sdkFixture("success", 1_000_000n, rail), s = await Effect.runPromise(openSession({ ...sdkArgs(f), rail })), result = await Effect.runPromise(s.call(buy))
    expect(result.receipt.settleRefKind).toBe(rail === "gateway" ? "gateway-transfer" : "onchain")
    const payment = f.seen.find(r => r.headers.has("payment-signature"))!.headers.get("payment-signature")!
    const p = decodeHeaderJson(payment) as { payload: { signature: `0x${string}`; authorization: { from: `0x${string}`; to: `0x${string}`; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` } } }
    const a = p.payload.authorization
    const recovered = await recoverTypedDataAddress({ domain: { name: rail === "gateway" ? "GatewayWalletBatched" : chain.usdc.eip712Name,
      version: rail === "gateway" ? "1" : chain.usdc.eip712Version, chainId: chain.chainId, verifyingContract: rail === "gateway" ? chain.gateway!.wallet : chain.usdc.address },
    types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization", message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) }, signature: p.payload.signature })
    expect(recovered.toLowerCase()).toBe(dummyAccount.address.toLowerCase()); expect(f.signs()).toBe(1)
    expect(rail === "gateway" ? result.receipt.explorer === null : typeof result.receipt.explorer === "string").toBe(true)
  })
  it("rejects malformed/ENS/lineage arguments before requests or signer entry", async () => {
    const f = sdkFixture(), s = await Effect.runPromise(openSession(sdkArgs(f))), before = f.seen.length
    for (const malformed of [{ ...buy, name: "flow.arcade.eth" }, { ...buy, lineage: "PRIVATE_CAP" }, { ...buy, seller: "../service" }, { ...buy, skillId: "flow/x" },
      { ...buy, input: { get secret() { throw Error("PRIVATE_GETTER") } } }, { ...buy, maxAmountAtomic: 1 as unknown as bigint }]) {
      expect(await Effect.runPromise(Effect.either(s.call(malformed)))).toMatchObject({ _tag: "Left", left: { code: "input_invalid", phase: "unsigned" } })
    }
    expect(f.seen).toHaveLength(before); expect(f.signs()).toBe(0)
  })
  it("an interrupted unsigned probe cannot later invoke a signer", async () => {
    const f = sdkFixture(), controller = new AbortController(); let entered!: () => void, finish!: () => void
    const entry = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { finish = resolve })
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(url)).pathname.startsWith("/x/")) { entered(); await gate }
      return f.fetcher(url, init)
    }) as typeof fetch
    const s = await Effect.runPromise(openSession({ ...sdkArgs(f), fetch: fetcher })), running = Effect.runPromiseExit(s.call(buy), { signal: controller.signal })
    await entry; controller.abort(); const result = await running; expect(Exit.isFailure(result) && Cause.isInterrupted(result.cause)).toBe(true)
    finish(); await new Promise(resolve => setTimeout(resolve, 20)); expect(f.signs()).toBe(0)
    expect(await Effect.runPromise(s.status())).toMatchObject({ localIssuedAtomic: 0n, localExposureAtomic: 0n })
  })
  it("a changed selected chain refuses before signer entry rather than signing another domain", async () => {
    const f = sdkFixture(), saved = process.env.ARCADE_NETWORK
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const reply = await f.fetcher(url, init)
      if (new URL(String(url)).pathname.startsWith("/x/")) process.env.ARCADE_NETWORK = "arc-mainnet"
      return reply
    }) as typeof fetch
    try {
      const s = await Effect.runPromise(openSession({ ...sdkArgs(f), fetch: fetcher }))
      expect((await Effect.runPromise(Effect.either(s.call(buy))))._tag).toBe("Left"); expect(f.signs()).toBe(0)
    } finally { if (saved === undefined) delete process.env.ARCADE_NETWORK; else process.env.ARCADE_NETWORK = saved }
  })
  it("cancels its actual pending poll timer instead of leaving an owned long timer behind", async () => {
    const f = sdkFixture(), controller = new AbortController(), originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>(); let entered!: () => void
    const entry = new Promise<void>(resolve => { entered = resolve })
    const set = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) => {
      const handle = originalSet(callback, delay, ...args)
      if (delay === 60000) { pendingTimers.add(handle); entered() }
      return handle
    })
    const clear = vi.spyOn(globalThis, "clearTimeout").mockImplementation(handle => { pendingTimers.delete(handle as ReturnType<typeof setTimeout>); originalClear(handle) })
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => new URL(String(url)).pathname.endsWith("/result")
      ? Response.json({ job_id: jobId, status: "pending" }, { status: 202 }) : f.fetcher(url, init)) as typeof fetch
    try {
      const s = await Effect.runPromise(openSession({ ...sdkArgs(f), fetch: fetcher }))
      const running = Effect.runPromiseExit(s.call({ ...buy, maxWaitMs: 120000, pollIntervalMs: 60000 }), { signal: controller.signal })
      await entry; controller.abort(); const result = await running
      expect(Exit.isFailure(result) && Cause.isInterrupted(result.cause)).toBe(true)
      await Promise.resolve(); expect(pendingTimers.size).toBe(0)
    } finally { controller.abort(); for (const handle of pendingTimers) originalClear(handle); clear.mockRestore(); set.mockRestore() }
  })
  it("refuses a second job's terminal reference already attributed to another issued operation", async () => {
    const f = sdkFixture(), secondId = `job_${"cd".repeat(16)}`; let posts = 0, secondNonce = nonce
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname, payment = new Headers(init?.headers).get("payment-signature")
      if (path === `/jobs/${secondId}/result`) return Response.json({ job_id: secondId, status: "succeeded", result: { duplicate: true },
        receipt: { ...receipt(), jobId: secondId, rootJobId: secondId, buyer: dummyAccount.address.toLowerCase(), authorizationNonce: secondNonce } })
      const response = await f.fetcher(url, init)
      if (payment && ++posts === 2) {
        secondNonce = (decodeHeaderJson(payment) as { payload: { authorization: { nonce: string } } }).payload.authorization.nonce
        return Response.json({ ...accepted(), job_id: secondId, poll_url: `https://hub.example/jobs/${secondId}/result` }, { status: 202 })
      }
      return response
    }) as typeof fetch
    const s = await Effect.runPromise(openSession({ ...sdkArgs(f), fetch: fetcher })); await Effect.runPromise(s.call(buy))
    expect(await Effect.runPromise(Effect.either(s.call(buy)))).toMatchObject({ _tag: "Left", left: { code: "invalid_response", phase: "issued" } })
    expect(f.signs()).toBe(2)
  })
  it("a pending response respects the overall elapsed call bound without another signature", async () => {
    const f = sdkFixture()
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => new URL(String(url)).pathname.endsWith("/result")
      ? Response.json({ job_id: jobId, status: "pending" }, { status: 202 }) : f.fetcher(url, init)) as typeof fetch
    const s = await Effect.runPromise(openSession({ ...sdkArgs(f), fetch: fetcher })), start = performance.now()
    const result = await Effect.runPromise(Effect.either(s.call({ ...buy, maxWaitMs: 80, pollIntervalMs: 1000 })))
    expect(result).toMatchObject({ _tag: "Left", left: { phase: "issued", authorizedAmountAtomic: 1_000_000n } })
    expect(performance.now() - start).toBeLessThan(500); expect(f.signs()).toBe(1)
  })
})
