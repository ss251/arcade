import { describe, expect, it, vi } from "vitest"
import { EnsNameExpired, type ListingDetail, type PublicReceiptRow, type ResolvedName } from "../src/lib/hub.ts"
import { decodeListing, decodeReceipts } from "../src/lib/hub-decode.ts"
import { loadSkillPage } from "../src/lib/skill-page-data.ts"

const seller = "0xcf821769ed3c0e55e152745377bb833d7155a78a"
const hash = `0x${"1".repeat(64)}`
const jobId = `job_${"a".repeat(20)}`
const ens = "diff-triage.ss251.arcade.eth"
const stamp = 1_700_000_000_000
const listing = (): ListingDetail => decodeListing({ id: "diff-triage", version: "0.1.0", serviceName: "Diff Triage",
  description: "Synthetic bounded listing", seller, price: "$0.12", tags: ["code"],
  inputSchema: { type: "object", properties: { diff: { type: "string" } } }, outputSchema: { type: "object" },
  bounds: { timeoutSec: 120, maxCostUsd: 0.05 }, stats: { calls: 1, settled: 1, successRate: 1, p50LatencyMs: 2, p95LatencyMs: 2 },
  ratings: { count: 0, average: null }, payTested: { atMs: stamp, jobId, ok: true, settleTx: hash },
  payTestHistory: [{ atMs: stamp, jobId, ok: true, settleTx: hash }] }, "diff-triage")
const receipts = (): readonly PublicReceiptRow[] => decodeReceipts([{ skillId: "diff-triage", skillVersion: "0.1.0", seller,
  priceAtomic: "120000", sellerAtomic: "114000", feeAtomic: "6000", feeBps: 500, price: "$0.12", sellerShare: "$0.114", fee: "$0.006",
  settled: true, settleTx: hash, explorer: `https://testnet.arcscan.app/tx/${hash}`, rail: "eip3009", network: "eip155:5042002",
  latencyMs: 2, reason: "ok", createdAtMs: stamp, hop: 0,
  children: [{ skillId: "other-skill", priceAtomic: "10000", price: "$0.01", settled: false, explorer: null }] }], "diff-triage", 20)
const resolved = (): ResolvedName => ({ name: ens, skillId: "diff-triage", seller,
  endpoint: "https://example.invalid/x/diff-triage/diff-triage", payTo: seller, chain: "eip155:5042002", priceAtomic: "120000", expired: false })
const reads = () => ({ describeSkill: vi.fn(async () => listing()), listingReceipts: vi.fn(async () => receipts()), resolveName: vi.fn(async () => resolved()) })
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

describe("skill page data", () => {
  it("loads exact direct-ID reads in parallel and records one observation", async () => {
    const l = deferred<ListingDetail>(), r = deferred<readonly PublicReceiptRow[]>(), io = reads(), now = vi.fn(() => stamp)
    io.describeSkill.mockImplementation(() => l.promise); io.listingReceipts.mockImplementation(() => r.promise)
    const pending = loadSkillPage({ name: "diff-triage" }, io, now)
    await Promise.resolve(); await Promise.resolve()
    expect(io.describeSkill).toHaveBeenCalledWith("diff-triage")
    expect(io.listingReceipts).toHaveBeenCalledWith("diff-triage", 20)
    expect(io.resolveName).not.toHaveBeenCalled()
    l.resolve(listing()); r.resolve(receipts())
    const data = await pending
    expect(data.listing?.id).toBe("diff-triage"); expect(data.receipts).toHaveLength(1)
    expect([data.listingError, data.receiptsError, data.nameError, data.resolvedName]).toEqual([null, null, null, null])
    expect(data.observedAtMs).toBe(stamp); expect(now).toHaveBeenCalledTimes(1)
    expect(io.describeSkill).toHaveBeenCalledTimes(1); expect(io.listingReceipts).toHaveBeenCalledTimes(1)
  })
  it("records observation after both allowed reads have finished", async () => {
    let finished = 0
    const io = reads(), now = vi.fn(() => stamp + finished)
    io.describeSkill.mockImplementation(async () => { finished++; return listing() })
    io.listingReceipts.mockImplementation(async () => { finished++; return receipts() })
    expect((await loadSkillPage({ name: "diff-triage" }, io, now)).observedAtMs).toBe(stamp + 2)
    expect(now).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, null, "diff-triage", {}, { name: 42 }, { name: "../private" }, { name: "A.eth" }, { name: "a".repeat(254) },
    { name: "diff-triage", token: "PRIVATE" }, { name: "diff-triage", future: undefined }])("refuses malformed input before IO: %j", async input => {
    const io = reads(), data = await loadSkillPage(input, io, () => stamp)
    expect(data).toEqual({ listing: null, receipts: null, listingError: null, receiptsError: null, nameError: "invalid_name", resolvedName: null, observedAtMs: stamp })
    expect(io.describeSkill).not.toHaveBeenCalled(); expect(io.listingReceipts).not.toHaveBeenCalled(); expect(io.resolveName).not.toHaveBeenCalled()
  })
  it("does not execute input accessors or coercions", async () => {
    let touched = 0
    const input = Object.defineProperty({}, "name", { enumerable: true, get() { touched++; throw Error("PRIVATE") } })
    const io = reads(), data = await loadSkillPage(input, io, () => stamp)
    expect(data.nameError).toBe("invalid_name"); expect(touched).toBe(0); expect(io.describeSkill).not.toHaveBeenCalled()
  })
  it.each(["listing", "receipts"] as const)("preserves the other good read when %s rejects", async failing => {
    const io = reads()
    if (failing === "listing") io.describeSkill.mockRejectedValue(new Error("PRIVATE provider"))
    else io.listingReceipts.mockRejectedValue(new Error("PRIVATE provider"))
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
    expect(data.listing === null).toBe(failing === "listing"); expect(data.receipts === null).toBe(failing === "receipts")
    expect(data.listingError).toBe(failing === "listing" ? "listing_unavailable" : null)
    expect(data.receiptsError).toBe(failing === "receipts" ? "receipts_unavailable" : null)
    expect(JSON.stringify(data)).not.toContain("PRIVATE")
  })
  it("contains synchronous reader faults independently", async () => {
    const io = reads(); io.describeSkill.mockImplementation(() => { throw new Error("PRIVATE sync") })
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
    expect(data.listingError).toBe("listing_unavailable"); expect(data.receipts).toHaveLength(1)
  })
  it("distinguishes empty receipts and absent/null history from failure", async () => {
    const io = reads(), l = listing(); delete (l as { payTestHistory?: unknown }).payTestHistory
    io.describeSkill.mockResolvedValue({ ...l, payTested: null }); io.listingReceipts.mockResolvedValue([])
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
    expect(data.receipts).toEqual([]); expect(data.receiptsError).toBeNull()
    expect(data.listing?.payTested).toBeNull(); expect(data.listing).not.toHaveProperty("payTestHistory")
  })
  it("resolves ENS once then binds seller case-insensitively and skill exactly", async () => {
    const io = reads(); io.describeSkill.mockResolvedValue({ ...listing(), seller: seller.toUpperCase().replace("0X", "0x") })
    const data = await loadSkillPage({ name: ens }, io, () => stamp)
    expect(io.resolveName).toHaveBeenCalledExactlyOnceWith(ens); expect(data.resolvedName).toBe(ens)
    expect(data.nameError).toBeNull(); expect(data.listing?.id).toBe("diff-triage")
    expect(io.describeSkill).toHaveBeenCalledExactlyOnceWith("diff-triage")
  })
  it.each([new EnsNameExpired(), new Error("PRIVATE resolver"), { _tag: "EnsNameExpired", message: "PRIVATE spoof" }])("contains resolver refusal %j", async error => {
    const io = reads(); io.resolveName.mockRejectedValue(error)
    const data = await loadSkillPage({ name: ens }, io, () => stamp)
    expect(data.nameError).toBe(error instanceof EnsNameExpired ? "name_expired" : "name_unavailable")
    expect(data.resolvedName).toBeNull(); expect(io.describeSkill).not.toHaveBeenCalled(); expect(io.listingReceipts).not.toHaveBeenCalled()
    expect(JSON.stringify(data)).not.toContain("PRIVATE")
  })
  it("rejects malformed resolver identity before follow-on reads", async () => {
    const io = reads(); io.resolveName.mockResolvedValue({ ...resolved(), skillId: "../private" })
    const data = await loadSkillPage({ name: ens }, io, () => stamp)
    expect(data.nameError).toBe("name_unavailable"); expect(io.describeSkill).not.toHaveBeenCalled()
  })
  it("suppresses mismatched ENS detail without discarding independent public receipts", async () => {
    const io = reads(); io.describeSkill.mockResolvedValue({ ...listing(), seller: `0x${"2".repeat(40)}` })
    const data = await loadSkillPage({ name: ens }, io, () => stamp)
    expect(data.nameError).toBe("name_mismatch"); expect(data.resolvedName).toBeNull(); expect(data.listing).toBeNull()
    expect(data.receipts).toHaveLength(1)
  })
  it("reports an ENS detail skill mismatch as identity mismatch, not an outage", async () => {
    const io = reads(); io.describeSkill.mockResolvedValue({ ...listing(), id: "other-skill" })
    const data = await loadSkillPage({ name: ens }, io, () => stamp)
    expect(data.nameError).toBe("name_mismatch"); expect(data.listingError).toBeNull()
    expect(data.listing).toBeNull(); expect(data.resolvedName).toBeNull(); expect(data.receipts).toHaveLength(1)
  })
  it("does not label an unresolved detail as a verified ENS page", async () => {
    const io = reads(); io.describeSkill.mockRejectedValue(new Error("PRIVATE"))
    const data = await loadSkillPage({ name: ens }, io, () => stamp)
    expect(data.resolvedName).toBeNull(); expect(data.listingError).toBe("listing_unavailable"); expect(data.receipts).toHaveLength(1)
  })
  it("projects every serialized boundary and keeps validated flattened identity evidence", async () => {
    const io = reads(), l = Object.assign(listing(), { buyer: "PRIVATE", token: "PRIVATE", graph: { hidden: "PRIVATE" },
      agentId: "42", agentVerified: true, validationPasses: 0, validationsRead: 0, settlementFeedback: 0, evidenceStale: false,
      registrationTx: hash, registrationUri: "/listings/diff-triage/agent-registration.json", splitterVersion: 2 as const })
    Object.assign(l.bounds!, { privateFuture: "PRIVATE" }); Object.assign(l.stats!, { secret: "PRIVATE" })
    Object.assign(l.payTested!, { reason: "PRIVATE" }); Object.assign(l.payTestHistory![0]!, { token: "PRIVATE" })
    const rs = receipts(); Object.assign(rs[0]!, { buyer: "PRIVATE", jobId, sessionId: "PRIVATE", nonce: "PRIVATE", future: "PRIVATE" })
    Object.assign(rs[0]!.children[0]!, { jobId, buyer: "PRIVATE", token: "PRIVATE" })
    Object.defineProperty(l, "futureGetter", { enumerable: true, get() { throw Error("PRIVATE accessor") } })
    io.describeSkill.mockResolvedValue(l); io.listingReceipts.mockResolvedValue(rs)
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp), serialized = JSON.stringify(data)
    expect(serialized).not.toContain("PRIVATE"); expect(serialized).not.toContain(jobId)
    expect(data.listing?.payTested?.jobId).toBe(""); expect(data.listing?.payTestHistory?.[0]?.jobId).toBe("")
    expect(data.listing).toMatchObject({ agentId: "42", agentVerified: true, validationPasses: 0, validationsRead: 0, settlementFeedback: 0,
      evidenceStale: false, registrationTx: hash, registrationUri: "/listings/diff-triage/agent-registration.json", splitterVersion: 2 })
    expect(data.receipts?.[0]?.children).toHaveLength(1)
  })
  it("does not turn inherited reference metadata into legacy onchain eligibility", async () => {
    const io = reads(), rs = receipts(); io.listingReceipts.mockResolvedValue(rs)
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "settleRefKind")
    try {
      Object.defineProperty(Object.prototype, "settleRefKind", { value: "gateway-transfer", configurable: true })
      const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
      expect(Object.getOwnPropertyDescriptor(data.receipts?.[0] ?? {}, "settleRefKind")?.value).toBe("unrecognized")
      expect(data.receipts?.[0]?.explorer).toBeNull()
    } finally {
      if (previous === undefined) Reflect.deleteProperty(Object.prototype, "settleRefKind")
      else Object.defineProperty(Object.prototype, "settleRefKind", previous)
    }
  })
  it.each([
    { agentId: "42", agentVerified: true, evidenceStale: false, validationPasses: 2, validationsRead: 1, settlementFeedback: 3 },
    { agentVerified: true, evidenceStale: false, validationPasses: 1, validationsRead: 1, settlementFeedback: 3 },
    { agentId: "42", agentVerified: false, evidenceStale: false, validationPasses: 1, validationsRead: 1, settlementFeedback: 3 },
    { agentId: "42", agentVerified: true, evidenceStale: true, validationPasses: 1, validationsRead: 1, settlementFeedback: 3 },
    { agentId: "42", agentVerified: true, evidenceStale: false, validationPasses: 1, settlementFeedback: 3 },
    { agentId: "42", agentVerified: true, evidenceStale: false, validationPasses: 21, validationsRead: 21, settlementFeedback: 3 }
  ])("omits unsupported identity counters while preserving qualified metadata: %j", async fields => {
    const io = reads(); io.describeSkill.mockResolvedValue({ ...listing(), ...fields })
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
    expect(data.listing).not.toBeNull()
    expect(data.listing).not.toHaveProperty("validationPasses"); expect(data.listing).not.toHaveProperty("validationsRead")
    expect(data.listing).not.toHaveProperty("settlementFeedback")
    expect(data.listing?.agentVerified).toBe(fields.agentVerified); expect(data.listing?.evidenceStale).toBe(fields.evidenceStale)
  })
  it("copies safe schema JSON and does not keep caller aliases", async () => {
    const io = reads(), l = listing(), schema = { type: "object", properties: { note: { description: "<script>synthetic</script>" } } }
    io.describeSkill.mockResolvedValue({ ...l, inputSchema: schema })
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
    schema.properties.note.description = "changed"
    expect(JSON.stringify(data.listing?.inputSchema)).toContain("<script>synthetic</script>")
    expect(data.listing?.bounds).not.toBe(l.bounds); expect(data.receipts).not.toBe(await io.listingReceipts.mock.results[0]!.value)
  })
  it.each(["getter", "toJSON", "cycle", "depth", "huge"] as const)("refuses unsafe schema %s without losing receipts", async kind => {
    let touched = 0
    const schema: Record<string, unknown> = { type: "object" }
    if (kind === "getter") Object.defineProperty(schema, "properties", { enumerable: true, get() { touched++; return {} } })
    if (kind === "toJSON") schema.toJSON = () => { touched++; return "PRIVATE" }
    if (kind === "cycle") schema.self = schema
    if (kind === "depth") { let node = schema; for (let n = 0; n < 18; n++) { const next = {}; node.child = next; node = next } }
    if (kind === "huge") schema.description = "x".repeat(131073)
    const io = reads(); io.describeSkill.mockResolvedValue({ ...listing(), inputSchema: schema })
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
    expect(data.listingError).toBe("listing_unavailable"); expect(data.receipts).toHaveLength(1); expect(touched).toBe(0)
  })
  it("keeps invalid known-field accessors inert", async () => {
    let touched = 0
    const l = listing(); Object.defineProperty(l, "seller", { get() { touched++; return seller } })
    const io = reads(); io.describeSkill.mockResolvedValue(l)
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
    expect(data.listingError).toBe("listing_unavailable"); expect(touched).toBe(0)
  })
  it("refuses excess receipts and mismatched skill rows independently", async () => {
    const io = reads(); io.listingReceipts.mockResolvedValue(Array.from({ length: 21 }, () => receipts()[0]!))
    expect((await loadSkillPage({ name: "diff-triage" }, io, () => stamp)).receiptsError).toBe("receipts_unavailable")
    io.listingReceipts.mockResolvedValue([{ ...receipts()[0]!, skillId: "other-skill" }])
    const data = await loadSkillPage({ name: "diff-triage" }, io, () => stamp)
    expect(data.receiptsError).toBe("receipts_unavailable"); expect(data.listing).not.toBeNull()
  })
  it("does not invent a clock value when the supplied clock fails", async () => {
    const io = reads()
    await expect(loadSkillPage({ name: "diff-triage" }, io, () => NaN)).rejects.toThrow("Skill page observation unavailable")
  })
})
