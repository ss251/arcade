# F4 brief — constructed rail inventory and internal per-job selection

September 5, 2026. Source/tests and the three reports are frozen. The parent has
read the source, tests and reports; its F4-specific independent integration rerun
remains pending at this checkpoint. The parent reports that its repository
test/type gate passed with the frozen F2/F3/F4 worktree present. That gate neither
substitutes for the pending F4-specific review/rerun nor commits F4. Publication
review and the atomic F4 commit remain pending, after F2 and F3.

## Intent, interfaces and scope

[Plan F Task 4](../../plans/2026-09-04-F-gateway-sessions.md#task-4-a-two-rail-registry--the-rail-becomes-a-property-of-the-request)
prepares the hub to keep its ordinary root-payment default while constructing
Gateway alongside it where configured. The [work order](../2026-09-04-A-settlement-core/work-order.md)
requires genuine failing tests, preserved interfaces, independent review, full
gates and small ordered commits. This step is registry and integration plumbing,
not completed buyer sessions or live Gateway proof.

The new [registry](../../../../apps/hub/src/rails.ts) exposes `Rails.default`,
`Rails.get(name)`, immutable `Rails.names`, `RailsTag`, `makeRails` and
`railsLayerFrom`. `RailTag` and `RailsTag.default` hold the exact same default
object. Unknown names, including prototype-looking strings, return `undefined`
instead of choosing a fallback. The default wins duplicate names; the first
extra wins other duplicates. The input collection is copied and the exposed
registry/name list is frozen. This pure registry consults no environment, key
or provider.

The integration changes [server boot/discovery](../../../../apps/hub/src/server.ts),
[pipeline selection](../../../../apps/hub/src/pipeline.ts) and
[generated discovery documents](../../../../apps/hub/src/openapi.ts), with three
focused fixture/test files. It does not modify the frozen F2/F3 payment code,
store, shared core or dependencies.

## Boot inventory is not provider support

`ARCADE_RAIL` still selects the default. Boot builds that exact default once and,
only for a selected ready configuration with Gateway and a non-Gateway default,
adds one Gateway handle. A Gateway default is not constructed twice. Explicit
captured wallet, chain ID, facilitator URL and validity assertions bind Gateway
construction to the selected configuration used by boot.

An invalid `ARCADE_RAIL` now refuses with a fixed diagnostic before constructing
rails or listening. Existing static availability and live chain checks retain
their behavior. Ordinary EIP-3009 configured RPC/facilitator behavior and
per-listing splitters remain unchanged.

Health, OpenAPI, well-known x402 and skill Markdown report the constructed rail
inventory. Construction itself performs no support, RPC, deposit or provider
request; this must not be confused with a live support check or sufficient funds.
The overall boot path still retains its separately configured chain checks.

Discovery now distinguishes EIP-3009 root payments without a deposit, Gateway
payments from a pre-funded Gateway balance, and simulated test-rail results.
Gateway transfer UUIDs are not mined transaction references. The authoritative
signing domain and time window still come from the actual unsigned 402 challenge.

## Selected payee and per-job rail

An actual unsigned local Gateway challenge exposed a discovery mismatch: the
challenge paid the seller account while well-known x402 advertised the EIP-only
splitter. Discovery now uses the seller for Gateway and preserves each listing's
splitter on the EIP-3009 path. The regression compares discovery to the actual
production router's challenge, not only to a mocked expected object. No payment
was signed or submitted for that comparison.

`RunJobArgs.rail?: Rail` lets an internal caller select a rail for settlement and
receipt attribution. Omitting it preserves the injected default. Failed output
records the selected rail but settles neither handle. Tests observe actual
in-memory TestRail balances; their second TestRail is merely named `gateway`.
Those movements are simulated balance evidence, not Circle acceptance or live
Gateway balances.

F4 introduces no HTTP rail selector, `sessionId`, session routing, budget
reservation, durable accounting or new buyer authority. The plan's illustrative
`sessionId` field remains future session work. F5–8 must still implement durable
admission and held uncertain outcomes before live sessions; F4 does not make
process-local selection into crash-safe payment accounting.

## Discovery outcome-honesty follow-up

The [initial integration report](task-4-integration-report.md) is preserved as
historical. Parent review found that a retained blanket claim about failed calls
leaving the payer balance untouched contradicted
[F3's post-dispatch uncertainty](task-3-brief.md). The
[discovery follow-up](task-4-discovery-followup.md) records a genuine failing
production-router assertion and the narrow correction to two descriptions.

The descriptions now say validated output is required before submission and
definite pre-settlement refusals are not submitted. A settlement request timeout
or failure can leave an unknown outcome requiring reconciliation; it is not
proof that the payer was not charged. The fix changes discovery wording, not
payment behavior, accounting or an observed financial outcome.

## Evidence by checkpoint

The [parent-authored pure registry report](task-4-registry-report.md) records ten
missing-module Reds at 18:02:21 IST, then ten passing tests at 18:02:46. Its first
exact-type attempt encountered a concurrent F2 dependency diagnostic and is not
called a strict pass. The separate nonexistent hub-tsconfig inspection is also
retained as an inspection error, not a Vitest failure. The parent reports a
separate private independent registry checkpoint at 18:19:30 IST: CLEAN, ten
Vitest cases and exact-root-options strict TypeScript passing. That review
explicitly excluded boot, discovery, pipeline integration and live rails.

The integration worker later recorded 78 passing Vitest tests across six files:
three new rail-pipeline, ten registry, 15 original pipeline, 29 OpenAPI, 16
chain-check and five actual chain-boot tests. Its first actual-router Bun
checkpoint passed eight tests / 95 assertions. The outcome-honesty follow-up
supersedes that Bun total with nine tests / 108 assertions and repeats 57
registry/pipeline/OpenAPI Vitest tests; the other 21 earlier checks are retained
as earlier Green, not claimed as a fresh 78-test repeat. Exact root-tsconfig
programs explicitly targeting the six integration source/test/fixture files
returned zero diagnostics.

The actual boot tests run the production server/router and rail constructors
under a bounded allowlisted dummy environment with a seeded Store. Outbound
fetch/preconnect is blocked; the parent test talks only to its ephemeral owned
loopback child. Tests check construction arguments, inventory, payee agreement,
refusals and wording. Each child is reaped with bounded TERM/KILL handling and
post-stop connection refusal. The original cleanup-observer assumption about
normal Bun signal exit was corrected as a fixture issue, not a product Red.

This publication pass did not rerun tests, contact a provider, retrieve a key or
make a payment. Source fingerprints in the reports are historical checksums,
not transaction evidence. The private independent registry note is not exported
with this task, and no private handoff, journal, signature or credential is
published. Index additions are held until F3 commits; subsequent parent results
belong in the additive [progress ledger](progress.md).
