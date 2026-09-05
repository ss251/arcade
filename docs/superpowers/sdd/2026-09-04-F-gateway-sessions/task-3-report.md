> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F3 implementation report — September 5, 2026

Scope: gateway.ts, additive SettledPayment type/comment, new gateway-http.ts,
new gateway-rail.test.ts, new gateway-http.bun.test.ts, and only the existing
Gateway success/tree conformance fixture. No F2/index/buyer/shared core/hub/
dependency/F1 source, journal or live state was changed by this worker.

## Result and approved adaptations

Gateway construction now uses the selected ready pinned ChainConfig and refuses
null/pending/invalid configurations. Optional wallet/chainId/validity are equality
assertions only. Explicit facilitator overrides must be HTTPS origins or literal
loopback HTTP origins, without paths, userinfo, query, fragments or whitespace.
Challenges retain the existing local resource contract. Gateway settlement accepts
and ignores SettleTree.
Malformed trusted challenge input fails with a fixed Effect.sync defect because
the existing Rail.challenge signature has no typed error channel.

Verification copies own data descriptors into allowlisted canonical structures,
checks every accepted/required payment/resource/domain coordinate, exact positive
uint256 value (no overpayment), addresses, nonce/signature and current open bounded
authorization time. It performs actual viem recovery over the F2 pinned Gateway
domain and requires the exact payer. No USDC signature or provider boolean alone
can establish local authorization. Full local binding precedes the F1-compatible
nested wire projection: POST has exactly paymentPayload/paymentRequirements;
ARCADE's resource metadata appears only in paymentPayload.resource. Snapshots and
issued VerifiedPayment handles are deeply frozen and per-rail provenance tracked.

The admitted window must be open, ordered, at most 605500 seconds, and expire no
later than local now+604900. Settle checks openness again without demanding a fresh
full window. This is local offline acceptance policy, NOT evidence that Circle
accepts a delayed live settlement. Actual delayed facilitator behavior remains
unproved by the immediate F1 gate.

Settle requires this rail's genuine verified handle and exact snapshot fields.
An attempt map keys selected chain/domain/payer/nonce, claims before POST, refuses
all repeated/concurrent/conflicting attempts, caps 10000 retained entries, and
prunes only expired nonactive entries. Backwards clocks fail closed. Sent failures,
timeouts and malformed replies retain the claim and return a fixed uncertain
outcome, never provider diagnostics or an automatic retry. This is process-local;
durable session reservations and crash/restart reconciliation remain explicitly
queued under the parent's task5-accounting-readiness before any live sessions.

Successful settlement requires exact true, matching payer/network and the observed
canonical nonzero UUID shape. It returns settlementKind gateway-transfer. Hash-
shaped values are rejected, never promoted to mined evidence. The optional additive
union retains onchain/gateway-transfer/gateway-batch for downstream compatibility;
Gateway does not currently emit the other two. A transfer is neither withdrawable
recipient balance nor a mined batch. Existing H1's no-Gateway-explorer rule stands.

supported() uses the same transport and returns a scrubbed projection after
validating one matching v2 exact selected-network kind, pinned domain/wallet and
one selected 6-decimal USDC asset. Other networks cannot change the signing domain.

## Transport and lifecycle

One attempt, 15-second total headers/body deadline, 16 KiB request limit, 64 KiB
streamed response limit, fatal UTF-8/JSON and exact framing checks. Redirects,
cookies and compression are refused; no endpoint/status retry exists. Response
bodies, bearer headers, URLs and provider exceptions never enter rail errors.
Effect.async's interruption finalizer awaits the bounded transport cleanup;
late responses from a noncooperative fetch are canceled when they arrive. Cleanup
itself has a 250 ms bound. Cancellation cannot undo an already dispatched payment.

The owned transport fixtures initially tried node:http's req.socket close event
under Bun. Four tests passed; two timed out awaiting that compatibility observer,
while the request refusal/deadline had already completed. A separate short native
Bun.serve diagnostic observed Request.signal abort and pendingRequests=0 for the
same production transport. The fixtures now use that native cancellation signal
and wait at most one second for asynchronous request drain. Their first native
attempt observed abort correctly but asserted the drain too early; the bounded
drain wait fixed that fixture race. No production cancellation assertion was
weakened into a claim that remote paid work was canceled. The successful final
fixtures prove local native request cancellation/drain, not downstream settlement
cancellation or a particular node:http compatibility event.

Every owned Node/Bun server is stopped in bounded afterEach cleanup. No child process,
external endpoint, key, RPC, deposit, signature broadcast or live payment is used.
Offline signatures use a publicly recognizable dummy test account only.

## Genuine failure-first chronology and verification

- At 18:12:18 IST, nine selected tests ran against unchanged production Gateway
  source and all failed: extra POST x402Version; accepted USDC-domain signature;
  signed overpayment; accepted-coordinate mismatch; missing transfer kind;
  fabricated/cross-rail verified handles; two concurrent settle POST successes;
  reflected private transport diagnostics; and unavailable selected Gateway boot.
  Nine further tests were initially skipped, not claimed as Reds. No intentionally
  broken production version was introduced.
- At 18:20:31, the initial 18 rail cases passed. Exact-target strict checking then
  found the supported discriminator's literal widening and an overly narrow test
  domain annotation. Both were corrected without casts hiding diagnostics.
- The approved conformance fixture needed actual bounded Gateway dates as well as
  a Gateway signature: the old ordinary signer used validAfter=0. An initial typo
  and this stale fixture assumption were corrected only inside the Gateway case;
  no ordinary signer or other conformance behavior was changed.
- Expanded tests exercise all 10000 attempted nonce entries with actual signatures,
  cap refusal, expiry pruning, rollback refusal, active-expired conflicting reuse,
  mutable-input isolation, native timeout/cancellation, and late fetch cleanup.
- Final focused Vitest at 18:37:02 IST: 58/58 across gateway-rail (24), conformance
  (30) and existing configured-chain tests (4). Total 22.13 seconds; actual 10000-
  entry cap case 20.665 seconds. No test was skipped in this final run.
- Final owned Bun HTTP fixture run: 6/6 tests, 20 assertions, 15.17 seconds. The
  real header deadline completed in 15.02059 seconds with one request; two-origin
  redirect refusal and native aborted-body/request drain passed.
- Final exact-root-options TypeScript, explicitly targeting both new tests and all
  modified payment source/conformance, reported zero diagnostics. The original
  root config is parsed with TypeScript readConfigFile/parseJsonConfigFileContent;
  no separate relaxed compiler settings or configuration files were introduced.
- Owned tracked diff check passed. Only focused gates were run; the parent owns
  independent review, full repository gates, publication and atomic commit.

The TypeScript-testing skill drove behavioral Reds, real cryptographic recovery,
actual owned transport and bounded asynchronous cleanup assertions. This report
does not claim another live F1/F13 action or crash-proof session accounting.

## Frozen source fingerprints (SHA-256, not transaction hashes)

- gateway.ts: 96a42e177c3d5666ba673574b1912263307216d5b41730146373c401e02eec02
- gateway-http.ts: 2334ef9705bf677ea0ef94ab262e39afea59786372df552708fcecc4d0dac024
- types.ts: c4f6ef0ab92af7d98f0f616fa311b2a7b12028f6316e483c35e5a2cd15548d04
- gateway-rail.test.ts: 21d350e46c4c9eb3f4e5f47b727d893d81531b64442201063cf24026c35bfb94
- gateway-http.bun.test.ts: 9bcddd19f59808a1848c4366b50169d541bf683fe70f9ddf1fc8577b1aa88785
- rail.conformance.test.ts: 41f02be258d6c4e6b9f1b405311ab441de339e170d1277219b810565bc2219f2

Source/tests and this report are FROZEN for independent review and parent gates.
