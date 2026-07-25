import { explorerTxUrl, formatPrice, type Receipt } from "@arcade/core"
import type { ListingRecord } from "./store.ts"

/**
 * Server-rendered marketplace page.
 *
 * Intentionally one file with no build step: commit 1 needs something screenshot-able and
 * honest. `apps/web` (TanStack Start) replaces this on Jul 29 — until then this is the real
 * surface, not a placeholder, so it shows live listings and the receipt feed.
 */

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export const renderIndex = (
  listings: ReadonlyArray<ListingRecord>,
  receipts: ReadonlyArray<Receipt>,
  rail: string
): string => {
  const cards = listings
    .map(
      ({ listing, seller }) => `
      <article class="card">
        <header>
          <h3>${esc(listing.serviceName)}</h3>
          <span class="price">${esc(formatPrice(BigInt(0)) === "" ? "" : listing.price)}</span>
        </header>
        <p>${esc(listing.description)}</p>
        ${listing.replaces === undefined ? "" : `<p class="replaces">replaces <s>${esc(listing.replaces)}</s></p>`}
        <div class="tags">${listing.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
        <footer>
          <code>${esc(listing.id)}</code>
          <span class="seller">${esc(seller.slice(0, 10))}…</span>
        </footer>
      </article>`
    )
    .join("")

  const rows = [...receipts]
    .reverse()
    .slice(0, 25)
    .map(
      (r) => `
      <tr class="${r.settled ? "ok" : "no"}">
        <td><code>${esc(r.skillId)}</code></td>
        <td>${esc(formatPrice(r.priceAtomic))}</td>
        <td>${esc(formatPrice(r.sellerAtomic))}</td>
        <td>${esc(formatPrice(r.feeAtomic))}</td>
        <td>${r.latencyMs}ms</td>
        <td>${r.settled ? "settled" : `<span title="${esc(r.reason)}">not settled</span>`}</td>
        <td>${r.settleTx === undefined ? "—" : `<a href="${explorerTxUrl(r.settleTx)}" target="_blank" rel="noreferrer">${esc(r.settleTx.slice(0, 10))}…</a>`}</td>
      </tr>`
    )
    .join("")

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ARCADE — paid agent skills on Arc</title>
<style>
  :root { color-scheme: light dark; --bg:#0b0d10; --fg:#e8eaed; --dim:#9aa4b2; --line:#1e232b; --accent:#4cc2ff; --ok:#3ddc97; --no:#ff6b6b; }
  @media (prefers-color-scheme: light) { :root { --bg:#fff; --fg:#11151a; --dim:#5b6472; --line:#e6e9ee; } }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:48px 24px 96px }
  h1 { font-size:2rem; letter-spacing:-.02em; margin:0 0 6px }
  .sub { color:var(--dim); margin:0 0 8px }
  .meta { color:var(--dim); font-size:.85rem; margin-bottom:40px }
  .meta code { color:var(--accent) }
  h2 { font-size:1rem; text-transform:uppercase; letter-spacing:.08em; color:var(--dim); margin:40px 0 16px; font-weight:600 }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px }
  .card { border:1px solid var(--line); border-radius:12px; padding:16px; background:color-mix(in oklab,var(--bg) 92%,var(--fg)) }
  .card header { display:flex; justify-content:space-between; align-items:baseline; gap:8px }
  .card h3 { margin:0; font-size:1rem }
  .price { color:var(--accent); font-variant-numeric:tabular-nums; font-weight:600 }
  .card p { color:var(--dim); font-size:.9rem; margin:8px 0 }
  .replaces s { color:var(--no) }
  .tags { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 }
  .tags span { font-size:.72rem; border:1px solid var(--line); border-radius:99px; padding:2px 8px; color:var(--dim) }
  .card footer { display:flex; justify-content:space-between; font-size:.75rem; color:var(--dim); margin-top:10px }
  .empty { border:1px dashed var(--line); border-radius:12px; padding:32px; text-align:center; color:var(--dim) }
  table { width:100%; border-collapse:collapse; font-size:.85rem }
  th { text-align:left; color:var(--dim); font-weight:500; padding:8px 10px; border-bottom:1px solid var(--line) }
  td { padding:8px 10px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums }
  tr.ok td:nth-child(6) { color:var(--ok) } tr.no td:nth-child(6) { color:var(--no) }
  a { color:var(--accent) }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.85em }
</style></head>
<body><div class="wrap">
  <h1>ARCADE</h1>
  <p class="sub">Publish a skill or an agent as a paid endpoint on Arc. Get paid per call in USDC.</p>
  <p class="meta">rail <code>${esc(rail)}</code> · network <code>eip155:5042002</code> · ${listings.length} listing${listings.length === 1 ? "" : "s"} · ${receipts.length} call${receipts.length === 1 ? "" : "s"}</p>

  <h2>Listings</h2>
  ${listings.length === 0 ? `<div class="empty">No runners connected. Start one with <code>arcade runner start</code>.</div>` : `<div class="grid">${cards}</div>`}

  <h2>Receipts</h2>
  ${
    receipts.length === 0
      ? `<div class="empty">No calls yet.</div>`
      : `<table><thead><tr><th>skill</th><th>price</th><th>seller</th><th>fee</th><th>latency</th><th>status</th><th>tx</th></tr></thead><tbody>${rows}</tbody></table>`
  }
</div>
<script>setTimeout(() => location.reload(), 4000)</script>
</body></html>`
}
