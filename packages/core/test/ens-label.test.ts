import { describe, expect, it, vi } from "vitest"
import { pickAvailableLabel } from "../src/ens.ts"

describe("ENS label proposal, not registration consent", () => {
  it("proposes the first explicitly available candidate", async () => {
    expect(await pickAvailableLabel(["arcade", "arcade-hub"], async l => l === "arcade-hub")).toBe("arcade-hub")
  })
  it("names every attempted candidate with fixed diagnostics", async () => {
    await expect(pickAvailableLabel(["arcade", "arcade-hub"], async () => false)).rejects.toThrow(/arcade, arcade-hub/)
    await expect(pickAvailableLabel(["arcade"], () => { throw new Error("SECRET") })).rejects.not.toThrow("SECRET")
  })
  it("does not treat a provider failure as availability", async () => {
    expect(await pickAvailableLabel(["arcade", "arcade-hub"], async l => { if(l === "arcade") throw new Error("down"); return true })).toBe("arcade-hub")
  })
  it("validates bounded single-label candidates before any lookup", async () => {
    let calls = 0
    for(const candidates of [[],["x.y"],["a\n"],["a".repeat(64)],Array.from({length:17},(_,i)=>`label${i}`)]) {
      await expect(pickAvailableLabel(candidates, async()=>{calls++;return true})).rejects.toThrow()
    }
    expect(calls).toBe(0)
  })
  it("times out an unreadable proposal without hanging or selecting it", async () => {
    vi.useFakeTimers()
    try {
      const found = pickAvailableLabel(["arcade", "arcade-hub"], label => label === "arcade" ? new Promise(()=>{}) : Promise.resolve(true))
      await vi.advanceTimersByTimeAsync(5001)
      expect(await found).toBe("arcade-hub")
    } finally { vi.useRealTimers() }
  })
})
