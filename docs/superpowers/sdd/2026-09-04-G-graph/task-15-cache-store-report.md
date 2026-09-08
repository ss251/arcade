# G15L durable per-query cache storage

The [cache-store brief](task-15-cache-store-brief.md) releases exclusive storage
and no-key readback for each retained correlated query. No live consumer,
operational budget, real key/endpoint, payment or reservation reconciliation is
enabled. Positive records remain declared synthetic protocol data, not owner
signatures, authenticated acquisition or independent chain consensus.

The separate private `cache-<queryHash>` directory leaves capture inventory
unchanged. An original verifier-produced handle must match the original binding
and capture parent, then pass fresh source/parent/protocol readback before any
directory creation. Result JSON includes fixed policy/query/source, storage time,
the complete original evidence and a canonical digest. A separate commit marker
hashes exact result-file bytes. Both files and the directory are fsynced; an
exclusive claim protects the cooperative write. Files are0600/directories0700;
result size is bounded to2MiB, marker size to32768 bytes.

Before releasing the claim, the writer validates exact inventory, canonical
closed envelopes, digests, original evidence equality, repeated file bytes and
fresh retained protocol/source evidence. The public reader requires no claim,
exact committed files and the same checks. Five-second monotonic local budgets
and cancellation gate acknowledgement; synchronous IO is not preemptible in the
kernel. Failure never removes partial directories/files/claims, overwrites cache,
reclaims a budget slot, refreshes a query or sends payment.

Claim absence alone is not clean-close acknowledgement or payment proof. If a
caller loses its acknowledgement after release, a later reader can independently
validate already committed bytes; this performs zero new paid queries and never
clears reservations. The returned deeply frozen handle retains original query
transaction/cost, storage/capture timestamps and qualified retained evidence.
The query cache does not constitute full no-key assessment replay or a fresh
runner execution; both remain separate integrations.

## Executed checks

Missing-export Red preceded implementation. Final158 focused Bun tests/
831 assertions10.38s and exact two-root strict0 passed. Four exact-optional
property construction errors were corrected before the final strict check.
Tests cover canonical round-trip, exclusive overwrite refusal, missing cache/
forged handles, cancellation, rehashed wrong result and commit data, truncation,
missing/extra files, claims, modes, hardlinks/symlinks, oversized result, source/
capture mutation and post-sync errors/deadlines.

Actual child exits33 after result sync and after commit sync each preserve the
claim; reads and a second writer refuse. A competing child exits34 without
overwriting the held entry. An actual empty-PATH/no-key child reads a completed
entry and emits only qualified mode/zero-new-payment/original-cost metadata.
An injected lost post-release acknowledgement causes the writer to refuse with
no claim restored; later independent read succeeds from valid committed bytes.
These are process-interruption checks, not power-loss guarantees.

A first committed query remains readable after a second query's retained500
response; no second cache is created. Two successful declared captures preserve
both original costs and require the first result's retained parent proof for
second-cache readback. No key is fabricated merely to enter the actual consumer.
Owned test files/children are cleaned/joined, never operational state.

Removing only the new cache block restores the entire previous harness byte-
for-byte (SHA256`d8a6cc580815c7a508b6d7db1ee0ed18beb0f945b999574212b0daa395737669`).
Client and consumer are unchanged. Existing validity/caps/replay policy, capture
formats and reservation accounting are unchanged. The sole sequential four-
worker gate98921 passed:5370Vitest/242files69.47s;1581Bun/98files with
12839assertions204.49s;root/webstrict and client/SSR builds333/166ms. Final
six-path/three-link/privacy audit and three source/brief pins are checked after
three result annotations. No repeated full gate or push.

## Next three steps

1. Reconcile qualifying retained query results into fixed global owner-root
   accounting without refunding unknown reservations or resetting quotas.
2. Connect fresh pre/post balance checks and the actual bounded consumer only
   through a separately reviewed no-retry coordinator.
3. Add qualified historical no-key assessment replay and public whitelisted
   evidence output. No live mode is released by these offline artifacts.
