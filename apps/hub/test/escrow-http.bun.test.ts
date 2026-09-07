import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { Database } from "bun:sqlite"
import { Bounds, PublicListing, hashJson, InvalidSignature, SettlementFailed, HIRE_CAPABILITY_HEADER } from "@arcade/core"
import { buildEscrowRequirements, assertEscrowActionReceipt, escrowActionContext, type Erc8183Rail, type Rail, type VerifiedEscrow } from "@arcade/payments"
import { keccak256 } from "viem"
import { fixture, addr } from "../../../packages/payments/test/fixtures/erc8183-action.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { makeRails } from "../src/rails.ts"
import { makeEscrowRoutes } from "../src/escrow-http.ts"
import { escrowListingChallenge } from "../src/escrow-listing.ts"
import type { RunEscrowJobArgs } from "../src/escrow-pipeline.ts"
const cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0).reverse()) close() })
const run = Effect.runPromise, unused = () => Effect.die("unused fixture port")
const delist = (h: Awaited<ReturnType<typeof setup>>) => Effect.forEach([1, 2, 3], atMs =>
  h.disk.store.recordPayTest({ skillId: h.c.skillId, seller: h.c.provider, atMs, jobId: "", ok: false, reason: "fixture failure" }))
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "arcade-escrow-http-")); cleanups.push(() => rmSync(dir, { recursive: true }))
  const disk = openSqliteStore(join(dir, "store.sqlite"), "http_fixture"); cleanups.push(disk.close)
  const input = { a: "request" }, f = await fixture("budget", 10001n, { inputHash: hashJson(input) }), c = f.context.call
  const resource = `https://example.test/x/${c.provider}/skill`
  const context = escrowActionContext({ ...f.context, call: { ...c, resource } })
  const identity = { chainId: 5042002, escrow: c.escrow, hook: c.hook, evaluator: c.evaluator, treasury: f.context.treasury,
    token: c.token, implementation: addr(11), proxyCodeHash: keccak256("0x01"), implementationCodeHash: keccak256("0x02"), hookCodeHash: keccak256("0x03") }
  const listing = PublicListing.make({ id: c.skillId, version: c.skillVersion, serviceName: "HTTP fixture", description: "Offline fixture",
    price: "$0.010001", tags: [], inputSchema: { type: "object", required: ["a"], properties: { a: { type: "string" } }, additionalProperties: false },
    outputSchema: { type: "object" }, bounds: Bounds.make({ timeoutSec: 60 }), rails: ["erc8183"] })
  const row = { listing, seller: c.provider, runnerId: "runner_fixture", publishedAtMs: 1, agentId: "8", agentVerified: true }
  await run(disk.store.putListing(row))
  const requirements = buildEscrowRequirements(identity, escrowListingChallenge(row, input, resource).challenge, 1800)
  const payload = { x402Version: 2 as const, accepted: requirements, payload: { jobId: "7", capability: "0x" + "a".repeat(64) } }
  const verified: VerifiedEscrow = { rail: "erc8183", stage: "funded", payer: f.context.client, payTo: c.provider,
    amountAtomic: c.amount, network: "eip155:5042002", context, requirements }
  const events: string[] = [], started: RunEscrowJobArgs[] = []
  const rail: Erc8183Rail = { name: "erc8183", challenge: i => Effect.sync(() => buildEscrowRequirements(identity, i, 1800)),
    verify: () => Effect.sync(() => { events.push("verify"); return verified }),
    verifyBudget: () => Effect.sync(() => { events.push("verify-budget"); return { ...verified, stage: "budget" as const } }),
    budget: () => Effect.sync(() => { events.push("budget"); return assertEscrowActionReceipt(f.action, f.signed, f.mined, f.receipt, f.after) }),
    submit: unused, reject: unused, settle: unused }
  const fallback: Rail = { name: "eip3009", challenge: unused, verify: unused, settle: unused }
  let time = 1000000
  const options = { store: disk.store, rails: makeRails(fallback, [], rail), hubSecret: "s".repeat(64), configuredHubSecret: "s".repeat(64),
    publicOrigin: () => "https://example.test", jobToken: () => "fixture-token", now: () => time,
    start: async (args: RunEscrowJobArgs) => { expect(await run(disk.store.escrow!.get(args.jobId))).toBeDefined(); started.push(args) } }
  const routes = makeEscrowRoutes(options)
  cleanups.push(() => { void routes.close() })
  const budgetRequest = (body: unknown = { input, payment: payload }, headers: HeadersInit = {}) => new Request(resource + "/escrow", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
  const rootRequest = () => new Request(resource, { method: "POST" })
  return { dir, disk, input, f, c, row, rail, options, routes, payload, verified, events, started, budgetRequest, rootRequest,
    advance: () => { time += 60001 } }
}
test("budget capability is verified before one guarded action; no inference/admission", async () => {
  const h = await setup(), response = await h.routes.budget(h.budgetRequest())
  expect(response?.status).toBe(200); expect(await response!.json()).toMatchObject({ status: "budget_set", jobId: "7",
    budget: "10001", token: h.c.token, escrow: h.c.escrow, fundBy: 1340 })
  expect(h.events).toEqual(["verify-budget", "budget"]); expect(h.started).toEqual([])
  expect(await run(h.disk.store.allReceipts)).toEqual([])
  const db = new Database(join(h.dir, "store.sqlite"), { readonly: true })
  expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM escrow_admissions").get()!.n).toBe(0); db.close()
  expect(JSON.stringify(await (await h.routes.budget(h.budgetRequest()))!.json())).not.toContain(h.payload.payload.capability)
  expect(h.events.filter(e => e === "budget")).toHaveLength(1)
})
test("root admission precedes start and identical retries retain one hub job", async () => {
  const h = await setup()
  const first = await h.routes.root(h.rootRequest(), h.input, h.payload), second = await h.routes.root(h.rootRequest(), h.input, h.payload)
  expect(first.status).toBe(202); expect(second.status).toBe(202)
  expect(await first.json()).toEqual(await second.json()); expect(h.started).toHaveLength(1)
  expect(h.started[0]!.verified).toBe(h.verified); expect(h.started[0]!.rail).toBe(h.rail)
})
test.each(["missing rail", "test default", "volatile", "missing secret", "short secret", "different secret"])("disabled %s refuses before verification or admission", async mode => {
  const h = await setup(), exact = h.options.rails.default
  const routes = makeEscrowRoutes({ ...h.options,
    ...(mode === "missing rail" ? { rails: makeRails(exact, []) } : {}),
    ...(mode === "test default" ? { rails: makeRails({ ...exact, name: "test" }, [], h.rail) } : {}),
    ...(mode === "volatile" ? { store: { ...h.disk.store, escrow: { ...h.disk.store.escrow!, durability: "volatile" as const } } } : {}),
    ...(mode === "missing secret" ? { configuredHubSecret: undefined } : {}),
    ...(mode === "short secret" ? { configuredHubSecret: "short", hubSecret: "short" } : {}),
    ...(mode === "different secret" ? { configuredHubSecret: "different" } : {}) })
  expect((await routes.budget(h.budgetRequest()))?.status).toBe(503)
  expect((await routes.root(h.rootRequest(), h.input, h.payload)).status).toBe(503)
  expect(h.events).toEqual([]); expect(h.started).toEqual([]); await routes.close()
})
test.each([null, {}, { input: {} }, { payment: {} }, { input: {}, payment: {}, extra: "PRIVATE_BODY" }])("closed budget envelope refuses %j", async body => {
  const h = await setup(), response = await h.routes.budget(h.budgetRequest(body))
  expect(response?.status).toBe(400); expect(h.events).toEqual([]); expect(await response!.text()).not.toContain("PRIVATE_")
})
test.each(["x-arcade-session", "x-session-token", HIRE_CAPABILITY_HEADER, "payment-signature", "x-payment"])("budget refuses conflicting %s", async name => {
  const h = await setup(), response = await h.routes.budget(h.budgetRequest(undefined, { [name]: "PRIVATE_HEADER" }))
  expect(response?.status).toBe(400); expect(h.events).toEqual([])
})
test.each(["delisted", "agent", "price", "input", "version", "opt-in"])("current listing %s cannot retain quote permission", async mode => {
  const h = await setup()
  if (mode === "delisted") await run(delist(h))
  await run(h.disk.store.putListing({ ...h.row,
    ...(mode === "agent" ? { agentVerified: false } : {}), listing: PublicListing.make({ ...h.row.listing,
      ...(mode === "price" ? { price: "$0.02" } : {}), ...(mode === "version" ? { version: "2.0.0" } : {}),
      ...(mode === "input" ? { inputSchema: { type: "integer" } } : {}), ...(mode === "opt-in" ? { rails: ["eip3009"] } : {}) }) }))
  const response = await h.routes.budget(h.budgetRequest())
  expect([402, 409]).toContain(response!.status); expect(h.events).toEqual([])
})
test("delisting during async capability verification prevents the relay", async () => {
  const h = await setup(), rail: Erc8183Rail = { ...h.rail, verifyBudget: (...args) => Effect.zipLeft(h.rail.verifyBudget(...args), delist(h)) }
  const routes = makeEscrowRoutes({ ...h.options, rails: makeRails(h.options.rails.default, [], rail) })
  expect((await routes.budget(h.budgetRequest()))?.status).toBe(409)
  expect(h.events).toEqual(["verify-budget"]); await routes.close()
})
test("verification refusal hides private details and performs no action", async () => {
  const h = await setup(), rail: Erc8183Rail = { ...h.rail,
    verifyBudget: () => Effect.fail(new InvalidSignature({ reason: "PRIVATE_KEY_PROVIDER" })) }
  const routes = makeEscrowRoutes({ ...h.options, rails: makeRails(h.options.rails.default, [], rail) })
  const response = await routes.budget(h.budgetRequest())
  expect(response?.status).toBe(402); expect(await response!.text()).toBe('{"error":"escrow_payment_invalid"}')
  expect(h.events).toEqual([]); await routes.close()
})
test("uncertain budget consumes its attempt and never retries or refunds", async () => {
  const h = await setup(), rail: Erc8183Rail = { ...h.rail, budget: () => Effect.sync(() => { h.events.push("attempt") }).pipe(
    Effect.zipRight(Effect.fail(new SettlementFailed({ reason: "PRIVATE_PROVIDER" })))) }
  const routes = makeEscrowRoutes({ ...h.options, rails: makeRails(h.options.rails.default, [], rail) })
  expect(await (await routes.budget(h.budgetRequest()))!.json()).toEqual({ error: "escrow_budget_uncertain" })
  h.advance(); expect((await routes.budget(h.budgetRequest()))?.status).toBe(409)
  expect(h.events.filter(e => e === "attempt")).toHaveLength(1); await routes.close()
})
test("four request slots bound verification; shutdown waits for interruption cleanup", async () => {
  const h = await setup(); let entered = 0, cleaned = 0
  const rail: Erc8183Rail = { ...h.rail, verifyBudget: () => Effect.sync(() => { entered++ }).pipe(
    Effect.zipRight(Effect.never), Effect.ensuring(Effect.sync(() => { cleaned++ }))) }
  const routes = makeEscrowRoutes({ ...h.options, rails: makeRails(h.options.rails.default, [], rail) })
  const requests = Array.from({ length: 4 }, () => routes.budget(h.budgetRequest()))
  const deadline = performance.now() + 2000
  while (entered !== 4 && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1))
  expect(entered).toBe(4); expect((await routes.budget(h.budgetRequest()))?.status).toBe(429)
  await routes.close(); expect(cleaned).toBe(4)
  expect((await Promise.all(requests)).map(r => r!.status)).toEqual([503, 503, 503, 503])
  expect((await routes.budget(h.budgetRequest()))?.status).toBe(503); expect(h.events).toEqual([])
})
test("shutdown during budget awaits cleanup and reports uncertainty", async () => {
  const h = await setup(); let started = false, cleaned = false
  const rail: Erc8183Rail = { ...h.rail, budget: () => Effect.sync(() => { started = true }).pipe(
    Effect.zipRight(Effect.never), Effect.ensuring(Effect.sync(() => { cleaned = true }))) }
  const routes = makeEscrowRoutes({ ...h.options, rails: makeRails(h.options.rails.default, [], rail) })
  const pending = routes.budget(h.budgetRequest()), deadline = performance.now() + 2000
  while (!started && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1))
  expect(started).toBe(true); await routes.close(); expect(cleaned).toBe(true)
  expect(await (await pending)!.json()).toEqual({ error: "escrow_budget_uncertain" })
})
test("start failure after durable admission remains uncertain and never restarts", async () => {
  const h = await setup(); let starts = 0
  const routes = makeEscrowRoutes({ ...h.options, start: async () => { starts++; throw Error("PRIVATE_START") } })
  expect((await routes.root(h.rootRequest(), h.input, h.payload)).status).toBe(503)
  const retry = await routes.root(h.rootRequest(), h.input, h.payload)
  expect(retry.status).toBe(202); expect(starts).toBe(1)
  const body = await retry.json() as { job_id: string }
  expect((await run(h.disk.store.escrow!.get(body.job_id)))?.state).toBe("uncertain"); await routes.close()
})
test("concurrent roots have one durable execution owner", async () => {
  const h = await setup(), responses = await Promise.all(Array.from({ length: 4 }, () => h.routes.root(h.rootRequest(), h.input, h.payload)))
  expect(responses.map(r => r.status)).toEqual([202, 202, 202, 202])
  expect(new Set(await Promise.all(responses.map(async r => (await r.json() as { job_id: string }).job_id))).size).toBe(1)
  expect(h.started).toHaveLength(1)
})
test("request cancellation before verification does not create an admission", async () => {
  const h = await setup(), controller = new AbortController(); controller.abort()
  const req = new Request(h.rootRequest(), { signal: controller.signal })
  expect((await h.routes.root(req, h.input, h.payload)).status).toBe(503); expect(h.events).toEqual([]); expect(h.started).toEqual([])
})
test("root delivery is private and contains no capability/context/private provider data", async () => {
  const h = await setup(), response = await h.routes.root(h.rootRequest(), h.input, h.payload), text = await response.text()
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(text).not.toContain(h.payload.payload.capability); expect(text).not.toContain("requestHash"); expect(text).not.toContain("PRIVATE_")
})
test("HTTP abort after admission does not cancel the acknowledged job handoff", async () => {
  const h = await setup(), controller = new AbortController()
  const routes = makeEscrowRoutes({ ...h.options, start: async args => { controller.abort(); await h.options.start(args) } })
  const response = await routes.root(new Request(h.rootRequest(), { signal: controller.signal }), h.input, h.payload)
  expect(response.status).toBe(202); expect(h.started).toHaveLength(1)
  expect((await run(h.disk.store.escrow!.get(h.started[0]!.jobId)))?.state).toBe("admitted"); await routes.close()
})
test("root listing capture never invokes public listing or stored-record getters", async () => {
  const h = await setup(); let getters = 0
  for (const raw of [{ ...h.row, get agentVerified() { getters++; return true } },
    { ...h.row, listing: { ...h.row.listing, get price() { getters++; return "$0.01" } } }]) {
    expect(() => escrowListingChallenge(raw, h.input, h.c.resource)).toThrow()
  }
  expect(getters).toBe(0)
})
test("per-payer throttle and retained ten-attempt quota precede each action", async () => {
  const h = await setup(); let nextId = 7n, actions = 0
  const rail: Erc8183Rail = { ...h.rail, verifyBudget: () => Effect.succeed({ ...h.verified, stage: "budget" as const,
    context: escrowActionContext({ ...h.verified.context, jobId: nextId }) }),
    budget: value => Effect.zipRight(Effect.sync(() => { actions++ }), h.rail.budget(value)) }
  const routes = makeEscrowRoutes({ ...h.options, rails: makeRails(h.options.rails.default, [], rail) })
  const request = () => h.budgetRequest({ input: h.input, payment: { ...h.payload, payload: { ...h.payload.payload, jobId: String(nextId) } } })
  expect((await routes.budget(request()))?.status).toBe(200); nextId++
  expect((await routes.budget(request()))?.status).toBe(429); expect(actions).toBe(1)
  for (let i = 1; i < 10; i++) { h.advance(); expect((await routes.budget(request()))?.status).toBe(200); nextId++ }
  h.advance(); expect((await routes.budget(request()))?.status).toBe(429); expect(actions).toBe(10); await routes.close()
})
test.each(["GET", "query", "seller", "child", "session", "header getter", "wrong amount"])("root refuses %s before admission", async mode => {
  const h = await setup(), original = h.rootRequest()
  const req = mode === "GET" ? new Request(original.url) : mode === "query" ? new Request(original.url + "?private=1", { method: "POST" }) :
    mode === "seller" ? new Request(original.url.replace(h.c.provider, addr(99)), { method: "POST" }) :
    new Request(original, { headers: mode === "child" ? { [HIRE_CAPABILITY_HEADER]: "PRIVATE_CHILD" } : mode === "session" ? { "x-session-token": "PRIVATE_SESSION" } : {} })
  let getter = 0
  const payload = mode === "header getter" ? { ...h.payload, get payload() { getter++; return h.payload.payload } } :
    mode === "wrong amount" ? { ...h.payload, accepted: { ...h.payload.accepted, amount: "10002" } } : h.payload
  expect([400, 402, 404]).toContain((await h.routes.root(req, h.input, payload)).status)
  expect(h.started).toEqual([]); expect(getter).toBe(0)
})
test("owned loopback carries budget and root JSON with durable admission, not live payment evidence", async () => {
  const h = await setup(), server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
    return await h.routes.budget(req) ?? h.routes.root(req, h.input, h.payload)
  } })
  try {
    const base = `http://127.0.0.1:${server.port}`, path = new URL(h.rootRequest().url).pathname
    const budget = await fetch(base + path + "/escrow", { method: "POST", body: JSON.stringify({ input: h.input, payment: h.payload }) })
    expect(budget.status).toBe(200); expect(budget.headers.get("cache-control")).toBe("private, no-store"); await budget.json()
    const root = await fetch(base + path, { method: "POST" }); expect(root.status).toBe(202)
    const body = await root.json() as { job_id: string }
    expect((await run(h.disk.store.escrow!.get(body.job_id)))?.state).toBe("admitted")
  } finally { await h.routes.close(); server.stop(true) }
})
test("global retained quota has no payer-rotation or eviction escape (synthetic ports only)", async () => {
  const h = await setup(); let n = 1, actions = 0
  const rail: Erc8183Rail = { ...h.rail, verifyBudget: () => Effect.succeed({ ...h.verified, stage: "budget" as const, payer: addr(n + 200),
    context: escrowActionContext({ ...h.verified.context, jobId: BigInt(n), client: addr(n + 200) }) }),
    budget: value => Effect.zipRight(Effect.sync(() => { actions++ }), h.rail.budget(value)) }
  const routes = makeEscrowRoutes({ ...h.options, rails: makeRails(h.options.rails.default, [], rail) })
  for (; n <= 1001; n++) {
    const payment = { ...h.payload, payload: { ...h.payload.payload, jobId: String(n) } }
    expect((await routes.budget(h.budgetRequest({ input: h.input, payment })))?.status).toBe(n <= 1000 ? 200 : 429)
  }
  expect(actions).toBe(1000); await routes.close()
})
