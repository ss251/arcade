# G15G read-only retained-capture validation

The [readback brief](task-15-readback-brief.md) releases only a private library
reader and tests. No operational state, key, actual endpoint, signature, payment,
consumer execution or cache replay occurred. Existing Graph client, recorder
format, authorization windows/caps/replay guards and reservation policy are
unchanged. The reader creates, rewrites, repairs or releases nothing.

Readback requires an original current-source binding, private canonical parent/
query directory, exact intent and optional canonical claim. Names are contiguous
and closed; records must have exact canonical JSON envelopes, fixed policy/query,
the correct sequence/hash chain and monotonic nonfuture capture times. Existing
response-shape/body/destination checks are reused. Per-file2MiB, total16MiB and
32-record bounds remain enforced even if all envelope hashes are recomputed.
Files and inventory are read again before returning immutable nested snapshots.
Acknowledgement is limited to5s; synchronous kernel IO itself is not preemptible.

The reader reports `claimPresent`, not “clean close succeeded.” A claim can be
absent after unlink but before a directory-sync error was acknowledged; neither
claim state proves a successful invocation. Empty and interrupted byte-complete
captures can be inspected. Every result still says `receiptProof:not_checked`;
paid-response counts are observations, not verified transfers or cache hits.
RPC hashes/bytes still need authorization/transaction correlation. Provider bytes
are private data; no CLI raw dump, proof promotion or automatic retry is added.

Current-source checks deliberately invalidate captures against changed pinned
code. This snapshot reader is not yet a historical-version archive verifier.
Double reads detect ordinary concurrent modifications, not a malicious file
owner who can rewrite all hashes. Missing/corrupt/aliased state refuses without
silently converting to an empty budget or payment refresh.

## Executed checks

Observed missing-export Red preceded implementation. Final focused suite:
**72 Bun tests/483 assertions in2.79s**, exact two-root strict0 after one test
record-spread annotation correction. Cases include immutable byte-preserving
readback, missing/empty/interrupted state, malformed claims/missing intent,
extra/gapped files, hardlink/symlink/public-mode/BOM refusal, duplicate keys,
torn tails, recomputed wrong policy/query/sequence/parent/body hashes, reversed/
future time, duplicate paid response, source/forged-binding mismatch, a change
between first and second reads, deadlines, record count and byte ceilings.
The large rehashed fixture is accepted at11records below16MiB and refused when
the twelfth takes it over the limit, rather than relying only on a negative case.

An actual bounded separate Bun process recreated the binding and read retained
files with an empty credential environment/PATH, emitting only claim/count/hash
summary. It exited0, emitted neither provider sentinel nor private path, and all
capture bytes remained identical. Owned children/directories were joined/cleaned.
This is local verification, not live receipt or payment proof.
The sole sequential four-worker gate66026 passed:5337Vitest/242files69.89s;
1494Bun/98files with12457assertions198.83s;root/webstrict and client/SSR
builds353/187ms. Final six-path/three-link/privacy audit and three source/brief
pins are checked after three result annotations. No full suite repeat.

## Next three steps

1. Add a narrowly reviewed authorization/forward-intent observation seam without
   changing the original payment policy or allowing late/duplicate dispatch.
2. Correlate recorded authorization, transaction receipt and original query
   response before creating any per-query verified result/cache entry.
3. Bind global owner-state reservation/balance accounting and no-key historical
   replay; review live authority separately. No Base or new Arc purchase now.
