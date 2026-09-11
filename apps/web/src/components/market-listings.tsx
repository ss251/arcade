import { useId, useState } from "react"
import type { ListingSummary } from "../lib/hub-decode.ts"
import { declaredRailsOf, filterCatalog, readRailFilter, type RailFilter } from "../lib/listing-rails.ts"
import { catalogTags, DEFAULT_MARKET_FILTERS, discoverListings, MARKET_SORTS, readMarketSort, type MarketFilters } from "../lib/market-discovery.ts"
import { ListingCard } from "./listing-card.tsx"
import { InterfaceIcon } from "./interface-icon.tsx"

/** Search, filters and sort operate on this public catalog only. No payment requests. */
export function MarketListings({ listings, observedAtMs }: {
  readonly listings: readonly ListingSummary[]; readonly observedAtMs: number
}) {
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_MARKET_FILTERS)
  const [selection, setSelection] = useState<RailFilter>("all"), id = useId()
  const result = discoverListings(filterCatalog(listings, selection), filters), visible = result.listings
  const tags = catalogTags(listings), declared = listings.some(listing => declaredRailsOf(listing) !== undefined)
  const active = filters.query !== "" || filters.tags.length > 0 || filters.minimum !== "" || filters.maximum !== "" || selection !== "all"
  const reset = () => { setFilters(DEFAULT_MARKET_FILTERS); setSelection("all") }
  const change = (next: Partial<MarketFilters>) => setFilters(previous => ({ ...previous, ...next }))
  if (listings.length === 0) return <section className="content-panel empty-state"><h2>No skills to show yet.</h2><p className="market-notice">No eligible listings were returned by this catalog.</p><div className="page-actions"><a className="button-primary" href="/">Refresh the catalog</a><a className="button-secondary" href="/publish">Publish a skill</a></div></section>
  return <>
    <div className="market-toolbar" role="search" aria-label="Find a skill">
      <div className="market-search"><InterfaceIcon name="search" /><label className="visually-hidden" htmlFor={id + "-search"}>Search skills</label><input id={id + "-search"} type="search" placeholder="Find a skill" value={filters.query} maxLength={160} onChange={event => change({ query: event.currentTarget.value })} /></div>
      <div className="market-sort"><label className="visually-hidden" htmlFor={id + "-sort"}>Sort skills</label><select id={id + "-sort"} value={filters.sort} onChange={event => { const sort = readMarketSort(event.currentTarget.value); if (sort) change({ sort }) }}>{MARKET_SORTS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
    </div>
    {tags.length ? <div className="market-tags" role="group" tabIndex={0} aria-label="Filter by tag">{tags.map(tag => <button key={tag} type="button" className="filter-chip" aria-pressed={filters.tags.includes(tag)} onClick={() => change({ tags: filters.tags.includes(tag) ? filters.tags.filter(value => value !== tag) : [...filters.tags, tag] })}>{tag.replaceAll("-", " ")}</button>)}</div> : null}
    <div className="market-filter-row"><p className="market-result-count" role="status" aria-live="polite">{visible.length} of {listings.length} skills</p>
      {active ? <button className="market-reset" type="button" onClick={reset}>Clear filters</button> : null}
      <details className="market-filters"><summary>Price &amp; payment options{filters.minimum !== "" || filters.maximum !== "" || selection !== "all" ? " · Active" : ""}</summary>
        <div className="market-filter-panel"><div className="market-price-range"><label htmlFor={id + "-min"}>Minimum per call (USDC)<input id={id + "-min"} inputMode="decimal" placeholder="No minimum" value={filters.minimum} maxLength={80} aria-invalid={result.error !== null} aria-describedby={id + "-price-note"} onChange={event => change({ minimum: event.currentTarget.value })} /></label><label htmlFor={id + "-max"}>Maximum per call (USDC)<input id={id + "-max"} inputMode="decimal" placeholder="No maximum" value={filters.maximum} maxLength={80} aria-invalid={result.error !== null} aria-describedby={id + "-price-note"} onChange={event => change({ maximum: event.currentTarget.value })} /></label></div>
          <p id={id + "-price-note"} className="note">{result.error ?? "Exact listed prices. The current payment quote is checked before you approve."}</p>
          {declared ? <div className="market-rail-filter"><label htmlFor={id + "-rail"}>Declared payment rail</label><select id={id + "-rail"} value={selection} aria-describedby={id + "-note"} onChange={event => { const filter = readRailFilter(event.currentTarget.value); if (filter !== undefined) setSelection(filter) }}><option value="all">All declarations</option><option value="gateway">Gateway</option><option value="eip3009">Exact</option><option value="erc8183">Escrow</option><option value="unavailable">Declaration unavailable</option></select><p id={id + "-note"}>Hub-reported listing declarations, not current payment availability. Filtering does not change the recorded totals or authorize a purchase.</p></div> : null}
          <p className="note">Settlement rate and median latency use recorded calls; missing measurements sort last. “Most recorded calls” sorts by sample size, not a quality rating. Multiple tags must all match.</p>
        </div>
      </details>
    </div>
    {visible.length === 0 ? <section className="content-panel empty-state"><h2>{result.error ? "Check the price range." : "No skills match yet."}</h2><p className="market-notice">{result.error ?? "Try a different search or remove a filter to explore more skills."}</p><div className="page-actions"><button className="button-primary" type="button" onClick={reset}>Show all skills</button></div></section>
      : <section className="market-cards" aria-label="Available catalog listings">{visible.map(listing => <ListingCard key={listing.seller.toLowerCase() + ":" + listing.id} listing={listing} observedAtMs={observedAtMs} />)}</section>}
  </>
}
