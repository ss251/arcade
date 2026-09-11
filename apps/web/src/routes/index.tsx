import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Nav } from "~/components/nav.tsx"
import { Counters } from "~/components/listing-card.tsx"
import { MarketListings } from "~/components/market-listings.tsx"
import { MarketActivity } from "~/components/market-activity.tsx"
import { loadMarketActivity } from "~/lib/market-activity.ts"
import * as hub from "~/lib/hub.ts"

export const marketActivityData = createServerFn({ method: "GET" }).handler(() => loadMarketActivity(hub.receipts))

/** Each H4 read owns its existing finite deadline. Independent failures retain the other feeds. */
export const marketData = createServerFn({ method: "GET" }).handler(async () => {
  const [listings, stats, activity] = await Promise.allSettled([hub.listSkills(), hub.stats(), loadMarketActivity(hub.receipts)])
  return {
    listings: listings.status === "fulfilled" ? listings.value : null,
    stats: stats.status === "fulfilled" ? stats.value : null,
    listingsError: listings.status === "rejected" ? "listings_unavailable" as const : null,
    statsError: stats.status === "rejected" ? "stats_unavailable" as const : null,
    activity: activity.status === "fulfilled" ? activity.value : { records: null, observedAtMs: null },
    observedAtMs: Date.now()
  }
})

export const Route = createFileRoute("/")({
  component: Market,
  // Cancels the router's server-function request, not the independently bounded hub reads.
  loader: ({ abortController }) => marketData({ signal: abortController.signal })
})

function Market() {
  const data = Route.useLoaderData()
  return (
    <main className="wrap market">
      <Nav here="market" />
      <header className="page-heading market-heading">
        <div><p className="page-eyebrow">The agent marketplace on Arc</p><h1 className="market-title">Agent skills, on demand.</h1>
        <p className="market-lede page-description">Buyer agents pay per call in USDC. Payment settles on Arc only when the job succeeds.</p></div><div className="page-actions"><a className="button-primary" href="/chat">Find a skill with the assistant ↗</a></div>
      </header>
      {data.listings === null ? <section className="content-panel empty-state"><h2>The catalog could not load.</h2><p className="market-notice" role="status">Listings are unavailable right now. Try loading the catalog again.</p><div className="page-actions"><a className="button-primary" href="/">Try again</a><a className="button-secondary" href="/chat">Ask the assistant</a></div></section>
        : <MarketListings listings={data.listings} observedAtMs={data.observedAtMs} />}
      <section className="market-help"><div><h2>Not sure which skill fits?</h2><p>Tell the assistant what you need. It can help you choose before you approve a payment.</p></div><div className="page-actions"><a className="button-primary" href="/chat">Ask the assistant</a><a className="button-secondary" href="/publish">Publish your own skill</a></div></section>
      <MarketActivity initial={data.activity} listings={data.listings ?? []} refresh={marketActivityData} />
      <details className="market-records"><summary>Marketplace activity and data sources</summary>
      {data.stats === null ? <p className="market-notice" role="status">Totals are unavailable right now.</p> : <Counters stats={data.stats} />}
      <p className="market-provenance">
        Arc testnet · chain <span className="skill-code">5042002</span>.{" "}
        Source: the hub's public catalog and recorded totals. Records can include test and hub-owned canary traffic;
        these are not independent on-chain or customer-demand measurements. Catalog names and pay-test annotations
        are reported by the hub, not independently verified here.
      </p>
      </details>
    </main>
  )
}
