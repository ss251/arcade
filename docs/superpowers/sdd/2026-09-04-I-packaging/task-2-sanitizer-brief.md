# I2A — offline header sanitization boundary

Implement the safe offline portion of Plan I Task2. Release only the new
scripts/capture-x402-header.ts, its native Bun test and plan-owned execution
records. No server, listener, Circle command, wallet/key/signature, real header,
file writer or live entry point. J4 and I2/I3 live remain PAUSED. Do not create
the plan's real circle-cli-1.0.0-payment.json fixture from synthetic data.

Accept one bounded canonical base64/UTF-8/JSON supplied v2 header and explicit
public loopback/payer/payee context. Use strict whitelists before serializing;
replace the signature with the plan's fixed dummy, preserve only validated
public dialect fields, and reject unknown/nested bearer locations. Reject raw
diagnostics and untrusted URL/description channels. Return only sanitized text
and explicit shape-only/no-authentication provenance. No payment admission,
lifetime approval or semantic compatibility is inferred from decoding.

Test standard and legacy header names, optional resource fields, exact typed
public metadata, wrong binding/unknown fields, duplicate/noncanonical JSON,
invalid UTF-8/base64, byte limits and side-effect-free import/default CLI.
Use the existing payment decoder/accessors to verify the sanitized synthetic
shape, without changing PaymentPayload or any production validity/cap/replay.
Keep accepted timeout and authorization times unchanged in successful output;
the recorded root Gateway mismatch remains a separate live pause.

The literal template spreads the full untrusted object after replacing one
signature field; unknown nested bearer fields could survive to disk. Do not
implement that write path. A future listener/storage step must consume only
this sanitized boundary, remain bounded/inert by default and keep live release
separate. Follow TDD, strict checks, one sequential four-worker full gate,
atomic local commit/mainFF and no push or approval replay.
