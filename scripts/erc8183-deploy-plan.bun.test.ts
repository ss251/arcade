import { describe, expect, it } from "bun:test"
import { decodeAbiParameters, decodeFunctionData, keccak256, parseAbiParameters, toHex, type Hex } from "viem"
import { ESCROW_ARTIFACTS, ESCROW_ADMIN_ABI, ESCROW_COMPILER, ESCROW_DEFAULT_TREASURY, ESCROW_USDC,
  escrowDeploymentPlan, validateEscrowArtifact, type ArtifactRole } from "./erc8183-deploy-plan.ts"

const source = "synthetic local source, not a deployed contract"
function fixture(role: ArtifactRole, runtimeBytes = 2) {
  const target = ESCROW_ARTIFACTS[role]
  return { metadata: { compiler: { version: ESCROW_COMPILER },
    settings: { viaIR: true, evmVersion: "cancun", optimizer: { enabled: true, runs: 200 },
      metadata: { bytecodeHash: "ipfs" }, compilationTarget: { [target.source]: target.name }, libraries: {} },
    sources: { [target.source]: { keccak256: keccak256(toHex(source)) } } },
    bytecode: { object: "0x6000", linkReferences: {} },
    deployedBytecode: { object: "0x" + "00".repeat(runtimeBytes), linkReferences: {} } }
}
const artifacts = () => ({
  implementation: validateEscrowArtifact("implementation", fixture("implementation"), () => source),
  proxy: validateEscrowArtifact("proxy", fixture("proxy"), () => source),
  hook: validateEscrowArtifact("hook", fixture("hook"), () => source)
})
describe("read-only escrow deployment planning", () => {
  it("refuses the reproduced 26,167-byte runtime and the one-byte-over boundary", () => {
    for (const size of [24577, 26167, 27574]) {
      expect(() => validateEscrowArtifact("implementation", fixture("implementation", size), () => source)).toThrow("artifact_oversized")
    }
    expect(validateEscrowArtifact("implementation", fixture("implementation", 24576), () => source).runtimeBytes).toBe(24576)
  })
  it("refuses oversized initcode", () => {
    const a = fixture("proxy"); a.bytecode.object = "0x" + "00".repeat(49153)
    expect(() => validateEscrowArtifact("proxy", a, () => source)).toThrow("artifact_oversized")
  })
  it("rejects stale source, wrong compiler/profile and external links without fetching them", () => {
    expect(() => validateEscrowArtifact("hook", fixture("hook"), () => "changed")).toThrow("artifact_invalid")
    for (const mutate of [
      (a: ReturnType<typeof fixture>) => { a.metadata.compiler.version = "0.8.36" },
      (a: ReturnType<typeof fixture>) => { a.metadata.settings.viaIR = false },
      (a: ReturnType<typeof fixture>) => { a.metadata.settings.optimizer.runs = 1 },
      (a: ReturnType<typeof fixture>) => { a.metadata.settings.evmVersion = "osaka" },
      (a: ReturnType<typeof fixture>) => { a.metadata.sources = { "../secret": { keccak256: keccak256(toHex(source)) } } },
      (a: ReturnType<typeof fixture>) => { a.bytecode.linkReferences = { foreign: {} } }
    ]) {
      const a = fixture("hook"); mutate(a)
      expect(() => validateEscrowArtifact("hook", a, () => source)).toThrow("artifact_invalid")
    }
  })
  it("requires explicit treasury despite the documented default", () => {
    expect(() => escrowDeploymentPlan({ chainId: 5042002, deployerNonce: 10, artifacts: artifacts() })).toThrow("treasury_confirmation_required")
  })
  it("does not trust a forged size field or allow constructor args above the initcode limit", () => {
    const a = artifacts()
    expect(() => escrowDeploymentPlan({ chainId: 5042002, deployerNonce: 0, confirmedTreasury: ESCROW_DEFAULT_TREASURY,
      artifacts: { ...a, implementation: { ...a.implementation, runtimeBytes: 1 } } })).toThrow("artifact_invalid")
    const proxy = fixture("proxy"); proxy.bytecode.object = "0x" + "00".repeat(49152)
    expect(() => escrowDeploymentPlan({ chainId: 5042002, deployerNonce: 0, confirmedTreasury: ESCROW_DEFAULT_TREASURY,
      artifacts: { ...a, proxy: validateEscrowArtifact("proxy", proxy, () => source) } })).toThrow("artifact_oversized")
  })
  it("refuses mainnet, unsafe nonces and zero treasury", () => {
    const base = { chainId: 5042002, deployerNonce: 10, confirmedTreasury: ESCROW_DEFAULT_TREASURY, artifacts: artifacts() }
    for (const delta of [{ chainId: 1 }, { deployerNonce: -1 }, { deployerNonce: 1.5 },
      { deployerNonce: Number.MAX_SAFE_INTEGER }, { confirmedTreasury: "0x" + "00".repeat(20) }]) {
      expect(() => escrowDeploymentPlan({ ...base, ...delta })).toThrow("deployment_plan_invalid")
    }
  })
  it("plans exactly seven ordered calls, no impossible zero-hook setter or native value", () => {
    const plan = escrowDeploymentPlan({ chainId: 5042002, deployerNonce: 10, confirmedTreasury: ESCROW_DEFAULT_TREASURY, artifacts: artifacts() })
    expect(plan.calls.map(c => c.stage)).toEqual(["implementation", "proxy", "platform-fee", "evaluator-fee", "payment-token", "hook", "hook-whitelist"])
    expect(plan.calls.map(c => c.nonce)).toEqual([10, 11, 12, 13, 14, 15, 16])
    expect(plan.calls.every(c => c.value === 0n)).toBe(true)
    expect(plan.calls[0]!.createdAddress).toBe(plan.implementation)
    expect(plan.calls[1]!.createdAddress).toBe(plan.escrow)
    expect(plan.calls[5]!.createdAddress).toBe(plan.hook)
    const proxyArgs = decodeAbiParameters(parseAbiParameters("address,bytes"),
      ("0x" + plan.calls[1]!.data.slice(artifacts().proxy.creation.length)) as Hex)
    expect(proxyArgs[0].toLowerCase()).toBe(plan.implementation)
    const initialize = decodeFunctionData({ abi: ESCROW_ADMIN_ABI, data: proxyArgs[1] })
    expect(initialize.functionName).toBe("initialize")
    expect((initialize.args![0] as string).toLowerCase()).toBe(plan.treasury)
    expect((initialize.args![1] as string).toLowerCase()).toBe(plan.deployer)
    const hookArgs = decodeAbiParameters(parseAbiParameters("address,address"),
      ("0x" + plan.calls[5]!.data.slice(artifacts().hook.creation.length)) as Hex)
    expect(hookArgs.map(a => a.toLowerCase())).toEqual([plan.escrow, plan.evaluator])
    const calls = plan.calls.filter(c => c.to).map(c => decodeFunctionData({ abi: ESCROW_ADMIN_ABI, data: c.data }))
    expect(calls).toEqual([
      { functionName: "setPlatformFee", args: [500n, expect.stringMatching(/^0x/i)] },
      { functionName: "setEvaluatorFee", args: [0n] },
      { functionName: "setPaymentTokenAllowed", args: [ESCROW_USDC, true] },
      { functionName: "setHookWhitelist", args: [expect.stringMatching(/^0x/i), true] }
    ])
    expect((calls[3]!.args![0] as string).toLowerCase()).toBe(plan.hook)
    expect(plan.zeroHookMustAlreadyBeEnabled).toBe(true)
  })
})
