import { describe, expect, it } from "vitest"
import {
  Lineage, ROOT_LINEAGE, childLineage, mintHireCapability, verifyHireCapability,
  HIRE_CAPABILITY_HEADER, DEFAULT_MAX_HOP
} from "../src/lineage.ts"

const SECRET = "test-secret"

describe("hire capability", () => {
  it("round-trips and names the parent", () => {
    const tok = mintHireCapability(SECRET, "job_parent0000000000", Date.now() + 60_000)
    const v = verifyHireCapability(SECRET, tok, Date.now())
    expect(v).toEqual({ parentJobId: "job_parent0000000000" })
  })
  it("refuses a tampered payload", () => {
    const tok = mintHireCapability(SECRET, "job_parent0000000000", Date.now() + 60_000)
    const [p, mac] = tok.split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), parentJobId: "job_other00000000000" })).toString("base64url")
    const v = verifyHireCapability(SECRET, `${forged}.${mac}`, Date.now())
    expect((v as { _tag?: string })._tag).toBe("LineageInvalid")
  })
  it("refuses an expired capability", () => {
    const tok = mintHireCapability(SECRET, "job_parent0000000000", Date.now() - 1)
    const v = verifyHireCapability(SECRET, tok, Date.now())
    expect((v as { _tag?: string })._tag).toBe("LineageInvalid")
  })
  it("refuses a wrong secret", () => {
    const tok = mintHireCapability("other", "job_parent0000000000", Date.now() + 60_000)
    expect((verifyHireCapability(SECRET, tok, Date.now()) as { _tag?: string })._tag).toBe("LineageInvalid")
  })
  it("exports the header name", () => {
    expect(HIRE_CAPABILITY_HEADER).toBe("x-arcade-hire-capability")
  })
  it("encodes the MAC as a 64-char lowercase hex string, base64url-encoded", () => {
    const tok = mintHireCapability(SECRET, "job_parent0000000000", Date.now() + 60_000)
    const [, m] = tok.split(".")
    const hex = Buffer.from(m!, "base64url").toString("utf8")
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("lineage derivation", () => {
  it("root has hop 0 and no ancestors", () => {
    expect(ROOT_LINEAGE("job_a")).toEqual(Lineage.make({ rootJobId: "job_a", hop: 0, ancestors: [] }))
  })
  it("child appends the parent's skill and increments hop", () => {
    const parent = { ...ROOT_LINEAGE("job_a"), skillId: "counterparty-brief" }
    const child = childLineage(parent, "job_a")
    expect(child).toEqual(Lineage.make({ rootJobId: "job_a", parentJobId: "job_a", hop: 1, ancestors: ["counterparty-brief"] }))
  })
  it("default max hop is 3", () => {
    expect(DEFAULT_MAX_HOP).toBe(3)
  })
})
