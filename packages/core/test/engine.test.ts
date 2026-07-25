import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import * as fc from "fast-check"
import {
  advisoryFor,
  assertPublishable,
  credentialOf,
  assertManifestPublishable,
  defaultCredential,
  NotPublishable,
  SkillManifest,
  termsFor,
  type EngineAdapter
} from "../src/index.ts"

/**
 * The publish gate.
 *
 * All three providers forbid selling what a personal subscription produces, though by
 * different wording — Anthropic's Consumer Terms §3 ("resell the Services", and no access
 * "through automated or non-human means" outside an API key) and §2 ("may not make your
 * Account available to anyone else"); OpenAI's consumer Terms of Use ("Modify, copy, lease,
 * sell or distribute any of our Services", "Automatically or programmatically extract data
 * or Output"); xAI's AUP ("reselling any Input or Output").
 *
 * Their API terms are NOT symmetrical, which is why `advisoryFor` exists — see
 * `engine.ts` and `docs/terms.md`.
 *
 * So this is not a policy preference to be documented and hoped for. These tests exist to
 * make sure a seat-backed skill cannot reach the hub by any route.
 */

const manifest = (over: Record<string, unknown> = {}) =>
  Schema.decodeUnknownSync(SkillManifest)({
    id: "test-skill",
    version: "1.0.0",
    serviceName: "Test",
    description: "d",
    tags: [],
    price: "$0.01",
    bounds: { timeoutSec: 30 },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    engine: { adapter: "claude-agent", entry: "agent.ts" },
    ...over
  })

describe("credential defaults", () => {
  it("never defaults to a subscription", () => {
    // Defaulting to the seat would make the unsellable case the easy one, and a seller
    // would discover the problem at publish time rather than at design time.
    for (const a of ["claude-api", "claude-agent", "codex", "grok"] as const) {
      expect(defaultCredential(a)).toBe("api-key")
    }
  })

  it("gives a script no credential at all", () => {
    expect(defaultCredential("script")).toBe("none")
  })

  it("reads the manifest's choice when it makes one", () => {
    expect(credentialOf(manifest({ engine: { adapter: "claude-agent", entry: "a.ts", credential: "subscription" } })))
      .toBe("subscription")
  })
})

describe("publish gate", () => {
  it("refuses a subscription-backed skill", () => {
    expect(() => assertPublishable("s", "claude-agent", "subscription")).toThrow(NotPublishable)
  })

  it("allows the same engine on an API key", () => {
    expect(() => assertPublishable("s", "claude-agent", "api-key")).not.toThrow()
  })

  it("allows a script, which involves no provider at all", () => {
    expect(() => assertPublishable("s", "script", "none")).not.toThrow()
  })

  it("refuses a seat on every engine that can take one", () => {
    // The restriction follows the credential, not the vendor: every provider prohibits
    // selling what a consumer subscription produces, whatever wording they use.
    for (const a of ["claude-agent", "codex", "grok"] as const) {
      expect(() => assertPublishable("s", a, "subscription")).toThrow(NotPublishable)
    }
  })

  it("tells the seller how to fix it rather than only that they cannot", () => {
    try {
      assertPublishable("s", "codex", "subscription")
      throw new Error("should have thrown")
    } catch (e) {
      const err = e as NotPublishable
      expect(err.reason).toMatch(/api-key/)
      expect(err.reason).toMatch(/still run locally/i)
      // Each provider named, because the seller needs to know which rule binds them.
      expect(err.reason).toMatch(/Anthropic/)
      expect(err.reason).toMatch(/OpenAI/)
      expect(err.reason).toMatch(/xAI/)
    }
  })

  it("gates the manifest path too, not just the raw call", () => {
    const seat = manifest({ engine: { adapter: "claude-agent", entry: "a.ts", credential: "subscription" } })
    expect(() => assertManifestPublishable(seat)).toThrow(NotPublishable)
    expect(() => assertManifestPublishable(manifest())).not.toThrow()
  })

  it("refuses on the default when a manifest omits the credential", () => {
    // A manifest that says nothing gets `api-key`, so silence is the sellable case and a
    // seat is always a deliberate act.
    expect(() => assertManifestPublishable(manifest())).not.toThrow()
    expect(credentialOf(manifest())).toBe("api-key")
  })
})

describe("advisories", () => {
  it("flags Grok on an API key without refusing it", async () => {
    // xAI's AUP binds API users and prohibits "reselling any Input or Output". That is
    // probably not aimed at products built on their API, but it is unresolved — and an
    // unresolved licensing question belongs in front of the seller, not buried.
    const terms = termsFor("grok", "api-key")
    expect(terms.sellable).toBe(true)
    expect(terms.advisory).toMatch(/reselling any Input or Output/)
    expect(advisoryFor("grok", "api-key")).toBeDefined()
  })

  it("attaches no advisory to providers whose API terms are explicit", async () => {
    // Anthropic §A.1 and OpenAI §2.2 both permit powering products for end users in so
    // many words, so there is nothing to caveat.
    expect(advisoryFor("claude-api", "api-key")).toBeUndefined()
    expect(advisoryFor("claude-agent", "api-key")).toBeUndefined()
    expect(advisoryFor("codex", "api-key")).toBeUndefined()
    expect(advisoryFor("script", "none")).toBeUndefined()
  })

  it("does not let an advisory soften a refusal", async () => {
    const seat = termsFor("grok", "subscription")
    expect(seat.sellable).toBe(false)
    expect(seat.advisory).toBeUndefined()
  })
})

describe("sellability is a total function", () => {
  it("classifies every adapter and credential pair without throwing", () => {
    const adapters: ReadonlyArray<EngineAdapter> = [
      "script",
      "claude-api",
      "claude-agent",
      "codex",
      "grok"
    ]
    fc.assert(
      fc.property(
        fc.constantFrom(...adapters),
        fc.constantFrom("none" as const, "api-key" as const, "subscription" as const),
        (adapter, credential) => {
          const terms = termsFor(adapter, credential)
          // The one invariant that must hold for every future engine: a subscription is
          // never sellable, and anything sellable carries no refusal reason.
          expect(terms.sellable).toBe(credential !== "subscription")
          if (!terms.sellable) expect(terms.reason).toBeTruthy()
        }
      )
    )
  })
})
