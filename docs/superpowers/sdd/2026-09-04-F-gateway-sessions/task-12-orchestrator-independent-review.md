> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F12 orchestrator independent checkpoint — September 6, 2026

Verdict: one bounded evidence-coverage finding, approved narrow correction pending.
No additional material source finding in the persisted, closed-artifact, journal,
counter or cooperative owned-cleanup matrix. This is not whole-F12 acceptance.

Read the complete parent decisions27baadd83c5ee9f6282b59107a3a4a84de482957014cf9c91808a7734895e20f,
accepted source/evidence handoffs and134-line independent persistence checklist;
full482-line orchestrator, final collected test, launcher and fixture/probe paths.
Read the complete author report97322c0327199e4c2076734f3f01537e80bbfb212e46df4654602906761b91e1.
The ts-testing skill guided separate pure/owned-filesystem checks and explicit
attribution of the author's actual process/loopback evidence. No source, shared
test, public artifact, dependency, Git, network, key or live operation was changed.

## Concrete finding: outbound capability continuity was not independently observed

At scripts/e2e-gateway-session.ts:398–416, the captured fetch wrapper restricts
origin, path, method, input, redirects and counts but does not validate the actual
x-arcade-session/x-session-token pair or the result x-job-token. The source does
not establish absence on public listings/open or stable per-session/per-job
continuity on probe, paid retry, result polling, status and close.

This is a genuine required evidence gap, not an observed F9 product defect:
packages/buyer/src/session.ts:141,185–189,252–261,304 currently sends the expected
headers. However apps/hub/src/server-session-calls.ts:46 returns undefined when
both session headers are absent. An unpaid probe lacking both can take the
ordinary Gateway challenge branch, followed by a correctly session-bound paid
retry and result; the twenty persisted session rows do not independently prove
that original probe's header continuity. No mutated twenty-call execution or
behavioral Red is claimed. Root and G14 accepted this exact source-level limit.

Approved correction is confined to the existing outbound observer and a focused
negative test: in-memory captured capability continuity, required session/job
header locations and forbidden public/open/foreign-origin forwarding. No general
auth framework, raw capability response-body reads, token logging or new SDK API.
The original twenty-call checkpoint remains valid for its existing scope.

## Independent checks on the frozen checkpoint

Command, with shell login:false:

```sh
bun --no-env-file test scripts/e2e-gateway-session.bun.test.ts --test-name-pattern 'F12 persisted correlation verifier|F12 durable one-shot journal|F12 sequence ownership|has no armed default|returns fixed help|refuses an invented twenty-call|requires an explicit role-bound|rejects unknown, mismatched'
```

Result:17 PASS,0 FAIL,7 filtered,59 assertions,358ms. These are childless tests:
synthetic correlated rows and controlled fake sequence handles plus actual fresh
owned temporary journal/artifact files, which their finally blocks remove. No
hub/runner/probe child, loopback or cryptographic signing was invoked here.

Independent compiler-API program parsed the repository root configuration and
used exactly three roots: orchestrator, collected test and runtime fixture;
strict:true/noEmit:true, including imported dependencies. Result:0 diagnostics,
exit0,4.759s. No generated program/config file was written. All six source hashes
matched before and after both checks; G14 held source, then was explicitly cleared
to make only the approved capability-observation correction.

## Reviewed evidence boundaries

Post-stop SQLite opens readonly/strict and uses global limits2/21, demanding
exact1/20/20/20 sessions/calls/jobs/receipts and empty side tables. It does not boot
a Store/reaper. Strict core/canonical ledger decoding plus explicit scalar checks
bind exact sets, session and authorization identity,20 nonzero unique nonces,
20 unique Gateway UUIDs, root-only jobs, fixed buyer/seller/token/network/amount,
zero fee and original per-index input/output digests. Queued and terminal digests,
receipt/job times and the same complete persisted closed artifact are checked.
SQLite evidence is not substituted for actual runner observations.

Closed bytes are exclusive0600/NOFOLLOW, synced and re-read/hash checked. Journal
uses fresh owned0700 storage, exclusive0600/NOFOLLOW file, ordered awaited writes,
syncs and pre-write one-shot claims. Closed event/fact value predicates refuse
private prose and capability keys. Final87-row hash-chain/event/index verification
must pass. Append failure prevents subsequent mutation through the sequence;
uncertainty stops rather than filling calls or finally-closing the session. Lost
close recovery uses same-handle read-only status only. This is not a general
storage-fault recovery/resume or hostile same-user filesystem guarantee.

Signer and paid-forward counters are separate from actual fixture hub begin/
finish/facilitator verify/settle and runner stdin/spawn/exit/JobResult counters.
Bounded IPC records correlate their original input/output digest, job, nonce and
reference coordinates. Unknown endpoints and extra records prevent PASS. Actual
children remain owned for stop/reap; reader completion, valid stopped frames,
successful exits and listener refusal precede readonly audit. Source/policy hashes
are independently checked; no new detached-work or parent-death experiment here.

## Native sink correction and honest runtime attribution

Read the narrow ecc19a fixture proxy change. Actual native child handles remain in
the cleanup list; sink.write is observed through a facade rather than assigned.
All other native getters/methods use original receivers, and validated input is
delegated once to the original bound write. This preserves real execSkill/native
execution rather than synthesizing completion. B9 reports its direct inert-child
Red (native write assignment throws before write) and same probe Green (exit0,
exact output, empty stderr). This reviewer did not rerun that child.

The earlier fixture report retains its explicit attribution erratum: silent
pre-ready failures were sandbox bind denial, not executed omitted-params Reds.
G14's actual malformed UTF-8 EOF Red/Green is separate and retained there.
G14 reports final24 Bun/102 assertions including actual20 in4.038s; root separately
reports CLI20 PASS and post-exit87-row journal-to-readonly-DB correlation. Those
are attributed author/parent executions, not repetitions or independent counts
from this reviewer. No second twenty-call run, full suite or live action here.
FundsMoved:false/liveEvidence:NOT_RUN and zero mined batches proved remain exact.

## Frozen six-path inventory

| Path | SHA-256 |
| --- | --- |
| scripts/e2e-gateway-session.ts | 4d6893f5a4b50143dd522983baf36a4391374edca3d615fe1ea3ebe1ab7649c7 |
| scripts/e2e-gateway-session.bun.test.ts | 335c11bb39eb7b3f46ef778787297798139989c87729994bf6da50c5d0119b15 |
| scripts/e2e-gateway-session.sh | 3f79d9db3d5437eaf4e40ab61f95ce60b963ed184f8e7b4dd093a3a980f65124 |
| scripts/fixtures/gateway-session-runtime.ts | ecc19a1297a99510b64957c31f692e6069761d3bce2f1f53c124737cf9c510fc |
| scripts/fixtures/gateway-session-probe/arcade.json | d0761fc42d98994caea1f5e34b4dabef623df1482c49bd9f43c2310d57ea7db5 |
| scripts/fixtures/gateway-session-probe/run.ts.txt | 6c5f8c871f62c9320bc88e103a856c6072386e3c277d33050b5f78878edae3c6 |

## Narrow capability-observer correction — September 6, 2026

Final bounded verdict: **CLEAN** for the reported observation gap and the reviewed
matrix, subject to the unchanged evidence limits above. Initial114-line report
is preserved byte-for-byte, pre-append SHA256
ec1d490ed10e6aec0e51d6d6b7d30399da832e176fb5e5a7b1d68b595bfcb698.
No new source defect or further correction requested in this narrow rereview.

The observer at scripts/e2e-gateway-session.ts:359–395 captures only the already
exposed session.id and outgoing header values in a private closure. Its first
token observation permits the actual F9 authenticated status GET or an unpaid
probe, never a first paid request. All subsequent private status/probe/paid/poll/
close requests require that same canonical session identity/token. Result polls
require a canonical stable token per job, with at most20 distinct jobs and tokens;
completion compares their exact job set with the20 validated observations.
Public listing/open requests forbid session/job/payment capabilities. Foreign
origin, query/fragment, misplaced job/payment tokens and ambient auth/cookie/
legacy payment headers are rejected before native forwarding. Existing F9 and
server authentication remain authoritative; this is an observer, not new auth.

Read actual F9 status/discovery/paid/result/close call sites against the helper.
No raw response body is read to obtain a capability, no capability is returned
from the observer, and no debug logger, journal field or public output was added.
Only the fixed failure channel and function-only frozen facade escape its closure.

Exact in-memory reversal of the helper, four integration edits and the two-test
group/import reproduces the original4d6893f5/335c11bb hashes. The final comment
removes the unverified word "unfunded"; reversing only that comment reproduces
intermediate2c1c3241b12fc27e277106e79f979f573717dce1804305443ecdc2403713347d.
No unrelated source/test delta, file rewrite or Git operation was needed.

Independent repeated command is the earlier childless selection with the extra
alternative `F12 outbound private-header observation`. On the final literal hash:
19 PASS,0 FAIL,7 filtered,80 assertions,488ms. Exact same three-root compiler
program:0 diagnostics,strict/noEmit,exit0,6.235s. Before/after all six hashes agree.
The preceding corrected-comment checkpoint independently passed19/80 and exact3
strict0 too; counts are repeated runs, not extra coverage to sum. No owned child,
loopback, signing, second twenty-call, source/shared-test edit or full suite here.

Chronology from G14, separately attributed: the initial observer incorrectly
required first token capture on the unpaid probe, while actual F9 performs status
first. That introduced harness incompatibility produced25 PASS/1 FAIL/115 asserts
before signer/paid/runner entry. It is not an executed Red for the original SDK
or original evidence gap. Corrected author checkpoint2c1c3241/cc9c02a8 passed the
full focused26 Bun/123 assertions/12.22s, including actual20 in4.090s, and exact3
strict0. G14 reports temporary diagnostics included header names/lengths only
and were removed; the final source has none. Parent's sole full gate is running
at this addendum; no full-gate/commit completion is inferred here.

Final six-path inventory supersedes only the source inventory, not chronology:

| Path | SHA-256 |
| --- | --- |
| scripts/e2e-gateway-session.ts | 2f78e4a1bae87689beae6de74dbce6b3c295b700c827481e3c11056460f56b07 |
| scripts/e2e-gateway-session.bun.test.ts | cc9c02a89b7e657b82d55eee0e4fce5cfb1338020f4af3c0bd925669caa06662 |
| scripts/e2e-gateway-session.sh | 3f79d9db3d5437eaf4e40ab61f95ce60b963ed184f8e7b4dd093a3a980f65124 |
| scripts/fixtures/gateway-session-runtime.ts | ecc19a1297a99510b64957c31f692e6069761d3bce2f1f53c124737cf9c510fc |
| scripts/fixtures/gateway-session-probe/arcade.json | d0761fc42d98994caea1f5e34b4dabef623df1482c49bd9f43c2310d57ea7db5 |
| scripts/fixtures/gateway-session-probe/run.ts.txt | 6c5f8c871f62c9320bc88e103a856c6072386e3c277d33050b5f78878edae3c6 |
