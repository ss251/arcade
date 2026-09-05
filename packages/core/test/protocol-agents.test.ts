import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { AgentAnnouncement, Hello, helloDigest } from "../src/protocol.ts"

const claim = { skillId: "skill-aa", agentId: "42", registrationTx: `0x${"a".repeat(64)}` }
const base = { _tag: "Hello", runnerId: "rnr_1", seller: "0x1111111111111111111111111111111111111111",
  listings: [], maxConcurrency: 2, agentVersion: "test", nonce: "1-abc", signature: "0xsig" }
describe("public identity announcements", () => {
  it("decodes announcements and retains older Hello compatibility", () => {
    const hello = Schema.decodeUnknownSync(Hello)({ ...base, agents: [claim] })
    expect(hello.agents?.[0]).toEqual(AgentAnnouncement.make(claim))
    expect(Schema.decodeUnknownSync(Hello)(base).agents).toBeUndefined()
  })
  it("does not change the signed v2 digest", () => {
    expect(helloDigest({ runnerId: "rnr_1", seller: base.seller, nonce: "1-abc", skillIds: ["bb", "aa"] }))
      .toBe(["arcade-runner-hello", "v2", "rnr_1", base.seller, "1-abc", "aa,bb", "none"].join("\n"))
  })
  it.each(["", "-1", "01", "1.1", "1e3", " 1", (1n << 256n).toString()])("rejects noncanonical/out-of-range agent id %s", agentId => {
    expect(() => Schema.decodeUnknownSync(Hello)({ ...base, agents: [{ ...claim, agentId }] })).toThrow()
  })
  it("accepts full uint256 precision", () => {
    expect(Schema.decodeUnknownSync(AgentAnnouncement)({ ...claim, agentId: ((1n << 256n) - 1n).toString() }).agentId)
      .toBe(((1n << 256n) - 1n).toString())
  })
  it.each(["", "a", "../skill", "CAPS", "a".repeat(65)])("rejects invalid skill id %s", skillId => {
    expect(() => Schema.decodeUnknownSync(Hello)({ ...base, agents: [{ ...claim, skillId }] })).toThrow()
  })
  it.each(["", "0xreg", `0x${"a".repeat(63)}`, `0x${"g".repeat(64)}`])("rejects invalid registration hash %s", registrationTx => {
    expect(() => Schema.decodeUnknownSync(Hello)({ ...base, agents: [{ ...claim, registrationTx }] })).toThrow()
  })
  it("caps the array before a Hello can amplify registry reads", () => {
    expect(() => Schema.decodeUnknownSync(Hello)({ ...base, agents: Array(64).fill(claim) })).not.toThrow()
    expect(() => Schema.decodeUnknownSync(Hello)({ ...base, agents: Array(65).fill(claim) })).toThrow()
  })
  it("does not carry private extras from an announcement", () => {
    const hello = Schema.decodeUnknownSync(Hello)({ ...base, agents: [{ ...claim, secret: "PRIVATE", engine: { entry: "PRIVATE" } }] })
    expect(JSON.stringify(Schema.encodeSync(Hello)(hello))).not.toContain("PRIVATE")
  })
})
