import { declaredRailsOf, RAIL_LABELS } from "../lib/listing-rails.ts"

export function RailDeclaration({ listing }: { readonly listing: unknown }) {
  const rails = declaredRailsOf(listing)
  return <p className="listing-rails">{rails === undefined ? "Accepted rails unavailable"
    : "Accepts (declared): " + rails.map(rail => RAIL_LABELS[rail]).join(" · ")}</p>
}
