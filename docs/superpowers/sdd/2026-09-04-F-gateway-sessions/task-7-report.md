> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F7 implementation report — September 6, 2026

Author freeze after F6 commit `5d61133`, as released by the parent. This is the
delegated implementation checkpoint, not an independent review or full gate.
Read the complete actual Plan F Task 7 and global constraints, task7-readiness,
the updated task7-parent-decisions, independent-review preparation and actual
frozen F6 service/Store/router/receipt contracts. Parent-approved adaptations
supersede the illustrative memory-first/query-token/global-receipt code.
The ts-testing skill guided failure-first behavior checks using existing Vitest
and Bun, including the actual production router in owned offline children.

## Implemented scope and API

Exactly seven source/test files are owned here:

- `apps/hub/src/server-sessions.ts`: new import-safe transport factory, capability
  helpers, bounded body reader and fixed private response projection.
- `apps/hub/src/server.ts`: construct one F6 service from the actual Store/Rails/
  selected chain, capture secret/config once, mount the handler before other
  dispatch, and use the shared ASCII comparator for existing job capabilities.
  No paid-branch, runner, settlement, lineage or pipeline change.
- `apps/hub/src/receipts-feed.ts`: exclude `sessionId` from the existing public
  projection. Existing other fields remain unchanged; H1's later whitelist is
  not brought forward.
- `apps/hub/test/session-endpoints.test.ts`: collected unit/service-bound cases.
- `apps/hub/test/session-endpoints.bun.test.ts`: actual production-router cases.
- `apps/hub/test/fixtures/session-endpoints-preload.ts`: one owned child preload.
- `apps/hub/test/receipts-feed.test.ts`: original tests plus the private-ID Red.

`makeSessionRoutes({sessions, rails, sessionStorage, hubSecret,
configuredHubSecret?, now?})` returns `handleSessionRoute(req)`, resolving to a
Response inside `/sessions` and `/sessions/…`, or undefined elsewhere. The
supplied service is the real `makeSessions` result; there is no second ledger,
Store, provider, accounting map, global session scan or allReceipts read.
The only mutable transport state is the bounded active-handler count.

Server-only exports are `timingSafeTokenOk(expected,presented)`,
`sessionToken(secret,id)`, and `sessionTokenOk(secret,id,presented)`.
They enforce canonical lowercase ASCII token bytes before timingSafeEqual;
session IDs are exactly `ses_` plus 32 lowercase hex characters, and HMAC domain
is `arcade-session:<id>`, not the existing `arcade-job:<id>` domain. Session
authentication reads only x-session-token. Existing valid job header/query
tokens remain supported by the narrow jobTokenOk replacement.

POST open accepts only buyer/budgetUsd/optional rail. Nonzero buyer addresses are
normalized to lowercase. Budget is a canonical positive decimal STRING, with at
most six fractional digits and exact uint256 atomic bounds; no coercion, sign,
exponent, dollar prefix, whitespace or leading-zero ambiguity. Known unbuilt
rails refuse without fallback. Open returns exactly session_id, session_token,
rail, network, budget and note. Notes distinguish local ceilings, simulated test
payments, independently funded Gateway balances and accepted transfer references;
they do not promise funding, a mined batch, withdrawable credit or execution.

Real-rail opens require the captured backend-derived durable fact AND configured
secret equal to the captured actual secret, nonempty and at most 4096 UTF-8 bytes.
F6 independently guards its actual Store. This applies on loopback too; test
sessions stay usable in mixed registries. Length does not establish operational
restart stability. Historical reads/close do not newly require real admission.

GET status makes one selected authoritative F6 snapshot call. It returns
session_id, rail, network, budget, spent, held, remaining, calls ARRAY, complete
and closed. Remaining subtracts held as well as spent; money never crosses
Number. Calls preserve reserved/settling/uncertain/released/settled distinctions.
Only a persisted closed, complete snapshot includes optional closed_receipt,
computed with F6.sessionReceipt from that exact same object, without another
read or close. Private call IDs remain on authenticated status/receipt only.

Close authenticates first, accepts empty body or an empty JSON object, captures
one time and delegates one atomic F6 close. Pending holds refuse 409
session_pending; repeats/concurrent losers refuse 409 session_closed without
rewriting time. Closing freezes local accounting; it is not a withdrawal,
Gateway submission, remote reconciliation or batch close.

## Transport and failure behavior

Application session-namespace responses use `private, no-store` and fixed JSON:
input_invalid400, session_not_found404, rail-unavailable/pending/closed409,
session_capacity429 and session_unavailable503. No caught provider prose, Cause,
SQL path, request, buyer, ID, token or budget is spread into an error response.
Malformed methods/paths stay within the private response handler. Protected
path/method/token checks occur BEFORE capacity consumption, body reads and any
Store IO, preserving the uniform 404 even at capacity.

Bodies are bounded to 16,384 actual bytes and a five-second complete-read
deadline, not a per-chunk timeout. Declared length must be finite/canonical and
match observed bytes; nonempty bodies require JSON media type, fatal UTF-8
decoding and valid closed input. Native abort/timer cancellation is retained.
Parent-approved followup also checks monotonic elapsed time on each continuation
and does not retain zero-byte chunks: microtask-only chunks cannot starve the
timer indefinitely or grow retained empty-chunk metadata. Uncooperative cancel
is not awaited. Late body/reader continuations cannot proceed to Store mutation.
There are at most 32 admitted handlers, with recovery after cancellation.

Service effects receive the request AbortSignal. Original F6 interruption
behavior remains unchanged; the HTTP boundary returns only a fixed unavailable
response when an interrupted operation produces no successful value. There is
no automatic retry, close recreation, release, compensation or invented receipt.
An HTTP cancellation cannot undo or prove absence of a synchronous transaction
already committed. Retained capability plus status is the recovery path.

## Actual failure-first chronology

All times below are local Asia/Kolkata on September 6 unless stated otherwise.

1. 00:56:15 Vitest: publicReceipt fixture genuinely exposed sessionId (1 failed,
   4 original passed). The new endpoint file failed module collection because
   server-sessions.ts did not exist; its five cases had not executed.
2. Initial Bun setup was invalid because a released fixture receipt used
   sellerAtomic0 rather than F5's required nominal fee allocation sum. Corrected
   only the owned seed to sellerAtomic30. A later sandbox bind refusal also was
   environmental, not an endpoint Red. Owned loopback execution then succeeded.
3. Original-source actual router initially produced 1 pass/2 failures: missing
   POST /sessions (404 instead of201), leaked sessionId on /receipts. A Unicode
   HEADER alone passed because its transported byte/string representation did
   not exercise equal JS length. Before any source fix, the case was extended to
   the URL-decoded 32-character Unicode job token: final genuine baseline was
   0 pass/3 fail/9 assertions, with the existing /jobs route returning500.
4. Initial implementation: 10/10 focused Vitest, then 3/3 Bun/20 assertions.
5. 01:03:09 expanded unit matrix: 44 passed/1 genuine failure. While 32 valid
   handlers were busy, bad authentication returned429 instead of uniform404.
   Moved protected authentication before capacity per parent decision; retained
   the failing case unchanged. Subsequent boundary cases passed.
6. A same-snapshot test initially reran the lazy Effect to obtain an expected
   object, creating a different snapshot identity. Corrected the test to capture
   the original Effect result via tap; it now asserts reference identity and
   exactly one read, rather than weakening to deep equality. This was a fixture
   error, not a source failure.
7. Actual raw HTTP initially awaited peer EOF after a complete error response
   and hit its 7.5-second fixture completion bound. See the explicit limitation
   below. Fixed the observer to parse the complete bounded Content-Length body
   and reap its own socket, not to assert an unobserved peer close.
8. 01:15:30: new deterministic monotonic-clock case genuinely returned201 after
   elapsed5001ms while the timer callback had not run (1 fail/1 pass/54 filtered).
   The adjacent uncooperative late-reader test already passed. Added the approved
   continuation deadline/empty-chunk hardening, then retained both cases.
9. Exact nested strict found a new tuple inference issue and the synthetic
   reader's DOM/Bun overload mismatch. The tuple is explicitly readonly; the
   late-reader test now spies on an actual reader and derives its precise read
   result type. No diagnostic was excluded and no production type was relaxed.

Other first-pass cases are coverage, not invented behavioral Reds.

## Final focused verification

Final Vitest at 01:18:09: **101/101**, four files, 1.17s:
56 F7 endpoint cases, 5 public-receipt cases, 30 unchanged F6 cases and 10
unchanged F4 registry cases.

```text
bun --no-env-file x --no-install vitest run apps/hub/test/session-endpoints.test.ts apps/hub/test/receipts-feed.test.ts apps/hub/test/sessions.test.ts apps/hub/test/rails.test.ts
bun --no-env-file test ./apps/hub/test/session-endpoints.bun.test.ts
```

Final actual-router Bun after the last production change: **11/11, 184
assertions**, 9.81s. A subsequent unit-fixture-only type correction did not alter
the Bun fixture or production files. Tests use allowlisted child environments,
dummy secrets, actual Store/F6/router, native loopback HTTP and an owned temporary
SQLite database. External fetch/preconnect is blocked and observed count stays0.
Owned child processes and client sockets are reaped with bounded waits;
post-cleanup listener connection refusal is asserted. The owned temporary DB
directory was removed after handles and children were closed.

These tests directly observe cross-handle held accounting, no premature close,
actual random-ID session persistence through restart, original-token access,
identical persisted closed_receipt, repeat-close refusal and wrong-secret404.
Seed rows are created only if absent; the dynamically opened session is not
reseeded on restart. A real durable backend permits the offline Gateway open,
while actual memory and SQLite :memory: refuse it. No Gateway provider or payment
is contacted. The separate actual RailTest challenge/verify/settle unit flow is
simulation only; it proves local test-reference/accounting correlation, not
mining, recipient funding, a real transfer or F8 pipeline integration.

Exact TypeScript program used the real root tsconfig options and all SEVEN owned
source/test roots explicitly, with actual dependency traversal, noEmit:true and
incremental:false: **EXACT_F7_DIAGNOSTICS=0**. Root tsc's usual exclusion of nested
hub tests was not relied upon. All 14 F5 source/test/payment fingerprints match
task5-reference-correction.md, and both corrected F6 fingerprints remain intact.
Owned-file trailing-whitespace check is clean.

## Limits and handoff

Bun returned complete fixed application400/private,no-store/Content-Length25
bytes but did NOT produce TCP EOF during the initial 7.5-second observation,
despite request Connection:close. The corrected fixture proves complete response
framing plus cleanup of sockets owned by the test, NOT peer-initiated connection
closure. It also sends late valid remaining bytes after the stalled-body error
and observes no additional writes. Native body cancellation is not represented
as cancellation of already-running paid work. Raw malformed-HTTP parser failures
before application dispatch are outside the application privacy guarantee; no
such parser response is presented as an app-private response proof.

F8 still must require BOTH canonical x-arcade-session and x-session-token on
probe and paid retry before session Store IO, then separately recover and match
the payer, preserve root-only lineage and durably select/reserve/begin/finish
through the exact verified binding. This task does not implement that paid path,
inherit capabilities into seller-funded children, allocate Gateway splitter
payouts, attest mining from UUID shape, or claim end-to-end live sessions.
F9/F10 may recover closed_receipt through authenticated GET after an uncertain
close response; never manufacture time or replay close automatically.

No full suite, Git operation, dependency change, public documentation edit,
Keychain access, live spend, F1 approval replay or G/H source edit occurred.
F1 approval remains consumed. Root owns independent review, full gate, public
SDD integration and the atomic commit. No test process remains running at freeze.

## Frozen SHA-256 inventory

```text
6ea6b0f61bc42f1482db75867745bc02de4182864a3e1d4decd50c654c65dd1d  apps/hub/src/server-sessions.ts
8079438b515405e4b0cf507afdc9fc05b54d0f9ac3f6805bf75370e4c088b923  apps/hub/src/server.ts
33c1eec2ba00d91f5817c905f88baa6c06b198e4bc060f7c741c4065a8500ff4  apps/hub/src/receipts-feed.ts
879e6721f02c80abb6029a4d94a35cb2c391308a9f01236676c1cf2e71f7532f  apps/hub/test/session-endpoints.test.ts
e62028ad0042de1ea8c8e09f5103395e84dc3fd46fd85bc0d54cd7de30afbe73  apps/hub/test/session-endpoints.bun.test.ts
e53cd86bd462d06f2ec26266100ec5d18ccd1d668d948bfa8e00312113045c52  apps/hub/test/fixtures/session-endpoints-preload.ts
4178d898b86727a6c1861ac5c781395784e4e1a1f50d6c1902c7dde6524839e1  apps/hub/test/receipts-feed.test.ts
```

Unchanged F6:

```text
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
```
