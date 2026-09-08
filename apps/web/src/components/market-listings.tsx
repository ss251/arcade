import { useId, useState } from "react"
import type { ListingSummary } from "../lib/hub-decode.ts"
import { declaredRailsOf, filterCatalogue, readRailFilter, type RailFilter } from "../lib/listing-rails.ts"
import { ListingCard } from "./listing-card.tsx"

/** Native local-only control: no wallet, storage, upstream read or payment probe. */
export function MarketListings({ listings, observedAtMs }: {
  readonly listings: readonly ListingSummary[]; readonly observedAtMs: number
}) {
  const [selection, setSelection] = useState<RailFilter>("all"), id = useId()
  const visible = filterCatalogue(listings, selection)
  if (listings.length === 0) return <p className="market-notice">No eligible listings were returned by this catalogue.</p>
  /*
   * The filter is only a control when there is something to filter BY. While no listing
   * declares a rail, every option but "all" empties the grid — so the page's largest
   * control, sitting above the fold, was a reliable way to make nine listings vanish on
   * a first click. Hide it until a declaration actually arrives; it returns on its own.
   */
  const declared = listings.some(listing => declaredRailsOf(listing) !== undefined)
  return <>
    {declared ? <div className="market-rail-filter">
      <label htmlFor={id}>Declared payment rail</label>
      <select id={id} value={selection} aria-describedby={id + "-note"} onChange={event => {
        const filter = readRailFilter(event.currentTarget.value)
        if (filter !== undefined) setSelection(filter)
      }}>
        <option value="all">All declarations</option>
        <option value="gateway">Gateway</option>
        <option value="eip3009">Exact</option>
        <option value="erc8183">Escrow</option>
        <option value="unavailable">Declaration unavailable</option>
      </select>
      <p id={id + "-note"}>Hub-reported listing declarations, not current payment availability. Filtering does not change the recorded totals or authorize a purchase.</p>
      <p role="status" aria-live="polite">{visible.length} of {listings.length} catalogue listings shown</p>
    </div> : null}
    {visible.length === 0 ? <p className="market-notice">No listings in this returned catalogue match the selected declaration.</p>
      : <section className="market-cards" aria-label="Available catalogue listings">
        {visible.map(listing => <ListingCard key={listing.seller.toLowerCase() + ":" + listing.id}
          listing={listing} observedAtMs={observedAtMs} />)}
      </section>}
  </>
}
