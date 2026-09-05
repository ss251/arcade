import { keccak256, stringToHex, type Hex } from "viem"

const UINT_MAX = (1n << 256n) - 1n
const ZERO = "0x0000000000000000000000000000000000000000"
export const fundingFailureCodes = Object.freeze(["configuration_invalid", "read_unavailable", "deployment_identity_unavailable", "policy_refused", "journal_unavailable", "operation_owned", "operation_uncertain", "operation_consumed", "evidence_unavailable", "cancelled"] as const)
export type FundingFailureCode = typeof fundingFailureCodes[number]
/** Fixed diagnostics: no provider value, cause or capability is retained. */
export class FundingFailure extends Error {
  readonly _tag = "FundingFailure"
  constructor(readonly code: FundingFailureCode = "configuration_invalid") { super("Invalid funding data") }
}
const bad = (code: FundingFailureCode = "configuration_invalid"): never => { throw new FundingFailure(code) }
const safe = <T>(f: () => T): T => { try { return f() } catch { return bad() } }
/** Bounded own-data copy. Ordinary accessors are never called; hostile Proxy
 * execution is not sandboxed, but its thrown diagnostics are normalized. */
export const captureFundingData = (input: unknown): unknown => safe(() => {
  let nodes = 0, bytes = 0
  const active = new Set<object>(), encoder = new TextEncoder()
  const add = (s: string) => { if (s.length > 16384) bad(); bytes += encoder.encode(s).byteLength; if (bytes > 16384) bad() }
  const visit = (v: unknown, depth: number): unknown => {
    if (++nodes > 256 || depth > 8) return bad()
    if (typeof v === "string") { add(v); return v }
    if (v === null || typeof v === "boolean" || typeof v === "bigint" && v >= 0n && v <= UINT_MAX || typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v
    if (typeof v !== "object" || active.has(v) || Array.isArray(v)) return bad()
    const proto = Object.getPrototypeOf(v), keys = Reflect.ownKeys(v)
    if (proto !== Object.prototype && proto !== null || keys.length > 80) return bad()
    const result: Record<string, unknown> = Object.create(null)
    active.add(v)
    try {
      for (const key of keys) {
        if (typeof key !== "string" || key === "__proto__") return bad()
        add(key)
        const d = Object.getOwnPropertyDescriptor(v, key)
        if (d === undefined || !d.enumerable || !("value" in d)) return bad()
        result[key] = visit(d.value, depth + 1)
      }
    } finally { active.delete(v) }
    return Object.freeze(result)
  }
  return visit(input, 0)
})
export const fundingRecord = (input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> => {
  const v = captureFundingData(input)
  if (v === null || typeof v !== "object") return bad()
  const record = v as Record<string, unknown>
  if (Object.keys(record).some(k => !required.includes(k) && !optional.includes(k)) || required.some(k => !Object.hasOwn(record, k))) return bad()
  return record
}
export const parseFundingUint = (value: unknown): bigint => {
  if (typeof value !== "string" || value.length > 78 || !/^(0|[1-9][0-9]*)$/.test(value) || value.endsWith("\n")) return bad()
  const amount = BigInt(value)
  return amount <= UINT_MAX ? amount : bad()
}
export const fundingUint = (value: unknown, positive = false): bigint => {
  const amount = typeof value === "bigint" ? value : parseFundingUint(value)
  return amount >= 0n && amount <= UINT_MAX && (!positive || amount > 0n) ? amount : bad()
}
export const parseFundingAmount = (value: unknown): bigint => {
  if (typeof value !== "string" || value.length > 85 || !/^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value) || value.endsWith("\n")) return bad()
  const [whole, fraction = ""] = value.split(".")
  return fundingUint(BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0")))
}
const address = (value: unknown, zero = false): Hex => {
  if (typeof value !== "string" || value.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(value)) return bad()
  const result = value.toLowerCase() as Hex
  return zero || result !== ZERO ? result : bad()
}
const hash = (value: unknown): Hex => typeof value === "string" && value.length === 66 && /^0x[0-9a-f]{64}$/.test(value) ? value as Hex : bad()
const operationIdOf = (v: unknown): string => typeof v === "string" && v.length === 35 && /^op_[a-f0-9]{32}$/.test(v) ? v : bad()
const stamp = (v: unknown): number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : bad()
const add = (a: bigint, b: bigint): bigint => { const sum = a + b; return sum <= UINT_MAX ? sum : bad("policy_refused") }

const coordinates = Object.freeze({ chainId: 5042002, network: "eip155:5042002", domain: 26,
  token: "0x3600000000000000000000000000000000000000", wallet: "0x0077777d7eba4688bdef3e311b846f25870a19b9",
  minter: "0x0022222abe238cc2c7bb1f21003f0a260052475b", rpcOrigin: "https://rpc.testnet.arc.io", apiOrigin: "https://gateway-api-testnet.circle.com" } as const)
export type FundingAuthority = Readonly<typeof coordinates & { account: Hex }>
export const captureFundingAuthority = (account: unknown): FundingAuthority => Object.freeze({ ...coordinates, account: address(account) })
export const validateFundingAuthority = (input: unknown): FundingAuthority => {
  const v = fundingRecord(input, [...Object.keys(coordinates), "account"])
  const expected = captureFundingAuthority(v.account)
  for (const key of Object.keys(expected) as (keyof FundingAuthority)[]) if (v[key] !== expected[key]) return bad()
  return expected
}

export type DepositRequest = Readonly<{ kind: "deposit"; mode: "exact"; amount: bigint; gasCapWei: bigint } | { kind: "deposit"; mode: "target"; minimumAvailable: bigint; maxDeposit: bigint; gasCapWei: bigint }>
export type WithdrawalRequest = Readonly<{ kind: "withdrawal"; amount: bigint; maxFee: bigint; maxBurnBlockDelta: bigint; gasCapWei: bigint }>
export type FundingRequest = DepositRequest | WithdrawalRequest
export const decodeFundingRequest = (input: unknown): FundingRequest => {
  const v = fundingRecord(input, ["kind", "gasCapWei"], ["mode", "amount", "minimumAvailable", "maxDeposit", "maxFee", "maxBurnBlockDelta"])
  const gasCapWei = fundingUint(v.gasCapWei, true)
  if (v.kind === "deposit" && v.mode === "exact") {
    fundingRecord(v, ["kind", "mode", "amount", "gasCapWei"])
    return Object.freeze({ kind: "deposit", mode: "exact", amount: fundingUint(v.amount, true), gasCapWei })
  }
  if (v.kind === "deposit" && v.mode === "target") {
    fundingRecord(v, ["kind", "mode", "minimumAvailable", "maxDeposit", "gasCapWei"])
    return Object.freeze({ kind: "deposit", mode: "target", minimumAvailable: fundingUint(v.minimumAvailable), maxDeposit: fundingUint(v.maxDeposit), gasCapWei })
  }
  if (v.kind === "withdrawal") {
    fundingRecord(v, ["kind", "amount", "maxFee", "maxBurnBlockDelta", "gasCapWei"])
    const maxBurnBlockDelta = fundingUint(v.maxBurnBlockDelta, true)
    if (maxBurnBlockDelta === UINT_MAX) return bad("policy_refused")
    return Object.freeze({ kind: "withdrawal", amount: fundingUint(v.amount, true), maxFee: fundingUint(v.maxFee), maxBurnBlockDelta, gasCapWei })
  }
  return bad()
}
const scalarJson = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => typeof v === "bigint" ? v.toString() : v)
export const encodeFundingRequest = (request: FundingRequest): string => scalarJson(decodeFundingRequest(request))

export interface FundingSnapshot {
  readonly authority: FundingAuthority
  readonly walletTokenBalance: bigint; readonly walletNativeBalance: bigint; readonly allowance: bigint
  readonly available: bigint; readonly gatewayTotalBalance: bigint
  readonly pending: bigint | null; readonly withdrawing: bigint | null; readonly withdrawable: bigint | null
  readonly sourceBlock: bigint; readonly sourceBlockHash: Hex; readonly observedAtMs: number
  readonly destinationBlock: bigint | null; readonly destinationBlockHash: Hex | null; readonly withdrawalDelay: bigint | null
}
export const decodeFundingSnapshot = (input: unknown, expectedAuthority: FundingAuthority): FundingSnapshot => {
  const v = fundingRecord(input, ["authority", "walletTokenBalance", "walletNativeBalance", "allowance", "available", "gatewayTotalBalance", "pending", "withdrawing", "withdrawable", "sourceBlock", "sourceBlockHash", "observedAtMs", "destinationBlock", "destinationBlockHash", "withdrawalDelay"])
  const authority = validateFundingAuthority(v.authority), expected = validateFundingAuthority(expectedAuthority)
  if (authority.account !== expected.account || (v.destinationBlock === null) !== (v.destinationBlockHash === null)) return bad()
  const nullable = (x: unknown) => x === null ? null : fundingUint(x)
  return Object.freeze({ authority, walletTokenBalance: fundingUint(v.walletTokenBalance), walletNativeBalance: fundingUint(v.walletNativeBalance), allowance: fundingUint(v.allowance),
    available: fundingUint(v.available), gatewayTotalBalance: fundingUint(v.gatewayTotalBalance), pending: nullable(v.pending), withdrawing: nullable(v.withdrawing), withdrawable: nullable(v.withdrawable),
    sourceBlock: fundingUint(v.sourceBlock), sourceBlockHash: hash(v.sourceBlockHash), observedAtMs: stamp(v.observedAtMs),
    destinationBlock: nullable(v.destinationBlock), destinationBlockHash: v.destinationBlockHash === null ? null : hash(v.destinationBlockHash), withdrawalDelay: nullable(v.withdrawalDelay) })
}
export interface DepositPlan { readonly kind: "deposit"; readonly authority: FundingAuthority; readonly request: DepositRequest; readonly snapshot: FundingSnapshot; readonly amount: bigint; readonly approvalAmount: bigint; readonly noop: boolean }
export interface WithdrawalPlan { readonly kind: "withdrawal"; readonly authority: FundingAuthority; readonly request: WithdrawalRequest; readonly snapshot: FundingSnapshot; readonly amount: bigint; readonly maxFee: bigint; readonly maxBlockHeight: bigint }
export const planDeposit = (inputAuthority: FundingAuthority, inputRequest: DepositRequest, inputSnapshot: FundingSnapshot): DepositPlan => {
  const authority = validateFundingAuthority(inputAuthority), request = decodeFundingRequest(inputRequest), snapshot = decodeFundingSnapshot(inputSnapshot, authority)
  if (request.kind !== "deposit") return bad()
  const amount = request.mode === "exact" ? request.amount : request.minimumAvailable > snapshot.available ? request.minimumAvailable - snapshot.available : 0n
  if (request.mode === "target" && amount > request.maxDeposit) return bad("policy_refused")
  // A validated no-op does not reserve gas or mistake pending credit for available.
  if (amount > 0n && (amount > snapshot.walletTokenBalance || amount * 10n ** 12n + request.gasCapWei > snapshot.walletNativeBalance)) return bad("policy_refused")
  return Object.freeze({ kind: "deposit", authority, request, snapshot, amount, approvalAmount: amount > snapshot.allowance ? amount : 0n, noop: amount === 0n })
}
export const planWithdrawal = (inputAuthority: FundingAuthority, inputRequest: WithdrawalRequest, inputSnapshot: FundingSnapshot): WithdrawalPlan => {
  const authority = validateFundingAuthority(inputAuthority), request = decodeFundingRequest(inputRequest), snapshot = decodeFundingSnapshot(inputSnapshot, authority)
  if (request.kind !== "withdrawal") return bad()
  if (snapshot.withdrawalDelay === null || snapshot.destinationBlock === null || snapshot.destinationBlockHash === null) return bad("read_unavailable")
  const maxBlockHeight = add(snapshot.sourceBlock, request.maxBurnBlockDelta)
  if (maxBlockHeight === UINT_MAX || request.maxBurnBlockDelta < snapshot.withdrawalDelay || add(request.amount, request.maxFee) > snapshot.available || request.gasCapWei > snapshot.walletNativeBalance) return bad("policy_refused")
  return Object.freeze({ kind: "withdrawal", authority, request, snapshot, amount: request.amount, maxFee: request.maxFee, maxBlockHeight })
}
export const operationDigest = (authority: FundingAuthority, request: FundingRequest, operationId: string): Hex => keccak256(stringToHex(scalarJson({ version: 1, authority: validateFundingAuthority(authority), request: decodeFundingRequest(request), operationId: operationIdOf(operationId) })))
export const planDigest = (input: DepositPlan | WithdrawalPlan): Hex => {
  const v = fundingRecord(input, ["kind", "authority", "request", "snapshot", "amount"], ["approvalAmount", "noop", "maxFee", "maxBlockHeight"])
  const authority = validateFundingAuthority(v.authority), request = decodeFundingRequest(v.request), snapshot = decodeFundingSnapshot(v.snapshot, authority)
  const plan = request.kind === "deposit" ? planDeposit(authority, request, snapshot) : planWithdrawal(authority, request, snapshot)
  if (v.kind !== plan.kind || v.amount !== plan.amount || (plan.kind === "deposit" ? v.approvalAmount !== plan.approvalAmount || v.noop !== plan.noop || Object.hasOwn(v, "maxFee") || Object.hasOwn(v, "maxBlockHeight") : v.maxFee !== plan.maxFee || v.maxBlockHeight !== plan.maxBlockHeight || Object.hasOwn(v, "approvalAmount") || Object.hasOwn(v, "noop"))) return bad()
  return keccak256(stringToHex(scalarJson({ version: 1, plan })))
}

export const fundingEventNames = Object.freeze(["planned", "approval_intent", "approval_prepared", "approval_submitted", "approval_confirmed", "deposit_intent", "deposit_prepared", "deposit_submitted", "deposit_confirmed", "credit_pending", "credit_observed", "burn_authorization_prepared", "normal_transfer_requested", "attestation_validated", "mint_intent", "mint_prepared", "mint_submitted", "delivery_confirmed", "source_debit_reconciled", "refused", "uncertain", "noop", "finalized"] as const)
export type FundingEventName = typeof fundingEventNames[number]
export interface FundingPublicFacts {
  readonly operationId?: string; readonly operationDigest?: Hex; readonly planDigest?: Hex
  readonly account?: Hex; readonly network?: "eip155:5042002"; readonly domain?: 26; readonly token?: Hex; readonly wallet?: Hex; readonly minter?: Hex
  readonly kind?: "deposit" | "withdrawal"; readonly stage?: "approval" | "deposit" | "burn" | "mint"
  readonly amount?: bigint; readonly approvalAmount?: bigint; readonly minimumAvailable?: bigint; readonly maxDeposit?: bigint; readonly maxFee?: bigint; readonly maxBurnBlockDelta?: bigint; readonly gasCapWei?: bigint; readonly maxBlockHeight?: bigint
  readonly availableBefore?: bigint; readonly availableAfter?: bigint; readonly gatewayTotalBefore?: bigint; readonly gatewayTotalAfter?: bigint; readonly walletTokenBalance?: bigint; readonly walletNativeBalance?: bigint; readonly allowance?: bigint
  readonly pending?: bigint | null; readonly withdrawing?: bigint | null; readonly withdrawable?: bigint | null
  readonly nonce?: bigint; readonly gas?: bigint; readonly maxFeePerGas?: bigint; readonly maxPriorityFeePerGas?: bigint
  readonly txHash?: Hex; readonly calldataHash?: Hex; readonly blockNumber?: bigint; readonly blockHash?: Hex; readonly specHash?: Hex; readonly payloadHash?: Hex; readonly attester?: Hex; readonly sourceTxHash?: Hex; readonly sourceBlockHash?: Hex; readonly actualFee?: bigint
  readonly signerEntered?: boolean; readonly submitted?: boolean; readonly terminalKind?: "noop" | "credited" | "withdrawal_complete" | "unsigned_refusal"
  readonly observedAtMs?: number; readonly failureCode?: FundingFailureCode
}
export type FundingPublicEvent = Readonly<{ event: FundingEventName; facts: FundingPublicFacts }>
export type FundingOutcomeStatus = "observed" | "noop" | "confirmed" | "credit_pending" | "mint_ready" | "delivery_confirmed" | "source_debit_pending" | "uncertain" | "refused"
export type FundingPublicOutcome = Readonly<{ status: FundingOutcomeStatus; code?: FundingFailureCode; facts: FundingPublicFacts }>
const uintFacts = ["amount", "approvalAmount", "minimumAvailable", "maxDeposit", "maxFee", "maxBurnBlockDelta", "gasCapWei", "maxBlockHeight", "availableBefore", "availableAfter", "gatewayTotalBefore", "gatewayTotalAfter", "walletTokenBalance", "walletNativeBalance", "allowance", "nonce", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "blockNumber", "actualFee"] as const
const hashFacts = ["operationDigest", "planDigest", "txHash", "calldataHash", "blockHash", "specHash", "payloadHash", "sourceTxHash", "sourceBlockHash"] as const
const nullableFacts = ["pending", "withdrawing", "withdrawable"] as const
const otherFacts = ["operationId", "account", "network", "domain", "token", "wallet", "minter", "kind", "stage", "attester", "signerEntered", "submitted", "terminalKind", "observedAtMs", "failureCode"] as const
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T => typeof v === "string" && values.includes(v as T) ? v as T : bad()
const captureFacts = (input: unknown): FundingPublicFacts => {
  const v = fundingRecord(input, [], [...uintFacts, ...hashFacts, ...nullableFacts, ...otherFacts]), out: Record<string, unknown> = {}
  // Fixed ordering makes hashes and persisted encodings independent of caller key order.
  for (const key of [...uintFacts, ...hashFacts, ...nullableFacts, ...otherFacts]) {
    if (!Object.hasOwn(v, key)) continue
    const x = v[key]
    if ((uintFacts as readonly string[]).includes(key)) out[key] = fundingUint(x)
    else if ((hashFacts as readonly string[]).includes(key)) out[key] = hash(x)
    else if ((nullableFacts as readonly string[]).includes(key)) out[key] = x === null ? null : fundingUint(x)
    else if (key === "operationId") out[key] = operationIdOf(x)
    else if (key === "account" || key === "attester") out[key] = address(x)
    else if (key === "network" || key === "domain" || key === "token" || key === "wallet" || key === "minter") { if (x !== coordinates[key]) return bad(); out[key] = x }
    else if (key === "kind") out[key] = oneOf(x, ["deposit", "withdrawal"])
    else if (key === "stage") out[key] = oneOf(x, ["approval", "deposit", "burn", "mint"])
    else if (key === "terminalKind") out[key] = oneOf(x, ["noop", "credited", "withdrawal_complete", "unsigned_refusal"])
    else if (key === "observedAtMs") out[key] = stamp(x)
    else if (key === "failureCode") out[key] = oneOf(x, fundingFailureCodes)
    else { if (typeof x !== "boolean") return bad(); out[key] = x }
  }
  return Object.freeze(out) as FundingPublicFacts
}
export const captureFundingPublicEvent = (input: unknown): FundingPublicEvent => {
  const v = fundingRecord(input, ["event", "facts"])
  return Object.freeze({ event: oneOf(v.event, fundingEventNames), facts: captureFacts(v.facts) })
}
export const captureFundingPublicOutcome = (input: unknown): FundingPublicOutcome => {
  const v = fundingRecord(input, ["status", "facts"], ["code"]), status = oneOf(v.status, ["observed", "noop", "confirmed", "credit_pending", "mint_ready", "delivery_confirmed", "source_debit_pending", "uncertain", "refused"] as const)
  return Object.freeze({ status, ...(Object.hasOwn(v, "code") ? { code: oneOf(v.code, fundingFailureCodes) } : {}), facts: captureFacts(v.facts) })
}
export const encodeFundingPublic = (input: FundingPublicEvent | FundingPublicOutcome): string => {
  const v = fundingRecord(input, ["facts"], ["event", "status", "code"])
  return scalarJson(Object.hasOwn(v, "event") ? captureFundingPublicEvent(v) : captureFundingPublicOutcome(v))
}

/** Source-linked release artifacts, NOT a claim about current deployed state.
 * Exact metadata is included; only compiler-declared UUPS self words normalize. */
export const fundingDeployment = Object.freeze({ ...coordinates, sourceCommit: "fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8",
  implementationSlot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex,
  proxyLength: 163, proxyHash: "0x874a21508289bf01ee9802032607ae53ba0a4f47f28143a8493921b8db102187" as Hex,
  walletIdentity: Object.freeze({ length: 22818, hash: "0xbe79daa02f5d5359b4f6118d70b72e10ddd1c87b63e9e4ee39fdafa9bb2c2cbf" as Hex, offsets: Object.freeze([3708, 4382]) }),
  minterIdentity: Object.freeze({ length: 11528, hash: "0x3b600440271648adb765c4dea90282c6d4e8fd317ee693c4804f31cc0ecb5f61" as Hex, offsets: Object.freeze([1683, 1982]) }) })
export interface FundingDeploymentIdentity { readonly role: "wallet" | "minter"; readonly proxy: Hex; readonly implementation: Hex; readonly normalizedHash: Hex }
export const validateDeploymentIdentity = (role: "wallet" | "minter", proxyCode: unknown, implementationSlot: unknown, implementationCode: unknown): FundingDeploymentIdentity => {
  try {
    if (role !== "wallet" && role !== "minter") return bad()
    const definition = role === "wallet" ? fundingDeployment.walletIdentity : fundingDeployment.minterIdentity
    const code = (v: unknown, bytes: number): Hex => typeof v === "string" && v.length === 2 + bytes * 2 && /^0x[0-9a-fA-F]+$/.test(v) ? v.toLowerCase() as Hex : bad()
    const proxy = code(proxyCode, fundingDeployment.proxyLength), slot = code(implementationSlot, 32), implementation = address(`0x${slot.slice(26)}`)
    if (slot.slice(2, 26) !== "0".repeat(24) || implementation === coordinates[role] || keccak256(proxy) !== fundingDeployment.proxyHash) return bad()
    let normalized = code(implementationCode, definition.length)
    for (const offset of definition.offsets) {
      const index = 2 + offset * 2
      if (normalized.slice(index, index + 64) !== slot.slice(2)) return bad()
      normalized = `${normalized.slice(0, index)}${"0".repeat(64)}${normalized.slice(index + 64)}` as Hex
    }
    if (keccak256(normalized) !== definition.hash) return bad()
    return Object.freeze({ role, proxy: coordinates[role], implementation, normalizedHash: definition.hash })
  } catch { return bad("deployment_identity_unavailable") }
}
