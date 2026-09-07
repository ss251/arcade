/** Pinned ERC8183/1 provider signatures. No RPC, key discovery or broadcasting. */
import { encodeFunctionData, keccak256, toHex, verifyTypedData, type Hex } from "viem"
import { ERC8183_ABI } from "./erc8183-abi.ts"
import { escrowAddress, escrowBytes32, escrowCheck, escrowFeeQuote, escrowSeconds, escrowUint, EscrowFactsRefused } from "./erc8183-codec.ts"

const field = <const N extends string, const T extends string>(name: N, type: T) => Object.freeze({ name, type })
export const ERC8183_PROVIDER_TYPES = Object.freeze({
  SetBudgetAuthorization: Object.freeze([
    field("signer", "address"), field("jobId", "uint256"), field("token", "address"),
    field("amount", "uint256"), field("optParamsHash", "bytes32"), field("nonce", "uint72"), field("deadline", "uint256")
  ]),
  SubmitAuthorization: Object.freeze([
    field("signer", "address"), field("jobId", "uint256"), field("deliverable", "bytes32"),
    field("optParamsHash", "bytes32"), field("nonce", "uint72"), field("deadline", "uint256")
  ])
})
const EMPTY_OPTS = "0x" as Hex
const EMPTY_OPTS_HASH = keccak256(EMPTY_OPTS)
/** New provider action's fixed ten-minute plan window, not an existing payment window. */
export const providerAuthorizationDeadline = (nowSeconds: number): bigint => BigInt(escrowSeconds(nowSeconds)) + 600n
export function randomProviderNonce(random: (bytes: Uint8Array) => Uint8Array = bytes => crypto.getRandomValues(bytes)): bigint {
  const bytes = new Uint8Array(9)
  escrowCheck(random(bytes) === bytes && bytes.length === 9)
  return BigInt(toHex(bytes))
}
export function packProviderNonce(signer: Hex, nonce: bigint): Hex {
  return toHex((BigInt(escrowAddress(signer)) << 96n) | escrowUint(nonce, 72), { size: 32 })
}
export interface ProviderAuthorizationBase {
  readonly chainId: number
  readonly escrow: Hex
  readonly signer: Hex
  readonly jobId: bigint
  readonly nonce: bigint
  readonly deadline: bigint
}
function captureBase(input: ProviderAuthorizationBase, nowSeconds: number) {
  escrowCheck(input.chainId === 5042002)
  const jobId = escrowUint(input.jobId), deadline = escrowUint(input.deadline), now = BigInt(escrowSeconds(nowSeconds))
  escrowCheck(jobId > 0n && deadline > now && deadline <= now + 600n)
  return Object.freeze({
    domain: Object.freeze({ name: "ERC8183", version: "1", chainId: input.chainId, verifyingContract: escrowAddress(input.escrow) }),
    signer: escrowAddress(input.signer), jobId, nonce: escrowUint(input.nonce, 72), deadline
  })
}
export function setBudgetAuthorization(input: ProviderAuthorizationBase & { readonly token: Hex; readonly amount: bigint }, nowSeconds: number) {
  const base = captureBase(input, nowSeconds), amount = escrowUint(input.amount)
  escrowCheck(amount > 0n)
  escrowFeeQuote(amount)
  return Object.freeze({
    domain: base.domain, types: ERC8183_PROVIDER_TYPES, primaryType: "SetBudgetAuthorization" as const,
    message: Object.freeze({ signer: base.signer, jobId: base.jobId, token: escrowAddress(input.token), amount,
      optParamsHash: EMPTY_OPTS_HASH, nonce: base.nonce, deadline: base.deadline })
  })
}
export function submitAuthorization(input: ProviderAuthorizationBase & { readonly deliverable: Hex }, nowSeconds: number) {
  const base = captureBase(input, nowSeconds)
  return Object.freeze({
    domain: base.domain, types: ERC8183_PROVIDER_TYPES, primaryType: "SubmitAuthorization" as const,
    message: Object.freeze({ signer: base.signer, jobId: base.jobId, deliverable: escrowBytes32(input.deliverable, false),
      optParamsHash: EMPTY_OPTS_HASH, nonce: base.nonce, deadline: base.deadline })
  })
}
function captureSignature(signature: unknown): Hex {
  escrowCheck(typeof signature === "string" && /^0x[0-9a-fA-F]{130}$/.test(signature))
  return signature.toLowerCase() as Hex
}
/** EOA seller signing only in this checkpoint. These return calldata, never send it.
 * The caller must still recheck nonce use, job state, deployment identity and time
 * immediately before a separately guarded relay. */
export async function encodeSetBudgetRelay(
  input: ProviderAuthorizationBase & { readonly token: Hex; readonly amount: bigint },
  signature: unknown,
  nowSeconds: number
): Promise<Hex> {
  try {
    const typed = setBudgetAuthorization(input, nowSeconds), sig = captureSignature(signature)
    escrowCheck(await verifyTypedData({ ...typed, address: typed.message.signer, signature: sig }))
    const m = typed.message
    return encodeFunctionData({ abi: ERC8183_ABI, functionName: "setBudgetWithAuthorization",
      args: [m.jobId, m.token, m.amount, EMPTY_OPTS, { signer: m.signer, nonce: m.nonce, deadline: m.deadline, sig }] })
  } catch { throw new EscrowFactsRefused() }
}
export async function encodeSubmitRelay(
  input: ProviderAuthorizationBase & { readonly deliverable: Hex },
  signature: unknown,
  nowSeconds: number
): Promise<Hex> {
  try {
    const typed = submitAuthorization(input, nowSeconds), sig = captureSignature(signature)
    escrowCheck(await verifyTypedData({ ...typed, address: typed.message.signer, signature: sig }))
    const m = typed.message
    return encodeFunctionData({ abi: ERC8183_ABI, functionName: "submitWithAuthorization",
      args: [m.jobId, m.deliverable, EMPTY_OPTS, { signer: m.signer, nonce: m.nonce, deadline: m.deadline, sig }] })
  } catch { throw new EscrowFactsRefused() }
}
