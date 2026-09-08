# G15I durable private forward-intent capture

This is a G15 checkpoint, not Plan I packaging. The
[intent-store brief](task-15-intent-store-brief.md) releases a private recorder
method matching `beforePaidRequest` and optional forward-file readback. No actual
owner signature, key, endpoint, payment, operational budget or live consumer was
used. Positive fixed-payer fixtures are explicitly declared synthetic intent
data; they are not signatures from that owner or proof of dispatch.

The exclusive32768-byte `forward.json` records fixed policy/query, the initial
three-response prefix hash/count, observed time and canonical public intent.
Payer/payee/token/domain/network/amount, query digest, nonce/authorization shape
and canonical JSON digest must match. Stored validity must be unexpired at the
capture time and at most300s beyond that time; an aged authorization is data,
not a replacement for the unchanged client's295..300s signing admission rule.
Historical reads use captured time, never treat expiration as a new approval.

File/directory fsync, readback, claim/source/signal/deadline checks precede
acknowledgement. A second intent, early/late prefix, malformed data or failed IO
poisons the handle and retains the claim. After an intent, the next response
must be the single paid response immediately after that prefix. The reader
rechecks intent hash, prefix, time and next-response correlation. Older captures
without a forward file remain inspectable and explicitly return null intent.

The one additional metadata filename raises physical directory inventory to35
entries when claim/intent/forward/32responses all exist; it grants no additional
response or payment slot.32 response slots,16MiB response total,2MiB response
file bound and existing payment/window/cap/replay policy remain unchanged.
The Graph client source is entirely unchanged in this checkpoint.

Neither an intent nor its header SHA256 proves a signature, paid dispatch,
receipt or cache eligibility. RPC meaning/correlation and verified results are
still pending. All summaries retain `receiptProof:not_checked`; failure never
reclaims a reservation, retries payment or overwrites retained evidence. Provider
bytes and intent records remain private, not CLI/public dumps.

## Executed checks

Observed missing-method Red preceded implementation. Final focused checks:
**84 Bun tests/619 assertions4.09s**, exact two-root strict0. Tests cover durable
readback/nested immutability, legacy absent intent, exclusive/early/after-paid
refusal, rehashed wrong payer/domain/network/token/payee/amount/query/time/nonce/
shape, mismatched digests/getters, pre-abort/post-sync error/abort/deadline/reentry,
post-intent RPC refusal, altered/linked forward files and prefix/time mismatch,
historical expiration and corruption before recording a paid response.

The actual client with the public synthetic key received an injected valid402
and two RPC observations, then the fixed-owner check refused its mismatched
payer. The first and next query both refused with exactly three transport calls,
zero paid sends and no forward file. The owner policy was not replaced for test
convenience. A separate actual child exited31 after forward-file sync: the claim
and declared intent remained, with three responses/zero paid responses and no
reusable success. Owned children/files were joined/cleaned, never operational
state. Process-death tests are not power-loss durability guarantees.
The sole sequential four-worker gate95892 passed:5348Vitest/242files69.07s;
1507Bun/98files with12629assertions199.80s;root/webstrict and client/SSR
builds336/188ms. Final six-path/three-link/privacy audit and three source/brief
pins are checked after three result annotations. No full suite repeat.

## Next three steps

1. Independently correlate original challenge, recorded authorization/header
   digest, paid response and pinned-token receipt/nonce/block evidence.
2. Persist a verified result for each query immediately and reject corrupted/
   incomplete cache without spending to refresh it; support qualified historical
   no-key replay separately from a fresh consumer execution.
3. Integrate fixed owner-root reservations and fresh pre/post balance enforcement
   across runs before any live review. Base and new Arc live authority remain
   unreleased; J4 and all existing owner pauses are unchanged.
