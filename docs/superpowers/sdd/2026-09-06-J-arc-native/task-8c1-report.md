# J8C1 — atomic durable escrow inference admission

Implements the Store checkpoint in the [J8C brief](task-8c-brief.md), after
[hub socket correlation](task-8b3c2-report.md). No HTTP activation or live calls.

## Concrete storage boundary

The existing SQLite Store now exposes an escrow admission facade. Its in-memory
counterpart has none; SQLite memory/temporary backends explicitly report volatile
and refuse admission. The existing hub WAL/FULL synchronous configuration is
retained. This is cooperating-process durability, not protection from an actor
rewriting the database and its evidence together or a hardware durability proof.

One immediate transaction binds full public context `(chain, escrow, jobId)` to
one queued hub job and exact input. Exact verified-request retries return the
original hub ID, even when the new request proposes a different ID/time. Conflicts
with context or existing jobs/receipts/session ownership refuse. A current-disk
compare-and-set claims execution once. Only the newly admitted/claimed caller
may dispatch; retries, restart and uncertainty do not grant replay authority.
The facade does not authenticate HTTP callers or verify capabilities: its caller
must first use the guarded rail. No capability or private key is stored.

`jobs.escrow_key` and `escrow_admissions` are reciprocal ownership records. An
additive migration keeps old rows unchanged. Startup validates both directions
and bounded evidence before legacy reaping; deleting a binding cannot turn an
escrow job into ordinary uncharged work. Escrow jobs are omitted from legacy
caches/reaping. Current-disk checks block stale legacy job/receipt writers and
overlapping session reservations. Reads return newly decoded copies.

Canonical wire encoding preserves buyer input property order and treats a literal
`__bigint` field as input, not metadata. Only the known price field becomes a
bigint. Full context, metadata, JSON/digests, root identity/status and input hash
are cross-checked. Evidence is limited to1MiB and retained bindings to10,000;
there is no eviction, repair, terminal release or automatic resume.

Both admission and execution transitions read back their exact intended rows
inside the transaction before returning authority. Ignored writes, SQL aborts
and deferred commit failures therefore cannot report a successful claim. Fixed
typed refusal/storage errors replace private database diagnostics.

This checkpoint stores only admitted/executing/uncertain states. No escrow
receipt may appear yet: it is rejected as inconsistent evidence. C2/D must add
the budget HTTP route and atomic terminal job/receipt/confirmed-action proof,
then update result wording to distinguish actual refund from uncertainty. The
legacy "you were not charged" fallback must not describe an escrow failure.
Old and new hub binaries must not share the upgraded database; mixed-version
writers are outside these guards. Production deployment remains owner-only.

## Verification

Initial tests failed because the Store lacked escrow admission. Actual SQLite
coverage includes simultaneous handles, exact retries/conflicts, one-shot claim,
reopen, uncertain retention, preserved input ordering and copy isolation, stale
writers, reciprocal deletion/corruption, old-table migration, malformed/getter/
oversized input, volatile refusal,10,000-row capacity, closed databases and
insert/update/deferred-COMMIT rollback. Actual injected `RAISE(IGNORE)` produced
a genuine false-success Red; transactional readback fixed it. A closed database
also exposed a receipt-list guard that ran too late; it now precedes the
transaction wrapper. Tagged-error expectation and contextual typing fixes were
test/type corrections, not changes to authentication or payment policy.

The20-case checkpoint plus50existing session/store tests passed (70tests,
331assertions,9.37s); the final ignored-write case and strict check were then
added. Final21escrow tests passed (118assertions,1.71s), with four-root strict
checking at zero diagnostics. Scope/privacy audit passed:10files,96valid local
links and no privacy matches. Four code files were frozen before the sole full
gate93114:5,057Vitest/232files/70.64s;1,036Bun/77files/7,949assertions/180.52s;
root/web strict and client/SSR builds all passed. No full-gate replay.
No owner keys, RPC, sends, spending, deployments, consumed approvals replayed,
existing validity/cap/replay changes, production changes or push.
