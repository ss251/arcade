import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { recoverTypedDataAddress, type Account } from "viem"
import { ARC_CAIP2, ARC_CHAIN_ID, GATEWAY_WALLET, USDC_ADDRESS, loadChainConfig } from "@arcade/core"
import { PaymentRequirements } from "../src/types.ts"
import { EIP712_DOMAIN, TRANSFER_TYPES } from "../src/eip3009.ts"
import { gatewayDomain, isGatewayRequirements, paymentRequirementsKind, signGatewayAuthorization } from "../src/gateway-sign.ts"

const account = privateKeyToAccount(`0x${"01".repeat(32)}`)
const PAYEE = `0x${"2".repeat(40)}` as const, OTHER = `0x${"3".repeat(40)}` as const
const NOW = 1_788_609_600_000, UINT256_MAX = (1n << 256n) - 1n
const req = (over: Record<string, unknown> = {}) => PaymentRequirements.make({
  scheme: "exact", network: ARC_CAIP2, amount: "1000", asset: USDC_ADDRESS, payTo: PAYEE,
  resource: "/x/seller/fixture", mimeType: "application/json", maxTimeoutSeconds: 604900,
  extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET }, ...over
})
const sign = (requirements = req(), over: Record<string, unknown> = {}) => {
  const signer = { ...account }, spy = vi.spyOn(signer, "signTypedData")
  return { spy, effect: signGatewayAuthorization({ account: signer, to: PAYEE, valueAtomic: 1000n, requirements, ...over }) }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe("pinned Gateway authorization", () => {
  it("recognizes the Gateway name even when version or contract is malformed, with no implicit USDC fallback", () => {
    for (const extra of [{ name: "GatewayWalletBatched" }, { name: "GatewayWalletBatched", version: "2" }]) {
      expect(isGatewayRequirements(req({ extra }))).toBe(true)
      expect(() => paymentRequirementsKind(req({ extra }))).toThrow("Unsupported payment requirements")
    }
    expect(isGatewayRequirements(req({ extra: {} }))).toBe(false)
    expect(paymentRequirementsKind(req({ extra: {} }))).toBe("usdc")
    expect(paymentRequirementsKind(req({ extra: { name: "USDC", version: "2", verifyingContract: USDC_ADDRESS } }))).toBe("usdc")
  })
  it("pins the selected chain and Gateway contract, never an arbitrary challenge contract", () => {
    expect(gatewayDomain(req(), ARC_CHAIN_ID)).toEqual({ name: "GatewayWalletBatched", version: "1", chainId: ARC_CHAIN_ID, verifyingContract: GATEWAY_WALLET })
    expect(() => gatewayDomain(req(), 1)).toThrow("Unsupported payment requirements")
    expect(() => gatewayDomain(req({ extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: OTHER } }))).toThrow("Unsupported payment requirements")
  })
  it("signs the exact Gateway message once and not the USDC domain", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    const { spy, effect } = sign(), signed = await Effect.runPromise(effect)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(signed).toMatchObject({ from: account.address, to: PAYEE, value: "1000", validAfter: "1788609000", validBefore: "1789214500" })
    expect(Object.keys(signed).sort()).toEqual(["from", "to", "value", "validAfter", "validBefore", "nonce", "signature"].sort())
    expect(signed.nonce).toMatch(/^0x[0-9a-f]{64}$/)
    const message = { from: signed.from as `0x${string}`, to: signed.to as `0x${string}`, value: BigInt(signed.value),
      validAfter: BigInt(signed.validAfter), validBefore: BigInt(signed.validBefore), nonce: signed.nonce }
    const common = { types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization" as const, message, signature: signed.signature }
    expect((await recoverTypedDataAddress({ ...common, domain: gatewayDomain(req()) })).toLowerCase()).toBe(account.address.toLowerCase())
    expect((await recoverTypedDataAddress({ ...common, domain: EIP712_DOMAIN })).toLowerCase()).not.toBe(account.address.toLowerCase())
  })
  it("uses independent cryptographic nonces even with an identical clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    const a = await Effect.runPromise(sign().effect), b = await Effect.runPromise(sign().effect)
    expect(a.nonce).not.toBe(b.nonce)
  })
  it.each([
    { network: "eip155:1" }, { network: "eip155:5042002junk" }, { network: "eip155:05042002" },
    { asset: OTHER }, { payTo: `0x${"0".repeat(40)}` }, { payTo: "PRIVATE_BAD_PAYEE" },
    { amount: "0" }, { amount: "-1" }, { amount: "+1000" }, { amount: " 1000" }, { amount: "01000" },
    { amount: "1e3" }, { amount: "1000.0" }, { amount: "x".repeat(1000) }, { amount: (UINT256_MAX + 1n).toString() },
    { maxTimeoutSeconds: 0 }, { maxTimeoutSeconds: -1 }, { maxTimeoutSeconds: 604899 }, { maxTimeoutSeconds: 604901 },
    { extra: { name: "GatewayWalletBatched", version: "PRIVATE_VERSION", verifyingContract: GATEWAY_WALLET } }
  ])("refuses malformed or contradictory Gateway requirements before signing %#", async over => {
    const { spy, effect } = sign(req(over)), result = await Effect.runPromise(Effect.either(effect))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "InvalidSignature", reason: "Unsupported payment requirements" } })
    expect(spy).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain("PRIVATE")
  })
  it.each([Number.NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])("refuses a noncanonical timeout on plain injected requirements %#", async maxTimeoutSeconds => {
    const { spy, effect } = sign({ ...req(), maxTimeoutSeconds } as PaymentRequirements)
    expect((await Effect.runPromise(Effect.either(effect)))._tag).toBe("Left"); expect(spy).not.toHaveBeenCalled()
  })
  it.each([{ to: OTHER }, { valueAtomic: 1001n }, { valueAtomic: 0n }, { valueAtomic: -1n },
    { chainId: 1 }, { validForSeconds: 604901 }, { validForSeconds: 1.5 },
    { chain: { ...loadChainConfig(), gateway: { ...loadChainConfig().gateway!, wallet: OTHER } } }
  ])("refuses caller input disagreement without invoking the account %#", async over => {
    const { spy, effect } = sign(req(), over)
    expect((await Effect.runPromise(Effect.either(effect)))._tag).toBe("Left"); expect(spy).not.toHaveBeenCalled()
  })
  it("accepts the positive uint256 boundary without rounding through Number", async () => {
    const { effect } = sign(req({ amount: UINT256_MAX.toString() }), { valueAtomic: UINT256_MAX,
      chainId: ARC_CHAIN_ID, chain: loadChainConfig(), validForSeconds: 604900 })
    expect((await Effect.runPromise(effect)).value).toBe(UINT256_MAX.toString())
  })
  it.each([0, 599_000, -1, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("refuses unsafe clocks before signing %#", async now => {
    vi.spyOn(Date, "now").mockReturnValue(now)
    const { effect, spy } = sign()
    expect((await Effect.runPromise(Effect.either(effect)))._tag).toBe("Left"); expect(spy).not.toHaveBeenCalled()
  })
  it("refuses the pending selected mainnet rather than falling back to testnet constants", async () => {
    vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    const { effect, spy } = sign()
    expect((await Effect.runPromise(Effect.either(effect)))._tag).toBe("Left"); expect(spy).not.toHaveBeenCalled()
  })
  it("does not invoke requirement accessors, inherited metadata or coercions", async () => {
    let accesses = 0
    const getter = Object.defineProperty({ ...req() }, "amount", { get() { accesses++; return "1000" } }) as PaymentRequirements
    const coerce = { toString() { accesses++; return "1000" } }
    const inherited = Object.create({ name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET })
    for (const requirements of [getter, { ...req(), amount: coerce }, { ...req(), extra: inherited }]) {
      const { effect, spy } = sign(requirements as PaymentRequirements)
      expect((await Effect.runPromise(Effect.either(effect)))._tag).toBe("Left"); expect(spy).not.toHaveBeenCalled()
    }
    expect(accesses).toBe(0)
  })
  it.each(["sync", "async", "malformed", "missing"])("contains %s signer faults with no retry or reflected details", async kind => {
    const spy = vi.fn(() => { if (kind === "sync") throw Error("PRIVATE_SIGNER"); return kind === "async" ? Promise.reject(Error("PRIVATE_SIGNER")) : Promise.resolve("PRIVATE_SIGNATURE") })
    const signer = { ...account, signTypedData: kind === "missing" ? undefined : spy } as unknown as Account
    const result = await Effect.runPromise(Effect.either(signGatewayAuthorization({ account: signer, to: PAYEE, valueAtomic: 1000n, requirements: req() })))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "InvalidSignature" } })
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(spy).toHaveBeenCalledTimes(kind === "missing" ? 0 : 1)
  })
  it.each(["message", "domain", "types"])("does not let the signer mutate the canonical %s or shared types", async target => {
    const originalTypes = JSON.stringify(TRANSFER_TYPES)
    const spy = vi.fn(async (request: Parameters<typeof account.signTypedData>[0]) => {
      const value = request as unknown as { message: { value: bigint }; domain: { verifyingContract: string }; types: { TransferWithAuthorization: Array<{ name: string; type: string }> } }
      if (target === "message") value.message.value = 999999n
      if (target === "domain") value.domain.verifyingContract = OTHER
      if (target === "types") value.types.TransferWithAuthorization[0]!.name = "different"
      return account.signTypedData(request)
    })
    const signer = { ...account, signTypedData: spy } as Account
    let result
    try {
      result = await Effect.runPromise(Effect.either(signGatewayAuthorization({ account: signer, to: PAYEE, valueAtomic: 1000n, requirements: req() })))
      expect(JSON.stringify(TRANSFER_TYPES)).toBe(originalTypes)
      expect(result).toMatchObject({ _tag: "Left", left: { _tag: "InvalidSignature", reason: "Gateway authorization signing failed" } })
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      // The old implementation exposes this shared object; restore only this
      // fixture's mutation even when its genuine regression assertion fails.
      if (TRANSFER_TYPES.TransferWithAuthorization[0].name !== "from") {
        (TRANSFER_TYPES.TransferWithAuthorization[0] as { name: string }).name = "from"
      }
    }
  })
  it.each(["message", "from", "domain"])("refuses a valid65-byte signature for a different %s", async target => {
    const other = privateKeyToAccount(`0x${"02".repeat(32)}`)
    const spy = vi.fn((request: Parameters<typeof account.signTypedData>[0]) => {
      if (target === "from") return other.signTypedData(request)
      if (target === "domain") return account.signTypedData({ ...request, domain: { ...request.domain, verifyingContract: OTHER } })
      return account.signTypedData({ ...request, message: { ...request.message, value: 999999n } })
    })
    const signer = { ...account, signTypedData: spy } as Account
    const result = await Effect.runPromise(Effect.either(signGatewayAuthorization({ account: signer, to: PAYEE, valueAtomic: 1000n, requirements: req() })))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "InvalidSignature", reason: "Gateway authorization signing failed" } })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
