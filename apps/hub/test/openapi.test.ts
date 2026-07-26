import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { SkillManifest, parsePrice, toPublicListing, ARC_CAIP2, USDC_ADDRESS } from "@arcade/core"
import { buildOpenApi, buildWellKnownX402, type ListingRecord } from "../src/openapi.ts"

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

  it("returns 202, because a real skill takes longer than a request", () => {
    const op = (buildOpenApi(params([record()]))["paths"] as any)[`/x/${SELLER}/counterparty-brief`].post
    expect(Object.keys(op.responses)).toContain("202")
    expect(Object.keys(op.responses)).not.toContain("200")
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
      maxAmountRequired: parsePrice("$0.25").toString()
    })
  })

  it("leaks nothing private either", () => {
    const wk = JSON.stringify(buildWellKnownX402(params([record()])))
    expect(wk).not.toContain("SECRET-PROMPT")
    expect(wk).not.toContain("ANTHROPIC_API_KEY")
    expect(wk).not.toContain("agent.ts")
  })
})
