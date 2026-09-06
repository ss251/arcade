# H11 seller dashboard — parent report

2026-09-06, after `65e38c0`. Root implementation/self-review only under the
owner machine-load restriction; no independent or parallel reviewer is claimed.
[Brief](task-11-brief.md) preceded source. The [historical readiness correction](task-11-readiness.md)
explains why the literal sample cannot be copied against current H2/H4 contracts.

## Implemented boundary

/seller selects a public nonzero address in its URL and performs one bounded H4
summary read. Unknown own input is validated without coercion/accessors; known
scalar fields are projected then revalidated before Start serialization. Missing,
invalid and unavailable have distinct fixed states, not raw errors. A summary
for an old selected address is hidden while a newer address is current.

Six totals retain null, actual zero, negative/loss, known partial subtotals and
completeness flags. Failed-job inference is included. Listing margin per settled
call labels its actual denominator; historical totals survive absent listings.
Hub/test/canary figures are not marketed as customers, wallet balances or
independently reconstructed on-chain cash flow. ENS/runner/identity claims stay
hub-reported, including agent #0 and missing expiry. Contextless public hashes
are unlinked; no rail/network or registry evidence is invented.

The optional address helper requests accounts only on a click, bounded to15s,
with strict response shape, fixed rejection and abort/late-completion protection.
Typing, newer URL selection and unmount invalidate the form owner; no automatic
wallet, signing, chain switch or payment. Existing native controls/ARCADE design
tokens, append-only scoped CSS and complete readable references follow the
frontend/browser skills. No H2/H4 accounting/transport/decoder, recovery or signer
change, new dependency, production configuration or secret is needed.

## Verification chronology

Missing-module collection failures were setup-only, not behavioral Reds. Initial
32 data/address checks passed17:22:43;43 focused passed17:27:26. A new stale-address
presentation regression genuinely failed17:28:12; explicit selected-address
correlation hides old totals. Later44 logic/presentation tests passed17:36:28.
The same run failed actual route setup on Start's canonical empty-query redirect.
The test now permits exactly one matching owned-origin/path redirect, no external
redirect. A second fixture failure exposed its control endpoint behind Start's
catch-all; controls moved to the separate synthetic hub. Final13 tests/2 files
(route plus presentation) passed17:38:23 in1.85s, including actual route variants
and fixture shutdown. No full gate had been run during these corrections.

Exact nested strict initially caught a fixture assigning undefined to an absent
optional property; deleting the fields matches the actual contract. Final10 web
and2 fixture roots each reported0 diagnostics. The [native check](task-11-native-check.md)
passed16 final cases on actual Start hydration. Four captures read and all20
owned PIDs/9 distinct ports verified stopped. Fixture/control/driver failures are
retained separately from the genuine stale-address behavior correction.

Before the sole full gate,26 previous Chat/buyer/recovery source fingerprints
match; the complete65e38c0 stylesheet prefix remains intact. Generated routes
only add seller. Twelve H11 source/test/fixture pins were frozen before the full
gate; its outcome and one obsolete navigation-test correction are recorded below.

```text
945c35cdd92dd41b263c25cebf230854622d0e297a2acd680438a996ec3b6d77  apps/web/src/lib/seller-page-data.ts
5a0c2f77e0d8d386f68464015a749d6e0456bb8f55389249de0974a603454e83  apps/web/src/lib/seller-address.ts
d40465d052b576e389409ccb73619c4ebeb68ccb402e92d65a9b44d5c85f7296  apps/web/src/components/seller.tsx
9a9d2f4e543b680622152927f41d4ab3e31924b59a4c1afa1f8659f696e7581a  apps/web/src/routes/seller.tsx
a093041e4ad4cffc7a74a30707e3a5a00ee31e330d111aaf8a5625169baab7c4  apps/web/src/styles.css
e6ce147404d243b430c46424655cfdde56e02cfc6a840180a5b0152ccb41d0f1  apps/web/src/routeTree.gen.ts
276d87ed4a626ebbeda5ef61abdbcfe5d81a4ab818734639256db1b1f4fee03a  apps/web/test/fixtures/seller-data.ts
90a549c056dc5617140eee856a0ba44981928556fa9ef6b7e93ee5c95d216b06  apps/web/test/fixtures/seller-server.ts
aa22e04db86f8659be9913f1dae81e655d12d664a49794f61d352e49af61e15e  apps/web/test/seller-page-data.test.ts
f3088f24372c3339e9caeb290adc22977a7f6d9fcd43d35ad6902d1ef89137e7  apps/web/test/seller-address.test.ts
cd5629c04dc99f1ca86d5b08687ff4626c7820754df9f05d37a9a5f3e4904525  apps/web/test/seller.test.tsx
50e26c06a522329c69892185e96d207d3f5998883873c054de70f73e2ada7403  apps/web/test/seller-route.test.ts
```

## Sole gate and targeted recovery

The sole full Vitest sweep53132 passed4,012 and failed1 test across171 files
in52.07s. The failure was the H5 navigation test's obsolete expectation that
/seller is404; Start now canonicalizes that actual H11 page. Changed only its
unknown-route probe to /__missing-route, preserving the404 assertion. Targeted
navigation+seller route tests passed2/2 at17:50:16 in2.11s. No second full Vitest
sweep or production-source change. The additional test fingerprint is
18a8a24c52fafc545dae25ce26caf5e2a09d14874ef2f09b3c2cb322ebc2b054.

Not-yet-run stages31049 then exited0 at17:54IST:834 Bun tests/54 files,
6,091 assertions/163.45s; root and web strict TypeScript0; client349ms/SSR166ms.
Final self-audit passed39 source/test pins,104 public local links, the complete
prior stylesheet prefix and historical readiness text (terminal blank lines
normalized only), with no selected privacy findings. No simultaneous gate,
browser or independent reviewer. This records targeted recovery from the sole
full sweep, not an invented single all-green Vitest run.

No live wallet, payment, chain proof, keys, production ENS re-point, mainnet flip
or push. H12–14/H merge, deferred G8/G9, vendor-neutral tasks and PlanI follow.
Ordinary buyer recovery is implemented; durable session recovery remains an
explicit separate gap rather than a fabricated budget/spend view.
