import { Schema } from "effect"
import { PublicListing } from "./manifest.ts"
import { JobOutcome } from "./job.ts"

/**
 * Hub ↔ runner wire protocol.
 *
 * The runner dials OUT over wss and pulls work; the hub never connects in. That is what
 * lets a seller run on a laptop behind NAT with no open ports — and it is why the hub
 * structurally cannot receive seller credentials.
 */

// ── runner → hub ────────────────────────────────────────────────────────────

export class Hello extends Schema.TaggedClass<Hello>()("Hello", {
  runnerId: Schema.String,
  seller: Schema.String,
  /** Only public projections — the runner never sends a full manifest. */
  listings: Schema.Array(PublicListing),
  maxConcurrency: Schema.Int.pipe(Schema.positive()),
  agentVersion: Schema.String
}) {}

export class JobLog extends Schema.TaggedClass<JobLog>()("JobLog", {
  jobId: Schema.String,
  line: Schema.String,
  atMs: Schema.Number
}) {}

export class JobResult extends Schema.TaggedClass<JobResult>()("JobResult", {
  jobId: Schema.String,
  outcome: JobOutcome
}) {}

export class Heartbeat extends Schema.TaggedClass<Heartbeat>()("Heartbeat", {
  runnerId: Schema.String,
  atMs: Schema.Number,
  activeJobs: Schema.Int
}) {}

export const RunnerMessage = Schema.Union(Hello, JobLog, JobResult, Heartbeat)
export type RunnerMessage = typeof RunnerMessage.Type

// ── hub → runner ────────────────────────────────────────────────────────────

export class JobAssignment extends Schema.TaggedClass<JobAssignment>()("JobAssignment", {
  jobId: Schema.String,
  skillId: Schema.String,
  skillVersion: Schema.String,
  input: Schema.Unknown,
  /** Hard ceiling echoed from the listing so the runner enforces it locally too. */
  timeoutSec: Schema.Int
}) {}

export class Ack extends Schema.TaggedClass<Ack>()("Ack", {
  ok: Schema.Boolean,
  detail: Schema.optional(Schema.String)
}) {}

export class Cancel extends Schema.TaggedClass<Cancel>()("Cancel", {
  jobId: Schema.String,
  reason: Schema.String
}) {}

export class Ping extends Schema.TaggedClass<Ping>()("Ping", {
  atMs: Schema.Number
}) {}

export const HubMessage = Schema.Union(JobAssignment, Ack, Cancel, Ping)
export type HubMessage = typeof HubMessage.Type

export const decodeRunnerMessage = Schema.decodeUnknown(RunnerMessage)
export const encodeRunnerMessage = Schema.encode(RunnerMessage)
export const decodeHubMessage = Schema.decodeUnknown(HubMessage)
export const encodeHubMessage = Schema.encode(HubMessage)

/** Runners that miss this many consecutive heartbeats are considered gone. */
export const HEARTBEAT_INTERVAL_MS = 15_000
export const HEARTBEAT_MISS_LIMIT = 3
