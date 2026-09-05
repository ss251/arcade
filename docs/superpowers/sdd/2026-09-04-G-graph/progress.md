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
