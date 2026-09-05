# H4 brief — bounded read-only web data

Add the planned market stats, listing receipts, seller summary, private tree and
ENS-name reads using the existing hubJson transport. Preserve the actual H1/H2/H3,
D and E response contracts and monetary nullability. Explicitly project public
fields; do not spread future private receipt or capability data into the web app.

Keep 128 KiB response bounds, redirect refusal, cookie omission and the ten-second
whole-response deadline. Only listing detail receives the approved 25-second
bound for its existing sequential ownership/evidence calls; the unsigned payment
challenge stays at ten seconds. Preserve the quote, signing and relay authority.

Private tree capability is canonical, header-only, no-store and no-referrer, with
fixed failure diagnostics. ENS outage is not expiry; only the exact typed 404 is
expired. Identity counts come only from pinned, verified, fresh nested evidence.
Unknown costs and margins remain null plus known subtotals, never fabricated zero.

Formatting helpers are pure and browser-safe. Unknown dates remain unknown;
future dates stay explicit. Explorer links require known ready chain context and
appropriate reported settlement evidence. Neither an announced registration hash,
a Gateway transfer nor a recorded tree digest is independent mined proof.

Require genuine Reds, contract-shaped legacy fixtures without weakened assertions,
actual owned two-origin transport/cleanup checks, exact nested TypeScript checks,
web build and independent review. No component/style redesign, new transport,
real provider, key, live hub, payment, dependency or deployment change.
