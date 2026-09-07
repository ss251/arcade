import { ago } from "../lib/format.ts"
import type { ListingSummary, MarketStats } from "../lib/hub.ts"
import { RailDeclaration } from "./rail-declaration.tsx"

const age = (atMs: number, observedAtMs?: number): string =>
  observedAtMs === undefined || !Number.isSafeInteger(observedAtMs) || observedAtMs < 0
    ? "time unavailable" : ago(atMs, observedAtMs)

/** Catalogue annotations are hub-reported status, not independent ENS or chain proof. */
export function ListingCard({ listing, observedAtMs }: {
  readonly listing: ListingSummary; readonly observedAtMs?: number
}) {
  const unavailable = listing.delisted === true || listing.ensExpired === true
  const title = !unavailable && listing.ensName ? listing.ensName : listing.serviceName
  const t = listing.payTested
  return (
    <article className={`listing-card${unavailable ? " is-unavailable" : ""}`}>
      <h2 className="card-title">
        {unavailable ? title : <a href={`/skill/${encodeURIComponent(listing.id)}`}>{title}</a>}
      </h2>
      <span className="card-price">{listing.price}</span>
      <p className="card-desc">{listing.description}</p>
      <RailDeclaration listing={listing} />
      <div className="card-meta">
        <span className="card-id">{listing.id}</span>
        {listing.delisted === true ? <span className="market-badge is-refused">delisted</span> : null}
        {listing.ensExpired === true ? <span className="market-badge is-refused">name expired{listing.ensName ? `: ${listing.ensName}` : ""}</span> : null}
        {t === undefined ? <span className="market-badge is-unknown">pay-test status unavailable</span>
          : t === null ? <span className="market-badge is-unknown">no recorded pay-test</span>
          : <span className={`market-badge ${t.ok ? "is-settled" : "is-refused"}`}>
              {t.ok ? "pay-tested" : "pay-test failed"} {age(t.atMs, observedAtMs)}
            </span>}
        {/* PayTest carries no rail/network. Even a hash-shaped reference earns no tx link. */}
        {listing.stats === undefined ? <span>call statistics unavailable</span>
          : listing.stats.calls === 0 ? <span>no recorded calls</span>
          : <span>{listing.stats.settled}/{listing.stats.calls} recorded settled · {listing.stats.p50LatencyMs / 1000}s p50</span>}
      </div>
    </article>
  )
}

/** Display validated exact money strings; do not reinterpret local ledger totals as mining. */
export function Counters({ stats }: { readonly stats: MarketStats }) {
  return (
    <section className="market-counters" aria-label="Recorded marketplace totals">
      <p><b className="counter-money">{stats.volume}</b><span>recorded settled volume</span></p>
      <p><b>{stats.settled}</b><span>recorded settled calls</span></p>
      <p><b>{stats.trees}</b><span>recorded job trees</span></p>
      <p><b>{stats.listings}</b><span>stored listings from {stats.sellers} sellers</span></p>
      <p><b className="counter-money">{stats.fees}</b><span>recorded platform fees</span></p>
      <p className="counters-source">reported from {stats.source === "subgraph" ? "the subgraph" : "hub receipts"}</p>
    </section>
  )
}
