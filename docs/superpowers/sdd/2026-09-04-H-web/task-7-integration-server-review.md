> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H rebase: independent hub/server/store source review

Date: 2026-09-06. Verdict: **CLEAN within the bounded source-comparison scope**; no actionable rebase defect found.

Parent identifies the reviewed integration as H7 `974c02e` rebased onto main `5259f9a`. Those revision labels are parent-provided, not independently queried with Git. I read the complete current preflight note (`e51439c3884dbe2181c21bcbae8cc96c963114e4eb6714bf89d1c55df5e147c0`) and compared the actual MAIN and H worktree files using filesystem `diff -u`. I inspected the changed blocks and their F authorization, construction, persistence and projection context. The review skill's source/checklist guidance was used; its Git, testing, telemetry and mutation steps were excluded by the explicit task boundary.

## Observed delta and preserved safeguards

- `server.ts`: the complete main-to-H diff is limited to H projection/helper imports, the `/listings` additive catalog evidence, GET listing receipts/statistics/seller summary/tree routes, and `/receipts` using the explicit public scrubber. No paid pipeline, boot check, rail construction, session admission, layer wiring or ordinary private-result block was changed by this diff.
- `/listings` (line 914) keeps both existing delisted and ENS-expiry filtering. Its new `payTested` is derived from the already-read record; absent history is explicit null, the compatibility `jobId` is the empty redaction, failed/zero/malformed transaction references are omitted, and no explorer link or new chain/runner/detail read is introduced. The delisted boolean is derived from that same record, not a new authority.
- The selected chain snapshot, invalid/unavailable-rail preflight, RPC override, per-listing facilitator policy, and registry construction are intact (lines 97–112, 239–305). The default remains the selected existing rail; the extra Gateway is built only for a ready selected config with a Gateway. `RailsTag` and the shared Store/attestation layers remain wired as before. No new boot network work was added.
- Signed-runner registration retains observed `splitterFeeBps` and `splitterNetwork` beside the verified splitter/version fields (lines 699–715); the `ListingRecord` declarations are unchanged. No global fee assumption replaced these observations.
- The configured-secret versus generated fallback distinction remains intact (lines 461–470). Both session handlers execute before ordinary `/x` and `/jobs` routes (lines 789–792). Context inspection confirmed durable/configured admission, header-presence refusal, canonical ASCII comparison, query-token rejection in the session lane, and the separately domain-bound session job capability. Filesystem comparisons also found `server-sessions.ts` and `server-session-calls.ts` byte-identical to MAIN.
- Ordinary `/jobs` and `/jobs/:id/result` still authenticate before their private Store reads. Their legacy token source is deliberately unchanged; it is not a newly introduced session query-token fallback. The session result path still uses the selected validated `getSessionTerminal` pair, not a later global Job read. F14's `receiptExplorer` and `receiptChildExplorer` remain on ordinary private result fields (lines 1340, 1346).
- `/trees` is a bounded GET-only, root-token-authenticated route before its ledger read, with fixed 404/503 and `private, no-store` on every response from that branch (lines 1354–1375). Its inherited ordinary capability domain cannot be satisfied by the new session job capability. Seller summary uses the complete raw local inputs and catches both Store defects and accounting refusals into its fixed 503; its zero-address check precedes reads. Statistics explicitly reads `store.statsSource`. Projection/decoder internals and expanded route fixtures belong to the parallel reviewers, not this source-only acceptance.
- `store.ts`: the only differences are the `statsSource` interface/value and the ordinary receipt upsert. The upsert is **inside** the unchanged `r.sessionId !== undefined || s.sessionCalls.has(r.jobId)` exclusion guard (line 402), retains the first existing position, removes duplicate occurrences of only that ordinary job, and preserves all unrelated receipt order. It does not add a new session writer.
- The same selected-state terminal validation, canonical IDs before read, pending/uncertain handling, defensive Job/Receipt copies, compatibility receipt projection, and atomic memory transition/rollback remain intact (lines 242–298). Session-member defensive public reads and fee-sweep exclusion are unchanged (lines 394–424). This review does not claim that legacy ordinary receipt references gained defensive cloning.
- `store-sqlite.ts` is byte-identical to MAIN. Context inspection confirmed current selected-session transactional reads, bounded indexed joins, receipt/Job evidence correlation, current-disk ownership checks, and ordinary-write/fee-sweep session exclusions. It inherits the new `statsSource: "hub"` through `...inner`; no query, schema, migration or backend-source override was added. Existing ordering remains unchanged: SQL ordinary hydration order, session receipt ordering and canonical session helpers were not modified. The H memory upsert's original-position behavior is the sole intentional ordering change in the three-file delta.

## Exact reviewed source inventory

| Path | MAIN SHA-256 | Rebased H SHA-256 |
| --- | --- | --- |
| `apps/hub/src/server.ts` | `533f80fe8a6af49214bad0c778b2cd93188dae1f24d208ed2abfffba9aedc6f2` | `5362e18f456cb843f2d9452cabc9385e897d84de77b1f1e4f08d63421a50b519` |
| `apps/hub/src/store.ts` | `ce1649dac5d9c809b45efaa02d4741db3172c10036afa3ef78ffa6077d1a2e55` | `46f8e30a643cae99afe97606876b03d34887079741d0615e64372cdb24393617` |
| `apps/hub/src/store-sqlite.ts` | `97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a` | `97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a` |

## H7 preservation

All six actual current file hashes match the original H7 inventory in `internal/task7-parent-report.md` exactly:

```text
f71e9702a2efdc1ca93a1e319ecde86717ae91e3aceb8c0f4b853d2ab51b39cc  apps/web/src/components/tree-graph.tsx
503918fda8fa025914270aac9defcc1e8e57d838018c22eda92dd8d07770b1ad  apps/web/src/styles.css
3505068621267764678f7293ff2e843e7eacc3305a9fcea0ab628f90ae4a844c  apps/web/test/tree-graph.test.tsx
4edac462f5b75b30213a14922972a2500c188687af6c63245734be6f9c0c71e5  apps/web/src/lib/tree-layout.ts
a737ea079cf44d5f83b5f3322df3c87488149861a98288cae5f54653d921f18a  apps/web/test/tree-layout.test.ts
1aa87050123bfae9d62fb5f7f52e3c780552b1d449891bd66d03c2504050076f  apps/web/test/fixtures/tree-server.tsx
```

## Limits

No product tests, compiler, build, browser, service/child fixture, network, live action or Git command was run. Only this private report was written. The complete source diffs and selected reads support preservation, not behavioral execution, fresh runtime acceptance or a new full-suite result. Parent-owned Store regressions/full gates and the disjoint feed/fixture and tree/web reviews remain separate evidence. No source correction is requested from this review.
