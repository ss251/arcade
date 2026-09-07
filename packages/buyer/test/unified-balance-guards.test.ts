import { describe, expect, it, vi } from "vitest"
import { encodeFunctionData, hashTypedData, padHex, parseAbi, type Hex } from "viem"
import { GATEWAY_BURN_TYPES } from "../src/gateway-withdrawal.ts"
import { captureUnifiedFundingPlan } from "../src/unified-balance-funding.ts"
import { captureUnifiedBurn, encodeUnifiedTransferSpec, assertUnifiedMint, unifiedCoordinates } from "../src/unified-balance-guards.ts"

const owner = `0x${"11".repeat(20)}` as const, recipient = `0x${"22".repeat(20)}` as const
const plan = captureUnifiedFundingPlan({ owner, recipient, sourceChain: "Arc_Testnet", amount: "0.25" })
const limits = { maxFeeAtomic: 50000n, sourceBlock: 1000n, withdrawalDelay: 100n, maxBurnBlockDelta: 200n }
const coordinates = unifiedCoordinates(plan.sourceChain)
const fixture = () => ({ domain: { name: "GatewayWallet", version: "1" }, types: GATEWAY_BURN_TYPES, primaryType: "BurnIntent" as const,
  message: { maxBlockHeight: 1150n, maxFee: 1000n, spec: { version: 1, sourceDomain: 26, destinationDomain: 26,
    sourceContract: padHex(coordinates.wallet, { size: 32 }), destinationContract: padHex(coordinates.minter, { size: 32 }),
    sourceToken: padHex(coordinates.token, { size: 32 }), destinationToken: padHex(coordinates.token, { size: 32 }),
    sourceDepositor: padHex(owner, { size: 32 }), destinationRecipient: padHex(recipient, { size: 32 }), sourceSigner: padHex(recipient, { size: 32 }),
    destinationCaller: `0x${"00".repeat(32)}` as Hex, value: 250000n, salt: `0x${"44".repeat(32)}` as Hex, hookData: "0x" as Hex } } })
describe("Unified Balance final signing terms", () => {
  it("captures the exact canonical single intent without changing its digest", () => {
    const original = fixture(), captured = captureUnifiedBurn(original, plan, limits)
    expect(hashTypedData(captured)).toBe(hashTypedData(original))
    expect(Object.isFrozen(captured.message.spec)).toBe(true)
    original.message.maxFee = 49000n
    expect(captured.message.maxFee).toBe(1000n)
  })
  it.each([
    { sourceDomain: 6 }, { destinationDomain: 6 }, { value: 249999n }, { value: 250001n }, { version: 2 },
    { sourceDepositor: padHex(recipient, { size: 32 }) }, { sourceSigner: padHex(owner, { size: 32 }) },
    { destinationRecipient: padHex(owner, { size: 32 }) }, { sourceContract: padHex(owner, { size: 32 }) },
    { destinationContract: padHex(owner, { size: 32 }) }, { sourceToken: padHex(owner, { size: 32 }) },
    { destinationToken: padHex(owner, { size: 32 }) }, { destinationCaller: padHex(owner, { size: 32 }) },
    { salt: `0x${"00".repeat(32)}` }, { hookData: "0x12" }
  ])("refuses altered signed spec %s", change => {
    const raw = fixture(); Object.assign(raw.message.spec, change)
    expect(() => captureUnifiedBurn(raw, plan, limits)).toThrow()
  })
  it.each([{ maxFee: 50001n }, { maxFee: -1n }, { maxBlockHeight: 1201n }, { maxBlockHeight: 1099n },
    { maxBlockHeight: (1n << 256n) - 1n }])("refuses fee/height escalation %s", change => {
    const raw = fixture(); Object.assign(raw.message, change)
    expect(() => captureUnifiedBurn(raw, plan, limits)).toThrow()
  })
  it("accepts exact cap boundaries but never moves the already signed height", () => {
    const raw = fixture(); raw.message.maxFee = 50000n; raw.message.maxBlockHeight = 1200n
    const captured = captureUnifiedBurn(raw, plan, limits)
    expect(captured.message.maxBlockHeight).toBe(1200n)
    expect(() => captureUnifiedBurn(captured, plan, { ...limits, sourceBlock: 1101n })).toThrow()
  })
  it("refuses unknown type members and domains", () => {
    expect(() => captureUnifiedBurn({ ...fixture(), domain: { name: "GatewayWalletBatched", version: "1" } }, plan, limits)).toThrow()
    expect(() => captureUnifiedBurn({ ...fixture(), domain: { name: "GatewayWallet", version: "1", chainId: 5042002 } }, plan, limits)).toThrow()
    expect(() => captureUnifiedBurn({ ...fixture(), types: { ...GATEWAY_BURN_TYPES, Other: [] } }, plan, limits)).toThrow()
    expect(() => captureUnifiedBurn({ ...fixture(), primaryType: "BurnIntentSet" }, plan, limits)).toThrow()
  })
  it("never runs type-array accessors", () => {
    const spy = vi.fn(() => ({ name: "maxBlockHeight", type: "uint256" }))
    const values = [undefined, ...GATEWAY_BURN_TYPES.BurnIntent.slice(1)]
    Object.defineProperty(values, "0", { get: spy, enumerable: true })
    expect(() => captureUnifiedBurn({ ...fixture(), types: { ...GATEWAY_BURN_TYPES, BurnIntent: values } }, plan, limits)).toThrow()
    expect(spy).not.toHaveBeenCalled()
  })
  it("pins Base Sepolia source independently from Arc destination", () => {
    expect(unifiedCoordinates("Base_Sepolia")).toMatchObject({ chainId: 84532, domain: 6,
      token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".toLowerCase(), rpc: "https://sepolia.base.org" })
    const next = { ...plan, sourceChain: "Base_Sepolia" as const }, raw = fixture()
    raw.message.spec.sourceDomain = 6
    raw.message.spec.sourceToken = padHex(unifiedCoordinates("Base_Sepolia").token, { size: 32 })
    expect(captureUnifiedBurn(raw, next, limits).message.spec.sourceDomain).toBe(6)
  })
  it("refuses mainnet and invalid guard bounds", () => {
    expect(() => unifiedCoordinates("Base" as never)).toThrow()
    for (const next of [{ ...limits, maxBurnBlockDelta: 99n }, { ...limits, sourceBlock: -1n }, { ...limits, maxFeeAtomic: -1n }]) {
      expect(() => captureUnifiedBurn(fixture(), plan, next)).toThrow()
    }
  })
})

const mintAbi = parseAbi(["function gatewayMint(bytes attestationPayload, bytes attestationSignature)"])
const minted = () => {
  const signed = captureUnifiedBurn(fixture(), plan, limits), spec = encodeUnifiedTransferSpec(signed)
  const attestation = `0xff6fb334${5000n.toString(16).padStart(64, "0")}00000154${spec.slice(2)}` as const
  const signature = `0x${"55".repeat(65)}` as const
  return { signed, attestation, signature, data: encodeFunctionData({ abi: mintAbi, functionName: "gatewayMint", args: [attestation, signature] }) }
}
describe("Unified Balance destination transaction terms", () => {
  it.each([false, true])("binds a %s singleton attestation to the signed spec and exact mint bytes", set => {
    const f = minted(), payload = (set ? `0x1e12db7100000001${f.attestation.slice(2)}` : f.attestation) as `0x${string}`
    const data = encodeFunctionData({ abi: mintAbi, functionName: "gatewayMint", args: [payload, f.signature] })
    expect(assertUnifiedMint({ to: coordinates.minter, data, value: 0n }, f.signed, 4999n).data).toBe(data)
  })
  it("refuses expiry, foreign recipient/minter, native value and other calldata", () => {
    const f = minted()
    expect(() => assertUnifiedMint({ to: coordinates.minter, data: f.data, value: 0n }, f.signed, 5001n)).toThrow()
    expect(() => assertUnifiedMint({ to: owner, data: f.data, value: 0n }, f.signed, 4999n)).toThrow()
    expect(() => assertUnifiedMint({ to: coordinates.minter, data: f.data, value: 1n }, f.signed, 4999n)).toThrow()
    expect(() => assertUnifiedMint({ to: coordinates.minter, data: "0x1234", value: 0n }, f.signed, 4999n)).toThrow()
    const foreign = { ...f.signed, message: { ...f.signed.message, spec: { ...f.signed.message.spec, destinationRecipient: padHex(owner, { size: 32 }) } } }
    expect(() => assertUnifiedMint({ to: coordinates.minter, data: f.data, value: 0n }, foreign, 4999n)).toThrow()
  })
  it.each([0n, (1n << 256n) - 1n])("refuses zero or unlimited attestation height %s", height => {
    const f = minted(), payload = `0xff6fb334${height.toString(16).padStart(64, "0")}00000154${encodeUnifiedTransferSpec(f.signed).slice(2)}` as Hex
    const data = encodeFunctionData({ abi: mintAbi, functionName: "gatewayMint", args: [payload, f.signature] })
    expect(() => assertUnifiedMint({ to: coordinates.minter, data, value: 0n }, f.signed, 0n)).toThrow()
  })
})
