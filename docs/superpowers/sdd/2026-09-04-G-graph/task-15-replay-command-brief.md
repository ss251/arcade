# G15V — bounded read-only operator replay

Release the Graph harness/shell/native tests and plan-owned records plus the
public runbook/README. Add an explicit fixed-root --replay command that reads
only a complete already-stored assessment; never create/materialize state or
enter the consumer, key reader, signer or transport. Missing/corrupt/claimed/
source-mismatched state refuses without fallback. Keep --live and all arbitrary
root/source/endpoint/reset options unavailable. Correct stale status guidance.

Run the synchronous retained verifier in one owned Bun child with empty
environment, fixed arguments and ignored stdin/stderr; enforce six-second
SIGKILL timeout and bounded stdout. Wait for child completion, validate its exact
whitelisted canonical public projection, then print one result. Refusal must
not expose raw child diagnostics or partial output. Successful exit means only
historical readback; liveEvidence remains NOT_RUN and newPaidQueries zero.
This read-only child has no descendants by design; no live consuming-process
lifecycle or signing authority is released by its cleanup tests.

Use native owned-temp child fixtures, synthetic retained data and real process
termination/overflow/malformed-output checks. Positive fixture OS-home metadata
is mocked, never the operational root; label consistency versus authentication.
Keep existing consumer/payment validity/caps/replay and budget untouched. One
sequential four-worker full gate per atomic local commit/mainFF, no push,
operational creation, real keys/RPC/payment or consumed approval replay.
