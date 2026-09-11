import { describe, expect, it } from "vitest"
import { createApprovalRevealPolicy } from "../src/lib/approval-reveal.ts"

describe("live approval heading reveal", () => {
  it("reveals each live decision once; repeated quote or wallet renders do not move the reader", () => {
    const policy = createApprovalRevealPolicy()
    policy.register("live-a", true)
    expect(policy.reveal("live-a")).toBe(true)
    policy.register("live-a", true)
    expect(policy.reveal("live-a")).toBe(false)
    policy.register("live-b", true)
    expect(policy.reveal("live-b")).toBe(true)
  })

  it("does not reveal historical or unregistered transcript requests", () => {
    const policy = createApprovalRevealPolicy()
    policy.register("restored", false)
    expect(policy.reveal("restored")).toBe(false)
    expect(policy.reveal("claimed-approved-by-model")).toBe(false)
  })

  it("preserves a reader already looking at earlier messages when the request arrives", () => {
    const policy = createApprovalRevealPolicy()
    policy.setFollowing(false)
    policy.register("live", true)
    policy.setFollowing(true)
    expect(policy.reveal("live")).toBe(false)
  })

  it("respects scrolling back while terms load, and a later explicit return to latest applies only to new requests", () => {
    const policy = createApprovalRevealPolicy()
    policy.register("loading", true)
    policy.setFollowing(false)
    expect(policy.reveal("loading")).toBe(false)
    policy.setFollowing(true)
    expect(policy.reveal("loading")).toBe(false)
    policy.register("next", true)
    expect(policy.reveal("next")).toBe(true)
  })
})
