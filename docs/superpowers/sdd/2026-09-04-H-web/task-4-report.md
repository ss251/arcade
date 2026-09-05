> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H4 — read-only web hub client and formatting helpers

2026-09-05. Implemented in `feat/h-web` after H1–H3 were committed at base `46d8e1a`.
This report covers code and offline fixtures, not a live hub, purchase, production deployment, indexed statistics, or independent chain proof. No keys, Keychain, real provider, public RPC, payments, Git staging/commits or full-repository suite were used by this agent.

## Owned changes

- `apps/web/src/lib/hub.ts`: additive read-only fetchers and strict decoders; original quote function unchanged.
- `apps/web/src/lib/hub-decode.ts`: explicit public interfaces/projections for current H1/H2/H3/D/E contracts.
- `apps/web/src/lib/format.ts`: pure display helpers, explicit network/evidence context for links.
- New `apps/web/test/hub-client.test.ts`, `format.test.ts`, `hub-client.bun.test.ts`.
- Six explicitly approved old fixture adaptations are documented separately in `internal/task4-compatibility-followup.md`.

No edits to hub/server/store, shared `hub-http.ts`, purchase/signing/relay/quote routes, styles, components, package files or dependencies. `.superpowers/` was already untracked and is untouched. The two formatter files were delegated within this exact scope, then independently reviewed; the integrating agent added genuine accessor/prototype regressions and fixes before final freeze.

## Contract and safety decisions

The existing server-only `hubJson` remains the only transport. New calls use GET and fixed validated paths. It continues to reject redirects, omit ambient cookies, bound headers plus complete body, refuse malformed UTF-8/JSON and enforce the unchanged 131072-byte limit. Detail alone uses the approved 25000ms argument for D's sequential 5s owner plus 16s evidence reads. Other feeds and the unsigned 402 challenge remain 10000ms. No retry, request-controlled origin, key or alternate signing path was added.

`tree` accepts only the actual canonical root handle and 32-lowercase-hex token, placing the token solely in `x-job-token`, with no-store and no-referrer. Invalid arguments fail before fetch. A 404 is unavailable/not authorized, not an empty tree. Pure decoders reconstruct objects without spreading a raw response; no buyer, child job/session IDs, nonce, signature, ancestry, raw diagnostics, engine, secret names or future private fields are returned. Public C pay-test job handles remain the existing separate contract, including an empty handle for jobless failures.

Money stays canonical bounded atomic strings and exact `formatPrice` display pairs. Seller summaries preserve null costs/margins, negative margins, known subtotals and completeness booleans, checking their accounting relationships instead of filling missing values with zero. Per-listing receipt limits truncate/clamp finite numbers to 1–100 and default invalid numbers to 20, matching H1. Feed membership/order and row limits are checked. The overall feed remains bounded by the existing transport and a 10000-row decoder ceiling; no body-limit increase is hidden here.

Receipt children stay flat descendants. H3 nodes retain positional IDs and validated parent/hop structure, at most 256 nodes and 16 edges deep, with unique fixed evidence flags including reservation-unresolved. A supposedly complete tree requires recorded digest/budgets and coherent committed settled-descendant sum. This checks local consistency, not on-chain commitment mining. Gateway UUID/test locators can remain plain locators, but cannot become per-call explorer evidence. Unknown/raw reasons become fixed public categories.

D evidence is flattened only from a validated nested object with ready known chain/pinned identity registry. Counts require verified true, stale false, all three bounded integers and passes ≤ reads ≤20 / feedback ≤4096. Forged top-level fields are dropped. A registration transaction is still announced metadata, not a verified mint receipt. No absent splitter version is invented. Nullable detail ENS/pay-test fields are preserved. `/names` validates exact requested name, own-hub endpoint, seller/skill/payee and known ready chain; priceAtomic is nullable. Only exact typed `404 ens_name_expired` becomes EnsNameExpired; other 404s, malformed responses and 503s remain fixed HubUnreachable.

Formatters load explicit chain manifests directly, avoiding the core barrel's eager environment-selected chain. Links default to null. Transaction links require a full nonzero hash plus own-data context declaring a ready known network, EIP-3009 and settled true; this is reported context, not independent mining verification. Addresses need a full nonzero value and explicit ready network. Unknown/pending/Gateway/test contexts do not create links. Accessors and inherited context are refused without execution. Shortening is display only; missing/unsafe timestamps are unknown, future timestamps explicit, and 30–59 seconds never becomes 0m ago.

## Failure-first and focused evidence

Times below are the observed local IST test-run timestamps on September 5, 2026.

- 17:50:10: formatter Red, 13 collected/13 missing-module failures; 17:51:12: 13 Green.
- 17:51:02: client Red, 52 failures. These included absent new APIs, actual leakage from existing raw receipt casts, acceptance of forged flattened identity fields, missing required listing validation, and the 15s detail failing the old 10s deadline.
- 17:57:12: 65 new client/formatter tests Green.
- 18:00:10: six additional genuine Reds: inherited context incorrectly linked, three getter fields threw a private sentinel, incomplete complete-tree budgets were accepted, and a legitimate Gateway tree locator was dropped. Fixed narrowly; 18:01:17: 71 Green. The Gateway locator fixture uses a dummy UUID, not a live transfer.
- 17:58:08: old compatibility tests failed 56/82, for abbreviated fixtures and a listing-stage rather than challenge-stage timeout; the six approved fixture updates restored the original behavioral assertions. See the follow-up for exact paths and V4 typed mock correction.
- 18:08:53: final combined eight-file Vitest checkpoint: 153 passed, exit0. A later final checkpoint rechecks the frozen dummy-locator fixture bytes.
- Actual Bun fixture: first run 2 pass/1 failure because Bun recycles a completed Request object's URL. This was fixture construction, not a product Red. The fixture now snapshots URL/method/headers inside the handler. Rerun 3/3 passed, 26 assertions, exit0: header-only dummy capability, no delivery to a second owned origin on redirect, actual oversized body refusal, fixed unknown-capability error, and both owned listeners independently unreachable after stop. No child process is involved.
- Web project tsc and production web build passed. Exact root-options nested Bun check passed. Exact web-project options, all project/module-augmentation files and all eight changed/new nested Vitest test targets passed after the separately documented V4 mock correction. Root `tsc --noEmit` and diff check passed. An initial custom strict invocation from repository root omitted web-local type roots and generated route augmentation; rerunning from the actual web project fixed that checker setup rather than changing production types.

The TypeScript-testing skill influenced the real failure-first, capability-delivery and awaited-cleanup assertions. No UI was changed, so no screenshot/design verification is claimed. Root retains independent review, full-suite gates and commit ownership.

## Review limits

The HTTP test owns two random loopback listeners with dummy data; it tests this client's real fetch behavior, not a production hub or mined transaction. No subgraph, ENS ownership, Gateway batch, registration or settlement is independently verified by these web reads. Existing paid quote/signing/relay tests are preserved and green; an already-issued signature is not revoked by any read error. The fixed transport limits can truthfully refuse a large feed; pagination/body expansion is not implemented here.

## Final freeze

18:12:27 IST: exact final eight-file Vitest rerun153/153 passed; final web build exit0.
Source/test ownership is exactly the twelve files below; the two new private reports
are not for staging. No owned listener/test subprocess remains running.

SHA-256 fingerprints (source checksums, not chain transactions):

```text
506b21a5585be87fc2b4523fa9d2fb686bbef2fa1f60fa49bff0b48afc1abb99  apps/web/src/lib/hub.ts
7c90180e386f7599521bea71e29ff6a979f015638c500b7e44dd09b18a20e0d9  apps/web/src/lib/hub-decode.ts
dc42a2645802908226f3b3a464c9b693322fbec99f1261dbd6b69b7f6585a8eb  apps/web/src/lib/format.ts
041281de4d85aaf07b791c27636e79babf26fa4f31f61adee2a030b41510481f  apps/web/test/hub-client.test.ts
2869b3eb035433241ecbeca572788e0a67144e40cbffd6d11b954250e5b0b082  apps/web/test/format.test.ts
273b15095d84e72a44f39bf7646e4cc5c8de63fa50f36b29b832ea18e2bab8f6  apps/web/test/hub-client.bun.test.ts
1c9c3d343bbea744eec91ed44665d95df106f2fe5d367fabd61c0c2d63b5425a  apps/web/test/quote-ens.test.ts
bfa9952c02c4af78b8602e67521fcdb3a2841fe3d36cd5e99d23687694586b60  apps/web/test/quote-routes.test.ts
405fecce08a9f02e664ec1bd654c34908659b525977ce6e085917b3249c45184  apps/web/test/purchase.test.ts
5f4f18f573bcf525004f5bf7f264997d8285885111e41d8ec1f229841b330cb2  apps/web/test/figures.test.ts
e59c4a1e10d993178c492f767726343e025c4d953245d858499ab5dc49aa71ed  apps/web/test/tools.test.ts
bfd365531f85ddaf0c7babf0cee27609b1847f0eab5a49c5c7f5873cf91c8d6c  apps/web/test/tool-calls.test.ts
```

FROZEN for parent-owned independent review; no more edits without a review request.
