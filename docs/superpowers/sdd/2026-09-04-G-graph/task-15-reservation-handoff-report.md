# G15N one-use fresh reservation provenance

The [reservation-handoff brief](task-15-reservation-handoff-brief.md) adds a
local provenance boundary before future balance-journal creation. Only an actual
successful `reserve` acknowledgement is registered in a process-local weak map.
It retains the originally validated balance/query/allocation, issuance time and
an active-owner/head check. Snapshots, JSON copies, decoded ledgers and reopened
unresolved history never become fresh acknowledgements.

The new handoff consumes that acknowledgement once, including failed attempts.
It requires the original current-source query binding, matching private parent/
namespace/query, active original writer claim and unchanged acknowledged head.
Claiming must finish within the existing five-second local IO budget from
issuance; backwards/expired local clock values refuse. This is a new local
process-lifetime boundary, NOT a blockchain authorization validity change.

The frozen reference contains policy/query/source/sequence/reservation digests,
allocation, original balance/amount and local times, never a private location,
key or signing/spending authority. A hidden live-owner reference is retained
for later one-use balance-recorder creation; that consumer does not exist yet.
Local references do not survive process death and cannot resume old exposure.
A failed handoff never refunds a reservation or resets its quota.

Ledger format/bytes, reservation counts, unresolved behavior and existing caps
remain unchanged. The only changes inside `reserve` capture its original balance
input before a hook could mutate the caller object and register the acknowledged
return after the original durable-write/readback checks. Reversing those narrow
additions and removing the handoff block restores the entire original harness:
SHA256`3c0c57bdaa47e486bd2855b1096e3163bd43bd4fe9b2b0b01f5f28e0f7b04ae1`.
Original client/consumer and all existing payment validity/cap/replay rules are
unchanged. This is an additional provenance refusal, not relaxed payment policy.

## Executed checks

Missing-export Red preceded implementation.209 focused Bun tests/1086 assertions
14.36s and exact two-root strict0 passed. Tests cover the real one-use return,
decoded/copied/snapshot/empty values, duplicate consumption, closed writer,
changed source/query/root/alias/head/claim, stale/backwards time and reopened
history. Ledger bytes remain identical and unresolved exposure remains counted.
An actual empty-PATH/no-key child exits35 when given its parent's serialized
acknowledgement; the original parent handle still works. A hook that mutates
caller balance input to0 cannot change the handoff's validated1000000 balance.

Only owned synthetic state/children were used and cleaned/joined. No operational
budget, real key, actual endpoint/RPC, payment, new live authority or push. The
sole sequential four-worker full gate29087 passed:5370Vitest/242files69.22s,
1632Bun/98files13094assert209.11s, root/web strict and client/SSR350/187ms.
Final six-path publication audit: three local links, no privacy matches, three
source/brief pins unchanged. Mechanical preservation checks still pass. No
full-gate repeat; the atomic local commit and exact-one main fast-forward follow.

## Next three steps

1. Consume this original handoff exactly once when creating a durable per-query
   admission/pre-forward/after balance journal; retain partial state on failure.
2. Revalidate those journal records against immutable reservation heads, cached
   query/protocol evidence and exact balance deltas before any reconciliation.
3. Add fixed owner-root reconciliation and qualified historical no-key replay,
   preserving all reservations and existing owner/live pauses.
