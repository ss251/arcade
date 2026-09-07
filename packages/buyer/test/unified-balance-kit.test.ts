import { describe, expect, it, vi } from "vitest"
import { unifiedKitBindings } from "../src/unified-balance-kit.ts"
import { captureUnifiedFundingPlan } from "../src/unified-balance-funding.ts"

const owner = `0x${"11".repeat(20)}` as const, recipient = `0x${"22".repeat(20)}` as const
const plan = captureUnifiedFundingPlan({ owner, recipient, sourceChain: "Base_Sepolia", amount: "0.25" })
type Kit = Parameters<typeof unifiedKitBindings>[0]
type Adapter = Parameters<typeof unifiedKitBindings>[1]
const setup = () => {
  const read = { getAddress: vi.fn(async (_chain: unknown) => owner) }
  const signer = { getAddress: vi.fn(async (_chain: unknown) => recipient) }
  const kit = { getDelegateStatus: vi.fn(async () => "pending"), spend: vi.fn(async () => ({ sdk: true })) }
  // Narrow test doubles for the three methods this binding may invoke.
  const bindings = unifiedKitBindings(kit as unknown as Kit, read as unknown as Adapter, signer as unknown as Adapter)
  return { kit, read, signer, bindings }
}
describe("Unified Balance Kit1.6.0 binding", () => {
  it("reads readiness using the owner adapter, without touching the delegate adapter", async () => {
    const { kit, read, signer, bindings } = setup()
    expect(await bindings.delegateStatus({ owner, delegate: recipient, sourceChain: "Base_Sepolia" })).toBe("pending")
    expect(read.getAddress.mock.calls[0]?.[0]).toMatchObject({ chain: "Base_Sepolia", isTestnet: true })
    expect(signer.getAddress).not.toHaveBeenCalled()
    expect(kit.spend).not.toHaveBeenCalled()
    expect(kit.getDelegateStatus).toHaveBeenCalledExactlyOnceWith({ from: { adapter: read, chain: "Base_Sepolia" },
      delegateAddress: recipient, token: "USDC" })
  })
  it("refuses a reader resolving a different owner before invoking the kit", async () => {
    const { kit, read, bindings } = setup()
    read.getAddress.mockResolvedValue(recipient)
    await expect(bindings.delegateStatus({ owner, delegate: recipient, sourceChain: "Base_Sepolia" })).rejects.toMatchObject({ code: "read_unavailable" })
    expect(kit.getDelegateStatus).not.toHaveBeenCalled()
  })
  it("binds both source and Arc destination to the same delegate", async () => {
    const { kit, signer, bindings } = setup()
    expect(await bindings.spend(plan)).toEqual({ sdk: true })
    expect(signer.getAddress.mock.calls.map(row => row[0])).toMatchObject([
      { chain: "Base_Sepolia", isTestnet: true }, { chain: "Arc_Testnet", isTestnet: true }])
    expect(kit.spend).toHaveBeenCalledExactlyOnceWith({ token: "USDC", amount: "0.250000",
      from: { adapter: signer, sourceAccount: owner, allocations: { chain: "Base_Sepolia", amount: "0.250000" } },
      to: { adapter: signer, chain: "Arc_Testnet", recipientAddress: recipient } })
  })
  it.each([0, 1])("refuses a mismatched signer on address check %s", async index => {
    const { kit, signer, bindings } = setup()
    if (index === 1) signer.getAddress.mockResolvedValueOnce(recipient)
    signer.getAddress.mockResolvedValueOnce(owner)
    await expect(bindings.spend(plan)).rejects.toMatchObject({ code: "input_invalid" })
    expect(kit.spend).not.toHaveBeenCalled()
  })
})
