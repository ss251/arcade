/** Read-only J6 deployment planning. No key lookup, RPC, signing or broadcast. */
import { encodeDeployData, encodeFunctionData, getContractAddress, keccak256, parseAbi, toHex, type Hex } from "viem"

export const ESCROW_PIN = "142e669c1fd318486a4628395b629f033654dd06"
export const ESCROW_COMPILER = "0.8.28+commit.7893614a"
export const ESCROW_CHAIN = 5042002
export const ESCROW_DEPLOYER = "0xcf821769ed3c0e55e152745377bb833d7155a78a" as Hex
export const ESCROW_EVALUATOR = "0xbe8efcca100f618bd1e6c694f865069eadae5f8b" as Hex
export const ESCROW_DEFAULT_TREASURY = ESCROW_DEPLOYER
export const ESCROW_USDC = "0x3600000000000000000000000000000000000000" as Hex
export const ESCROW_REFERENCE = "0x0747eef0706327138c69792bf28cd525089e4583" as Hex
export const ESCROW_ARTIFACTS = Object.freeze({
  implementation: { name: "ERC8183WithAuthorization", source: "lib/erc8183/contracts/ERC8183WithAuthorization.sol" },
  proxy: { name: "ERC1967Proxy", source: "lib/erc8183/lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol" },
  hook: { name: "ArcadeJobHook", source: "contracts/ArcadeJobHook.sol" }
})
export type ArtifactRole = keyof typeof ESCROW_ARTIFACTS
export class EscrowDeployRefusal extends Error {
  constructor(readonly code: "artifact_invalid" | "artifact_oversized" | "treasury_confirmation_required" | "deployment_plan_invalid",
    readonly sizes?: { readonly runtimeBytes: number; readonly creationBytes: number }) {
    super(code)
  }
}
function check(value: unknown, code: EscrowDeployRefusal["code"] = "artifact_invalid"): asserts value {
  if (!value) throw new EscrowDeployRefusal(code)
}
function record(value: unknown): Record<string, unknown> {
  check(value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
  const captured: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    check(typeof key === "string")
    const d = Object.getOwnPropertyDescriptor(value, key)
    check(d && "value" in d)
    captured[key] = d.value
  }
  return captured
}
function hex(value: unknown, maxBytes: number): Hex {
  check(typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(value) && value.length <= 2 + maxBytes * 2)
  return value.toLowerCase() as Hex
}
function address(value: unknown): Hex {
  check(typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value), "deployment_plan_invalid")
  return value.toLowerCase() as Hex
}
export interface EscrowArtifact {
  readonly role: ArtifactRole
  readonly creation: Hex
  readonly runtime: Hex
  readonly creationHash: Hex
  readonly runtimeTemplateHash: Hex
  readonly creationBytes: number
  readonly runtimeBytes: number
}
/** Size/settings/source preflight, not independent proof of compiler correctness.
 * readSource must read from the verified local checkout, never follow metadata URLs. */
export function validateEscrowArtifact(role: ArtifactRole, input: unknown, readSource: (path: string) => string): EscrowArtifact {
  check(Object.hasOwn(ESCROW_ARTIFACTS, role))
  const a = record(input), metadata = record(a.metadata), settings = record(metadata.settings)
  check(record(metadata.compiler).version === ESCROW_COMPILER && settings.viaIR === true &&
    settings.evmVersion === "cancun" && record(settings.optimizer).enabled === true &&
    record(settings.optimizer).runs === 200 && record(settings.metadata).bytecodeHash === "ipfs")
  const expected = ESCROW_ARTIFACTS[role], target = record(settings.compilationTarget)
  check(Object.keys(target).length === 1 && target[expected.source] === expected.name &&
    Object.keys(record(settings.libraries)).length === 0)
  const sources = record(metadata.sources), paths = Object.keys(sources)
  check(paths.length > 0 && paths.length <= 128 && Object.hasOwn(sources, expected.source))
  for (const path of paths) {
    check(path === "contracts/ArcadeJobHook.sol" || path.startsWith("lib/erc8183/"))
    check(!path.includes("..") && !/[\\\u0000-\u001f\u007f]/.test(path))
    const content = readSource(path)
    check(typeof content === "string" && content.length <= 500000 &&
      record(sources[path]).keccak256 === keccak256(toHex(content)))
  }
  const creationSection = record(a.bytecode), runtimeSection = record(a.deployedBytecode)
  check(Object.keys(record(creationSection.linkReferences)).length === 0 &&
    Object.keys(record(runtimeSection.linkReferences)).length === 0)
  const creation = hex(creationSection.object, 100000), runtime = hex(runtimeSection.object, 100000)
  const creationBytes = (creation.length - 2) / 2, runtimeBytes = (runtime.length - 2) / 2
  // A real network deployment cannot inherit Forge's permissive test environment.
  if (runtimeBytes > 24576 || creationBytes > 49152) throw new EscrowDeployRefusal("artifact_oversized", { runtimeBytes, creationBytes })
  return Object.freeze({ role, creation, runtime, creationHash: keccak256(creation),
    runtimeTemplateHash: keccak256(runtime), creationBytes, runtimeBytes })
}
export const ESCROW_ADMIN_ABI = parseAbi([
  "function initialize(address treasury,address admin)",
  "function setPlatformFee(uint256 feeBP,address treasury)",
  "function setEvaluatorFee(uint256 feeBP)",
  "function setPaymentTokenAllowed(address token,bool allowed)",
  "function setHookWhitelist(address hook,bool allowed)"
])
export interface EscrowDeploymentCall {
  readonly stage: "implementation" | "proxy" | "platform-fee" | "evaluator-fee" | "payment-token" | "hook" | "hook-whitelist"
  readonly nonce: number
  readonly to?: Hex
  readonly createdAddress?: Hex
  readonly data: Hex
  readonly value: 0n
}
export function escrowDeploymentPlan(input: {
  readonly chainId: number
  readonly confirmedTreasury?: string
  readonly deployerNonce: number
  readonly artifacts: Readonly<Record<ArtifactRole, EscrowArtifact>>
}) {
  check(input.confirmedTreasury !== undefined, "treasury_confirmation_required")
  const treasury = address(input.confirmedTreasury)
  check(input.chainId === ESCROW_CHAIN && Number.isSafeInteger(input.deployerNonce) &&
    input.deployerNonce >= 0 && input.deployerNonce <= Number.MAX_SAFE_INTEGER - 7, "deployment_plan_invalid")
  for (const role of Object.keys(ESCROW_ARTIFACTS) as ArtifactRole[]) {
    const a = input.artifacts[role]
    check(a.role === role && a.runtimeBytes <= 24576 && a.creationBytes <= 49152 &&
      a.runtimeBytes === (a.runtime.length - 2) / 2 && a.creationBytes === (a.creation.length - 2) / 2 &&
      keccak256(a.creation) === a.creationHash && keccak256(a.runtime) === a.runtimeTemplateHash, "artifact_invalid")
  }
  const contractAt = (offset: number) => getContractAddress({ from: ESCROW_DEPLOYER, nonce: BigInt(input.deployerNonce + offset) }).toLowerCase() as Hex
  const implementation = contractAt(0), escrow = contractAt(1), hook = contractAt(5)
  const call = (stage: EscrowDeploymentCall["stage"], offset: number, data: Hex, to?: Hex): EscrowDeploymentCall =>
    Object.freeze({ stage, nonce: input.deployerNonce + offset, data, value: 0n,
      ...(to ? { to } : { createdAddress: contractAt(offset) }) })
  const calls: readonly EscrowDeploymentCall[] = Object.freeze([
    call("implementation", 0, input.artifacts.implementation.creation),
    call("proxy", 1, encodeDeployData({ abi: parseAbi(["constructor(address implementation,bytes data)"]),
      bytecode: input.artifacts.proxy.creation, args: [implementation, encodeFunctionData({ abi: ESCROW_ADMIN_ABI,
        functionName: "initialize", args: [treasury, ESCROW_DEPLOYER] })] })),
    call("platform-fee", 2, encodeFunctionData({ abi: ESCROW_ADMIN_ABI, functionName: "setPlatformFee", args: [500n, treasury] }), escrow),
    call("evaluator-fee", 3, encodeFunctionData({ abi: ESCROW_ADMIN_ABI, functionName: "setEvaluatorFee", args: [0n] }), escrow),
    call("payment-token", 4, encodeFunctionData({ abi: ESCROW_ADMIN_ABI, functionName: "setPaymentTokenAllowed", args: [ESCROW_USDC, true] }), escrow),
    call("hook", 5, encodeDeployData({ abi: parseAbi(["constructor(address escrow,address evaluator)"]),
      bytecode: input.artifacts.hook.creation, args: [escrow, ESCROW_EVALUATOR] })),
    call("hook-whitelist", 6, encodeFunctionData({ abi: ESCROW_ADMIN_ABI, functionName: "setHookWhitelist", args: [hook, true] }), escrow)
  ])
  check(calls.every(c => c.to !== undefined || (c.data.length - 2) / 2 <= 49152), "artifact_oversized")
  // The zero-hook getter must already be true after initialize; its setter reverts.
  return Object.freeze({ chainId: ESCROW_CHAIN, deployer: ESCROW_DEPLOYER, treasury, implementation,
    escrow, hook, evaluator: ESCROW_EVALUATOR, reference: ESCROW_REFERENCE, pin: ESCROW_PIN,
    zeroHookMustAlreadyBeEnabled: true, calls })
}
