import { afterEach, describe, expect, it, vi } from "vitest"
import { Cause, Effect, Exit, Fiber } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { loadChainConfig } from "@arcade/core"
import { TRANSFER_TYPES } from "../src/eip3009.ts"
import { makeGatewayRail } from "../src/gateway.ts"
import { PaymentPayload, type PaymentRequirements } from "../src/types.ts"

const buyer = privateKeyToAccount(`0x${"1".repeat(64)}`)
const SELLER = `0x${"2".repeat(40)}`
const OTHER = `0x${"3".repeat(40)}`
const UUID = "8f2c1f4e-0a11-4a3d-9f1e-2b6c7d8e9f00"
const chain = loadChainConfig("arc-testnet")
const domain = { name: "GatewayWalletBatched", version: "1", chainId: chain.chainId,
  verifyingContract: chain.gateway!.wallet } as const
const captured: Array<{ url: string; init: RequestInit; body: Record<string, unknown> | undefined }> = []
const responses = (reply: (url: string) => unknown = url => url.endsWith("/verify")
  ? { isValid: true, payer: buyer.address }
  : { success: true, payer: buyer.address, network: chain.caip2, transaction: UUID }) => {
  vi.stubGlobal("fetch", Object.assign(vi.fn(async (url: string, init: RequestInit = {}) => {
    captured.push({ url, init, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) as Record<string, unknown> })
    return Response.json(reply(url))
  }), { preconnect: () => { throw new Error("unexpected preconnect") } }))
}
const setup = async (over: Record<string, string> = {}, signingDomain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` } = domain,
  rail = makeGatewayRail()) => {
  const requirements = await Effect.runPromise(rail.challenge({ priceAtomic: 1_000n, payTo: SELLER,
    resource: "/x/seller/skill", description: "Gateway fixture" }))
  const now = BigInt(Math.floor(Date.now() / 1000))
  const authorization = { from: buyer.address, to: SELLER, value: "1000", validAfter: String(now - 600n),
    validBefore: String(now + 604900n), nonce: `0x${"a".repeat(64)}`, ...over }
  const signature = await buyer.signTypedData({ domain: signingDomain, types: TRANSFER_TYPES,
    primaryType: "TransferWithAuthorization", message: { from: authorization.from as `0x${string}`,
      to: authorization.to as `0x${string}`, value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce as `0x${string}` } })
  const payload = PaymentPayload.make({ x402Version: 2, accepted: requirements, payload: { authorization, signature } })
  return { rail, requirements, payload }
}
const rejected = async <A, E>(effect: Effect.Effect<A, E>, tag?: string) => {
  const result = await Effect.runPromiseExit(effect)
  expect(Exit.isFailure(result)).toBe(true)
  if (Exit.isFailure(result)) {
    expect(Cause.defects(result.cause)).toHaveLength(0)
    if (tag !== undefined) expect(JSON.stringify(result, (_key, v: unknown) => typeof v === "bigint" ? String(v) : v)).toContain(tag)
  }
  return result
}
afterEach(() => { captured.length = 0; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs() })

describe("Gateway canonical signed binding", () => {
  it("sends exactly two fields and the F1 canonical nested requirements", async () => {
    responses()
    const { rail, requirements, payload } = await setup()
    const verified = await Effect.runPromise(rail.verify(payload, requirements))
    await Effect.runPromise(rail.settle(verified))
    expect(captured).toHaveLength(2)
    for (const call of captured) {
      expect(Object.keys(call.body!).sort()).toEqual(["paymentPayload", "paymentRequirements"])
      const body = call.body as { paymentPayload: { accepted: unknown; resource: unknown }; paymentRequirements: unknown }
      expect(body.paymentPayload.accepted).toEqual(body.paymentRequirements)
      expect(body.paymentRequirements).not.toHaveProperty("resource")
      expect(body.paymentPayload.resource).toEqual({ url: requirements.resource, description: requirements.description, mimeType: "application/json" })
      expect(call.init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" })
    }
  })

  it("rejects a USDC-domain signature locally even if the facilitator would accept it", async () => {
    responses()
    const wrong = { ...domain, name: "USDC", version: "2", verifyingContract: chain.usdc.address }
    const { rail, payload, requirements } = await setup({}, wrong)
    await rejected(rail.verify(payload, requirements), "InvalidSignature")
    expect(captured).toHaveLength(0)
  })

  it("rejects signed overpayment, not just underpayment", async () => {
    responses()
    for (const value of ["1001", "999"]) {
      const { rail, payload, requirements } = await setup({ value })
      await rejected(rail.verify(payload, requirements))
    }
    expect(captured).toHaveLength(0)
  })

  it("binds every accepted coordinate before any provider request", async () => {
    responses()
    for (const over of [{ amount: "1001" }, { network: "eip155:8453" }, { asset: OTHER }, { payTo: OTHER },
      { resource: "/another" }, { description: "changed" }, { mimeType: "text/plain" }, { maxTimeoutSeconds: 1 },
      { extra: { name: "USDC", version: "2", verifyingContract: chain.usdc.address } }]) {
      const { rail, payload, requirements } = await setup()
      const changed = { ...payload, accepted: { ...requirements, ...over } } as PaymentPayload
      await rejected(rail.verify(changed, requirements), "InvalidSignature")
    }
    expect(captured).toHaveLength(0)
  })

  it("turns malformed integers and accessors into fixed typed refusal without invoking them", async () => {
    responses()
    const { rail, payload, requirements } = await setup()
    for (const value of ["", "01", "-1", "1e3", "1.0", "x", "9".repeat(79), (1n << 256n).toString()]) {
      const changed = { ...payload, payload: { ...payload.payload, authorization: { ...payload.payload.authorization, value } } } as PaymentPayload
      await rejected(rail.verify(changed, requirements), "InvalidSignature")
    }
    const getter = vi.fn(() => { throw new Error("PRIVATE_GETTER") })
    const evil = { ...requirements }
    Object.defineProperty(evil, "amount", { get: getter })
    await rejected(rail.verify(payload, evil as PaymentRequirements), "InvalidSignature")
    expect(getter).not.toHaveBeenCalled()
    expect(captured).toHaveLength(0)
  })

  it("rejects conflicting optional resource descriptors", async () => {
    responses()
    const { rail, payload, requirements } = await setup()
    await rejected(rail.verify({ ...payload, resource: { url: "/foreign" } } as PaymentPayload, requirements))
    expect(captured).toHaveLength(0)
  })

  it("snapshots before awaiting verify and freezes the verified capability", async () => {
    const { rail, payload, requirements } = await setup()
    let complete!: (value: Response) => void
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      captured.push({ url: _url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return new Promise<Response>(resolve => { complete = resolve })
    }))
    const operation = Effect.runPromise(rail.verify(payload, requirements))
    await vi.waitFor(() => expect(captured).toHaveLength(1))
    const mutable = payload.payload.authorization as { to: string }
    mutable.to = OTHER
    complete(Response.json({ isValid: true, payer: buyer.address }))
    const verified = await operation
    expect(verified.payload.payload.authorization.to.toLowerCase()).toBe(SELLER.toLowerCase())
    expect(Object.isFrozen(verified)).toBe(true)
    expect(Object.isFrozen(verified.payload.payload.authorization)).toBe(true)
    responses()
    await Effect.runPromise(rail.settle(verified))
    expect(JSON.stringify(captured[1]!.body)).not.toContain(OTHER)
  })
})

describe("Gateway authoritative response and one-attempt settlement", () => {
  it("requires an exact true verification with matching payer and no contradictory reason", async () => {
    for (const reply of [{ isValid: "true", payer: buyer.address }, { isValid: true },
      { isValid: true, payer: OTHER }, { isValid: true, payer: buyer.address, invalidReason: "PRIVATE_REASON" }]) {
      responses(() => reply)
      const { rail, payload, requirements } = await setup()
      const failure = await rejected(rail.verify(payload, requirements))
      expect(JSON.stringify(failure)).not.toContain("PRIVATE_REASON")
    }
  })

  it("labels only an observed canonical UUID as an accepted Gateway transfer", async () => {
    responses()
    const { rail, payload, requirements } = await setup()
    const verified = await Effect.runPromise(rail.verify(payload, requirements))
    const settled = await Effect.runPromise(rail.settle(verified, { treeHash: `0x${"b".repeat(64)}`, childCount: 1, childTotalAtomic: 1n }))
    expect(settled).toEqual({ txHash: UUID, payer: buyer.address.toLowerCase(), amountAtomic: 1000n, settlementKind: "gateway-transfer" })
  })

  it("never treats hash syntax, missing payer/network or contradictory success as settlement proof", async () => {
    for (const over of [{ transaction: `0x${"b".repeat(64)}` }, { transaction: "" }, { transaction: "https://evil.invalid" },
      { transaction: "00000000-0000-0000-0000-000000000000" }, { payer: OTHER }, { payer: undefined },
      { network: undefined }, { network: "eip155:8453" }, { success: "true" }, { errorReason: "PRIVATE_REASON" }]) {
      responses(url => url.endsWith("/verify") ? { isValid: true, payer: buyer.address }
        : { success: true, payer: buyer.address, network: chain.caip2, transaction: UUID, ...over })
      const { rail, payload, requirements } = await setup()
      const verified = await Effect.runPromise(rail.verify(payload, requirements))
      const failure = await rejected(rail.settle(verified), "SettlementFailed")
      expect(JSON.stringify(failure)).not.toContain("PRIVATE_REASON")
    }
  })

  it("rejects fabricated or cross-rail verified handles before a settle POST", async () => {
    responses()
    const { rail, payload, requirements } = await setup()
    const verified = await Effect.runPromise(rail.verify(payload, requirements))
    await rejected(rail.settle({ ...verified }), "SettlementFailed")
    await rejected(makeGatewayRail().settle(verified), "SettlementFailed")
    expect(captured).toHaveLength(1)
  })

  it("dispatches once across repeated handles and concurrent settlement invocations", async () => {
    responses()
    const { rail, payload, requirements } = await setup()
    const first = await Effect.runPromise(rail.verify(payload, requirements))
    const second = await Effect.runPromise(rail.verify(payload, requirements))
    const outcomes = await Promise.all([Effect.runPromiseExit(rail.settle(first)), Effect.runPromiseExit(rail.settle(second))])
    expect(outcomes.filter(Exit.isSuccess)).toHaveLength(1)
    await rejected(rail.settle(first), "SettlementFailed")
    expect(captured.filter(call => call.url.endsWith("/settle"))).toHaveLength(1)
  })

  it("retains a dispatched uncertain attempt instead of retrying it", async () => {
    responses()
    const { rail, payload, requirements } = await setup()
    const verified = await Effect.runPromise(rail.verify(payload, requirements))
    const sent = vi.fn(async () => { throw new Error("PRIVATE_BODY_SIGNATURE") })
    vi.stubGlobal("fetch", sent)
    const first = await rejected(rail.settle(verified), "SettlementFailed")
    await rejected(rail.settle(verified), "SettlementFailed")
    expect(sent).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(first)).not.toContain("PRIVATE_BODY_SIGNATURE")
  })

  it("does not prune an active expired nonce or permit a conflicting replacement", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T12:00:00Z")); responses()
    const { rail, payload, requirements } = await setup()
    const verified = await Effect.runPromise(rail.verify(payload, requirements))
    let complete!: (response: Response) => void
    let settleCalls = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/verify")) return Response.json({ isValid: true, payer: buyer.address })
      settleCalls++
      return await new Promise<Response>(resolve => { complete = resolve })
    }))
    const first = Effect.runPromise(rail.settle(verified))
    await vi.advanceTimersByTimeAsync(0)
    expect(settleCalls).toBe(1)
    vi.setSystemTime(Date.now() + 604901_000)
    const replacement = await setup({}, domain, rail)
    const changed = await Effect.runPromise(rail.verify(replacement.payload, replacement.requirements))
    await rejected(rail.settle(changed), "SettlementFailed")
    expect(settleCalls).toBe(1)
    complete(Response.json({ success: true, payer: buyer.address, network: chain.caip2, transaction: UUID }))
    expect((await first).settlementKind).toBe("gateway-transfer")
  })

  it("checks expiry again at settle without requiring a fresh full window", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T12:00:00Z"))
    responses()
    const { rail, payload, requirements } = await setup()
    const verified = await Effect.runPromise(rail.verify(payload, requirements))
    vi.setSystemTime(Date.now() + 135_000)
    await Effect.runPromise(rail.settle(verified))
    const next = await setup()
    const later = await Effect.runPromise(next.rail.verify(next.payload, next.requirements))
    vi.setSystemTime(Date.now() + 604901_000)
    await rejected(next.rail.settle(later), "SettlementFailed")
  })
})

describe("Gateway transport and construction boundaries", () => {
  it("projects one matching supported deployment without trusting provider extensions", async () => {
    const kind = { x402Version: 2, scheme: "exact", network: chain.caip2, extra: { ...domain,
      assets: [{ address: chain.usdc.address, symbol: "USDC", decimals: 6 }], private: "PRIVATE_EXTENSION" } }
    responses(() => ({ kinds: [kind], signers: { private: "PRIVATE_EXTENSION" } }))
    const supported = await Effect.runPromise(makeGatewayRail().supported())
    expect(supported.kinds[0]?.extra?.verifyingContract).toBe(chain.gateway!.wallet.toLowerCase())
    expect(JSON.stringify(supported)).not.toContain("PRIVATE_EXTENSION")
    expect(captured[0]?.init).toMatchObject({ method: "GET", redirect: "error", credentials: "omit" })
    for (const kinds of [[], [kind, kind], [{ ...kind, x402Version: 1 }], [{ ...kind, scheme: "upto" }],
      [{ ...kind, extra: { ...kind.extra, verifyingContract: OTHER } }],
      [{ ...kind, extra: { ...kind.extra, assets: [{ address: chain.usdc.address, symbol: "USDC", decimals: 18 }] } }],
      Array.from({ length: 101 }, () => kind)]) {
      responses(() => ({ kinds }))
      await rejected(makeGatewayRail().supported(), "RpcFailure")
    }
  })

  it("refuses clock rollback and overly broad or unopened signed windows", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T12:00:00Z")); responses()
    const seconds = BigInt(Math.floor(Date.now() / 1000))
    for (const over of [{ validAfter: String(seconds + 1n) }, { validBefore: String(seconds) },
      { validAfter: String(seconds - 601n) }, { validBefore: String(seconds + 604901n) }]) {
      const { rail, payload, requirements } = await setup(over)
      await rejected(rail.verify(payload, requirements))
    }
    const { rail, payload, requirements } = await setup()
    const verified = await Effect.runPromise(rail.verify(payload, requirements))
    vi.setSystemTime(Date.now() - 1_000)
    await rejected(rail.settle(verified), "SettlementFailed")
    expect(captured.filter(call => call.url.endsWith("/settle"))).toHaveLength(0)
  })

  it("awaits cancellation before an interrupted verify fiber returns", async () => {
    let canceled = false
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      async cancel() { await new Promise(resolve => setTimeout(resolve, 15)); canceled = true }
    }), { headers: { "content-type": "application/json" } })))
    const { rail, payload, requirements } = await setup()
    const fiber = Effect.runFork(rail.verify(payload, requirements))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(canceled).toBe(true)
  })

  it("cancels a late response after a noncooperative fetch is interrupted", async () => {
    let deliver!: (response: Response) => void
    const canceled = vi.fn()
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { deliver = resolve })))
    const { rail, payload, requirements } = await setup()
    const fiber = Effect.runFork(rail.verify(payload, requirements))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await Effect.runPromise(Fiber.interrupt(fiber))
    deliver(new Response(new ReadableStream({ cancel: canceled }), { headers: { "content-type": "application/json" } }))
    await vi.waitFor(() => expect(canceled).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("caps live attempted nonces at 10000, prunes only expired attempts, and does not reopen them on rollback", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T12:00:00Z")); responses()
    const rail = makeGatewayRail()
    let oldest: Awaited<ReturnType<typeof setup>> | undefined
    for (let i = 1; i <= 10_000; i++) {
      const fixture = await setup({ nonce: "0x" + i.toString(16).padStart(64, "0") }, domain, rail)
      if (i === 1) oldest = fixture
      const verified = await Effect.runPromise(rail.verify(fixture.payload, fixture.requirements))
      await Effect.runPromise(rail.settle(verified))
    }
    const next = await setup({ nonce: "0x" + (10_001).toString(16).padStart(64, "0") }, domain, rail)
    const held = await Effect.runPromise(rail.verify(next.payload, next.requirements))
    await rejected(rail.settle(held), "SettlementFailed")
    expect(captured.filter(call => call.url.endsWith("/settle"))).toHaveLength(10_000)
    const originalTime = Date.now()
    vi.setSystemTime(originalTime + 604901_000)
    const fresh = await setup({ nonce: "0x" + (10_002).toString(16).padStart(64, "0") }, domain, rail)
    await Effect.runPromise(rail.settle(await Effect.runPromise(rail.verify(fresh.payload, fresh.requirements))))
    vi.setSystemTime(originalTime)
    await rejected(rail.verify(oldest!.payload, oldest!.requirements))
    expect(captured.filter(call => call.url.endsWith("/settle"))).toHaveLength(10_001)
  }, 120_000)

  it("rejects unavailable selected Gateway and mismatched deployment overrides at construction", () => {
    vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    expect(() => makeGatewayRail()).toThrow()
    vi.stubEnv("ARCADE_NETWORK", "arc-testnet")
    expect(() => makeGatewayRail({ wallet: OTHER } as never)).toThrow()
    for (const facilitatorUrl of ["https://user:secret@example.com", "https://example.com/path", "https://example.com/?key=x", "http://example.com"])
      expect(() => makeGatewayRail({ facilitatorUrl })).toThrow()
  })

  it("refuses invalid trusted challenge data without issuing a payable challenge", async () => {
    const rail = makeGatewayRail()
    expect(Exit.isFailure(await Effect.runPromiseExit(rail.challenge({ priceAtomic: 0n, payTo: SELLER, resource: "/x" })))).toBe(true)
  })

  it("bounds response framing and does not reflect bodies", async () => {
    for (const response of [new Response("PRIVATE_BODY", { status: 500 }),
      new Response("{", { headers: { "content-type": "application/json" } }),
      new Response("{}", { headers: { "content-type": "text/html" } }),
      new Response("{}", { headers: { "content-type": "application/json", "content-length": "9999999" } }),
      new Response("{}", { headers: { "content-type": "application/json", "content-encoding": "gzip" } })]) {
      const fetcher = vi.fn(async () => response); vi.stubGlobal("fetch", fetcher)
      const { rail, payload, requirements } = await setup()
      const failure = await rejected(rail.verify(payload, requirements), "RpcFailure")
      expect(JSON.stringify(failure)).not.toContain("PRIVATE_BODY")
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })

  it("enforces a total deadline and aborts a stalled body", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T12:00:00Z"))
    const canceled = vi.fn(), fetcher = vi.fn(async () => new Response(new ReadableStream({ cancel: canceled }),
      { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetcher)
    const { rail, payload, requirements } = await setup()
    const outcome = Effect.runPromiseExit(rail.verify(payload, requirements))
    await vi.advanceTimersByTimeAsync(15_100)
    expect(Exit.isFailure(await outcome)).toBe(true)
    expect(canceled).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  }, 20_000)
})
