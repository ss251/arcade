import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { helloDigest, SkillManifest } from "@arcade/core"
import { dispatchMap, gate } from "../src/publishable.ts"
import type { LoadedSkill } from "../src/skills.ts"

/**
 * The gate has to bind EXECUTION, not just announcement.
 *
 * It previously did not. The daemon filtered the listings it announced but built its
 * dispatch map from every skill on disk, so a subscription-backed skill was unlisted and
 * still runnable — a hub that named its id got it executed on the seller's seat and
 * settled. `docs/threat-model.md` claimed the gate "refuses on both routes to the hub";
 * it refused one. These tests exist so that cannot regress silently, since `daemon.ts`
 * itself has no coverage.
 */

const skill = (id: string, credential?: string): LoadedSkill => ({
  dir: `/tmp/${id}`,
  manifest: Schema.decodeUnknownSync(SkillManifest)({
    id,
    version: "1.0.0",
    serviceName: "T",
    description: "d",
    tags: [],
    price: "$0.01",
    bounds: { timeoutSec: 10 },
    inputSchema: {},
    outputSchema: {},
    engine: {
      adapter: "claude-agent",
      entry: "agent.ts",
      ...(credential === undefined ? {} : { credential })
    },
    secrets: [],
    egress: []
  })
})

describe("publish gate", () => {
  it("separates sellable from refused", () => {
    const g = gate([skill("ok-one"), skill("seat-one", "subscription"), skill("ok-two")])

    expect(g.sellable.map((s) => s.manifest.id)).toEqual(["ok-one", "ok-two"])
    expect(g.refused.map((r) => r.skillId)).toEqual(["seat-one"])
  })

  it("gives a reason for every refusal, so the daemon can say why once", () => {
    const g = gate([skill("seat", "subscription")])
    expect(g.refused[0]?.reason).toMatch(/api-key/)
  })

  it("treats an unspecified credential as sellable", () => {
    // The default is `api-key`, so silence is the sellable case and a seat is deliberate.
    expect(gate([skill("plain")]).sellable).toHaveLength(1)
  })
})

describe("dispatch map", () => {
  it("cannot reach a refused skill", () => {
    // THE regression this file exists for. Unlisted is not enough: the hub sends a skill
    // id, and if the map has an entry the runner executes it.
    const g = gate([skill("sellable-one"), skill("seat-one", "subscription")])
    const byId = dispatchMap(g)

    expect(byId.has("sellable-one")).toBe(true)
    expect(byId.has("seat-one")).toBe(false)
    expect(byId.size).toBe(g.sellable.length)
  })

  it("is derived from the same set that is announced", () => {
    // Announced and dispatchable must be the same set by construction, not by two
    // independent filters that can drift apart — which is exactly how this broke.
    const g = gate([skill("aa"), skill("bb", "subscription"), skill("cc")])
    expect([...dispatchMap(g).keys()].sort()).toEqual(g.sellable.map((s) => s.manifest.id).sort())
  })

  it("is empty when every skill is refused", () => {
    expect(dispatchMap(gate([skill("s1", "subscription"), skill("s2", "subscription")])).size).toBe(0)
  })
})

describe("hello digest", () => {
  /**
   * The runner signs this with the key controlling its payout address, and the hub
   * recovers it. Both sides must derive identical bytes — a mismatch fails every
   * handshake, and a digest that ignores a field lets that field be tampered with.
   */

  const base = { runnerId: "rnr_1", seller: "0xAbC", nonce: "123-xyz", skillIds: ["b", "a"] }

  it("is stable across skill ordering", () => {
    // The runner's listing order is incidental; a signature that depended on it would fail
    // intermittently for no reason a seller could diagnose.
    expect(helloDigest(base)).toBe(helloDigest({ ...base, skillIds: ["a", "b"] }))
  })

  it("is case-insensitive on the address, which is checksummed inconsistently in the wild", () => {
    expect(helloDigest(base)).toBe(helloDigest({ ...base, seller: "0xabc" }))
  })

  it("changes when any signed field changes", () => {
    const d = helloDigest(base)
    expect(helloDigest({ ...base, runnerId: "rnr_2" })).not.toBe(d)
    expect(helloDigest({ ...base, seller: "0xdef" })).not.toBe(d)
    expect(helloDigest({ ...base, nonce: "999-abc" })).not.toBe(d)
    // The skill set is signed too: otherwise a captured handshake could be replayed with
    // a different listing attached.
    expect(helloDigest({ ...base, skillIds: ["a", "b", "c"] })).not.toBe(d)
  })

  it("is domain-separated and versioned", () => {
    // So a signature for this protocol can never be a valid signature for another one.
    expect(helloDigest(base).startsWith("arcade-runner-hello\nv1\n")).toBe(true)
  })
})
