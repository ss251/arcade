import { describe, expect, it, vi } from "vitest"
import { padHex, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { GATEWAY_BURN_TYPES } from "../src/gateway-withdrawal.ts"
import { captureUnifiedFundingPlan } from "../src/unified-balance-funding.ts"
import { unifiedCoordinates } from "../src/unified-balance-guards.ts"
import { createUnifiedSigningBoundary, type UnifiedBurnSigner } from "../src/unified-balance-signing.ts"

const fixture = () => {
  // Ephemeral local cryptographic fixture; never an owner/Keychain key.
  const account = privateKeyToAccount(generatePrivateKey())
  const owner = `0x${"11".repeat(20)}` as const
  const plan = captureUnifiedFundingPlan({ owner, recipient: account.address, sourceChain: "Arc_Testnet", amount: "0.25" })
  const c = unifiedCoordinates(plan.sourceChain)
  const raw = { domain: { name: "GatewayWallet", version: "1" }, types: GATEWAY_BURN_TYPES, primaryType: "BurnIntent",
    message: { maxBlockHeight: 1150n, maxFee: 1000n, spec: { version: 1, sourceDomain: 26, destinationDomain: 26,
      sourceContract: padHex(c.wallet, { size: 32 }), destinationContract: padHex(c.minter, { size: 32 }),
      sourceToken: padHex(c.token, { size: 32 }), destinationToken: padHex(c.token, { size: 32 }),
      sourceDepositor: padHex(owner, { size: 32 }), destinationRecipient: padHex(plan.recipient, { size: 32 }),
      sourceSigner: padHex(plan.recipient, { size: 32 }), destinationCaller: `0x${"00".repeat(32)}`,
      value: 250000n, salt: `0x${"44".repeat(32)}`, hookData: "0x" } } }
  const limits = vi.fn(async () => ({ maxFeeAtomic: 50000n, sourceBlock: 1000n, withdrawalDelay: 100n, maxBurnBlockDelta: 200n }))
  const signTypedData = vi.fn<UnifiedBurnSigner["signTypedData"]>(account.signTypedData)
  const acquireSigner = vi.fn(async () => ({ address: account.address, signTypedData }))
  const active = vi.fn(() => {})
  const boundary = createUnifiedSigningBoundary(plan, { active, limits, acquireSigner })
  const body = (signature: Hex) => JSON.stringify([{ signature, burnIntent: { maxBlockHeight: "1150", maxFee: "1000",
    spec: { ...raw.message.spec, value: "250000", hookData: undefined } } }])
  return { account, plan, raw, limits, signTypedData, acquireSigner, active, boundary, body }
}
describe("Unified Balance lazy signing boundary", () => {
  it("signs exact terms once, verifies the signer, and binds the transfer serialization", async () => {
    const f = fixture()
    expect(() => f.boundary.burn()).toThrow()
    const signature = await f.boundary.sign(f.raw)
    expect(f.acquireSigner).toHaveBeenCalledTimes(1); expect(f.signTypedData).toHaveBeenCalledTimes(1)
    expect(f.limits).toHaveBeenCalledTimes(2)
    await f.boundary.beforeTransfer(f.body(signature))
    expect(f.boundary.burn().message.spec.sourceDepositor).toBe(padHex(f.plan.owner, { size: 32 }))
    await expect(f.boundary.sign(f.raw)).rejects.toThrow()
    await expect(f.boundary.beforeTransfer(f.body(signature))).rejects.toThrow()
    expect(f.signTypedData).toHaveBeenCalledTimes(1)
  })
  it("refuses altered fees before key acquisition", async () => {
    const f = fixture(); f.raw.message.maxFee = 50001n
    await expect(f.boundary.sign(f.raw)).rejects.toThrow("unified_signing_refused")
    expect(f.acquireSigner).not.toHaveBeenCalled(); expect(f.signTypedData).not.toHaveBeenCalled()
  })
  it("rechecks source terms after acquiring the key and does not extend an aging intent", async () => {
    const f = fixture()
    f.acquireSigner.mockImplementation(async () => {
      f.limits.mockResolvedValue({ maxFeeAtomic: 50000n, sourceBlock: 1051n, withdrawalDelay: 100n, maxBurnBlockDelta: 200n })
      return { address: f.account.address, signTypedData: f.signTypedData }
    })
    await expect(f.boundary.sign(f.raw)).rejects.toThrow()
    expect(f.signTypedData).not.toHaveBeenCalled()
  })
  it("refuses a mismatched key without calling its signer", async () => {
    const f = fixture(); f.acquireSigner.mockResolvedValue({ address: f.plan.owner, signTypedData: f.signTypedData })
    await expect(f.boundary.sign(f.raw)).rejects.toThrow()
    expect(f.signTypedData).not.toHaveBeenCalled()
  })
  it("verifies returned signatures instead of trusting an adapter's claimed address", async () => {
    const f = fixture()
    f.signTypedData.mockImplementation(privateKeyToAccount(generatePrivateKey()).signTypedData)
    await expect(f.boundary.sign(f.raw)).rejects.toThrow()
    expect(() => f.boundary.burn()).toThrow()
  })
  it.each(["amount", "height", "fee", "signature", "contractSigner", "set"])("refuses changed transfer %s without signing again", async change => {
    const f = fixture(), signature = await f.boundary.sign(f.raw), body = JSON.parse(f.body(signature))
    if (change === "amount") body[0].burnIntent.spec.value = "250001"
    if (change === "height") body[0].burnIntent.maxBlockHeight = "1151"
    if (change === "fee") body[0].burnIntent.maxFee = "1001"
    if (change === "signature") body[0].signature = "0x00"
    if (change === "contractSigner") body[0].contractSigner = true
    if (change === "set") body.push(body[0])
    await expect(f.boundary.beforeTransfer(JSON.stringify(body))).rejects.toThrow("unified_signing_refused")
    expect(f.signTypedData).toHaveBeenCalledTimes(1)
  })
  it("rechecks freshness before dispatch and retains the consumed signature", async () => {
    const f = fixture(), signature = await f.boundary.sign(f.raw)
    f.limits.mockResolvedValue({ maxFeeAtomic: 50000n, sourceBlock: 1051n, withdrawalDelay: 100n, maxBurnBlockDelta: 200n })
    await expect(f.boundary.beforeTransfer(f.body(signature))).rejects.toThrow()
    await expect(f.boundary.sign(f.raw)).rejects.toThrow()
    expect(f.signTypedData).toHaveBeenCalledTimes(1)
  })
  it("refuses late work after cancellation and redacts read/sign failures", async () => {
    const f = fixture(); f.active.mockImplementation(() => { throw Error("PRIVATE_CONTEXT") })
    await expect(f.boundary.sign(f.raw)).rejects.toThrow("unified_signing_refused")
    expect(f.acquireSigner).not.toHaveBeenCalled()
    const next = fixture(); next.signTypedData.mockRejectedValue(Error("PRIVATE_KEY_ERROR"))
    await expect(next.boundary.sign(next.raw)).rejects.toThrow("unified_signing_refused")
    await expect(next.boundary.beforeTransfer("[]")).rejects.toThrow("unified_signing_refused")
  })
})
