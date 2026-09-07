/** J5C owned-proof contracts. No process, signer, network or IO on import. */
import { keccak256, padHex, decodeEventLog, encodeFunctionData, parseAbi, parseTransaction, recoverTransactionAddress,
  type Hex, type TransactionSerializableEIP1559 } from "viem"
import { captureFundingAuthority, fundingDeployment, fundingRecord, fundingUint, parseFundingAmount,
  validateDeploymentIdentity } from "../packages/buyer/src/gateway-funding.ts"
import { captureUnifiedFundingPlan } from "../packages/buyer/src/unified-balance-funding.ts"
import { unifiedCoordinates } from "../packages/buyer/src/unified-balance-guards.ts"

export const DELEGATE_PROOF = Object.freeze({
  owner: "0xdaaca688ce93d6ea0bdf4cda9925c5526f3ca5e1" as Hex,
  delegate: "0x67be3fd6f4d5ea3b4928e636def9c2c87bc3e51b" as Hex,
  seller: "0xcf821769ed3c0e55e152745377bb833d7155a78a" as Hex,
  splitter: "0x9e304ec13dd862c81ee8caa8fd262dac426fbedf" as Hex,
  depositAtomic: 500000n, deliveryAtomic: 250000n, paymentAtomic: 10000n,
  feeCapAtomic: 50000n, perTransactionGasCapWei: 100000000000000000n,
  ...unifiedCoordinates("Arc_Testnet")
})
export class DelegateProofError extends Error { constructor() { super("delegate_proof_unavailable; reconcile retained journal before another attempt") } }
export const proofFail = (): never => { throw new DelegateProofError() }
export function proofCheck(value: unknown): asserts value { if (!value) proofFail() }
export const proofAddress = (value: unknown): Hex => {
  try { return captureFundingAuthority(value).account } catch { return proofFail() }
}
export const proofHash = (value: unknown): Hex => {
  proofCheck(typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value) && !/^0x0{64}$/.test(value))
  return value.toLowerCase() as Hex
}
export const delegateProofPlan = () => captureUnifiedFundingPlan({ owner: DELEGATE_PROOF.owner,
  recipient: DELEGATE_PROOF.delegate, sourceChain: "Arc_Testnet", amount: "0.250000" })

const OWNER_ABI = parseAbi(["function addDelegate(address token,address delegate)",
  "function approve(address spender,uint256 amount) returns(bool)", "function depositFor(address token,address recipient,uint256 amount)"])
export type OwnerProofStep = "grant" | "approval" | "deposit"
export function ownerProofCall(step: OwnerProofStep) {
  if (step === "grant") return Object.freeze({ to: DELEGATE_PROOF.wallet, data: encodeFunctionData({ abi: OWNER_ABI,
    functionName: "addDelegate", args: [DELEGATE_PROOF.token, DELEGATE_PROOF.delegate] }), value: 0n })
  if (step === "approval") return Object.freeze({ to: DELEGATE_PROOF.token, data: encodeFunctionData({ abi: OWNER_ABI,
    functionName: "approve", args: [DELEGATE_PROOF.wallet, DELEGATE_PROOF.depositAtomic] }), value: 0n })
  proofCheck(step === "deposit")
  return Object.freeze({ to: DELEGATE_PROOF.wallet, data: encodeFunctionData({ abi: OWNER_ABI,
    functionName: "depositFor", args: [DELEGATE_PROOF.token, DELEGATE_PROOF.owner, DELEGATE_PROOF.depositAtomic] }), value: 0n })
}
/** Generic offline crypto check; the owner driver separately binds sender/call to the fixed proof roles. */
export async function assertProofSignedTransaction(raw: unknown, expected: TransactionSerializableEIP1559, sender: Hex): Promise<Hex> {
  try {
    proofCheck(typeof raw === "string" && /^0x02[0-9a-f]+$/.test(raw) && raw.length <= 16384 && raw.length % 2 === 0)
    proofCheck(expected.type === "eip1559" && expected.chainId === 5042002 && expected.to && expected.data &&
      expected.value === 0n && expected.gas && expected.gas > 0n && expected.maxFeePerGas && expected.maxFeePerGas > 0n &&
      expected.maxPriorityFeePerGas === 0n && expected.gas * expected.maxFeePerGas <= DELEGATE_PROOF.perTransactionGasCapWei &&
      !expected.accessList?.length && Number.isSafeInteger(expected.nonce) && expected.nonce! >= 0)
    const decoded = parseTransaction(raw as Hex)
    proofCheck(decoded.type === "eip1559" && decoded.chainId === expected.chainId && decoded.to?.toLowerCase() === expected.to.toLowerCase() &&
      decoded.data === expected.data && (decoded.value ?? 0n) === 0n && decoded.nonce === expected.nonce && decoded.gas === expected.gas &&
      decoded.maxFeePerGas === expected.maxFeePerGas && (decoded.maxPriorityFeePerGas ?? 0n) === 0n && !decoded.accessList?.length &&
      (await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })).toLowerCase() === proofAddress(sender))
    return keccak256(raw as Hex)
  } catch { return proofFail() }
}

/** Reviewed J5C1 build only. F11's release-artifact acceptance remains unchanged. */
export function assertDelegateProofIdentity(role: "wallet" | "minter", proxyCode: unknown, slot: unknown, implementationCode: unknown) {
  if (role === "wallet") return validateDeploymentIdentity(role, proxyCode, slot, implementationCode)
  proofCheck(role === "minter" && typeof proxyCode === "string" && /^0x[0-9a-fA-F]+$/.test(proxyCode) &&
    proxyCode.length === 328 && keccak256(proxyCode as Hex) === fundingDeployment.proxyHash)
  const implementation = "0x9ef4c7ad4f577be713972310e655337bfd0b84bf" as Hex
  proofCheck(typeof slot === "string" && slot.toLowerCase() === padHex(implementation, { size: 32 }) &&
    typeof implementationCode === "string" && /^0x[0-9a-fA-F]+$/.test(implementationCode) && implementationCode.length === 24204)
  let normalized = implementationCode.toLowerCase()
  for (const offset of [3634, 3675, 3968]) {
    const start = 2 + offset * 2
    proofCheck(normalized.slice(start, start + 64) === padHex(implementation, { size: 32 }).slice(2))
    normalized = normalized.slice(0, start) + "0".repeat(64) + normalized.slice(start + 64)
  }
  const normalizedHash = keccak256(normalized as Hex)
  proofCheck(normalizedHash === "0xdbe0b31fd3677a8d7d5f6e729e8247115b7a041e1e5d8d958dd8b18e06747aca" &&
    keccak256(implementationCode as Hex) === "0x0c479785c0c0f5a450bcf3200c854db9da6e4b585a5b694ca4eac85396cc28f5")
  return Object.freeze({ role, proxy: DELEGATE_PROOF.minter, implementation, normalizedHash })
}
export interface DelegateProofSnapshot {
  readonly blockNumber: bigint; readonly blockHash: Hex; readonly timestamp: bigint
  readonly ownerNativeWei: bigint; readonly delegateNativeWei: bigint; readonly allowance: bigint
  readonly ownerGatewayTotal: bigint; readonly available: bigint; readonly pendingBatch: bigint
  readonly authorized: boolean; readonly withdrawalDelay: bigint
}
/** A fresh proof never silently reuses a prior grant or existing custody balance. */
export function assertFreshDelegateProof(snapshot: DelegateProofSnapshot): void {
  proofCheck(snapshot.authorized === false && snapshot.allowance === 0n && snapshot.ownerGatewayTotal === 0n &&
    snapshot.available === 0n && snapshot.pendingBatch === 0n && snapshot.withdrawalDelay > 0n)
  proofCheck(snapshot.ownerNativeWei >= DELEGATE_PROOF.depositAtomic * 1000000000000n + 3n * DELEGATE_PROOF.perTransactionGasCapWei &&
    snapshot.delegateNativeWei >= DELEGATE_PROOF.perTransactionGasCapWei)
}
export function readDelegateAvailable(input: unknown) {
  const outer = input as { token?: unknown; balances?: unknown }
  proofCheck(outer && outer.token === "USDC" && Array.isArray(outer.balances) && outer.balances.length === 1)
  const r = fundingRecord(outer.balances[0], ["domain", "depositor", "balance"], ["pendingBatch"])
  proofCheck(r.domain === 26 && proofAddress(r.depositor) === DELEGATE_PROOF.owner)
  return { available: parseFundingAmount(r.balance), pendingBatch: Object.hasOwn(r, "pendingBatch") ? parseFundingAmount(r.pendingBatch) : 0n }
}
const EVENTS = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
  "event DelegateAdded(address indexed token,address indexed depositor,address delegate)",
  "event Deposited(address indexed token,address indexed depositor,address indexed sender,uint256 value)",
  "event AttestationUsed(address indexed token,address indexed recipient,bytes32 indexed transferSpecHash,uint32 sourceDomain,bytes32 sourceDepositor,bytes32 sourceSigner,uint256 value)"
])
export interface ProofLog { address: Hex; topics: readonly Hex[]; data: Hex }
export function assertOwnerProofLogs(step: OwnerProofStep, logs: readonly ProofLog[]): void {
  proofCheck(logs.length <= 128 && ["grant", "approval", "deposit"].includes(step))
  let matched = 0, transfer = 0
  for (const log of logs) {
    let event
    try { event = decodeEventLog({ abi: EVENTS, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true }) }
    catch { continue }
    if (step === "grant" && log.address.toLowerCase() === DELEGATE_PROOF.wallet && event.eventName === "DelegateAdded") {
      proofCheck(event.args.token.toLowerCase() === DELEGATE_PROOF.token && event.args.depositor.toLowerCase() === DELEGATE_PROOF.owner &&
        event.args.delegate.toLowerCase() === DELEGATE_PROOF.delegate); matched++
    }
    if (step === "approval" && log.address.toLowerCase() === DELEGATE_PROOF.token && event.eventName === "Approval") {
      proofCheck(event.args.owner.toLowerCase() === DELEGATE_PROOF.owner && event.args.spender.toLowerCase() === DELEGATE_PROOF.wallet &&
        event.args.value === DELEGATE_PROOF.depositAtomic); matched++
    }
    if (step === "deposit" && log.address.toLowerCase() === DELEGATE_PROOF.wallet && event.eventName === "Deposited") {
      proofCheck(event.args.token.toLowerCase() === DELEGATE_PROOF.token && event.args.depositor.toLowerCase() === DELEGATE_PROOF.owner &&
        event.args.sender.toLowerCase() === DELEGATE_PROOF.owner && event.args.value === DELEGATE_PROOF.depositAtomic); matched++
    }
    if (step === "deposit" && log.address.toLowerCase() === DELEGATE_PROOF.token && event.eventName === "Transfer" &&
      event.args.from.toLowerCase() === DELEGATE_PROOF.owner && event.args.to.toLowerCase() === DELEGATE_PROOF.wallet) {
      proofCheck(event.args.value === DELEGATE_PROOF.depositAtomic); transfer++
    }
  }
  proofCheck(matched === 1 && transfer === (step === "deposit" ? 1 : 0))
}
/** Receipt status/canonicality and transaction identity must be established by the caller. */
export function assertDelegateMintLogs(logs: readonly ProofLog[], specHash: Hex): void {
  proofCheck(logs.length <= 128)
  let mint = 0, attestation = 0
  for (const log of logs) {
    if (![DELEGATE_PROOF.token, DELEGATE_PROOF.minter].some(a => a === log.address.toLowerCase())) continue
    let event
    try { event = decodeEventLog({ abi: EVENTS, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true }) }
    catch { continue }
    if (event.eventName === "Transfer" && log.address.toLowerCase() === DELEGATE_PROOF.token) {
      if (event.args.from.toLowerCase() === "0x" + "00".repeat(20) && event.args.to.toLowerCase() === DELEGATE_PROOF.delegate) {
        proofCheck(event.args.value === DELEGATE_PROOF.deliveryAtomic); mint++
      }
    }
    if (event.eventName === "AttestationUsed" && log.address.toLowerCase() === DELEGATE_PROOF.minter) {
      proofCheck(event.args.token.toLowerCase() === DELEGATE_PROOF.token && event.args.recipient.toLowerCase() === DELEGATE_PROOF.delegate &&
        event.args.transferSpecHash.toLowerCase() === specHash && event.args.sourceDomain === 26 &&
        event.args.sourceDepositor.toLowerCase() === padHex(DELEGATE_PROOF.owner, { size: 32 }) &&
        event.args.sourceSigner.toLowerCase() === padHex(DELEGATE_PROOF.delegate, { size: 32 }) &&
        event.args.value === DELEGATE_PROOF.deliveryAtomic); attestation++
    }
  }
  proofCheck(mint === 1 && attestation === 1)
}
export const proofStages = ["planned", "grant_prepared", "grant_confirmed", "approval_prepared", "approval_confirmed",
  "deposit_prepared", "deposit_confirmed", "delegation_ready", "spend_intent", "burn_prepared", "mint_confirmed",
  "source_checked", "purchase_intent", "purchase_confirmed", "complete", "uncertain"] as const
export type ProofStage = typeof proofStages[number]
export type ProofFacts = Readonly<{ txHash?: Hex; blockHash?: Hex; blockNumber?: bigint; amount?: bigint; gasWei?: bigint;
  specHash?: Hex; maxFee?: bigint; actualFee?: bigint; maxBlockHeight?: bigint; available?: bigint; pendingBatch?: bigint; sourceTxHash?: Hex;
  sourceDebit?: "pending" | "confirmed"; jobId?: string }>
export function captureProofEvent(stage: ProofStage, facts: ProofFacts) {
  proofCheck(proofStages.includes(stage))
  const r = fundingRecord(facts, [], ["txHash", "blockHash", "blockNumber", "amount", "gasWei", "specHash", "maxFee",
    "actualFee", "maxBlockHeight", "available", "pendingBatch", "sourceTxHash", "sourceDebit", "jobId"])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(r)) {
    if (["txHash", "blockHash", "specHash", "sourceTxHash"].includes(key)) out[key] = proofHash(value)
    else if (key === "sourceDebit") { proofCheck(value === "pending" || value === "confirmed"); out[key] = value }
    else if (key === "jobId") { proofCheck(typeof value === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(value)); out[key] = value }
    else out[key] = fundingUint(value).toString()
  }
  if (stage.endsWith("_prepared") && stage !== "burn_prepared" || stage.endsWith("_confirmed")) proofCheck(out.txHash !== undefined)
  if (stage === "burn_prepared") proofCheck(out.specHash !== undefined && out.maxFee !== undefined && out.maxBlockHeight !== undefined)
  if (stage === "source_checked") proofCheck(out.sourceDebit !== undefined && out.available !== undefined)
  return Object.freeze({ stage, facts: Object.freeze(out) })
}
export function nextProofStage(previous: ProofStage | undefined, next: ProofStage) {
  proofCheck(next !== "planned" || previous === undefined)
  if (next === "uncertain") { proofCheck(previous !== undefined && previous !== "complete" && previous !== "uncertain"); return }
  proofCheck(proofStages.indexOf(next) === (previous === undefined ? 0 : proofStages.indexOf(previous) + 1) &&
    previous !== "uncertain")
}
