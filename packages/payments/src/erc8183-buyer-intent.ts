/** Offline buyer intent and calldata. No key acquisition, RPC, signing or send authority.
 * Trusted local pins/call/expiry must NOT be learned from echoed challenge/health metadata. */
import { hashJson } from "@arcade/core"
import { encodeFunctionData, erc20Abi, type Hex } from "viem"
import { ERC8183_ABI } from "./erc8183-abi.ts"
import { captureEscrowJob, escrowAddress, escrowBytes32, escrowCheck, escrowRecord, escrowSeconds, escrowUint,
  EscrowFactsRefused, ERC8183_ZERO, ERC8183_ZERO_HASH } from "./erc8183-codec.ts"
import { captureEscrowIdentity } from "./erc8183-reader.ts"
import { assertEscrowSnapshotFresh, captureEscrowCall, escrowRequestDescription } from "./erc8183-request.ts"
import { captureEscrowRequirements } from "./erc8183-wire.ts"
const originals = new WeakSet<object>()
const actions = new WeakSet<object>()
const PREFIX = "arcade:erc8183:request:v1:"
/** Arc native USDC has 18 decimals; ERC-20 has 6, backed by the SAME balance.
 * Principal plus remaining gas must fit together, not pass two independent checks.
 * https://docs.arc.io/arc/concepts/stablecoin-native-model */
function reserve(amount: bigint, gas: bigint) { return escrowUint(amount * 10n ** 12n + gas) }
export function createEscrowBuyerIntent(input: unknown) {
  try {
    const r = escrowRecord(input, ["identity", "call", "requirements", "client", "issuedAt", "expiresInSeconds",
      "capability", "maxAmountAtomic", "gasBudgetWei"])
    const identity = captureEscrowIdentity(r.identity), call = captureEscrowCall(r.call), terms = captureEscrowRequirements(r.requirements)
    for (const key of ["chainId", "escrow", "hook", "evaluator", "token"] as const) escrowCheck(call[key] === identity[key])
    for (const key of Object.keys(call) as (keyof typeof call)[]) escrowCheck(call[key] === terms.call[key])
    const client = escrowAddress(r.client), issuedAt = escrowSeconds(r.issuedAt), expiresInSeconds = escrowSeconds(r.expiresInSeconds),
      maxAmountAtomic = escrowUint(r.maxAmountAtomic), gasBudgetWei = escrowUint(r.gasBudgetWei)
    escrowCheck(client !== call.provider && call.provider !== call.evaluator && call.providerAgentId > 0n &&
      maxAmountAtomic >= call.amount && gasBudgetWei > 0n && expiresInSeconds === terms.expiresInSeconds)
    const url = new URL(call.resource)
    escrowCheck(["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash &&
      url.href === call.resource && url.pathname === `/x/${call.provider}/${encodeURIComponent(call.skillId)}`)
    const expiredAt = escrowSeconds(issuedAt + expiresInSeconds), fundBy = expiredAt - call.timeoutSeconds - 600
    escrowCheck(fundBy >= issuedAt); reserve(call.amount, gasBudgetWei)
    const description = escrowRequestDescription(call, client, expiredAt, escrowBytes32(r.capability, false)),
      requestHash = escrowBytes32(description.slice(PREFIX.length), false)
    const id = hashJson({ protocol: "arcade:erc8183:buyer-intent:v1", identity,
      call: { ...call, amount: call.amount.toString(), providerAgentId: call.providerAgentId.toString() }, client, issuedAt,
      expiredAt, description, maxAmountAtomic: maxAmountAtomic.toString(), gasBudgetWei: gasBudgetWei.toString() })
    // Only a secret-derived commitment survives. The later private journal owns the raw
    // capability separately; public SDK evidence must never serialize that private record.
    const intent = Object.freeze({ id, identity, call, requirements: terms.requirements, client, issuedAt, expiredAt,
      fundBy, description, requestHash, maxAmountAtomic, gasBudgetWei })
    originals.add(intent); return intent
  } catch { throw new EscrowFactsRefused() }
}
export type EscrowBuyerIntent = ReturnType<typeof createEscrowBuyerIntent>
export function captureOriginalEscrowBuyerIntent(input: EscrowBuyerIntent) {
  escrowCheck(originals.has(input)); return input
}
/** Supplied balance must be the independently read native view, not an HTTP claim.
 * spentGasWei is the sum of independently proven prior buyer gas, not an estimate.
 * Use only BEFORE funding; the principal is still reserved throughout this sequence. */
export function assertEscrowBuyerReserve(input: EscrowBuyerIntent, nativeBalanceWei: bigint, spentGasWei: bigint) {
  try {
    const i = captureOriginalEscrowBuyerIntent(input), spent = escrowUint(spentGasWei)
    escrowCheck(spent <= i.gasBudgetWei)
    const principalWei = escrowUint(i.call.amount * 10n ** 12n), remainingGasWei = i.gasBudgetWei - spent,
      requiredWei = reserve(i.call.amount, remainingGasWei)
    escrowCheck(escrowUint(nativeBalanceWei) >= requiredWei)
    return Object.freeze({ principalWei, remainingGasWei, requiredWei })
  } catch { throw new EscrowFactsRefused() }
}
export interface PreparedEscrowBuyerAction {
  readonly kind: "create" | "approve" | "fund"; readonly intent: EscrowBuyerIntent; readonly jobId: bigint | null
  readonly chainId: 5042002; readonly sender: Hex; readonly to: Hex; readonly value: 0n; readonly data: Hex
}
export function captureOriginalEscrowBuyerAction(input: PreparedEscrowBuyerAction) {
  escrowCheck(actions.has(input)); return input
}
/** Facts must originate from the full-pinned reader, with allowance read independently at
 * the SAME block and a closing canonical check. This function checks facts, not their origin.
 * A later executor must own durable intent/nonce/hash claims before any signature or send. */
export function prepareEscrowBuyerAction(input: EscrowBuyerIntent, snapshot: unknown, operation: unknown,
  nowSeconds: number): PreparedEscrowBuyerAction {
  try {
    const i = captureOriginalEscrowBuyerIntent(input), now = escrowSeconds(nowSeconds), kind: unknown = operation && typeof operation === "object"
      ? Object.getOwnPropertyDescriptor(operation, "kind")?.value : undefined
    escrowCheck(kind === "create" || kind === "approve" || kind === "fund")
    const op = escrowRecord(operation, kind === "create" ? ["kind"] : ["kind", "jobId", "allowanceAtomic"])
    escrowCheck(now >= i.issuedAt && now <= i.fundBy)
    const s = escrowRecord(snapshot, kind === "create" ? ["identity", "chainId", "escrow", "blockNumber", "blockHash", "timestamp"] :
      ["chainId", "escrow", "blockNumber", "blockHash", "timestamp", "jobId", "pendingClaimHash", "job"])
    escrowCheck(s.chainId === 5042002 && escrowAddress(s.escrow) === i.identity.escrow && escrowUint(s.blockNumber) > 0n)
    escrowBytes32(s.blockHash, false); assertEscrowSnapshotFresh(escrowSeconds(s.timestamp), now)
    let jobId: bigint | null = null, data: Hex, to: Hex = i.call.escrow
    if (kind === "create") {
      escrowCheck(JSON.stringify(captureEscrowIdentity(s.identity)) === JSON.stringify(i.identity))
      data = encodeFunctionData({ abi: ERC8183_ABI, functionName: "createJob", args: [i.call.provider, i.call.evaluator,
        i.expiredAt, i.description, i.call.hook, i.call.providerAgentId] })
    } else {
      jobId = escrowUint(op.jobId); escrowCheck(jobId > 0n && escrowUint(s.jobId) === jobId)
      const j = captureEscrowJob(s.job), allowance = escrowUint(op.allowanceAtomic), c = i.call
      escrowCheck(j.client === i.client && j.provider === c.provider && j.evaluator === c.evaluator && j.hook === c.hook &&
        j.providerAgentId === c.providerAgentId && j.description === i.description && j.expiredAt === i.expiredAt &&
        j.status === 0 && j.budget === c.amount && j.paymentToken === c.token && j.submittedAt === 0 && j.settledAmount === 0n &&
        escrowBytes32(s.pendingClaimHash) === ERC8183_ZERO_HASH && (j.payoutReceiver === ERC8183_ZERO || j.payoutReceiver === c.provider))
      if (kind === "approve") {
        // Never reset or increase an existing allowance implicitly. A caller can skip
        // approval only with the exact bounded allowance, not an unlimited prior grant.
        escrowCheck(allowance === 0n); to = c.token
        data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [c.escrow, c.amount] })
      } else {
        escrowCheck(allowance === c.amount)
        data = encodeFunctionData({ abi: ERC8183_ABI, functionName: "fund", args: [jobId, c.token, c.amount, "0x"] })
      }
    }
    const result = Object.freeze({ kind, intent: i, jobId, chainId: 5042002 as const, sender: i.client, to, value: 0n as const, data })
    actions.add(result); return result
  } catch { throw new EscrowFactsRefused() }
}
