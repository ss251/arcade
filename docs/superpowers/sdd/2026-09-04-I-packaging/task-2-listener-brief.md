# I2C — bounded offline capture listener

Implement an explicit library-only loopback listener using the unchanged I2B
store. Do not activate the existing CLI or invoke Circle, a signer, a key reader,
an outbound service or a payment. Bind only127.0.0.1 on an ephemeral owned port;
validate explicit public payer/payee options before binding. Derive context from
the actual assigned port and create the fresh private store before handling input.

Serve the plan's unchanged unsigned604900-second capture challenge for one
correct-path POST without a payment header, then accept at most one supplied
payment header. This is a shape capture, not admission or settlement; preserve
the supplied authorization/echoed timeout under the existing sanitizer.
Reject wrong path/method, repeated challenges, ambiguous/invalid headers and
extra capture attempts with fixed public errors. Do not persist request bodies,
raw headers or diagnostics. Limit request body size, lifetime and cleanup grace.
No configurable host, output directory, environment fallback or live flag.

Await owned listener shutdown; report historical artifact and local shutdown
status separately from any unconfirmed client acknowledgement. On timeout,
cancellation or refusal, preserve partial claim/data without retry or repair.
Use actual owned HTTP and stalled-connection tests, verify closure independently,
and retain failure/uncertainty honestly. All headers/addresses are synthetic,
not real CLI/owner signatures; do not create the public versioned fixture.

Keep storage/sanitizer/payment/schema/validity/cap/replay sources byte-unchanged.
Single-threaded; one sequential four-worker full gate, atomic local commit/
exact-one mainFF, no push. J4/I2/I3 live remain paused.
