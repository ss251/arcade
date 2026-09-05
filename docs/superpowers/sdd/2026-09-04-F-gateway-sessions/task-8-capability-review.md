> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 session-job capability review

2026-09-05 19:36 UTC / September 6 IST. Read-only readiness analysis. Recommendation: **adopt the distinct session-job HMAC domain**, with the routing and compatibility conditions below. No implementation or behavioral test was performed. No source, initial decisions, F7 artifact, Git, dependency, network, key or live operation was changed; only this ignored note was added.

## Concrete existing exposure if the old token were reused

Read the complete `task-8-parent-decisions.md`, actual server token functions and both job GET handlers, the F5 terminal checks and actual buyer polling code.

- `apps/hub/src/server.ts:457–463` derives the ordinary token as the first 32 lowercase hex characters of HMAC-SHA256 over `arcade-job:<jobId>`. Both job handlers use it. `tokenFrom` accepts `x-job-token` or the legacy `?token=` fallback.
- The `/jobs/:id` handler (about lines 992–1002) checks only that token before `store.getJob`. It removes `input` but returns the remaining Job, **including `outcome.output` and diagnostic fields**. It has no settled-receipt gate.
- The headerless `/jobs/:id/result` handler (about 1245 onward) checks the same token before scanning `allReceipts`. Settled rows return output; released rows return null result but still expose stored outcome error and a receipt through the ordinary projection. Reserved/uncertain state is not handled by the proposed F8 uncertainty contract here.
- `apps/hub/src/session-ledger.ts:197–212`, `terminalMatches`, validates terminal status/timing and invokes `shouldSettle` only when `accepted` is true. A released Job may retain output, including a locally successful outcome that was released before settlement. This is valid persisted data, not storage corruption. F5 must not be weakened or rewritten to make an unsafe route seem safe.
- Memory `Store.getJob` defensively copies a session Job; SQLite validates/read-selects its session state. Neither redacts outcome output: **storage validation is not HTTP authorization**. Existing legacy mutation guards stop ordinary writes from reusing a session-owned job ID; ordinary HTTP generates its own new job ID rather than letting the caller choose one.

Therefore giving a session caller the ordinary job token would bypass the intended combination of session ID, session capability and job capability. In particular, calling `/jobs/:id` could obtain unpaid retained output. This finding is established by source composition; no new failing test or exploit execution is claimed.

## Smallest correct token and routing contract

Keep the ordinary token derivation and headerless ordinary behavior unchanged. Add a separate private derived capability:

```text
sessionJobToken = first32hex(HMAC-SHA256(hubSecret,
  "arcade-session-job:" + sessionId + ":" + jobId))
```

Before constructing/comparing it, require `sessionId` exactly `ses_[0-9a-f]{32}` and `jobId` exactly `job_[A-Za-z0-9]{16,128}`; tokens are exactly 32 lowercase ASCII hex. The delimiters are unambiguous because neither canonical ID admits a colon. The new prefix is separate from both existing `arcade-job:` and `arcade-session:` realms. Use the canonical ASCII-safe constant-time comparator, never UTF-8 byte length after only a character-count check. This retains the existing 128-bit truncated-HMAC security level; it is cryptographic separation, not a claim of impossible mathematical hash collisions.

Session admission returns this token in the existing `job_token` field **only for the authoritative original job ID returned by reserve**, including a semantic duplicate. Do not sign a newly proposed candidate ID when reserve returns an older admitted call. Emit a token-free, exact same-origin `/jobs/<id>/result` poll URL. Do not mint an ordinary token for this session root anywhere, including logs, alternate response fields, redirects, recovery responses or helper callbacks.

For the new result branch:

1. Test header **presence**, not truthiness: either `x-arcade-session` or `x-session-token` selects session handling. Empty, partial, malformed, duplicated/merged, non-ASCII or wrong values never select the ordinary branch.
2. Require both session headers and `x-job-token`; validate IDs and both HMACs before any session/Job/Receipt Store IO. Do not use legacy `tokenFrom` here. Query tokens cannot supply any of these capabilities; prefer a fixed pre-IO refusal when a `token` query is present, even if another correct capability was provided in headers.
3. After cryptographic authentication, prove selected snapshot membership before the approved exact persisted-receipt lookup. A valid capability generated for session A plus a job belonging to B must not authorize B. Invalid capability and membership refusal should have the fixed private no-store not-found shape without reflected values.
4. Reserved/settling stays pending, uncertain is the agreed fixed 503, and only correlated persisted settled evidence releases output. A released Job's retained output/error must never be copied into the response: use null result and the fixed local refusal. Corrupt storage produces fixed `session_unavailable`, never fallback or a reconstructed receipt.

The `/jobs/:id` metadata endpoint has **no new session feature** in F8. Any session-header-present request should be refused before Store IO. With no session headers, a session-job token fails the unchanged ordinary-domain check before `getJob`. The same applies to headerless legacy `/result` before `allReceipts`, whether the session token was placed in the header or the legacy query slot. Legacy handler method/path rejection and all new session-aware response paths must be private/no-store and must not echo/cache capabilities.

This design does not require a new job-to-session lookup, table, global receipt scan, cache or guessed Job field. Its critical invariant is **never issue an ordinary-domain token for a session root**. A hub-secret holder can derive every realm, so this protects clients from cross-route capability reuse; it is not a defense against compromise of the hub secret/server itself.

## Compatibility and migration

The 32-hex `job_token` representation remains stable and clients must treat its bytes as opaque. However, **the current ordinary `callSkill` is not already compatible** with the session transport. `packages/buyer/src/index.ts:121–137` retains only `job_id` and `poll_url`, accepts the existing query-token form, and performs GET without capability headers. It ignores `job_token`. F9 must explicitly capture/validate the new opaque job token, retain both session headers privately, and send all three headers on its bounded result request. A token-free poll URL alone is insufficient. F10 follows that API; no fallback through ordinary `callSkill` on failure.

Ordinary A/C/D/E paid calls and seller-funded child hires continue receiving ordinary job tokens and their current poll contract. Runner `/hire`'s local `x-job-token` is an independent job-local broker capability, not this new hub session-result capability; do not forward session secrets into it. Closing a session need not invalidate already issued job capabilities; actual membership and persisted terminal authority still govern results. Stable configured hub secret permits derivation after restart; changing that secret invalidates capabilities as it already does for ordinary jobs.

The checked branch has F5/F6 plus active F7 work, **not an already deployed F8 session-call issuer**. New issuance can use the correct domain from the start. If any earlier experimental deployment actually issued ordinary tokens for session roots, domain separation cannot retroactively invalidate those old tokens: the old ordinary verifier still accepts them. Do not add dual-domain acceptance as a migration convenience. Such deployments need a separately reviewed explicit cutover (for example, agreed secret rotation, which also invalidates ordinary capabilities, or an additional guarded migration design). No migration action is performed or authorized here; source-only absence of F8 is not a claim about every external deployment.

No change to F5 terminal data is necessary. The existing public `/receipts` projection and hash-only D documents are separate deliberately public surfaces; preserve their existing privacy/schema rules. Do not confuse allowing a redacted public receipt with permitting private `/jobs` data. Session credentials must not add a bypass to any current or future ordinary-token endpoint, including a later receipt-tree endpoint when H is merged.

## Required genuine regressions after F8 release

Use the actual owned production router with raw valid F5 fixtures and instrument all relevant Store reads. No new production source is needed merely to manufacture a Red.

1. Seed an actual released session terminal with retained sentinel output and diagnostic. Show that the intended session result projection returns neither, even with all valid session headers. Separately capture the unsafe old-token `/jobs` behavior before token-domain correction; label it accurately as a compatibility/security regression.
2. For settled, released, reserved and uncertain session calls, pass the **new valid session-job token** to headerless `/jobs/:id` and legacy `/result`, once through `x-job-token` and once through `?token=`. Every request returns fixed no-store 404 with **zero getJob/allReceipts/session reads** and no output, error, session ID, buyer or nonce.
3. Add either session header (missing partner, empty, wrong, malformed/Unicode, merged duplicates) to an otherwise valid ordinary job request. It must not fall through or perform Store reads. Query-only session ID/token/job token cannot authenticate the session branch.
4. Valid session A capability plus B job; A/B token swaps; correct session with wrong or legacy-domain job token; canonical unknown session/job; malformed bounded IDs. Auth failures precede IO; authenticated membership failure precedes private job/receipt reads.
5. Semantic reserve duplicate returns the exact original job ID and corresponding new-domain token, without redispatch. No ordinary token/query token is emitted by the session 202 or subsequent recovery projection.
6. Correct session result reads exercise persisted settled output, released null/fixed refusal, reserved/settling pending, uncertain fixed 503, missing/corrupt terminal receipt fixed 503 and one-shot Store-defect recovery. Assert no polling-driven writes and no capability reflection.
7. Existing ordinary `/jobs` and `/result` header/query capability tests still pass without session headers. Actual legacy buyer/hire tests retain their ordinary poll behavior. F9 gets separate actual header-propagation tests rather than relabeling ordinary `callSkill` tests as session proof.
8. Durable reopen with stable secret preserves new-domain validation and membership; wrong secret fails before IO. Explicitly test that changing session ID or job ID changes the HMAC realm binding without inventing an expiration or automatic key rotation.

This recommendation is analysis only and does not expand F7 source ownership or authorize F8 implementation. Parent should add the agreed invariant to the F8 decisions and carry it into F9/F10 acceptance before source release.
