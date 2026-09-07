# G15B offline durable writer

The [released scope](task-15-writer-brief.md) is implemented as library exports
in the existing G15 script. CLI remains read-only, liveEnabled false. All
mutating executions used disposable owned synthetic fixtures; **no operational
approval ledger, payer key, current RPC, signature or payment was touched**.

## Storage contract and limits

Initialization exclusively creates the policy's fixed-name child inside an
explicit private owned parent. Repeating initialization refuses; ordinary open
does not create missing state. A retained exclusive0600 claim has a random
identifier and policy binding, with no PID/time-based takeover.

State is a700 directory containing a600 canonical reservation journal and
immutable600 head receipts0..N. Each receipt pins the complete journal prefix
SHA256 and count. The writer checks the fixed policy, journal chain, all heads,
bounded exact directory inventory and private file identities. Initialization
and reservation acknowledgements follow file/directory fsync. No existing head
receipt is overwritten; a torn/missing head or changed prefix refuses.

A successful reserve records potential exposure, not a signed request. It
accepts only a captured allocation/query digest and a canonical balance string
meeting the pure910000 arithmetic threshold. The balance is not independently
read or persisted as authenticated RPC evidence, and the opaque query digest is
not yet bound to a validated request/source/response. Both remain prerequisites
for the eventual consumer. Because no receipt/cache reconciler exists, the
first unresolved reservation blocks a second one, including after clean reopen.

A normal close removes only its matching claim and syncs the directory. Any
write/interruption/re-entry failure before release leaves a poisoned retained
claim. There is no rollback, quota reclaim, resume or automatic stale-lock
removal. A directory-sync error after unlink during normal release can report
failure after the claim is already removed; durable reservation/head state
still records exposure and blocks subsequent reserve. No stronger filesystem
atomicity is claimed.

This provides cooperating local-process durability boundaries, not resistance
to malicious rewriting/removal of all state, physical power-loss proof, network
filesystem guarantees or unrelated wallet spending. The library parent argument
is an offline seam; fixed binding to one non-disposable owner state root is
still required. Standalone CLI journal audit explicitly reports durableState
not_checked because it does not validate writer heads/claim ownership.

## Executed tests

Initial Red: missing writer export. Initial implementation passed21 focused
tests/127 assertions. Review then reproduced a re-entry bug: a hook catching
the refusal from close() during an active write could still receive a successful
reservation acknowledgement. The regression failed, then explicit poison/busy
checks and per-call busy ownership fixed it. A nested reserve also cannot
clear the outer write's busy flag.

Final focused selection before gate: **26 tests,149 assertions,266ms**. Actual
private temporary files test exclusive init, reopen with unresolved exposure,
missing state, held claims, low balance/getters, corrupt or hard-linked heads,
unknown files and unsafe parents. A real child exits27 immediately after
journal fsync and before head persistence; exposure and claim remain and reopen
refuses. A separate child process refuses while the parent holds the claim and
opens only after it closes. Children were bounded and synchronously joined;
this is cross-process contention, not a simultaneous-start stress benchmark.
The hook exception is injected failure, not an induced hardware fsync failure.

Exact two-root strict initially reported six diagnostics from the overloaded
lstatSync ReturnType including undefined. Using the concrete Stats type fixed
that without casts or weakened compiler options; final strict reported zero.
The sole four-worker full gate46408 passed:5327Vitest/242files in70.35s;
1448Bun/98files with12111assertions in197.13s;root/web strict;client/SSR
builds346/171ms. Final six-path/three-link/privacy review and the two script
plus brief hashes are checked after these three result annotations. No full
gate repeat and no paid/live evidence claim.

## Next three steps

1. Fixed owner-root binding plus typed request/source/intent and bounded,
   independently verified balance observations; no arbitrary CLI budget path.
2. Transparent original402/paid-response recording and per-query validated
   receipt/result cache, then a receipt reconciler that never refunds exposure
   or turns uncertainty into retries. No-key complete artifact replay is separate
   from partial cache reuse in the actual consumer.
3. Review all safety layers and live authority before a real sequence. The Base
   allowance is unconsumed here; latest testnet-only wording needs resolution,
   and a new Arc G15 purchase remains outside the retained Base exception.
