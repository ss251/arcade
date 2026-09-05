> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F6 independent review — pre-correction finding

September 6, 2026 (Asia/Kolkata); frozen at September 5 19:03:46 UTC.
Verdict: one bounded session-job-ID contract correction required. Parent accepted
the finding and separately released the author; this report records the original
source/tests and will not be rewritten after their correction. No payment bypass,
remote settlement or new F5 corruption defect is claimed.

Read fully task6-parent-decisions, task6-readiness-review, task6-report, the two
owned source/test files and the actual relevant F5/core/Store contracts; also read
task8-parent-decisions to avoid reopening approved future integration choices.
Used ts-testing for behavioral probes, real memory Store authority, actual fiber
interruption/finalization and exact nested TypeScript checks. No source or collected
test edit, full suite, Git, dependency, external network, credential or live action.

## Actionable finding: session-local job IDs omit F5's upper bound

sessions.ts canonicalJob and reservation-result decoder use the legacy core JobId,
whose pattern has a 16-character lower bound but no upper bound. F5 bindingOf instead
requires exactly /^job_[a-zA-Z0-9]{16,128}$/. checkedSnapshot likewise accepts the
broader core SessionCall ID, so its closed projection can attest a syntactically
valid ID which could not have been admitted by the actual session ledger.

Reproduction uses an ID with 129 characters after job_, without keys/network:

- beginSettlement performs one authoritative snapshot read and invokes the real
  Store begin once, ultimately returning SessionConflict. Expected malformed-input
  SessionInvalid before either Store call.
- markUncertain invokes the real Store marker once and returns SessionConflict.
  Expected SessionInvalid before the marker. The real Store rejects and does not
  successfully mutate accounting; the counter measures invocation, not a commit.
- Pure sessionReceipt accepts a complete closed snapshot with this impossible
  job ID and returns a closed artifact. Expected SessionInvalid.

Parent-approved narrow fix: one session-local bounded JobId check matching F5,
used for direct IDs, projected calls and reservation result IDs. Do not change
global legacy JobId, F5 ledger/core schemas, or introduce a second ledger. This is
a bounded facade/projection correctness gap, not evidence of an on-chain exploit.

## Genuine reproduction chronology

Private fixture: [private independent regression fixture].
Initial invocation without explicit ./ matched no files under the ignored directory;
that was a collection-command mistake, NOT a behavioral Red. Correct command:

```sh
bun --no-env-file test [private independent regression fixture]
```

At 19:02:22 UTC: 1 PASS / 3 FAIL, six assertions, 218ms. Three failures were the
two unexpected SessionConflict tags and accepted malformed closed projection.
The actual pending Store-read interruption case passed: original interruption,
one async finalizer, zero begin calls. No detached promise or owned process remains.

Before source correction, refined the two private tag assertions into combined
{tag,reads,writes} assertions so the diagnostic independently shows actual IO,
not merely inferred invocation. At 19:03:46 UTC the same four cases were again
1 PASS / 3 FAIL, six assertions, 446ms: begin reads=1/invocations=1; marker
reads=0/invocations=1; projection still accepted. Expectations were not weakened.
The private fixture is now frozen for the author's correction/re-review.

## Independent passing baseline and review scope

```sh
bun --no-env-file x --no-install vitest run apps/hub/test/sessions.test.ts apps/hub/test/session-ledger.test.ts packages/core/test/session.test.ts apps/hub/test/rails.test.ts
```

80/80 Vitest in four files, exit0, 6.61s: F6 23, F5 kernel27, core20, registry10.
This includes the actual in-repo TestRail challenge/verify/settle and corrected
simulated reference flowing through facade/real memory commit/close. No new SQLite
restart proof or real Gateway acceptance was exercised by this F6 run.

Exact TypeScript createProgram used the actual root tsconfig options, noEmit:true,
incremental:false and explicit sessions.ts + sessions.test.ts roots: zero
diagnostics. A second exact program adding the private Bun fixture also passed
with F6_REVIEW_PRIVATE_EXACT_DIAGNOSTICS=0. No tsconfig option was weakened;
root include alone would omit these nested tests. The exact recipe is the author's
report recipe plus the private fixture in the explicit rootNames array.

Other reviewed behavior is consistent with the approved facade: fresh frozen
whitelisted snapshots; held/spent/remaining and closed-time checks; no complete-open
closed artifact; no duplicate-reference repair; bounded own-data before routing;
exact terminal variant delegation; F5 normalization of actual omitted TestRail kind;
no eager closed check breaking semantic retries; backend admission guard distinct
from terminal/uncertainty recording; synchronous and Effect defect sanitization;
original interruption cause preserved; no automatic retry/compensation/rail calls.

The author report distinguishes missing-module Red from two actually observed
projection Reds and other passing supplemental coverage. Its original fingerprints
match, and no statement implies the facade itself verifies remote payment proof.
F7/F8 route privacy, bounded bodies and actual settlement authority remain future
integration work, not supplied by this review.

## Frozen inventory

```text
77fd2789d342008cd2629b9bb6e8eea9c39b2bf60bab111529fe355911808c41  apps/hub/src/sessions.ts
220f761cea68b22e4e7d367193c68d8937e35ac078e4c546aefe2b2c92ffa458  apps/hub/test/sessions.test.ts
0672031e38dc59aea02875f1f33a5343a6198c5d1ddcb7452fe256cd6bbca096  internal/task6-report.md
4ccca3c724e1162211b05e59a25d22d766f1f2c41e9804e86efd8e64f2b0c2ce  [private independent regression fixture]
```

All fourteen source/rail-result fingerprints in the retained F5 correction report
were recomputed and matched (F5_FROZEN_HASHES_MATCH=14). Parent's independent full
gate is separate from these focused checks. A corrected facade requires a new
independent delta note and rerun; this initial finding report remains historical.
