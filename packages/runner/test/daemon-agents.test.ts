import { describe, expect, it } from "vitest"
import { agentAnnouncementsFor } from "../src/daemon.ts"
const identity = { agentId: "42", registrationTx: `0x${"a".repeat(64)}`, agentURI: "https://hub/agent",
  registeredAtMs: 1, operator: "0x1111111111111111111111111111111111111111", private: "PRIVATE_CONFIG" }
describe("daemon public agent projection", () => {
  it("announces only serving skills and only public identity fields", () => {
    expect(agentAnnouncementsFor({ "skill-aa": identity, "not-served": identity }, [{ id: "skill-aa" }]))
      .toEqual([{ skillId: "skill-aa", agentId: "42", registrationTx: identity.registrationTx }])
  })
  it("keeps older configurations with no agents working", () => {
    expect(agentAnnouncementsFor(undefined, [{ id: "skill-aa" }])).toEqual([])
  })
  it("caps serving announcements at the protocol limit", () => {
    const ids = Array.from({ length: 70 }, (_, n) => `skill-${n}`)
    expect(agentAnnouncementsFor(Object.fromEntries(ids.map(id => [id, identity])), ids.map(id => ({ id })))).toHaveLength(64)
  })
})
