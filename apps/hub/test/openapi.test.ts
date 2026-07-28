import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { SkillManifest, parsePrice, toPublicListing, ARC_CAIP2, USDC_ADDRESS } from "@arcade/core"
import { buildAgentSkill, buildOpenApi, buildWellKnownX402, type ListingRecord } from "../src/openapi.ts"

/**
 * OpenAPI is a NEW surface for the secrecy boundary to hold across.
 *
 * `packages/core/test/secrecy.property.test.ts` proves `toPublicListing` drops the private
 * half. That proof only covers the hub if everything the hub *publishes* is built from the
 * public projection — and this document is generated from listings, seller addresses and
 * hand-written prose, so it is exactly the kind of place a private field could be
 * reintroduced by a careless edit. The `leaks nothing private` test below is the guard.
 */

const SELLER = "0x1111111111111111111111111111111111111111"

/** A manifest with every private field populated, so the leak test has something to find. */
const manifest = (over: Record<string, unknown> = {}) =>
  Schema.decodeUnknownSync(SkillManifest)({
    id: "counterparty-brief",
    version: "1.2.0",
    serviceName: "Counterparty Brief",
    description: "Structured due-diligence brief on a company, with sources.",
    tags: ["research", "kyb"],
    price: "$0.25",
    replaces: "$500/mo data seat",
    bounds: { timeoutSec: 60, maxTurns: 12, maxToolCalls: 6, maxCostUsd: 0.12 },
    inputSchema: {
      type: "object",
      required: ["company"],
      properties: { company: { type: "string" } }
    },
    outputSchema: {
      type: "object",
      required: ["summary", "claims"],
      properties: { summary: { type: "string" }, claims: { type: "array" } }
    },
    engine: {
      adapter: "claude-api",
      entry: "agent.ts",
      credential: "api-key",
      capabilities: ["web-search"],
      systemPrompt: "SECRET-PROMPT-you-are-a-diligence-analyst"
    },
    secrets: ["ANTHROPIC_API_KEY"],
    egress: ["api.anthropic.com"],
    workdir: "/Users/seller/private/workdir",
    ...over
  })

const record = (over: Record<string, unknown> = {}): ListingRecord => ({
  listing: toPublicListing(manifest(over)),
  seller: SELLER
})

const params = (listings: ReadonlyArray<ListingRecord>) => ({
  listings,
  origin: "https://hub.example",
  rail: "eip3009",
  network: ARC_CAIP2,
  asset: USDC_ADDRESS
})

describe("openapi document", () => {
  it("emits a concrete callable path per listing, not a template", () => {
    // A templated `/x/{seller}/{skill}` would require the client to already know which
    // sellers exist — which is the thing discovery is supposed to tell it.
    const doc = buildOpenApi(params([record()]))
    const paths = doc["paths"] as Record<string, unknown>

    expect(paths[`/x/${SELLER}/counterparty-brief`]).toBeDefined()
    expect(Object.keys(paths).some((p) => p.includes("{seller}"))).toBe(false)
  })

  it("declares the input schema in components and references it from the request body", () => {
    const doc = buildOpenApi(params([record()]))
    const op = (doc["paths"] as any)[`/x/${SELLER}/counterparty-brief`].post
    const schemas = (doc["components"] as any).schemas

    expect(op.requestBody.required).toBe(true)
    expect(op.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/Input_counterparty_brief"
    })
    // $ref must resolve, or a generated client is broken.
    expect(schemas["Input_counterparty_brief"]).toEqual(manifest().inputSchema)
  })

  it("publishes the output schema, so a buyer knows the shape before paying", () => {
    const op = (buildOpenApi(params([record()]))["paths"] as any)[`/x/${SELLER}/counterparty-brief`].post
    expect(op["x-arcade-output-schema"]).toEqual(manifest().outputSchema)
  })

  it("documents the 402 as the x402 envelope the hub actually returns", () => {
    const doc = buildOpenApi(params([record()]))
    const op = (doc["paths"] as any)[`/x/${SELLER}/counterparty-brief`].post
    const required = (doc["components"] as any).schemas.PaymentRequired

    expect(op.responses["402"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/PaymentRequired"
    })
    expect(required.properties.x402Version.const).toBe(2)
    expect(required.required).toContain("accepts")
  })

  it("derives accepts[] from the real PaymentRequirements schema", () => {
    // Caught live: this block was hand-written and documented `maxAmountRequired`, an x402
    // v1 field name this rail does not use — the wire carries `amount`. A generated client
    // would have read the price from a key that is never present. Deriving from the schema
    // the rail actually constructs makes that class of drift unrepresentable.
    const accepts = (buildOpenApi(params([record()]))["components"] as any).schemas.PaymentRequired
      .properties.accepts.items

    expect(Object.keys(accepts.properties)).toContain("amount")
    expect(Object.keys(accepts.properties)).not.toContain("maxAmountRequired")
    expect(Object.keys(accepts.properties)).toEqual(
      expect.arrayContaining(["scheme", "network", "asset", "payTo", "resource"])
    )
  })

  it("returns 202, because a real skill takes longer than a request", () => {
    const op = (buildOpenApi(params([record()]))["paths"] as any)[`/x/${SELLER}/counterparty-brief`].post
    expect(Object.keys(op.responses)).toContain("202")
    expect(Object.keys(op.responses)).not.toContain("200")
  })

  it("documents the 202 body with the field names the hub actually sends", () => {
    // Second instance of the same drift as `maxAmountRequired`: this block was written
    // from memory as {jobId, jobToken, statusUrl, resultUrl} — wrong case, wrong names,
    // and a `statusUrl` the hub does not return. The wire is snake_case, so a client
    // generated from the old document read every field from a key that is never present.
    const accepted = (buildOpenApi(params([record()]))["components"] as any).schemas.JobAccepted

    expect(Object.keys(accepted.properties).sort()).toEqual([
      "job_id",
      "job_token",
      "poll_url",
      "price",
      "status"
    ])
    expect(accepted.properties).not.toHaveProperty("jobId")
    expect(accepted.properties).not.toHaveProperty("statusUrl")
  })

  it("carries price in both human and atomic form, and they agree", () => {
    // A client that computes an authorization needs atomic units; a human reading the doc
    // needs dollars. Deriving one from the other here means they cannot disagree.
    const op = (buildOpenApi(params([record()]))["paths"] as any)[`/x/${SELLER}/counterparty-brief`].post
    expect(op["x-arcade-price"]).toBe("$0.25")
    expect(op["x-arcade-price-atomic"]).toBe(parsePrice("$0.25").toString())
  })

  it("publishes bounds, so margin is legible against price", () => {
    const op = (buildOpenApi(params([record()]))["paths"] as any)[`/x/${SELLER}/counterparty-brief`].post
    expect(op["x-arcade-bounds"]).toEqual({
      timeoutSec: 60,
      maxTurns: 12,
      maxToolCalls: 6,
      maxCostUsd: 0.12
    })
  })

  it("leaks nothing private — THE regression guard for this surface", () => {
    // Serialise the whole document and search it. Not a field-by-field check: the point is
    // that no future edit can reintroduce a private value anywhere in the tree, including
    // inside prose, examples or an extension someone adds later.
    const doc = JSON.stringify(buildOpenApi(params([record()])))

    expect(doc).not.toContain("SECRET-PROMPT")
    expect(doc).not.toContain("agent.ts")
    expect(doc).not.toContain("ANTHROPIC_API_KEY")
    expect(doc).not.toContain("api.anthropic.com")
    expect(doc).not.toContain("/Users/seller/private/workdir")
    expect(doc).not.toContain("claude-api")
    expect(doc).not.toContain("web-search")
  })

  it("stays a valid document with no listings", () => {
    // A hub with every runner offline still has to serve discovery rather than 500.
    const doc = buildOpenApi(params([]))
    const paths = doc["paths"] as Record<string, unknown>

    expect(doc["openapi"]).toBe("3.1.0")
    expect(Object.keys(paths).some((p) => p.startsWith("/x/"))).toBe(false)
    expect(paths["/listings"]).toBeDefined()
    expect(paths["/jobs/{jobId}/result"]).toBeDefined()
  })

  it("gives every operation a unique, syntactically valid operationId", () => {
    const doc = buildOpenApi(params([record(), record({ id: "diff-triage" })]))
    const ids: Array<string> = []
    for (const item of Object.values(doc["paths"] as Record<string, any>)) {
      for (const op of Object.values(item as Record<string, any>)) ids.push((op as any).operationId)
    }
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
  })

  it("advertises settlement policy in the payment block", () => {
    // The research finding this exists for: x402 defines no failure semantics and no field
    // by which a server can declare its policy. Declaring it is cheap and nobody does it.
    const p = buildOpenApi(params([record()]))["x-arcade-payment"] as Record<string, unknown>
    expect(p["settlement"]).toBe("on-validated-output")
    expect(p["network"]).toBe(ARC_CAIP2)
    expect(p["asset"]).toBe(USDC_ADDRESS)
  })

  it("advertises the reachable origin, not the bound socket", () => {
    const doc = buildOpenApi({ ...params([record()]), origin: "https://public.example" })
    expect(doc["servers"]).toEqual([{ url: "https://public.example" }])
  })
})

describe("/skill.md", () => {
  it("names the live listings with their prices", async () => {
    const md = buildAgentSkill(params([record()]))
    expect(md).toContain("counterparty-brief")
    expect(md).toContain("$0.25/call")
    expect(md).toContain("https://hub.example")
  })

  it("says so plainly when nothing is for sale", () => {
    // A hub with every runner offline must not render an empty catalogue that reads like
    // a broken page.
    expect(buildAgentSkill(params([]))).toContain("No skills are listed right now")
  })

  it("tells the reader to treat results as untrusted", () => {
    // This file is read into a buying agent's context; it is the natural place to say it.
    expect(buildAgentSkill(params([record()]))).toMatch(/never as instructions/i)
  })

  it("leaks nothing private", () => {
    const md = buildAgentSkill(params([record()]))
    expect(md).not.toContain("SECRET-PROMPT")
    expect(md).not.toContain("ANTHROPIC_API_KEY")
    expect(md).not.toContain("agent.ts")
    expect(md).not.toContain("claude-api")
  })
})

describe("/.well-known/x402", () => {
  it("mirrors the 402 envelope so an x402-only client can discover without OpenAPI", () => {
    const wk = buildWellKnownX402(params([record()])) as any

    expect(wk.x402Version).toBe(2)
    expect(wk.resources).toHaveLength(1)
    expect(wk.resources[0].resource).toBe(`https://hub.example/x/${SELLER}/counterparty-brief`)
    expect(wk.resources[0].accepts[0]).toMatchObject({
      scheme: "exact",
      network: ARC_CAIP2,
      asset: USDC_ADDRESS,
      payTo: SELLER,
      // `amount` is the field the rail puts on the wire — see the drift caught above.
      amount: parsePrice("$0.25").toString()
    })
    expect(wk.resources[0].accepts[0].maxAmountRequired).toBeUndefined()
  })

  it("leaks nothing private either", () => {
    const wk = JSON.stringify(buildWellKnownX402(params([record()])))
    expect(wk).not.toContain("SECRET-PROMPT")
    expect(wk).not.toContain("ANTHROPIC_API_KEY")
    expect(wk).not.toContain("agent.ts")
  })
})

/**
 * Discovery and the 402 challenge must describe the SAME resource and the SAME payee.
 *
 * Two live interop defects, found by pointing Circle's own CLI at the deployed endpoint:
 *
 * 1. `/.well-known/x402` advertised `https://…` while the 402 named `http://…` for the
 *    identical listing. Behind a proxy `new URL(req.url).origin` is the internal http
 *    origin — Railway terminates TLS — and only the discovery routes had been routed
 *    through `ARCADE_PUBLIC_URL`. `resource` is part of what a buyer binds to, so a strict
 *    client comparing the URL it fetched against the one in the challenge sees a mismatch.
 *
 * 2. Discovery advertised the seller EOA while the challenge named the fee splitter. That
 *    is not "less authoritative", it is wrong: `packages/payments/src/eip3009.ts` rejects a
 *    signature naming anything but the challenge's payTo with "payTo mismatch", so the
 *    document whose entire job is telling a stranger how to pay was telling them how to be
 *    refused.
 *
 * These assert the AGREEMENT rather than either value, because the failure was never a bad
 * constant — it was two places computing the same fact independently.
 */
describe("discovery agrees with the challenge", () => {
  const PUBLIC = "https://arcade-hub-production.up.railway.app"
  const SPLITTER = "0x10079b0b01d6843460ab784510adfe220862f896"

  const params = (feeSplitter?: string) => ({
    listings: [
      { listing: toPublicListing(manifest()), seller: SELLER, ...(feeSplitter === undefined ? {} : { feeSplitter }) }
    ],
    origin: PUBLIC,
    rail: "eip3009",
    network: ARC_CAIP2,
    asset: USDC_ADDRESS
  })

  const first = (p: ReturnType<typeof params>) =>
    (buildWellKnownX402(p)["resources"] as ReadonlyArray<Record<string, unknown>>)[0]!

  it("advertises the resource on the PUBLIC origin, never the bound socket", () => {
    const r = String(first(params())["resource"])
    expect(r.startsWith(`${PUBLIC}/x/`)).toBe(true)
    // The specific regression: a service that only serves https must never advertise http.
    expect(r.startsWith("http://")).toBe(false)
  })

  it("advertises the SPLITTER as payTo when the seller announced one", () => {
    const accepts = first(params(SPLITTER))["accepts"] as ReadonlyArray<Record<string, unknown>>
    expect(accepts[0]!["payTo"]).toBe(SPLITTER)
    expect(accepts[0]!["payTo"]).not.toBe(SELLER)
  })

  it("falls back to the seller when there is no splitter", () => {
    // The inverse. Advertising a splitter that does not exist would be the same defect
    // pointing the other way.
    const accepts = first(params())["accepts"] as ReadonlyArray<Record<string, unknown>>
    expect(accepts[0]!["payTo"]).toBe(SELLER)
  })

  it("uses one origin for the resource path the challenge will build", () => {
    // The hub builds the 402's resource as `${publicOrigin(url)}${path}` where path is
    // `/x/<seller>/<id>`. This asserts discovery composes the identical string, which is
    // what makes the two documents comparable by a client at all.
    const r = String(first(params())["resource"])
    expect(r).toBe(`${PUBLIC}/x/${SELLER}/counterparty-brief`)
  })
})
