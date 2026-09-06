# G8 parent report — actual read-only hub routes

September 6, 2026. Root-only source and behavioral review, not an independent
agent review. Main/H code checkpoint is `1f39c34`; G now fast-forwarded onto it.

## Implemented

The real hub boot includes GraphFromEnv/GraphTag. /graph/stats uses actual decoded
index aggregates without eagerly reading Store; absent/bad Graph falls back to
only settlementCount/settledVolumeAtomic with source hub. A failing fallback is
503 graph_stats_unavailable, never empty totals or raw diagnostics. /listings
and detail attach exactly the four optional G fields, preserving C filters, E
names/expiry, H pay-test data and D identity. Missing listing returns 404 before
Graph. Existing /stats, Store.statsSource, paid/session paths remain unchanged.

A separate side-effect-free graph-routes module exports/re-exports the requested
helpers, so Node tests do not boot Bun's server. Own-scalar projection contains
provider extras/defects. Batch input max256 IDs, deduplicated; max4 simultaneous
reads, one overall 5-second bound, no automatic request retry. G7 cache/transport
bounds and configured origin are reused unchanged. A timeout can omit the whole
optional batch. No claimed per-field freshness or current-head synchronization.

## Tests and deviations

Before source changes, five actual-router tests had one pass/four failures:
three missing /graph/stats behaviors returned404; one initial catalogue failure
was a fixture trying to set Store-derived delisted state through putListing.
Corrected fixture uses three real recordPayTest failures. Re-run before source:
one pass/four genuine failures (now absent graph key plus three missing routes).
Both runs reaped the one owned child and checked its port refused.

Focused final source:17 Vitest tests passed (5.52s, includes real five-second
deadline), then five actual Bun HTTP tests /23 assertions passed (583ms).
Exact four-root strict check passed0 diagnostics. Tests cover lazy fallback,
Graph-off, malformed facts/defects/accessors, strict four-field projection,
bounded fanout/cancellation, fixed fallback503, actual G7 env/decoder wiring,
hidden-listing filter, retained detail fields and zero external/mutation counters.
Synthetic GraphQL responses are injected at fetch only; this is not live Graph
or a browser transport test. Existing Graph-off catalogue and H feeds/CORS tests
remain for the sole full gate. No seller/pay-test/session mutation was performed.

Literal source-label probing was rejected: /stats is computed from local receipts,
and G's index cannot supply active catalogue/seller/failed-call counts. Actual
index totals are separate at /graph/stats. Feedback is not automatically proven
settlement-backed. G6's live Marketplace remains historically null; no zero or
canonical listing attribution is invented. Web Graph display is not added by
this hub-only commit and remains an explicit G8 follow-up.

## Remaining acceptance

Source is frozen for the one sequential max4 full test/type/build gate, then
source/public diff/privacy/link audit and atomic commit. No keychain access,
Graph deployment, paid query, Arc purchase, production change or push occurred.

## Final frozen gate and publication audit — 22:03 IST

The sole sequential gate exited0:4249 Vitest/188 files in58.46s;872 Bun/58
files/6383 assertions in163.54s (includes retained worktree-private fixtures);
root/web strict0; client363ms and SSR208ms builds. No full repeat. Four source
hashes stayed unchanged. Scoped nine-path diff,187 public local links, privacy
and unchanged G7/Store/H stats/session/web-decoder checks passed. Final atomic
commit follows; this is local implementation proof, not live Graph coverage.
