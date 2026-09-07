import { describe, expect, test } from "bun:test"
import { profileDelegateReadCost } from "./delegate-funding-timing.ts"
import type { DelegateProofChain } from "./delegate-funding-chain.ts"
describe("keyless delegate timing prerequisite", () => {
  function fake(fail = false) {
    let reads = 0
    const read = async () => { reads++; if (fail) throw Error("provider_secret_error"); return undefined }
    const chain = { client: { getChainId: read, getCode: read, readContract: read, getBalance: read, getBlockNumber: read }, available: read } as unknown as DelegateProofChain
    return { chain, reads: () => reads }
  }
  test("a complete cost inventory reaches only the non-network stub, never a transfer", async () => {
    const f = fake(), result = await profileDelegateReadCost(f.chain, new AbortController().signal)
    expect(result.complete).toBe(true); expect(result.dispatchReached).toBe(true)
    expect(result.readFailed).toBe(false); expect(result.actualTransferRequests).toBe(0)
    expect(f.reads()).toBe(17)
  })
  test("read failure and cancellation refuse before the stub without retaining raw diagnostics", async () => {
    const f = fake(true), result = await profileDelegateReadCost(f.chain, new AbortController().signal)
    expect(result.complete).toBe(false); expect(result.dispatchReached).toBe(false); expect(result.readFailed).toBe(true)
    expect(JSON.stringify(result)).not.toContain("secret")
    const controller = new AbortController(); controller.abort()
    const cancelled = fake(), observed = await profileDelegateReadCost(cancelled.chain, controller.signal)
    expect(observed.dispatchReached).toBe(false); expect(cancelled.reads()).toBe(0)
  })
})
