import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { DEFAULT_LISTING_RAILS, PublicListing, SkillManifest, toPublicListing } from "../src/manifest.ts"

const raw = {
  id: "rail-fixture", version: "1.0.0", serviceName: "Rail fixture", description: "Public rail selection",
  price: "$0.30", bounds: { timeoutSec: 60 }, inputSchema: {}, outputSchema: {},
  engine: { adapter: "script", entry: "private-run.ts", systemPrompt: "private-prompt" },
  secrets: ["PRIVATE_API_KEY"], egress: ["private.example"]
}
const decode = (patch: Record<string, unknown> = {}) => Schema.decodeUnknownSync(SkillManifest)({ ...raw, tags: [], ...patch })
const categories = ["CREATIVE", "DATA_ENRICHMENT", "FINANCIAL_ANALYSIS", "INFRASTRUCTURE", "PREDICTION_MARKETS", "WEB_SEARCH_RESEARCH"]

describe("Circle-facing public manifest contract", () => {
  it("preserves explicitly declared rails and category through the canonical secrecy boundary", () => {
    const selection = { rails: ["gateway", "eip3009", "erc8183"], category: "INFRASTRUCTURE" }
    const manifest = decode(selection)
    const projected = toPublicListing(manifest)
    expect(projected).toMatchObject(selection)
    const wire = Schema.encodeSync(PublicListing)(projected)
    expect(Schema.decodeUnknownSync(PublicListing)(wire)).toMatchObject(selection)
    expect(JSON.stringify(wire)).not.toMatch(/private-|PRIVATE_API_KEY|private\.example|engine|secrets|egress/)
  })
  it("keeps omitted rail/category fields absent so legacy public listing bytes do not acquire invented metadata", () => {
    const projected = toPublicListing(decode())
    expect(projected).not.toHaveProperty("rails")
    expect(projected).not.toHaveProperty("category")
    expect(DEFAULT_LISTING_RAILS).toEqual(["gateway", "eip3009"])
    expect(Object.isFrozen(DEFAULT_LISTING_RAILS)).toBe(true)
  })
  it("defaults omitted tags to an empty list in both private and public schemas", () => {
    expect(Schema.decodeUnknownSync(SkillManifest)(raw).tags).toEqual([])
    expect(Schema.decodeUnknownSync(PublicListing)(raw).tags).toEqual([])
  })
  it.each(categories)("accepts registry category %s", category => {
    expect(toPublicListing(decode({ category }))).toHaveProperty("category", category)
  })
  it.each(["financial_analysis", "OTHER", "", null, 4])("refuses an invalid category %s", category => {
    expect(() => decode({ category })).toThrow()
    expect(() => Schema.decodeUnknownSync(PublicListing)({ ...raw, tags: [], category })).toThrow()
  })
  it.each([["gateway"], ["eip3009"], ["erc8183"], ["erc8183", "gateway"]].map(rails => ({ rails })))("preserves selected rail order $rails", ({ rails }) => {
    expect(toPublicListing(decode({ rails }))).toHaveProperty("rails", rails)
  })
  it.each([[], ["test"], ["exact"], ["GATEWAY"], ["gateway", "gateway"], ["gateway", "eip3009", "erc8183", "gateway"], null, "gateway"].map(rails => ({ rails })))(
    "refuses invalid or ambiguous rail declarations $rails", ({ rails }) => {
      expect(() => decode({ rails })).toThrow()
      expect(() => Schema.decodeUnknownSync(PublicListing)({ ...raw, tags: [], rails })).toThrow()
    }
  )
  it("accepts ten lowercase slug tags but refuses eleven", () => {
    const tags = Array.from({ length: 10 }, (_, i) => "tag-" + i)
    expect(toPublicListing(decode({ tags })).tags).toEqual(tags)
    expect(() => decode({ tags: [...tags, "extra"] })).toThrow()
  })
  it.each(["UPPER", "has space", "_underscore", "-leading", "trailing-", "two--hyphens", "", "é", "a".repeat(33)])(
    "refuses non-slug tag %s", tag => expect(() => decode({ tags: [tag] })).toThrow()
  )
})
