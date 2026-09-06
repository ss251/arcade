import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as hub from "../src/lib/hub.ts"
import { decodeReceipts, decodeTree } from "../src/lib/hub-decode.ts"
import { Receipt, ReceiptChild, treeHashOf } from "@arcade/core"
import { buildTreeView } from "../../hub/src/tree-view.ts"
import { scrubReceipt } from "../../hub/src/receipts-feed.ts"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { TreeGraph } from "../src/components/tree-graph.tsx"

const HUB = "https://hub.example"
const SELLER = `0x${"1".repeat(40)}`, PAYEE = `0x${"2".repeat(40)}`, TX = `0x${"3".repeat(64)}`
const ROOT = "job_abcdefghijklmnop", TOKEN = "a".repeat(32), ID = "usdc-flow-check"
const NAME = `${ID}.seller.arcade.eth`, CHAIN = "eip155:5042002"
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
const PRIVATE = "PRIVATE_DIAGNOSTIC_OR_CAPABILITY"
const listing = () => ({ id: ID, version: "0.1.0", serviceName: "USDC Flow Check", description: "Public prose",
  tags: ["payments"], price: "$0.01", seller: SELLER, inputSchema: { type: "object" }, outputSchema: { type: "object" },
  bounds: { timeoutSec: 30 }, ensName: null, ensExpired: false, delisted: false, payTested: null, payTestHistory: [] })
const receipt = () => ({ skillId: ID, skillVersion: "0.1.0", seller: SELLER, rail: "eip3009", network: CHAIN,
  priceAtomic: "10000", sellerAtomic: "9500", feeAtomic: "500", feeBps: 500, price: "$0.01", sellerShare: "$0.0095", fee: "$0.0005",
  settled: true, reason: "ok", latencyMs: 300, createdAtMs: 1000, settleTx: TX, explorer: `https://testnet.arcscan.app/tx/${TX}`,
  hop: 0, children: [], canary: true })
const counters = () => ({ listings: 1, sellers: 1, calls: 2, settled: 1, volume: "$0.01", volumeAtomic: "10000",
  fees: "$0.0005", feesAtomic: "500", trees: 0, source: "hub" })
const summary = () => ({ seller: SELLER.toLowerCase(), calls: 2, settled: 1, revenue: "$0.01", revenueAtomic: "10000",
  fees: "$0.0005", feesAtomic: "500", net: "$0.0095", netAtomic: "9500",
  inferenceCost: null, inferenceCostAtomic: null, subSpend: "$0.02", subSpendAtomic: "20000", margin: null, marginAtomic: null,
  knownInferenceCost: "$0.00", knownInferenceCostAtomic: "0", knownSubSpend: "$0.02", knownSubSpendAtomic: "20000",
  inferenceCostComplete: false, subSpendComplete: true, listings: [{ id: ID, serviceName: "USDC Flow Check", price: "$0.01",
    live: false, delisted: true, calls: 2, settled: 1, revenue: "$0.01", revenueAtomic: "10000", marginPerCall: null, marginPerCallAtomic: null }] })
const node = (id = "0", parent: string | null = null, hop = 0) => ({ nodeId: id, parentNodeId: parent, skillId: ID,
  hop, priceAtomic: "10000", price: "$0.01", settled: true, reason: "ok", latencyMs: 100, settleTx: TX,
  explorer: `https://testnet.arcscan.app/tx/${TX}` })
const tree = () => ({ rootJobId: ROOT, treeHash: TX, ceiling: "$0.02", committed: "$0.01", complete: true,
  evidenceFlags: [], nodes: [node(), node("0.0", "0", 1)] })
const name = () => ({ name: NAME, skillId: ID, seller: SELLER, endpoint: `${HUB}/x/${SELLER}/${ID}`,
  payTo: PAYEE, chain: CHAIN, priceAtomic: null, expired: false })
const stub = (body: unknown, status = 200) => {
  const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status }))
  vi.stubGlobal("fetch", f)
  return f
}
beforeEach(() => { vi.stubEnv("ARCADE_HUB", HUB); vi.stubEnv("ARCADE_NETWORK", "arc-testnet") })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe("H4 read-only hub boundary", () => {
  it("reads exact counters through the existing bounded transport and projects public fields", async () => {
    const f = stub({ ...counters(), buyer: PRIVATE })
    expect(await hub.stats()).toEqual(counters())
    expect(f.mock.calls[0]?.[0]).toBe(`${HUB}/stats`)
    expect(f.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error", credentials: "omit" })
  })
  it.each([{ settled: 3 }, { feesAtomic: "10001" }, { volumeAtomic: "01" }, { calls: -1 }, { trees: 2 },
    { volumeAtomic: (1n << 256n).toString() }, { volume: "$999.00" }, { source: "unknown" }])("refuses inconsistent counters %j", async change => {
    stub({ ...counters(), ...change }); await expect(hub.stats()).rejects.toThrow(hub.HubUnreachable)
  })
  it("normalizes only finite display limits and keeps the receipt whitelist/flat descendants", async () => {
    const child = { skillId: "other-skill", priceAtomic: "1000", price: "$0.001", settled: false, explorer: null }
    const row = { ...receipt(), buyer: PRIVATE, jobId: PRIVATE, sessionId: PRIVATE,
      children: [{ ...child, jobId: PRIVATE, parentJobId: PRIVATE, signature: PRIVATE }] }
    const f = stub([row])
    expect(await hub.listingReceipts(ID, 5.8)).toEqual([{ ...receipt(), children: [child] }])
    expect(f.mock.calls[0]?.[0]).toBe(`${HUB}/listings/${ID}/receipts?limit=5`)
    for (const [value, expected] of [[0, 1], [200, 100], [NaN, 20], [Infinity, 20]]) {
      stub([]); await hub.listingReceipts(ID, value)
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${HUB}/listings/${ID}/receipts?limit=${expected}`)
    }
  })
  it("projects global receipts with the same privacy and exact-money decoder", async () => {
    stub([{ ...receipt(), authorizationNonce: PRIVATE, receiptSignature: PRIVATE, ancestors: [PRIVATE] }])
    expect(await hub.receipts()).toEqual([receipt()])
  })
  it("never creates a per-call chain link from Gateway/test or unqualified references", async () => {
    for (const rail of ["gateway", "test"]) {
      stub([{ ...receipt(), rail }])
      expect((await hub.listingReceipts(ID))[0]?.explorer).toBeNull()
    }
    stub([{ ...receipt(), network: "eip155:1", explorer: `https://evil.example/tx/${TX}` }])
    expect((await hub.listingReceipts(ID))[0]?.explorer).toBeNull()
  })
  it("drops raw reasons, unrecognized skills and unsettled transaction locators", async () => {
    stub([{ ...receipt(), skillId: PRIVATE, settled: false, reason: PRIVATE, children: [] }])
    // A requested feed may not silently substitute a different/private skill identifier.
    await expect(hub.listingReceipts(ID)).rejects.toThrow(hub.HubUnreachable)
    stub([{ ...receipt(), settled: false, reason: PRIVATE }])
    expect((await hub.listingReceipts(ID))[0]).toMatchObject({ reason: "not settled", explorer: null })
    expect((await hub.listingReceipts(ID))[0]).not.toHaveProperty("settleTx")
  })
  it("rejects malformed money, excessive rows and wrong listing membership", async () => {
    for (const row of [{ ...receipt(), sellerAtomic: "1" }, { ...receipt(), priceAtomic: "1e4" },
      { ...receipt(), latencyMs: -1 }, { ...receipt(), skillId: "other-skill" }]) {
      stub([row]); await expect(hub.listingReceipts(ID)).rejects.toThrow(hub.HubUnreachable)
    }
    stub(Array.from({ length: 21 }, receipt)); await expect(hub.listingReceipts(ID)).rejects.toThrow(hub.HubUnreachable)
  })
  it("preserves unavailable accounting and known subtotals without filling zeros", async () => {
    stub({ ...summary(), receipts: [{ jobId: PRIVATE }], buyer: PRIVATE })
    expect(await hub.sellerSummary(SELLER)).toEqual(summary())
    const full = { ...summary(), inferenceCostComplete: true, inferenceCost: "$0.00", inferenceCostAtomic: "0",
      margin: "-$0.0105", marginAtomic: "-10500", listings: [{ ...summary().listings[0], marginPerCall: "-$0.0105", marginPerCallAtomic: "-10500" }] }
    stub(full); expect(await hub.sellerSummary(SELLER)).toEqual(full)
  })
  it.each([{ margin: "$0.00" }, { inferenceCostComplete: true }, { knownSubSpendAtomic: "0" },
    { netAtomic: "1" }, { seller: PAYEE }, { calls: Number.MAX_SAFE_INTEGER + 1 }])("refuses contradictory summary %j", async change => {
    stub({ ...summary(), ...change }); await expect(hub.sellerSummary(SELLER)).rejects.toThrow(hub.HubUnreachable)
  })
  it("sends the canonical capability only in a noncached nonreferring header", async () => {
    const f = stub({ ...tree(), private: PRIVATE, nodes: tree().nodes.map(n => ({ ...n, buyer: PRIVATE, jobId: PRIVATE })) })
    expect(await hub.tree(ROOT, TOKEN)).toEqual(tree())
    expect(f.mock.calls[0]?.[0]).toBe(`${HUB}/trees/${ROOT}`)
    const init = f.mock.calls[0]?.[1]
    expect(init).toMatchObject({ method: "GET", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error", credentials: "omit" })
    expect(new Headers(init?.headers).get("x-job-token")).toBe(TOKEN)
    expect(String(f.mock.calls[0]?.[0])).not.toContain(TOKEN)
  })
  it("keeps incomplete reservation evidence explicit and recorded digests unlinked", async () => {
    const partial = { ...tree(), complete: false, evidenceFlags: ["reservation-unresolved"] }
    stub(partial); expect(await hub.tree(ROOT, TOKEN)).toEqual(partial)
  })
  it("requires coherent budgets for a supposedly complete recorded tree", async () => {
    for (const mutation of [{ ceiling: undefined }, { committed: undefined }, { committed: "$0.03" }]) {
      stub({ ...tree(), ...mutation }); await expect(hub.tree(ROOT, TOKEN)).rejects.toThrow(hub.HubUnreachable)
    }
  })
  it("preserves Gateway and simulated tree locators without manufacturing explorer proof", async () => {
    for (const tx of ["11111111-2222-3333-4444-555555555555", "0xtest0123456789abcdef"]) {
      const value = { ...tree(), committed: "$0.00", nodes: [{ ...node(), settleTx: tx, explorer: null }] }
      stub(value); expect((await hub.tree(ROOT, TOKEN)).nodes[0]).toMatchObject({ settleTx: tx, explorer: null })
    }
  })
  it.each([{ rootJobId: "job_qrstuvwxyzabcdef" }, { complete: true, evidenceFlags: ["reservation-unresolved"] },
    { complete: false }, { evidenceFlags: [PRIVATE] }, { nodes: [node("0", null, 0), node("0.0", null, 1)] },
    { nodes: [node(), node("0.0", "0", 2)] }, { nodes: [node(), node("job_privateabcdefg", "0", 1)] },
    { nodes: [] }, { nodes: [node(), node()] }])("refuses wrong-root or invented tree structure %j", async change => {
    stub({ ...tree(), ...change }); await expect(hub.tree(ROOT, TOKEN)).rejects.toThrow(hub.HubUnreachable)
  })
  it("rejects invalid identifiers and tokens before issuing any request", async () => {
    const f = stub({})
    for (const id of ["../keys", "bad%2fid", "s", "x?token=secret"]) await expect(hub.listingReceipts(id)).rejects.toThrow(hub.HubUnreachable)
    await expect(hub.sellerSummary("0xabc")).rejects.toThrow(hub.HubUnreachable)
    await expect(hub.tree(ROOT, `${TOKEN}?`)).rejects.toThrow(hub.HubUnreachable)
    await expect(hub.tree("job_short", TOKEN)).rejects.toThrow(hub.HubUnreachable)
    await expect(hub.resolveName("evil/../arcade.eth")).rejects.toThrow(hub.HubUnreachable)
    expect(f).not.toHaveBeenCalled()
  })
  it("distinguishes a typed expired name from outages and unrelated 404s", async () => {
    stub(name()); expect(await hub.resolveName(NAME)).toEqual(name())
    stub({ error: "ens_name_expired", detail: PRIVATE }, 404)
    await expect(hub.resolveName(NAME)).rejects.toMatchObject({ _tag: "EnsNameExpired" })
    for (const status of [404, 503]) {
      stub({ error: PRIVATE }, status)
      await expect(hub.resolveName(NAME)).rejects.toMatchObject({ _tag: "HubUnreachable" })
      await expect(hub.resolveName(NAME)).rejects.not.toThrow(PRIVATE)
    }
  })
  it.each([{ endpoint: `https://other.example/x/${SELLER}/${ID}` }, { endpoint: `${HUB}/x/${PAYEE}/${ID}` },
    { chain: "eip155:1" }, { name: "other.seller.arcade.eth" }, { priceAtomic: "01" }, { expired: true }])("binds name authority %j", async change => {
    stub({ ...name(), ...change }); await expect(hub.resolveName(NAME)).rejects.toThrow(hub.HubUnreachable)
  })
  it("flattens only pinned nested identity evidence, never forged top-level evidence", async () => {
    stub({ ...listing(), agentId: "666", agentVerified: true, validationPasses: 99, registrationUri: "https://evil.example",
      engine: { systemPrompt: PRIVATE }, erc8004: { agentId: "0", registrationTx: TX, verified: true, stale: false,
        chain: CHAIN, registry: REGISTRY, validationPasses: 2, validationsRead: 3, settlementFeedback: 4 } })
    expect(await hub.describeSkill(ID)).toMatchObject({ agentId: "0", agentVerified: true, validationPasses: 2, validationsRead: 3,
      settlementFeedback: 4, registrationUri: `/listings/${ID}/agent-registration.json`, registrationTx: TX, evidenceStale: false })
    expect(JSON.stringify(await hub.describeSkill(ID))).not.toContain(PRIVATE)
    stub({ ...listing(), agentVerified: true, validationPasses: 99 })
    expect(await hub.describeSkill(ID)).not.toHaveProperty("agentVerified")
  })
  it.each([{ stale: true }, { verified: false }, { validationPasses: 4 }, { validationsRead: 21 },
    { settlementFeedback: 4097 }, { validationsRead: undefined }, { chain: "eip155:1" }, { registry: PAYEE }])("withholds forged/stale identity counts %j", async change => {
    stub({ ...listing(), validationPasses: 99, erc8004: { agentId: "1", verified: true, stale: false,
      chain: CHAIN, registry: REGISTRY, validationPasses: 2, validationsRead: 3, settlementFeedback: 4, ...change } })
    expect(await hub.describeSkill(ID)).not.toHaveProperty("validationPasses")
  })
  it("requires schema-valid listing fields and safely preserves actual nullable metadata", async () => {
    stub(listing()); expect(await hub.describeSkill(ID)).toEqual(listing())
    stub([listing()]); expect((await hub.listSkills())[0]).toMatchObject({ id: ID, ensName: null, payTested: null })
    for (const change of [{ seller: "0xabc" }, { id: "other-skill" }, { serviceName: undefined }, { inputSchema: undefined }]) {
      stub({ ...listing(), ...change }); await expect(hub.describeSkill(ID)).rejects.toThrow(hub.HubUnreachable)
    }
  })
  it("lets a legitimate 15s detail finish, with a hard detail-only 25s deadline", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null | undefined
    vi.stubGlobal("fetch", vi.fn((_url: unknown, init?: RequestInit) => {
      signal = init?.signal
      return new Promise<Response>(resolve => setTimeout(() => resolve(Response.json(listing())), 15_000))
    }))
    const result = hub.describeSkill(ID).then(value => ({ value }), error => ({ error }))
    await vi.advanceTimersByTimeAsync(15_001)
    expect(await result).toMatchObject({ value: { id: ID } })
    expect(signal?.aborted).toBe(false)
    vi.stubGlobal("fetch", vi.fn((_url: unknown, init?: RequestInit) => { signal = init?.signal; return new Promise<Response>(() => {}) }))
    const stalled = hub.describeSkill(ID).then(() => "accepted", () => "refused")
    await vi.advanceTimersByTimeAsync(25_001)
    expect(await stalled).toBe("refused"); expect(signal?.aborted).toBe(true)
  })
  it("retains the 10s whole-body deadline and 128KiB limit for other reads", async () => {
    vi.useFakeTimers(); const cancel = vi.fn()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ cancel }))))
    const stalled = hub.stats().then(() => "accepted", () => "refused")
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await stalled).toBe("refused"); expect(cancel).toHaveBeenCalled()
    stub({ ...counters(), ignored: "x".repeat(131_072) })
    await expect(hub.stats()).rejects.toThrow(hub.HubUnreachable)
  })
})

describe("F/H reference provenance integration", () => {
  const compact = () => ({ skillId: "child-skill", priceAtomic: "10000", price: "$0.01", settled: true,
    settleTx: TX, explorer: `https://testnet.arcscan.app/tx/${TX}` })
  it.each(["onchain", "gateway-transfer", "test", "unrecognized"])("retains the safe public kind %s for root and compact links", settleRefKind => {
    const out = decodeReceipts([{ ...receipt(), settleRefKind, children: [{ ...compact(), settleRefKind: "onchain" }] }])[0]!
    expect(out).toHaveProperty("settleRefKind", settleRefKind)
    expect(out.explorer === null).toBe(settleRefKind !== "onchain")
    expect(out.children[0]!.explorer === null).toBe(settleRefKind !== "onchain")
    expect(out.children[0]).not.toHaveProperty("settleRefKind")
  })
  it.each([undefined, null, "gateway-batch", "future-kind", 1])("normalizes invalid-present kind %s without legacy fallback", settleRefKind => {
    const out = decodeReceipts([{ ...receipt(), settleRefKind, children: [compact()] }])[0]!
    expect(out).toHaveProperty("settleRefKind", "unrecognized")
    expect(out.explorer).toBeNull()
    expect(out.children[0]!.explorer).toBeNull()
  })
  it("keeps legacy absence and released-root compact-child settlement independent", () => {
    const legacy = decodeReceipts([{ ...receipt(), children: [compact()] }])[0]!
    expect(legacy).not.toHaveProperty("settleRefKind")
    expect(legacy.explorer).not.toBeNull()
    expect(legacy.children[0]!.explorer).not.toBeNull()
    for (const settleRefKind of ["onchain", "test", undefined]) {
      const out = decodeReceipts([{ ...receipt(), settled: false, settleRefKind, children: [compact()] }])[0]!
      expect(out.explorer).toBeNull()
      expect(out.children[0]!.explorer === null).toBe(settleRefKind !== "onchain")
    }
  })
  it("never invokes reference-kind accessors or treats hidden/inherited authority as missing", () => {
    let calls = 0
    for (const descriptor of [{ enumerable: true, get() { calls++; return "onchain" } }, { value: "onchain" }]) {
      const r = Object.defineProperty({ ...receipt(), children: [compact()] }, "settleRefKind", descriptor)
      const out = decodeReceipts([r])[0]!
      expect(out).toHaveProperty("settleRefKind", "unrecognized")
      expect(out.explorer).toBeNull()
      expect(out.children[0]!.explorer).toBeNull()
    }
    const inherited = Object.assign(Object.create({ get settleRefKind() { calls++; return "onchain" } }), receipt())
    expect(() => decodeReceipts([inherited])).toThrow("Invalid public hub response")
    expect(calls).toBe(0)
  })
  it("preserves only optional boolean session provenance, independently of canary", async () => {
    expect(decodeReceipts([receipt()])[0]).not.toHaveProperty("session")
    for (const session of [false, true]) {
      const r = { ...receipt(), session, sessionId: PRIVATE, authorizationNonce: PRIVATE }
      stub([r])
      const out = (await hub.receipts())[0]!
      expect(out).toMatchObject({ session, canary: true })
      expect(JSON.stringify(out)).not.toContain(PRIVATE)
    }
  })
  it.each([undefined, null, "true", 1, {}])("refuses present invalid session marker %s", session => {
    expect(() => decodeReceipts([{ ...receipt(), session }])).toThrow("Invalid public hub response")
  })
  it("does not invoke a session getter or infer a marker from inherited data", () => {
    let calls = 0
    const own = Object.defineProperty(receipt(), "session", { enumerable: true, get() { calls++; return true } })
    expect(() => decodeReceipts([own])).toThrow("Invalid public hub response")
    const inherited = Object.assign(Object.create({ get session() { calls++; return true } }), receipt())
    expect(() => decodeReceipts([inherited])).toThrow("Invalid public hub response")
    expect(calls).toBe(0)
    expect(() => decodeReceipts([Object.defineProperty(receipt(), "session", { value: true })]))
      .toThrow("Invalid public hub response")
  })
  it.each([{ rail: "gateway", network: CHAIN }, { rail: "test", network: CHAIN }, { rail: "eip3009", network: "eip155:1" }])(
    "does not let onchain kind or compact-child aliases override root rail/network %j", context => {
      const out = decodeReceipts([{ ...receipt(), ...context, settleRefKind: "onchain",
        children: [{ ...compact(), rail: "eip3009", network: CHAIN, session: true }] }])[0]!
      expect(out.explorer).toBeNull()
      expect(out.children[0]!.explorer).toBeNull()
      expect(out.children[0]).not.toHaveProperty("rail")
      expect(out.children[0]).not.toHaveProperty("session")
    })
  it("retains the fixed session release reason without asserting refund or zero price", () => {
    const out = decodeReceipts([{ ...receipt(), settled: false, reason: "session_released", session: true }])[0]!
    expect(out).toMatchObject({ reason: "session_released", priceAtomic: "10000", settled: false, explorer: null })
    expect(out).not.toHaveProperty("settleTx")
  })
  it.each(["absent", "onchain", "gateway-transfer", "gateway-batch", "undefined", "accessor", "inherited"])(
    "preserves real producer → decoder → frozen H7 rendering provenance for %s", kind => {
      const childId = "job_childabcdefghijk", child = Receipt.make({ jobId: childId, skillId: "child-skill", skillVersion: "1",
        buyer: PAYEE, seller: SELLER, priceAtomic: 10000n, sellerAtomic: 9500n, feeAtomic: 500n, feeBps: 500,
        rail: "eip3009", network: CHAIN, settled: true, reason: "ok", latencyMs: 1, createdAtMs: 1,
        rootJobId: ROOT, parentJobId: ROOT, hop: 1, settleTx: TX })
      const children = [ReceiptChild.make({ jobId: childId, skillId: child.skillId, priceAtomic: child.priceAtomic,
        settled: true, settleTx: TX })]
      const root = Receipt.make({ ...child, jobId: ROOT, skillId: ID, parentJobId: undefined, hop: 0,
        children, treeHash: treeHashOf(ROOT, children), treeCeilingAtomic: 10000n, treeCommittedAtomic: 10000n })
      let calls = 0
      const rows = [root, child].map(r => {
        if (kind === "absent") return r
        if (kind === "inherited") return Object.assign(Object.create({ get settleRefKind() { calls++; return "onchain" } }), r) as Receipt
        return Object.defineProperty({ ...r }, "settleRefKind", kind === "accessor"
          ? { enumerable: true, get() { calls++; return "onchain" } }
          : { enumerable: true, value: kind === "undefined" ? undefined : kind }) as Receipt
      })
      const decoded = decodeTree(buildTreeView(ROOT, rows), ROOT)
      expect(decoded.complete).toBe(true)
      const html = renderToStaticMarkup(createElement(TreeGraph, { view: decoded }))
      const eligible = kind === "absent" || kind === "onchain"
      expect((html.match(/<a /g) ?? []).length).toBe(eligible ? 4 : 0)
      expect(html).not.toContain(ROOT)
      expect(html).not.toContain(childId)
      expect(calls).toBe(0)
      if (kind !== "inherited") {
        const feed = decodeReceipts([scrubReceipt(rows[0]!)])[0]!
        expect(feed.explorer === null).toBe(!eligible)
        expect(feed.children[0]!.explorer === null).toBe(!eligible)
      }
    })
})
