# G15O durable reservation-bound balance journal

The [balance-journal brief](task-15-balance-journal-brief.md) adds an inert
library recorder only. Creation consumes the original handoff once, including
refusal, and requires its exact original binding/private parent, active owner
claim/head, unchanged source and fresh originally acknowledged admission balance.
Copies, equivalent new bindings, reopened history and failed attempts cannot
resume an unresolved slot. No operational namespace is initialized by the CLI.

The exclusive private `balance-<queryHash>` directory contains a source/query/
handoff manifest and canonical admission, pre-forward and after observation
files. Each bounded immutable file is linked by hashes, synced and read back
under directory/file ownership, mode, inventory, alias and claim checks. A
complete marker binds all three records before claim release. Synchronous IO
cannot be preempted; monotonic five-second local checks gate acknowledgement.
Source and original global claim/head checks run before and after persistence.

Pre-forward observations must remain sufficient and unchanged from admission;
the existing public-intent validator is reused. Final acknowledgement rechecks
observation freshness and intent expiry, closing two experimentally reproduced
file-IO timing gaps. No existing payment authorization validity constant, cap,
signer, client or replay protection changes. After observations retain valid
zero/low/unexpected balances; they are facts for later refusal, not successful
payment or proof of a particular balance delta.

Errors, callback changes, re-entry and late acknowledgements poison the recorder
and preserve partial state. Incomplete close refuses. A complete marker with a
remaining claim is not accepted close; a lost acknowledgement after claim release
is reported as failure even if valid completed bytes remain. Neither case clears
the global reservation, permits retry or resets quota. Hashes are consistency
checks, not authentication against a malicious owner rewriting all files.

## Executed checks

Missing-export Red preceded implementation.37 selected tests passed before two
fixture typing corrections.245 full focused tests/1392 assertions and strict
passed, then two additional targeted timing tests failed as intended and were
fixed. Final247Bun/1400assert15.57s and exact two-root strict0 passed.

Tests cover original/copy/duplicate and wrong-scope handoffs, stale/future/wrong/
getter observations, source/claim/head/alias/mode/link/inventory changes, abort,
duplicate/out-of-order calls, incomplete close, callback mutation/re-entry,
post-sync failure and lost post-release acknowledgement. Actual empty-PATH/no-key
children exit36 after each of four file-sync stages; evidence and both claims
remain, the reservation is unresolved, and an attempted competing writer refuses.
Caller mutations do not alter saved copies. No actual key, endpoint, RPC,
operational budget, payment, new live authority or push. The sole sequential
four-worker full gate88949 passed5370Vitest/242files71.58s,1670Bun/98files/
13410assert211.00s, root/web strict and client/SSR430/204ms. Final six-path
audit: three local links, no privacy matches, three source/brief pins unchanged.
Removing the new journal block restores the previous harness byte-for-byte
(SHA256`aeda2a0ef7544ae15b4d5f016efe1e093ceb67044206c6c1654e563cf0d4eef0`);
client/consumer unchanged. Atomic commit/exact-one main fast-forward follow.

## Next three steps

1. Read back the complete balance journal against immutable reservation heads,
   current source and exact inventory; do not mint new process-local handoffs.
2. Correlate its intent and observations with cached protocol/receipt evidence
   before any owner-root reconciliation; retain all quota counts and uncertainty.
3. Integrate qualified historical no-key replay and separately reviewed consumer
   orchestration while live/owner checkpoints remain paused.
