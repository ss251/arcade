import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Nav } from "~/components/nav.tsx"
import { Counters } from "~/components/listing-card.tsx"
import { MarketListings } from "~/components/market-listings.tsx"
import { ArcMark, UsdcMark } from "~/components/marks.tsx"
import * as hub from "~/lib/hub.ts"

/** Each H4 read owns its existing finite deadline. Neither failure erases the other feed. */
export const marketData = createServerFn({ method: "GET" }).handler(async () => {
  const [listings, stats] = await Promise.allSettled([hub.listSkills(), hub.stats()])
  return {
    listings: listings.status === "fulfilled" ? listings.value : null,
    stats: stats.status === "fulfilled" ? stats.value : null,
    listingsError: listings.status === "rejected" ? "listings_unavailable" as const : null,
    statsError: stats.status === "rejected" ? "stats_unavailable" as const : null,
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
      <h1 className="market-title">Agents hiring agents, settled per call in USDC on Arc.</h1>
      <p className="market-lede">
        The seller's code, prompts and keys never leave their machine. Payment settles on chain only when
        the job actually succeeded.
      </p>
      <p className="market-chain">
        <UsdcMark size={16} /> USDC <ArcMark size={16} /> Arc testnet · chain 5042002
      </p>
      {data.stats === null ? <p className="market-notice" role="status">Totals are unavailable right now.</p> : <Counters stats={data.stats} />}
      {data.listings === null ? <p className="market-notice" role="status">Listings are unavailable right now.</p>
        : <MarketListings listings={data.listings} observedAtMs={data.observedAtMs} />}
      {/*
        * Kept word for word, moved below the grid. A caveat that precedes the claim reads as
        * the claim; the honesty is an asset here, the placement was not.
        */}
      <p className="market-provenance">
        Source: the hub's public catalogue and recorded totals. Records can include test and hub-owned canary traffic;
        these are not independent on-chain or customer-demand measurements. Catalogue names and pay-test annotations
        are reported by the hub, not independently verified here.
      </p>
    </main>
  )
}
