> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F6 identifier-bound correction: independent follow-up review

Reviewed 2026-09-05 19:15 UTC. Verdict: **CLEAN for this narrow correction**. This is a separate follow-up, not a replacement for the original review or its genuine failing checkpoint.

## Scope and source review

Read the complete `internal/task6-bound-correction.md`, corrected `apps/hub/src/sessions.ts`, and seven added collected cases in `apps/hub/test/sessions.test.ts`, against the previously reviewed F5 contracts and original F6 implementation.

The session-local job-ID schema now matches F5's `^job_[a-zA-Z0-9]{16,128}$` exactly. It covers method inputs before Store access, copied snapshot calls before projection, and returned reserve-result IDs. The correction does not weaken the shared legacy core JobId schema or change the ledger. The copied snapshot's skill IDs also use F5's exact `^[a-z0-9][a-z0-9-]{0,127}$` constraint; slash-bearing labels cannot become a valid closed-session projection.

The added tests exercise the inclusive 128-character boundary and rejected 129-character boundary, zero Store invocations for invalid begin/uncertain inputs, defensive reserve-result validation, and valid maximum-length versus invalid slash-bearing skill labels. The unchanged private fixture independently reproduces the original failure paths using the real memory Store and verifies actual Effect interruption/finalization. No new defect found in this bounded delta.

## Chronology and independently executed checks

The initial review remains unchanged: its private fixture genuinely reported **1 pass / 3 fail**, while the original focused matrix passed 80 tests. Those failures concerned validation/projection compatibility and pre-IO refusal, not a successful unauthorized ledger mutation. The author's later seven-case collected Red checkpoint (2 pass / 5 fail, 23 filtered) is recorded in the correction report; I reviewed that record rather than rerunning old source or claiming that I independently captured that Red.

Against the final frozen source, I ran:

```sh
bun --no-env-file x --no-install vitest run apps/hub/test/sessions.test.ts apps/hub/test/session-ledger.test.ts packages/core/test/session.test.ts apps/hub/test/rails.test.ts
bun --no-env-file test [private independent regression fixture]
```

- Vitest: **87/87 passed, four files, 5.59s**; F6 30, shared kernel 27, core session 20, rails 10. Started 2026-09-06 00:45:06 IST.
- Unchanged private Bun fixture: **4/4 passed, six assertions, 235ms**.
- Exact TypeScript program: **zero diagnostics**, using the root parsed tsconfig options, `noEmit: true`, `incremental: false`, and explicit roots `apps/hub/src/sessions.ts`, `apps/hub/test/sessions.test.ts`, and `[private independent regression fixture]`, with real transitive dependencies.
- Recomputed every SHA-256 entry in `internal/task5-reference-correction.md`: **14/14 matched**.

All commands exited zero. I ran no full-repository suite; the parent's separate full gate is not included in these counts. No network, keys, live payment, Git mutation, source edit, collected-test edit, or private-fixture edit occurred in this follow-up. Only this ignored report was added.

## Frozen fingerprints

```text
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
d4549ee63abf8e78a6488fbb36f2a012f0513a5b9e1963104c6ebad267c57b8c  internal/task6-bound-correction.md
0672031e38dc59aea02875f1f33a5343a6198c5d1ddcb7452fe256cd6bbca096  internal/task6-report.md
bda24fbe4611cd1e78e01dd1311998efe7986a8a862b1bcc1cd0b4e1c3e85183  internal/task6-independent-review.md
4ccca3c724e1162211b05e59a25d22d766f1f2c41e9804e86efd8e64f2b0c2ce  [private independent regression fixture]
```

The original author report, initial independent review, and private fixture retain their recorded bytes. This review establishes local facade-boundary compatibility and preserved delegation, not remote settlement, session HTTP integration, or later F7/F8 behavior.
