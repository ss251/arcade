import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { Effect, Ref, Schema } from "effect"
import { Bounds, PublicListing, SkillManifest, toPublicListing } from "@arcade/core"
import { PaymentRequirements, makeTestRail, makeTestState } from "@arcade/payments"
import { buildOpenApi, buildWellKnownX402, type ListingRecord } from "../src/openapi.ts"
import { prepareDiscoveryListings } from "../src/discovery.ts"
import { makeRails } from "../src/rails.ts"

const seller = `0x${"a".repeat(40)}`, splitter = `0x${"b".repeat(40)}`, origin = "https://hub.example"
const listing = PublicListing.make({ id: "discovery-fixture", version: "1.0.0", serviceName: "Discovery fixture",
  description: "Public listing description", price: "$0.01", tags: ["data"], bounds: Bounds.make({ timeoutSec: 5 }),
  inputSchema: { type: "object", properties: { question: { type: "string" } } }, outputSchema: { type: "object", required: ["answer"] } })
const exact = PaymentRequirements.make({ scheme: "exact", network: "eip155:5042002", asset: `0x${"c".repeat(40)}`, amount: "10000",
  payTo: splitter, resource: `${origin}/x/${seller}/${listing.id}`, maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2" } })
const gateway = PaymentRequirements.make({ ...exact, payTo: seller, extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: seller } })
const params = (patch: Partial<ListingRecord> = {}, rail = "eip3009") => ({ origin, rail, rails: ["eip3009", "gateway"], network: exact.network, asset: exact.asset,
  listings: [{ listing, seller, feeSplitter: splitter, accepts: [gateway, exact], ...patch }] })
const itemOf = (p = params()) => (buildWellKnownX402(p) as any).items[0]
const fixture = JSON.parse(readFileSync(new URL("../../../docs/evidence/J/registry-item-sample.json", import.meta.url), "utf8"))

describe("Circle registry discovery", () => {
  it("matches captured metadata field names with documented plan schema aliases", () => {
    const p = params(), doc = buildWellKnownX402(p) as any, item = doc.items[0], metadata = item.metadata
    expect(doc.items).toEqual(doc.resources)
    expect(item).toMatchObject({ type: "http", x402Version: 2, resource: exact.resource, accepts: [gateway, exact] })
    expect(Object.keys(metadata).sort()).toEqual([...Object.keys(fixture.item.metadata), "inputSchema", "outputSchema"].sort())
    expect(Object.keys(metadata.provider).sort()).toEqual(Object.keys(fixture.item.metadata.provider).sort())
    expect(metadata).toEqual({ provider: { name: seller, website: `${origin}/skill/${listing.id}`, docsUrl: `${origin}/skill/${listing.id}`,
      description: listing.description, category: "INFRASTRUCTURE", tags: ["data"] }, path: `/x/${seller}/${listing.id}`, method: "POST",
      description: listing.description, mimeType: "application/json", input: { type: "http", method: "POST", bodyType: "json", body: listing.inputSchema },
      output: listing.outputSchema, inputSchema: listing.inputSchema, outputSchema: listing.outputSchema, siwx: false,
      supportsVanillax402: true, supportsCircleGateway: true })
    const api = buildOpenApi(p) as any
    expect(api.paths[`/x/${seller}/${listing.id}`].post["x-circle-metadata"]).toEqual(metadata)
    expect(api["x-circle-discovery"].items).toEqual(doc.items)
  })
  it("keeps an observed seller name and declared category", () => {
    expect(itemOf(params({ listing: PublicListing.make({ ...listing, category: "CREATIVE" }), sellerEnsName: "seller.arcade.eth" })).metadata.provider)
      .toMatchObject({ name: "seller.arcade.eth", category: "CREATIVE" })
  })
  it.each([
    { accepts: [gateway], vanilla: false, gateway: true }, { accepts: [exact], vanilla: true, gateway: false },
    { accepts: [], vanilla: false, gateway: false }, { accepts: undefined, vanilla: false, gateway: false },
    { accepts: [PaymentRequirements.make({ ...exact, scheme: "erc8183" })], vanilla: false, gateway: false }
  ])("advertises only prepared listing support %#", row => {
    expect(itemOf(params({ accepts: row.accepts })).metadata).toMatchObject({ supportsVanillax402: row.vanilla, supportsCircleGateway: row.gateway })
  })
  it("does not claim live support in test mode", () => {
    expect(itemOf(params({}, "test")).metadata).toMatchObject({ supportsVanillax402: false, supportsCircleGateway: false })
  })
  it("filters hidden listings in every view without mutating the input", () => {
    const p = params({ delisted: true }), before = JSON.stringify(p), doc = buildWellKnownX402(p) as any
    expect(doc.items).toEqual([]); expect(doc.resources).toEqual([])
    expect((buildOpenApi(p) as any)["x-circle-discovery"].items).toEqual([])
    expect(JSON.stringify(p)).toBe(before)
  })
  it("does not spread private manifest or stored-record extras", () => {
    const manifest = Schema.decodeUnknownSync(SkillManifest)({ ...listing, engine: { adapter: "script", entry: "PRIVATE_ENTRY" }, secrets: ["PRIVATE_TOKEN"], egress: ["private.example"] })
    const p = params({ listing: toPublicListing(manifest), privateRecord: "PRIVATE_RECORD" } as Partial<ListingRecord>)
    expect(JSON.stringify([buildOpenApi(p), buildWellKnownX402(p)])).not.toMatch(/PRIVATE_|private\.example|"engine"|"secrets"|privateRecord/)
  })
  it("prepares selected challenges offline without payment operations or spreading stored records", async () => {
    const base = makeTestRail(Effect.runSync(Ref.make(makeTestState())))
    const rail = (name: "gateway" | "eip3009") => ({ ...base, name, challenge: () => Effect.succeed(name === "gateway" ? gateway : exact),
      verify: () => Effect.die("must not verify"), settle: () => Effect.die("must not settle") })
    const rails = makeRails(rail("eip3009"), [rail("gateway")])
    const original = { listing, seller, feeSplitter: splitter, splitterVersion: 2 as const, privateRecord: "PRIVATE_RECORD" }
    expect(await Effect.runPromise(prepareDiscoveryListings(rails, [original], origin, () => "seller.arcade.eth")))
      .toEqual([{ listing, seller, feeSplitter: splitter, accepts: [gateway, exact], sellerEnsName: "seller.arcade.eth" }])
    expect(original).not.toHaveProperty("accepts")
    const limited = { ...original, listing: PublicListing.make({ ...listing, rails: ["eip3009"] }) }
    expect((await Effect.runPromise(prepareDiscoveryListings(rails, [limited], origin)))[0]!.accepts).toEqual([exact])
  })
  it("accepts current and earlier approved categories without silently reclassifying", () => {
    for (const category of ["SOCIAL_INTELLIGENCE", "DATA_ENRICHMENT"] as const) expect(PublicListing.make({ ...listing, category }).category).toBe(category)
  })
})
