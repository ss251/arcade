# G15T — fixed owner path and account-qualified payer key boundary

Release only the Graph harness/native test and plan-owned brief/report/index/
progress. Choose one OS-account-derived state parent outside disposable run
directories: .local/state/arcade/graph-cogs below userInfo().homedir. Do not
derive it from CLI, run IDs, HOME/XDG or application environment overrides.
Path calculation does not create/read an operational budget or enable live mode.

Add an inert explicitly invoked key reader for exactly service graph-x402-payer,
account GRAPH_X402_PAYER_KEY. Reuse the existing bounded subprocess owner with
no inherited environment. Read output only inside the consuming process; derive
and require the fixed policy payer before returning a key. No direct-key/env
fallback, private output logging, key in argv, or plaintext persistence. Preserve
the subprocess close-before-return contract; abort/late/malformed/mismatched
results refuse with a fixed sanitized error and no following factory or request.

Use only injected command results and explicit public synthetic keys in tests.
Actual cryptographic mismatch checks must remain separate from an expressly
simulated positive derivation fixture; do not claim an actual owner key/signature.
Test exact service/account argv, refusals, cancellation, deadlines, no fallback
and inert import/path computation. No real Keychain, operational state, RPC,
spending, existing payment validity/cap/replay change or push. Consumer admission
wiring and live release remain separate. One sequential four-worker full gate,
one atomic conventional local commit and exact-one mainFF.
