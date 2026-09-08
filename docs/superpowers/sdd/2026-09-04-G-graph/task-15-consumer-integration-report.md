# G15U controlled original-consumer integration

The [consumer-integration brief](task-15-consumer-integration-brief.md) adds
runGraphCogsOwner as an inert library entry point. It selects the fixed OS-account
state parent and current local source manifest internally. Misses require explicit
command and transport capabilities. No ambient defaults, CLI live mode, state
initialization, source/root override or spending approval is introduced.

Existing complete assessment artifacts replay without invoking the consumer,
key command, signer or transport. Corrupt present artifacts refuse rather than
trigger a paid refresh. Complete retained query history can materialize its
missing assessment artifact without another purchase, labeled historical replay.
Partial qualified history reuses the first query and admits only the missing
second query before key lookup. All prior quota charges remain.

For a miss, known-state checks, the exclusive qualified writer, fresh admission
balance, reservation, original handoff and admission/response journals precede
runGraphJob and key lookup. One original makePaidQuery factory preserves the
original client's signer, query binding and awaited hooks. Each potential send
requires a fresh balance and durable pre-forward/intent records within the
original callback deadline. Successful results are immediately verified and
cached before any later query. The after-balance is acquired once under a bounded
cleanup-only signal even after abort or a failed paid response; available low or
unexpected facts are retained. Qualification precedes admission of the next query.

Failures retain reservations and claims for reconciliation. There is no retry,
refund, reset, takeover or repair. Configuration references are captured before
the first await. The result separates reservationAttempts from acknowledged
queryReservations; an unacknowledged attempt may still have persisted. Counts
of forwardIntents are acknowledgements, not proof of network delivery.
consumerWorkSettled describes tracked query/key wrapper promises only. A six-second
cleanup grace reports false if they do not settle; it cannot prove shutdown of
an arbitrary injected transport or OS process. Synchronous filesystem work is
not preemptible. An owned-process hard deadline remains a separate release step.

The outer controlled-consumer mode/accounting describe this invocation. Its
nested GraphAssessmentReplay artifact is a historical replay-ready representation
and therefore still says newPaidQueries=0 and freshConsumerRun=false; those
nested fields do not claim that the outer invocation made no new requests.

## Executed checks and corrections

A missing-export Red preceded implementation, after correcting an isolated-child
OS metadata mock to capture the original value before mocking.13 selected tests
passed165assert/10.06s with exact two-root strict0. Expanded21 selected tests
passed238assert/34.33s and strict0. A separate unresponsive-command fixture passed
one test/nine assertions/7.28s, reporting uncertain cleanup and retaining its claim.

Review reproduced two additional bugs before correction. Mutating the caller's
allocation during key lookup split two reservations between evidence and video;
snapshotting configuration now keeps both in the original allocation. The first
edit accidentally placed one declaration in the original balance reader; a
focused ReferenceError exposed it, it was moved into the new integration, and
the regression passed one test/four assertions/5.95s with strict0. Separately,
an invalid signal object escaped the fixed refusal through finally cleanup.
Validating the requested signal before assigning the cleanup reference fixed it.

Final focused suite:384 Bun tests PASS,0FAIL,2067 assertions,120.88s; exact
two-root strict0. Tests cover one/two-query success; missing/wrong key; low
admission/pre-forward balance; corrupt current head; paid500; invalid receipt;
missing, unexpected and below-floor after balances; cancellation during paid or
pre-forward work; late transports; bounded pending-key cleanup; immutable
allocation; malformed options/getters; partial-cache second-query admission;
first-query retention after second failure; no-key full replay/materialization;
and corrupt-artifact refusal without a paid refresh.

All new integration scenarios use actual owned temporary Bun processes with
empty PATH and mocked OS-home metadata. Positive account derivation is expressly
simulated. The original consumer/client and real public-fixture signing execute,
but receipts, balances, endpoints and owner-shaped identity are synthetic; this
is not an owner signature, authenticated chain evidence or a paid live proof.
Wrong-account rejection uses real cryptographic derivation. The unresponsive
command-owner test is a mock, not an actual hung Keychain/OS child. No real key,
Keychain command, RPC endpoint, operational budget or funds are touched.

Removing only the integration block and its two imported aliases restores the
entire prior harness exactly, SHA256
`058f6ca6e3e0ce03d6398fcb23b3863519377506e77fd0438bd8a102ab11d93b`.
Original client/consumer/synthesis/schema remain unchanged, including payment
validity/caps/replay. Sole sequential four-worker full gate84737 PASS:
5371Vitest/242files69.82s;1807Bun/98files14075assert293.98s;root/web strict
and client/SSR390/198ms. Six-path audit checks three local links, no privacy
matches and three unchanged source/brief pins. Atomic local commit/mainFF
follows. No full repeat, live authority, approval replay or push.

## Next three steps

1. Finish the sole full gate, final audit, atomic local commit and exact-one mainFF.
2. Define and test the remaining owned-process invocation/termination boundary
   without enabling operational initialization or live calls.
3. Update readiness/runbook with retained-cache reuse and honest uncertainty;
   keep Base authorization review and the separate Arc/J owner checkpoints paused.
