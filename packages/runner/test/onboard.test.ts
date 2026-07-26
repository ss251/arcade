import { afterEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { planIdentity, checkHub } from "../src/onboard.ts"
import { addressForKey, generateWallet, normaliseAddress, resolveSellerKey, WalletError } from "../src/wallet.ts"

/**
 * Onboarding is the product's wedge, so its decision logic is separated from its IO and
 * tested here. Nothing in this file writes to a keychain, touches a chain, or needs a hub.
 *
 * `resolveSellerKey` cases use freshly generated addresses. On macOS the keychain lookup
 * genuinely runs, finds nothing for a random address, and falls through — which is the
 * behaviour under test, so the tests stay hermetic without stubbing the platform.
 */

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
const ADDR_FOR_KEY = privateKeyToAccount(KEY).address

const originalEnv = process.env["ARCADE_SELLER_KEY"]
afterEach(() => {
  if (originalEnv === undefined) delete process.env["ARCADE_SELLER_KEY"]
  else process.env["ARCADE_SELLER_KEY"] = originalEnv
})

describe("planIdentity", () => {
  it("generates when the seller brings nothing — the default path", () => {
    // The whole point: you should not need to already own a wallet to start earning.
    expect(planIdentity({})).toEqual({ _tag: "Generate" })
    expect(planIdentity({ seller: "", importKey: "" })).toEqual({ _tag: "Generate" })
  })

  it("derives the address from an imported key rather than trusting a claim", () => {
    const plan = planIdentity({ importKey: KEY })
    expect(plan).toEqual({ _tag: "Import", privateKey: KEY, address: ADDR_FOR_KEY })
  })

  it("accepts a bare key without the 0x prefix and normalises it", () => {
    const plan = planIdentity({ importKey: KEY.slice(2) })
    expect(plan._tag).toBe("Import")
    expect((plan as { privateKey: string }).privateKey).toBe(KEY)
  })

  it("refuses --import and --seller that disagree", () => {
    // Silently preferring one would hand the seller an identity they did not ask for, and
    // the mismatch would only surface later as a rejected handshake.
    expect(() =>
      planIdentity({ importKey: KEY, seller: "0x1111111111111111111111111111111111111111" })
    ).toThrow(/but --seller says/)
  })

  it("allows --import and --seller that agree", () => {
    expect(planIdentity({ importKey: KEY, seller: ADDR_FOR_KEY.toLowerCase() })).toMatchObject({
      _tag: "Import",
      address: ADDR_FOR_KEY
    })
  })

  it("checksums a supplied address", () => {
    const plan = planIdentity({ seller: ADDR_FOR_KEY.toLowerCase() })
    expect(plan).toEqual({ _tag: "UseAddress", address: ADDR_FOR_KEY })
  })

  it("rejects something that is not an address", () => {
    expect(() => planIdentity({ seller: "not-an-address" })).toThrow(WalletError)
    expect(() => planIdentity({ seller: "0xdeadbeef" })).toThrow(/not an Ethereum address/)
  })
})

describe("key handling", () => {
  it("derives a stable address from a key", () => {
    expect(addressForKey(KEY)).toBe(ADDR_FOR_KEY)
    expect(addressForKey(KEY.slice(2))).toBe(ADDR_FOR_KEY)
  })

  it("rejects malformed keys instead of letting viem throw something opaque", () => {
    expect(() => addressForKey("0x00")).toThrow(/expected 32 hex bytes/)
    expect(() => addressForKey("nonsense")).toThrow(/expected 32 hex bytes/)
  })

  it("generates a wallet whose key controls its address", () => {
    const w = generateWallet()
    expect(addressForKey(w.privateKey)).toBe(w.address)
    expect(normaliseAddress(w.address)).toBe(w.address)
  })
})

describe("resolveSellerKey", () => {
  it("prefers the environment, so CI and containers work without a keychain", async () => {
    process.env["ARCADE_SELLER_KEY"] = KEY
    const r = await Effect.runPromise(resolveSellerKey(ADDR_FOR_KEY))
    expect(r).toEqual({ privateKey: KEY, source: "env" })
  })

  it("matches case-insensitively against the configured address", async () => {
    process.env["ARCADE_SELLER_KEY"] = KEY
    const r = await Effect.runPromise(resolveSellerKey(ADDR_FOR_KEY.toLowerCase()))
    expect(r.source).toBe("env")
  })

  it("refuses a key that controls a different address", async () => {
    // This is the failure worth catching early: the runner would otherwise sign a handshake
    // claiming an address it cannot prove, and the hub would reject it with a message about
    // signatures rather than about configuration.
    const other = generateWallet()
    process.env["ARCADE_SELLER_KEY"] = KEY
    const r = await Effect.runPromise(resolveSellerKey(other.address).pipe(Effect.either))

    expect(r._tag).toBe("Left")
    expect((r as { left: Error }).left.message).toContain(ADDR_FOR_KEY)
    expect((r as { left: Error }).left.message).toContain(other.address)
  })

  it("fails with instructions when there is no key anywhere", async () => {
    delete process.env["ARCADE_SELLER_KEY"]
    const fresh = generateWallet()
    const r = await Effect.runPromise(resolveSellerKey(fresh.address).pipe(Effect.either))

    expect(r._tag).toBe("Left")
    const msg = (r as { left: Error }).left.message
    expect(msg).toContain(fresh.address)
    expect(msg).toContain("ARCADE_SELLER_KEY")
    expect(msg).toContain("never moves funds")
  })
})

describe("checkHub", () => {
  it("reports unreachable rather than throwing, so setup can finish", async () => {
    // A hub being down must not block a seller completing onboarding — the runner
    // reconnects with backoff, so the useful behaviour is to say so and carry on.
    const status = await Effect.runPromise(checkHub("http://127.0.0.1:9", 250))
    expect(status.reachable).toBe(false)
    expect(status.error).toBeDefined()
  })

  it("treats a non-200 as unreachable and names the status", async () => {
    const status = await Effect.runPromise(checkHub("https://example.com/definitely-not-a-hub", 4000))
    expect(status.reachable).toBe(false)
  })
})
