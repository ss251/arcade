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
  PaymentRequirements,
  makeTestRail,
  makeTestState,
  makeEip3009Rail,
  makeGatewayRail,
  signAuthorization,
  type Rail,
  type SettleTree,
  type TestRailState,
  type VerifiedPayment
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

/** A representative tree commitment — the exact shape Task 6 hands `rail.settle` for a root
 *  job that hired. Every rail must accept a `tree` argument on `settle`, even the two that
 *  have no on-chain splitter (RailTest) or no v2 splitter selected (a plain settle). */
const A_TREE: SettleTree = { treeHash: `0x${"11".repeat(32)}`, childCount: 0, childTotalAtomic: 0n }

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

/** Builds a canonical v2 payload; `over` tweaks the authorization fields. */
const makePayload = async (
  over: Partial<PaymentPayload["payload"]["authorization"]> = {},
  requirements?: PaymentRequirements
) => {
  const signed = await Effect.runPromise(
    signAuthorization({ account: buyer, to: SELLER, valueAtomic: PRICE })
  )
  const { signature, ...authorization } = signed
  return PaymentPayload.make({
    x402Version: 2,
    payload: { authorization: { ...authorization, ...over }, signature },
    accepted:
      requirements ??
      PaymentRequirements.make({
        scheme: "exact",
        network: ARC_CAIP2,
        amount: PRICE.toString(),
        asset: USDC_ADDRESS,
        payTo: SELLER,
        resource: "/x/ss251/demo",
        mimeType: "application/json",
        maxTimeoutSeconds: GATEWAY_MIN_VALIDITY_SECONDS,
        extra: {}
      })
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
      // Gateway signs against its own domain, not the token's.
      expect(req.extra["name"]).toBe("GatewayWalletBatched")
      expect(req.extra["version"]).toBe("1")
      expect(req.extra["verifyingContract"]).toBeDefined()
    }
  })

  it("always carries an EIP-712 domain a third-party client can sign against", async () => {
    /**
     * REGRESSION GUARD. Circle's own CLI refused to pay us with:
     *   "EIP-712 domain parameters (name, version) are required in payment requirements
     *    for asset 0x3600…"
     * Our buyer masked it by hardcoding USDC/2. Every rail must publish a domain so ANY
     * x402 client can construct the signature.
     */
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    expect(req.extra["name"], `${rail.name} rail must publish extra.name`).toBeDefined()
    expect(req.extra["version"], `${rail.name} rail must publish extra.version`).toBeDefined()
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

  it("accepts a tree argument on settle (Task 7) and still succeeds", async () => {
    const ref = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 10_000_000n })))
    const rail = makeTestRail(ref)
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const payload = await makePayload()
    const verified = await Effect.runPromise(rail.verify(payload, req))
    const settled = await Effect.runPromise(rail.settle(verified, A_TREE))
    expect(settled.txHash).toMatch(/^0xtest/)
  })
})

describe("settle(verified, tree) — the arg is accepted by every rail", () => {
  /**
   * TASK 7. `Rail.settle` widened to `(verified, tree?)` so a root job with children can
   * commit its receipt tree's hash on chain via FeeSplitterV2's `settleWithTree`. Every
   * rail must accept the argument — RailTest and a plain (non-v2) EIP-3009 settle simply
   * ignore it; only a v2 splitter selected via `extra.feeSplitterVersion === 2` acts on it.
   * Genuinely exercising GatewayLive's and EIP3009Live's success path means stubbing the
   * network boundary each depends on (the facilitator HTTP call; the broadcasting wallet
   * client), the same way `publicClient` already does for `verify` above — real chain and
   * facilitator calls stay out of this offline, deterministic suite by design.
   */

  it("GatewayLive: settle still succeeds with a tree argument, which it ignores", async () => {
    const rail = makeGatewayRail()
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const payload = await makePayload(undefined, req)
    const verified: VerifiedPayment = {
      payer: buyer.address,
      payTo: SELLER,
      amountAtomic: PRICE,
      network: ARC_CAIP2,
      payload,
      requirements: req
    }

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/v1/x402/settle")) {
        return new Response(
          JSON.stringify({ success: true, transaction: "0xgatewaysettletx", payer: buyer.address }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }
      throw new Error(`unexpected fetch in test: ${url}`)
    }) as typeof fetch

    try {
      const settled = await Effect.runPromise(rail.settle(verified, A_TREE))
      expect(settled.txHash).toBe("0xgatewaysettletx")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("EIP3009Live: a v1/plain settle ignores a tree argument and calls settle(), not settleWithTree()", async () => {
    let calledFn: string | undefined
    const rail = makeEip3009Rail({
      facilitator,
      publicClient: { readContract: async () => false, getTransactionReceipt: async () => ({ status: "success" }) } as never,
      walletClient: {
        sendTransaction: async (args: { to: string; data: string }) => {
          // First 4 bytes of the calldata identify which function was targeted.
          calledFn = args.data.slice(0, 10)
          return "0xplainsettletx"
        }
      } as never
    })
    const splitter = "0x000000000000000000000000000000000FEE51"
    const req = await Effect.runPromise(
      rail.challenge({
        priceAtomic: PRICE,
        resource: "/x/ss251/demo",
        payTo: SELLER,
        feeSplitter: splitter
        // No feeSplitterVersion: 2 here — this splitter is v1, so `settle` must be called
        // even though a `tree` argument is supplied, exactly as a v1 splitter cannot accept
        // `settleWithTree` (it has no such selector).
      })
    )
    const payload = await makePayload({ to: splitter }, req)
    const verified: VerifiedPayment = {
      payer: buyer.address,
      payTo: splitter,
      amountAtomic: PRICE,
      network: ARC_CAIP2,
      payload,
      requirements: req
    }

    const settled = await Effect.runPromise(rail.settle(verified, A_TREE))
    expect(settled.txHash).toBe("0xplainsettletx")
    const { toFunctionSelector } = await import("viem")
    expect(calledFn).toBe(
      toFunctionSelector("settle(address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)")
    )
  })

  it("EIP3009Live: a v2 splitter + tree calls settleWithTree() and commits the hash", async () => {
    let sentTo: string | undefined
    let sentData: string | undefined
    const rail = makeEip3009Rail({
      facilitator,
      publicClient: { readContract: async () => false, getTransactionReceipt: async () => ({ status: "success" }) } as never,
      walletClient: {
        sendTransaction: async (args: { to: string; data: string }) => {
          sentTo = args.to
          sentData = args.data
          return "0xtreesettletx"
        }
      } as never
    })
    const splitter = "0x000000000000000000000000000000000FEE52"
    const req = await Effect.runPromise(
      rail.challenge({
        priceAtomic: PRICE,
        resource: "/x/ss251/demo",
        payTo: SELLER,
        feeSplitter: splitter,
        feeSplitterVersion: 2
      })
    )
    const payload = await makePayload({ to: splitter }, req)
    const verified: VerifiedPayment = {
      payer: buyer.address,
      payTo: splitter,
      amountAtomic: PRICE,
      network: ARC_CAIP2,
      payload,
      requirements: req
    }

    const tree: SettleTree = { treeHash: `0x${"22".repeat(32)}`, childCount: 3, childTotalAtomic: 750_000n }
    const settled = await Effect.runPromise(rail.settle(verified, tree))

    expect(settled.txHash).toBe("0xtreesettletx")
    expect(sentTo?.toLowerCase()).toBe(splitter.toLowerCase())
    // `settleWithTree`'s own 4-byte selector — distinct from `settle`'s — proves the branch
    // actually taken was the tree-committing one, not a plain settle that merely ignored
    // the extra arguments.
    const { toFunctionSelector } = await import("viem")
    expect(sentData?.slice(0, 10)).toBe(
      toFunctionSelector(
        "settleWithTree(address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,bytes32,uint32,uint256)"
      )
    )
  })

  it("a plain settle (no splitter) still accepts and ignores a tree argument", async () => {
    const rail = makeEip3009Rail({
      facilitator,
      publicClient: { readContract: async () => false, getTransactionReceipt: async () => ({ status: "success" }) } as never,
      walletClient: { sendTransaction: async () => "0xnosplittertx" } as never
    })
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const payload = await makePayload(undefined, req)
    const verified: VerifiedPayment = {
      payer: buyer.address,
      payTo: SELLER,
      amountAtomic: PRICE,
      network: ARC_CAIP2,
      payload,
      requirements: req
    }
    const settled = await Effect.runPromise(rail.settle(verified, A_TREE))
    expect(settled.txHash).toBe("0xnosplittertx")
  })
})

describe("EIP3009Live verify — the on-chain checks", () => {
  /**
   * Replay was claimed in README.md, docs/architecture.md and by the conformance suite's
   * own "all three rails agree" framing, and implemented only in the in-memory fake. The
   * attack it left open: replay one `PAYMENT-SIGNATURE` header N times, the hub dispatches
   * N jobs, the seller burns N× inference, and exactly one settle lands on chain — which
   * inverts the promise that a seller never works unpaid.
   *
   * These drive the real rail with a stubbed read client, so the actual code path runs.
   */

  /** Error payloads carry atomic bigints, which plain JSON.stringify refuses. */
  const tags = (exit: unknown) => JSON.stringify(exit, (_k, v) => (typeof v === "bigint" ? v.toString() : v))

  const stubClient = (over: Partial<Record<string, unknown>> = {}) => ({
    readContract: async (args: { functionName: string }) => {
      if (args.functionName === "authorizationState") return over["authorizationState"] ?? false
      if (args.functionName === "balanceOf") return over["balanceOf"] ?? 10_000_000n
      throw new Error(`unexpected read: ${args.functionName}`)
    }
  })

  const liveRail = (over?: Partial<Record<string, unknown>>) =>
    makeEip3009Rail({
      facilitator: privateKeyToAccount(generatePrivateKey()),
      publicClient: stubClient(over) as never
    })

  it("rejects an authorization whose nonce is already spent on chain", async () => {
    const rail = liveRail({ authorizationState: true })
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const exit = await Effect.runPromiseExit(rail.verify(await makePayload(undefined, req), req))

    expect(exit._tag).toBe("Failure")
    expect(tags(exit)).toContain("NonceAlreadyUsed")
  })

  it("accepts the same authorization while the nonce is unspent", async () => {
    const rail = liveRail({ authorizationState: false })
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const exit = await Effect.runPromiseExit(rail.verify(await makePayload(undefined, req), req))

    expect(exit._tag).toBe("Success")
  })

  it("checks replay before balance, so a spent nonce reports the real reason", async () => {
    // Ordering matters for diagnosis: a replayed authorization from an emptied account
    // should say "already used", not "insufficient funds".
    const rail = liveRail({ authorizationState: true, balanceOf: 0n })
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const exit = await Effect.runPromiseExit(rail.verify(await makePayload(undefined, req), req))

    expect(tags(exit)).toContain("NonceAlreadyUsed")
    expect(tags(exit)).not.toContain("InsufficientFunds")
  })

  it("still rejects an unfunded payer whose nonce is fresh", async () => {
    const rail = liveRail({ authorizationState: false, balanceOf: 0n })
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: PRICE, resource: "/x/ss251/demo", payTo: SELLER })
    )
    const exit = await Effect.runPromiseExit(rail.verify(await makePayload(undefined, req), req))

    expect(tags(exit)).toContain("InsufficientFunds")
  })
})
