> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F7 independent review preparation — September 6, 2026

PREPARATION ONLY. No final source freeze reviewed and no test executed. Parent
decisions supersede illustrative Task 7 code; source remains author-owned. This
note is the only write. No Git, full gate, network, keys, live action or F8 paid
branch work. `internal/` is ignored by the worktree `.gitignore:3`.

Read full Task 7 (plan lines 1493–1754), task7-parent-decisions.md,
task7-readiness.md and frozen sessions.ts; inspected actual server routing/token
and receipts-feed boundaries, Rails, SessionError/Store integration references,
and the in-progress Bun endpoint test/preload. Those drafts changed during this
inspection and are not a reviewed checkpoint. The ts-testing skill informed the
behavioral checkpoints below; existing Vitest/Bun remain the test stack.

## Release contract to verify, not reimplement

Use the approved import-safe
`makeSessionRoutes({sessions,rails,sessionStorage,hubSecret,configuredHubSecret})`
with one server-captured dependency set. F6 owns accounting through
`openSession`, `snapshot`, `closeSession`, and pure `sessionReceipt`.
No second Store, accounting map, allReceipts scan, provider or environment reload.
The literal plan's putSession/query-token/receipt-count shortcuts are obsolete.

The captured configured secret must be nonempty and at most 4096 UTF-8 bytes,
and match captured hubSecret exactly, for real opens together with actual
backend-derived durable storage. A length bound does not prove restart stability.
Historical read/close must not newly require a built rail or successful real-open
admission. The test rail must remain usable when real rails are also built.

## Highest-risk review checkpoints

1. **Capability before IO and private namespace containment.** Canonical
   `ses_[0-9a-f]{32}` ID and exactly 32 lowercase ASCII hex token precede
   timingSafeEqual and every protected Store read/write. Header-only
   x-session-token: missing, wrong, foreign, uppercase, non-ASCII, comma-joined
   duplicate and query-only credentials return the fixed 404, with no body read
   or Store IO on failed close authentication. Test token A against session B.
   Exercise production dispatch, not only the helper: every application response
   under the sessions namespace, including bad path/method, error, timeout and
   overload, is `private, no-store`. No fallthrough to the generic server JSON
   helper, which does not itself attach that header. No reflected URL/token/ID.

2. **Bounded reader cannot mutate after rejection.** Independently exercise
   16 KiB actual UTF-8 bytes, exact declared versus observed Content-Length,
   absent length/chunked input, fatal UTF-8 decoding, trailing/excess JSON and
   the five-second complete-read deadline. Close accepts only empty or `{}`.
   Include both a never-resolving read and never-resolving cancel, plus a read
   that resolves with valid JSON after timeout/abort. Await the response and late
   continuation; verify zero writes, no unhandled rejection and admission-slot
   recovery. Do not await uncooperative cancel before releasing a bounded slot.
   Saturate 32 active handlers, assert fixed 429, then prove capacity recovers.
   A Promise.race alone is insufficient if its losing task can reach a write.
   Cancellation does not undo a synchronous transaction already committed; no
   automatic open/close retry or compensating mutation may be introduced.

3. **One snapshot, exact status and recoverable closed artifact.** Assert one
   `snapshot(id)` and no other accounting read for GET. Calls is an array, bounded
   by the F5 lifetime limit of 100; preserve reserved/settling/uncertain states.
   Exact string money includes held and `budget - spent - held`; use values above
   2^53 to catch Number conversion. Assert network and absence of unapproved keys.
   Complete-open status omits closed_receipt. Persisted closedAtMs plus complete
   emits the exact F6 core artifact, from that SAME snapshot via sessionReceipt;
   no extra read, close, Date.now or synthesized timestamp. A changing-next-read
   sentinel or call-count guard should detect accidental second-read assembly.

4. **Atomic close and sanitized failure channels.** Real memory ledger states
   reserved, settling and uncertain all refuse close as fixed session_pending
   without changing accounting. A successful close persists one supplied time;
   repeated/concurrent close yields one artifact plus session_closed, never a
   timestamp overwrite. GET recovers exactly the successful artifact after a
   simulated lost response. One-shot typed errors, synchronous throws and
   Effect defects map to fixed application errors (storage defects: 503), without
   private sentinel/cause/path text or fallback writes. A subsequent healthy
   request must still work. Inspect interruption handling, not only happy-path
   rejection wrappers; no retry or uncertain-as-success conversion.

5. **Real/volatile guard is exercised, not inferred.** Keep a real selected rail
   built using an offline double that fails on provider use; test actual volatile
   and durable backends independently of secret configuration. Exercise missing,
   empty, mismatching and over-4096-byte secrets, including multibyte boundaries.
   In the same mixed registry, selected test opens must succeed without real-open
   admission. No availability/support/balance/deposit call occurs. Known valid
   historical sessions remain readable/closable when admission is unavailable.

6. **Actual disk restart preserves the capability.** Owned temporary SQLite DB,
   production route/service and identical configured dummy secret across child
   restart must preserve authenticated status and the persisted closed artifact.
   The previously issued token works; an unrelated secret returns fixed 404.
   Do not substitute a fresh deterministic session with matching ID on restart,
   or treat an ARCADE_DB string / memory DB as durability proof. Verify seeded
   state is created only when absent and all observed state comes from disk.

7. **Public privacy and existing job authentication are real HTTP regressions.**
   Narrowly exclude sessionId from publicReceipt's current rest spread and check
   actual unauthenticated `/receipts` bytes contain neither a seeded session ID
   nor the field name. Retain job/buyer/nonce/root/parent/child redactions and
   existing public evidence. Do not bring H1's later projection rewrite forward.
   The shared canonical comparator also needs actual `/jobs/:id` coverage for a
   URL-decoded token containing 32 Unicode characters: a header-only test may
   arrive with different encoding and miss the old equal-JS-length/unequal-byte
   crash. Assert fixed 404 plus ordinary valid job-token success. Keep legacy job
   query compatibility unchanged; it grants no session query-token fallback.

8. **Closed input and no paid-branch drift.** Open uses only buyer/budgetUsd/rail,
   exact positive decimal-string uint256 amounts with at most six fractional
   digits, normalized nonzero buyer and built/default rail. Test number, exponent,
   signs, whitespace, leading-zero ambiguity, prototype keys and excess fields;
   zero writes on failure. Open returns exactly the six approved fields and an
   honest local-budget note: no funding, withdrawal, execution or batch claim.
   Verify the final source boundary contains only the approved seven files;
   dual-header paid probes/polling/payer recovery/hire isolation remain F8 work.

## Evidence expectations at the later explicit review release

Use real F5/F6 behavior for status/close and owned actual-server HTTP fixtures;
mock only external IO and narrow failure seams. Read the final author report and
freeze hashes before making a verdict. Existing draft fixtures use an allowlisted
child environment, `--no-env-file`, loopback port 0 and blocked external fetch;
review all cleanup paths, bounded stream drains and TERM/KILL reaping, then verify
the listener refuses connections. Parent owns execution/full gates. Exact root
strict compiler options must include the new nested fixtures/tests explicitly.
No runtime, failure-first Red, regression pass count or restart proof is claimed
by this preparation. No owner action or new spend is needed for these offline
checks; wait for root's explicit final source review release.

Inspected frozen-source/input SHA-256 checkpoint:

- apps/hub/src/sessions.ts:
  `f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30`
- apps/hub/test/sessions.test.ts (hash only this turn; not rerun):
  `f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5`
- task-7-parent-decisions.md:
  `90d9feaa9d312a05d2c2f60cf1990aea879ea2166d7559593e2d8c6c5ecf5ed6`
- task-7-implementation-readiness.md:
  `430102c263f3fce30df24a5c47f00e9da038d27942027a0e8bfc006ff9198951`
