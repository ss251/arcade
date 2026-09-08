# G15Q readonly global retained-evidence qualification

The [qualified-budget brief](task-15-qualified-budget-brief.md) adds an inert
global view. It validates the fixed-namespace canonical ledger, every immutable
head and exact bounded inventory, with optional existing claim syntax. Original
source-manifest identity and unchanged current source are required; copies do
not become source authority. No namespace or claim is created by reading.

Every original reservation/evidence/video/atomic count stays unchanged. Separate
`qualifiedPaid` and derived `unresolved` counts distinguish complete retained
consistency from raw ledger exposure. The original decoder and writer remain
unchanged and still refuse any raw unresolved row, even after a qualified view
is returned. This is not yet live or opt-in writer admission.

Each candidate needs complete private unclaimed balance and query-cache files.
Missing/partial evidence remains unresolved; malformed complete evidence refuses.
Once a row is unresolved, all later rows stay unresolved. Each complete binding
is reconstructed through the existing encoder/source binder from bounded saved
data, then compared exactly. Attestations must name an earlier qualified identity
query in this same ledger and use its actual retained Graph block/result.

The existing journal/protocol/receipt/cache/balance verifier checks each candidate.
Global transaction/nonce uniqueness and consecutive exact balance, observation-
time and block-identity continuity are required. Candidate proofs, selected
ledger/head/manifest bytes, directory identities and source are revalidated
before acknowledgement within one shared five-second local deadline. No refund
flag or new mutable completion marker is needed: immutable complete cache and
balance-journal files already retain the evidence.

Qualified retained consistency is not authenticated acquisition, independent
consensus, original-close acknowledgement or fresh signing/spending authority.
The same-owner coherent-rewrite limitation remains. No existing payment validity,
cap or replay protection changes. Removing the new view restores the prior
harness exactly (SHA256
`b88efda41340d17341e06ae1cd2d90ab371a7247324b1e2b9279947c42ac4ea1`);
client/consumer unchanged.

## Executed checks

Missing-export Red preceded implementation.21 selected Bun/55assert3.24s and
exact two-root strict0 passed; final308focusedBun/1581assert21.79s and strict0
passed. Tests cover empty/missing/pending state, copied/changed source, partial
claims/cache/markers, unknown files, aliases, corrupt heads/ledger/evidence,
cancel/backwards/deadline and retained raw quota counts. The original writer
still refuses another reserve after qualified readback.

A two-query fixture assembles declared history from two owned offline writers,
relocating/rehashing the second reservation explicitly as synthetic construction.
It is NOT a successfully admitted second global reserve or a live payment. Each
query is independently consistent, then global balance/time/block discontinuity
tests demonstrate why that is insufficient. The original protocol fixture only
gains optional test receipt metadata and identity data; existing defaults remain.
An actual empty-PATH child with network forbidden reads the same immutable global
result. No operational root, real key, actual RPC/endpoint/payment/spend or push.
Sole sequential four-worker full gate10798 passed5370Vitest/242files71.81s,
1731Bun/98files13591assert219.28s, root/web strict and client/SSR350/164ms.
This passing H8 cleanup does not erase G15P's earlier recorded teardown concern.
Final six-path publication audit: three local links, no privacy matches and
three source/brief pins unchanged. Mechanical preservation still passes.
Atomic local commit and exact-one main fast-forward follow; no full repeat.

## Next three steps

1. Add a narrowly opt-in qualified writer that revalidates this view under its
   own exclusive claim, preserving original raw-writer behavior and all quotas.
2. Prove an actual two-reservation offline sequence/reopen/failure using that
   writer, without synthetic relocation or new payment authority.
3. Integrate fixed owner-root consumer orchestration and historical no-key replay;
   keep operational initialization and live/owner checkpoints separate.
