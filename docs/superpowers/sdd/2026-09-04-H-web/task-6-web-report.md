> Sanitized historical H6 web execution record, September 5, 2026. Original retained unchanged; only this banner and recorded private-runtime identifier/path substitutions differ. Author observations and checks remain historical; subsequent parent gates and independent review are recorded separately.

# H6 marketplace web implementation — September 5, 2026

Status: author source/test freeze; parent review, full gates and commit remain separate.
Base: H5 commit `031d6c9`. This report covers the seven web files below, not the
parent-owned hub catalogue projection or its independent tests.

## Contract and scope

- `/` now renders the actual marketplace. `marketData` reads `listSkills()` and
  `stats()` once in parallel through unchanged H4 and returns independent nullable
  results plus fixed `listings_unavailable` / `stats_unavailable` codes. One good
  feed survives the other failing; unavailable data is never converted to zero.
- `ListingCard` distinguishes absent pay-test metadata (unknown) from explicit
  null (no recorded history), passing from failed observations, missing call
  statistics from zero recorded calls, and future/unavailable observation times.
- Prices and totals use decoder-validated exact display strings. Totals explicitly
  say recorded, identify their hub/subgraph source, and explain that records can
  include test and hub-owned canary traffic. Stored listing counts need not equal
  the filtered visible catalogue. No customer-demand or independent chain proof.
- Catalogue ENS names remain annotations, not independently verified resolution.
  Explicitly expired names fall back to the service name and remain labelled;
  expired/delisted cards have no detail link. Ordinary native `/skill/<id>` links
  are informational future H9 links; that page is not implemented by H6.
- No pay-test explorer link: its reference lacks rail/network authority. No extra
  receipt/detail/statistics fanout, guessed rail, private job ID or diagnostics.
- One serialized server observation timestamp stabilizes SSR/hydration ages.
  Router request cancellation is passed to the real server function; H4 retains
  its own finite reads. This does NOT claim immediate upstream fetch cancellation.
- Styles are marketplace-scoped and retain warm tokens, semantic money/status
  colors and visible focus. Market height/scrolling does not alter chat's chain.
  Frontend-design/web-design and ts-testing informed these choices and the actual
  rendering, partial-state, privacy and lifecycle tests.

## Genuine Reds and final checks

1. `2026-09-05 14:43:47 UTC`: new card suite failed collection because ListingCard
   did not exist; real Start `/` route assertion observed zero list/stat calls
   instead of one each. Two failed files, one executed failing test. Owned child
   cleanup completed. No production implementation preceded these Reds.
2. First implementation exposed the root Vitest alias limitation; switched the
   component's runtime formatter import to the existing relative-import pattern.
   Exact optional-property checking also corrected a test to use true field
   absence, not explicit undefined. First 30 focused tests passed at 14:47:31 UTC.
3. Real 390px browser inspection found a valid long name/large price collapsed the
   title grid track to 0px. Persisted CSS regression genuinely failed at 14:54:29
   UTC. Capped the price track with `fit-content(40%)`; 13 card tests passed at
   14:55:11 UTC. Final isolated browser measured a 172.8125px title track and no
   horizontal overflow. Supplemental opaque-reference cases passed initially and
   are coverage additions, not claimed new Reds.
4. Final `bun --no-env-file x vitest run apps/web/test`: **245 tests / 19 files**
   passed at **14:59:07 UTC**, session [author focused-web run], exit 0. This includes unchanged H5,
   E13 and H4 web tests; it is not a full-repository gate or the hub Bun suite.
5. Exact web compiler options plus all four new nested test/fixture files: zero
   diagnostics, session [author exact-strict run]. Actual installed Vite client AND SSR build with
   `envDir:false`, `--no-env-file` and allowlisted environment passed, session
   [author client-and-SSR build run]. Generated route tree stayed byte-identical to H5. `git diff --check` 0.

## Actual owned visual evidence and cleanup

Used installed Chrome for Testing, fresh owned temporary profile, loopback-only
CDP binding through the documented browser harness, and the real Start fixture
`apps/web/test/fixtures/market-server.ts`. No shared browser profile, auth setting,
provider, payment, model call, key retrieval, installation or cloud browser.
The supervisor/browser checks were finite inline commands, not a separately
retained executable; the real fixture and automated route lifecycle test are saved.

Final artifacts: `[private final screenshot directory]`. Inspected all eight final screenshots:

| Image | SHA256 |
| --- | --- |
| ok-desktop-light.png | ba57d345f2d3877cb40cf3ffc799d833d570e4242ec4a380777199fbcdf61153 |
| ok-mobile-light.png | 24925d5ecc5a36cb8afa93166aa650066904c97fd7c0814a78fa53390c27f612 |
| ok-mobile-dark.png | 80e82cfe386ac26e02bca6edea9c573e4a5822940020e01c67dacb2dd64ebbf5 |
| stats-down-mobile-dark.png | 421b843c884e722ffcb4eed5c24f39f9260350ad758ebbfe2144c9c7457ccd86 |
| listings-down-mobile-dark.png | ede7a059e4f4966e220520542ffb5bac220398f7ae20e44dcdeba0c22f5c4dab |
| both-down-mobile-dark.png | f7f5dc7eff6496063436bd44086ed4b26824cd99bc5d55a56718315a86257235 |
| empty-mobile-dark.png | a8af6f9a2fb050f7bec37683c8e3dce0bc8b34a309049abdfcc82d0534403e17 |
| long-mobile-dark.png | b54e085c08a73ee2cac02b2aaafe5aa47825efdb61d2930939c0ece9ae58f90c |

Desktop: 1280x900, document/scroll width 1280. Mobile: 390x844, width/scroll width
390 for populated, long, either single-feed failure, both failed, and empty states.
Keyboard Tab showed a visible outline. An actual detail click reached
`/skill/diff-triage` and the existing not-found page, honestly confirming H9 pending.
The pre-fix Red image is `[private pre-fix screenshot: long-mobile-dark.png]`.

First owned supervisor (PID [first owned supervisor]/session [first owned run]) exited 0 at its finite fuse;
a subsequent attempted browser read failed because CDP was already closed and is
not counted as Green. Final fresh supervisor (PID [final owned supervisor]/session [final owned run]) exited 0
after explicit stop and awaited Chrome/web/fixture cleanup. Private harness daemon
and tab were closed. Both runs' web/hub/CDP ports [owned web/hub/CDP listeners] were
unavailable after cleanup; no owned service is intentionally retained.

## Frozen source fingerprints

| File under apps/web | SHA256 |
| --- | --- |
| src/routes/index.tsx | 892d72b656d83b2fca9157c1f76d6f861a87241c624128b58604873483959719 |
| src/components/listing-card.tsx | 06c4d31e042dd38d01c320ff2db25a7140fbf6855d5d5652e762d6fd27cd8031 |
| src/styles.css | 2b74eee40efb6f1399fb59db89c5dc994f6f9d94a923baf8b0972b3f849d5e6d |
| test/market.test.tsx | e494a2bae874590c9f2bf9c6920271e41bafbe3012307843911793b7fc696c18 |
| test/market-route.test.ts | 020464aecfde9495b391412707951a3dd793a9066f4dd78acb7303a84ec30730 |
| test/fixtures/market-data.ts | 32372e52fb5bc5fdbb5ed8e7f43b7b04c9d47368090e013f5f18c8353f5ff468 |
| test/fixtures/market-server.ts | 7c0adc3dca40c5b32011a9df0c6cbdc1db2da4a8f3985912eefb79e3f0c6d07d |

Chat route/component, Confirm, Nav, Sidebar, existing Confirm ENS tests and route
tree are unchanged. No H4 signal/transport, dependency or hub source was changed
by this author. No live hub/settlement evidence or full-marketplace completion is
claimed. Parent owns the separate hub change, independent review, public record,
full gates and commit; all web source/tests are frozen.
