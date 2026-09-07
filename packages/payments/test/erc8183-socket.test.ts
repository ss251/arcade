import { expect, it } from "vitest"
import { escrowContextFromWire, escrowContextToWire } from "../src/erc8183-socket.ts"
import { fixture } from "./fixtures/erc8183-action.ts"
it("roundtrips full precision action context without keys or capability", async () => {
  const f = await fixture(), context = { ...f.context, jobId: (1n << 256n) - 1n,
    call: { ...f.context.call, providerAgentId: (1n << 256n) - 1n } }
  const wire = escrowContextToWire(context)
  expect(wire.jobId).toBe(((1n << 256n) - 1n).toString())
  expect(escrowContextFromWire(JSON.parse(JSON.stringify(wire)))).toEqual(context)
  expect(Object.isFrozen(wire)).toBe(true); expect(Object.isFrozen(wire.call)).toBe(true)
  expect(Object.keys(wire).sort()).toEqual(["call", "client", "expiredAt", "jobId", "requestHash", "treasury"])
})
it("refuses lossy numbers, getters, extra private fields and invalid semantic facts", async () => {
  const f = await fixture(), wire = escrowContextToWire(f.context)
  for (const value of [{ ...wire, jobId: 7 }, { ...wire, capability: "private" },
    { ...wire, call: { ...wire.call, amount: "0" } }, { ...wire, requestHash: "0x" + "00".repeat(32) }])
    expect(() => escrowContextFromWire(value)).toThrow(/^escrow_facts_refused$/)
  let read = false
  const source = { ...wire }
  Object.defineProperty(source, "jobId", { enumerable: true, get() { read = true; return "7" } })
  expect(() => escrowContextFromWire(source)).toThrow(/^escrow_facts_refused$/); expect(read).toBe(false)
})
