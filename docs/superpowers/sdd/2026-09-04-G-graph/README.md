# Plan G — execution records

Task 1's local smoke scaffold, source-contract tests, pinned code generation and
WASM build passed. The later September 5 indexed-match checkpoint now satisfies
G1's deployment and known-runbook query requirement: both historical transactions
appear, with the exact filtered hash, buyer and $0.01 amount matching the runbook.
The indexer was six blocks behind the separately observed head, not proved fully
synced. Tasks 2–6 local work awaits parent review, full gate, commit and explicit
release. Earlier partial/empty observations remain unchanged historical records.
This worktree must not merge ahead of Plan F.

- [Approved plan](../../plans/2026-09-04-G-graph.md)
- [Design specification](../../specs/2026-09-04-ethonline-continuity-design.md)
- [Original work order](../2026-09-04-A-settlement-core/work-order.md)
- [Original Task 1 local brief](task-1-brief.md)
- [Local implementation report](task-1-report.md)
- [Dated Task 1 partial live brief](task-1-live-brief.md)
- [Historical private-runtime implementation report](task-1-live-runtime-report.md)
- [Runtime security review and superseding correction](task-1-live-runtime-review.md)
- [Independent keyless deployment/indexing observation](task-1-live-evidence-review.md)
- [Parent publication review and later indexing checkpoint](task-1-live-parent-review.md)
- [Final indexed-runbook-match brief](task-1-indexed-match-brief.md)
- [Exact later indexing and Arc-head observation](task-1-later-indexing-review.md)
- [Final indexed-match parent review and gates](task-1-indexed-match-parent-review.md)
- [Task 7 brief](task-7-brief.md)
- [Task 7 implementation report](task-7-report.md)
- [Task 10 brief](task-10-brief.md)
- [Task 10 implementation report](task-10-report.md)
- [Task 11 brief](task-11-brief.md)
- [Task 11 implementation report](task-11-report.md)
- [Task 12 brief](task-12-brief.md)
- [Task 12 client report](task-12-client-report.md)
- [Task 12 runner report](task-12-run-report.md)
- [Task 12 integration and unsigned observation](task-12-integration.md)
- [Task 13 brief](task-13-brief.md)
- [Task 13 implementation report](task-13-report.md)
- [Task 14 brief](task-14-brief.md)
- [Task 14 original report](task-14-report.md)
- [Task 14 bounded-envelope follow-up](task-14-followup.md)
- [Task 14 correlation and runtime review](task-14-review-followup.md)
- [Task 14 fixture cleanup follow-up](task-14-runtime-cleanup.md)
- [Task 14 parent integration and exact strict check](task-14-integration.md)
- [Counterparty skill guide](../../../../skills/counterparty-graph/SKILL.md)
- [Progress](progress.md)
- [Subgraph operator notes](../../../../subgraph/README.md)

Only reviewed execution artifacts are published. Private research, credentials,
owner handoffs, runtime state and internal executable helpers remain excluded.
Historical pending statements are superseded only by dated evidence, not rewritten.
