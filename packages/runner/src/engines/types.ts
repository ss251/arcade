import type { Capability, CredentialSource, EngineAdapter } from "@arcade/core"

/**
 * The seller-facing shape, and the engine-facing contract behind it.
 *
 * There is exactly one way to describe a skill's agent, whichever provider runs it. That
 * is not tidiness — it is the product. A marketplace whose listings are written against a
 * specific vendor's tool names is a marketplace where changing provider means rewriting
 * every skill, and where a buyer's choice of engine is really the seller's choice.
 * Capabilities are declared in portable terms and each engine maps them to its own tools.
 */

// ── what a seller writes ────────────────────────────────────────────────────

export type Effort = "low" | "medium" | "high" | "xhigh" | "max"

export interface SkillAgent {
  /** The operator instructions. Never transmitted; `PublicListing` has no field for it. */
  readonly systemPrompt: string

  /**
   * Where model access comes from. Defaults to `"api-key"`.
   *
   * `"subscription"` runs against a personal seat, which consumer terms restrict to your
   * own interactive use — such a skill still runs locally but cannot be published. See
   * `assertPublishable` in `@arcade/core`.
   */
  readonly credential?: CredentialSource

  /** Provider-specific model id. Omit to take the engine's default. */
  readonly model?: string

  /**
   * Reasoning depth. Defaults to `"medium"`: on current frontier models the lower levels
   * are unusually strong, and a per-call endpoint priced in cents is exactly where that
   * matters. Raise it for skills that genuinely need the depth.
   */
  readonly effort?: Effort

  /**
   * What the skill needs to be able to do, in portable terms. Empty is the default and
   * means the job cannot touch the network or the filesystem at all.
   *
   * Every entry widens what a prompt-injected input could reach, so this list is the
   * single most security-relevant line a seller writes.
   */
  readonly capabilities?: ReadonlyArray<Capability>

  /**
   * Hosts the skill may reach, when it has a network capability. Empty means the engine's
   * own default, which is not a restriction — name domains wherever the skill's sources
   * are actually known.
   */
  readonly allowedDomains?: ReadonlyArray<string>

  /** Per-response output ceiling. On thinking models this covers thinking and text together. */
  readonly maxTokensPerTurn?: number

  /** Working directory, relative to the skill directory. */
  readonly workdir?: string

  /**
   * Set false when the output schema uses keywords strict mode rejects (`minLength`,
   * numeric ranges). The hub validates every output against the full schema regardless, so
   * this trades a provider-level guarantee for schema expressiveness and never weakens the
   * settle-on-success rule.
   */
  readonly strictOutput?: boolean
}

/**
 * Identity with a type annotation attached.
 *
 * Worth its own export: `export default defineAgent({...})` gives sellers completion and
 * an immediate error on a typo, where `export default {...}` gives them a runtime failure
 * on their first paid call.
 */
export const defineAgent = (agent: SkillAgent): SkillAgent => agent

// ── what the harness passes an engine ───────────────────────────────────────

export interface JobBounds {
  readonly maxTurns?: number
  readonly maxTokens?: number
  readonly maxToolCalls?: number
  readonly maxCostUsd?: number
  readonly timeoutSec: number
}

export interface HarnessJob {
  readonly jobId: string
  /** The buyer's input. Untrusted: it reaches the model only inside a fence. */
  readonly input: unknown
  /** Absolute path to the skill directory. Local-only; never transmitted. */
  readonly skillDir: string
  readonly bounds: JobBounds
  readonly outputSchema: unknown
}

export interface JobUsage {
  turns: number
  tokens: number
  toolCalls: number
}

export interface JobEnvelope {
  readonly output?: unknown
  /**
   * Why the run ended. `end_turn` is the only value that can settle; everything else is
   * the engine telling the runner not to charge for this.
   */
  readonly stopReason?: string
  readonly usage: JobUsage
  /** What this call cost the seller to produce, in USD. Reported on the receipt. */
  readonly costUsd: number
  readonly error?: string
  /** Set when the buyer's input tried to forge a fence marker. Logged, never fatal. */
  readonly suspectedInjection?: boolean
}

// ── what an engine implements ───────────────────────────────────────────────

export interface Engine {
  readonly adapter: EngineAdapter

  /**
   * Run one job. Engines receive an already-fenced prompt and are responsible for their
   * own ceilings — a bound checked after the process exits reports money already spent.
   */
  readonly run: (agent: SkillAgent, job: HarnessJob, prompt: string) => Promise<JobEnvelope>

  /**
   * Environment variables this engine needs beyond the base scrub, given an agent.
   *
   * Declared rather than assumed so the widening is visible in one place and testable:
   * `exec.ts` grants exactly this and nothing else.
   */
  readonly envGrants: (agent: SkillAgent) => ReadonlyArray<string>

  /** Human-readable check that this engine can run here at all. */
  readonly doctor: (agent: SkillAgent) => Promise<{ ok: boolean; detail: string }>
}
