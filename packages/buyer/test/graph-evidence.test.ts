import { describe, expect, it, vi } from "vitest"
import { checkedGraphEvidence, graphEvidenceLine } from "../src/graph-evidence.ts"
const good = { agentId: "5042002:7", settlementCount: 11, feedbackCount: 5, validationPassCount: 4 }
describe("bounded inert Graph evidence", () => {
  it("projects own scalar fields only and captures a defensive frozen copy", () => {
    const input = { ...good, secret: "PRIVATE_GRAPH", future: { token: "PRIVATE_GRAPH" } }
    const output = checkedGraphEvidence(input)
    input.feedbackCount = 999
    expect(output).toEqual(good); expect(Object.isFrozen(output)).toBe(true)
    expect(graphEvidenceLine(output)).toContain("11 settlements")
  })
  it("keeps zero indexed settlements separate from unavailable and other counts", () => {
    expect(graphEvidenceLine(undefined)).toBe("")
    const line = graphEvidenceLine({ ...good, settlementCount: 0 })
    expect(line).toContain("no settlements indexed yet"); expect(line).toContain("5 feedback entries")
    expect(line).toContain("4 validations passed"); expect(line).toContain("cached")
    expect(line).toContain("Arc testnet eip155:5042002"); expect(line).toContain("via The Graph")
    expect(line).not.toMatch(/all.*zero|settlement-backed feedback|verified settlement|score|rank/i)
  })
  it.each([null, [], 7, "PRIVATE_GRAPH", {}, Object.create(good), { ...good, agentId: "1:7" },
    { ...good, agentId: "5042002:07" }, { ...good, agentId: "5042002:7\nPRIVATE" },
    { ...good, agentId: `5042002:${1n << 256n}` }, { ...good, settlementCount: -1 },
    { ...good, feedbackCount: "5" }, { ...good, validationPassCount: Number.MAX_SAFE_INTEGER + 1 },
    { ...good, feedbackCount: NaN }, { ...good, validationPassCount: 1.1 }])("refuses malformed evidence without reflecting it", raw => {
    expect(checkedGraphEvidence(raw)).toBeUndefined(); expect(graphEvidenceLine(raw)).toBe("")
  })
  it("does not execute accessors or stringify hooks and contains revoked proxy errors", () => {
    const getter = vi.fn(() => { throw Error("PRIVATE_GRAPH") })
    const access = Object.defineProperty({ ...good }, "agentId", { enumerable: true, get: getter })
    expect(graphEvidenceLine(access)).toBe(""); expect(getter).not.toHaveBeenCalled()
    const hook = vi.fn(() => { throw Error("PRIVATE_GRAPH") })
    expect(checkedGraphEvidence({ ...good, toJSON: hook })).toEqual(good); expect(hook).not.toHaveBeenCalled()
    const proxy = Proxy.revocable({ ...good }, {}); proxy.revoke()
    expect(graphEvidenceLine(proxy.proxy)).toBe("")
  })
})
