# F6 parent review — thin session lifecycle service

September 6, 2026. F5 is committed separately as `8b8ebb2`. Parent read the
complete final service, its 23-case test suite, author report, F6 decisions and
the dependent F7/F8 readiness contracts. This checkpoint is local-only; no F1
approval was replayed and no credentials, funding or live session were used.

## Source review

The service is a stateless facade over the F5 Store, not a new accounting ledger.
Open/reserve/begin enforce actual durable storage for real rails; finish and
uncertainty recording remain available after an attempted send. Atomic Store
operations still own budget conservation, semantic retry, one-shot dispatch,
terminal evidence and close. Retained reads do not contact rails or providers.

Own-data normalization precedes routing field reads. Unexpected Store defects
become fixed errors, while original interruption causes are preserved. Returned
data is copied, whitelisted, validated and frozen. Closed projection requires a
persisted close time, exact held/spent/remaining relationships and distinct actual
rail-specific references; complete-but-open does not mean closed. It never
synthesizes remote settlement or deduplicates corrupt evidence into success.

The author report accurately distinguishes missing-module collection failure
from two later behavioral projection Reds (foreign network and zero-price call).
Other newly passing guards are labeled coverage. Its actual TestRail exercise
uses the unchanged local simulated result, including its omitted optional kind;
Gateway fixtures do not contact Circle or prove credit/mining.

Parent independently reproduced exact-root-options strict typing for both new
files and their real dependency traversal: zero diagnostics. Both source/test
SHA-256 values match the author's frozen inventory:

```text
77fd2789d342008cd2629b9bb6e8eea9c39b2bf60bab111529fe355911808c41  apps/hub/src/sessions.ts
220f761cea68b22e4e7d367193c68d8937e35ac078e4c546aefe2b2c92ffa458  apps/hub/test/sessions.test.ts
```

No actionable parent source finding at this checkpoint. Independent source
review, complete repository gate and public-copy review are still pending;
this document does not report them as passed. F7 HTTP capability/privacy and
F8 paid orchestration gates remain separate work before usable paid sessions.

## Initial full gate and independent correction finding

The frozen initial source passed the parent's complete gate: 2,348 Vitest tests /
115 files, 374 Bun tests / 3,794 assertions / 33 files, and strict root/web
TypeScript; final exit zero. Bun includes retained private regressions already
collected by that run. No web source changed. This passing gate did not expose a
later independently reproduced facade ID-boundary mismatch and is not the final
corrected-source gate.

Independent review reproduced three genuine failures: a session job ID with 129
suffix characters reached begin/uncertainty Store calls instead of failing before
IO, and a pure closed projection accepted that impossible session ID. F5 requires
a 16–128 suffix; the legacy global JobId schema has no upper bound. The real
Store refused those operations; no successful accounting mutation or payment
bypass is claimed. Its fourth actual fiber-interruption/finalizer check passed.

Parent accepted the session-local correction, leaving global core/F5 unchanged.
The related projected skill-label pattern is included in the same bounded audit,
with its reproduction status to be recorded separately. Original author and
review reports remain unchanged. A corrected freeze, independent rerun and new
complete test/type gate are required before commit.

Parent checked the four initial historical public copies byte-for-byte: standard
banner plus one exact readiness-review locator substitution to its existing public
counterpart. The brief was read completely and preserves its pending-review
checkpoint. No private journal or handoff is included.

## Corrected source and complete gate

Parent read the correction and all seven added public tests. The corrected facade
matches the exact F5 session job-ID and skill-label patterns, including boundary
acceptance, before direct-ID IO and on projected/reservation-result data. The
skill-label failure was actually observed before the fix; it is not a hypothetical
finding. No foundation source changed and no broader legacy schema was tightened.

Parent independently ran the unchanged four private regressions: four pass, zero
fail, six assertions. Exact TypeScript over both new files plus that private
fixture and real dependencies passed with zero diagnostics. All fourteen retained
F5 source/rail-result hashes match. Final F6 source/test fingerprints are:

```text
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
```

The parent repeated the complete repository test and strict root/web type gate
against this corrected freeze; final exit zero. The Vitest phase passed, followed
by 374 Bun tests / 3,794 assertions / 33 files and both strict checks. The exact
Vitest summary count fell within truncated tool output, so no inferred count is
reported for this run. The four private F6 regressions are separately attributed
to the explicit focused command, not added to that Bun total. No source changed
during the corrected gate, no live action was replayed and no web source changed.

The parent also checked six historical public copies exactly, with the established
banner, one readiness-review public-locator replacement and private-fixture locator
substitutions in the initial review/correction. Final independent correction and
publication review remain pending at this checkpoint; commit is not yet claimed.

## Final independent source review and publication checkpoint

Parent read the complete [independent correction follow-up](task-6-bound-review.md):
CLEAN, with its own 87 Vitest / four files, unchanged four private Bun / six
assertions, exact source/test/private strict typing and all fourteen F5 hashes
matching. It correctly distinguishes its actual final reruns from the author's
earlier five collected boundary Reds. No further source correction is required.

Independent publication review is also CLEAN for the six then-existing exact
copies, six literal substitutions, ten public files and 63 resolving local links.
It verified the original/private/public fingerprint inventories, scoped privacy,
whitespace and the parent's truncated-count attribution. The last follow-up copy
uses only the same private-fixture locator substitution after the banner; root
owns its exact-copy check and the final current index/parent-review delta. No
private source fixture, owner handoff, live journal or personal location is staged.

Source review and corrected complete gates are satisfied. The atomic commit must
include only the two service source/test paths and the eleven F6 public record/
index paths. No F7 source, unrelated local changes, private runtime files or push.

Final publication delta is independently CLEAN: seven exact historical copies,
nine approved literal substitutions, eleven public files and 67 resolving local
links, with no scoped privacy or whitespace findings. Both corrected source/test
hashes stayed unchanged. Parent read the full dated delta and separately verified
all seven exact copies and the thirteen selected paths. The final commit is ready.
