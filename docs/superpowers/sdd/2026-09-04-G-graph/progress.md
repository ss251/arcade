# SDD ledger — Plan G

Plan: [2026-09-04-G-graph](../../plans/2026-09-04-G-graph.md).

- September 5, 2026: Task 1 local scaffold implemented in its isolated worktree.
  Genuine six-test Red preceded six-test Green / 31 assertions. Actual pinned
  Graph codegen and WASM build passed, as did frozen-lock reinstall, seven focused
  hygiene tests, targeted strict TypeScript and diff check.
- Independent read-only review of all source, tests, README, ignore rules and
  root-isolation fingerprints was CLEAN. The reviewer observed the WASM artifact
  but did not claim a separate compiler run or live indexing.
- Parent repeated the actual pinned codegen, WASM build and six scaffold checks:
  all passed. After installing the application workspace's locked dependencies
  with lifecycle scripts disabled, `bun run test` and `bunx tsc --noEmit` exited
  successfully; Bun reported 255 tests / 1,377 assertions across 23 files. An
  earlier attempt without this worktree's dependencies failed setup (missing
  packages); it was not a product regression or a successful gate. No root
  manifest, lockfile, TypeScript or test configuration changed.
- Independent public-artifact review was CLEAN: all 11 local links resolve; the
  implementation report equals its retained original plus the banner. Full lock
  parsing and public-byte privacy scans found no credentials or personal paths.
  This checkpoint records the local milestone only, not the full live G1 gate.
- Task 1 live gate: OWNER-PENDING. No account, credential, deployment, indexed
  transaction or current network-support result is claimed. G2–6 have not started.
- G10–12 safety preparation may proceed independently; no paid Base request or
  query claim is authorized by this ledger. F-before-G merge order remains required.

## September 5 — G10 local implementation checkpoint

Task 1 local milestone committed as `53b7ab1`; its live gate remains unchanged.
Task 10 is implemented with genuine collected Red, actual zero-budget decode
failure and exact eight-to-nine canary compatibility regression recorded in its
report. Focused 147 tests / strict checks passed. Parent separately repeated all
77 G10/G11 focused tests successfully. G10 independent source/dependency/public
report review is CLEAN; parent confirmed the installed client transport limits.
No key, paid query, chain write, Studio deployment or live proof occurred. The
whole-repository gate passed: 2,222 Vitest tests / 110 files, 255 Bun tests /
1,377 assertions / 23 files, and strict TypeScript exit zero. This frozen-worktree
run also included the separately reviewed, not-yet-committed G11 tests. G10's
staged tests do not import G11, and its commit remains separately scoped.

## September 5 — G11 local implementation checkpoint

G10 committed separately as `03d6f1d`. G11 implementation and its 48 focused tests
are frozen; genuine failures and conservative contract adaptations are retained
in the task report. Parent independently read all source/tests/report and found no
blocking issue; sibling cross-check verified the G10 contract and pinned Agent0
ID/field types. The preceding full gate and parent's 77-test focused run passed.
G11's own staged whole-repository gate passed: 2,222 Vitest / 110 files, 255 Bun /
1,377 assertions / 23 files, strict TypeScript exit zero. No production service-payment
verifier, trusted validator configuration, paid query or live proof is claimed.

## September 5 — G12 local implementation checkpoint

G11 committed as `d56b43e`. G12 client and runner are frozen, independently
cross-reviewed CLEAN, and parent has read all production source/tests/reports.
Genuine failure-first safety regressions and exact source/dependency adaptations
are preserved in the two original reports and dated integration record.

Parent repeated 165 skill Vitest cases (including seven separately scoped G13
guide cases), ten actual Bun process/HTTP fixtures with 79 assertions, root/web
TypeScript and the exact root compiler options plus every nested skill test: all
passed. Two client-fixture hygiene/typing follow-ups are explicitly recorded and
do not change production code or the retained originals.

The staged G12 whole-repository test and strict-type gate exited zero. Bun
reported 265 tests / 1456 assertions / 25 files. This frozen-worktree run also
included G7's separately reviewed local Graph service and G13's guide tests,
neither staged in G12; staged G12 source/tests do not import those later tasks.
Final public-copy review and the separate local task commit follow. No live Base
query/payment, Studio deployment, service-payment verifier or G2–6 work occurred.
F's local checkpoint is now on main, but its funded gate remains owner-pending;
G still does not merge ahead of the full F shared-file dependency.

Final G12 public-artifact review is CLEAN: both implementation reports exactly
match their retained originals plus the approved banner; all 17 local links in
the reviewed seven documents resolve, with no personal/temp paths or private
clickable targets. Reviewer accepted the two documented test-only follow-ups,
without claiming another test run or paid network evidence. Source and staged
scope are frozen for the final precommit gate.

## September 5 — G13 local documentation checkpoint

G12 committed separately as `3e8fe23` after its final frozen gate passed:
2,325 Vitest tests / 114 files, 265 Bun tests / 1,456 assertions / 25 files,
and strict TypeScript exit zero. G7 and G13 remain separately scoped.

G13's public guide and seven failure-first documentation contract tests are
frozen and independently reviewed CLEAN against the actual G10–12 runtime.
The public brief/report, two local guide links and shell-fence syntax were
reviewed; no shell command from the guide was executed. The separate staged
G13 whole-repository test/type gate follows this checkpoint. No paid Base query,
Studio deployment, production change or F-before-G merge exception is claimed.

## September 5 — G7 local service checkpoint

G13 committed separately as `4a217f8` after its own final gate passed:
2,325 Vitest / 114 files, 265 Bun / 1,456 assertions / 25 files and strict
TypeScript exit zero. G7's frozen source and 15 focused tests were included but
not staged in that gate. Its fixed read-only service is not wired into any route.

Parent read all G7 source, tests and original report. Independent read-only source
review is CLEAN, including compatibility with the planned schema. Genuine
missing-module and two transport regression Reds, the corrected invalid
child-versus-root-total assumption, and actual owned-loopback deadline/redirect
evidence are preserved in the original report. Final focused 15/15 tests and
strict TypeScript passed; no independent live provider result is claimed.

The original report remains unchanged; this archive copy only adds its public
checkpoint banner. Public-copy review and G7's separate staged full test/type
gate follow. G1 Studio live and G2–6 are still held; G8 will wait for H1's actual
read-only stats source contract and the canonical shared-file merge dependencies.

Independent public-copy audit found one extra trailing newline in the initial
export. Parent removed only that blank line and directly compared the final bytes:
exact original plus banner PASS. The audit otherwise found the brief/report CLEAN
for scope, privacy and evidence claims; neither contains Markdown links. Source
and staged scope remain frozen for the final G7 precommit gate.

G13 and G7 committed separately after their own full gates. The later clean rebase
onto main ec5cf74 preserved their atomic commits as c1cd66c and 4b3c800; preceding
G1/G10/G11/G12 are now 57c58ff/eb7e1f6/f7fee77/28d8e51. Historical report hashes are
not rewritten. No G merge ahead of full F occurred.

G14's wallet composition is implemented with required nullable evidence, exact
child accounting, conservative verdicts and a published 135-second bound. Genuine
correlation and fixture-lifecycle regressions were fixed, retaining earlier reports.
Independent final runtime checks passed 13 Vitest plus 11 Bun / 45 assertions;
actual timeout was 32.048 seconds with one request. Parent's fixture-type follow-up
passed all 13 Vitest and exact nested-test strict TypeScript with zero diagnostics;
independent source review is CLEAN. Independent public review is also CLEAN: four
exact bannered reports, 27 resolved local links and a targeted privacy scan. The
separate full gate remains pending. No live Graph purchase, new nested profile or
historical A9 replay is claimed.

## September 5 — G1 partial live deployment and indexing checkpoint

This entry supersedes the earlier owner-pending status without rewriting any
historical report. One owner-approved deployment of the already-uploaded CID
`QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8` was acknowledged at
13:24:16.472 UTC, returning the exact versioned Studio endpoint recorded in the
[live brief](task-1-live-brief.md). The private journal retained intent before
dispatch and completion afterward; no repeat or re-upload is claimed.

Both early authorization modes returned HTTP 200 with GraphQL startup errors.
At 13:36:11.268 UTC, an independent keyless read returned data at block 5,481,110;
at 13:45:02.316 UTC, the parent authenticated read returned data at block
16,195,110. Both reported the exact CID and `hasIndexingErrors: false`; both
latest and exact known-transaction lists were empty. Thus both modes served data
at their observed times, but neither full synchronization nor an indexed
runbook-settlement match is proved. G1 remains partial and G2–6 remain held.
The primary registry observation and parent historical RPC-absence observations
are separately attributed in the brief; neither is replaced with new payment
evidence or used to infer decentralized/x402 availability.

The original private runtime, security-follow-up and independent evidence reports
are retained unchanged. Their public copies add a historical banner, with the
evidence copy removing the personal owner label and exact private journal path.
No executable helper, journal, secret, owner handoff or internal research is
published. The original runtime report's old sanitizer claim and hashes remain
historical and are explicitly superseded by its linked security follow-up.

The README contract was updated with a genuine five-pass/one-fail Red before the
dated README change. The final six tests / 36 assertions, exact nested strict
TypeScript, unchanged source/original-report fingerprints, three exact public
copies, all 43 local links and targeted privacy/diff checks passed by 14:00:34 UTC.
Parent independent review and the separate full gate remain pending; this is not
a whole-repository privacy or gate claim. No deployment, query or network request is performed
by this documentation update, and no F-before-G merge exception is introduced.

### Parent checkpoint after the publisher freeze

Parent selected-file review is CLEAN, with independently repeated exact-copy,
original/source fingerprint, 43-link, privacy, six-test / 36-assertion and nested
strict checks. The separate full test/root-and-web-type command exited 0; Bun
reported 347 tests / 3,683 assertions across 32 files, including 19 retained private
runtime tests. Vitest passed, with no invented numeric count after bounded output.
An actual corrected subgraph WASM build also passed; the first malformed command
only printed help and is not counted as build evidence. See the
[parent report](task-1-live-parent-review.md).

The parent's one later keyless query at 14:10:24.097 UTC reached block 42,441,110
with the exact CID and no indexing errors. Both settlement lists remained empty.
No paid query, new settlement or deployment was performed. The partial checkpoint
is ready for its small atomic commit, not a main merge or G2–6 release.
