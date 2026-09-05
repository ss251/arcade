> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H2 route integration — September 5, 2026

Local offline checkpoint after H1 commit f5ea989. Only the H2 import and seller-summary
GET branch in server.ts, new seller-summary.bun.test.ts, and this ignored report were
added. Frozen summary.ts/summary.test.ts and all three earlier H2 reports are unchanged.
H1 routes/store/feeds and H3 route/web work were not edited. No Git mutation, dependency
change, full suite, real credential lookup, external request, or payment occurred.

## Production behavior

GET `/sellers/:address/summary` accepts an exact nonzero EVM address; the existing pure
summary returns its canonical lowercase address. Zero addresses get fixed 404 before
store access; malformed paths and non-GET methods remain unmatched 404. Unknown valid
sellers receive the honest empty zero-ledger result, with no listings or invented data.
The route is deliberately unauthenticated public derived economics.

The route reads all raw listings, receipts and runners and supplies current time to
the frozen helper. It never feeds paginated or buyer-redacted public rows back into
accounting, and publishes no raw inputs. Missing inference cost and dedicated-subbuy
funding attribution remain null/partial as designed. No ENS expiry observation,
validator count, price cost, private job handle or chain proof is invented.

The named SellerSummaryUnavailable is caught inside Effect.try; unexpected pure
exceptions are normalized to that same fixed error. Effect.exit also catches store
defects without reflecting their diagnostics. All failures return only status503 and
`{"error":"seller_summary_unavailable"}`. No logging or private cause serialization is
introduced, and no paid branch is changed.

## Actual-router tests and isolation

The new Bun test doubles as an explicitly selected child-only preload. It injects an
actual in-memory Store layer with full typed Receipt, ReceiptChild, PublicListing and
Bounds fixtures, including the real public A9 dedicated subbuy/payout address pair.
Test receipts use synthetic hashes and do not represent live settlements. One root
has a real canonical flat tree hash; a second lacks inference cost; a third failed
after known inference cost. A separate seller has inconsistent accounting to exercise
the fixed503 route, without poisoning the valid seller's summary.

The child runs the production router with `--no-env-file`, an explicit small environment,
test rail and dummy local hub secret. No wallet key/provider configuration is forwarded.
External fetch/preconnect throw and are counted; all mutation methods are guarded and
counted after fixture setup. A private preload-only observation endpoint measures those
counts, not a production debug route. Native server binds an owned random loopback port.

The parent bounds startup8s, requests2s, and cleanup with TERM followed by KILL after1s
and a3s close bound. It drains/caps both child streams, emits no captured diagnostics on
startup failure, awaits the exact owned child close and independently confirms that its
origin refuses a new connection after cleanup. No shell or unrelated process control.

## Red / Green evidence

- 11:30:46 UTC: actual owned-loopback production router produced three genuine Reds:
  expected200 for known/unknown sellers and503 for malformed accounting, all returned404.
  The malformed-address/method refusal test already passed and is not a new Red.
- 11:32:04 UTC: all four Bun tests passed,35 assertions, after the route was implemented.
  Cases prove canonical mixed-case equality; complete raw-ledger counts and known partial
  costs; null funding/cost margins; actual listing provenance/liveness; unknown sellers;
  no private buyer/subbuy/job/session/nonce/future fields; no invented ENS expiry/counts;
  malformed/zero/non-GET zero-read refusal; fixed503; private job/result404; zero mutations
  and external attempts; existing H1 stats/receipts remain available; owned cleanup.
- Targeted compiler program used exact root tsconfig options and explicitly included
  server.ts plus the new Bun test: zero diagnostics. Diff check exited zero.

Focused loopback runs required the approved local socket permission; no external network
was contacted. No full-repository tests or live run were attempted. Route source/test are
FROZEN for independent review and parent-owned H2 full gates/scoped commit. The original
pure-helper limitations and dated follow-up corrections remain preserved separately.
