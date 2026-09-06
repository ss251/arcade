import { afterEach, describe, expect, it, vi } from "vitest"
import chain from "../../../config/chains/arc-testnet.json"
import { decodePurchaseOutcome } from "../src/lib/purchase-outcome.ts"

const BUYER = `0x${"1".repeat(40)}`, SELLER = `0x${"3".repeat(40)}`
const ID = `job_${"a".repeat(32)}`, TOKEN = "b".repeat(32), NONCE = `0x${"4".repeat(64)}`
const HASH = `0x${"5".repeat(64)}`, UUID = "12345678-1234-4234-8234-123456789abc"
const resource = `/x/${SELLER}/diff-triage`
const expected = (rail = "eip3009") => ({
  row: { jobId: ID, token: TOKEN, skillId: "diff-triage", priceAtomic: "10000", createdAtMs: 10,
    hubOrigin: "https://hub.example", realm: "ordinary" },
  context: { hubOrigin: "https://hub.example", skillId: "diff-triage", seller: SELLER, resource,
    amountAtomic: "10000", payTo: SELLER, asset: chain.usdc.address, network: chain.caip2, rail,
    requirements: { scheme: "exact", network: chain.caip2, amount: "10000", asset: chain.usdc.address,
      payTo: SELLER, resource: "https://hub.example" + resource, maxTimeoutSeconds: 604900,
      extra: rail === "gateway" ? { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway.wallet } : { name: "USDC", version: "2" } } },
  buyer: BUYER, nonce: NONCE
})
const body = (rail = "eip3009") => ({ job_id: ID, status: "succeeded", result: { report: "owned result", n: 1 },
  receipt: { jobId: ID, skillId: "diff-triage", skillVersion: "1.0.0", buyer: BUYER, seller: SELLER,
    priceAtomic: "10000", sellerAtomic: "9500", feeAtomic: "500", feeBps: 500, rail, network: chain.caip2,
    settled: true, settleTx: rail === "gateway" ? UUID : HASH, authorizationNonce: NONCE,
    latencyMs: 20, createdAtMs: 9, reason: "ok", explorer: "https://evil.example" } })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe("correlated browser-only purchase outcome", () => {
  it.each(["eip3009", "gateway"])("projects only hub-reported %s evidence with true absent-kind compatibility", rail => {
    const result = decodePurchaseOutcome(body(rail), expected(rail))!
    expect(result).toMatchObject({ settled: true, jobId: ID, skillId: "diff-triage", buyer: BUYER,
      seller: SELLER, priceAtomic: "10000", rail, network: chain.caip2, source: "hub",
      reference: rail === "gateway" ? UUID : HASH, referenceKind: rail === "gateway" ? "gateway-transfer" : "onchain",
      explorer: rail === "gateway" ? null : chain.explorerBaseUrl + "/tx/" + HASH,
      resultJson: '{"n":1,"report":"owned result"}' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(JSON.stringify(result)).not.toContain(NONCE)
    expect(JSON.stringify(result)).not.toContain("evil.example")
  })
  it.each([
    { jobId: `job_${"c".repeat(32)}` }, { skillId: "other-skill" }, { buyer: SELLER }, { seller: BUYER },
    { priceAtomic: "10001" }, { rail: "gateway" }, { network: "eip155:1" }, { authorizationNonce: HASH },
    { sellerAtomic: "9499" }, { feeAtomic: "501" }, { feeBps: 10001 }, { feeBps: 501 },
    { latencyMs: -1 }, { createdAtMs: Infinity }, { skillVersion: "" }
  ])("refuses a mismatched or malformed receipt %j", mutation => {
    const v = body()
    expect(decodePurchaseOutcome({ ...v, receipt: { ...v.receipt, ...mutation } }, expected())).toBeUndefined()
  })
  it.each(["gateway-transfer", "gateway-batch", "test", "unknown", null, undefined])("does not treat malformed/present EIP kind %s as absence", settleRefKind => {
    const v = body()
    expect(decodePurchaseOutcome({ ...v, receipt: { ...v.receipt, settleRefKind } }, expected())).toBeUndefined()
  })
  it("accepts explicit consistent kinds and rejects a Gateway hash masquerading as a transfer", () => {
    for (const rail of ["eip3009", "gateway"]) {
      const v = body(rail)
      expect(decodePurchaseOutcome({ ...v, receipt: { ...v.receipt, settleRefKind: rail === "gateway" ? "gateway-transfer" : "onchain" } }, expected(rail))).toBeDefined()
    }
    const v = body("gateway")
    expect(decodePurchaseOutcome({ ...v, receipt: { ...v.receipt, settleTx: HASH } }, expected("gateway"))).toBeUndefined()
  })
  it.each(["", `0x${"0".repeat(64)}`, HASH + "\n", UUID])("rejects invalid EIP reference %s", settleTx => {
    const v = body()
    expect(decodePurchaseOutcome({ ...v, receipt: { ...v.receipt, settleTx } }, expected())).toBeUndefined()
  })
  it.each(["failed", "queued", "running", "unknown"])("does not release a settled result for status %s", status => {
    expect(decodePurchaseOutcome({ ...body(), status }, expected())).toBeUndefined()
  })
  it.each(["succeeded", "failed", "timeout", "refused"])("projects a reported nonsettlement %s without output or no-charge claims", status => {
    const v = body(), { settleTx: ignored, ...receipt } = v.receipt
    const result = decodePurchaseOutcome({ ...v, status, detail: TOKEN, receipt: { ...receipt, settled: false, reason: TOKEN } }, expected())!
    expect(result).toMatchObject({ settled: false, source: "hub", resultJson: null, reference: null, referenceKind: null, explorer: null })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(JSON.stringify(result)).not.toContain("owned result")
    expect(JSON.stringify(result)).not.toContain("not charged")
  })
  it("refuses contradictory nonsettlement reference and uncorrelated pending responses", () => {
    const v = body()
    expect(decodePurchaseOutcome({ ...v, receipt: { ...v.receipt, settled: false } }, expected())).toBeUndefined()
    expect(decodePurchaseOutcome({ job_id: ID, status: "pending" }, expected())).toBeUndefined()
    expect(decodePurchaseOutcome({ ...v, job_id: `job_${"d".repeat(32)}` }, expected())).toBeUndefined()
  })
  it.each([null, "", " ", [], {}].map(result => ({ result })))("refuses a settled but empty result $result", ({ result }) => {
    expect(decodePurchaseOutcome({ ...body(), result }, expected())).toBeUndefined()
  })
  it("snapshots bounded own JSON output without getters, cycles, hooks or capability echo", () => {
    const getter = vi.fn(() => TOKEN), cycle: Record<string, unknown> = {}; cycle.self = cycle
    const values = [Object.defineProperty({}, "value", { enumerable: true, get: getter }), cycle,
      { secret: TOKEN }, { report: "x".repeat(131072) }, { toJSON: () => ({}) }]
    for (const result of values) expect(decodePurchaseOutcome({ ...body(), result }, expected())).toBeUndefined()
    expect(getter).not.toHaveBeenCalled()
    const v = body(), captured = decodePurchaseOutcome(v, expected())!
    v.result.report = "later mutation"
    expect(captured.resultJson).toContain("owned result")
  })
  it("rejects invalid expected authority and receipt accessors without throwing or reading them", () => {
    const getter = vi.fn(() => { throw Error(TOKEN) })
    const v = body()
    Object.defineProperty(v.receipt, "buyer", { enumerable: true, get: getter })
    expect(decodePurchaseOutcome(v, expected())).toBeUndefined()
    const e = expected()
    expect(decodePurchaseOutcome(body(), { ...e, buyer: "bad" })).toBeUndefined()
    expect(decodePurchaseOutcome(body(), { ...e, row: { ...e.row, hubOrigin: "https://other.example" } })).toBeUndefined()
    const proxy = Proxy.revocable({}, {}); proxy.revoke()
    expect(decodePurchaseOutcome(proxy.proxy, expected())).toBeUndefined()
    expect(getter).not.toHaveBeenCalled()
  })
})
