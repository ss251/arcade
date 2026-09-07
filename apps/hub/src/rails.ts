import { Context, Layer } from "effect"
import { RailTag, type Rail, type Erc8183Rail } from "@arcade/payments"

/** Built rails only; unknown names never silently select the root default. */
export interface Rails {
  readonly default: Rail
  readonly get: (name: string) => Rail | undefined
  readonly names: ReadonlyArray<string>
  /** Dedicated payload/verification contract. Never returned through legacy get/RailTag. */
  readonly escrow?: Erc8183Rail
}

export class RailsTag extends Context.Tag("@arcade/hub/Rails")<RailsTag, Rails>() {}

/**
 * Construction is offline and receives already-built trusted rails. The default
 * wins duplicate names, then the first extra wins, so the advertised collection
 * and lookup cannot disagree. No provider, key, or environment is consulted here.
 */
export const makeRails = (fallback: Rail, others: ReadonlyArray<Rail>, escrow?: Erc8183Rail): Rails => {
  const byName = new Map<string, Rail>([[fallback.name, fallback]])
  for (const rail of others) if (!byName.has(rail.name)) byName.set(rail.name, rail)
  if (escrow !== undefined && (escrow.name !== "erc8183" || byName.has("erc8183"))) throw Error("escrow_registry_refused")
  return Object.freeze({
    default: fallback,
    get: (name: string) => byName.get(name),
    names: Object.freeze([...byName.keys(), ...(escrow === undefined ? [] : ["erc8183"])]),
    ...(escrow === undefined ? {} : { escrow })
  })
}

/** Both service tags share the exact default; root callers keep RailTag unchanged. */
export const railsLayerFrom = (
  fallback: Rail,
  others: ReadonlyArray<Rail>,
  escrow?: Erc8183Rail
): Layer.Layer<RailsTag | RailTag> => Layer.merge(
  Layer.succeed(RailsTag, makeRails(fallback, others, escrow)),
  Layer.succeed(RailTag, fallback)
)
