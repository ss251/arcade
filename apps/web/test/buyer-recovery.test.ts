import { afterEach, describe, expect, it, vi } from "vitest"
import { createBuyerRecovery, decodeRecoveredResult } from "../src/lib/buyer-recovery.ts"

const ID = `job_${"a".repeat(32)}`, TOKEN = "b".repeat(32), HASH = `0x${"c".repeat(64)}`
const row = () => ({ jobId: ID, token: TOKEN, skillId: "diff-triage", priceAtomic: "10000", createdAtMs: 10,
  hubOrigin: "https://hub.example", realm: "ordinary" as const })
const terminal = () => ({ status: 200, body: { job_id: ID, status: "succeeded", result: { report: "full result" },
  receipt: { jobId: ID, skillId: "diff-triage", priceAtomic: "10000", sellerAtomic: "9500", feeAtomic: "500", feeBps: 500,
    settled: true, rail: "eip3009", network: "eip155:5042002", settleTx: HASH, settleRefKind: "onchain" } } })
const tree = () => ({ rootJobId: ID, complete: false, evidenceFlags: ["commitment-missing"], nodes: [
  { nodeId: "0", parentNodeId: null, skillId: "diff-triage", priceAtomic: "10000", price: "$0.01", settled: false,
    reason: "runner_lost", latencyMs: 1, hop: 0, explorer: null }
] })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe("historical recovery projection", () => {
  it("matches saved metadata without inventing original signature provenance", () => {
    const result = decodeRecoveredResult(terminal(), row())
    expect(result).toMatchObject({ state: "settled", source: "issuing-hub", correlation: "saved-row",
      priceAtomic: "10000", resultJson: '{"report":"full result"}', reference: HASH })
    expect(JSON.stringify(result)).not.toMatch(/buyer|nonce|token/)
  })
  it.each(["jobId", "skillId", "priceAtomic", "feeAtomic", "sellerAtomic", "feeBps", "rail", "settleRefKind"])("refuses mismatched receipt %s", field => {
    const raw = terminal(); Object.assign(raw.body.receipt, { [field]: "wrong" })
    expect(decodeRecoveredResult(raw, row())).toEqual({ state: "unavailable" })
  })
  it("requires matching pending identity and never displays its payload", () => {
    expect(decodeRecoveredResult({ status: 202, body: { job_id: ID, status: "pending", result: TOKEN } }, row())).toEqual({ state: "pending" })
    expect(decodeRecoveredResult({ status: 202, body: { job_id: "wrong", status: "pending" } }, row())).toEqual({ state: "unavailable" })
    expect(decodeRecoveredResult({ status: 500, body: terminal().body }, row())).toEqual({ state: "unavailable" })
  })
  it("discards unpaid output and diagnostic claims without saying refunded or no charge", () => {
    const raw = terminal(); raw.body.status = "runner_lost"; raw.body.receipt.settled = false
    Reflect.deleteProperty(raw.body.receipt, "settleTx"); Reflect.deleteProperty(raw.body.receipt, "settleRefKind")
    raw.body.result.report = TOKEN
    expect(decodeRecoveredResult(raw, row())).toMatchObject({ state: "not_settled", resultJson: null, reference: null })
    expect(JSON.stringify(decodeRecoveredResult(raw, row()))).not.toContain(TOKEN)
  })
  it("qualifies Gateway UUIDs without creating transaction links", () => {
    const raw = terminal(); Object.assign(raw.body.receipt, { rail: "gateway", settleRefKind: "gateway-transfer",
      settleTx: "12345678-1234-4234-8234-123456789abc" })
    expect(decodeRecoveredResult(raw, row())).toMatchObject({ state: "settled", referenceKind: "gateway-transfer", explorer: null })
  })
  it.each([TOKEN, TOKEN.toUpperCase(), "", " "])("withholds token echoes and empty output", report => {
    const raw = terminal(); raw.body.result = report as never
    expect(decodeRecoveredResult(raw, row())).toEqual({ state: "unavailable" })
  })
  it("rejects getters, oversized JSON and contradictory terminal status", () => {
    const getter = vi.fn(() => TOKEN), raw = terminal()
    Object.defineProperty(raw.body, "receipt", { enumerable: true, get: getter })
    expect(decodeRecoveredResult(raw, row())).toEqual({ state: "unavailable" }); expect(getter).not.toHaveBeenCalled()
    const large = terminal(); large.body.result.report = "x".repeat(131072)
    expect(decodeRecoveredResult(large, row())).toEqual({ state: "unavailable" })
    const failed = terminal(); failed.body.status = "failed"
    expect(decodeRecoveredResult(failed, row())).toEqual({ state: "unavailable" })
  })
  it.each([
    { status: "running" }, { job_id: "wrong" }, { result: null }, { result: {} }, { result: [] }
  ])("refuses incomplete or uncorrelated result $status", changed => {
    const raw = terminal(); Object.assign(raw.body, changed)
    expect(decodeRecoveredResult(raw, row())).toEqual({ state: "unavailable" })
  })
  it.each([
    { feeBps: 501 }, { feeBps: 0.5 }, { feeBps: -1 }, { network: "javascript:alert(1)" },
    { settled: false }, { rail: "test" }, { settleRefKind: null }, { settleTx: `0x${"0".repeat(64)}` }
  ])("refuses malformed accounting, reference and rail context", changed => {
    const raw = terminal(); Object.assign(raw.body.receipt, changed)
    expect(decodeRecoveredResult(raw, row())).toEqual({ state: "unavailable" })
  })
  it("never trusts a supplied explorer and preserves full untrusted output as JSON text", () => {
    const raw = terminal(); Object.assign(raw.body.receipt, { explorer: `https://evil.example/?token=${TOKEN}` })
    raw.body.result.report = '<script>alert("seller")</script>'
    const result = decodeRecoveredResult(raw, row())
    expect(result).toMatchObject({ state: "settled", resultJson: JSON.stringify(raw.body.result) })
    expect(JSON.stringify(result)).not.toContain("evil.example")
  })
})

describe("private buyer selection owner", () => {
  it("construction/selection are passive; one explicit default read uses only the issuing hub header", async () => {
    const fetcher = vi.fn(async () => Response.json(terminal().body)); vi.stubGlobal("fetch", fetcher)
    const updates: unknown[] = [], owner = createBuyerRecovery(view => updates.push(view))
    owner.select(row()); expect(fetcher).not.toHaveBeenCalled()
    await owner.read("result")
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit]
    expect(url).toBe(`https://hub.example/jobs/${ID}/result`)
    expect(init).toMatchObject({ method: "GET", headers: { "x-job-token": TOKEN }, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" })
    expect(updates.at(-1)).toMatchObject({ selected: { jobId: ID }, result: { state: "settled" }, busy: null })
    expect(JSON.stringify(updates)).not.toContain(TOKEN)
    owner.close()
  })
  it("captures selection, refuses simultaneous reads and ignores late obsolete responses", async () => {
    let release!: (r: Response) => void, signal: AbortSignal | undefined
    const fetcher = vi.fn((_url: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise<Response>(r => { release = r }) })
    vi.stubGlobal("fetch", fetcher)
    const updates: unknown[] = [], owner = createBuyerRecovery(view => updates.push(view)), input = row()
    owner.select(input); input.hubOrigin = "https://changed.example"
    const pending = owner.read("result"); await owner.read("tree"); expect(fetcher).toHaveBeenCalledTimes(1)
    owner.select({ ...row(), hubOrigin: "https://other.example" }); expect(signal?.aborted).toBe(true)
    const before = JSON.stringify(updates); release(Response.json(terminal().body)); await pending
    expect(JSON.stringify(updates)).toBe(before)
    expect(updates.at(-1)).toMatchObject({ selected: { hubOrigin: "https://other.example" }, result: { state: "idle" }, tree: { state: "idle" } })
    owner.close()
  })
  it("close aborts, clears authority, suppresses late updates and cannot be reopened", async () => {
    let release!: (r: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(r => { release = r })); vi.stubGlobal("fetch", fetcher)
    const update = vi.fn(), owner = createBuyerRecovery(update)
    owner.select(row()); const pending = owner.read("result"); owner.close()
    const count = update.mock.calls.length
    release(Response.json(terminal().body)); await pending; owner.select(row()); await owner.read("result")
    expect(update).toHaveBeenCalledTimes(count); expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("handles invalid selection and fixed transport failures without retry", async () => {
    const fetcher = vi.fn(async () => { throw Error(TOKEN) }); vi.stubGlobal("fetch", fetcher)
    const update = vi.fn(), owner = createBuyerRecovery(update)
    owner.select({ ...row(), realm: "session" }); await owner.read("result"); expect(fetcher).not.toHaveBeenCalled()
    owner.select(row()); await owner.read("result")
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ result: { state: "unavailable" }, busy: null })
    expect(JSON.stringify(update.mock.calls)).not.toContain(TOKEN); expect(fetcher).toHaveBeenCalledTimes(1); owner.close()
  })
  it("uses the actual tree decoder and refuses root-price mismatch or token echo", async () => {
    const fetcher = vi.fn(async () => Response.json(tree())); vi.stubGlobal("fetch", fetcher)
    const update = vi.fn(), owner = createBuyerRecovery(update); owner.select(row()); await owner.read("tree")
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ tree: { state: "ready", view: { complete: false } } })
    for (const changed of [{ priceAtomic: "20000", price: "$0.02" }, { skillId: TOKEN }]) {
      const raw = tree(); Object.assign(raw.nodes[0]!, changed); fetcher.mockResolvedValueOnce(Response.json(raw)); await owner.read("tree")
      expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ tree: { state: "unavailable" } })
    }
    owner.close()
  })
  it("selection reentry during busy notification prevents dispatch", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher)
    const owner = createBuyerRecovery(view => { if (view.busy) owner.select(undefined) })
    owner.select(row()); await owner.read("result"); expect(fetcher).not.toHaveBeenCalled(); owner.close()
  })
  it("clears old evidence immediately on explicit refresh, without auto-polling pending", async () => {
    const fetcher = vi.fn(async () => Response.json(terminal().body)); vi.stubGlobal("fetch", fetcher)
    const update = vi.fn(), owner = createBuyerRecovery(update); owner.select(row()); await owner.read("result")
    fetcher.mockResolvedValueOnce(Response.json({ job_id: ID, status: "pending" }, { status: 202 }))
    const pending = owner.read("result")
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ result: { state: "idle" }, busy: "result" })
    await pending
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ result: { state: "pending" }, busy: null })
    expect(fetcher).toHaveBeenCalledTimes(2); owner.close()
  })
  it("withholds a stored token copied into otherwise displayable row metadata", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher)
    const update = vi.fn(), owner = createBuyerRecovery(update)
    owner.select({ ...row(), skillId: TOKEN }); await owner.read("result")
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ selected: null })
    expect(JSON.stringify(update.mock.calls)).not.toContain(TOKEN); expect(fetcher).not.toHaveBeenCalled(); owner.close()
  })
})
