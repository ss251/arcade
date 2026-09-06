import { describe, expect, it } from "vitest"
import { capturePurchaseContext } from "../src/lib/purchase-context.ts"
import { captureStoredJob } from "../src/lib/job-store.ts"
import chain from "../../../config/chains/arc-testnet.json"

const SELLER = `0x${"1".repeat(40)}`, PAYEE = `0x${"2".repeat(40)}`, ORIGIN = "https://hub.example"
const RESOURCE = `/x/${SELLER}/diff-triage`
const requirements = () => ({ scheme: "exact", network: chain.caip2, amount: "10000", asset: chain.usdc.address,
  payTo: PAYEE, resource: ORIGIN + RESOURCE, maxTimeoutSeconds: 604900,
  extra: { name: chain.usdc.eip712Name, version: chain.usdc.eip712Version } })
const context = () => ({ hubOrigin: ORIGIN, skillId: "diff-triage", seller: SELLER, resource: RESOURCE,
  amountAtomic: "10000", payTo: PAYEE, asset: chain.usdc.address, network: chain.caip2, rail: "eip3009",
  requirements: requirements(), ensName: "diff-triage.seller.arcade.eth" })

describe("passive public browser purchase context", () => {
  it("preserves original complete requirements as a separate deeply immutable snapshot", () => {
    const input = context(), captured = capturePurchaseContext(input)!
    expect(captured).toEqual(input)
    expect(captured.requirements).not.toBe(input.requirements)
    expect(Object.isFrozen(captured)).toBe(true)
    expect(Object.isFrozen(captured.requirements)).toBe(true)
    expect(Object.isFrozen(captured.requirements.extra)).toBe(true)
    input.requirements.extra.name = "changed"
    expect(captured.requirements.extra).toEqual({ name: "USDC", version: "2" })
  })
  it.each(["test", "eip3009"])("keeps the actual %s rail, never inferred from a USDC domain", rail => {
    expect(capturePurchaseContext({ ...context(), rail })?.rail).toBe(rail)
  })
  it("requires exact Gateway Wallet domain without changing the original casing", () => {
    const input = context()
    const gateway = { ...input, rail: "gateway", requirements: { ...input.requirements,
      extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway.wallet } } }
    expect(capturePurchaseContext(gateway)).toEqual(gateway)
    expect(capturePurchaseContext({ ...gateway, rail: "eip3009" })).toBeUndefined()
    expect(capturePurchaseContext({ ...gateway, requirements: { ...gateway.requirements, maxTimeoutSeconds: 60 } })).toBeUndefined()
    expect(capturePurchaseContext({ ...gateway, requirements: { ...gateway.requirements,
      extra: { ...gateway.requirements.extra, verifyingContract: PAYEE } } })).toBeUndefined()
  })
  it("preserves optional canonical splitter routing fields, not arbitrary extras", () => {
    const input = context(), extra = { ...input.requirements.extra, feeSplitter: PAYEE, feeSplitterVersion: 2 }
    expect(capturePurchaseContext({ ...input, requirements: { ...input.requirements, extra } })?.requirements.extra).toEqual(extra)
    expect(capturePurchaseContext({ ...input, requirements: { ...input.requirements,
      extra: { ...extra, feeSplitter: SELLER } } })).toBeUndefined()
  })
  it.each([undefined, null, "", "gateway-batch", "unknown"])("does not accept missing/unknown rail %j", rail => {
    expect(capturePurchaseContext({ ...context(), rail })).toBeUndefined()
  })
  it.each(["http://localhost:8787", "https://hub.example/", "https://u:p@hub.example", "https://hub.example?x=1",
    "https://hub.example#x", "https://HUB.example", "http://192.168.1.1", "https://hub.example:443"])("refuses noncanonical issuer %s", hubOrigin => {
    expect(capturePurchaseContext({ ...context(), hubOrigin })).toBeUndefined()
  })
  it.each(["http://127.0.0.1:1234", "http://[::1]:1234"])("accepts exact isolated-development origin %s", hubOrigin => {
    const v = context()
    expect(capturePurchaseContext({ ...v, hubOrigin, requirements: { ...v.requirements, resource: hubOrigin + RESOURCE } })?.hubOrigin).toBe(hubOrigin)
  })
  it.each([
    { skillId: "another-skill" }, { seller: PAYEE }, { resource: `${RESOURCE}?token=secret` }, { resource: `//hub.example${RESOURCE}` },
    { amountAtomic: "010000" }, { amountAtomic: "0" }, { amountAtomic: (1n << 256n).toString() },
    { network: "eip155:1" }, { payTo: SELLER }, { asset: PAYEE }, { ensName: "invalid..eth" },
    { token: "a".repeat(32) }, { sessionId: `ses_${"b".repeat(32)}` }
  ])("refuses changed coordinates or unknown public-context fields %j", mutation => {
    expect(capturePurchaseContext({ ...context(), ...mutation })).toBeUndefined()
  })
  it.each([
    { amount: "1" }, { maxTimeoutSeconds: 604901 }, { maxTimeoutSeconds: 1.5 }, { resource: "https://other.example/x" },
    { signature: "secret" }, { extra: { name: "USDC", version: "2", token: "secret" } },
    { extra: { name: "USDC", version: "wrong" } }, { extra: { feeSplitterVersion: 3 } }
  ])("refuses unsupported requirements rather than silently stripping %j", mutation => {
    expect(capturePurchaseContext({ ...context(), requirements: { ...requirements(), ...mutation } })).toBeUndefined()
  })
  it("never executes accessors, toJSON, inherited fields or revoked input", () => {
    let invoked = 0
    const getter = { ...context(), get rail() { invoked++; throw Error("private") } }
    const hooked = { ...requirements(), toJSON() { invoked++; return {} } }
    const proxy = Proxy.revocable({}, {}); proxy.revoke()
    for (const v of [getter, { ...context(), requirements: hooked }, Object.create(context()), proxy.proxy]) {
      expect(() => capturePurchaseContext(v)).not.toThrow()
      expect(capturePurchaseContext(v)).toBeUndefined()
    }
    expect(invoked).toBe(0)
  })
  it("bounds all text before encoding and accepts exact known description limit", () => {
    const v = context()
    expect(capturePurchaseContext({ ...v, requirements: { ...v.requirements, description: "x".repeat(2048) } })).toBeDefined()
    expect(capturePurchaseContext({ ...v, requirements: { ...v.requirements, description: "x".repeat(2049) } })).toBeUndefined()
    expect(capturePurchaseContext({ ...v, requirements: { ...v.requirements, description: "\ud800" } })).toBeUndefined()
  })
  it("exports the exact H9 row capture without touching browser storage", () => {
    const row = { jobId: `job_${"a".repeat(16)}`, token: "b".repeat(32), skillId: "diff-triage", priceAtomic: "10000",
      createdAtMs: 0, hubOrigin: ORIGIN, realm: "ordinary" }
    expect(captureStoredJob(row)).toEqual(row)
    expect(captureStoredJob(row)).not.toBe(row)
    expect(captureStoredJob({ ...row, realm: "session" })).toBeUndefined()
  })
})
