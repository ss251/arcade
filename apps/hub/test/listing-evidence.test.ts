import { describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { Bounds, PublicListing, loadChainConfig } from "@arcade/core"
import { noopErc8004, type AgentEvidence, type Erc8004 } from "../src/erc8004.ts"
import { listingEvidence } from "../src/listing-evidence.ts"
import type { ListingRecord } from "../src/store.ts"

const chain = loadChainConfig("arc-testnet"), seller = `0x${"1".repeat(40)}`
const rec: ListingRecord = { listing: PublicListing.make({ id: "evidence", version: "1.0.0", serviceName: "E", description: "D",
  tags: [], price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }), inputSchema: {}, outputSchema: {} }),
  seller, runnerId: "rnr_evidence", publishedAtMs: 0, agentId: "42", agentVerified: true, registrationTx: `0x${"a".repeat(64)}` }
const evidence: AgentEvidence = { validationPasses: 7, validationsRead: 8, settlementFeedback: 5, stale: false }
const setup = (over: Partial<Erc8004> = {}) => {
  const ownerOf = vi.fn(() => Effect.succeed(seller)), evidenceFor = vi.fn(() => Effect.succeed(evidence))
  return { ownerOf, evidenceFor, service: { ...noopErc8004("off"), armed: true, registries: chain.erc8004!,
    ownerOf, evidenceFor, ...over } }
}
const run = Effect.runPromise
describe("current listing ownership and bounded settlement evidence", () => {
  it("confirms current ownership and projects only measured public evidence", async () => {
    const { service, ownerOf, evidenceFor } = setup()
    expect(await run(listingEvidence(rec, service, chain, "eip3009"))).toEqual({ agentId: "42", registrationTx: rec.registrationTx,
      verified: true, chain: chain.caip2, registry: chain.erc8004!.identity, ...evidence })
    expect(ownerOf).toHaveBeenCalledWith("42"); expect(evidenceFor).toHaveBeenCalledWith("42")
  })
  it("rechecks ownership after a transfer and never exposes cached counts for the previous seller", async () => {
    const { service, evidenceFor } = setup({ ownerOf: () => Effect.succeed(`0x${"9".repeat(40)}`) })
    expect(await run(listingEvidence(rec, service, chain, "eip3009"))).toMatchObject({ verified: false, stale: true })
    expect(evidenceFor).not.toHaveBeenCalled()
  })
  it("can verify a previously unreadable claim with a fresh successful owner lookup", async () => {
    expect(await run(listingEvidence({ ...rec, agentVerified: false }, setup().service, chain, "eip3009"))).toMatchObject({ verified: true, stale: false })
  })
  it.each(["test", "disabled", "wrong-registry"])("does no RPC for unavailable contexts: %s", async mode => {
    const { service, ownerOf, evidenceFor } = setup(mode === "disabled" ? { armed: false } : mode === "wrong-registry" ? {
      registries: { ...chain.erc8004!, identity: seller } } : {})
    const out = await run(listingEvidence(rec, service, chain, mode === "test" ? "test" : "eip3009"))
    expect(out).toMatchObject({ verified: false, stale: true }); expect(out).not.toHaveProperty("validationPasses")
    expect(ownerOf).not.toHaveBeenCalled(); expect(evidenceFor).not.toHaveBeenCalled()
  })
  it("omits absent/invalid identities and unsupported registries without RPC", async () => {
    const { service, ownerOf } = setup()
    for (const agentId of [undefined, "-1", "01", "1e3", (2n ** 256n).toString()]) {
      expect(await run(listingEvidence({ ...rec, agentId }, service, chain, "eip3009"))).toBeUndefined()
    }
    const { erc8004: _registry, ...unsupported } = chain
    expect(await run(listingEvidence(rec, service, unsupported, "eip3009"))).toBeUndefined()
    expect(ownerOf).not.toHaveBeenCalled()
  })
  it.each([{ ...evidence, stale: true }, { ...evidence, validationPasses: 9 }, { ...evidence, validationsRead: 21 },
    { ...evidence, settlementFeedback: 4097 }, { ...evidence, validationPasses: -1 }, { ...evidence, validationsRead: 1.5 }])(
    "withholds unavailable or malformed counts: %j", async measured => {
      const out = await run(listingEvidence(rec, setup({ evidenceFor: () => Effect.succeed(measured) }).service, chain, "eip3009"))
      expect(out).toMatchObject({ verified: true, stale: true }); expect(out).not.toHaveProperty("validationPasses")
      expect(out).not.toHaveProperty("validationsRead"); expect(out).not.toHaveProperty("settlementFeedback")
    })
  it.each(["owner", "evidence"])("contains private read defects: %s", async op => {
    const service = setup(op === "owner" ? { ownerOf: () => { throw new Error("PRIVATE") } } : {
      evidenceFor: () => Effect.die("PRIVATE") }).service
    const out = await run(listingEvidence(rec, service, chain, "eip3009"))
    expect(out).toMatchObject({ verified: op !== "owner", stale: true }); expect(JSON.stringify(out)).not.toContain("PRIVATE")
  })
  it("bounds a stalled owner read and preserves cancellation", async () => {
    vi.useFakeTimers()
    try {
      const pending = run(listingEvidence(rec, setup({ ownerOf: () => Effect.never }).service, chain, "eip3009"))
      await vi.advanceTimersByTimeAsync(5001)
      expect(await pending).toMatchObject({ verified: false, stale: true })
    } finally { vi.useRealTimers() }
    expect((await run(Effect.exit(listingEvidence(rec, setup({ ownerOf: () => Effect.interrupt }).service, chain, "eip3009"))))._tag).toBe("Failure")
  })
})
