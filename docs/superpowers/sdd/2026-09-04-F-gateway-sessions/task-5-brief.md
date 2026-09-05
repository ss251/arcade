# F5 brief: durable session accounting foundation

September 6, 2026. F5 implements and reviews the local accounting foundation for
Plan F. It does not expose session HTTP routes, invoke a live rail or complete
F6–12. The parent replacement repository gate passed; public-copy review and the
atomic commit remain pending at this publication-preparation checkpoint.

## Task and approved adaptation

The [work order](../2026-09-04-A-settlement-core/work-order.md) requires small,
reviewed, individually gated tasks and public spec-driven-development artifacts.
[Plan F Task 5](../../plans/2026-09-04-F-gateway-sessions.md#task-5-the-sessions-table-and-store-methods)
starts session persistence after the F1 live gate and F2–4 rail boundaries. Its
illustrative memory-first mutable upsert and process-local holds could not safely
retain uncertainty after settlement dispatch. The implementation therefore follows
the recorded [parent decisions](task-5-parent-decisions.md), not those unsafe
illustrative snippets. The original plan is preserved as historical context.

The foundation uses a shared pure accounting kernel and exactly two new SQLite
tables: sessions and session_calls. It atomically admits a queued Job with its
reservation, and commits a terminal Job, immutable Receipt, call state and spend
together. SQLite reads current disk and commits before returning a result. The
memory Store follows the same transition rules. No unrestricted putSession API
can replace identity or reset spend.

The Store API provides openSession, getSession, allSessions, getSessionSnapshot,
reserveSessionJob, beginSessionSettlement, finishSessionJob,
markSessionUncertain and closeSession. Semantic authorization retries retain the
original immutable Job; only a newly proposed ID and queue timestamp are ignored,
and a conflicting proposed ID still refuses. A claimed settlement barrier is a
one-time permission, not an idempotent permission to send again. Reserved,
settling and uncertain calls remain held; only a definite pre-barrier terminal
release can return its reservation. Closing with held work refuses.

Selected session evidence is bounded to 100 lifetime calls. A mutation also checks
integer call counts from at most 10,000 retained session headers, not global Job
bodies or a SQL money aggregate. Indexed hub-wide nonce/reference claims survive
release. Redundant counters detect missing/extra rows against retained metadata,
not adversarial coordinated rewriting of all metadata. Existing allReceipts and
statsFor remain inherently global, with fresh bounded per-row receipt correlation.
The body limits are 16 KiB metadata, 1 MiB each Job/Receipt, depth 64 and 65,536
nodes. Money stays exact BigInt/canonical decimal TEXT.

## Correction that supersedes the original report

Independent review reproduced two defects after the original 67-Vitest /
63-Bun foundation freeze: actual TestRail completion was rejected, and a closed
Gateway receipt accepted a contradictory onchain category. The original report
is retained unchanged, including its incorrect test-to-onchain assumption and
its then-pending review status. Read the [correction](task-5-reference-correction.md)
and [final independent review](task-5-reference-review.md) for the current result.

Current categories are deliberately distinct:

- TestRail uses the explicit test category and its bounded lowercase 0xtest
  simulated reference; its actual result still omits the optional payment kind.
- EIP-3009 alone may normalize an omitted kind to onchain with an exact nonzero
  hash-shaped reference. The category is not an independent mining proof.
- Gateway requires an explicit gateway-transfer category and canonical transfer
  UUID. No current completion or closed receipt accepts gateway-batch.

Closed receipts correlate every settled call with the enclosing rail. The actual
TestRail and payment-result type were not changed to manufacture compatibility.
Collected memory and disk/reopen cases execute its real offline challenge,
verify and settle methods. Their balance changes are simulated, not payments.

## Evidence and chronology

Read the artifacts in this order; preparation notes are not executed evidence:

1. [Parent accounting readiness](task-5-accounting-readiness.md),
   [independent design review](task-5-accounting-review.md),
   [parent decisions](task-5-parent-decisions.md) and
   [implementation brief](task-5-implementation-brief.md).
2. [Adversarial review preparation](task-5-independent-review-preparation.md) and
   [original foundation report](task-5-report.md).
3. [Initial independent implementation review and genuine failures](task-5-independent-review.md),
   [reference correction](task-5-reference-correction.md) and
   [final independent correction review](task-5-reference-review.md).
4. [Parent foundation/correction review and repository-gate chronology](task-5-parent-review.md).
   The [canonical ledger checkpoint](task-5-canonical-ledger-checkpoint.md) retains
   earlier status statements; the [current progress ledger](progress.md) is additive.

The corrected author checkpoint passed 77 Vitest tests across five files,
65 Bun tests / 284 assertions across five files, the two private reviewer
regressions / five assertions, and exact-root-options typing over all twelve
foundation files plus the private reproduction with zero diagnostics. The final
independent correction review separately ran 47 Vitest cases, two private Bun
cases / five assertions and two actual TestRail Bun cases / 20 assertions, plus
the same exact strict target. It did not claim a fresh rerun of all 77/65 cases.

The parent independently checked all 14 frozen foundation/unchanged rail-result
hashes and exact strict typing. A lost full-gate session has no attributed result.
Its next over-scrubbed launch failed two unchanged runner environment tests. The
replacement launch restored existing non-secret environment fields and passed:
2,325 Vitest tests / 114 files, 374 Bun tests / 3,794 assertions / 33 files, and
root/web strict TypeScript, exit zero. The Bun total includes the private regression
files present in that worktree; it is not a clean-checkout public-suite count.
No source, test or compiler option changed for that launch correction. The
public-copy preparer did not rerun tests or a full gate in this publication.

## Limits and downstream obligations

This is a local budget ceiling, not escrow, account balance, available Gateway
credit or mined-batch evidence. Disk persistence covers tested local restart,
not host-volume survival. SQL rollback, orderly reopen and observed SIGKILL
checkpoints are separate evidence; simulated acceptance is not remote acceptance.
The Store correlates supplied evidence but does not independently authenticate a
rail result. F8 must retain the exact verified binding/result, prevalidate terminal
size before the barrier, and withhold output on uncertain completion.

Initial sessions are root-only; seller-funded sub-hires cannot inherit the buyer's
session. F6 remains a thin service after F5's commit; F7–8 must add private,
header-only capability routes, no-store responses and the public receipt whitelist
guard. No session ID belongs in a public receipt feed. F1's one-shot live approval
is consumed; further session evidence requires its own authority. Canonical work
priority is F5–12, then full F before G, H and I. GitHub push stays owner-owned.

The document-generation skill shaped this brief's separation of current contract,
design rationale and historical evidence. Historical copies contain only the
standard banner and narrowly documented private-locator substitutions. Original
research, private regression files, live journals and owner handoffs are not
published. Collected source/test commands remain in the reports; scrubbed private
fixture commands are historical placeholders, not runnable public instructions.
