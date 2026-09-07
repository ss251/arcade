# G15B — offline durable reservation writer

Extend G15A's script and Bun tests, with this brief, report, index and progress
as the complete next scope. Keep the CLI read-only and liveEnabled false.
No production client, key mechanism, current balance RPC or transport is released.

Implement explicit one-time initialization under a fixed namespace inside an
owned private parent. Existing/missing/partial state is never silently reset.
The parent argument is an offline test/library seam, not a configurable live
budget: operational binding to one non-disposable owner state root remains a
separate consumer requirement.

One exclusive0600 claim must span the whole writer lifetime, with no PID-based
takeover. Journal and immutable sequential head receipts are0600, the state
directory700; fsync files and directories before acknowledging a reservation.
Verify canonical policy, all head receipts and exact file identities. Refuse
unknown files, aliases, truncated tails, missing head receipts and any persisted
uncertainty. A normal close can release only its own claim; an interrupted or
poisoned writer leaves the claim, and never reclaims a reservation.

Because no receipt/cache reconciler exists yet, the first reserved query blocks
all later reservations in this namespace, including after reopen. This is an
intentional fail-closed intermediate stage, not a working multi-query live run.
No completion/refund API or boolean that fabricates payment proof.

Write tests first: actual owned-temp initialization/reopen, two-process
contention, crash after journal fsync before head persistence, low balance,
corruption and immutable-source preservation. At most two bounded fixture
children; join every child. One exact-root strict check and sequential full
four-worker gate per commit, no concurrent reviews or duplicate full gate.
Commit locally and fast-forward main; no keys, network, paid calls or push.
