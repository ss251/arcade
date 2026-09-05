import { describe, expect, it } from "vitest"
import { captureFundingAuthority, decodeFundingRequest, decodeFundingSnapshot, parseFundingAmount, parseFundingUint, planDeposit, planWithdrawal, operationDigest, planDigest, encodeFundingPublic, FundingFailure, fundingDeployment, validateDeploymentIdentity, captureFundingPublicEvent, encodeFundingRequest } from "../src/gateway-funding"
import { deploymentRuntimeFixtures } from "./fixtures/gateway-deployment"
import { keccak256, type Hex } from "viem"

const account = "0x1111111111111111111111111111111111111111"
const authority = () => captureFundingAuthority(account)
const rawSnapshot = () => ({ authority: authority(), walletTokenBalance: 10_000_000n, walletNativeBalance: 10_000_000n * 10n ** 12n,
  allowance: 0n, available: 1_000_000n, gatewayTotalBalance: 1_000_700n, pending: 300n, withdrawing: 400n, withdrawable: null, sourceBlock: 1000n, sourceBlockHash: `0x${"33".repeat(32)}`,
  observedAtMs: 1000, destinationBlock: 1000n, destinationBlockHash: `0x${"33".repeat(32)}`, withdrawalDelay: 100n })
const snapshot = () => decodeFundingSnapshot(rawSnapshot(), authority())

describe("explicit Gateway funding policy", () => {
  it("parses canonical six-decimal values without floating point", () => {
    expect(parseFundingAmount("0.000001")).toBe(1n)
    expect(parseFundingAmount("9007199254740993.123456")).toBe(9007199254740993123456n)
    expect(parseFundingAmount("0")).toBe(0n)
    expect(parseFundingUint("42")).toBe(42n)
  })
  it.each([" 1", "1\n", "01", "+1", "1e2", "1.0000001", ".1", "1.", 1, null])("refuses noncanonical amount %s", value => {
    expect(() => parseFundingAmount(value)).toThrow(FundingFailure)
  })
  it("captures authority and rejects altered identities before planning", () => {
    expect(Object.isFrozen(authority())).toBe(true)
    expect(() => decodeFundingSnapshot({ ...rawSnapshot(), authority: { ...authority(), chainId: 1 } }, authority())).toThrow(FundingFailure)
    expect(() => captureFundingAuthority(`0x${"00".repeat(20)}`)).toThrow(FundingFailure)
  })
  it("keeps exact amount distinct from target shortfall and skips adequate approval", () => {
    const exact = decodeFundingRequest({ kind: "deposit", mode: "exact", amount: 2_000_000n, gasCapWei: 10n })
    const target = decodeFundingRequest({ kind: "deposit", mode: "target", minimumAvailable: 2_000_000n, maxDeposit: 1_000_000n, gasCapWei: 10n })
    if (exact.kind !== "deposit" || target.kind !== "deposit") throw new Error("fixture")
    expect(planDeposit(authority(), exact, snapshot()).amount).toBe(2_000_000n)
    expect(planDeposit(authority(), target, snapshot()).amount).toBe(1_000_000n)
    const adequate = decodeFundingSnapshot({ ...rawSnapshot(), allowance: 2_000_000n }, authority())
    expect(planDeposit(authority(), exact, adequate).approvalAmount).toBe(0n)
  })
  it("validates zero shortfall without treating pending funds as available", () => {
    const req = decodeFundingRequest({ kind: "deposit", mode: "target", minimumAvailable: 1_000_000n, maxDeposit: 0n, gasCapWei: 1n })
    if (req.kind !== "deposit" || req.mode !== "target") throw new Error("fixture")
    expect(planDeposit(authority(), req, snapshot()).noop).toBe(true)
    expect(() => planDeposit(authority(), { ...req, minimumAvailable: 1_000_001n }, snapshot())).toThrow(FundingFailure)
  })
  it("counts aggregate gas in Arc's shared native/token pool", () => {
    const req = { kind: "deposit", mode: "exact", amount: 10_000_000n, gasCapWei: 1n } as const
    expect(() => planDeposit(authority(), req, snapshot())).toThrow(FundingFailure)
  })
  it("requires complete observation and own data with fixed diagnostics", () => {
    const missing: Record<string, unknown> = rawSnapshot(); delete missing.pending
    expect(() => decodeFundingSnapshot(missing, authority())).toThrow(FundingFailure)
    const getter = Object.defineProperty({}, "kind", { enumerable: true, get() { throw new Error("SECRET") } })
    expect(() => decodeFundingRequest(getter)).toThrow("Invalid funding data")
    expect(() => decodeFundingRequest(new Proxy({}, { ownKeys() { throw new Error("SECRET") } }))).toThrow("Invalid funding data")
  })
  it("freezes finite withdrawal authority and includes full fee cap", () => {
    const request = { kind: "withdrawal", amount: 999_950n, maxFee: 50n, gasCapWei: 1n, maxBurnBlockDelta: 120n } as const
    expect(planWithdrawal(authority(), request, snapshot()).maxBlockHeight).toBe(1120n)
    expect(() => planWithdrawal(authority(), { ...request, amount: 999_951n }, snapshot())).toThrow(FundingFailure)
    expect(() => planWithdrawal(authority(), { ...request, maxBurnBlockDelta: 99n }, snapshot())).toThrow(FundingFailure)
  })
  it("binds request identity and snapshot in separate deterministic digests", () => {
    const req = { kind: "deposit", mode: "exact", amount: 1n, gasCapWei: 1n } as const, id = `op_${"12".repeat(16)}`
    expect(operationDigest(authority(), req, id)).toBe(operationDigest(authority(), { gasCapWei: 1n, amount: 1n, mode: "exact", kind: "deposit" }, id))
    expect(operationDigest(authority(), req, id)).not.toBe(operationDigest(authority(), { ...req, amount: 2n }, id))
    expect(planDigest(planDeposit(authority(), req, snapshot()))).not.toBe(planDigest(planDeposit(authority(), req, decodeFundingSnapshot({ ...rawSnapshot(), pending: 301n }, authority()))))
  })
  it("encodes only declared public facts and never arbitrary capabilities", () => {
    expect(encodeFundingPublic({ status: "noop", facts: { amount: 0n } })).toBe('{"status":"noop","facts":{"amount":"0"}}')
    expect(() => encodeFundingPublic({ status: "uncertain", facts: { signature: "SECRET" } } as never)).toThrow(FundingFailure)
  })
  it.each(["1\r", "1\u2028", "1\u2029"])("rejects trailing line terminators without coercion %s", value => {
    expect(() => parseFundingAmount(value)).toThrow(FundingFailure)
    expect(() => parseFundingUint(value)).toThrow(FundingFailure)
  })
  it("round trips only closed journal request/event scalars", () => {
    const req = decodeFundingRequest({ kind: "withdrawal", amount: 1n, maxFee: 0n, gasCapWei: 1n, maxBurnBlockDelta: 1n })
    expect(decodeFundingRequest(JSON.parse(encodeFundingRequest(req)))).toEqual(req)
    const event = { event: "planned", facts: { amount: 1n, pending: null, operationId: `op_${"11".repeat(16)}` } } as const
    expect(captureFundingPublicEvent(JSON.parse(encodeFundingPublic(event)))).toEqual(event)
    for (const key of ["transferId", "uuid", "attestation", "signature", "calldata", "rawTransaction", "journalPath"]) {
      expect(() => encodeFundingPublic({ status: "mint_ready", facts: { [key]: "PRIVATE" } } as never)).toThrow(FundingFailure)
    }
  })
  it("bounds own keys and refuses accessors, symbols, inherited and thrown proxy data", () => {
    let invoked = 0
    const getter = Object.defineProperty({}, "kind", { enumerable: true, get() { invoked++; return "deposit" } })
    const poisoned = new Proxy({}, { getPrototypeOf() { throw new Error("PRIVATE") } })
    for (const value of [getter, Object.create({ kind: "deposit" }), { [Symbol("private")]: 1 }, { ["x".repeat(16385)]: 1 },
      Object.fromEntries(Array.from({ length: 81 }, (_, i) => [`k${i}`, 0])), new Proxy({}, { ownKeys() { throw poisoned } })]) {
      expect(() => decodeFundingRequest(value)).toThrow("Invalid funding data")
    }
    expect(invoked).toBe(0)
  })
  it("rejects uint256 overflow, forged plan fields and mutable input aliasing", () => {
    expect(() => parseFundingUint((1n << 256n).toString())).toThrow(FundingFailure)
    expect(() => parseFundingAmount(((1n << 256n) / 1_000_000n + 1n).toString())).toThrow(FundingFailure)
    const raw = rawSnapshot(), copied = decodeFundingSnapshot(raw, authority())
    raw.pending = 123n
    expect(copied.pending).toBe(300n)
    expect(Object.isFrozen(copied)).toBe(true)
    const plan = planDeposit(authority(), { kind: "deposit", mode: "exact", amount: 1n, gasCapWei: 1n }, copied)
    expect(() => planDigest({ ...plan, amount: 2n })).toThrow(FundingFailure)
  })
  it("preserves explicit unknown categories without substituting zero", () => {
    const snap = decodeFundingSnapshot({ ...rawSnapshot(), pending: null, withdrawing: null, withdrawable: null, destinationBlock: null, destinationBlockHash: null, withdrawalDelay: null }, authority())
    expect(snap.pending).toBeNull()
    expect(planDeposit(authority(), { kind: "deposit", mode: "exact", amount: 1n, gasCapWei: 1n }, snap).amount).toBe(1n)
    expect(() => planWithdrawal(authority(), { kind: "withdrawal", amount: 1n, maxFee: 0n, gasCapWei: 1n, maxBurnBlockDelta: 1n }, snap)).toThrow(FundingFailure)
  })
  it("uses observed for read-only inspection, without implying funding completion", () => {
    expect(encodeFundingPublic({ status: "observed", facts: { account, availableAfter: 1n, pending: null } })).toBe(`{"status":"observed","facts":{"availableAfter":"1","pending":null,"account":"${account}"}}`)
  })
})

describe("source-linked declared-offset deployment identity", () => {
  const implementation = `0x${"ab".repeat(20)}` as Hex
  const slot = `0x${"00".repeat(12)}${implementation.slice(2)}` as Hex
  const proxy = deploymentRuntimeFixtures.ERC1967Proxy.runtime
  const bound = (role: "wallet" | "minter"): Hex => {
    const fixture = role === "wallet" ? deploymentRuntimeFixtures.GatewayWallet : deploymentRuntimeFixtures.GatewayMinter
    let result = fixture.runtime
    for (const offset of fixture.immutableOffsets) { const i = 2 + 2 * offset; result = `${result.slice(0, i)}${slot.slice(2)}${result.slice(i + 64)}` as Hex }
    return result
  }
  it("independently matches all retained unbound lengths and whole runtime hashes", () => {
    for (const fixture of Object.values(deploymentRuntimeFixtures)) {
      expect((fixture.runtime.length - 2) / 2).toBe(fixture.bytes)
      expect(keccak256(fixture.runtime)).toBe(fixture.keccak)
    }
    expect(deploymentRuntimeFixtures.GatewayWallet.immutableOffsets).toEqual([3708, 4382])
    expect(deploymentRuntimeFixtures.GatewayMinter.immutableOffsets).toEqual([1683, 1982])
  })
  it.each(["wallet", "minter"] as const)("matches pinned %s artifact bound only at declared self words", role => {
    expect(validateDeploymentIdentity(role, proxy, slot, bound(role))).toEqual({ role, proxy: authority()[role], implementation,
      normalizedHash: role === "wallet" ? fundingDeployment.walletIdentity.hash : fundingDeployment.minterIdentity.hash })
  })
  it("rejects zero, self, high-padding and mismatched implementation slots", () => {
    for (const wrong of [`0x${"00".repeat(32)}`, `0x${"00".repeat(12)}${authority().wallet.slice(2)}`, `0x01${slot.slice(4)}`, `0x${"00".repeat(12)}${"cd".repeat(20)}`]) {
      expect(() => validateDeploymentIdentity("wallet", proxy, wrong, bound("wallet"))).toThrow(FundingFailure)
    }
  })
  it("rejects nonempty code, metadata edits and normalization outside exact offsets", () => {
    const wallet = bound("wallet")
    const at = 2 + 3708 * 2
    for (const wrong of ["0x00", wallet + "00", wallet.slice(0, -2) + "00", wallet.slice(0, at) + "01" + wallet.slice(at + 2), slot + wallet.slice(66), deploymentRuntimeFixtures.GatewayWallet.runtime]) {
      expect(() => validateDeploymentIdentity("wallet", proxy, slot, wrong)).toThrow(FundingFailure)
    }
    expect(() => validateDeploymentIdentity("wallet", proxy.slice(0, -2) + "00", slot, wallet)).toThrow(FundingFailure)
  })
  it("does not treat the observed mismatching Minter length as a trusted baseline", () => {
    // Synthetic wrong-length bytes only: no actual observed chain code is copied.
    try { validateDeploymentIdentity("minter", proxy, slot, `0x${"00".repeat(12101)}`); throw new Error("accepted") }
    catch (error) { expect(error).toBeInstanceOf(FundingFailure); expect((error as FundingFailure).code).toBe("deployment_identity_unavailable") }
  })
})
