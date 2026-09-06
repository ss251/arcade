# G5 — bounded registry facts and replay-safe state

September 6, 2026. G4 committed as
`f66fb5ab1d7ca70cc633e216c52513e6f776ea80`; parent then released the bounded
[Task 5 registry scope](../../plans/2026-09-04-G-graph.md#task-5-erc-8004-mappings--agent-listing-feedback-validation-and-template-instantiation).
This checkpoint is local implementation in progress, not final acceptance or
live indexing. Parent's complete gate and final actual Graph build follow source
freeze and independent review.

## Chosen contract

One immutable RegistryEvent records accepted events and supported prerequisite or
conflict skips, keyed by transaction/log occurrence. Canonical Graph event order
and arbitrary exact replay are supported; arbitrary first-delivery reordering is
not. Unknown agents are not manufactured to repair missing history.

Registered supplies the actual nonzero owner; transfers update the recipient and
clear optional wallet authority. URI operators never become owners. A known-Agent
burn is an explicitly unsupported transition that refuses before writes, because
the required-owner schema cannot represent it truthfully.

Four bounded metadata values remain immutable claims, not canonical listing or
payment bindings. Feedback retains signed values, full-width indices and observed
revocation state. Validation retains its first request binding and updates the
pass counter by latest-state delta; PASSED is only the local 50..100 classifier.
Neither feedback nor validation counts prove paid customer service.

The single active pilot and existing inactive V2 template remain unchanged. Three
additional inactive registry templates provide real generated event types and
compile real mappings. No template is instantiated, registry source activated,
Marketplace populated or canonical Listing/Agent/Splitter relationship invented.
G6 owns separately reviewed source selection and truthful coverage.

## Verification boundaries

The integrator captured five collected behavioral schema/manifest failures before
the corresponding implementation. Its final focused selection passed 135 Bun
tests /289 expect calls and exact four-root strict checking. One coordinated
codegen passed after all four real registry source drafts existed.

The first mapping attempt instead failed during AssemblyScript compilation and
collected no behavior tests. That setup failure is not a behavioral Red. Mapping
runtime, independent review and parent complete gate remain separately pending
at this checkpoint; later dated records will supersede these statements.

No new payment, credential lookup, registry write, upload or deployment occurs
for G5. The acknowledged G1 deployment and its consumed approval remain unchanged.
See the [operator notes](../../../../subgraph/README.md) and
[execution progress](progress.md).

## Preserved historical records

- [Readiness and runtime boundaries](task-5-readiness.md)
- [Parent decisions, release and field clarifications](task-5-parent-decisions.md)
- [Inactive-template/schema integrator report](task-5-integration-report.md)

These three bodies are exact copies after the standard historical banner, with
zero body substitutions. Private originals remain unchanged. Executable helpers,
raw provenance records, wallet material and owner handoffs are excluded.

## Later frozen source and independent acceptance

The mapping author and independent reviewer subsequently each passed 61 real
native AS/store cases: 27 unchanged G4 and 34 G5 (16 identity, 11 reputation,
7 validation). These repeated runs are not additive unique coverage. Final
independent focused checks also passed 135 Bun /289 expect calls and exact
four-root strict checking. All fourteen source paths remained frozen.

One genuine diagnostic regression was captured after the initial compiled pass:
changed optional feedback text produced ignored_duplicate rather than
ignored_conflict (33 pass, 1 fail). The narrow comparison fix passed the unchanged
34-case suite. Original feedback and counter state stayed safe throughout. The
[mapping author report](task-5-report.md) and
[independent review](task-5-independent-review.md) preserve exact chronology.

These bring the archive to five exact historical bodies with four total literal
runtime-location substitutions. Parent's sole full gate and final Graph build
are running; no final result or commit is inferred from focused acceptance.

## Final parent complete gate and local build

The sole frozen full command subsequently exited zero: Vitest succeeded,
698 Bun tests /47 files /5,197 expect calls passed, root/web strict checks passed,
and the actual Graph manifest/codegen/WASM build passed. The Vitest aggregate
display was truncated in the captured chunk; no exact new total or repeat gate
is claimed. The 61 native AS cases remain separate from repository totals.

Graph compiled the pilot, reused its WASM for the inactive V2 template, and
compiled all three real inactive registry mappings. This does not activate or
deploy them. The [parent review](task-5-parent-review.md) is the sixth exact
historical copy, with zero body substitutions. All fourteen source hashes remain
frozen. Final publication audit and the atomic G5 commit follow.
