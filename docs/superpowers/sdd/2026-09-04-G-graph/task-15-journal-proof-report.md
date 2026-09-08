# G15P readonly journal/query correlation

The [journal-proof brief](task-15-journal-proof-brief.md) adds two inert readers.
`readGraphBalanceJournal` requires all five complete canonical private files,
no journal claim, exact bounded inventory/modes/no aliases, current original
query/source binding, chained observation hashes and complete marker. It checks
retained handoff scope/times and the selected actual reservation ledger prefix
and immutable head. This is a historical reference check, not the complete
global writer-state admission/reconciliation check. Later canonical reservation
rows may exist, and every row remains counted/unresolved.

All selected files are read twice with byte equality, directory identity and
fresh source checks within a monotonic five-second local deadline. Historical
creation/observation/intent bounds are evaluated at retained times. Low or
unexpected after balances stay inspectable. The returned immutable historical
handoff is deliberately not registered in the process-local capability map;
reading cannot reopen a reservation or create a fresh balance recorder.

`verifyGraphJournaledQuery` requires admission persistence before query capture,
pre-forward persistence between the original pre-sign RPC observations and
forward-intent capture, and exact equality of the retained public intents. It
reuses the existing cache/protocol/receipt/balance-delta verifier, rereads the
journal and returns only immutable consistency references. Missing/changed
cache, nonce/header disagreements, wrong delta and below-floor values refuse.
Neither function mutates reservations, reconciles quota, refreshes a cache,
calls a key/transport or grants new authority.

Claim absence does not prove acknowledged close. Hashes and supplied coherent
records are not authenticated acquisition, independent consensus or a real
payment proof. These functions do not defend against a malicious owner rewriting
every consistent source/evidence file. Existing payment validity/cap/replay,
client, consumer and budget behavior are unchanged. Removing the new reader
block restores the prior harness exactly (SHA256
`90bc797e7e980d02710b5d2c1ece265c4f282b0bac5e26775333c8d2cbb081ee`).

## Executed checks

Missing-export Red preceded implementation.38 selected Bun/120assert2.65s
and exact two-root strict0 passed; final285focusedBun/1520assert18.12s and
strict0 passed. Tests cover canonical readonly roundtrip, interrupted/extra/
missing/aliased/linked/public/oversized/BOM files, changed source/ledger/head,
rehashed scope/time/balance/order/intent/marker contradictions, later declared
ledger rows, abort/deadline/backwards clock and concurrent byte changes.

The existing synthetic protocol fixture gains a test-only pre-forward callback
and receipt timestamp return to interleave the real journal recorder with
declared protocol observations. No production client/consumer changes. A real
empty-PATH child with network forbidden verifies the same immutable result;
no key, actual endpoint/RPC/payment, operational namespace or live authority.
Reservation bytes remain untouched. The sole sequential four-worker full gate
39734 stopped in Vitest: all5370tests passed,241suites passed and one H8
teardown failed after72.25s. At `apps/web/test/skill-route.test.ts:77`, the socket
probe reported `still_listening` instead of `ECONNREFUSED`, after child close/
exit0/null-signal assertions passed. The original run did not retain listener
identity; port reuse is only a hypothesis, not an observed root-cause attribution.

Root-cause-first local inspection found no related source diff. One focused
H8 recovery24492 passed11tests/onefile2.03s including cleanup. No H8 source fix
was made without a confirmed cause. Only the skipped stages ran in33797:
1708Bun/98files13530assert214.75s, root/web strict and client/SSR358/195ms all
passed. The original failed full gate remains recorded; no full repeat or
all-green relabeling. Final six-path audit: three local links, no privacy
matches and three source/brief pins unchanged. Existing harness restoration
still exact. Atomic local commit and exact-one main fast-forward follow; no push.

## Next three steps

1. Add owner-root reconciliation that revalidates retained evidence and preserves
   every quota count, unknown exposure and immutable reservation history.
2. Add qualified no-key historical assessment replay and separately reviewed
   consumer orchestration; a partial cache must never fabricate a payer key.
3. Keep live/owner checkpoints explicit; do not initialize operational state,
   consume paid queries or replay approvals before the live boundary is released.
