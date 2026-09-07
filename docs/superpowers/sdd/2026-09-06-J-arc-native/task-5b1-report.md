# Task5B1 — Private Unified Balance evidence journal

Focused durable-IO checkpoint within5B. The guarded SDK runtime, CLI, owner
instruction and live proof are still pending; this file is not live evidence.

`gateway-funding-journal.ts` now exposes a separate
`arcade-unified-funding-v1` writer/reader using its existing private-directory,
mode0600/owner/single-link file checks, no-follow opens, bounded reads and fsync
helpers. Existing F11 request formats, account claims and transition checks
remain unchanged. Unified events have a closed scalar schema and bind the same
immutable owner/source/delegate/amount plan throughout their hash chain.

An existing path is never reopened, appended as a new operation or overwritten.
Writes serialize, snapshot input before queuing, verify existing bytes before
append, and sync file/directory before returning. Failure poisons the handle;
close never deletes evidence. Terminal/unknown/out-of-order events are refused.
An external expected head can also detect a complete history rewrite; without
one, hash-chain integrity is not proof against a same-user rewrite.

This reuses IO, not F11's account-wide claim policy. A fresh filename cannot be
used to retry a one-shot approved live run: the5C supervisor must bind its owned
operation before invoking the runtime. This journal alone does not serialize
different operations/files/accounts or prove settlement. An SDK-returned hash
still requires independent readback and accounting.

Tests cover permissions/symlinks/hardlinks, competing opens, event snapshots,
queued close, immutable plan, no getters/secrets, truncation/tampering/head
mismatch and durable intent before a deliberately failing fake spend. Initial
missing-export run was setup failure, not behavioral Red. First9 tests passed;
expanded13 tests/37 assertions passed. An initial regression-test path did not
exist; it was corrected to the actual gateway-funding-runtime Bun suite before
the focused regression/strict/full gate. No skipped file is counted as tested.

Corrected focused regression run:55 Bun tests/2 files/202 assertions/1.82s;
four-root strict check0. Sole frozen43628 gate PASS:4,728 Vitest/210 files/
65.78s;887 Bun/58 files/6,413 assertions/169.86s; root/web strict; client393ms,
SSR208ms. Three source/test pins stayed unchanged. Seven-path/20-link scope
and privacy audit passed with empty index before staging. No full-gate replay.
No funding key, grant, deposit, spend, paid call, policy-window change, agent
or push.
