import { Schema } from "effect"

/**
 * Engines, and the one property that decides whether a skill may be sold.
 *
 * ## Why billing is a first-class field
 *
 * An engine is not just "how the work runs" — it also determines *whose terms* the work
 * runs under, and those terms differ in a way that decides legality rather than taste.
 *
 * Anthropic's Commercial Terms (which govern API-key use) say, at §A.1, that a customer
 * may use the Services "including to power products and services Customer makes available
 * to its own customers and end users". Selling a brief produced with your own API key is
 * exactly that: the buyer receives a work product, never access to the model.
 *
 * The Consumer Terms (which govern a Claude subscription) say the opposite three times
 * over: §3 forbids "resell the Services"; §3 forbids accessing the Services "through
 * automated or non-human means, whether through a bot, script, or otherwise" *except* via
 * an API key; and §2 forbids making "your Account available to anyone else". A marketplace
 * endpoint backed by a subscription seat does all three.
 *
 * The same asymmetry holds for OpenAI and xAI: their API terms permit powering your own
 * product, their consumer subscription terms prohibit resale and programmatic access.
 *
 * So `credential` is not a configuration preference. `"subscription"` engines are usable
 * locally — running your own agents against your own seat is what a subscription is for —
 * but they cannot be published, and `assertPublishable` is what makes that structural
 * rather than a paragraph in a guide someone skips.
 */

export const EngineAdapter = Schema.Literal(
  "script", // no model — a plain executable
  "claude-api", // Claude API tool runner
  "claude-agent", // Claude Agent SDK
  "codex", // OpenAI Codex
  "grok" // xAI Grok
)
export type EngineAdapter = typeof EngineAdapter.Type

/**
 * Where an engine's model access comes from.
 *
 * - `none` — no model involved, so no provider terms apply.
 * - `api-key` — a developer credential under commercial terms that permit powering a
 *   product you sell.
 * - `subscription` — a personal seat under consumer terms that forbid resale and
 *   non-interactive access. Local use only.
 */
export const CredentialSource = Schema.Literal("none", "api-key", "subscription")
export type CredentialSource = typeof CredentialSource.Type

export interface EngineTerms {
  readonly credential: CredentialSource
  /** Whether a skill on this engine may be published to the marketplace. */
  readonly sellable: boolean
  /** Shown to the seller when publishing is refused. */
  readonly reason?: string
  /**
   * Shown to the seller when publishing is allowed but the provider's terms are not
   * unambiguous. A caveat is not a refusal — this marketplace does not get to decide a
   * licensing question on a seller's behalf — but neither should it stay quiet about one.
   */
  readonly advisory?: string
}

/**
 * Provider terms differ, and the differences are load-bearing rather than cosmetic.
 * Quoted here because a summary of a licence is how a summary becomes the licence.
 *
 * ANTHROPIC — Commercial Terms §A.1 permit use "including to power products and services
 * Customer makes available to its own customers and end users". Consumer Terms forbid it
 * three ways: §3 "resell the Services"; §3 access "through automated or non-human means,
 * whether through a bot, script, or otherwise" except via an API key; §2 "You also may not
 * make your Account available to anyone else."
 *
 * OPENAI — Services Agreement §2.2 grants "the right to use OpenAI's API to integrate the
 * Services into Customer Applications and to make Customer Applications available to End
 * Users", and §4.1 gives the customer ownership of Output. Note §3.3's restriction list
 * contains NO blanket automated-access clause; that one is Anthropic-specific. The consumer
 * Terms of Use reach the same destination by a different route: "Modify, copy, lease, sell
 * or distribute any of our Services" and "Automatically or programmatically extract data or
 * Output".
 *
 * XAI — the one that is genuinely different. The Acceptable Use Policy states it "applies
 * to anyone using our Service, including consumers, developers and businesses", so it binds
 * API users too, and it prohibits "Scraping, harvesting or reselling any Input or Output".
 * A per-call marketplace is closer to that language than an ordinary SaaS product is. It is
 * unlikely to be the intended reading — it would foreclose most paid products built on the
 * xAI API — but it is not a question this repository can settle, so a Grok skill publishes
 * with the caveat attached rather than silently.
 */
const SUBSCRIPTION_REFUSAL =
  "This engine runs on a personal subscription seat, and every provider forbids selling " +
  "what one produces. Anthropic: no reselling the Services, no automated access outside " +
  "an API key, no making your account available to others. OpenAI: no selling or " +
  "distributing the Services, and no programmatic extraction of Output. xAI: no reselling " +
  "any Output. Switch the skill to an API key (`credential: \"api-key\"`) and it publishes " +
  "as-is — the engine and your agent code do not change. Seat-backed skills still run " +
  "locally, for your own agents."

const XAI_OUTPUT_ADVISORY =
  "xAI's Acceptable Use Policy binds API users as well as consumers and prohibits " +
  '"reselling any Input or Output". Selling a per-call result sits closer to that wording ' +
  "than a typical product built on their API does. This is very likely not the intended " +
  "reading, but it is unresolved — see docs/terms.md before listing a Grok-backed skill " +
  "commercially."

/** Credential sources each engine can authenticate against. */
export const ENGINE_TERMS: Record<EngineAdapter, ReadonlyArray<CredentialSource>> = {
  script: ["none"],
  "claude-api": ["api-key"],
  "claude-agent": ["api-key", "subscription"],
  codex: ["api-key", "subscription"],
  grok: ["api-key", "subscription"]
}

export const termsFor = (
  adapter: EngineAdapter,
  credential: CredentialSource
): EngineTerms => {
  if (credential === "subscription") {
    return { credential, sellable: false, reason: SUBSCRIPTION_REFUSAL }
  }
  if (adapter === "grok" && credential === "api-key") {
    return { credential, sellable: true, advisory: XAI_OUTPUT_ADVISORY }
  }
  return { credential, sellable: true }
}

/** The caveat, if any, a seller should see when publishing this engine. */
export const advisoryFor = (
  adapter: EngineAdapter,
  credential: CredentialSource
): string | undefined => termsFor(adapter, credential).advisory

/** The credential an engine uses when the seller does not say. Never `subscription`. */
export const defaultCredential = (adapter: EngineAdapter): CredentialSource =>
  adapter === "script" ? "none" : "api-key"

export class NotPublishable extends Schema.TaggedError<NotPublishable>()("NotPublishable", {
  skillId: Schema.String,
  adapter: Schema.String,
  credential: Schema.String,
  reason: Schema.String
}) {}

/**
 * The publish gate.
 *
 * Called by `arcade publish` and by the runner before it announces a skill, so a
 * seat-backed listing cannot reach the hub by either route. Enforcement lives here rather
 * than in documentation because a rule that only exists in prose is one compaction away
 * from not existing at all.
 */
export const assertPublishable = (
  skillId: string,
  adapter: EngineAdapter,
  credential: CredentialSource
): void => {
  const terms = termsFor(adapter, credential)
  if (terms.sellable) return
  throw new NotPublishable({
    skillId,
    adapter,
    credential,
    reason: terms.reason ?? "this engine cannot be published"
  })
}

// ── portable capabilities ───────────────────────────────────────────────────

/**
 * What a skill needs to be able to *do*, named independently of any provider.
 *
 * Sellers declare capabilities; each engine maps them onto its own tool names. This is
 * what lets one skill move between Claude, Codex and Grok without a rewrite — and it is
 * also a safety property, because the mapping is a closed set. A seller cannot name
 * `Bash` here and have it mean anything; an engine grants shell access only if
 * `run-code` is asked for, and only in the sandboxed form that engine supports.
 */
export const Capability = Schema.Literal(
  "web-search", // read the public web
  "web-fetch", // retrieve a specific URL already in context
  "read-workdir", // read files inside the skill's own directory
  "write-workdir", // write files inside the skill's own directory
  "run-code", // execute code in the engine's sandbox
  "hire-skills" // buy from other sellers mid-run — this one SPENDS MONEY
)
export type Capability = typeof Capability.Type

/** Capabilities that let untrusted content reach the model, or the model reach outward. */
export const NETWORK_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "web-search",
  "web-fetch"
])

export const isNetworkCapability = (c: Capability): boolean => NETWORK_CAPABILITIES.has(c)
