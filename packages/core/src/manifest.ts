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
 * Public metadata limits are enforced HERE at publish time. Plan J uses up to ten
 * lowercase slug tags; this is not a claim of older Bazaar five-tag conformance.
 */

// ── Public metadata constraints ─────────────────────────────────────────────

export const SERVICE_NAME_MAX = 32
export const MAX_TAGS = 10
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
  Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    { message: () => "tag must be a lowercase alphanumeric slug separated by single hyphens" })
)

/** Declared availability, not a payment authorization or a claim that a hub built a rail. */
export const ListingRail = Schema.Literal("gateway", "eip3009", "erc8183")
export type ListingRail = typeof ListingRail.Type
export const DEFAULT_LISTING_RAILS: ReadonlyArray<ListingRail> = Object.freeze(["gateway", "eip3009"])
export const ListingRails = Schema.Array(ListingRail).pipe(
  Schema.minItems(1), Schema.maxItems(3),
  Schema.filter(rails => new Set(rails).size === rails.length, { message: () => "rails must not contain duplicates" })
)
export const ListingCategory = Schema.Literal(
  "CREATIVE", "DATA_ENRICHMENT", "FINANCIAL_ANALYSIS", "INFRASTRUCTURE", "PREDICTION_MARKETS", "WEB_SEARCH_RESEARCH", "SOCIAL_INTELLIGENCE"
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
  /**
   * Max this skill may spend hiring OTHER skills during one call, in USD.
   *
   * Only meaningful with the `hire-skills` capability. Published deliberately: a buyer can
   * read it against the price and see how much of what they pay is being subcontracted,
   * and a seller who forgets to set it gets no sub-spend budget at all rather than an
   * unbounded one.
   */
  maxSubSpendUsd: Schema.optional(Schema.Number.pipe(Schema.positive())),
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
  tags: Schema.optionalWith(Schema.Array(Tag).pipe(Schema.maxItems(MAX_TAGS)), { default: () => [] }),
  /** Omitted means DEFAULT_LISTING_RAILS at challenge time, not an escrow opt-in. */
  rails: Schema.optional(ListingRails),
  /** Discovery uses INFRASTRUCTURE when omitted; retain omission on the public wire. */
  category: Schema.optional(ListingCategory),
  iconUrl: Schema.optional(IconUrl),
  price: Price,
  /** Optional subscription-comparison hook, e.g. "$500/mo data seat". */
  replaces: Schema.optional(Schema.String.pipe(Schema.maxLength(120))),
  bounds: Bounds,
  /** JSON Schema describing accepted input. */
  inputSchema: Schema.Unknown,
  /** JSON Schema the output MUST satisfy — this is what settle-on-success validates against. */
  outputSchema: Schema.Unknown,
  /**
   * Representative input for the hub's paid canary checks. Deliberately public: sellers
   * must not put secrets here. Omit it to let the hub derive an input from inputSchema.
   */
  canaryInput: Schema.optional(Schema.Unknown)
}) {}

// ── PRIVATE half ────────────────────────────────────────────────────────────

/**
 * An upstream credential binding. `env` is a secret NAME, never its value, and uses
 * the same reserved-name guard as `secrets` so it cannot reopen the sandbox's HOME
 * or request credentials that are reserved for the runner.
 */
export class EngineAuth extends Schema.Class<EngineAuth>("EngineAuth")({
  in: Schema.Literal("header", "query"),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  env: SecretName.pipe(Schema.pattern(/^[A-Za-z_][A-Za-z0-9_]*$/))
}) {}

export class Engine extends Schema.Class<Engine>("Engine")({
  adapter: EngineAdapter,
  /**
   * Where model access comes from. Defaults per adapter — see `defaultCredential`.
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
   * `AgentDefinition` carrying the system prompt, model, and any client-side tools. For
   * `skill` this is the SKILL.md whose body becomes the system prompt. Both stay private.
   *
   * Optional here because MCP and OpenAPI have no entry module. `EngineSpec` requires it
   * for every adapter that runs seller code, so missing entry points still fail at decode.
   */
  entry: Schema.optional(Schema.String),
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
  /** Provider model id for adapters without an agent module; private seller cost choice. */
  model: Schema.optional(Schema.String),
  /** Extra argv passed to the entry. */
  args: Schema.optional(Schema.Array(Schema.String)),

  /** Stdio MCP server as argv, mutually exclusive with `url`. */
  command: Schema.optional(Schema.Array(Schema.String)),
  /** HTTPS streamable-HTTP MCP endpoint, mutually exclusive with `command`. */
  url: Schema.optional(Schema.String),
  /** The ONE MCP tool sold by this listing. */
  tool: Schema.optional(Schema.String),

  /** OpenAPI document path, relative to the skill directory. */
  spec: Schema.optional(Schema.String),
  /** The ONE OpenAPI operation sold by this listing. */
  operationId: Schema.optional(Schema.String),
  /** Private upstream credential binding for MCP or OpenAPI. */
  auth: Schema.optional(EngineAuth)
}) {}

/** Per-adapter required fields, expressed as a useful decode-time refusal. */
export const engineShapeIssue = (e: Engine): string | undefined => {
  if (e.auth?.in === "header" && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(e.auth.name)) {
    return "engine.auth.name must be an HTTP token for a header binding"
  }
  switch (e.adapter) {
    case "mcp": {
      if (e.tool === undefined || e.tool.trim() === "") {
        return 'engine.adapter "mcp" needs `tool` — a listing sells exactly one tool, so ' +
          "that a settled receipt names what the buyer actually bought"
      }
      if (e.command === undefined && e.url === undefined) {
        return 'engine.adapter "mcp" needs `command` (a stdio server, as argv) or `url` ' +
          "(a streamable-HTTP endpoint)"
      }
      if (e.command !== undefined && e.url !== undefined) {
        return 'engine.adapter "mcp" cannot have both `command` and `url` — pick the ' +
          "transport this listing actually uses"
      }
      if (e.command !== undefined && !e.command[0]?.trim()) {
        return "engine.command needs a non-empty executable as its first argv item"
      }
      if (e.url !== undefined) {
        try {
          if (new URL(e.url).protocol !== "https:") {
            return "engine.url must be https — a paid call and any upstream credential in its " +
              "headers must not cross the network in the clear"
          }
        } catch {
          return "engine.url must be a valid https URL"
        }
      }
      return undefined
    }
    case "openapi": {
      if (e.spec === undefined || e.spec.trim() === "") {
        return 'engine.adapter "openapi" needs `spec` — the path to the OpenAPI document, ' +
          "relative to the skill directory. It stays on this machine"
      }
      if (e.operationId === undefined || e.operationId.trim() === "") {
        return 'engine.adapter "openapi" needs `operationId` — a listing sells exactly one ' +
          "operation"
      }
      return undefined
    }
    default: {
      if (e.entry === undefined || e.entry.trim() === "") {
        return `engine.adapter "${e.adapter}" needs \`entry\` — the module (or SKILL.md) ` +
          "this listing runs"
      }
      return undefined
    }
  }
}

/** Engine schema with its adapter-specific requirements enforced. */
export const EngineSpec = Engine.pipe(Schema.filter((e: Engine) => engineShapeIssue(e)))

/**
 * The complete on-disk manifest. `Engine`, `secrets` and `egress` exist ONLY in this type;
 * `PublicListing` above has nowhere to put them.
 */
export class SkillManifest extends Schema.Class<SkillManifest>("SkillManifest")({
  id: SkillId,
  version: Schema.String,
  serviceName: ServiceName,
  description: Schema.String.pipe(Schema.maxLength(500)),
  tags: Schema.optionalWith(Schema.Array(Tag).pipe(Schema.maxItems(MAX_TAGS)), { default: () => [] }),
  rails: Schema.optional(ListingRails),
  category: Schema.optional(ListingCategory),
  iconUrl: Schema.optional(IconUrl),
  price: Price,
  replaces: Schema.optional(Schema.String.pipe(Schema.maxLength(120))),
  bounds: Bounds,
  inputSchema: Schema.Unknown,
  outputSchema: Schema.Unknown,
  /** Public: see PublicListing.canaryInput. */
  canaryInput: Schema.optional(Schema.Unknown),

  // ---- private below this line: never leaves the seller's machine ----
  engine: EngineSpec,
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
    ...(m.rails === undefined ? {} : { rails: m.rails }),
    ...(m.category === undefined ? {} : { category: m.category }),
    ...(m.iconUrl === undefined ? {} : { iconUrl: m.iconUrl }),
    price: m.price,
    ...(m.replaces === undefined ? {} : { replaces: m.replaces }),
    bounds: m.bounds,
    inputSchema: m.inputSchema,
    outputSchema: m.outputSchema,
    ...(m.canaryInput === undefined ? {} : { canaryInput: m.canaryInput })
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
  "credential",
  "model",
  "command",
  "url",
  "tool",
  "spec",
  "operationId",
  "auth"
] as const

export const decodeManifest = Schema.decodeUnknown(SkillManifest)
export const encodePublicListing = Schema.encode(PublicListing)
export const decodePublicListing = Schema.decodeUnknown(PublicListing)
/** Pure synchronous boundary for owner setup scripts that do not run an Effect runtime. */
export const decodePublicListingSync = Schema.decodeUnknownSync(PublicListing)
