/** Explicit root escrow rail. Not installed in the hub until atomic admission is wired.
 * Verification is read-only, not inference admission. No keys or network on import. */
import { Context, Effect, Layer } from "effect"
import { InvalidSignature, SettlementFailed } from "@arcade/core"
import type { Hex } from "viem"
import type { Rail, SettleTree } from "./rail.ts"
import type { PaymentRequirements, SettledPayment } from "./types.ts"
import { buildEscrowRequirements, captureEscrowPayment, captureEscrowRequirements,
  type EscrowCompletionContext, type EscrowPaymentPayload } from "./erc8183-wire.ts"
import { verifyEscrowBudgetRequest, verifyEscrowRequest } from "./erc8183-request.ts"
import { escrowActionContext, type EscrowActionContext } from "./erc8183-actions.ts"
import { captureEscrowOperation, createEscrowExecutor, type EscrowActionJournal,
  type EscrowExecutorDependencies, type EscrowOperation } from "./erc8183-executor.ts"
import { createEscrowChain, type EscrowChainOptions } from "./erc8183-chain.ts"
import { captureEscrowIdentity } from "./erc8183-reader.ts"
import { boundEscrowIO } from "./erc8183-rpc.ts"
import { escrowCheck, escrowRecord, escrowSeconds, escrowUint, ERC8183_ZERO_HASH } from "./erc8183-codec.ts"
export type EscrowActionProof = Awaited<ReturnType<ReturnType<typeof createEscrowExecutor>["execute"]>>
export interface VerifiedEscrow<Stage extends "funded" | "budget" = "funded"> {
  readonly rail: "erc8183"; readonly stage: Stage; readonly payer: Hex; readonly payTo: Hex
  readonly amountAtomic: bigint; readonly network: "eip155:5042002"
  readonly context: EscrowActionContext; readonly requirements: PaymentRequirements
}
export interface EscrowSettlement extends SettledPayment {
  readonly settlementKind: "onchain"; readonly proof: EscrowActionProof
}
export interface Erc8183Rail extends Rail<EscrowPaymentPayload, VerifiedEscrow, EscrowCompletionContext> {
  readonly name: "erc8183"
  readonly verifyBudget: (payload: EscrowPaymentPayload, requirements: PaymentRequirements) => Effect.Effect<VerifiedEscrow<"budget">, InvalidSignature>
  readonly budget: (verified: VerifiedEscrow<"budget">) => Effect.Effect<EscrowActionProof, SettlementFailed>
  readonly submit: (verified: VerifiedEscrow, outputHash: Hex) => Effect.Effect<EscrowActionProof, SettlementFailed>
  readonly reject: (verified: VerifiedEscrow, reason: string) => Effect.Effect<EscrowActionProof, SettlementFailed>
  readonly settle: (verified: VerifiedEscrow, tree?: SettleTree, context?: EscrowCompletionContext) => Effect.Effect<EscrowSettlement, SettlementFailed>
}
export interface Erc8183Config {
  readonly identity: unknown; readonly gasCapWei: bigint; readonly expiresInSeconds: number
  /** Explicit operation IO bound, not payment authorization validity. */
  readonly operationTimeoutMs: number; readonly nowSeconds: () => number
  readonly journal: EscrowActionJournal; readonly acquireSigner: EscrowChainOptions["acquireSigner"]
  readonly providerAuthorization: EscrowExecutorDependencies["providerAuthorization"]
  readonly fetch?: typeof globalThis.fetch
}
export class Erc8183Tag extends Context.Tag("@arcade/payments/Erc8183Rail")<Erc8183Tag, Erc8183Rail>() {}
/** Keeps interruption attached to bounded underlying cleanup, including journal uncertainty. */
function scoped<A, E>(work: (signal: AbortSignal) => Promise<A>, failure: (error: unknown) => E): Effect.Effect<A, E> {
  return Effect.async((resume, signal) => {
    const pending = Promise.resolve().then(() => { escrowCheck(!signal.aborted); return work(signal) })
    void pending.then(value => resume(Effect.succeed(value)), error => resume(Effect.fail(failure(error))))
    return Effect.promise(() => pending.then(() => undefined, () => undefined))
  })
}
const actionFailure = (error: unknown) => new SettlementFailed({ reason:
  error instanceof Error && error.message === "escrow_execution_uncertain" ?
    "Escrow action outcome uncertain; reconciliation required" : "Escrow action refused before dispatch" })
export function makeErc8183Rail(input: Erc8183Config): Erc8183Rail {
  let config: Erc8183Config, identity: ReturnType<typeof captureEscrowIdentity>
  try {
    identity = captureEscrowIdentity(input.identity)
    escrowCheck(escrowUint(input.gasCapWei) > 0n && escrowSeconds(input.expiresInSeconds) >= 601 &&
      Number.isSafeInteger(input.operationTimeoutMs) && input.operationTimeoutMs > 0 && input.operationTimeoutMs <= 300000 &&
      input.journal.durability === "durable")
    for (const value of [input.nowSeconds, input.acquireSigner, input.providerAuthorization,
      ...["claim", "matchSubmission", "intent", "prepared", "attempt", "confirmed", "uncertain"].map(k =>
        input.journal[k as keyof EscrowActionJournal])]) escrowCheck(typeof value === "function")
    config = Object.freeze({ ...input, identity, journal: Object.freeze({ ...input.journal }) })
  } catch { throw Error("escrow_rail_unavailable") }
  const proven = new WeakMap<object, { readonly stage: "funded" | "budget"; readonly context: EscrowActionContext }>()
  const ports = (signal: AbortSignal, deadlineMs: number) => createEscrowChain({ identity, gasCapWei: config.gasCapWei,
    signal, deadlineMs, nowSeconds: config.nowSeconds, acquireSigner: config.acquireSigner,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }) })
  const verify = <Stage extends "budget" | "funded">(stage: Stage, raw: EscrowPaymentPayload, current: PaymentRequirements) =>
    scoped<VerifiedEscrow<Stage>, InvalidSignature>(async signal => {
      const payload = captureEscrowPayment(raw), terms = captureEscrowRequirements(current), call = terms.call
      escrowCheck(JSON.stringify(payload.accepted) === JSON.stringify(terms.requirements) && terms.expiresInSeconds === config.expiresInSeconds)
      for (const key of ["escrow", "hook", "evaluator", "token"] as const) escrowCheck(call[key] === identity[key])
      const deadline = performance.now() + config.operationTimeoutMs
      const snapshot = await boundEscrowIO(async s => {
        const chain = ports(s, deadline), block = await chain.readJob(BigInt(payload.payload.jobId), s)
        escrowCheck(await chain.providerCode(call.provider, block, s) === "0x")
        return block
      }, signal, deadline, config.operationTimeoutMs)
      const facts = (stage === "budget" ? verifyEscrowBudgetRequest : verifyEscrowRequest)(snapshot, call, payload.payload, config.nowSeconds())
      const context = escrowActionContext({ call, jobId: facts.jobId, client: facts.payer, expiredAt: facts.expiredAt,
        requestHash: facts.requestHash, treasury: identity.treasury })
      const result = Object.freeze({ rail: "erc8183" as const, stage, payer: facts.payer, payTo: facts.payTo,
        amountAtomic: facts.amountAtomic, network: facts.network, context, requirements: terms.requirements })
      escrowCheck(!signal.aborted)
      proven.set(result, Object.freeze({ stage, context })); return result
    }, () => new InvalidSignature({ reason: "Escrow request refused" }))
  const action = (value: object, stage: "funded" | "budget", operation: (context: EscrowActionContext) => EscrowOperation) =>
    scoped(async signal => {
      const verified = proven.get(value); escrowCheck(verified !== undefined && verified.stage === stage)
      // Capture and validate every operation before creating ports or claiming the journal.
      const captured = captureEscrowOperation(verified.context, operation(verified.context))
      const deadlineMs = performance.now() + config.operationTimeoutMs
      return createEscrowExecutor({ ...ports(signal, deadlineMs), signal, deadlineMs, nowSeconds: config.nowSeconds,
        identity: { escrow: identity.escrow, hook: identity.hook, evaluator: identity.evaluator,
          token: identity.token, treasury: identity.treasury }, journal: config.journal,
        providerAuthorization: config.providerAuthorization }).execute(verified.context, captured)
    }, actionFailure)
  return Object.freeze<Erc8183Rail>({
    name: "erc8183",
    challenge: value => Effect.sync(() => buildEscrowRequirements(identity, value, config.expiresInSeconds)),
    verify: (payload, current) => verify("funded", payload, current),
    verifyBudget: (payload, current) => verify("budget", payload, current),
    budget: value => action(value, "budget", () => ({ kind: "budget" })),
    submit: (value, outputHash) => action(value, "funded", () => ({ kind: "submit", outputHash })),
    reject: (value, reason) => action(value, "funded", () => ({ kind: "reject", reason })),
    settle: (value, tree, completion) => Effect.map(action(value, "funded", () => {
      const context = escrowRecord(completion, ["hubJobId", "outputHash"])
      const fields = tree === undefined ? { treeHash: ERC8183_ZERO_HASH, childCount: 0, childTotalAtomic: 0n } :
        escrowRecord(tree, ["treeHash", "childCount", "childTotalAtomic"])
      return { kind: "complete", receipt: { ...context, ...fields } }
    }), proof => Object.freeze({ txHash: proof.txHash, payer: value.payer, amountAtomic: value.amountAtomic,
      settlementKind: "onchain" as const, proof }))
  })
}
/** Dedicated typed tag; never replace the exact-only RailTag or enable sessions implicitly. */
export const Erc8183Live = (config: Erc8183Config) => Layer.sync(Erc8183Tag, () => makeErc8183Rail(config))
