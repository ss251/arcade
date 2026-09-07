import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { Bounds, PublicListing, hashJson } from "@arcade/core"
import { makeErc8183Rail, PaymentRequirements, type ChallengeInput, type Rail } from "@arcade/payments"
import { makeRails } from "../src/rails.ts"
import { challengeChoices } from "../src/challenge.ts"
import { prepareDiscoveryListings } from "../src/discovery.ts"
import { escrowListingChallenge } from "../src/escrow-listing.ts"
const addr = (digit: string) => `0x${digit.repeat(40)}`
const identity = { chainId: 5042002, escrow: addr("1"), implementation: addr("2"), hook: addr("3"), evaluator: addr("4"),
  treasury: addr("5"), token: "0x3600000000000000000000000000000000000000", proxyCodeHash: `0x${"6".repeat(64)}`,
  implementationCodeHash: `0x${"7".repeat(64)}`, hookCodeHash: `0x${"8".repeat(64)}` }
const unused = () => { throw Error("read/sign/journal port must not be called by offline challenge construction") }
// Actual guarded rail factory, deliberately unusable action ports: only pure challenges here.
const escrow = makeErc8183Rail({ identity, gasCapWei: 1n, expiresInSeconds: 1800, operationTimeoutMs: 1000, nowSeconds: () => 1000,
  acquireSigner: unused, providerAuthorization: unused, journal: { durability: "durable", claim: unused, matchSubmission: unused,
    intent: unused, prepared: unused, attempt: unused, confirmed: unused, uncertain: unused } })
const listing = PublicListing.make({ id: "skill", version: "1.0.0", serviceName: "Pure challenge fixture", description: "Offline",
  price: "$0.01", tags: [], inputSchema: { type: "object" }, outputSchema: { type: "object" }, bounds: Bounds.make({ timeoutSec: 60 }),
  rails: ["gateway", "eip3009", "erc8183"] })
const row = { listing, seller: addr("9"), agentId: "8", agentVerified: true }
const origin = "https://example.test", resource = `${origin}/x/${row.seller}/skill`, input = { z: 1, a: 2 }
const challenge = escrowListingChallenge(row, input, resource).challenge
const legacyInputs: ChallengeInput[] = []
const legacy = (name: Rail["name"]): Rail => ({ name, challenge: value => Effect.sync(() => {
  expect(Object.hasOwn(value, "escrow")).toBe(false); legacyInputs.push(value)
  return PaymentRequirements.make({ scheme: "exact", network: "eip155:5042002", asset: identity.token, payTo: value.payTo,
    amount: value.priceAtomic.toString(), maxTimeoutSeconds: 60, resource: value.resource, extra: {} })
}), verify: unused, settle: unused })
describe("dedicated escrow inventory and request challenge", () => {
  it("advertises actual guarded escrow last without widening legacy lookup", async () => {
    const exact = legacy("eip3009"), rails = makeRails(exact, [legacy("gateway")], escrow)
    const choices = await Effect.runPromise(challengeChoices(rails, listing, challenge))
    expect(choices.map(c => [c.kind, c.rail.name])).toEqual([["exact", "gateway"], ["exact", "eip3009"], ["escrow", "erc8183"]])
    expect(choices[2]!.requirements.extra["request"]).toMatchObject({ inputHash: hashJson(input), skillId: "skill", method: "POST" })
    expect(rails.get("erc8183")).toBeUndefined(); expect(rails.default).toBe(exact); expect(rails.escrow).toBe(escrow)
    expect(rails.names).toEqual(["eip3009", "gateway", "erc8183"])
  })
  it.each(["eip3009", "gateway", "test"] as const)("never advertises escrow to %s children", async name => {
    const rails = makeRails(legacy(name), [], escrow)
    expect((await Effect.runPromise(challengeChoices(rails, listing, challenge, { child: true }))).map(c => c.rail.name)).toEqual([name])
  })
  it("preserves offline test default and absent opt-in", async () => {
    expect((await Effect.runPromise(challengeChoices(makeRails(legacy("test"), [], escrow), listing, challenge))).map(c => c.rail.name)).toEqual(["test"])
    expect((await Effect.runPromise(challengeChoices(makeRails(legacy("eip3009"), [], escrow), {}, challenge))).map(c => c.rail.name)).toEqual(["eip3009"])
  })
  it("does not fabricate an input-specific quote during generic discovery", async () => {
    const rails = makeRails(legacy("eip3009"), [legacy("gateway")], escrow)
    const discovery = await Effect.runPromise(prepareDiscoveryListings(rails, [row], origin))
    expect(discovery[0]!.accepts?.map(r => r.scheme)).toEqual(["exact", "exact"])
    expect(JSON.stringify(discovery)).not.toContain("inputHash"); expect(discovery[0]!.listing.rails).toContain("erc8183")
  })
  it("rejects ambiguous legacy-named escrow plus dedicated escrow", () => {
    expect(() => makeRails(legacy("erc8183"), [], escrow)).toThrow("escrow_registry_refused")
    expect(() => makeRails(legacy("eip3009"), [legacy("erc8183")], escrow)).toThrow("escrow_registry_refused")
  })
  it("omits an unquotable escrow timeout without breaking exact choices", async () => {
    const choices = await Effect.runPromise(challengeChoices(makeRails(legacy("eip3009"), [], escrow), listing,
      { ...challenge, escrow: { ...challenge.escrow!, timeoutSeconds: 1800 } }))
    expect(choices.map(c => c.rail.name)).toEqual(["eip3009"])
  })
  it("captures actual input ordering without mutating caller or leaking metadata", () => {
    const raw = { ...row, privateCredential: "PRIVATE_STORED_RECORD" }, captured = escrowListingChallenge(raw, input, resource)
    expect(captured.challenge.escrow?.inputHash).not.toBe(hashJson({ a: 2, z: 1 }))
    expect(JSON.stringify(captured, (_, value) => typeof value === "bigint" ? value.toString() : value)).not.toContain("PRIVATE_")
    expect(captured.input).not.toBe(input); expect(input).toEqual({ z: 1, a: 2 })
  })
})
