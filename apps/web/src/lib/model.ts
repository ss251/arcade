import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { groq } from "@ai-sdk/groq"
import type { LanguageModel } from "ai"

/**
 * Which model answers, as ONE variable.
 *
 * `ARCADE_MODEL` carries provider and model id together — `google:gemini-2.5-flash`,
 * `anthropic:claude-opus-5` — deliberately rather than as a provider variable plus a model
 * variable. Two fields that must agree can be set to an incompatible pair, and the failure
 * would be a service that boots, answers, and fails only on the first real message. That is
 * `hubWsUrl` in a new costume, and this repo keeps arriving at the same answer: delete the
 * second copy.
 *
 * ## Why this is configurable at all
 *
 * A public chat backed by a Claude subscription is the row `docs/terms.md:82` marks
 * prohibited — "a developer shipping a product that offers Claude login or routes plan
 * credentials for its users" — because every visitor would spend the operator's plan.
 * Extracting an OAuth token and using it as a raw API bearer does not work either; it is
 * refused with "This credential is only authorized for use with Claude Code"
 * (`docs/terms.md:84`), so that path fails technically before the policy question is
 * reached. The remaining free options are provider keys with no card attached, which is a
 * swap rather than an architecture change: everything around the model — streamText, the
 * tools, stopWhen, convertToModelMessages — is provider-agnostic.
 *
 * ## The risk this introduces, named
 *
 * A smaller model is likelier to round a price or smooth a measured statistic into prose.
 * The system prompt forbids that, but a prompt is not a guarantee, and a chat that returns
 * a plausible WRONG number is worse than one that refuses: a 503 is legible and a rounded
 * price is not. `apps/web/test/figures.test.ts` pins that figures survive the round trip
 * unchanged, which is the version of that concern that can actually fail.
 */

type Factory = (id: string) => LanguageModel

const PROVIDERS: Record<string, { factory: Factory; keyVar: string }> = {
  anthropic: { factory: (id) => anthropic(id), keyVar: "ANTHROPIC_API_KEY" },
  google: { factory: (id) => google(id), keyVar: "GOOGLE_GENERATIVE_AI_API_KEY" },
  groq: { factory: (id) => groq(id), keyVar: "GROQ_API_KEY" }
}

export const DEFAULT_MODEL = "anthropic:claude-opus-5"

export interface ModelChoice {
  readonly provider: string
  readonly modelId: string
  /** The env var this provider reads its key from. */
  readonly keyVar: string
}

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS)

/** Parse `provider:model-id`. Returns null for anything unsupported or malformed. */
export const parseModel = (spec: string): ModelChoice | null => {
  const idx = spec.indexOf(":")
  if (idx <= 0 || idx === spec.length - 1) return null
  const provider = spec.slice(0, idx)
  const modelId = spec.slice(idx + 1)
  const entry = PROVIDERS[provider]
  return entry === undefined ? null : { provider, modelId, keyVar: entry.keyVar }
}

export const resolveModel = (choice: ModelChoice): LanguageModel =>
  PROVIDERS[choice.provider]!.factory(choice.modelId)
