import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { decodeListing, decodeListings } from "../src/lib/hub-decode.ts"
import { loadSkillPage } from "../src/lib/skill-page-data.ts"
import { ListingCard } from "../src/components/listing-card.tsx"
import { SkillPage } from "../src/components/skill-page.tsx"
import { MarketListings } from "../src/components/market-listings.tsx"
import { decodeDeclaredRails, declaredRailsOf, filterCatalogue, readRailFilter } from "../src/lib/listing-rails.ts"
import { marketListing } from "./fixtures/market-data.ts"

const raw = (rails?: unknown) => ({ ...marketListing(), rails, inputSchema: {}, outputSchema: {} })
const view = async (value: unknown) => loadSkillPage({ name: "diff-triage" }, {
  describeSkill: async () => decodeListing(value, "diff-triage"),
  listingReceipts: async () => [], resolveName: async () => { throw Error("Unexpected name read") }
}, () => 1000)

describe("J11C public listing rail declarations", () => {
  it("preserves every pre-J11 CSS byte and scopes the additive controls", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    const marker = "\n/* J11 declared rail data"
    expect(css).toContain(marker)
    expect(createHash("sha256").update(css.slice(0, css.indexOf(marker))).digest("hex"))
      .toBe("58f11d0299c47a97e3e851c705009d25bafc678793dfb86e15c956d4b1a65576")
    const suffix = css.slice(css.indexOf(marker))
    expect(suffix).toContain("min-height: 44px"); expect(suffix).toContain(":focus-visible")
    expect(suffix).not.toMatch(/(?:^|\n)(?:body|:root|\.buyer|\.publish|\.tree)[\s.{]/)
  })
  it("filters only explicit declarations and keeps unavailable metadata separate", () => {
    const all = decodeListings([raw(["erc8183", "gateway"]), { ...raw(["eip3009"]), id: "exact-skill" },
      { ...raw(), id: "legacy-skill" }, { ...raw(["PRIVATE"]), id: "unknown-skill" }])
    expect(filterCatalogue(all, "all")).toBe(all)
    expect(filterCatalogue(all, "gateway").map(x => x.id)).toEqual(["diff-triage"])
    expect(filterCatalogue(all, "erc8183").map(x => x.id)).toEqual(["diff-triage"])
    expect(filterCatalogue(all, "eip3009").map(x => x.id)).toEqual(["exact-skill"])
    expect(filterCatalogue(all, "unavailable").map(x => x.id)).toEqual(["legacy-skill", "unknown-skill"])
    expect(filterCatalogue(all.slice(1), "gateway")).toEqual([])
    for (const value of ["PRIVATE", "exact", "escrow", "", null, {}, 0]) expect(readRailFilter(value)).toBeUndefined()
    expect(all).toHaveLength(4)
  })
  it("renders labelled native controls and distinguishes an empty catalogue", () => {
    const out = renderToStaticMarkup(<MarketListings listings={decodeListings([raw(["gateway"])])} observedAtMs={1000} />)
    expect(out).toContain("Declared payment rail"); expect(out).toContain("<select")
    expect(out).toContain('aria-describedby='); expect(out).toContain('role="status"')
    expect(out).toContain("1 of 1 catalogue listings shown")
    expect(out).toContain("not current payment availability")
    expect(out).toContain("does not change the recorded totals")
    const empty = renderToStaticMarkup(<MarketListings listings={[]} observedAtMs={1000} />)
    expect(empty).toContain("No eligible listings"); expect(empty).not.toContain("<select")
  })
  it("refuses extra keys, prototypes, hidden entries and throwing proxies without coercion", () => {
    let touched = 0
    const hostile = [
      Object.assign(["gateway"], { extra: "PRIVATE" }), Object.assign(["gateway"], { [Symbol("PRIVATE")]: true }),
      Object.defineProperty(["gateway"], "0", { value: "gateway", enumerable: false }),
      Object.setPrototypeOf(["gateway"], Object.create(Array.prototype)),
      new Proxy(["gateway"], { ownKeys() { throw Error("PRIVATE") } }),
      [{ toString() { touched++; return "gateway" } }]
    ]
    for (const value of hostile) expect(decodeDeclaredRails(value)).toBeUndefined()
    expect(declaredRailsOf(Object.create({ rails: ["gateway"] }))).toBeUndefined()
    expect(declaredRailsOf(Object.defineProperty({}, "rails", { value: ["gateway"] }))).toBeUndefined()
    expect(touched).toBe(0)
  })
  it("copies only known declarations in Circle order at both public boundaries", async () => {
    const rails = ["erc8183", "eip3009", "gateway"]
    const decoded = decodeListings([raw(rails)])[0]!
    expect(decoded).toHaveProperty("rails", ["gateway", "eip3009", "erc8183"])
    expect(Object.isFrozen((decoded as unknown as { rails: unknown }).rails)).toBe(true)
    rails[0] = "PRIVATE_CHANGED"
    expect(decoded).toHaveProperty("rails", ["gateway", "eip3009", "erc8183"])
    const data = await view(raw(["erc8183", "gateway"]))
    expect(data.listing).toHaveProperty("rails", ["gateway", "erc8183"])
  })
  it("renders declared acceptance on the actual card and detail without availability or signer claims", async () => {
    const value = raw(["erc8183", "eip3009", "gateway"])
    const listing = decodeListings([value])[0]!
    const card = renderToStaticMarkup(<ListingCard listing={listing} />)
    expect(card).toContain("Accepts (declared): gateway · exact · escrow")
    const detail = renderToStaticMarkup(<SkillPage data={await view(value)} />)
    expect(detail).toContain("Accepts (declared): gateway · exact · escrow")
    expect(detail).toContain("not current payment availability")
    expect(detail).toContain("does not offer browser escrow purchases")
  })
  it("leaves legacy missing declarations unavailable without inferring a default", async () => {
    const { rails: _rails, ...legacy } = raw()
    const listing = decodeListings([legacy])[0]!
    expect(listing).not.toHaveProperty("rails")
    expect(renderToStaticMarkup(<ListingCard listing={listing} />)).toContain("Accepted rails unavailable")
    expect((await view(legacy)).listing?.id).toBe("diff-triage")
  })
  it.each([
    null, [], ["test"], ["exact"], ["Gateway"], ["gateway", "gateway"],
    ["gateway", "eip3009", "erc8183", "gateway"], [42], ["<script>PRIVATE</script>"],
    { gateway: true }, "gateway", new Array(2), ["gateway", undefined]
  ].map(rails => ({ rails })))("drops malformed optional declaration %# without erasing the listing", async ({ rails }) => {
    const listing = decodeListings([raw(rails)])[0]!
    expect(listing.id).toBe("diff-triage"); expect(listing).not.toHaveProperty("rails")
    expect((await view(raw(rails))).listing?.id).toBe("diff-triage")
  })
  it("does not execute accessors on the declaration or its array entries", async () => {
    let touched = 0
    const value = Object.defineProperty(raw(), "rails", { enumerable: true, get() { touched++; throw Error("PRIVATE") } })
    const array = Object.defineProperty(["gateway"], "0", { enumerable: true, get() { touched++; throw Error("PRIVATE") } })
    for (const input of [value, raw(array)]) {
      expect(decodeListings([input])[0]).not.toHaveProperty("rails")
      expect((await view(input)).listing?.id).toBe("diff-triage")
    }
    expect(touched).toBe(0)
  })
})
