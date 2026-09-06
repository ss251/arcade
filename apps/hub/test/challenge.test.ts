import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { PaymentRequirements, type Rail } from "@arcade/payments"
import { buildAccepts, challengeChoices, matchesRequirements, paymentRailName } from "../src/challenge.ts"
import { makeRails } from "../src/rails.ts"

const seller = `0x${"a".repeat(40)}`, splitter = `0x${"b".repeat(40)}`
const input = { priceAtomic: 10000n, resource: "/x/fixture", payTo: seller, feeSplitter: splitter, feeSplitterVersion: 2 as const }
// Pure named fakes: these do not implement escrow or contact a payment provider.
const fake = (name: Rail["name"]): Rail => ({ name,
  challenge: i => Effect.succeed(PaymentRequirements.make({ scheme: name === "erc8183" ? "erc8183" : "exact",
    network: "eip155:5042002", amount: i.priceAtomic.toString(), asset: `0x${"c".repeat(40)}`,
    payTo: name === "eip3009" ? i.feeSplitter ?? i.payTo : i.payTo, resource: i.resource, maxTimeoutSeconds: 60,
    extra: name === "gateway" ? { name: "GatewayWalletBatched", version: "1", verifyingContract: seller } :
      { name: "USDC", version: "2", feeSplitter: splitter, feeSplitterVersion: 2 } })),
  verify: () => Effect.die("challenge test must not verify"), settle: () => Effect.die("challenge test must not settle") })
const all = ["gateway", "eip3009", "erc8183"] as const
const subsets = Array.from({ length: 7 }, (_, n) => all.filter((_, i) => ((n + 1) & (1 << i)) !== 0))
describe("ordered challenge options", () => {
  it.each(subsets.map(built => ({ built })))("orders every built combination $built, regardless of default", async ({ built }) => {
    const reversed = [...built].reverse().map(fake), rails = makeRails(reversed[0]!, reversed.slice(1))
    const choices = await Effect.runPromise(challengeChoices(rails, { rails: all }, input))
    expect(choices.map(c => c.rail.name)).toEqual(built)
    expect(await Effect.runPromise(buildAccepts(rails, { rails: all }, input))).toEqual(choices.map(c => c.requirements))
  })
  it.each(subsets.map(declared => ({ declared })))("intersects declared $declared in fixed order", async ({ declared }) => {
    const choices = await Effect.runPromise(challengeChoices(makeRails(fake("eip3009"), [fake("erc8183"), fake("gateway")]), { rails: declared }, input))
    expect(choices.map(c => c.rail.name)).toEqual(declared)
  })
  it("defaults to Gateway then exact, never escrow", async () => {
    const rails = makeRails(fake("eip3009"), [fake("erc8183"), fake("gateway")])
    const choices = await Effect.runPromise(challengeChoices(rails, {}, input))
    expect(choices.map(c => c.rail.name)).toEqual(["gateway", "eip3009"])
    expect(choices.map(c => c.requirements.payTo)).toEqual([seller, splitter])
  })
  it("has no fallback when declared rails are unavailable", async () => {
    expect(await Effect.runPromise(buildAccepts(makeRails(fake("eip3009"), []), { rails: ["erc8183"] }, input))).toEqual([])
  })
  it("keeps test-default ordinary traffic offline despite a built Gateway", async () => {
    const rails = makeRails(fake("test"), [fake("gateway")])
    expect((await Effect.runPromise(challengeChoices(rails, {}, input))).map(c => c.rail.name)).toEqual(["test"])
    expect(await Effect.runPromise(buildAccepts(rails, { rails: ["gateway"] }, input))).toEqual([])
    expect(rails.names).toEqual(["test", "gateway"])
  })
  it.each(["gateway", "eip3009", "test"] as const)("keeps child calls on %s, never escrow", async name => {
    const rails = makeRails(fake(name), all.filter(n => n !== name).map(fake))
    expect((await Effect.runPromise(challengeChoices(rails, { rails: all }, input, { child: true }))).map(c => c.rail.name)).toEqual([name])
  })
  it("refuses escrow-default children and children whose default was not listed", async () => {
    expect(await Effect.runPromise(buildAccepts(makeRails(fake("erc8183"), [fake("eip3009")]), { rails: all }, input, { child: true }))).toEqual([])
    expect(await Effect.runPromise(buildAccepts(makeRails(fake("eip3009"), [fake("gateway")]), { rails: ["gateway"] }, input, { child: true }))).toEqual([])
  })
})

describe("accepted rail classification", () => {
  const envelope = (accepted: unknown) => ({ x402Version: 2, payload: {}, accepted })
  it.each([
    [{ scheme: "exact", extra: { name: "GatewayWalletBatched" } }, "gateway"],
    [{ scheme: "exact", extra: { name: "USDC" } }, "eip3009"],
    [{ scheme: "exact" }, "eip3009"], [{ scheme: "erc8183" }, "erc8183"],
    [{ scheme: "unknown", extra: { name: "GatewayWalletBatched" } }, "unsupported"],
    [{ scheme: "" }, "unsupported"]
  ])("classifies %j without falling through an unknown scheme", (accepted, expected) => expect(paymentRailName(envelope(accepted))).toBe(expected))
  it.each([null, [], {}, { accepted: {} }, envelope(null), envelope([]), envelope({ scheme: 1 }),
    { x402Version: 1, payload: {}, accepted: { scheme: "exact" } },
    { x402Version: 2, payload: [], accepted: { scheme: "exact" } }])("keeps malformed envelopes distinct: %j", value => {
    expect(paymentRailName(value)).toBe("malformed")
  })
})

describe("trusted requirement binding before payment verification", () => {
  const req = Effect.runSync(fake("eip3009").challenge(input))
  it("accepts semantically identical address casing and extra key ordering", () => {
    expect(matchesRequirements({ ...req, asset: req.asset.toUpperCase(), payTo: req.payTo.toUpperCase(),
      extra: { feeSplitterVersion: 2, feeSplitter: splitter.toUpperCase(), version: "2", name: "USDC" } }, req)).toBe(true)
  })
  it.each([
    { scheme: "erc8183" }, { network: "eip155:1" }, { amount: "10001" }, { amount: "010000" },
    { asset: seller }, { payTo: seller }, { resource: "/x/other" }, { maxTimeoutSeconds: 61 },
    { extra: { ...req.extra, name: "GatewayWalletBatched" } }, { extra: { ...req.extra, version: "1" } },
    { extra: { ...req.extra, feeSplitter: seller } }, { extra: { ...req.extra, feeSplitterVersion: 1 } },
    { extra: { ...req.extra, verifyingContract: seller } }, { extra: {} }
  ])("refuses a modified security field: %j", change => {
    expect(matchesRequirements({ ...req, ...change } as PaymentRequirements, req)).toBe(false)
  })
  it("does not use presentation-only description or MIME changes as payment authority", () => {
    expect(matchesRequirements({ ...req, description: "buyer presentation", mimeType: "text/plain" }, req)).toBe(true)
  })
  it("binds Gateway verifyingContract as an address and rejects unknown extra metadata", () => {
    const g = Effect.runSync(fake("gateway").challenge(input))
    expect(matchesRequirements({ ...g, extra: { ...g.extra, verifyingContract: seller.toUpperCase() } }, g)).toBe(true)
    expect(matchesRequirements({ ...g, extra: { ...g.extra, verifyingContract: splitter } }, g)).toBe(false)
    expect(matchesRequirements({ ...g, extra: { ...g.extra, unexpected: true } }, g)).toBe(false)
  })
})
