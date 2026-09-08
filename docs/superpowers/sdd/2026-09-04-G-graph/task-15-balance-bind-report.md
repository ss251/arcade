# G15M retained balance-to-query consistency

The [balance-bind brief](task-15-balance-bind-brief.md) releases an offline
join of three supplied observations to a freshly revalidated retained query
cache/capture. No actual RPC, key, payment, operational state or global budget
reconciliation is performed. The original balance reader, client, consumer and
existing reservation/capture/cache behavior are unchanged.

All three closed snapshots must carry the fixed Base chain, payer and USDC token,
canonical uint256 quantities, nonzero block identity, safe timestamps and four
bounded response digests. Data properties are copied without invoking getters,
and returned snapshots/digest arrays are frozen. The existing30s block-time
freshness relationship is checked at each declared observation time.

Admission must precede capture creation by at most5s. Pre-forward observation
must follow the final pre-sign RPC capture and precede the forward-intent record
by at most5s. Post-query observation must follow final receipt evidence by at
most5s, never be in the future at readback, and preserve temporal ordering.
Both before balances must meet the existing910000-atomic admission threshold,
remain unchanged between those checks, and differ from the after balance by
exactly10000 atomic. The after balance must retain the existing900000 floor.
Unknown observations, unexpected external activity or a changed delta refuse;
this is not protection against all unrelated wallet activity.

Balance heights must progress from admission through pre-forward to after.
Equal heights require equal hash/timestamp; different heights cannot share a
hash. Pre-forward height precedes the receipt block; after height covers it and
must match its hash when equal. Receipt timestamp lies between pre-forward and
after block timestamps. Height ordering is NOT independent ancestry/consensus
proof, and Graph index metadata is not substituted for receipt evidence.

The returned `retained-balance-consistency` record hashes the original query/
source/cache/evidence/transaction references and all three observations. It does
not prove that declared historical observations were actually acquired then,
authenticate a provider, clear a reservation, refund a quota or enable signing.
Five-second local read bounds/cancellation and final current-source checks gate
return; synchronous IO is not preemptible in the kernel.

## Executed checks

Missing-export Red preceded implementation.194 focused Bun tests/1021 assertions
14.49s passed. The receipt-time negative was then tightened to isolate its
intended relationship: one targeted test/five assertions283ms passed, followed
by exact two-root strict0. No runtime implementation changed after this suite;
the later full-gate fixture failure and recovery are recorded below.

Each positive fixture calls the actual four-read balance reader against injected
responses for all three observations. Times/balances/blocks are explicitly
declared synthetic values created for the fixture, not live acquisition. Tests
cover exact910000-to900000 success,33 mismatches across amounts, chain/payer/
token, quantities, hashes, timestamps, event ordering, block/receipt identity,
cache/source corruption, getters, cancellation and local timeout.

A real owned-temp reservation is written before the join: its exact ledger bytes
and `unresolved:1` remain unchanged afterward. No cache tuple is promoted to new
spending authority. Removing only the new binding block restores the entire
previous harness (SHA256`2eec855185e11638f31a8ef7522677a74f1532909e28632d2a6c8a7035da0daa`);
client/consumer are unchanged. No real key/endpoint/spend, live approval replay,
existing policy change or push.

The sole sequential four-worker gate17414 passed5370Vitest/242files69.85s,
then exited1 after1616Bun passes/one failure across98files (13026 assertions,
208.49s). The getter-isolation test's positive fixture crossed a wall-clock
second: its pre-forward synthetic block time became newer than its receipt's
fixed creation-time timestamp. The unchanged production validator refused that
inconsistent tuple. A deterministic older-block fixture reproduced the failure.

Only the test helper changed: before/pre-forward synthetic block times now use
the earlier of their observation time and the fixture receipt time. A dedicated
regression proves the crossing case. Final focused recovery passed195Bun/
1025 assertions13.98s and two-root strict0. Only the skipped remainder was then
run as20832:root/webstrict and client/SSR builds348/171ms passed. The full suite
was NOT repeated and the original full gate is NOT relabeled all-green.

Final six-path/three-link/privacy audit follows three result annotations. The
runtime harness and brief pins remain unchanged from the full-gate freeze;
the test pin intentionally changes for the demonstrated fixture-only recovery.

## Next three steps

1. Durably record admission/pre-forward/after observations tied to reservations
   and query/cache digests before enabling any reconciliation.
2. Add fixed owner-root retained-result reconciliation that never refunds unknown
   exposure, resets quotas or retries payment; keep all reservations counted.
3. Integrate qualified no-key historical replay and a separately reviewed bounded
   actual consumer coordinator. Existing owner/live pauses remain unchanged.
