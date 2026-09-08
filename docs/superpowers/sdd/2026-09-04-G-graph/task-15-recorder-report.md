# G15F private durable response capture

The [recorder brief](task-15-recorder-brief.md) releases an offline-library
recorder in the existing harness. All writes in this checkpoint used synthetic
owned temporary files; no operational budget/cache, Keychain, actual endpoint,
signature, paid request or live consumer run occurred. Client source is entirely
unchanged. The library cannot fetch, sign, pay, clear a reservation or replay.

Creation requires an original current-source query binding and a private parent.
It exclusively creates a query-digest directory, owned claim and binding intent.
Each bounded response becomes an exclusive immutable file with sequence,
previous hash, capture time, original selected headers/status/base64 body and
body digest. Both file and directory sync plus readback/claim/source checks
precede successful observation acknowledgement. Existing bytes and exact
directory inventory are checked before further capture. Fixed errors never
include paths, raw provider bytes or injected filesystem diagnostics.

Each observation allows at most1MiB original body,16384bytes per selected
header/32768combined. New recorder bounds are2MiB per file,16MiB stored response
records,32 snapshots and5s per acknowledgement. Existing reservation writer's
32768-byte default and all payment/window/cap/replay policy remain unchanged.
Synchronous filesystem calls cannot be interrupted while in the kernel; signal
and monotonic-clock checks refuse acknowledgement after late IO. This is bounded
cooperative-local-storage handling, not a power-loss or malicious-owner sandbox.

Only one initial challenge and at most one paid response can be captured; RPC
responses are bounded and tied to the fixed RPC destination. Query responses
must match the binding's exact request-body digest. Paid402/500 bytes can be
retained, but every summary still says `receiptProof:not_checked`. Raw RPC
request hashes are not yet correlated receipt proof. Partial/oversized transport
failures may produce no complete snapshot and remain unresolved elsewhere.

Any recorder error, source change, re-entry, cancellation or late acknowledgement
poisons the handle and retains its files/claim. Clean close only releases its
own claim and leaves evidence files; recreation always refuses. As with the
reservation writer, an error syncing the directory after claim unlink can be
reported after the claim has gone; exclusive capture-directory creation still
prevents reuse. There is no reopen, takeover, recovery, refund or cache operation.
Provider bytes may be sensitive and must remain private, never public output.

## Executed checks

The initial missing-export Red preceded implementation. Final focused suite:
**59 Bun tests/415 assertions in2.07s**, exact two-root strict0. Tests cover
byte-exact non-UTF8 storage, hash linkage, ownership/modes, exclusive creation,
clean-close preservation, failed paid responses, original client malformed402
observation before its existing validator refuses, malformed/open/getter data,
wrong destination/body digests, source changes, truncation/hardlinks/public modes,
unexpected files, pre-abort/post-sync cancellation, late/backwards clocks,
reentrant close, response-order/count/byte limits and post-sync injected failure.

An actual bounded child process exited29 immediately after exclusive record-file
sync. Its file and claim remained; recreating that query recorder refused. This
is process-death evidence, not a simulated power-loss durability guarantee.
Synthetic paid402/500 recorder inputs were not real payments or receipt proofs.
All owned fixture directories/children were cleaned/joined; no broad cleanup.
The sole sequential four-worker gate78900 passed:5337Vitest/242files69.64s;
1481Bun/98files with12389assertions199.32s;root/webstrict and client/SSR
builds331/162ms. Final six-path/three-link/privacy audit and three source/brief
pins are checked after three result annotations. No full suite repeat.

## Next three steps

1. Add bounded readback and independently validated per-query result/receipt
   cache, keeping partial captures and failed records non-reusable.
2. Bind one owner-state root and durable reservation/balance/forward intents
   around the actual consumer; no automatic refunds or paid retries.
3. Test no-key historical replay and separately review live authority. Retained
   Base approval versus latest testnet-only wording and a new Arc purchase remain
   unresolved; G15 live stays NOT_RUN.
