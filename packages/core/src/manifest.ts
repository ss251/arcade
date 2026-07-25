import { Schema } from "effect"

/**
 * THE SECRECY BOUNDARY.
 *
 * A seller's `arcade.json` has two projections:
 *   - PublicListing  — what the hub receives and the marketplace shows.
 *   - SkillManifest  — the full document, which stays on the seller's machine forever.
 *
 * `toPublicListing` is a *schema transformation*, not a filter function. The public type
 * has no field in which a prompt, script path, or credential could live, so leaking one is
 * a type error rather than a forgotten `delete`. `secrecy.property.test.ts` proves this
 * over arbitrary generated manifests.
 *
 * Bazaar limits (serviceName ≤32, ≤5 tags, https iconUrl) are enforced HERE at publish time
 * rather than being silently dropped later by a facilitator.
 */

// ── Bazaar constraints (mirrors agentcash-router resource-metadata.ts) ───────

export const SERVICE_NAME_MAX = 32
export const MAX_TAGS = 5
export const ICON_URL_MAX = 2048

const printableAscii = (s: string) => /^[\x20-\x7E]*$/.test(s)

export const ServiceName = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(SERVICE_NAME_MAX),
  Schema.filter(printableAscii, {
    message: () => "serviceName must be printable ASCII"
  }),
  Schema.annotations({ identifier: "ServiceName" })
)

export const Tag = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(SERVICE_NAME_MAX),
  Schema.filter(printableAscii, { message: () => "tag must be printable ASCII" })
)

export const IconUrl = Schema.String.pipe(
  Schema.maxLength(ICON_URL_MAX),
  Schema.filter((s) => s.startsWith("https://"), {
    message: () => "iconUrl must be https"
  }),
  Schema.annotations({ identifier: "IconUrl" })
)

export const SkillId = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9][a-z0-9-]{1,63}$/),
  Schema.annotations({
    identifier: "SkillId",
    description: "lowercase kebab-case, 2-64 chars"
  })
)

export const Price = Schema.String.pipe(
  Schema.pattern(/^\$?\d+(\.\d{1,6})?$/),
  Schema.annotations({ identifier: "Price", description: 'e.g. "$0.25"' })
)

// ── Bounded work (D1): the seller's margin guard ────────────────────────────

export class Bounds extends Schema.Class<Bounds>("Bounds")({
  /** Max agent turns. Ignored by non-agent (script) adapters. */
  maxTurns: Schema.optional(Schema.Int.pipe(Schema.positive())),
  /** Max total tokens across the run. */
  maxTokens: Schema.optional(Schema.Int.pipe(Schema.positive())),
  /** Max tool invocations. */
  maxToolCalls: Schema.optional(Schema.Int.pipe(Schema.positive())),
  /** Hard wall-clock ceiling. Always required — every job must be able to die. */
  timeoutSec: Schema.Int.pipe(Schema.positive(), Schema.lessThanOrEqualTo(900))
}) {}

// ── PUBLIC projection ───────────────────────────────────────────────────────

/**
 * Everything the hub is allowed to know. Note what is absent: no engine, no entry point,
 * no system prompt, no secret names, no egress rules, no working directory.
 */
export class PublicListing extends Schema.Class<PublicListing>("PublicListing")({
  id: SkillId,
  version: Schema.String,
  serviceName: ServiceName,
  description: Schema.String.pipe(Schema.maxLength(500)),
  tags: Schema.Array(Tag).pipe(Schema.maxItems(MAX_TAGS)),
  iconUrl: Schema.optional(IconUrl),
  price: Price,
  /** Optional subscription-comparison hook, e.g. "$500/mo data seat". */
  replaces: Schema.optional(Schema.String.pipe(Schema.maxLength(120))),
  bounds: Bounds,
  /** JSON Schema describing accepted input. */
  inputSchema: Schema.Unknown,
  /** JSON Schema the output MUST satisfy — this is what settle-on-success validates against. */
  outputSchema: Schema.Unknown
}) {}

// ── PRIVATE half ────────────────────────────────────────────────────────────

export const EngineAdapter = Schema.Literal(
  "script", // lane E — bare executable, no LLM
  "claude-agent-sdk", // lane A — seller's own Anthropic API key
  "claude-cli", // lane B — seller's own seat, self-hosted, seller's risk
  "codex-cli", // lane C
  "grok-cli" // lane D
)
export type EngineAdapter = typeof EngineAdapter.Type

export class Engine extends Schema.Class<Engine>("Engine")({
  adapter: EngineAdapter,
  /** Path to the executable/entry module, relative to the skill directory. */
  entry: Schema.String,
  /** Optional system prompt for LLM adapters. Never transmitted. */
  systemPrompt: Schema.optional(Schema.String),
  /** Extra argv passed to the entry. */
  args: Schema.optional(Schema.Array(Schema.String))
}) {}

/**
 * The complete on-disk manifest. `Engine`, `secrets` and `egress` exist ONLY in this type;
 * `PublicListing` above has nowhere to put them.
 */
export class SkillManifest extends Schema.Class<SkillManifest>("SkillManifest")({
  id: SkillId,
  version: Schema.String,
  serviceName: ServiceName,
  description: Schema.String.pipe(Schema.maxLength(500)),
  tags: Schema.Array(Tag).pipe(Schema.maxItems(MAX_TAGS)),
  iconUrl: Schema.optional(IconUrl),
  price: Price,
  replaces: Schema.optional(Schema.String.pipe(Schema.maxLength(120))),
  bounds: Bounds,
  inputSchema: Schema.Unknown,
  outputSchema: Schema.Unknown,

  // ---- private below this line: never leaves the seller's machine ----
  engine: Engine,
  /** Environment variable NAMES the sandbox may pass through. Never values. */
  secrets: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  /** Hostnames the sandbox may reach. Empty means no network. */
  egress: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  /** Working directory relative to the skill dir. */
  workdir: Schema.optional(Schema.String)
}) {}

/**
 * The one and only way a manifest becomes publishable.
 *
 * Structural, not subtractive: we construct a `PublicListing` from named public fields.
 * Adding a new private field to `SkillManifest` cannot leak it, because it has no
 * corresponding slot here and `PublicListing` would reject it.
 */
export const toPublicListing = (m: SkillManifest): PublicListing =>
  PublicListing.make({
    id: m.id,
    version: m.version,
    serviceName: m.serviceName,
    description: m.description,
    tags: m.tags,
    ...(m.iconUrl === undefined ? {} : { iconUrl: m.iconUrl }),
    price: m.price,
    ...(m.replaces === undefined ? {} : { replaces: m.replaces }),
    bounds: m.bounds,
    inputSchema: m.inputSchema,
    outputSchema: m.outputSchema
  })

/** Field names that must never appear in a published payload. Asserted by the property test. */
export const PRIVATE_FIELDS = ["engine", "secrets", "egress", "workdir", "systemPrompt", "entry"] as const

export const decodeManifest = Schema.decodeUnknown(SkillManifest)
export const encodePublicListing = Schema.encode(PublicListing)
export const decodePublicListing = Schema.decodeUnknown(PublicListing)
