# H9 — browser-held ordinary job recovery

Starts after H8 commit `b7fee76`. The approved [Task 9](../../plans/2026-09-04-H-web.md)
keeps its `job-store.ts`, `job-store.test.ts`, storage key and convenience operation
names. Current ordinary and F producer contracts require these explicit corrections
before implementation; the historical plan is retained unchanged.

- Store exactly seven own scalar fields: `jobId`, `token`, `skillId`, `priceAtomic`,
  `createdAtMs`, `hubOrigin`, and `realm: "ordinary"`. Required issuer scope prevents
  same-ID collisions between hubs. No inferred issuer for old rows, optional session
  ID, result, receipt or arbitrary extra data. F session capabilities are not exported
  by its current facade and are not interchangeable with ordinary result/tree tokens.
- Validate actual canonical job/skill/token grammar, decimal uint256 and nonnegative
  safe timestamps. Accept exact canonical HTTPS origins, or HTTP with literal
  `127.0.0.1`/`[::1]` only. Existing `localhost` defaults are not silently rewritten;
  later browser transport must explicitly configure a supported issuer.
- Bound the raw UTF-8 array envelope to 256 KiB and 200 rows before processing.
  Reject a malformed whole envelope rather than silently salvage selected rows.
  Reads never repair data. A valid explicit `remember` may replace malformed data,
  but reports that recovery only after a successful write; invalid input cannot.
- Return observable ready/invalid/unavailable read states and write/delete outcomes.
  No storage access at import time or server-side localStorage fallback. No silent
  in-memory success. `forgetAll` removes this key only, never other browser data.
- Every read returns defensive copies, sorted newest first with deterministic ties.
  An exact seven-field duplicate is idempotent, even at capacity. Changed immutable
  metadata for the same issuer/realm/job is a conflict. No eviction of valid records.
  `get` and `forget` require explicit issuer/ordinary scope.

These are accepted recovery records, not proof of settlement, wallet balance or a
budget. The store does not provide cross-tab atomicity, backup, cross-device recovery
or protection from scripts executing in the same origin. Clearing browser data or
hub capability-secret rotation can make a result unrecoverable.

## Assignment and acceptance

The author owns only the two store source/test files and a private factual report.
An independent reviewer examines the frozen implementation and checks overlooked
cases. Parent owns this brief, the single full gate, scrubbed historical publication
and atomic commit. The initial release message used `jobs.ts` accidentally; corrected
to the plan's filenames before implementation. No duplicate alias is requested.

Tests must cover canonical boundaries, own-data/accessor refusal, issuer separation,
read/write failures, invalid-envelope recovery, duplicate/conflict/capacity behavior,
copy isolation and deterministic order. Missing-module failures are setup, not
executed behavioral regressions. Strict TypeScript and the existing test/build
commands remain the toolchain; no dependency or framework change is requested.

H9 does not yet wire a purchase or dashboard. Current `/api/settle` holds the ordinary
poll capability on the web server; copying it after completion would not meet the
browser-only custody decision. H10's separately reviewed direct-browser transport,
fresh-approval ownership and CORS work remain prerequisites. No new payment, key,
deployment, production configuration or push is authorized by this local task.

## Focused acceptance

The [author record](task-9-author-report.md) preserves two zero-collected setup
failures, the first 69-test Green draft and four Green guards refuting the parent's
line-terminator hypothesis. Supplemental size, storage-instance and serialization
checks ended at 77 tests. The [independent review](task-9-independent-review.md)
then reproduced a revoked-Proxy TypeError escaping the validation catch at three
public entry points. Three collected regression failures preceded the narrow move
of `Array.isArray` into that catch. Both final author and independent runs passed
80 tests and exact two-file strict checks. No broader Proxy sandbox is claimed.

Parent read the full source/tests, both preserved report histories, and the
[initial publication checkpoint](task-9-publication-checkpoint.md). Six historical
copies preserve exact original bodies and EOF with the standard banner; only four
literal personal-home substitutions were required.

The **single full H9 gate passed**: 3,423 Vitest tests across 146 files (47.91s),
823 Bun tests across 53 files with 5,917 assertions (160.03s), strict root/web
TypeScript, and actual production client/SSR builds (379ms / 143ms). No full sweep
was repeated. Final audit verified the six original pins and exact copies, two
frozen source/test pins, ten unchanged H8 pins, and 67 local links across nine
public documents. Selected privacy-pattern scans found no remaining personal
paths or obvious private-key material; they are not a universal secret classifier.
The Pages configuration is unchanged. The atomic commit follows; this storage-only
task claims no native-browser purchase/retrieval acceptance or F session recovery.
