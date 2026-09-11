import { declaredRailsOf, RAIL_LABELS } from "../lib/listing-rails.ts"

/**
 * A hub that reports no declaration gets silence, not a sentence about the silence.
 * "Accepted rails unavailable" appeared on every card of a nine-listing catalog and
 * told a reader nothing they could act on.
 */
export function RailDeclaration({ listing }: { readonly listing: unknown }) {
  const rails = declaredRailsOf(listing)
  if (rails === undefined) return null
  return <p className="listing-rails">{"Accepts (declared): " + rails.map(rail => RAIL_LABELS[rail]).join(" · ")}</p>
}
