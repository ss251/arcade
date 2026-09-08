# I2A offline header sanitizer

Implements the safe offline subset in the [sanitizer brief](task-2-sanitizer-brief.md).
The new capture-x402-header script is currently a pure library plus inert status/
help CLI, not a listener or writer. --live/--capture/output options refuse before
activation. No actual circle-cli-1.0.0-payment.json fixture is created; every
test header is explicitly synthetic, not an owner/client signature or capture.

sanitizeCircleHeader accepts only the standard payment-signature or legacy
x-payment name carrying a supplied v2 payload. It bounds the canonical base64
header to32768characters and decoded UTF-8/JSON to16384bytes. Round-trip canonical
JSON rejects duplicate keys and ambiguous spellings. Exact field whitelists
precede serialization. Public context binds a127.0.0.1 loopback capture path,
payer and payee; fixed Arc token/network,10000-atomic amount and capture probe
description prevent arbitrary URL/diagnostic channels. Known public Gateway/
USDC metadata is typed and bound; unknown nested bearer fields refuse.

The canonical signature is replaced by the plan's fixed dummy. Authorization
fields and echoed timeout are preserved, not rewritten to pass ARCADE payment
admission. In particular, the2592000-second fixture remains2592000, and a full
uint256 authorization time can be represented without applying any production
lifetime policy. Accepted shape does not imply cryptographic validity, freshness,
live provenance, client-version identity, domain acceptance or payment success.
Return value says signatureScrubbed=true, authenticated=false and
provenance=supplied-header-shape-only, with immutable sanitized text. Optional
public fields stay absent if absent; schema defaults do not fabricate raw capture.

This deviates from the literal plan template, which spreads the full untrusted
object after replacing only payload.signature and immediately writes it.
Unknown nested credentials could survive that template. This boundary never
returns raw text/signature/object/diagnostics and has no disk, wallet or network
API. Valid public integers/addresses/nonces are not a general covert-secret
detector; source/provenance review remains necessary. The dummy makes the
canonical output a shape fixture, never an authentic payment payload.

## Executed verification

Initial expected missing-module Red:0pass/1fail/1module error. After implementation,
the first actual decoder round-trip passed one test/nine assertions. Final focused
14nativeBun/146assertions/1.71s and exact two-root strict0 PASS. No production
schema, decoder, rail, authorization validity, cap or replay changes were needed.

The unchanged PaymentPayload decoder, decodeHeaderJson and public accessors
accept the sanitized synthetic v2 nesting, including the legacy header name.
Tests preserve times/amount/nonce, reject flat/v1 shapes, unknown bearer fields
at every level, descriptions/URLs carrying diagnostics, unsupported metadata,
wrong public binding/token/network/amount, uint overflow, unsafe timeout numbers,
invalid signature/nonce shapes, malformed UTF-8/base64, duplicated/noncanonical
JSON and byte overflow. Getter-backed context refuses without evaluation.

An actual empty-PATH child imports and sanitizes under traps for Bun listener/
subprocess APIs, Node subprocess APIs and global fetch: zero forbidden calls.
Native CLI help/default/live/output-flag checks remain inert despite capture-like
environment variables. These are offline process tests, not actual Circle CLI
compatibility or proof of chain interaction. Source has no file writer; the
test does not claim an independent whole-OS filesystem trace.

The sole sequential four-worker full gate48795 passed all5371Vitest tests
but failed one of242suites in H8 teardown after70.34s. At
apps/web/test/skill-route.test.ts:77, the post-close socket check returned
still_listening instead of ECONNREFUSED, after exit0/null-signal checks passed.
This is the same observed failure shape previously retained in G15P. The failed
run did not retain port/listener identity. A later read-only process inventory
found no H8 fixture or test gate; it cannot identify the earlier listener.
Port reuse remains a hypothesis, not an observed cause.

Root-cause-first inspection found no related source diff. One isolated H8
run95372 passed11tests/2.07s including cleanup. No H8 source or assertion changed.
Only skipped stages ran in43943:1835Bun/99files14330assert312.52s, root/web
strict and client/SSR328/182ms all PASS. The original full gate remains failed;
there is no whole-gate repeat or all-green relabel. Final six-path audit checks
three local links, no privacy matches and three unchanged source/brief pins.
Production payment/consumer source is unchanged and the real CLI fixture remains
absent. Atomic local commit/mainFF follows. No real header, listener against a
wallet, credential, signature, RPC/payment, approval replay or push.

## Next three steps

1. Finish the sole full gate, final scope/pin audit, atomic local commit/mainFF.
2. Add bounded inert listener/storage tooling consuming only sanitized text,
   with synthetic owned-loopback and interruption/no-raw-write tests.
3. Keep I2/I3/J4 live paused; capture the real versioned fixture only after
   owner release, then test it separately without broadening production rules.
