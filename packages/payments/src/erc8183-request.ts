/** Root escrow capability wire v1. No signatures, writes, admission or live rail activation. */
import { hashJson } from "@arcade/core"
import { toHex, type Hex } from "viem"
import { assertFundedEscrowJob, captureEscrowJob, escrowAddress, escrowBytes32, escrowCheck,
  escrowFeeQuote, escrowRecord, escrowSeconds, escrowUint, EscrowFactsRefused, ERC8183_ZERO,
  ERC8183_ZERO_HASH, type EscrowJob } from "./erc8183-codec.ts"
const PREFIX = "arcade:erc8183:request:v1:"
const TOKEN = "0x3600000000000000000000000000000000000000"
const CALL_KEYS = ["chainId", "escrow", "hook", "evaluator", "token", "provider", "providerAgentId", "amount",
  "resource", "method", "skillId", "skillVersion", "inputHash", "timeoutSeconds"] as const
function string(value: unknown, limit: number): string {
  escrowCheck(typeof value === "string" && value.length > 0 && value.length <= limit &&
    new TextEncoder().encode(value).length <= limit && !/[\x00-\x1f\x7f]/.test(value))
  return value
}
/** Caller must derive this from trusted deployment/current listing and the actual request,
 * not from echoed payment metadata. hashJson commits JSON property order, not sorted keys. */
export function captureEscrowCall(input: unknown) {
  try {
    const c = escrowRecord(input, CALL_KEYS)
    escrowCheck(c.chainId === 5042002 && c.method === "POST" && escrowAddress(c.token) === TOKEN &&
      typeof c.timeoutSeconds === "number" && Number.isInteger(c.timeoutSeconds) &&
      c.timeoutSeconds > 0 && c.timeoutSeconds <= 900)
    const amount = escrowUint(c.amount)
    escrowCheck(amount > 0n); escrowFeeQuote(amount)
    return Object.freeze({ chainId: 5042002 as const, escrow: escrowAddress(c.escrow), hook: escrowAddress(c.hook),
      evaluator: escrowAddress(c.evaluator), token: TOKEN as Hex, provider: escrowAddress(c.provider),
      providerAgentId: escrowUint(c.providerAgentId), amount, resource: string(c.resource, 2048), method: "POST" as const,
      skillId: string(c.skillId, 256), skillVersion: string(c.skillVersion, 128),
      inputHash: escrowBytes32(c.inputHash, false), timeoutSeconds: c.timeoutSeconds })
  } catch { throw new EscrowFactsRefused() }
}
export type EscrowCall = ReturnType<typeof captureEscrowCall>
export function newEscrowCapability(random: (bytes: Uint8Array) => Uint8Array = bytes => crypto.getRandomValues(bytes)): Hex {
  try {
    const bytes = new Uint8Array(32)
    escrowCheck(random(bytes) === bytes)
    return escrowBytes32(toHex(bytes), false)
  } catch { throw new EscrowFactsRefused() }
}
/** Transient secret capture. Never persist/log this return value in public receipts/evidence.
 * The surrounding x402 accepted requirements must be checked separately by hub dispatch. */
export function captureEscrowProof(input: unknown) {
  try {
    const p = escrowRecord(input, ["jobId", "capability"])
    escrowCheck(typeof p.jobId === "string" && /^[1-9][0-9]{0,77}$/.test(p.jobId))
    return Object.freeze({ jobId: escrowUint(BigInt(p.jobId)), capability: escrowBytes32(p.capability, false) })
  } catch { throw new EscrowFactsRefused() }
}
/** Called before createJob by the buyer, then independently reconstructed by the hub.
 * The client can be an EOA or smart-contract wallet; no EOA-only client proof is required.
 * A high-entropy secret is never written on chain, only its domain-separated commitment. */
export function escrowRequestDescription(input: unknown, client: unknown, expiredAt: unknown, capability: unknown): string {
  try {
    const c = captureEscrowCall(input)
    return PREFIX + hashJson({ protocol: PREFIX, ...c, providerAgentId: c.providerAgentId.toString(),
      amount: c.amount.toString(), client: escrowAddress(client), expiredAt: escrowSeconds(expiredAt),
      capabilityHash: hashJson({ protocol: "arcade:erc8183:capability:v1", capability: escrowBytes32(capability, false) }) })
  } catch { throw new EscrowFactsRefused() }
}
export interface EscrowSnapshot {
  readonly chainId: number; readonly escrow: Hex; readonly blockNumber: bigint; readonly blockHash: Hex
  readonly timestamp: number; readonly jobId: bigint; readonly pendingClaimHash: Hex; readonly job: EscrowJob
}
/** Read freshness only for this new escrow snapshot; no existing payment validity is changed. */
export function assertEscrowSnapshotFresh(timestamp: number, nowSeconds: number): void {
  const now = escrowSeconds(nowSeconds), at = escrowSeconds(timestamp)
  escrowCheck(at >= now - 30 && at <= now + 5)
}
/** Pure request/chain-fact verification, NOT durable once-only execution admission.
 * snapshot must come from the identity-checked reader, never from HTTP input. */
export function verifyEscrowRequest(snapshot: EscrowSnapshot, input: unknown, proof: unknown, nowSeconds: number) {
  return verifyBoundRequest(snapshot, input, proof, nowSeconds, "funded")
}
/** Before the FIRST provider budget signature/relay. No already-budgeted job retries;
 * durable relay reservation and uncertain-send reconciliation remain mandatory. */
export function verifyEscrowBudgetRequest(snapshot: EscrowSnapshot, input: unknown, proof: unknown, nowSeconds: number) {
  return verifyBoundRequest(snapshot, input, proof, nowSeconds, "budget")
}
function verifyBoundRequest<const Stage extends "budget" | "funded">(
  snapshot: EscrowSnapshot, input: unknown, proof: unknown, nowSeconds: number, stage: Stage
) {
  try {
    const c = captureEscrowCall(input), p = captureEscrowProof(proof), job = captureEscrowJob(snapshot.job)
    escrowCheck(snapshot.chainId === c.chainId && escrowAddress(snapshot.escrow) === c.escrow &&
      escrowUint(snapshot.blockNumber) > 0n && escrowUint(snapshot.jobId) === p.jobId)
    const blockHash = escrowBytes32(snapshot.blockHash, false)
    assertEscrowSnapshotFresh(snapshot.timestamp, nowSeconds)
    const description = escrowRequestDescription(c, job.client, job.expiredAt, p.capability)
    if (stage === "budget") {
      escrowCheck(job.status === 0 && job.budget === 0n && job.paymentToken === ERC8183_ZERO)
      // Apply the identical identity/request/full-job/lifetime checks to the proposed
      // budget, without pretending the original Open snapshot was actually funded.
      assertFundedEscrowJob({ ...job, status: 1, budget: c.amount, paymentToken: c.token },
        snapshot.pendingClaimHash, { ...c, description }, nowSeconds)
    } else assertFundedEscrowJob(job, snapshot.pendingClaimHash, { ...c, description }, nowSeconds)
    escrowCheck(job.client !== c.provider && c.evaluator !== c.provider &&
      snapshot.pendingClaimHash === ERC8183_ZERO_HASH)
    return Object.freeze({ rail: "erc8183" as const, stage, chainId: c.chainId, escrow: c.escrow, jobId: p.jobId,
      payer: job.client, payTo: c.provider, amountAtomic: c.amount, network: "eip155:5042002" as const,
      requestHash: escrowBytes32(description.slice(PREFIX.length), false), blockHash,
      blockNumber: snapshot.blockNumber, expiredAt: job.expiredAt })
  } catch { throw new EscrowFactsRefused() }
}
