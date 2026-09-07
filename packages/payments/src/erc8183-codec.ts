/** Bounded offline ERC-8183 facts/commitments; no IO or changes to existing rails. */
import { encodeAbiParameters, parseAbiParameters, type Hex } from "viem"
export const ERC8183_ZERO = ("0x" + "00".repeat(20)) as Hex
export const ERC8183_ZERO_HASH = ("0x" + "00".repeat(32)) as Hex
export class EscrowFactsRefused extends Error { constructor() { super("escrow_facts_refused") } }
export function escrowCheck(value: unknown): asserts value { if (!value) throw new EscrowFactsRefused() }
export function escrowRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  escrowCheck(value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
  const own = Reflect.ownKeys(value)
  escrowCheck(own.length === keys.length && own.every(key => typeof key === "string" && keys.includes(key)))
  const result: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    escrowCheck(descriptor && "value" in descriptor)
    result[key] = descriptor.value
  }
  return result
}
export function escrowAddress(value: unknown, zeroAllowed = false): Hex {
  escrowCheck(typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) &&
    (zeroAllowed || value.toLowerCase() !== ERC8183_ZERO))
  return value.toLowerCase() as Hex
}
export function escrowBytes32(value: unknown, zeroAllowed = true): Hex {
  escrowCheck(typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) &&
    (zeroAllowed || value.toLowerCase() !== ERC8183_ZERO_HASH))
  return value.toLowerCase() as Hex
}
export function escrowUint(value: unknown, bits = 256): bigint {
  escrowCheck(Number.isInteger(bits) && bits > 0 && bits <= 256)
  escrowCheck(typeof value === "bigint" && value >= 0n && value < (1n << BigInt(bits)))
  return value
}
export function escrowSeconds(value: unknown): number {
  escrowCheck(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < 2 ** 48)
  return value
}
const JOB_KEYS = ["client", "status", "provider", "expiredAt", "evaluator", "submittedAt", "budget", "hook",
  "paymentToken", "providerAgentId", "description", "settledAmount", "payoutReceiver"] as const
export function captureEscrowJob(input: unknown) {
  const j = escrowRecord(input, JOB_KEYS)
  escrowCheck(typeof j.status === "number" && Number.isInteger(j.status) && j.status >= 0 && j.status <= 5)
  escrowCheck(typeof j.description === "string" && new TextEncoder().encode(j.description).length <= 4096)
  return Object.freeze({
    client: escrowAddress(j.client, true), status: j.status,
    provider: escrowAddress(j.provider, true), expiredAt: escrowSeconds(j.expiredAt),
    evaluator: escrowAddress(j.evaluator, true), submittedAt: escrowSeconds(j.submittedAt),
    budget: escrowUint(j.budget), hook: escrowAddress(j.hook, true), paymentToken: escrowAddress(j.paymentToken, true),
    providerAgentId: escrowUint(j.providerAgentId), description: j.description,
    settledAmount: escrowUint(j.settledAmount), payoutReceiver: escrowAddress(j.payoutReceiver, true)
  })
}
export type EscrowJob = ReturnType<typeof captureEscrowJob>
export interface ExpectedEscrowJob {
  readonly provider: Hex
  readonly evaluator: Hex
  readonly hook: Hex
  readonly token: Hex
  readonly amount: bigint
  readonly providerAgentId: bigint
  /** Must be the independently derived, buyer-committed request binding, not copied from the job. */
  readonly description: string
  readonly timeoutSeconds: number
}
/** Finalized snapshot caller must bind jobId and pendingClaimHash to the same block.
 * This checks chain facts, NOT HTTP caller ownership or durable once-only admission. */
export function assertFundedEscrowJob(job: EscrowJob, pendingClaimHash: unknown, expected: ExpectedEscrowJob, nowSeconds: number): void {
  const now = escrowSeconds(nowSeconds), captured = captureEscrowJob(job)
  escrowCheck(Number.isSafeInteger(expected.timeoutSeconds) && expected.timeoutSeconds > 0 && expected.timeoutSeconds <= 900)
  escrowCheck(captured.status === 1 && captured.client !== ERC8183_ZERO &&
    captured.provider === escrowAddress(expected.provider) && captured.evaluator === escrowAddress(expected.evaluator) &&
    captured.hook === escrowAddress(expected.hook) && captured.paymentToken === escrowAddress(expected.token) &&
    captured.budget === escrowUint(expected.amount) && captured.budget > 0n &&
    captured.providerAgentId === escrowUint(expected.providerAgentId) &&
    captured.description === expected.description &&
    captured.expiredAt - now >= expected.timeoutSeconds + 600 &&
    captured.submittedAt === 0 && captured.settledAmount === 0n &&
    (captured.payoutReceiver === ERC8183_ZERO || captured.payoutReceiver === captured.provider) &&
    escrowBytes32(pendingClaimHash) === ERC8183_ZERO_HASH)
  escrowFeeQuote(captured.budget)
}
/** The upstream platform fee floors, unlike the existing splitter's ceil rule. */
export function escrowFeeQuote(amount: bigint) {
  escrowUint(amount)
  // The upstream checked uint256 multiplication must not overflow on complete.
  escrowCheck(amount <= ((1n << 256n) - 1n) / 500n)
  const feeAtomic = amount * 500n / 10000n
  return Object.freeze({ feeAtomic, sellerAtomic: amount - feeAtomic })
}
export interface EscrowTreeCommitment {
  readonly treeHash: Hex
  readonly childCount: number
  readonly childTotalAtomic: bigint
  readonly receiptHash: Hex
}
export function encodeEscrowCommitment(input: EscrowTreeCommitment): Hex {
  const treeHash = escrowBytes32(input.treeHash), receiptHash = escrowBytes32(input.receiptHash, false)
  escrowCheck(Number.isSafeInteger(input.childCount) && input.childCount >= 0 && input.childCount < 2 ** 32)
  const total = escrowUint(input.childTotalAtomic)
  escrowCheck(input.childCount === 0 ? treeHash === ERC8183_ZERO_HASH && total === 0n : treeHash !== ERC8183_ZERO_HASH)
  return encodeAbiParameters(parseAbiParameters("bytes32,uint32,uint256,bytes32"),
    [treeHash, input.childCount, total, receiptHash])
}
