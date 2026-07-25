import { describe, expect, it } from "vitest"
import { Effect, Ref } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import {
  ARC_CAIP2,
  GATEWAY_MIN_VALIDITY_SECONDS,
  USDC_ADDRESS,
  parsePrice
} from "@arcade/core"
import {
  PaymentPayload,
  makeTestRail,
  makeTestState,
  makeEip3009Rail,
  makeGatewayRail,
  signAuthorization,
  type Rail,
  type TestRailState
} from "../src/index.ts"

/**
 * RAIL CONFORMANCE.
 *
 * Every rail — the proven EIP-3009 one, the Gateway one, and the in-memory test one —
 * must agree on the shape of a challenge and on which authorizations are rejected.
 * Running one suite against all three is what stops the non-default rail from rotting,
 * and it is why swapping rails is a Layer change rather than a rewrite.
 *
 * Chain-touching assertions live in *.live.test.ts (excluded by default); everything here
 * is offline and deterministic.
 */

const buyer = privateKeyToAccount(generatePrivateKey())
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const PRICE = parsePrice("$0.25")

const facilitator = privateKeyToAccount(generatePrivateKey())

interface Candidate {
  readonly label: string
  readonly rail: Rail
  readonly state?: Ref.Ref<TestRailState>
}

const testState = Effect.runSync(
  Ref.make(makeTestState({ [buyer.address]: 10_000_000n }))
)

const candidates: Array<Candidate> = [
  { label: "EIP3009Live", rail: makeEip3009Rail({ facilitator }) },
  { label: "GatewayLive", rail: makeGatewayRail() },
  { label: "RailTest", rail: makeTestRail(testState), state: testState }
]

const makePayload = async (over: Partial<PaymentPayload["payload"]> = {}) => {
  const signed = await Effect.runPromise(
    signAuthorization({ account: buyer, to: SELLER, valueAtomic: PRICE })
  )
  return PaymentPayload.make({
    x402Version: 2,
    scheme: "exact",
    network: ARC_CAIP2,
    payload: { ...signed, ...over }
  })
}

describe.each(candidates)("rail conformance: $label", ({ rail }) => {
  it("issues a well-formed Arc 402 challenge", async () => {
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    expect(req.scheme).toBe("exact")
    expect(req.network).toBe(ARC_CAIP2)
    expect(req.asset).toBe(USDC_ADDRESS)
    expect(req.payTo).toBe(SELLER)
    expect(req.amount).toBe(PRICE.toString())
    // Gateway rejects anything under 7 days; all rails advertise the same window so a
    // buyer can sign once and pay either.
    expect(req.maxTimeoutSeconds).toBe(GATEWAY_MIN_VALIDITY_SECONDS)
  })

  it("advertises the Gateway marker only on the gateway rail", async () => {
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    if (rail.name === "gateway") {
      expect(req.extra["name"]).toBe("GatewayWalletBatched")
      expect(req.extra["version"]).toBe("1")
    } else {
      expect(req.extra["name"]).toBeUndefined()
    }
  })

  it("rejects an underpaying authorization", async () => {
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const payload = await makePayload({ value: (PRICE - 1n).toString() })
    const exit = await Effect.runPromiseExit(rail.verify(payload, req))
    expect(exit._tag).toBe("Failure")
  })

  it("rejects an authorization payable to the wrong address", async () => {
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const payload = await makePayload({ to: "0x000000000000000000000000000000000000dEaD" })
    const exit = await Effect.runPromiseExit(rail.verify(payload, req))
    expect(exit._tag).toBe("Failure")
  })

  it("rejects an expired authorization", async () => {
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const past = Math.floor(Date.now() / 1000) - 10
    const payload = await makePayload({ validBefore: past.toString() })
    const exit = await Effect.runPromiseExit(rail.verify(payload, req))
    expect(exit._tag).toBe("Failure")
  })
})

describe("RailTest semantics (used by the hub pipeline tests)", () => {
  it("accepts a funded, well-formed authorization and moves balance on settle", async () => {
    const ref = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 10_000_000n })))
    const rail = makeTestRail(ref)
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const payload = await makePayload()

    const verified = await Effect.runPromise(rail.verify(payload, req))
    expect(verified.amountAtomic).toBe(PRICE)

    // Verification alone must NOT move money — the seller hasn't worked yet.
    const midway = Effect.runSync(Ref.get(ref))
    expect(midway.balances.get(buyer.address.toLowerCase())).toBe(10_000_000n)

    const settled = await Effect.runPromise(rail.settle(verified))
    expect(settled.txHash).toMatch(/^0xtest/)

    const after = Effect.runSync(Ref.get(ref))
    expect(after.balances.get(buyer.address.toLowerCase())).toBe(10_000_000n - PRICE)
    expect(after.balances.get(SELLER.toLowerCase())).toBe(PRICE)
  })

  it("rejects a replayed nonce", async () => {
    const ref = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 10_000_000n })))
    const rail = makeTestRail(ref)
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const payload = await makePayload()

    const verified = await Effect.runPromise(rail.verify(payload, req))
    await Effect.runPromise(rail.settle(verified))

    const replay = await Effect.runPromiseExit(rail.verify(payload, req))
    expect(replay._tag).toBe("Failure")
  })

  it("rejects an unfunded payer", async () => {
    const ref = Effect.runSync(Ref.make(makeTestState({})))
    const rail = makeTestRail(ref)
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const payload = await makePayload()
    const exit = await Effect.runPromiseExit(rail.verify(payload, req))
    expect(exit._tag).toBe("Failure")
  })
})
