# G15H awaited pre-forward observation

The [forward brief](task-15-forward-brief.md) releases optional
`QueryOptions.beforePaidRequest`, captured once per factory. It runs after the
existing validated signature/payload creation and before the unchanged single
paid fetch. No actual endpoint, owner key, Keychain, payment, operational journal
or live consumer was used. Actual cryptographic signing in tests used only the
public synthetic key and injected/owned-loopback transport.

The immutable snapshot contains canonical endpoint/network/domain/primary type,
the original authorization fields and SHA256 digests of domain/primary-type/
authorization JSON, query body and encoded payment header. Its authorization
SHA256 is not an EIP-712 digest or independent signature proof. No private key,
raw signature/header, signer, mutable request or original payload is exposed.
The hook can refuse; it cannot repair policy or replace original bytes.

This is a signed-before-forward observation, not signer entry, a forwarded
request, a reservation, receipt proof or authorization to spend. A harness still
must reserve before signable work, fsync intent/balance/forward records, verify
actual forwarding and reconcile receipts before cache eligibility.

The callback gets a scoped abort signal and must return within the original
overall deadline and an additional at-most5s observer bound. Monotonic clock
checks before/after prevent a blocked timer or late synchronous completion from
forwarding. Rejection, external abort, stalled or late callbacks leave the
original signed-uncertainty state terminal; neither callback completion nor a
subsequent query retries the paid request. No callback leaves the existing route.

## Executed checks and unchanged policy

Observed missing-observer Red: the actual synthetic query completed but received
zero intent observations. A second genuine Red showed a callback advancing its
clock5001ms could still forward before the overall deadline; adding explicit
scoped-clock checks fixed it. Final focused checks: **79 Vitest tests506ms**,
**seven native Bun tests/108 assertions2.92s**, exact three-root strict0.
Initial sandbox loopback-listener creation failed; the same focused suite passed
with scoped loopback permission. One native nonce matcher annotation was fixed.

Tests verify exact authorization and header/body/JSON hashes against the actual
synthetic wire, nested immutability, no signature/key exposure, callback ordering/
capture-once/replacement, invalid callback and unsigned-policy refusal, callback
failure, timeout/external abort/late completion, original overall deadline,
exact5000ms/5001ms boundaries and backward clocks. Native cases cover success,
redirect, signed500 and intent-refusal with zero paid sends in the last case;
owned listeners and inert subprocesses were joined by fixture cleanup.

Four original source segments remain byte-identical to5f14468:

| Protected segment | SHA256 |
|---|---|
| Reader/RPC/receipt | `f168f7951ae8eff10dd6bad82b13ebb62720665194f9f56fd13373e0f45f74b2` |
| Signer validation/nonce/counters | `819f2d9eedfe3ce42411e15f9388929800c938a7c0fc28fa3cd4aa480970b5c7` |
| Signing call | `e8ea780a68bc0c36e807a864959306cbfe172f89e3269267e76d4883ad1c6988` |
| Post-paid verification | `89e4d6822529b77ed0523413f6c484796407d23921456843994392e434aaf891` |

Five original guard lines also remain unchanged: attempt/signature/uncertainty
guard,85000ms timeout cap,80000ms default, original paid fetch and terminal
signed-error handling. No existing validity constant, cap, nonce or replay guard
changed. The former whole-suffix pin is intentionally replaced by these precise
segment pins because the narrow instrumentation is now inside that suffix.
The sole sequential four-worker gate62400 passed:5348Vitest/242files68.61s;
1495Bun/98files with12493assertions198.68s;root/webstrict and client/SSR
builds382/195ms. Final seven-path/three-link/privacy audit and four source/brief
pins are checked after three result annotations. No full suite repeat.

## Next three steps

1. Persist and revalidate the pre-forward intent against query/source/budget and
   fresh balance evidence; do not initialize operational state in offline tests.
2. Correlate that intent, original response and receipt before per-query cache
   acceptance, with conservative retention across interrupted writes.
3. Integrate global owner-root accounting and no-key historical replay, then
   review live authority separately. J4 and G15 live remain paused/NOT_RUN.
