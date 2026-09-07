import { Effect } from "effect"
import { fundingRecord, parseFundingAmount } from "./gateway-funding.ts"

export type UnifiedSourceChain = "Arc_Testnet" | "Base_Sepolia"
export type DelegateStatus = "none" | "pending" | "ready"
export type UnifiedFundingCode = "input_invalid" | "read_unavailable" | "journal_unavailable" | "journal_consumed" | "outcome_uncertain"
/** Fixed diagnostics never retain SDK traces, signatures or provider error text. */
export class UnifiedFundingFailure extends Error {
  readonly _tag = "UnifiedFundingFailure"
  constructor(readonly code: UnifiedFundingCode) { super(code) }
}
const fail = (): never => { throw new UnifiedFundingFailure("input_invalid") }
const address = (value: unknown): `0x${string}` => {
  if (typeof value !== "string" || value.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) return fail()
  return value.toLowerCase() as `0x${string}`
}
const source = (value: unknown): UnifiedSourceChain => value === "Arc_Testnet" || value === "Base_Sepolia" ? value : fail()
const decimal = (value: unknown): string => {
  const n = parseFundingAmount(value)
  if (n === 0n) return fail()
  return `${n / 1_000_000n}.${String(n % 1_000_000n).padStart(6, "0")}`
}
export interface UnifiedFundingPlan {
  readonly owner: `0x${string}`
  readonly recipient: `0x${string}`
  readonly sourceChain: UnifiedSourceChain
  readonly amount: string
  readonly destinationChain: "Arc_Testnet"
  readonly token: "USDC"
}
/** No implicit source chain, recipient, numeric amount, auto-allocation or mainnet. */
export const captureUnifiedFundingPlan = (input: unknown): UnifiedFundingPlan => {
  try {
    const raw = fundingRecord(input, ["owner", "recipient", "sourceChain", "amount"])
    const owner = address(raw.owner), recipient = address(raw.recipient)
    if (owner === recipient) return fail()
    return Object.freeze({ owner, recipient, sourceChain: source(raw.sourceChain), amount: decimal(raw.amount),
      destinationChain: "Arc_Testnet", token: "USDC" })
  } catch { return fail() }
}
const capturePlan = (value: UnifiedFundingPlan): UnifiedFundingPlan => {
  const raw = fundingRecord(value, ["owner", "recipient", "sourceChain", "amount", "destinationChain", "token"])
  if (raw.destinationChain !== "Arc_Testnet" || raw.token !== "USDC") return fail()
  return captureUnifiedFundingPlan({ owner: raw.owner, recipient: raw.recipient, sourceChain: raw.sourceChain, amount: raw.amount })
}
/** Correct Kit1.6.0 shape: explicit sourceAccount/allocation, destination adapter.
 * Adapter is a trusted caller capability; runtime must bind its signer to recipient
 * and enforce fees/gas before signing. No forwarder, retry or custom fee is enabled. */
export const unifiedSpendParams = <A>(input: UnifiedFundingPlan, adapter: A) => {
  const plan = capturePlan(input)
  return Object.freeze({ token: plan.token, amount: plan.amount,
    from: Object.freeze({ adapter, sourceAccount: plan.owner,
      allocations: Object.freeze({ chain: plan.sourceChain, amount: plan.amount }) }),
    to: Object.freeze({ adapter, chain: plan.destinationChain, recipientAddress: plan.recipient }) })
}
export interface DelegateIdentity {
  readonly owner: `0x${string}`; readonly delegate: `0x${string}`; readonly sourceChain: UnifiedSourceChain
}
export type DelegateReader = (identity: DelegateIdentity) => Promise<unknown>
export const delegateStatus = (owner: unknown, delegate: unknown, sourceChain: unknown, read: DelegateReader) =>
  Effect.gen(function* () {
    const identity = yield* Effect.try({ try: () => {
      const plan = captureUnifiedFundingPlan({ owner, recipient: delegate, sourceChain, amount: "0.000001" })
      return Object.freeze({ owner: plan.owner, delegate: plan.recipient, sourceChain: plan.sourceChain })
    }, catch: () => new UnifiedFundingFailure("input_invalid") })
    const value = yield* Effect.tryPromise({ try: () => read(identity), catch: () => new UnifiedFundingFailure("read_unavailable") })
    if (value !== "none" && value !== "pending" && value !== "ready") return yield* Effect.fail(new UnifiedFundingFailure("read_unavailable"))
    return value
  })

export type UnifiedFundingEvent = Readonly<{ stage: "planned" | "delegate_none" | "delegate_pending" | "spend_intent" | "uncertain";
  plan: UnifiedFundingPlan }> | Readonly<{ stage: "sdk_returned"; plan: UnifiedFundingPlan; txHash: `0x${string}` }>
export interface UnifiedFundingJournal { append(event: UnifiedFundingEvent): Promise<void> }
export interface UnifiedFundingDependencies {
  /** Reads for the owner, not the delegate's own account. Never signs. */
  readonly delegateStatus: DelegateReader
  /** Trusted, separately bounded SDK adapter; invoked once after durable intent. */
  readonly spend: (plan: UnifiedFundingPlan) => Promise<unknown>
  readonly journal: UnifiedFundingJournal
}
export type UnifiedFundingResult = Readonly<{ status: "none" | "pending"; plan: UnifiedFundingPlan }> |
  Readonly<{ status: "sdk_returned"; plan: UnifiedFundingPlan; txHash: `0x${string}` }>

/** Only project required own-data fields. Never walk raw SDK traces or errors. */
const fields = (input: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail()
  const projected: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (!d || !d.enumerable || !("value" in d)) return fail()
    projected[key] = d.value
  }
  return projected
}
const returnedHash = (input: unknown, plan: UnifiedFundingPlan): `0x${string}` => {
  const raw = fields(input, ["destinationChain", "recipientAddress", "txHash", "allocations"])
  if (raw.destinationChain !== plan.destinationChain || address(raw.recipientAddress) !== plan.recipient ||
    typeof raw.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw.txHash) || /^0x0{64}$/.test(raw.txHash)) return fail()
  const allocations = raw.allocations
  if (!Array.isArray(allocations) || allocations.length !== 1 || Reflect.ownKeys(allocations).length !== 2) return fail()
  const d = Object.getOwnPropertyDescriptor(allocations, "0")
  if (!d || !("value" in d)) return fail()
  const row = fields(d.value, ["amount", "chain", "sourceAccount"])
  if (decimal(row.amount) !== plan.amount || row.chain !== plan.sourceChain || address(row.sourceAccount) !== plan.owner) return fail()
  return raw.txHash.toLowerCase() as `0x${string}`
}
const used = new WeakSet<UnifiedFundingJournal>()
/** One in-process attempt per journal capability, including concurrent/repeated
 * Effect evaluation. The durable runtime must also refuse existing journal files.
 * SDK return is NOT independent chain confirmation. No payment is made here. */
export const spendFromOwner = (input: unknown, deps: UnifiedFundingDependencies): Effect.Effect<UnifiedFundingResult, UnifiedFundingFailure> => {
  let plan: UnifiedFundingPlan
  try { plan = captureUnifiedFundingPlan(input) } catch { return Effect.fail(new UnifiedFundingFailure("input_invalid")) }
  const append = (event: UnifiedFundingEvent) => Effect.tryPromise({ try: () => deps.journal.append(Object.freeze(event)),
    catch: () => new UnifiedFundingFailure("journal_unavailable") })
  return Effect.gen(function* () {
    if (used.has(deps.journal)) return yield* Effect.fail(new UnifiedFundingFailure("journal_consumed"))
    used.add(deps.journal)
    yield* append({ stage: "planned", plan })
    const status = yield* delegateStatus(plan.owner, plan.recipient, plan.sourceChain, deps.delegateStatus)
    if (status !== "ready") {
      yield* append({ stage: status === "none" ? "delegate_none" : "delegate_pending", plan })
      return Object.freeze({ status, plan })
    }
    yield* append({ stage: "spend_intent", plan })
    const result = yield* Effect.either(Effect.tryPromise({ try: async () => {
      const txHash = returnedHash(await deps.spend(plan), plan)
      await deps.journal.append(Object.freeze({ stage: "sdk_returned", plan, txHash }))
      return Object.freeze({ status: "sdk_returned" as const, plan, txHash })
    }, catch: () => new UnifiedFundingFailure("outcome_uncertain") }))
    if (result._tag === "Right") return result.right
    yield* append({ stage: "uncertain", plan }).pipe(Effect.ignore)
    return yield* Effect.fail(result.left)
  }).pipe(Effect.uninterruptible)
}
