# H7 follow-up — integration with F and G

H7's isolated commit `974c02e` is now `616ce5e` after rebasing H onto main
`5259f9a`. The four H4–H7 patches replayed unchanged. The earlier H1–H3 conflicts
were reconciled with F's session implementation; this is not an H merge to main.
The owner's Pages fix `8b8e8e5` remains in the branch's ancestry and tree.

## Required contract

- Public receipts keep H's explicit field whitelist and F's canonical public
  session boolean, never private session or job identifiers. Canary provenance
  is independent of session provenance.
- Missing legacy settlement-kind metadata stays missing. Invalid, inherited or
  accessor-bearing metadata cannot disappear into eligible legacy absence as
  receipts pass through the hub, tree builder and web decoder. No getter is
  invoked to establish link authority.
- Only an eligible recorded EIP-3009 reference with explicit ready-network
  context can supply a transaction link. Compact descendants use their original
  root's context and their own settlement/reference values. A Gateway locator
  is not an on-chain transaction, even when it resembles a hash.
- Ordinary receipt upserts stay inside F's session exclusion guard. Selected
  session terminal evidence, durable transitions, defensive reads, fee-sweep
  exclusions and the paid-route admission order remain intact.
- H's ordinary tree capability remains a separate token realm from session
  capabilities. Unauthorized tree requests must perform no ledger reads.
- Statistics remain hub-derived until the separately gated G8 integration
  actually changes their data source. G6's indexed A9 proof does not establish
  whole-market coverage.

The integration fixtures use offline synthetic evidence. They do not authorize
payments, renew names, deploy services or replay prior one-shot approvals. H8's
listing page and the later G8 work remain separate tasks.

## Verification checkpoint

Parent's Store/session checks passed 194 Vitest tests in six files and 43 Bun
tests with 202 assertions. The two new memory/SQLite cases prove ordinary upserts
cannot overwrite session membership or terminal evidence. Their first disk
failure was an unjustified row-order assumption; a later strict check caught an
ES2023 test method against the project's ES2022 library. Both test-only issues
were corrected without changing production behavior; the final two cases passed
with 14 assertions and exact root-configuration strict checking passed.

Feed/route and end-to-end tree-provenance regressions, independent source review,
the single integrated full gate and the follow-up commit are still pending at
this checkpoint. Historical [H7 acceptance](task-7-brief.md) remains unchanged.

## Final parent acceptance

The [feed and route report](task-7-integration-feeds-report.md) records ten genuine
projection regressions, final 114 canonical Vitest tests and 19 actual offline
HTTP tests with 319 assertions. The [tree/web report](task-7-integration-provenance-report.md)
records 43 initial failures, final 205 focused tests including unchanged H7, and
exact strict checks. Earlier direct-Bun-hosted Vitest runs are explicitly
distinguished from final Node-hosted acceptance. The
[independent server/Store review](task-7-integration-server-review.md) found no
lost F safeguard; SQLite and all six H7 rendering/fixture files are unchanged.

Parent read the complete source/test changes and reports. The single full
Vitest sweep returned **3,252 passed and one failed** across 142 files. The
failure was an old fixture attempting to create duplicate receipts through an
API that now upserts. Its corrected read-boundary corruption test preserves the
original no-settlement assertions; the complete **48-test pipeline suite passed**.
No production change was needed after the integration source freeze.

The single Bun sweep returned **768 passed plus two module-loading errors**:
this worktree lacked the separately locked subgraph toolchain. Installing that
existing lock with scripts disabled let the two affected suites run: **55 passed,
111 assertions**. Neither full sweep was repeated, and neither initial result is
relabelled as an all-green invocation. Root/web strict TypeScript and actual
production client/SSR builds then passed (334 ms / 145 ms); both lockfiles stayed
unchanged. The [parent record](task-7-integration-parent-report.md) preserves the
exact repair sequence and limits.

Four historical reports are published with the standard banner and exact body
bytes, except two explicit owner-home substitutions in the provenance report.
No private research, raw browser runtime, capability or key is published. H8
may proceed after the atomic integration commit; H is still unmerged to main.
