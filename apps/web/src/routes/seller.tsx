import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { SellerPage } from "../components/seller.tsx"
import { Nav } from "../components/nav.tsx"
import { loadSellerPage, sellerSearch } from "../lib/seller-page-data.ts"
import * as hub from "../lib/hub.ts"

export const summaryFor = createServerFn({ method: "GET" }).validator((input: unknown) => input)
  .handler(({ data }) => loadSellerPage(data, hub.sellerSummary))

export const Route = createFileRoute("/seller")({
  validateSearch: sellerSearch,
  loaderDeps: ({ search }) => ({ address: search.address }),
  // Router cancellation stops its RPC; H4's upstream read keeps its own 10s bound.
  loader: ({ deps, abortController }) => summaryFor({ data: { address: deps.address }, signal: abortController.signal }),
  component: Seller,
  errorComponent: () => <main className="wrap seller-page"><Nav here="seller" /><h1>Seller page unavailable.</h1><p>Try a public address again. No job or payment was changed.</p></main>
})
function Seller() {
  const { address } = Route.useSearch(), data = Route.useLoaderData(), navigate = useNavigate()
  return <SellerPage address={address} data={data} onSelect={address => navigate({ to: "/seller", search: { address } })} />
}
