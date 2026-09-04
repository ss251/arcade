import { describe, expect, it } from "vitest"
import { validateJson } from "../src/validate.ts"
import { inputGate } from "../src/input-gate.ts"

/**
 * `inputGate` lives in its own module rather than `server.ts` (which the brief shows
 * inline) because `server.ts` runs `Bun.serve` and an `Effect.never` main loop at module
 * load — importing it here would start a real server under vitest. `server.ts` imports
 * `inputGate` from this same module, so this test exercises the exact function wired into
 * the paid endpoint.
 */
describe("input gate", () => {
  const listing = { id: "usdc-flow-check", inputSchema: { type: "object", required: ["address"], properties: { address: { type: "string" } } } }
  it("returns null for a valid body", () => {
    expect(inputGate(listing as never, { address: "0xabc" })).toBeNull()
  })
  it("names the failure for an invalid body", () => {
    const r = inputGate(listing as never, {})
    expect(r).toEqual({ error: "input_invalid", detail: expect.stringContaining("inputSchema") })
  })
  it("treats a non-object body as invalid when the schema is an object", () => {
    expect(inputGate(listing as never, "x")).not.toBeNull()
    expect(validateJson("x", listing.inputSchema)).toBe(false)
  })
})
