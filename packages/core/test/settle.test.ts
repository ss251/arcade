import { describe, expect, it } from "vitest"
import { JobOutcome, isRefusal, shouldSettle } from "../src/job.ts"

/**
 * D2 — every path by which a job can fail must leave the buyer's balance untouched.
 * These cases are the contract the hub's settle pipeline is written against.
 */

const outcome = (over: Partial<ConstructorParameters<typeof JobOutcome>[0]>): JobOutcome =>
  JobOutcome.make({
    status: "succeeded",
    output: { ok: true },
    startedAtMs: 0,
    finishedAtMs: 100,
    ...over
  } as ConstructorParameters<typeof JobOutcome>[0])

describe("settle-on-success", () => {
  it("settles a clean, schema-valid, non-empty success", () => {
    const d = shouldSettle(outcome({}), true)
    expect(d.settle).toBe(true)
  })

  it("does NOT settle when the engine refused — detected via stop_reason, not exit code", () => {
    const d = shouldSettle(outcome({ stopReason: "refusal" }), true)
    expect(d.settle).toBe(false)
    expect(d.reason).toContain("refused")
  })

  it("treats Fable-era reasoning_extraction refusals as refusals too", () => {
    expect(isRefusal("reasoning_extraction")).toBe(true)
    expect(isRefusal("content_filter")).toBe(true)
    expect(isRefusal("end_turn")).toBe(false)
    expect(isRefusal(undefined)).toBe(false)
  })

  it("does NOT settle when output failed the listing's schema", () => {
    const d = shouldSettle(outcome({}), false)
    expect(d.settle).toBe(false)
    expect(d.reason).toContain("outputSchema")
  })

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["whitespace", "   "],
    ["empty array", []],
    ["empty object", {}]
  ])("does NOT settle on empty output (%s)", (_label, output) => {
    const d = shouldSettle(outcome({ output }), true)
    expect(d.settle).toBe(false)
    expect(d.reason).toBe("output is empty")
  })

  it.each(["refused", "invalid", "timeout", "bounds_exceeded", "runner_lost", "failed"] as const)(
    "does NOT settle in terminal failure state %s",
    (status) => {
      const d = shouldSettle(outcome({ status }), true)
      expect(d.settle).toBe(false)
    }
  )

  it("does NOT settle a job still running or queued", () => {
    expect(shouldSettle(outcome({ status: "queued" }), true).settle).toBe(false)
    expect(shouldSettle(outcome({ status: "running" }), true).settle).toBe(false)
  })
})
