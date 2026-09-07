import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { JobAssignment } from "../src/protocol.ts"
import { escrowContextToWire } from "../../payments/src/erc8183-socket.ts"
import { fixture } from "../../payments/test/fixtures/erc8183-action.ts"
describe("escrow assignment stays explicitly distinct from legacy execution", () => {
  it("preserves closed escrow context without changing legacy assignment shape", async () => {
    const f = await fixture("submit"), escrow = escrowContextToWire(f.context)
    const base = { _tag: "JobAssignment", jobId: "job_" + "a".repeat(32), skillId: "skill", skillVersion: "1.0.0", input: {}, timeoutSec: 60 }
    expect(Schema.decodeUnknownSync(JobAssignment)(base)).not.toHaveProperty("escrow")
    const decoded = Schema.decodeUnknownSync(JobAssignment)({ ...base, escrow })
    expect(decoded).toHaveProperty("escrow", escrow)
    expect(Schema.encodeSync(JobAssignment)(decoded)).toHaveProperty("escrow", escrow)
  })
  it("does not erase malformed escrow context and downgrade it into ordinary work", async () => {
    const f = await fixture("submit"), escrow = escrowContextToWire(f.context)
    for (const bad of [{ ...escrow, capability: "forbidden" }, { ...escrow, jobId: "07" },
      { ...escrow, call: { ...escrow.call, chainId: 1 } }, null])
      expect(() => Schema.decodeUnknownSync(JobAssignment)({ _tag: "JobAssignment", jobId: "fixture", skillId: "skill",
        skillVersion: "1.0.0", input: {}, timeoutSec: 60, escrow: bad })).toThrow()
  })
})
