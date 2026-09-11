import { ago } from "../lib/format.ts"
import type { ListingSummary, MarketStats } from "../lib/hub.ts"
import { recordedStats, settlementPercent } from "../lib/market-discovery.ts"
import { InterfaceIcon } from "./interface-icon.tsx"

const age = (atMs: number, observedAtMs?: number): string =>
  observedAtMs === undefined || !Number.isSafeInteger(observedAtMs) || observedAtMs < 0
    ? "time unavailable" : ago(atMs, observedAtMs)

/**
 * Catalog annotations are hub-reported status, not independent ENS or chain proof.
 *
 * ABSENCE IS NOT A LINE. A card used to print "pay-test status unavailable" and "call
 * statistics unavailable" whenever the hub omitted a field — three sentences per card
 * about what is not known, on every card, which is what a catalog of nine listings
 * looked like before the hub started serving stats to the list route. A missing field
 * now renders nothing at all; the page says less and claims exactly as much. What the
 * hub does report still says plainly whether it was tested and how it went.
 */
export function ListingCard({ listing, observedAtMs }: {
  readonly listing: ListingSummary; readonly observedAtMs?: number
}) {
  const unavailable = listing.delisted === true || listing.ensExpired === true
  const title = listing.serviceName
  const tags = listing.tags ?? []
  const t = listing.payTested
  const s = recordedStats(listing)
  return (
    <article className={`listing-card${unavailable ? " is-unavailable" : ""}`}>
      <div className="card-top"><span className="card-symbol" aria-hidden="true"><InterfaceIcon name={tags.some(tag => /code|test|review/i.test(tag)) ? "code" : tags.some(tag => /research/i.test(tag)) ? "research" : tags.some(tag => /data|valid/i.test(tag)) ? "data" : "skill"} /></span><span className="card-category">{tags[0]?.replaceAll("-", " ")}</span><span className="card-open" aria-hidden="true">↗</span></div>
      <h2 className="card-title">
        {unavailable ? title : <a href={`/skill/${encodeURIComponent(listing.id)}`}>{title}</a>}
      </h2>
      <span className="card-price">{listing.price}<span className="card-price-unit">USDC · per call</span></span>
      <p className="card-desc">{listing.description}</p>
      <div className="card-meta">
        {listing.delisted === true ? <span className="market-badge">delisted</span> : null}
        {listing.ensExpired === true ? <span className="market-badge">name expired{listing.ensName ? `: ${listing.ensName}` : ""}</span> : null}
        {t === undefined || t === null ? null
          : <span className={`market-badge ${t.ok ? "is-settled" : "is-refused"}`}>
              {t.ok ? "✓ pay-tested" : "✕ pay-test failed"} {age(t.atMs, observedAtMs)}
            </span>}
        {/* PayTest carries no rail/network. Even a hash-shaped reference earns no tx link. */}
        {s === null ? null : <div className="card-metrics">
          <span className="card-proof"><span className="settled">{settlementPercent(s.settled, s.calls)} settled</span><span className="metric-detail">{s.settled}/{s.calls} settled · hub records</span></span>
          <span className="card-latency">{s.p50LatencyMs < 1000 ? `${s.p50LatencyMs} ms` : `${(s.p50LatencyMs / 1000).toFixed(1)}s`}<span className="metric-detail">Median response</span></span>
        </div>}
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
