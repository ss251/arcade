import { Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import { DEFAULT_LISTING_RAILS, type ListingRail, type PublicListing } from "@arcade/core"
import type { ChallengeInput, PaymentRequirements, Rail, Erc8183Rail } from "@arcade/payments"
import type { Rails } from "./rails.ts"

const preference: ReadonlyArray<ListingRail> = ["gateway", "eip3009", "erc8183"]
type ListingRails = Pick<PublicListing, "rails">
export type ChallengeChoice =
  | { readonly kind: "exact"; readonly rail: Rail; readonly requirements: PaymentRequirements }
  | { readonly kind: "escrow"; readonly rail: Erc8183Rail; readonly requirements: PaymentRequirements }

/** Only built AND listed rails. Test mode is an explicit offline exact simulation;
 * a built Gateway remains available to the separate session inventory, never to
 * ordinary simulated calls. Child hires retain the existing default, not escrow. */
export const challengeChoices = (
  rails: Rails, listing: ListingRails, input: ChallengeInput, options: { readonly child?: boolean } = {}
): Effect.Effect<ReadonlyArray<ChallengeChoice>> => {
  const declared = listing.rails ?? DEFAULT_LISTING_RAILS
  const allowed = (rail: Pick<Rail, "name">) => declared.includes(rail.name === "test" ? "eip3009" : rail.name)
  const candidates = options.child || rails.default.name === "test"
    ? (rails.default.name !== "erc8183" && allowed(rails.default) ? [rails.default] : [])
    : preference.flatMap(name => {
      const built = rails.get(name)
      return built !== undefined && allowed(built) ? [built] : []
    })
  // Closed legacy rails must never see escrow-only fields. Without actual input
  // there is no signable escrow quote (notably during generic discovery).
  const { escrow: _context, ...exactInput } = input
  return Effect.gen(function* () {
    const choices: ChallengeChoice[] = yield* Effect.forEach(candidates, rail =>
      Effect.map(rail.challenge(exactInput), requirements => ({ kind: "exact" as const, rail, requirements })))
    if (!options.child && rails.default.name !== "test" && rails.escrow && allowed(rails.escrow) && input.escrow !== undefined) {
      const rail = rails.escrow
      const choice = yield* rail.challenge(input).pipe(
        Effect.map(requirements => ({ kind: "escrow" as const, rail, requirements })),
        Effect.catchAllCause(() => Effect.succeed(undefined)))
      // For example, a listing timeout may exceed this deployment's explicitly
      // configured job lifetime. Omit that quote; do not break valid exact choices.
      if (choice !== undefined) choices.push(choice)
    }
    return choices
  })
}

export const buildAccepts = (
  rails: Rails, listing: ListingRails, input: ChallengeInput, options: { readonly child?: boolean } = {}
): Effect.Effect<ReadonlyArray<PaymentRequirements>> =>
  Effect.map(challengeChoices(rails, listing, input, options), choices => choices.map(choice => choice.requirements))

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
/** Classify before canonical decoding so unsupported schemes are a payment
 * refusal, never an implicit exact fallback. This does not validate a payment. */
export const paymentRailName = (value: unknown): ListingRail | "unsupported" | "malformed" => {
  if (!record(value) || value["x402Version"] !== 2 || !record(value["payload"]) || !record(value["accepted"]) ||
      typeof value["accepted"]["scheme"] !== "string") return "malformed"
  const accepted = value["accepted"]
  if (accepted["scheme"] === "erc8183") return "erc8183"
  if (accepted["scheme"] !== "exact") return "unsupported"
  return record(accepted["extra"]) && accepted["extra"]["name"] === "GatewayWalletBatched" ? "gateway" : "eip3009"
}

const address = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const addressFields = new Set(["verifyingContract", "feeSplitter", "escrow", "hook", "evaluator"])
const extraTerms = (extra: PaymentRequirements["extra"]) => Object.fromEntries(Object.entries(extra).map(([key, value]) =>
  [key, addressFields.has(key) && typeof value === "string" ? value.toLowerCase() : value]))

/** Bind buyer-echoed terms to the server's current listing before verify. An
 * authorization may still cover more than the quote (the existing exact policy),
 * but cannot replace its asset, recipient, quote, domain or splitter metadata.
 * Key order/address casing are immaterial; unknown extra terms fail closed. */
export const matchesRequirements = (accepted: PaymentRequirements, trusted: PaymentRequirements): boolean =>
  accepted.scheme === trusted.scheme && accepted.network === trusted.network && accepted.amount === trusted.amount &&
  address(accepted.asset, trusted.asset) && address(accepted.payTo, trusted.payTo) &&
  accepted.resource === trusted.resource && accepted.maxTimeoutSeconds === trusted.maxTimeoutSeconds &&
  isDeepStrictEqual(extraTerms(accepted.extra), extraTerms(trusted.extra))
