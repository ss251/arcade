import { Schema } from "effect"

/**
 * Job lifecycle and the settle-on-success predicate (D2).
 *
 * A job is created only after payment is VERIFIED, and settled only after its output
 * is VALIDATED. Everything in between can fail without the buyer losing a cent.
 */

export const JobId = Schema.String.pipe(Schema.pattern(/^job_[a-zA-Z0-9]{16,}$/))

export const JobStatus = Schema.Literal(
  "queued", // payment verified, waiting for a runner
  "running", // dispatched to a runner
  "succeeded", // output validated — settlement may proceed
  "refused", // engine declined (stop_reason), NOT an error exit
  "invalid", // output failed the listing's outputSchema
  "timeout", // exceeded bounds.timeoutSec
  "bounds_exceeded", // exceeded maxTurns/maxTokens/maxToolCalls
  "runner_lost", // runner disconnected mid-job
  "failed" // any other execution failure
)
export type JobStatus = typeof JobStatus.Type

/** Terminal states in which we must NOT settle. The buyer pays nothing. */
export const NON_SETTLING: ReadonlySet<JobStatus> = new Set<JobStatus>([
  "refused",
  "invalid",
  "timeout",
  "bounds_exceeded",
  "runner_lost",
  "failed"
])

export class JobOutcome extends Schema.Class<JobOutcome>("JobOutcome")({
  status: JobStatus,
  /** Engine-reported stop reason. Checked instead of the process exit code — see D2. */
  stopReason: Schema.optional(Schema.String),
  output: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
  startedAtMs: Schema.Number,
  finishedAtMs: Schema.Number
}) {}

export class Job extends Schema.Class<Job>("Job")({
  id: JobId,
  skillId: Schema.String,
  seller: Schema.String,
  buyer: Schema.String,
  priceAtomic: Schema.BigIntFromSelf,
  input: Schema.Unknown,
  status: JobStatus,
  createdAtMs: Schema.Number,
  outcome: Schema.optional(JobOutcome)
}) {}

/** Stop reasons that mean "the engine declined", regardless of exit status. */
const REFUSAL_STOP_REASONS: ReadonlySet<string> = new Set([
  "refusal",
  "reasoning_extraction",
  "content_filter"
])

export const isRefusal = (stopReason: string | undefined): boolean =>
  stopReason !== undefined && REFUSAL_STOP_REASONS.has(stopReason)

export interface SettleDecision {
  readonly settle: boolean
  readonly reason: string
}

/**
 * D2 — settle-on-success.
 *
 * Settle if and only if ALL hold:
 *   1. the job reached `succeeded`,
 *   2. the engine did not refuse (checked via stopReason, never exit code),
 *   3. output is present and non-empty,
 *   4. output satisfied the listing's declared schema (caller supplies the verdict).
 *
 * Anything else leaves the authorization uncashed, which IS the refund.
 */
export const shouldSettle = (
  outcome: JobOutcome,
  schemaValid: boolean
): SettleDecision => {
  if (outcome.status !== "succeeded") {
    return { settle: false, reason: `job status is ${outcome.status}` }
  }
  if (isRefusal(outcome.stopReason)) {
    return { settle: false, reason: `engine refused (stop_reason=${outcome.stopReason})` }
  }
  if (outcome.output === undefined || outcome.output === null) {
    return { settle: false, reason: "output is empty" }
  }
  if (typeof outcome.output === "string" && outcome.output.trim() === "") {
    return { settle: false, reason: "output is empty" }
  }
  if (Array.isArray(outcome.output) && outcome.output.length === 0) {
    return { settle: false, reason: "output is empty" }
  }
  if (
    typeof outcome.output === "object" &&
    !Array.isArray(outcome.output) &&
    Object.keys(outcome.output as object).length === 0
  ) {
    return { settle: false, reason: "output is empty" }
  }
  if (!schemaValid) {
    return { settle: false, reason: "output failed the listing's outputSchema" }
  }
  return { settle: true, reason: "ok" }
}
