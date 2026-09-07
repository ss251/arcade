# G15D — awaited private response observation

The readiness review allowed a narrow client-hook decision when a fetch wrapper
could not transparently preserve original URL/redirect/header/body validation.
Root releases one optional observer inside the existing bounded response reader,
not a wrapper that reconstructs Response objects. Scope: graph-client.ts, its
existing Vitest/Bun test files, this brief/report and G index/progress.

The observer receives a frozen, bounded snapshot of complete response bytes,
selected header values, status, original response URL/redirect flag, exact
request-body digest and phase (challenge/paid/RPC). It is awaited before the
caller interprets status/JSON/receipt. No live request is part of this task.

Do not pass the original Response, mutable byte buffers, private key, or signed
request header to the callback. Raw provider responses may be sensitive and the
snapshot is private-only, never output by the CLI or published as evidence.
Capture the callback once per factory. Observe only complete responses that
pass the existing transport bounds; missing/partial/oversized/unavailable
responses remain uncertain, not reusable results. No partial-body proof claim.

Observer exceptions/timeouts fail closed, with fixed public diagnostics. After
a stalled observer returns late, no next RPC/signature/paid send may occur.
Keep the existing deadline, signer, two-attempt/two-signature caps, uncertainty
and no-retry logic unchanged. No before-sign/forward hook or runtime recorder
integration is released yet, and no production key selection changes.

Use failure-first tests with the actual installed x402 signer and public
synthetic key, plus existing owned loopback fixtures. Verify snapshot immutability,
raw signed-error response capture, original policy failures, no secret-bearing
request headers and late-callback refusal. Single-thread/four workers, exact
strict, one full gate, atomic commit/main FF, no push or real spending.
