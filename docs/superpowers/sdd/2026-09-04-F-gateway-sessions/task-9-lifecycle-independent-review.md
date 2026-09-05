> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9 lifecycle independent review — initial findings

September 6, 2026, 03:10 IST. Read-only review of the other author's frozen
five-file SDK/lifecycle slice. This reviewer authored the separate HTTP/native
three-file slice; its native evidence remains author evidence, not independent
proof of that reviewer's own code. No production/collected test edit, full suite,
Git, socket, network, real key or signing was performed for the private probes.

Read the complete final author report and current parent decisions, all of
session.ts/session-wire.ts, both lifecycle/Promise test files, the additive public
export and relevant actual core session/receipt invariants. The parent explicitly
requested the temporal checks below. Verdict: **two reproduced consistency
findings; no reproduced reopening/signing exploit**. Parent has accepted a narrow
author correction; this initial report and its private fixture remain historical.

## Reproduced findings

1. In session.ts readStatus, `wasClosed` is captured before awaiting HTTP. A read
   begun while open can resolve with an old open snapshot after close() has
   already returned a valid closed artifact. The public result returns
   `closed:false`. Reconciliation does not reopen the internal state: the test
   separately verifies the next call fails session_closed with zero additional
   requests and zero signer invocations. This is externally non-monotonic
   lifecycle reporting, not renewed payment authority. Check current state after
   await before returning/reconciling a contradictory open observation.
2. The first observed closed artifact is not retained for cross-response
   equality. A second individually valid closed snapshot can change closedAtMs
   from 2000 to 3000 and is accepted. Both bodies pass core closed-artifact
   validation, but they cannot both describe the same immutable persisted close.
   The internal client remains closed and refuses new calls/signing. Preserve a
   bounded semantic fingerprint of the first fully validated closed artifact,
   compare it before later accounting updates, and reject contradictions with
   fixed diagnostics. Object key order alone must not produce a mismatch.

The private file `[private lifecycle regression fixture]` invokes the
actual SDK using only injected Response objects and a signer that must never be
called. It neither mocks the SDK nor edits its source. The first two cases test
the findings above; the third confirms a repeated identical closed observation
with reversed top-level JSON keys remains usable. Every pending fixture gate is
released and awaited in finally. No timer, child or listener is left running.

At **2026-09-05 21:37:17 UTC**, the standalone command
`bun --no-env-file test [private lifecycle regression fixture]`
returned **exit 1: 1 PASS / 2 FAIL / 12 assertions** against source e2813a3…23bb.
The first immediately preceding combined shell invocation printed the same two
failures but ended with a successful hash command; the standalone repetition is
the retained unambiguous exit-status evidence. No assertion/source weakening was
used to obtain these Reds.

## Other reviewed boundaries

No additional actionable defect found in this bounded pass. Open/operation
attempt state is allocated outside Effect evaluation. Captured own origin,
budget, account address/signer, selected chain and fetch prevent subsequent caller
mutation from retargeting authority. Input is copied before evaluation. The
selected configuration is rechecked at signer entry; the actual canonical typed
request is frozen and the returned signature is locally recovered. Issuance is
recorded before entering the signer and never refunded by lost response,
release, status or close. Concurrent distinct calls share reserved/issued budget;
rerunning one issued Effect cannot purchase again. Fixed failures retain locally
known authorized amounts without provider diagnostics.

Actual-input quote uses captured rail and both headers without issuing authority;
call probes afresh. Polling requires three private headers and exact token-free
origin/job path. Uncertain settlement fails without output/retry. Pending timers
and late signer/fetch continuations have local abort/deadline ownership. Existing
unit checks cover interruptions before/after signer entry, 6+6 against budget10,
same-Effect concurrency, immutable queued input, changed chain, lost close and
recovery. The final reference guard refuses duplicate references before output.

These are local policy/wire checks. No independently mined transaction, wallet-
wide persistent exposure ledger, real facilitator support, funding or actual MCP
queue cancellation is proved. Raw hub status is not independent chain evidence.
The source and tests explicitly preserve these limits rather than presenting
session close as revoking previously issued authorizations.

## Independent commands and pinned inputs

The focused command `bun --no-env-file x --no-install vitest run
packages/buyer/test/session.test.ts packages/buyer/test/promise-api.test.ts`
passed **42/42 tests /2 files** at 03:07:55 IST: 35 session +7 Promise. This is
not the author's separately reported 361-test group or parent's full gate.
An exact TypeScript createProgram using absolute root tsconfig/configFilePath,
its actual parsed options, noEmit:true/incremental:false and the five reviewed
roots plus the private regression file passed **6 roots /0 diagnostics**.

| Frozen input | SHA-256 |
| --- | --- |
| packages/buyer/src/session.ts | e2813a3e7ea83898d16dce7aaebce114537c44fe2cc2b402dee1cdc7b72323bb |
| packages/buyer/src/session-wire.ts | ea2b7e792482cc94ea71939ab0e99afbd29caa474e40d4e1db968220a15c0bef |
| packages/buyer/src/index.ts | 25bb0e50918093a3a7b62065f7bbe4e2392b52946fbc111f26983a377cd2e1ca |
| packages/buyer/test/session.test.ts | 1c74d6e82b2e64130517187f6168e63148efd13a987bb2a766118163157535f0 |
| packages/buyer/test/promise-api.test.ts | 13d96edbe7b9f0fe1a54b9acf553a43cddf784629187ed07cec3194b093e4ed0 |
| task-9-report.md | 8bb0005689186dbf02caf1ed51f0ca8ba31997761c30d965b19829acea464e16 |
| [private lifecycle regression fixture] | a9ba25e3412dd40470b1d1906917e3778366b1788a53bd4f50b2248b879f90de |

All five reviewed source/test hashes still matched after the private and focused
checks. A later corrected-source review must be recorded separately; this report
does not claim that the accepted findings have already been corrected.
