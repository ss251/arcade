# Plan G — execution records

Task 1's local smoke scaffold, source-contract tests, pinned code generation and
WASM build passed. The later September 5 indexed-match checkpoint now satisfies
G1's deployment and known-runbook query requirement: both historical transactions
appear, with the exact filtered hash, buyer and $0.01 amount matching the runbook.
The indexer was six blocks behind the separately observed head, not proved fully
synced. G1's final evidence checkpoint committed as `eccbbc8`. G2's separately
released local schema transition is implemented with focused checks and WASM
build passed; its separate parent full test/type gate and actual build repeat
also passed. The local commit remains pending at this checkpoint. Tasks 3–6 remain
unreleased. Earlier partial/empty observations remain unchanged historical records.
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
- [Task 2 local schema brief](task-2-brief.md)
- [Task 2 implementation report](task-2-report.md)
- [Task 2 parent review and final gates](task-2-parent-review.md)
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

## September 6 — G3 local staging checkpoint

The earlier unreleased-G3 statement above is now historical. After Plan F merged
and main's gates passed, G rebased cleanly and Task 3's bounded local source was
released. The [G3 brief](task-3-brief.md) links seven historical preparation,
implementation and independent-review records. Exact inactive ABI checks and
the single-pilot renderer passed their focused selections and independent
reviews; parent's actual pinned codegen/WASM repeat also passed.

The separate complete G3 test/type gate is in progress, with final acceptance and
the atomic G3 commit pending here. No new registry source/template activation,
deployment, upload or indexed result is claimed. This is a selected G3 archive,
not completion of all Plan G execution records; G2 private preparation and raw
provenance evidence remain retained outside the public copies.

### Later G3 parent full gate

The sole complete gate subsequently exited zero: 2,941 Vitest tests /131 files,
673 Bun tests /47 files /5,138 expect calls, and root/web strict checks. This
supersedes the immediately preceding gate-pending checkpoint. The codegen/WASM
repeat also passed; final parent review publication and the atomic G3 commit
remain pending, with no new live or indexing claim.

## September 6 — G4 settlement mapping checkpoint

G3 subsequently committed as `e00cd89d1845d32660ddd5fa1ec3b181cd55a457` and parent
released G4. The [G4 brief](task-4-brief.md) links five exact historical records,
including native runtime provisioning and the independent source/runtime review.
Author and reviewer each passed 27 real Matchstick AS/store cases, 112 focused
Bun checks /240 expect calls and exact four-root strict checking. Their repeated
results are not added into unique coverage; original Red/setup distinctions remain.

Only the pilot is active, now using the real settlement mapping. One inactive V2
template compiles its real handlers without activation. No registry source,
Marketplace totals, canonical listing binding or new indexing proof is claimed.
Parent's sole complete G4 gate and final Graph build are still in progress at
this checkpoint; final parent review, publication audit and commit follow.

### Later G4 complete parent gate

Parent's sole frozen command subsequently exited zero at the 02:35:29 UTC
checkpoint: 2,941 Vitest /131 files, 675 Bun /47 files /5,148 expect calls,
root/web strict and actual pinned manifest/codegen/Graph WASM build. Totals include
retained private fixtures; the 27 native AS cases are separate. The
[G4 parent review](task-4-parent-review.md) is now the sixth exact historical copy,
with no body substitutions. These results supersede the preceding pending gate;
final publication audit and commit follow, with source hashes unchanged.

## September 6 — G5 bounded registry checkpoint

G4 subsequently committed as `f66fb5ab1d7ca70cc633e216c52513e6f776ea80`.
The [G5 brief](task-5-brief.md) records the released registry fact/replay contract
and links the exact readiness, parent decisions and integrator report. The
integrator passed 135 focused Bun tests /289 expect calls, exact four-root strict
checking and one coordinated codegen after real source drafts existed.

Mapping runtime and final independent review remain in progress at this
checkpoint, followed by the parent's one complete gate and actual Graph build.
The three registry templates stay inactive; no Marketplace or canonical listing
attribution is claimed. No deployment or paid query is performed for G5.

### Later G5 frozen acceptance

Author and independent mapping acceptance each passed 61 actual AS/store cases
(27 unchanged G4 plus 34 G5). Independent focused Bun/strict checks passed. The
sole parent complete command then exited zero: Vitest, 698 Bun /47 files /5,197
expect calls, root/web strict and actual Graph WASM compilation. The truncated
Vitest display is not used to invent a new aggregate count or rerun the gate.
The [parent review](task-5-parent-review.md) and brief preserve this later result;
final public audit/atomic commit follow, with no live or canonical-link claim.
