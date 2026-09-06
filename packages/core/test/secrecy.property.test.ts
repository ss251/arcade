import { describe, expect, it } from "vitest"
import * as fc from "fast-check"
import { Schema } from "effect"
import {
  PRIVATE_FIELDS,
  PublicListing,
  SkillManifest,
  toPublicListing
} from "../src/manifest.ts"

/**
 * THE THESIS TEST.
 *
 * ARCADE's entire pitch is "publish your skill without revealing it." If a prompt, an entry
 * path, or a secret name can reach the hub, the product is a lie. So this is asserted over
 * *arbitrary* manifests rather than a handful of examples.
 */

const printable = fc.stringMatching(/^[\x20-\x7E]{1,24}$/)

const arbManifest = fc.record({
  id: fc.stringMatching(/^[a-z0-9][a-z0-9-]{1,20}$/),
  version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
  serviceName: printable,
  description: fc.string({ maxLength: 200 }),
  tags: fc.array(fc.stringMatching(/^[a-z0-9]{1,24}$/), { maxLength: 10 }),
  rails: fc.option(fc.shuffledSubarray(["gateway", "eip3009", "erc8183"], { minLength: 1, maxLength: 3 }), { nil: undefined }),
  category: fc.option(fc.constantFrom("CREATIVE", "DATA_ENRICHMENT", "FINANCIAL_ANALYSIS", "INFRASTRUCTURE", "PREDICTION_MARKETS", "WEB_SEARCH_RESEARCH"), { nil: undefined }),
  price: fc.stringMatching(/^\$\d\.\d{2}$/),
  bounds: fc.record({ timeoutSec: fc.integer({ min: 1, max: 900 }) }),
  inputSchema: fc.constant({ type: "object" }),
  outputSchema: fc.constant({ type: "object" }),

  // The private half — deliberately filled with recognisable canary values.
  engine: fc.record({
    adapter: fc.constantFrom("script", "claude-api", "claude-agent", "skill"),
    entry: fc.constant("CANARY_ENTRY_run.ts"),
    model: fc.constant("CANARY_MODEL_claude-sonnet-5"),
    systemPrompt: fc.constant("CANARY_PROMPT you are a secret specialist agent"),
    command: fc.constant(["CANARY_COMMAND_bunx", "CANARY_COMMAND_server"]),
    url: fc.constant("https://CANARY_URL.example/mcp"),
    tool: fc.constant("CANARY_TOOL_search"),
    spec: fc.constant("CANARY_SPEC_openapi.json"),
    operationId: fc.constant("CANARY_OPERATION_fxRate"),
    auth: fc.constant({ in: "header", name: "CANARY_AUTH_X-Api-Key", env: "CANARY_AUTH_ENV" })
  }),
  secrets: fc.array(fc.constant("CANARY_SECRET_ANTHROPIC_API_KEY"), { maxLength: 3 }),
  egress: fc.array(fc.constant("CANARY_EGRESS_api.anthropic.com"), { maxLength: 3 }),
  workdir: fc.constant("CANARY_WORKDIR_/home/seller/skills/x")
})

const CANARIES = [
  "CANARY_ENTRY",
  "CANARY_MODEL",
  "CANARY_PROMPT",
  "CANARY_SECRET",
  "CANARY_EGRESS",
  "CANARY_WORKDIR",
  "CANARY_COMMAND",
  "CANARY_URL",
  "CANARY_TOOL",
  "CANARY_SPEC",
  "CANARY_OPERATION",
  "CANARY_AUTH"
]

describe("secrecy boundary", () => {
  it("never emits a private FIELD NAME in the public projection", () => {
    fc.assert(
      fc.property(arbManifest, (raw) => {
        const manifest = Schema.decodeUnknownSync(SkillManifest)(raw)
        const pub = toPublicListing(manifest)
        const keys = Object.keys(pub)
        for (const forbidden of PRIVATE_FIELDS) {
          expect(keys).not.toContain(forbidden)
        }
      }),
      { numRuns: 300 }
    )
  })

  it("never emits a private VALUE anywhere in the serialized payload", () => {
    fc.assert(
      fc.property(arbManifest, (raw) => {
        const manifest = Schema.decodeUnknownSync(SkillManifest)(raw)
        // Prove the private fields actually survived decode: dropping unknown fields
        // before projection must not make a secrecy regression test pass vacuously.
        expect(manifest.engine).toMatchObject(raw.engine)
        const wire = JSON.stringify(Schema.encodeSync(PublicListing)(toPublicListing(manifest)))
        // The canaries are the only place these strings exist. If any appears on the wire,
        // some field is carrying private data through a path we did not intend.
        for (const canary of CANARIES) {
          expect(wire).not.toContain(canary)
        }
      }),
      { numRuns: 300 }
    )
  })

  it("public projection round-trips through the wire schema", () => {
    fc.assert(
      fc.property(arbManifest, (raw) => {
        const manifest = Schema.decodeUnknownSync(SkillManifest)(raw)
        const pub = toPublicListing(manifest)
        const encoded = Schema.encodeSync(PublicListing)(pub)
        const decoded = Schema.decodeUnknownSync(PublicListing)(JSON.parse(JSON.stringify(encoded)))
        expect(decoded.id).toBe(pub.id)
        expect(decoded.price).toBe(pub.price)
        expect(decoded.bounds.timeoutSec).toBe(pub.bounds.timeoutSec)
        expect(decoded.rails).toEqual(pub.rails)
        expect(decoded.category).toEqual(pub.category)
      }),
      { numRuns: 100 }
    )
  })

  it("PublicListing REJECTS a payload carrying private fields", () => {
    const smuggled = {
      id: "evil-skill",
      version: "1.0.0",
      serviceName: "Evil",
      description: "d",
      tags: [],
      price: "$0.01",
      bounds: { timeoutSec: 10 },
      inputSchema: {},
      outputSchema: {},
      engine: { adapter: "script", entry: "run.ts" },
      secrets: ["ANTHROPIC_API_KEY"]
    }
    // onExcessProperty defaults to ignoring, so assert the decoded value drops them entirely
    // rather than silently carrying them through.
    const decoded = Schema.decodeUnknownSync(PublicListing)(smuggled)
    expect(Object.keys(decoded)).not.toContain("engine")
    expect(Object.keys(decoded)).not.toContain("secrets")
    expect(JSON.stringify(decoded)).not.toContain("ANTHROPIC_API_KEY")
  })
})
