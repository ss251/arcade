# J8D3 — durable escrow root tree closure

Implements the [closure brief](task-8d3-brief.md). No escrow payment/HTTP boot
activation, provider capability forwarding or pipeline completion is claimed.

## Change

An escrow root now prepares its immutable child ceiling on current SQLite
before dispatch. A persistent close flag stops new reservations, independent
of the unchanged hire-capability expiry. Closed trees retain pending holds;
existing children can resolve reserved to committed or released once, but a
conflicting terminal transition cannot reopen/reallocate their money. With no
pending holds, the closed tree is stable. Released child IDs remain retained.

Escrow tree reservations, transitions and reads bypass legacy per-process
caches. Two handles therefore share the real held/committed balance. An
unrelated legacy root cannot steal an escrow child through a stale cache.
Legacy roots retain their existing admission/accounting semantics. No existing
payment authorization window, amount cap or replay rule changes.

Header and ordered reservation rows are hashed into the reciprocal escrow
admission binding. Missing/deleted/altered headers or rows fail current reads
and restart rather than reopening work. This detects inconsistent local data,
not a malicious administrator rewriting both data and digest. Current-disk
write/readback and immediate transactions prevent ignored writes or deferred
commit failures from publishing authority. The limit is1,000 retained children
per root with no eviction and no more roots than the existing10,000admissions.

For a prepared tree, confirmed terminal storage requires closure, no pending
holds and exact child-ID/amount/settled, ceiling and committed totals. Uncertain
terminal evidence can retain pending holds; it does not silently complete or
release them. Actual full-child receipt provenance remains a pipeline duty.

## Verification

Initial Reds reproduced an escrow reservation accepted before preparation and
the missing prepare API. A legacy-root regression then caught applying escrow
ID validation to unrelated legacy roots; routing now checks actual ownership
first. The final focused set passed82actual SQLite tests/3files,444assertions
in3.22s:22newtree cases,3newterminal integration cases and57existing cases.
Coverage includes two-handle/restart closure, fixed ceiling, zero-budget leaves,
eight corruption modes, six ignored/deferred write failures, foreign context,
uncertainty, retained capacity, duplicate ownership and returned-copy isolation.
An initial test incorrectly matched a tagged error's empty message; its final
assertion checks the actual error class. No production error was hidden.

Five-root strict checking reported zero diagnostics. The sole sequential full
gate passed5,097Vitest/234files in71.00s;1,100Bun/80files,8,340assertions in183.54s;
root/web strict checking and client/SSR builds. Ten paths/75local links passed
the scope/privacy freeze; five code/test pins are checked again before commit.
All fixtures are local/ephemeral; no owner keys, real RPC, payment,
deployment, approval replay, production mutation or push.

## Next

Compose the actual typed execution/submit/complete/reject pipeline using this
closure before tree commitment, with uncertainty fencing and post-durable
attestation. Then budget/root HTTP and explicit durable boot, followed by Task9.
J4/J5 live and J6 treasury/size checkpoints remain paused.
