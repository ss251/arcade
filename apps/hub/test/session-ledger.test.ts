import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { Job, JobOutcome, Receipt, Session, loadChainConfig } from "@arcade/core"
import { StoreLive, StoreTag, sessionStoreApi } from "../src/store.ts"
import { sessionJson, sessionParse, sessionRequestDigest, transitionSession, sessionSnapshot,
  type SessionBinding, type SessionLedgerState, type SessionTerminal, type NewSession } from "../src/session-ledger.ts"

const c = loadChainConfig("arc-testnet"), buyer = `0x${"1".repeat(40)}`, seller = `0x${"2".repeat(40)}`
const sid = (n = 1) => `ses_${n.toString(16).padStart(32, "0")}`, jid = (n = 1) => `job_${n.toString(16).padStart(20, "0")}`
const initial = (n = 1, budgetAtomic = 100n): NewSession => ({ id: sid(n), buyer, budgetAtomic, rail: "gateway", network: c.caip2, openedAtMs: 1 })
const pair = (n = 1, value = 30n, rail: "gateway" | "eip3009" | "test" = "gateway") => {
  const input = { b: 2, a: 1 }
  const binding: SessionBinding = { sessionId: sid(), jobId: jid(n), buyer, seller, skillId: "fixture", skillVersion: "1.0.0",
    rail, network: c.caip2, asset: c.usdc.address, verifyingContract: rail === "gateway" ? c.gateway!.wallet : c.usdc.address,
    domainName: rail === "gateway" ? "GatewayWalletBatched" : c.usdc.eip712Name, domainVersion: rail === "gateway" ? "1" : c.usdc.eip712Version,
    payTo: seller, amountAtomic: value, nonce: `0x${n.toString(16).padStart(64, "0")}`, validAfter: 1n, validBefore: 604901n, requestDigest: sessionRequestDigest(input) }
  const job = Job.make({ id: binding.jobId, skillId: "fixture", seller, buyer, priceAtomic: value, input, status: "queued", createdAtMs: 2, rootJobId: binding.jobId, hop: 0, ancestors: [] })
  return { binding, job }
}
const finish = (n = 1, value = 30n, accepted = true, rail: "gateway" | "eip3009" | "test" = "gateway"): SessionTerminal => {
  const p = pair(n, value, rail), ref = rail === "gateway" ? `12345678-1234-4234-8234-${n.toString(16).padStart(12, "0")}`
    : rail === "test" ? `0xtest${p.binding.nonce.slice(2, 12)}${n.toString(16).padStart(4, "0")}` : `0x${n.toString(16).padStart(64, "0")}`
  // Follow the real test rail's distinct simulated reference shape; EIP keeps hashes.
  const kind = rail === "gateway" ? "gateway-transfer" as const : rail === "test" ? "test" as const : "onchain" as const
  const job = Job.make({ ...p.job, status: accepted ? "succeeded" : "refused", outcome: JobOutcome.make({ status: accepted ? "succeeded" : "refused",
    startedAtMs: 2, finishedAtMs: 3, ...(accepted ? { output: { ok: true } } : {}) }) })
  const receipt = Receipt.make({ jobId: job.id, skillId: "fixture", skillVersion: "1.0.0", buyer, seller, priceAtomic: value,
    sellerAtomic: value, feeAtomic: 0n, feeBps: 0, rail, network: c.caip2, latencyMs: 1, settled: accepted,
    reason: accepted ? "ok" : "session_released", createdAtMs: 3, rootJobId: job.id, hop: 0, ancestors: [], sessionId: sid(),
    ...(accepted ? { settleTx: ref, settleRefKind: kind } : {}) })
  return accepted ? { kind: "settled", sessionId: sid(), jobId: job.id, job, receipt,
    settlement: { payer: buyer, amountAtomic: value, txHash: ref, ...(rail === "gateway" ? { settlementKind: "gateway-transfer" as const } : {}) } }
    : { kind: "released", sessionId: sid(), jobId: job.id, job, receipt }
}
const run = Effect.runPromise, memory = () => run(StoreTag.pipe(Effect.provide(StoreLive)))
const tag = async <A, E>(effect: Effect.Effect<A, E>, expected: string) => expect(await run(Effect.either(effect))).toMatchObject({ _tag: "Left", left: { _tag: expected } })
describe("session shared kernel and memory authority", () => {
  it("canonical request digests do not depend on JSON property insertion order", () => {
    expect(sessionRequestDigest({ b: 2, a: 1 })).toBe(sessionRequestDigest({ a: 1, b: 2 }))
    expect(sessionParse(sessionJson({ amount: 9007199254740993n }))).toEqual({ amount: 9007199254740993n })
    expect(sessionJson({ a: 1, B: 2 })).toBe('{"B":2,"a":1}')
  })
  it("refuses extra evidence fields instead of silently changing the admitted object", async () => {
    const s = await memory(); await run(s.openSession(initial())); const p = pair()
    await tag(s.reserveSessionJob(p.binding, { ...p.job, unexpected: "not canonical evidence" } as Job), "SessionInvalid")
    expect((await run(s.getSessionSnapshot(sid())))?.heldAtomic).toBe(0n)
    await run(s.reserveSessionJob(p.binding, p.job))
    const t = finish(1, 30n, false)
    await tag(s.finishSessionJob({ ...t, receipt: { ...t.receipt, unexpected: "not canonical evidence" } as Receipt }), "SessionInvalid")
    await tag(s.finishSessionJob({ ...t, job: { ...t.job, outcome: { ...t.job.outcome!, unexpected: true } } as Job }), "SessionInvalid")
    expect((await run(s.getSessionSnapshot(sid())))?.heldAtomic).toBe(30n)
  })
  it.each(["eip3009", "test"] as const)("rejects a %s transfer category or zero hash before terminal evidence", async rail => {
    const s = await memory(); await run(s.openSession({ ...initial(), rail })); const p = pair(1, 30n, rail)
    await run(s.reserveSessionJob(p.binding, p.job)); await run(s.beginSessionSettlement(sid(), jid()))
    const t = finish(1, 30n, true, rail); if (t.kind !== "settled") throw Error("fixture")
    await tag(s.finishSessionJob({ ...t, settlement: { ...t.settlement, settlementKind: "gateway-transfer" } }), "SessionInvalid")
    const zero = `0x${"0".repeat(64)}`
    await tag(s.finishSessionJob({ ...t, receipt: Receipt.make({ ...t.receipt, settleTx: zero }), settlement: { ...t.settlement, txHash: zero } }), "SessionInvalid")
    expect((await run(s.getSessionSnapshot(sid())))?.heldAtomic).toBe(30n)
  })
  it("refuses duplicate settlement references without committing the second job", async () => {
    const s = await memory(); await run(s.openSession(initial()))
    for (const n of [1, 2]) { const p = pair(n); await run(s.reserveSessionJob(p.binding, p.job)); await run(s.beginSessionSettlement(sid(), jid(n))) }
    const first = finish(1), second = finish(2)
    if (first.kind !== "settled" || second.kind !== "settled") throw Error("fixture")
    await run(s.finishSessionJob(first))
    await tag(s.finishSessionJob({ ...second, receipt: Receipt.make({ ...second.receipt, settleTx: first.receipt.settleTx }),
      settlement: { ...second.settlement, txHash: first.settlement.txHash } }), "SessionInvalid")
    expect((await run(s.getSessionSnapshot(sid())))?.session.spentAtomic).toBe(30n)
    expect((await run(s.getJob(jid(2))))?.status).toBe("queued")
  })
  it.each(["job", "receipt"])("semantic retry refuses a proposed ID already owned by a legacy %s", async legacy => {
    const s = await memory(); await run(s.openSession(initial())); const p = pair(), fresh = pair(2)
    await run(s.reserveSessionJob(p.binding, p.job))
    if (legacy === "job") await run(s.putJob(fresh.job))
    else { const { sessionId: _session, ...r } = finish(2, 30n, false).receipt; await run(s.putReceipt(Receipt.make(r))) }
    await tag(s.reserveSessionJob({ ...fresh.binding, nonce: p.binding.nonce }, fresh.job), "SessionConflict")
    expect((await run(s.getSessionSnapshot(sid())))?.calls).toHaveLength(1)
  })
  it("two equal-price completions and identical retries cannot release a sibling or reset spend", async () => {
    const s = await memory(); await run(s.openSession(initial()))
    for (const n of [1, 2]) { const p = pair(n); await run(s.reserveSessionJob(p.binding, p.job)); await run(s.beginSessionSettlement(sid(), jid(n))) }
    await Promise.all([run(s.finishSessionJob(finish(1))), run(s.finishSessionJob(finish(2)))])
    await run(s.finishSessionJob(finish(1)))
    expect((await run(s.getSessionSnapshot(sid())))?.session.spentAtomic).toBe(60n)
    await tag(s.openSession(initial()), "SessionConflict")
    await tag(s.finishSessionJob(finish(1, 30n, false)), "SessionConflict")
  })
  it("close racing reservation has one serialization and pending close preserves its hold", async () => {
    const s = await memory(); await run(s.openSession(initial())); const p = pair()
    const results = await Promise.all([run(Effect.either(s.reserveSessionJob(p.binding, p.job))), run(Effect.either(s.closeSession(sid(), 4)))])
    expect(results.filter(r => r._tag === "Right")).toHaveLength(1)
    expect((await run(s.getSessionSnapshot(sid())))?.heldAtomic).toBe(30n)
  })
  it("derives actual queued-input digest and refuses nested lineage before admission", async () => {
    const s = await memory(); await run(s.openSession(initial())); const p = pair()
    await tag(s.reserveSessionJob(p.binding, Job.make({ ...p.job, input: { changed: true } })), "SessionInvalid")
    await tag(s.reserveSessionJob(p.binding, Job.make({ ...p.job, parentJobId: jid(9), hop: 1, ancestors: [seller], rootJobId: jid(9) })), "SessionInvalid")
    expect((await run(s.getSessionSnapshot(sid())))?.calls).toHaveLength(0)
  })
  it.each(["buyer", "seller", "payTo", "skillVersion", "amountAtomic", "network", "rail", "nonce"] as const)("refuses changed terminal %s without releasing the hold", async field => {
    const s = await memory(); await run(s.openSession(initial())); const p = pair(); await run(s.reserveSessionJob(p.binding, p.job)); await run(s.beginSessionSettlement(sid(), jid()))
    const t = finish(); const receipt = Receipt.make({ ...t.receipt, ...(field === "amountAtomic" ? { priceAtomic: 31n } : field === "nonce" ? { authorizationNonce: `0x${"9".repeat(64)}` } :
      field === "payTo" ? { seller: `0x${"9".repeat(40)}` } : field === "rail" ? { rail: "test" as const } :
      field === "network" ? { network: "eip155:1" } : field === "skillVersion" ? { skillVersion: "2.0.0" } : { [field]: `0x${"9".repeat(40)}` }) })
    await tag(s.finishSessionJob({ ...t, receipt }), "SessionInvalid")
    expect((await run(s.getSessionSnapshot(sid())))?.heldAtomic).toBe(30n)
  })
  it.each(["eip3009", "test"] as const)("normalizes omitted %s reference kind as a category, not mined proof", async rail => {
    const s = await memory(); await run(s.openSession({ ...initial(), rail })); const p = pair(1, 30n, rail)
    await run(s.reserveSessionJob(p.binding, p.job)); await run(s.beginSessionSettlement(sid(), jid())); await run(s.finishSessionJob(finish(1, 30n, true, rail)))
    expect((await run(s.getSessionSnapshot(sid())))?.calls[0]?.settleRefKind).toBe(rail === "test" ? "test" : "onchain")
  })
  it.each(["eip3009", "test"] as const)("rejects the other rail's reference and category atomically for %s", async rail => {
    const s = await memory(); await run(s.openSession({ ...initial(), rail })); const p = pair(1, 30n, rail)
    await run(s.reserveSessionJob(p.binding, p.job)); await run(s.beginSessionSettlement(sid(), jid()))
    const t = finish(1, 30n, true, rail); if (t.kind !== "settled") throw Error("fixture")
    const reference = rail === "test" ? `0x${"a".repeat(64)}` : "0xtest11111111110000"
    const otherKind = rail === "test" ? "onchain" as const : "test" as const
    // The optional payment kind remains omitted exactly as on the real TestRail.
    // Neither changing only its reference nor changing the receipt category may commit.
    for (const settleRefKind of [t.receipt.settleRefKind!, otherKind]) {
      await tag(s.finishSessionJob({ ...t, receipt: Receipt.make({ ...t.receipt, settleTx: reference, settleRefKind }),
        settlement: { ...t.settlement, txHash: reference } }), "SessionInvalid")
      expect((await run(s.getSessionSnapshot(sid())))?.heldAtomic).toBe(30n)
      expect((await run(s.getSessionSnapshot(sid())))?.session.spentAtomic).toBe(0n)
      expect((await run(s.getJob(jid())))?.status).toBe("queued")
      expect(await run(s.allReceipts)).toHaveLength(0)
    }
  })
  it("Gateway cannot omit its transfer kind or substitute hash-shaped mining claims", async () => {
    const s = await memory(); await run(s.openSession(initial())); const p = pair(); await run(s.reserveSessionJob(p.binding, p.job)); await run(s.beginSessionSettlement(sid(), jid()))
    const t = finish(); if (t.kind !== "settled") throw Error("fixture")
    const { settlementKind: _kind, ...without } = t.settlement
    await tag(s.finishSessionJob({ ...t, settlement: without }), "SessionInvalid")
    const txHash = `0x${"a".repeat(64)}`
    await tag(s.finishSessionJob({ ...t, receipt: Receipt.make({ ...t.receipt, settleTx: txHash, settleRefKind: "onchain" }),
      settlement: { ...t.settlement, txHash, settlementKind: "onchain" } }), "SessionInvalid")
    expect((await run(s.getSessionSnapshot(sid())))?.heldAtomic).toBe(30n)
  })
  it("enforces 100 lifetime calls without pruning released claims to make room", async () => {
    const s = await memory(); await run(s.openSession(initial(1, 1000n)))
    for (let n = 1; n <= 100; n++) { const p = pair(n, 1n); await run(s.reserveSessionJob(p.binding, p.job)); await run(s.finishSessionJob(finish(n, 1n, false))) }
    const extra = pair(101, 1n); await tag(s.reserveSessionJob(extra.binding, extra.job), "SessionCapacity")
    expect((await run(s.getSessionSnapshot(sid())))?.calls).toHaveLength(100)
    // 60s, not the global 30s: this is the slowest test in the suite (100 sequential
    // reserve/finish round trips) and it runs while 240+ other files share the CPU. It
    // asserts the 100-call CAP, never a latency budget, so a tighter timeout only buys
    // false reds — it took 5.2s alone and 22.4s under full parallel load on 2026-09-08.
  }, 60000)
  it("enforces 10000 retained sessions using actual validated maximum-size state", () => {
    const state: SessionLedgerState = { sessions: new Map(), sessionCalls: new Map(), jobs: new Map(), receipts: [] }
    for (let n = 1; n <= 10000; n++) state.sessions.set(sid(n), Session.make({ ...initial(n), spentAtomic: 0n }))
    expect(() => transitionSession(state, { kind: "open", input: initial(10001) })).toThrowError(expect.objectContaining({ _tag: "SessionCapacity" }))
    expect(state.sessions.size).toBe(10000)
    const api = sessionStoreApi(() => state, () => { throw Error("read-only fixture") }, "volatile")
    const exposed = Effect.runSync(api.allSessions)
    expect(exposed).toHaveLength(10000)
    Object.assign(exposed[0]!, { budgetAtomic: 1n })
    expect(state.sessions.get(sid(1))?.budgetAtomic).toBe(100n)
  }, 20000)
  it("bounds metadata bytes, evidence bytes, structured depth/nodes and never invokes accessors", () => {
    expect(() => sessionJson({ text: "x".repeat(16384) })).toThrow()
    expect(() => sessionJson({ text: "é".repeat(600000) }, 1048576)).toThrow()
    let deep: unknown = 0; for (let n = 0; n < 65; n++) deep = [deep]
    expect(() => sessionJson(deep)).toThrow()
    expect(() => sessionJson(Array.from({ length: 65536 }, () => 0), 1048576)).toThrow()
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; expect(() => sessionJson(cyclic)).toThrow()
    let reads = 0; expect(() => sessionJson({ get value() { reads++; return "private" } })).toThrow(); expect(reads).toBe(0)
    expect(() => sessionJson({ value: { __bigint: "1" } })).toThrow()
  })
  it("rejects corrupted aggregate spend instead of repairing it", () => {
    const state: SessionLedgerState = { sessions: new Map([[sid(), Session.make({ ...initial(), spentAtomic: 1n })]]), sessionCalls: new Map(), jobs: new Map(), receipts: [] }
    expect(() => sessionSnapshot(state, sid())).toThrow()
  })
})
