import { Schema } from "effect"
import {
  assertPublishable,
  Capability,
  CredentialSource,
  defaultCredential,
  EngineAdapter
} from "./engine.ts"

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

// ── the sandbox's own variables ─────────────────────────────────────────────

/**
 * Environment variables a manifest may NOT request through `secrets`.
 *
 * `secrets` exists so a seller can hand their own credentials to their own code. It is not
 * a general passthrough, and treating it as one collapses two guarantees at once.
 *
 * `HOME` is the sharp example. The sandbox redirects it into the skill directory so a job
 * cannot reach `~/.ssh`, `~/.aws` or a shell history by relative path. A manifest naming
 * `HOME` in `secrets` gets the real one back — which defeats the env scrub, and separately
 * puts the OS login keychain back in reach, so a skill could authenticate against a
 * subscription seat while declaring `credential: "api-key"` and publishing normally.
 *
 * So this list is doing double duty: it keeps the sandbox a sandbox, and it keeps the
 * publish gate from being a formality. Rejected at decode time, which means a manifest
 * naming one of these does not load at all — there is no path where it is merely warned
 * about.
 */
export const RESERVED_ENV_NAMES: ReadonlySet<string> = new Set([
  // the sandbox's own definition
  "HOME",
  "PATH",
  "LANG",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  // engine mechanics, granted by an engine's `envGrants` and never by a manifest
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME"
])

/** Everything the runner reserves for itself, by prefix. */
const RESERVED_PREFIX = "ARCADE_"

export const isReservedEnvName = (name: string): boolean =>
  RESERVED_ENV_NAMES.has(name) || name.startsWith(RESERVED_PREFIX)

export const SecretName = Schema.String.pipe(
  Schema.filter((name) => !isReservedEnvName(name), {
    message: (issue) =>
      `"${String(issue.actual)}" is reserved by the sandbox and cannot be listed in \`secrets\`. ` +
      "Those variables define the sandbox itself — `HOME` in particular is redirected into " +
      "the skill directory so a job cannot read the seller's home by relative path, and " +
      "restoring it would also put a subscription seat's keychain back in reach. Engines " +
      "request what they need through their own grants; `secrets` is for your credentials."
  }),
  Schema.annotations({ identifier: "SecretName" })
)

// ── Bounded work (D1): the seller's margin guard ────────────────────────────

export class Bounds extends Schema.Class<Bounds>("Bounds")({
  /** Max agent turns. Ignored by non-agent (script) adapters. */
  maxTurns: Schema.optional(Schema.Int.pipe(Schema.positive())),
  /** Max total tokens across the run. */
  maxTokens: Schema.optional(Schema.Int.pipe(Schema.positive())),
  /** Max tool invocations. */
  maxToolCalls: Schema.optional(Schema.Int.pipe(Schema.positive())),
  /**
   * Max inference spend for one call, in USD.
   *
   * This is the bound that actually expresses D1. A token ceiling is a weak margin guard
   * because output bills at roughly five times input: the same 50k tokens can cost a
   * quarter or well over a dollar depending on the mix. Denominating the ceiling in money
   * makes "this call cannot go margin-negative" a property the engine can enforce instead
   * of a hope. Published deliberately — a buyer can read it against the price and see the
   * seller's margin is real.
   */
  maxCostUsd: Schema.optional(Schema.Number.pipe(Schema.positive())),
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

export class Engine extends Schema.Class<Engine>("Engine")({
  adapter: EngineAdapter,
  /**
   * Where model access comes from. Defaults to `"api-key"`.
   *
   * `"subscription"` runs on a personal seat, which consumer terms limit to the holder's
   * own interactive use. Such a skill still runs locally but `assertPublishable` refuses
   * to list it — see `engine.ts` for the clauses and the reasoning.
   */
  credential: Schema.optional(CredentialSource),
  /**
   * Path to the executable/entry module, relative to the skill directory.
   *
   * For `claude-api` this is the seller's agent module — a default-exported
   * `AgentDefinition` carrying the system prompt, model, and any client-side tools. It is
   * loaded by the harness inside the sandbox and never transmitted.
   */
  entry: Schema.String,
  /**
   * What the skill may do, in portable terms. Empty means the job reaches neither the
   * network nor the filesystem.
   *
   * Declared here as well as in the agent module so the runner can reason about the
   * sandbox without importing the seller's code — and so `arcade publish` can show a
   * seller the blast radius of their own skill in one line.
   */
  capabilities: Schema.optionalWith(Schema.Array(Capability), { default: () => [] }),
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
  secrets: Schema.optionalWith(Schema.Array(SecretName), { default: () => [] }),
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

/** The credential a manifest's engine will actually use. */
export const credentialOf = (m: SkillManifest) =>
  m.engine.credential ?? defaultCredential(m.engine.adapter)

/**
 * The publish gate, in manifest terms.
 *
 * Called by `arcade publish` and again by the runner before it announces a skill, so a
 * seat-backed listing cannot reach the hub by either route. It throws rather than
 * returning a boolean because the only correct response is to stop: a marketplace that
 * lists a skill it may not legally sell has a problem no retry fixes.
 */
export const assertManifestPublishable = (m: SkillManifest): void =>
  assertPublishable(m.id, m.engine.adapter, credentialOf(m))

/** Field names that must never appear in a published payload. Asserted by the property test. */
export const PRIVATE_FIELDS = [
  "engine",
  "secrets",
  "egress",
  "workdir",
  "systemPrompt",
  "entry",
  "capabilities",
  "credential"
] as const

export const decodeManifest = Schema.decodeUnknown(SkillManifest)
export const encodePublicListing = Schema.encode(PublicListing)
export const decodePublicListing = Schema.decodeUnknown(PublicListing)
