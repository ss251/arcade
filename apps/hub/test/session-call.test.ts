import { describe, expect, it, vi } from "vitest"
import { Effect, Ref } from "effect"
import { Bounds, Job, PublicListing, HIRE_CAPABILITY_HEADER, loadChainConfig } from "@arcade/core"
import { PaymentPayload, PaymentRequirements, makeTestRail, makeTestState, makeGatewayRail, signGatewayAuthorization } from "@arcade/payments"
import { getAddress, recoverTypedDataAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { TRANSFER_TYPES } from "../../../packages/payments/src/eip3009.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { makeSessions } from "../src/sessions.ts"
import { makeRails } from "../src/rails.ts"
import { canonicalSessionPayment, canonicalSessionRequirements, prepareSessionCall, releasedSessionTerminal, sessionCallData, sessionFee } from "../src/session-call.ts"
import { makeSessionCallRoutes, sessionJobToken } from "../src/server-session-calls.ts"
import { sessionToken } from "../src/server-sessions.ts"
import { BrokerLive, BrokerTag } from "../src/broker.ts"
import { sessionJson, sessionJobCopy } from "../src/session-ledger.ts"

export const buyer = `0x${"a".repeat(40)}`, seller = `0x${"b".repeat(40)}`
export const chain = loadChainConfig("arc-testnet"), id = `ses_${"2".repeat(32)}`, jobId = `job_${"2".repeat(20)}`
export const listing = PublicListing.make({ id: "demo", version: "1.0.0", serviceName: "demo", tags: [], description: "Offline test",
  price: "$0.10", inputSchema: {}, outputSchema: { type: "object" }, bounds: Bounds.make({ timeoutSec: 10 }) })
export async function setup() {
  const state = Effect.runSync(Ref.make(makeTestState({}, 1_000_000n))), rail = makeTestRail(state)
  const store = await Effect.runPromise(StoreTag.pipe(Effect.provide(StoreLive))), now = Date.now()
  const rails = makeRails(rail, []), sessions = makeSessions({ store, rails, chain, newId: () => id })
  await Effect.runPromise(sessions.openSession({ buyer, budgetAtomic: 1_000_000n, rail: "test", openedAtMs: now - 1 }))
  const snapshot = await Effect.runPromise(sessions.snapshot(id))
  const requirements = await Effect.runPromise(rail.challenge({ priceAtomic: 100_000n, resource: "http://127.0.0.1/x/demo/demo", payTo: seller }))
  const payload = PaymentPayload.make({ x402Version: 2, accepted: requirements, payload: { signature: "0xgood", authorization: {
    from: buyer, to: seller, value: "100000", validAfter: String(Math.floor(now / 1000) - 1),
    validBefore: String(Math.floor(now / 1000) + 600), nonce: `0x${"2".repeat(64)}` } } })
  const verified = await Effect.runPromise(rail.verify(payload, requirements))
  return { state, rail, store, sessions, snapshot, verified, now,
    args: { snapshot, record: { listing, seller, runnerId: "runner_demo", publishedAtMs: now }, chain, rail,
      verified, requirements, jobId, input: { hello: "world" }, createdAtMs: now } }
}
describe("session call admission", () => {
  it("preserves a verified canary marker on fixed root releases without forwarding it to the Job", async () => {
    const f = await setup(), args = { ...f.args, canary: true }, call = prepareSessionCall(args)
    expect(releasedSessionTerminal(call, Date.now()).receipt.canary).toBe(true)
    expect(Object.hasOwn(call.job, "canary")).toBe(false)
    expect(releasedSessionTerminal(prepareSessionCall(f.args), Date.now()).receipt.canary).toBeUndefined()
  })
  it("refuses oversized object keys before asking JSON to encode those keys", () => {
    const key = "\\".repeat(1_048_577), stringify = JSON.stringify
    let encodedKey = false
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown, ...args: unknown[]) => {
      if (value === key) encodedKey = true
      return Reflect.apply(stringify, JSON, [value, ...args])
    }) as typeof JSON.stringify)
    try { expect(() => sessionCallData({ [key]: 1 })).toThrow(); expect(encodedKey).toBe(false) }
    finally { spy.mockRestore() }
  })
  it("uses actual TestRail verification and preserves its object while making immutable durable input", async () => {
    const f = await setup(), call = prepareSessionCall(f.args)
    expect(call.verified).toBe(f.verified)
    expect(call.job.createdAtMs).toBe(f.now)
    expect(call.binding.amountAtomic).toBe(100_000n)
    expect(call.feeBps).toBe(0)
    expect(Object.isFrozen(call.job.input)).toBe(true)
    await Effect.runPromise(f.sessions.reserve(call.binding, call.job))
    expect((await Effect.runPromise(f.sessions.snapshot(id))).heldAtomic).toBe(100_000n)
  })
  it("refuses the broad test verifier's overpayment before admission", async () => {
    const f = await setup(), payload = PaymentPayload.make({ ...f.verified.payload,
      payload: { ...f.verified.payload.payload, authorization: { ...f.verified.payload.payload.authorization, value: "100001" } } })
    const verified = await Effect.runPromise(f.rail.verify(payload, f.verified.requirements))
    expect(() => prepareSessionCall({ ...f.args, verified })).toThrow()
    expect((await Effect.runPromise(f.sessions.snapshot(id))).calls).toHaveLength(0)
  })
  it.each(["payer", "payTo", "network", "amountAtomic"])("refuses changed verified %s", async key => {
    const f = await setup(), value = key === "amountAtomic" ? 100001n : key === "network" ? "eip155:1" : `0x${"c".repeat(40)}`
    expect(() => prepareSessionCall({ ...f.args, verified: { ...f.verified, [key]: value } })).toThrow()
  })
  it.each(["from", "to", "value", "nonce", "validAfter", "validBefore"])("refuses changed authorization %s", async key => {
    const f = await setup(), value = key === "from" || key === "to" ? `0x${"c".repeat(40)}` : key === "nonce" ? `0x${"0".repeat(64)}` : key === "validAfter" ? "9999999999" : "0"
    const payload = PaymentPayload.make({ ...f.verified.payload, payload: { ...f.verified.payload.payload,
      authorization: { ...f.verified.payload.payload.authorization, [key]: value } } })
    expect(() => prepareSessionCall({ ...f.args, verified: { ...f.verified, payload } })).toThrow()
  })
  it.each(["asset", "network", "resource", "extra"])("binds requirements %s to the selected original challenge", async key => {
    const f = await setup(), value = key === "extra" ? { name: "Other", version: "2" } : key === "asset" ? `0x${"c".repeat(40)}` : "other"
    const requirements = PaymentRequirements.make({ ...f.verified.requirements, [key]: value })
    expect(() => prepareSessionCall({ ...f.args, verified: { ...f.verified, requirements } })).toThrow()
  })
  it("refuses getter, cycle, reserved-tag, oversized value and depth before side effects", async () => {
    const f = await setup(); let reads = 0
    const getter = Object.defineProperty({}, "secret", { enumerable: true, get() { reads++; return 1 } })
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic
    let deep: unknown = {}; for (let i = 0; i < 65; i++) deep = { child: deep }
    for (const input of [getter, cyclic, deep, { __bigint: "1" }, { large: "x".repeat(1_048_577) }])
      expect(() => prepareSessionCall({ ...f.args, input })).toThrow()
    expect(reads).toBe(0)
    expect((await Effect.runPromise(f.sessions.snapshot(id))).calls).toHaveLength(0)
  })
  it("requires release headroom in addition to an individually fitting queued Job", async () => {
    const f = await setup()
    const template = prepareSessionCall({ ...f.args, input: { large: "" } }).job
    const input = { large: "x".repeat(1_048_576 - Buffer.byteLength(sessionJson(template, 1_048_576)) - 1) }
    expect(() => sessionJobCopy(Job.make({ ...template, input }))).not.toThrow()
    expect(() => prepareSessionCall({ ...f.args, input })).toThrow()
    expect((await Effect.runPromise(f.sessions.snapshot(id))).heldAtomic).toBe(0n)
  })
  it("uses observed splitter fee/network/version, never a boot fee fallback", async () => {
    const f = await setup(), rail = { ...f.rail, name: "eip3009" as const }, splitter = `0x${"c".repeat(40)}`
    const record = { ...f.args.record, feeSplitter: splitter, splitterVerified: true, splitterVersion: 2 as const, splitterFeeBps: 731, splitterNetwork: chain.caip2 }
    expect(sessionFee(record, rail, chain)).toEqual({ feeBps: 731, payTo: splitter, splitterVersion: 2 })
    for (const over of [{ splitterFeeBps: undefined }, { splitterNetwork: undefined }, { splitterNetwork: "eip155:1" },
      { splitterVerified: false }, { splitterVersion: undefined }, { splitterFeeBps: -1 }, { splitterFeeBps: 10001 }, { splitterFeeBps: 0.5 }])
      expect(() => sessionFee({ ...record, ...over }, rail, chain)).toThrow()
    expect(sessionFee(record, f.rail, chain)).toEqual({ feeBps: 0, payTo: seller })
    expect(sessionFee(f.args.record, rail, chain)).toEqual({ feeBps: 0, payTo: seller })
  })
  it("preserves a real EIP typed-data signature across all address casing normalization including splitter target", async () => {
    const account = privateKeyToAccount(generatePrivateKey()) // Ephemeral, unfunded, offline only.
    const f = await setup(), splitter = getAddress(`0x${"c".repeat(40)}`)
    const requirements = PaymentRequirements.make({ ...f.verified.requirements, payTo: splitter,
      extra: { name: chain.usdc.eip712Name, version: chain.usdc.eip712Version, feeSplitter: splitter, feeSplitterVersion: 2 } })
    const a = { ...f.verified.payload.payload.authorization, from: account.address, to: splitter }
    const domain = { name: chain.usdc.eip712Name, version: chain.usdc.eip712Version, chainId: chain.chainId, verifyingContract: chain.usdc.address }
    const typed = (auth: typeof a) => ({ from: auth.from as `0x${string}`, to: auth.to as `0x${string}`, value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore), nonce: auth.nonce as `0x${string}` })
    const signature = await account.signTypedData({ domain, types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization", message: typed(a) })
    const normalized = canonicalSessionPayment(PaymentPayload.make({ x402Version: 2, accepted: requirements, payload: { authorization: a, signature } }))
    const normalizedRequirements = canonicalSessionRequirements(requirements)
    expect(normalized.payload.signature).toBe(signature)
    expect(normalized.payload.authorization.to).toBe(normalizedRequirements.extra.feeSplitter)
    expect(normalized.payload.authorization.to).toBe(normalizedRequirements.payTo)
    expect((await recoverTypedDataAddress({ domain, types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization",
      message: typed(normalized.payload.authorization as typeof a), signature })).toLowerCase()).toBe(account.address.toLowerCase())
  })
  it("retains actual F3 Gateway verified-object provenance through local preparation and settlement", async () => {
    const account = privateKeyToAccount(generatePrivateKey()), rail = makeGatewayRail({ facilitatorUrl: "http://127.0.0.1:18421" })
    const f = await setup(), requirements = canonicalSessionRequirements(await Effect.runPromise(rail.challenge({ priceAtomic: 100000n, payTo: seller,
      resource: "http://127.0.0.1/x/demo/demo" })))
    const signed = await Effect.runPromise(signGatewayAuthorization({ account, to: seller as `0x${string}`, valueAtomic: 100000n, requirements }))
    const { signature, ...authorization } = signed
    const payload = canonicalSessionPayment(PaymentPayload.make({ x402Version: 2, accepted: requirements, payload: { authorization, signature } }))
    const sent: string[] = [], fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      sent.push(String(url)); return Response.json(String(url).endsWith("/verify") ? { isValid: true, payer: account.address.toLowerCase() }
        : { success: true, payer: account.address.toLowerCase(), network: chain.caip2, transaction: "11111111-1111-4111-8111-111111111111" })
    })
    try {
      const verified = await Effect.runPromise(rail.verify(payload, requirements))
      const snapshot = { ...f.snapshot, session: { ...f.snapshot.session, buyer: account.address.toLowerCase(), rail: "gateway" as const } }
      const call = prepareSessionCall({ ...f.args, snapshot, rail, verified, requirements })
      expect(call.verified).toBe(verified)
      expect((await Effect.runPromiseExit(rail.settle({ ...verified })))._tag).toBe("Failure")
      expect((await Effect.runPromise(rail.settle(call.verified))).settlementKind).toBe("gateway-transfer")
      expect(sent).toHaveLength(2)
    } finally { fetchSpy.mockRestore() }
  })
})

async function routerFixture() {
  const f = await setup(), broker = await Effect.runPromise(BrokerTag.pipe(Effect.provide(BrokerLive)))
  await Effect.runPromise(f.store.putListing(f.args.record))
  const secret = "offline-call-router-secret", headers = { "x-arcade-session": id, "x-session-token": sessionToken(secret, id) }
  const options = { store: f.store, sessions: f.sessions, broker, rails: makeRails(f.rail, []), chain,
    hubSecret: secret, publicOrigin: (url: URL) => url.origin, newJobId: () => jobId }
  return { ...f, headers, secret, options, route: makeSessionCallRoutes(options) }
}
describe("session paid transport and capabilities", () => {
  it.each(["reserved", "settling", "uncertain"] as const)("reads %s without any Job/receipt lookup or output", async state => {
    const f = await routerFixture(), call = prepareSessionCall(f.args)
    await Effect.runPromise(f.sessions.reserve(call.binding, call.job))
    if (state !== "reserved") await Effect.runPromise(f.sessions.beginSettlement(id, jobId))
    if (state === "uncertain") await Effect.runPromise(f.sessions.markUncertain(id, jobId))
    const getJob = vi.fn(f.store.getJob), getSessionTerminal = vi.fn(f.store.getSessionTerminal)
    const route = makeSessionCallRoutes({ ...f.options, store: { ...f.store, getJob, getSessionTerminal } })
    const response = await route(new Request(`http://127.0.0.1/jobs/${jobId}/result`, { headers: { ...f.headers, "x-job-token": sessionJobToken(f.secret, id, jobId) } }))
    expect(response?.status).toBe(state === "uncertain" ? 503 : 202)
    expect(await response?.json()).toEqual(state === "uncertain" ? { error: "session_settlement_uncertain", settlement_status: "uncertain" } : { job_id: jobId, status: "pending" })
    expect(getJob).not.toHaveBeenCalled(); expect(getSessionTerminal).not.toHaveBeenCalled()
    expect((await Effect.runPromise(f.sessions.snapshot(id))).heldAtomic).toBe(100000n)
  })
  it.each(["/x", "/jobs", "/x/demo/demo/", "/jobs/not-canonical/result"])("keeps malformed session-aware path %s private before IO", async path => {
    const f = await routerFixture(), snapshot = vi.fn(f.sessions.snapshot)
    const route = makeSessionCallRoutes({ ...f.options, sessions: { ...f.sessions, snapshot } })
    const response = await route(new Request("http://127.0.0.1" + path, { headers: f.headers }))
    expect(response?.status).toBe(404); expect(response?.headers.get("cache-control")).toBe("private, no-store")
    expect(snapshot).not.toHaveBeenCalled()
  })
  it("bounds 32 active bodies, keeps auth failures404 under load, and recovers after abort", async () => {
    const f = await routerFixture(), controllers = Array.from({ length: 32 }, () => new AbortController())
    const pending = controllers.map(c => f.route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", duplex: "half",
      headers: { ...f.headers, "content-type": "application/json" }, signal: c.signal, body: new ReadableStream({ cancel: () => new Promise(() => {}) }) } as RequestInit)))
    const over = await f.route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers: f.headers }))
    expect(over?.status).toBe(429)
    expect((await f.route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers: { ...f.headers, "x-session-token": "" } })))?.status).toBe(404)
    controllers.forEach(c => c.abort())
    expect((await Promise.all(pending)).every(r => r?.status === 400)).toBe(true)
    expect((await f.route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers: f.headers })))?.status).toBe(402)
    expect((await Effect.runPromise(f.sessions.snapshot(id))).calls).toHaveLength(0)
  })
  it("accepts exactly1MiB raw probe JSON and refuses one byte more before payment or admission", async () => {
    const f = await routerFixture()
    for (const extra of [0, 1]) {
      const body = JSON.stringify({ x: "a".repeat(1_048_576 - 8 + extra) })
      expect(Buffer.byteLength(body)).toBe(1_048_576 + extra)
      const r = await f.route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", body,
        headers: { ...f.headers, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) } }))
      expect(r?.status).toBe(extra ? 400 : 402)
    }
    expect((await Effect.runPromise(f.sessions.snapshot(id))).calls).toHaveLength(0)
  })
  it("returns the immutable original handle on semantic retry without redispatch", async () => {
    const f = await routerFixture(), call = prepareSessionCall(f.args)
    await Effect.runPromise(f.sessions.reserve(call.binding, call.job))
    const dispatch = vi.fn(f.options.broker.dispatch)
    const route = makeSessionCallRoutes({ ...f.options, broker: { ...f.options.broker, dispatch }, newJobId: () => `job_${"9".repeat(20)}` })
    const probe = await route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers: f.headers }))
    const requirements = (await probe?.json()).accepts[0]
    const payload = { ...f.verified.payload, accepted: requirements }
    const r = await route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", body: JSON.stringify(f.args.input),
      headers: { ...f.headers, "content-type": "application/json", "payment-signature": Buffer.from(JSON.stringify(payload)).toString("base64") } }))
    expect(r?.status).toBe(202)
    expect(await r?.json()).toMatchObject({ job_id: jobId, job_token: sessionJobToken(f.secret, id, jobId), poll_url: `http://127.0.0.1/jobs/${jobId}/result` })
    expect(dispatch).not.toHaveBeenCalled()
    expect((await Effect.runPromise(f.sessions.snapshot(id))).calls).toHaveLength(1)
  })
  it("maps actual typed rail verification refusal to fixed payment_invalid402", async () => {
    const f = await routerFixture(), payload = { ...f.verified.payload, payload: { ...f.verified.payload.payload, signature: "0xbad" } }
    const response = await f.route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers: { ...f.headers,
      "payment-signature": Buffer.from(JSON.stringify(payload)).toString("base64") } }))
    expect(response?.status).toBe(402); expect(await response?.json()).toEqual({ error: "payment_invalid" })
  })
  it("treats a contradictory returned terminal reason as storage corruption, never public provider prose", async () => {
    const f = await routerFixture(), call = prepareSessionCall(f.args)
    await Effect.runPromise(f.sessions.reserve(call.binding, call.job))
    const released = releasedSessionTerminal(call, Date.now())
    await Effect.runPromise(f.sessions.release(released))
    const route = makeSessionCallRoutes({ ...f.options, store: { ...f.store, getSessionTerminal: () => Effect.succeed({ job: released.job,
      receipt: { ...released.receipt, reason: "PRIVATE_PROVIDER" } }) } })
    const response = await route(new Request(`http://127.0.0.1/jobs/${jobId}/result`, { headers: { ...f.headers, "x-job-token": sessionJobToken(f.secret, id, jobId) } }))
    expect(response?.status).toBe(503); expect(await response?.json()).toEqual({ error: "session_unavailable" })
  })
  it.each([{}, { "x-arcade-session": "" }, { "x-session-token": "" }, { "x-arcade-session": id },
    { "x-arcade-session": id, "x-session-token": "é".repeat(32) }])("never falls back for present malformed capabilities %#", async bad => {
    const f = await routerFixture(), snapshot = vi.fn(f.sessions.snapshot)
    const route = makeSessionCallRoutes({ ...f.options, sessions: { ...f.sessions, snapshot } })
    const headers = Object.keys(bad).length ? bad : { "x-session-token": "a".repeat(32) }
    expect((await route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers })))?.status).toBe(404)
    expect(snapshot).not.toHaveBeenCalled()
  })
  it("issues a private selected-rail probe without a durable reservation", async () => {
    const f = await routerFixture(), r = await f.route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers: f.headers }))
    expect(r?.status).toBe(402); expect(r?.headers.get("cache-control")).toBe("private, no-store")
    expect((await r?.json()).accepts[0]).toMatchObject({ payTo: seller, network: chain.caip2, amount: "100000" })
    expect((await Effect.runPromise(f.sessions.snapshot(id))).calls).toHaveLength(0)
  })
  it("refuses incoming session+hire before challenge or Store access", async () => {
    const f = await routerFixture(), challenge = vi.fn(f.rail.challenge), snapshot = vi.fn(f.sessions.snapshot)
    const route = makeSessionCallRoutes({ ...f.options, rails: makeRails({ ...f.rail, challenge }, []), sessions: { ...f.sessions, snapshot } })
    const r = await route(new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers: { ...f.headers, [HIRE_CAPABILITY_HEADER]: "" } }))
    expect(r?.status).toBe(402); expect(challenge).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled()
  })
  it("requires the distinct session job realm and proves membership before private Job reads", async () => {
    const f = await routerFixture(), getJob = vi.fn(f.store.getJob), snapshot = vi.fn(f.sessions.snapshot)
    const route = makeSessionCallRoutes({ ...f.options, store: { ...f.store, getJob }, sessions: { ...f.sessions, snapshot } })
    const capability = sessionJobToken(f.secret, id, jobId)
    for (const [suffix, value] of [["", "f".repeat(32)], [`?token=${capability}`, capability]]) {
      const r = await route(new Request(`http://127.0.0.1/jobs/${jobId}/result${suffix}`, { headers: { ...f.headers, "x-job-token": value! } }))
      expect(r?.status).toBe(404)
    }
    expect(snapshot).not.toHaveBeenCalled(); expect(getJob).not.toHaveBeenCalled()
    const r = await route(new Request(`http://127.0.0.1/jobs/${jobId}/result`, { headers: { ...f.headers, "x-job-token": capability } }))
    expect(r?.status).toBe(404); expect(snapshot).toHaveBeenCalledTimes(1); expect(getJob).not.toHaveBeenCalled()
  })
  it("projects fixed no-store storage defects and recovers without retrying a failed operation", async () => {
    const f = await routerFixture(), snapshot = vi.fn(f.sessions.snapshot).mockImplementationOnce(() => Effect.die(Error("PRIVATE_DB")))
    const route = makeSessionCallRoutes({ ...f.options, sessions: { ...f.sessions, snapshot } })
    const request = () => new Request("http://127.0.0.1/x/demo/demo", { method: "POST", headers: f.headers })
    const failed = await route(request()); expect(failed?.status).toBe(503); expect(await failed?.json()).toEqual({ error: "session_unavailable" })
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect((await route(request()))?.status).toBe(402)
  })
})
