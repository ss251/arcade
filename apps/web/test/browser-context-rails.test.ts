/** Offline producer/consumer composition only: no signing, verification or settlement. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect, Ref } from "effect"
import { loadChainConfig } from "@arcade/core"
import { makeEip3009Rail, makeGatewayRail, makeTestRail, makeTestState, type Rail } from "@arcade/payments"
import { capturePurchaseContext } from "../src/lib/purchase-context.ts"

const SELLER = "0x1111111111111111111111111111111111111111"
const SPLITTER = "0x2222222222222222222222222222222222222222"
const ORIGIN = "https://hub.example"
const RESOURCE = `/x/${SELLER}/diff-triage`
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe("actual rail challenges compose with passive browser capture", () => {
  it.each(["eip3009-direct", "eip3009-v1", "eip3009-v2", "gateway", "test"] as const)("retains %s wire fields without IO", async mode => {
    vi.stubEnv("ARCADE_NETWORK", "arc-testnet")
    const io = vi.fn((): never => { throw Error("Network/client IO forbidden in passive composition") })
    vi.stubGlobal("fetch", io)
    try {
      const chain = loadChainConfig()
      const rail: Rail = mode === "gateway" ? makeGatewayRail() : mode === "test"
        ? makeTestRail(await Effect.runPromise(Ref.make(makeTestState())))
        : makeEip3009Rail({ chain, facilitator: { address: SELLER, type: "json-rpc" },
          publicClient: { readContract: io }, walletClient: { sendTransaction: io } })
      const splitter = mode === "eip3009-v1" || mode === "eip3009-v2"
      const produced = await Effect.runPromise(rail.challenge({ priceAtomic: 10000n,
        payTo: SELLER, resource: ORIGIN + RESOURCE, description: "Passive fixture",
        ...(splitter ? { feeSplitter: SPLITTER, feeSplitterVersion: mode === "eip3009-v1" ? 1 : 2 } : {}) }))
      // HTTP strips Schema prototypes and absent optional properties. Capture the
      // real serialized output instead of hand-writing a convenient wire fixture.
      const requirements = JSON.parse(JSON.stringify(produced)) as Record<string, unknown>
      const input = { hubOrigin: ORIGIN, skillId: "diff-triage", seller: SELLER,
        resource: RESOURCE, amountAtomic: "10000", payTo: splitter ? SPLITTER : SELLER,
        asset: chain.usdc.address, network: chain.caip2, rail: rail.name, requirements }
      const captured = capturePurchaseContext(input)
      expect(captured).toEqual(input)
      expect(captured?.requirements).not.toBe(requirements)
      expect(captured?.rail).toBe(rail.name)
      expect(io).not.toHaveBeenCalled()
      if (mode === "test") expect(captured?.rail).not.toBe("eip3009")
    } finally { vi.unstubAllGlobals() }
  })
})
