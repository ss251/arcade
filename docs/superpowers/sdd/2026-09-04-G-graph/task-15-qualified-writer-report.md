# G15R opt-in qualified reservation writer

The [qualified-writer brief](task-15-qualified-writer-brief.md) adds a separate
constructor accepting an original current-source manifest. It requires empty
or fully qualified retained state before acquiring a claim, then revalidates
under its exclusive claim within the existing five-second local IO deadline.
Late or uncertain opening retains the claim and returns no writer authority.

Each subsequent state read compares the raw ledger/head hash to the qualified
view of those exact bytes. Only derived unresolved count can decrease after
complete evidence; original reservation/evidence/video/atomic counts, unique
query rule, immutable heads and ledger bytes remain. Admission additionally
refuses orphan query/balance/cache paths and a balance differing from the prior
qualified after-observation. The read-only view exposes that immutable last
observation. Existing raw-writer behavior is preserved through a thin wrapper.

Partial/unknown history refuses qualified reopen before a new claim; changes
to active source, cache or head poison the writer and retain its claim. There
is no reset, refund marker, claim takeover, mutable paid override or operational
state-root selection. Retained consistency is not authenticated acquisition,
independent chain consensus or fresh signing/spending authorization. Coherent
same-owner rewrite limitations remain. No existing payment validity/cap/replay
rule, Graph client or skill consumer changed.

## Executed checks

Missing-export Red preceded implementation. Two further admission Reds showed
an orphan cache could otherwise precede a reserve and a new balance could
contradict the qualified prior after-balance. The opt-in-only checks correct
both before journal mutation. Eleven selected Bun/53 assertions/5.15s and exact
two-root strict passed.

The positive sequence uses actual reserve calls, original one-use handoffs,
original journal/cache/reader code and declared synthetic protocol data in one
owned offline namespace. No evidence relocation or rehashing is used. Identity
query spends a declared10000 from1000000; after close/reopen the attestations
query spends a declared10000 from990000 to980000. The ledger prefix remains;
reservations2/evidence2/reserved20000 persist and derived unresolved is0. The
original raw writer still sees unresolved rows and refuses another reservation.
A duplicate query is refused with unchanged ledger. This is not a real payment.

An actual empty-PATH/network-forbidden competing child exits38 without stealing
the claim. Another child exits39 after the second reservation journal sync but
before head02: both raw reservations remain unresolved, the claim remains, and
qualified reopen refuses. A five-second late opening retains its acquired claim.
Copied sources, corrupt caches and source/cache/head changes also refuse.

Initial complete focused run:318PASS/1 older fixture FAIL,1621 assertions/25.95s.
The frozen journal clock was paired with a real-clock intent; a second-boundary
crossing can correctly reject the intent before the intended file-sync hook.
A deterministic one-second wall-clock advance reproduced the refusal. The
fixture now accepts an explicit time and supplies the frozen time in the three
affected journal/forward tests; default behavior is retained. A regression
test proves the intended persisted record. No production time bound changed.
Final focused320Bun/1636 assertions/26.03s and exact two-root strict0 PASS.

Mechanically reversing the writer factoring, narrow opt-in checks and readonly
last observation restores the entire prior harness exactly, SHA256
`60755b5a3aa7699dbb1b32f40cd8694e326052ac5e584086194429761349c4a4`.
Client and consumer remain unchanged. Sole sequential four-worker full gate
44108 PASS:5370Vitest/242files69.12s,1743Bun/98files13646assert218.43s,
root/web strict and client/SSR354/169ms. Final six-path publication audit checks
three local links, no privacy matches and three unchanged source/brief pins.
Atomic local commit/mainFF follows; no full gate repeat.
No operational namespace, actual key/RPC/endpoint/payment, approval replay or push.

## Next three steps

1. Complete the sole full gate, audit, atomic local commit and exact-one mainFF.
2. Integrate fixed owner-root consumer orchestration without turning arbitrary
   audit paths into live authority or reimplementing the original payment client.
3. Add full historical no-key replay that bypasses signing and assessment-key
   validation; operational initialization and live/owner checkpoints stay separate.
