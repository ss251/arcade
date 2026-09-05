import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { CONTRADICTION_CODES, EVIDENCE_FLAGS } from "../synthesize.ts"
import { assessAddressSchemaOk } from "../validate-output.ts"

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8")
const guide = () => read("SKILL.md")

describe("G13 public skill guide stays within the implemented evidence boundary", () => {
  it("names both exact payment networks, token addresses and bounded per-query economics", () => {
    const text = guide(), manifest = JSON.parse(read("arcade.json"))
    expect(text).toContain(manifest.price)
    for (const value of ["eip155:5042002", "eip155:8453", "0x3600000000000000000000000000000000000000",
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "10000", "at most two", "$0.02"]) expect(text).toContain(value)
    expect(text).toMatch(/Base-mainnet spending remains OWNER-gated/)
  })
  it("does not claim raw hashes or query payments verify a counterparty service", () => {
    const text = guide()
    expect(text).toContain("no counterparty service-settlement verifier")
    expect(text).toContain("never returns `allow`")
    expect(text).toContain("`attesterSettledCount` stays `0`")
    expect(text).toContain("Query payment is not counterparty service-payment proof")
    expect(text).not.toContain("safe to transact with")
  })
  it("requires one explicit credential route without printing or deleting a real key", () => {
    const text = guide()
    expect(text).toContain("exactly one")
    for (const name of ["GRAPH_X402_PAYER_KEY", "GRAPH_X402_KEYCHAIN_SERVICE"]) expect(text).toContain(name)
    expect(text).toContain("no default Keychain item")
    expect(text).not.toMatch(/security\s+(find|delete|add)-generic-password/)
    expect(text).not.toMatch(/(?:echo|printenv)\s+.*(?:KEY|key)/)
  })
  it("publishes every stable contradiction and completeness code without hiding uncertainty", () => {
    const text = guide()
    for (const code of [...CONTRADICTION_CODES, ...EVIDENCE_FLAGS]) expect(text).toContain(`\`${code}\``)
    expect(text).toContain("null means unknown")
    expect(text).toContain("first block hash")
  })
  it("contains a strict schema-valid illustrative output rather than forged live evidence", () => {
    const text = guide(), examples = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)]
    expect(examples).toHaveLength(2)
    expect(JSON.parse(examples[0]![1]!)).toEqual({ address: "0x1111111111111111111111111111111111111111" })
    const result: unknown = JSON.parse(examples[1]![1]!)
    expect(assessAddressSchemaOk(result)).toBe(true)
    expect(text).toContain("Illustrative contract example, not a live result")
  })
  it("pins the current source and honest unsigned-only proof checkpoint", () => {
    const text = guide()
    expect(text).toContain("43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb")
    expect(text).toContain("2026-09-05T09:54:03.618Z")
    expect(text).toContain("unsigned 402")
    expect(text).toContain("No paid Graph query is claimed")
    expect(text).not.toMatch(/MCP.*was used|one-constant change/)
  })
  it("states uncertainty reconciliation and the actual no-output refusal protocol", () => {
    const text = guide()
    expect(text).toContain('`stopReason: "refusal"`')
    expect(text).toContain("no `output`")
    expect(text).toContain("No automatic paid retry")
    expect(text).toContain("seller may pay for Graph data and earn nothing on Arc")
    expect(text).toContain("reconcile before any new run")
  })
})
