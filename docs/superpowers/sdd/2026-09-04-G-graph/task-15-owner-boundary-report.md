# G15T fixed owner path and account-qualified key boundary

The [owner-boundary brief](task-15-owner-boundary-brief.md) adds two inert
library entry points without changing the read-only CLI or existing consumer.
The owner state parent is fixed at .local/state/arcade/graph-cogs beneath the
OS account's userInfo().homedir. It is not chosen through HOME/XDG, argv, run
IDs or application environment overrides. Calculation performs no operational
budget read, creation, claim acquisition, ownership proof or live release.

The key reader uses exactly service graph-x402-payer and account
GRAPH_X402_PAYER_KEY. Its seven fixed arguments select that Keychain item;
no key value appears in argv. The original runKeyCommand owns its existing
bounded TERM/KILL/close lifecycle with an empty child environment. The reader
awaits that production close acknowledgement rather than racing it with another
timer. Injected command fixtures alone receive a three-second promise bound.
Cancellation and a monotonic local three-second acknowledgement guard check
before dispatch and after return/derivation; no following factory is called here.

Canonical bounded command output must contain a valid secp256k1 key whose real
derived address equals the fixed policy payer. There is no direct-key/environment
fallback, alternative account, raw diagnostic, private output logging or file
persistence. The reader returns a key only within its explicitly invoking
consuming process. This is a low-level boundary, not a namespace/reservation or
spending authorization; the next consumer integration must establish known
state and admission before invoking it. Existing payment validity/caps/replay,
Graph client/key subprocess and actual skill consumer remain unchanged.

## Executed checks

Missing-export Red preceded implementation.18 selected native tests/65assert/
3.61s and exact two-root strict0 passed. Final360 focusedBun/1810assert53.98s
and strict0 PASS. No fixture or runtime correction was needed after those checks.

Tests verify exact frozen service/account argv, missing-item one-call refusal,
malformed/zero/out-of-range/oversized key data, getter rejection without evaluation,
sanitized errors, abort/invalid clock before dispatch, cancellation/backwards/
deadline during command return and a never-resolving injected fixture bounded
at3004ms. Its late resolution cannot change the earlier refused promise. A real
cryptographic derivation rejects an explicitly public valid synthetic key whose
account is not the owner. No private owner key or actual Keychain is read.

Two actual empty-PATH fixture children exercise close acknowledgement. The
Keychain command implementation and account derivation are expressly mocked:
the fixture command launches only an owned Bun child printing a public dummy
key, and returns after it closes. The non-cancelled case returns that dummy only
under simulated owner derivation; cancellation returns the fixed error after
child close, before derivation. Neither is owner authentication or a real
Keychain/signature proof. Actual fixed-root computation is checked against OS
account metadata without reading/creating the operational path.

Removing only the new owner block/imports and reversing the updated inertness
comment restores the entire prior harness exactly, SHA256
`db84d8d60454b8a11b5f57b826474bf132029a197075ff22d82b9f10995a174a`.
Original client/consumer/synthesis/schema are unchanged. Sole sequential
four-worker full gate56334 PASS:5371Vitest/242files68.97s,
1783Bun/98files13818assert240.90s, root/web strict and client/SSR347/186ms.
Final six-path audit checks three local links, no privacy matches and three
unchanged source/brief pins. Atomic local commit/mainFF follows; no full repeat.
No actual key/RPC/endpoint/payment, operational state, approval replay or push.

## Next three steps

1. Finish the sole full gate, audit, atomic local commit and exact-one mainFF.
2. Integrate this boundary with known-state preflight, qualified cache hits,
   fresh balance/reservation journals and the existing consumer/payment hooks.
3. Prove bounded uncertainty/cleanup/no-late-send and missing-key paths offline;
   keep operational initialization, live Base approval review and Arc/J gates separate.
