import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Fiber, Layer, Ref } from "effect"
import { Bounds, hashJson, Job, JobOutcome, PublicListing, Receipt, SettlementFailed, verifyHireCapability, MAX_OUTPUT_CHARS, NoRunnerAvailable } from "@arcade/core"
import { assertEscrowActionReceipt, buildEscrowRequirements, ERC8183_ZERO_HASH, type Erc8183Rail, type VerifiedEscrow } from "@arcade/payments"
import { keccak256 } from "viem"
import { fixture, addr } from "../../../packages/payments/test/fixtures/erc8183-action.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { StoreTag, type Store } from "../src/store.ts"
import { BrokerTag, makeBroker, type Broker } from "../src/broker.ts"
import { AttestTag, type Attest, type AttestJob } from "../src/attest.ts"
import { runEscrowJob } from "../src/escrow-pipeline.ts"
const owned: Array<() => void> = []
afterEach(() => { for (const close of owned.splice(0).reverse()) close() })
const run = Effect.runPromise
const withoutEscrow = (store: Store): Store => { const { escrow: _unused, ...rest } = store; return rest }
const refused = async (effect: Effect.Effect<unknown, unknown>) => {
  const result = await run(Effect.either(effect))
  expect(result).toMatchObject({ _tag: "Left", left: { _tag: "EscrowPipelineUnavailable" } })
  expect(JSON.stringify(result)).not.toContain("PRIVATE_")
}
async function setup(options: { refusal?: boolean; badOutput?: boolean; actionError?: "submit" | "complete" | "reject";
  store?: (store: Store) => Store; realBroker?: boolean; hireBudget?: number; dispatch?: Broker["dispatch"];
  onTerminal?: Attest["onTerminal"]; action?: (kind: string) => Effect.Effect<void>; children?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "arcade-escrow-pipeline-")), path = join(directory, "store.sqlite")
  owned.push(() => rmSync(directory, { recursive: true }))
  const opened = openSqliteStore(path, "owned_pipeline_fixture"); owned.push(opened.close)
  const input = { z: 1, a: "ordered input" }, output = options.badOutput ? { other: true } : { ok: true }
  const id = "job_" + "c".repeat(32), hashes = { inputHash: hashJson(input), outputHash: hashJson(output), hubJobId: id }
  const submitted = await fixture("submit", 10001n, hashes)
  const completed = await fixture("complete", 10001n, { ...hashes, submittedAt: 1001, timestamp: 1010, blockNumber: 60n })
  const rejected = await fixture("reject", 10001n, { ...hashes, timestamp: 1010, blockNumber: 60n })
  const context = completed.context, c = context.call
  const identity = { chainId: 5042002, escrow: c.escrow, hook: c.hook, evaluator: c.evaluator, treasury: context.treasury,
    token: c.token, implementation: addr(11), proxyCodeHash: keccak256("0x01"), implementationCodeHash: keccak256("0x02"), hookCodeHash: keccak256("0x03") }
  const requirements = buildEscrowRequirements(identity, { priceAtomic: c.amount, resource: c.resource, payTo: c.provider,
    escrow: { skillId: c.skillId, skillVersion: c.skillVersion, inputHash: c.inputHash, providerAgentId: c.providerAgentId, timeoutSeconds: c.timeoutSeconds } }, 1800)
  // Explicit rail contract fixture, not verification authority or a real chain.
  const verified: VerifiedEscrow = { rail: "erc8183", stage: "funded", payer: context.client, payTo: c.provider,
    amountAtomic: c.amount, network: "eip155:5042002", context, requirements }
  const proof = (f: typeof submitted) => assertEscrowActionReceipt(f.action, f.signed, f.mined, f.receipt, f.after)
  const events: string[] = [], attested: AttestJob[] = [], assignments: Parameters<Broker["dispatch"]>[0][] = []
  const action = (kind: "submit" | "complete" | "reject", f: typeof submitted) => Effect.suspend(() => {
    events.push(kind)
    return options.actionError === kind ? Effect.fail(new SettlementFailed({ reason: "Escrow action outcome uncertain; reconciliation required" })) :
      Effect.zipRight(options.action?.(kind) ?? Effect.void, Effect.sync(() => proof(f)))
  })
  const unused = () => Effect.die("unused fixture port")
  const rail: Erc8183Rail = { name: "erc8183", challenge: unused, verify: unused, verifyBudget: unused, budget: unused,
    submit: (v, hash) => { expect(v).toBe(verified); expect(hash).toBe(hashes.outputHash); return action("submit", submitted) },
    reject: () => action("reject", rejected), settle: (v, tree, completion) => {
      expect(v).toBe(verified); expect(completion).toEqual({ hubJobId: id, outputHash: hashes.outputHash })
      if (!options.children) expect(tree).toEqual({ treeHash: ERC8183_ZERO_HASH, childCount: 0, childTotalAtomic: 0n })
      const actual = options.children ? Effect.promise(() => fixture("complete", 10001n, { ...hashes,
        submittedAt: 1001, timestamp: 1010, blockNumber: 60n, receiptTree: tree! })) : Effect.succeed(completed)
      return Effect.flatMap(actual, f => Effect.map(action("complete", f), p => ({ txHash: p.txHash, payer: v.payer, amountAtomic: v.amountAtomic, settlementKind: "onchain" as const, proof: p })))
    } }
  const listing = PublicListing.make({ id: "skill", version: "1.0.0", serviceName: "Skill", description: "Offline pipeline fixture",
    tags: [], rails: ["erc8183"], price: "$0.010001", bounds: Bounds.make({ timeoutSec: 60,
      ...(options.hireBudget === undefined ? {} : { maxSubSpendUsd: options.hireBudget }) }), inputSchema: { type: "object" },
    outputSchema: { type: "object", required: ["ok"] } })
  await run(opened.store.putListing({ listing, seller: c.provider, agentId: "8", agentVerified: true, runnerId: "r1", publishedAtMs: 990000 }))
  await run(opened.store.escrow!.admit(context, Job.make({ id, skillId: c.skillId, seller: c.provider, buyer: context.client,
    priceAtomic: c.amount, input, status: "queued", createdAtMs: 990000, rootJobId: id, hop: 0, ancestors: [] })))
  const outcome = JobOutcome.make({ status: "succeeded", ...(options.refusal ? { stopReason: "refusal:fixture" } : {}),
    output, costUsd: 0, startedAtMs: 990001, finishedAtMs: 999000 })
  let broker: Broker = { register: () => Effect.void, unregister: () => Effect.void, complete: () => Effect.void,
    runnerFor: () => Effect.succeed("r1"), runnerForJob: () => Effect.succeed("r1"),
    dispatch: options.dispatch ?? (a => Effect.sync(() => { events.push("dispatch"); assignments.push(a); return outcome })) }
  if (options.realBroker) {
    broker = makeBroker(Effect.runSync(Ref.make({ conns: new Map(), routes: new Map(), waiters: new Map(), assigned: new Map() })), { nowSeconds: () => 1012 })
    await run(broker.register({ runnerId: "r1", seller: c.provider, connectionId: {}, isCurrent: () => true, close: () => {}, send: message => {
      expect(message._tag).toBe("JobAssignment")
      if (message._tag !== "JobAssignment") throw Error("unexpected fixture message")
      expect(Effect.runSync(opened.store.escrow!.get(id))?.state).toBe("executing")
      expect(Effect.runSync(opened.store.treeState(id)).reservedAtomic).toBe(0n)
      events.push("dispatch"); assignments.push({ jobId: message.jobId, skillId: message.skillId, skillVersion: message.skillVersion,
        input: message.input, timeoutSec: message.timeoutSec,
        ...(message.escrow === undefined ? {} : { escrow: message.escrow }),
        ...(message.hireCapability === undefined ? {} : { hireCapability: message.hireCapability }),
        ...(message.parentJobId === undefined ? {} : { parentJobId: message.parentJobId }) })
      Effect.runSync(broker.complete(id, outcome))
    } }, ["skill"]))
  }
  const store = options.store?.(opened.store) ?? opened.store
  const layers = Layer.mergeAll(Layer.succeed(StoreTag, store), Layer.succeed(BrokerTag, broker), Layer.succeed(AttestTag, {
    idle: Effect.void, onTerminal: options.onTerminal ?? (a => Effect.gen(function* () {
      expect((yield* opened.store.allReceipts).some(r => r.jobId === id)).toBe(true); events.push("attest"); attested.push(a)
    })) }))
  const args = { jobId: id, rail, verified, ...(options.hireBudget === undefined ? {} : { hireSecret: "owned-fixture-hmac-secret-not-an-owner-key" }),
    attest: { agentId: "8", payTo: c.provider, origin: "https://example.test", chainId: 5042002, identityRegistry: addr(12) } },
    effect = () => runEscrowJob(args, () => 1012000).pipe(Effect.provide(layers))
  const execute = () => run(effect())
  return { execute, effect, args, store: opened.store, events, attested, assignments, verified, id, context, output, listing, outcome }
}
describe("typed escrow pipeline with real durable Store and synthetic rail evidence", () => {
  test("submits validated output, completes and attests only after durable terminal storage", async () => {
    const h = await setup(); await h.execute()
    expect(h.events).toEqual(["dispatch", "submit", "complete", "attest"])
    const receipt = (await run(h.store.allReceipts))[0]!
    expect(receipt).toMatchObject({ rail: "erc8183", settled: true, feeAtomic: 500n, sellerAtomic: 9501n,
      escrow: { state: "settled" }, treeCommittedAtomic: 0n, treeCeilingAtomic: 0n })
    expect(receipt.authorizationNonce).toBeUndefined(); expect(receipt.sessionId).toBeUndefined()
    expect(h.assignments[0]?.escrow).toBeDefined()
    expect(h.attested[0]?.settleTx).toBe(receipt.settleTx)
    await h.execute(); expect(h.events).toEqual(["dispatch", "submit", "complete", "attest"])
  })
  test.each([{ refusal: true }, { badOutput: true }])("ordinary nonsettling output requests a proven refund: %j", async options => {
    const h = await setup(options); await h.execute()
    expect(h.events).toEqual(["dispatch", "reject", "attest"])
    const receipt = (await run(h.store.allReceipts))[0]!
    expect(receipt).toMatchObject({ settled: false, reason: "escrow refunded", escrow: { state: "refunded", refundAtomic: "10001" } })
    expect(receipt.settleTx).toBeUndefined(); expect(h.attested[0]?.settled).toBe(false)
  })
  test.each(["submit", "complete", "reject"] as const)("uncertain %s never triggers an opposite action or attestation", async actionError => {
    const h = await setup({ actionError, ...(actionError === "reject" ? { refusal: true } : {}) }); await h.execute()
    expect(h.events).toEqual(actionError === "complete" ? ["dispatch", "submit", "complete"] : ["dispatch", actionError])
    expect((await run(h.store.allReceipts))[0]).toMatchObject({ settled: false, reason: "escrow outcome uncertain; reconciliation required",
      escrow: { state: "uncertain" } })
    expect(h.attested).toEqual([])
  })
  test("actual broker receives durable root ownership and only a hub-minted hire capability", async () => {
    const h = await setup({ realBroker: true, hireBudget: 0.01 }); await h.execute()
    expect(h.events).toEqual(["dispatch", "submit", "complete", "attest"])
    expect(h.assignments[0]?.parentJobId).toBeUndefined()
    expect(verifyHireCapability(h.args.hireSecret!, h.assignments[0]!.hireCapability!, 1012000)).toEqual({ parentJobId: h.id })
    expect(verifyHireCapability(h.args.hireSecret!, h.assignments[0]!.hireCapability!, 1132000)).toHaveProperty("_tag", "LineageInvalid")
    expect((await run(h.store.allReceipts))[0]!.treeCeilingAtomic).toBe(10000n)
  })
  test.each(["missing escrow", "volatile", "wrong agent", "wrong price", "wrong input schema", "escrow omitted"])("refuses %s before inference or actions", async mode => {
    const h = await setup({ store: store => mode === "missing escrow" ? withoutEscrow(store) : mode === "volatile" ?
      { ...store, escrow: { ...store.escrow!, durability: "volatile" } } : { ...store, getListing: id => Effect.map(store.getListing(id), row => ({ ...row,
        ...(mode === "wrong agent" ? { agentId: "9" } : {}), listing: PublicListing.make({ ...row.listing,
          ...(mode === "wrong price" ? { price: "$0.02" } : {}), ...(mode === "wrong input schema" ? { inputSchema: { type: "array" } } : {}),
          ...(mode === "escrow omitted" ? { rails: ["eip3009"] } : {}) }) })) } })
    await refused(h.effect())
    expect(h.events).toEqual([]); expect((await run(h.store.escrow!.get(h.id)))?.state).toBe("admitted")
  })
  test.each(["nonterminal", "future", "negative cost", "output getter", "oversized output"])("invalid runner %s cannot authorize submit", async mode => {
    let getterCalls = 0
    const outcome = mode === "output getter" ? { status: "succeeded", startedAtMs: 990001, finishedAtMs: 999000,
      get output() { getterCalls++; throw Error("PRIVATE_GETTER"); } } : JobOutcome.make({ status: mode === "nonterminal" ? "running" : "succeeded",
        startedAtMs: 990001, finishedAtMs: mode === "future" ? 2000000 : 999000, ...(mode === "negative cost" ? { costUsd: -1 } : {}),
        output: mode === "oversized output" ? { ok: "x".repeat(MAX_OUTPUT_CHARS + 1) } : { ok: true } })
    const h = await setup({ dispatch: () => Effect.succeed(outcome as JobOutcome) }); await h.execute()
    expect(h.events).toEqual(["reject", "attest"]); expect(getterCalls).toBe(0)
    expect((await run(h.store.allReceipts))[0]!.escrow?.state).toBe("refunded")
  })
  test("a terminal storage failure after complete never sends a reject or attests", async () => {
    const h = await setup({ store: store => ({ ...store, escrow: { ...store.escrow!, finish: () => Effect.die("PRIVATE_DISK_DETAIL") } }) })
    await refused(h.effect())
    expect(h.events).toEqual(["dispatch", "submit", "complete"])
    expect(await run(h.store.allReceipts)).toEqual([])
    expect((await run(h.store.escrow!.get(h.id)))?.state).toBe("uncertain")
    await h.execute(); expect(h.events).toHaveLength(3)
  })
  test.each(["throws", "defect", "never"])("a broken attestation queue (%s) cannot change the durable terminal", async mode => {
    const h = await setup({ onTerminal: () => {
      if (mode === "throws") throw Error("PRIVATE_QUEUE_DETAIL")
      return mode === "defect" ? Effect.die("PRIVATE_QUEUE_DETAIL") : Effect.never
    } })
    await h.execute(); expect((await run(h.store.allReceipts))[0]!.settled).toBe(true)
    expect(h.events).toEqual(["dispatch", "submit", "complete"])
  })
  test("interruption during submit preserves uncertainty and fences a late continuation", async () => {
    let start!: () => void
    const started = new Promise<void>(resolve => { start = resolve })
    const h = await setup({ action: kind => kind === "submit" ? Effect.zipRight(Effect.sync(start), Effect.never) : Effect.void })
    const fiber = Effect.runFork(h.effect())
    await started; await run(Fiber.interrupt(fiber))
    expect(h.events).toEqual(["dispatch", "submit"])
    expect((await run(h.store.escrow!.get(h.id)))?.state).toBe("uncertain")
    expect(await run(h.store.allReceipts)).toEqual([])
    await h.execute(); expect(h.events).toEqual(["dispatch", "submit"])
  })
  test("a pending child hold closes admission and records uncertainty without any escrow action", async () => {
    let target!: Store, root = ""
    const h = await setup({ hireBudget: 0.01, dispatch: () => Effect.gen(function* () {
      expect(yield* target.reserveTree(root, "job_" + "d".repeat(32), 1n, 10000n)).toBe(true)
      return JobOutcome.make({ status: "succeeded", output: { ok: true }, startedAtMs: 990001, finishedAtMs: 999000 })
    }) }); target = h.store; root = h.id
    await h.execute(); expect(h.events).toEqual([])
    expect((await run(h.store.allReceipts))[0]!.escrow?.state).toBe("uncertain")
    expect((await run(h.store.treeState(root))).reservedAtomic).toBe(1n)
    expect(await run(h.store.reserveTree(root, "job_" + "e".repeat(32), 1n, 10000n))).toBe(false)
  })
  test("a missing runner requests a proven refund, not an uncashed-authorization claim", async () => {
    const h = await setup({ dispatch: () => Effect.fail(new NoRunnerAvailable({ skillId: "skill" })) })
    await h.execute(); expect(h.events).toEqual(["reject", "attest"])
    expect((await run(h.store.allReceipts))[0]!.escrow?.state).toBe("refunded")
  })
  test.each(["eip3009", "gateway", "test", "released parent"] as const)("commits an actual %s child tree using the full stored receipt", async kind => {
    let target!: Store, root = "", seller = ""
    const child = "job_" + "d".repeat(32), parent = "job_" + "e".repeat(32), rail = kind === "released parent" ? "eip3009" : kind
    const h = await setup({ hireBudget: 0.01, children: true, dispatch: () => Effect.gen(function* () {
      expect(yield* target.reserveTree(root, child, 100n, 10000n)).toBe(true)
      if (kind === "released parent") {
        yield* target.reserveTree(root, parent, 100n, 10000n); yield* target.releaseTree(parent)
        yield* target.putReceipt(Receipt.make({ jobId: parent, skillId: "parent-skill", skillVersion: "1.0.0", buyer: seller, seller: addr(21),
          priceAtomic: 100n, sellerAtomic: 95n, feeAtomic: 5n, feeBps: 500, rail, network: "eip155:5042002", settled: false,
          reason: "output invalid", createdAtMs: 998000, latencyMs: 1000, rootJobId: root, parentJobId: root, hop: 1, ancestors: ["skill"] }))
      }
      yield* target.commitTree(child)
      yield* target.putReceipt(Receipt.make({ jobId: child, skillId: "child-skill", skillVersion: "1.0.0", buyer: kind === "released parent" ? addr(21) : seller, seller: addr(20),
        priceAtomic: 100n, sellerAtomic: 95n, feeAtomic: 5n, feeBps: 500, rail, network: "eip155:5042002", settled: true,
        settleTx: rail === "gateway" ? "fixture-gateway-reference" : "0x" + "dd".repeat(32), reason: "ok", createdAtMs: 998000,
        latencyMs: 1000, rootJobId: root, parentJobId: kind === "released parent" ? parent : root,
        hop: kind === "released parent" ? 2 : 1, ancestors: kind === "released parent" ? ["skill", "parent-skill"] : ["skill"] }))
      return JobOutcome.make({ status: "succeeded", output: { ok: true }, startedAtMs: 990001, finishedAtMs: 999000 })
    }) }); target = h.store; root = h.id; seller = h.context.call.provider
    await h.execute(); expect(h.events).toEqual(["submit", "complete", "attest"])
    const receipt = (await run(h.store.allReceipts)).find(r => r.jobId === h.id)!
    expect(receipt).toMatchObject({ settled: true, treeCommittedAtomic: 100n, treeCeilingAtomic: 10000n })
    expect(receipt.children).toHaveLength(1); expect(receipt.children![0]!.jobId).toBe(child)
    expect(receipt.treeHash).not.toBe(ERC8183_ZERO_HASH)
  })
  test("missing full child evidence preserves uncertainty without completing or refunding", async () => {
    let target!: Store, root = ""
    const h = await setup({ hireBudget: 0.01, dispatch: () => Effect.gen(function* () {
      const child = "job_" + "d".repeat(32)
      yield* target.reserveTree(root, child, 100n, 10000n); yield* target.commitTree(child)
      return JobOutcome.make({ status: "succeeded", output: { ok: true }, startedAtMs: 990001, finishedAtMs: 999000 })
    }) }); target = h.store; root = h.id
    await refused(h.effect()); expect(h.events).toEqual([])
    expect((await run(h.store.escrow!.get(root)))?.state).toBe("uncertain")
    expect(await run(h.store.allReceipts)).toEqual([])
  })
  test("mutating the original runner output during submit cannot change the committed or released output", async () => {
    let mutate = () => {}
    const h = await setup({ action: kind => Effect.sync(() => { if (kind === "submit") mutate() }) })
    mutate = () => { Object.assign(h.output, { ok: false, injected: "PRIVATE_LATE_MUTATION" }) }
    await h.execute()
    expect((await run(h.store.getJob(h.id)))!.outcome!.output).toEqual({ ok: true })
    expect(h.attested[0]!.output).toEqual({ ok: true })
  })
  test("two concurrent executions claim inference only once", async () => {
    let start!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { start = resolve }), barrier = new Promise<void>(resolve => { release = resolve })
    const h = await setup({ action: kind => kind === "submit" ? Effect.promise(() => { start(); return barrier }) : Effect.void })
    const first = h.execute()
    try { await started; await h.execute(); expect(h.events).toEqual(["dispatch", "submit"]) }
    finally { release(); await first }
    expect(h.events).toEqual(["dispatch", "submit", "complete", "attest"])
  })
  test("a defect during an action is redacted and cannot become a refund or attestation", async () => {
    const h = await setup({ action: () => Effect.die("PRIVATE_ACTION_DEFECT") })
    await refused(h.effect())
    expect(h.events).toEqual(["dispatch", "submit"])
    expect((await run(h.store.escrow!.get(h.id)))?.state).toBe("uncertain")
  })
  test.each(["wrong root", "wrong amount", "wrong payer", "wrong hop", "wrong ancestors", "wrong network", "session"])("foreign child evidence (%s) cannot authorize complete", async mode => {
    let target!: Store, root = "", seller = ""
    const child = "job_" + "d".repeat(32)
    const h = await setup({ hireBudget: 0.01, dispatch: () => Effect.gen(function* () {
      yield* target.reserveTree(root, child, 100n, 10000n); yield* target.commitTree(child)
      yield* target.putReceipt(Receipt.make({ jobId: child, skillId: "child-skill", skillVersion: "1.0.0", buyer: mode === "wrong payer" ? addr(22) : seller,
        seller: addr(20), priceAtomic: mode === "wrong amount" ? 99n : 100n, sellerAtomic: 95n, feeAtomic: 5n, feeBps: 500, rail: "eip3009",
        network: mode === "wrong network" ? "eip155:8453" : "eip155:5042002", settled: true, settleTx: "0x" + "dd".repeat(32),
        reason: "ok", createdAtMs: 998000, latencyMs: 1000, rootJobId: mode === "wrong root" ? child : root, parentJobId: root,
        hop: mode === "wrong hop" ? 2 : 1, ancestors: mode === "wrong ancestors" ? ["forged"] : ["skill"] }))
      return JobOutcome.make({ status: "succeeded", output: { ok: true }, startedAtMs: 990001, finishedAtMs: 999000 })
    }), ...(mode === "session" ? { store: (s: Store): Store => ({ ...s, allReceipts: Effect.map(s.allReceipts,
      rows => rows.map(r => Receipt.make({ ...r, sessionId: "session_fixture" }))) }) } : {}) })
    target = h.store; root = h.id; seller = h.context.call.provider
    await refused(h.effect()); expect(h.events).toEqual([])
    expect((await run(h.store.escrow!.get(root)))?.state).toBe("uncertain")
  })
  test("listing data accessors never run before inference", async () => {
    let calls = 0
    const h = await setup({ store: s => ({ ...s, getListing: id => Effect.map(s.getListing(id), row => {
      const listing = { ...row.listing, get bounds(): Bounds { calls++; throw Error("PRIVATE_LISTING_GETTER") } }
      return { ...row, listing }
    }) }) })
    await refused(h.effect()); expect(calls).toBe(0); expect(h.events).toEqual([])
  })
  test("an incoherent submit proof stops before complete and cannot attest", async () => {
    const h = await setup(), original = h.args.rail.submit
    h.args.rail = { ...h.args.rail, submit: (v, hash) => Effect.map(original(v, hash), proof => ({ ...proof, kind: "reject" as const })) }
    await refused(h.effect()); expect(h.events).toEqual(["dispatch", "submit"])
    expect((await run(h.store.escrow!.get(h.id)))?.state).toBe("uncertain")
  })
})
