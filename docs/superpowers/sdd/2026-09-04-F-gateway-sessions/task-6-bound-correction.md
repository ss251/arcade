> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F6 session-local identifier correction — author freeze

September 6, 2026, approximately 00:38 IST. This is an additive correction report;
the original task6-report, readiness notes and prepared public copies remain
historical and unchanged. Only sessions.ts and sessions.test.ts changed. No
global core schema, F5 ledger, Store, rail, source dependency or route was edited.

## Reviewed defect and exact correction

B9's independent source review found that F6 used the legacy core JobId, which
has no upper suffix length, while F5 bindingOf requires exactly
`/^job_[a-zA-Z0-9]{16,128}$/`. An overlength identifier reached begin/uncertain
Store operations and a pure closed projection could return an impossible ID.
The real Store returned conflict, not a successful accounting mutation. The
problem was facade input/projection consistency, not an observed payment bypass.

Parent released one session-local schema with exactly the F5 regex. It now checks
direct begin/uncertain IDs, every projected call ID and returned reservation jobId.
Invalid direct input fails SessionInvalid before Store IO. A malformed returned
reservation ID fails fixed SessionStorageUnavailable after its single Store call,
without retry or compensating mutation. Canonical IDs at the 128-character suffix
boundary remain accepted; the total string includes the additional four-character
job_ prefix. Global legacy JobId behavior remains unchanged.

During the same correction, parent identified the adjacent visible skill label
contract: core SessionCall permits arbitrary bounded strings but F5 requires
`/^[a-z0-9][a-z0-9-]{0,127}$/`. A genuine pre-fix regression accepted invalid/skill
in a closed summary. The copied projection now checks that exact session-local
skill regex too. No global schema or accounting transition was broadened or changed.

## Genuine Red chronology

The preserved independent report records 1 PASS / 3 FAIL / six assertions at
September 5 19:02:22 UTC. Its diagnostic-only grouped counter refinement repeated
the same result at 19:03:46 UTC: begin read once/invoked once; marker invoked once;
closed projection accepted. Actual pending-read fiber interruption/finalization
passed. This author did not edit that private fixture or its expectations.

After the correction release, this author first invoked the ignored Bun path
without explicit ./; no files matched. That command collected no tests and is
not a behavioral Red. The corrected command below reproduced 1 PASS / 3 FAIL /
six assertions against the unchanged production source, 207 ms:

```sh
bun --no-env-file test [private independent regression fixture]
```

Before any source fix, seven collected boundary cases ran at 00:35:57 IST with
2 PASS / 5 FAIL / 23 filtered. Actual failures were overlength begin and uncertain
input (wrong conflict tag), a 129-character projected job ID accepted, a malicious
129-character reservation result accepted, and the slash-bearing skill accepted.
The two independent 128-character projection/result cases passed. In the two
combined input-boundary cases, later zero-IO and valid-128 assertions were not
reached after the first failed tag check; the private grouped assertions separately
observed those IO counts. The maximum-valid skill assertion likewise was not
reached before the fix. None is misrepresented as an earlier executed assertion.

The source fix was limited to the two local schemas and their projection/input/
result use. All seven collected cases then passed without weakening assertions.
No old F6 test was removed or changed, and all four private cases are unchanged.

## Final bounded verification

At 00:36:41 IST, the focused command exited zero:

```sh
bun --no-env-file x --no-install vitest run apps/hub/test/sessions.test.ts apps/hub/test/session-ledger.test.ts packages/core/test/session.test.ts apps/hub/test/rails.test.ts
```

87/87 Vitest across four files, 5.70 seconds: 30 F6, 27 F5 kernel/memory, 20 core
and ten registry. The unchanged private command passed 4/4 Bun, six assertions,
229 ms. This includes the actual interrupted Store-read finalizer with zero begin
invocations. Neither group exercises a network, live rail or new SQLite database.

Exact TypeScript createProgram used the real root tsconfig options, noEmit:true,
incremental:false and explicit roots sessions.ts, sessions.test.ts PLUS the private
four-case Bun file, with actual dependency traversal. Result:
EXACT_F6_CORRECTION_DIAGNOSTICS=0. No compiler flag weakened or nested test omitted.
This is the original report's exact recipe with the private path added, not a full
repository gate. The ts-testing skill guided real Reds, exact boundary assertions
and preservation of the independent fixture.

All fourteen F5/unchanged rail-result fingerprints still match the F5 correction
inventory. All four original F6 readiness/decision/report files and all five public
preparation files still match their publication-audit fingerprints. The prior
publication audit is a historical source checkpoint; its old two F6 source hashes
are superseded only by this new correction inventory, not silently rewritten.

## Frozen SHA-256 inventory

```text
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
4ccca3c724e1162211b05e59a25d22d766f1f2c41e9804e86efd8e64f2b0c2ce  [private independent regression fixture]
0672031e38dc59aea02875f1f33a5343a6198c5d1ddcb7452fe256cd6bbca096  internal/task6-report.md
```

No trailing whitespace in either changed file. No tests or owned fixture processes
remain running. Parent reported a successful pre-correction repository gate,
but that older source result is not attributed to this corrected freeze; parent
will repeat it and owns independent rereview, public follow-up and atomic commit.
No full suite, Git, network, key, live payment, F7 source or additional authority
was used. All previously documented F7/F8 privacy, verified-binding and uncertain-
outcome obligations remain, and F1's one-shot approval stays consumed.
