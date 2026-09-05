# F1 local implementation report — September 5, 2026

## Result and scope

The legacy deposit-only script is replaced by an import-safe, explicit bounded
probe. Policy/orchestration lives in `scripts/gateway-gate.ts`; trusted IO and
private journal handling in `scripts/gateway-gate-runtime.ts`; the original
`scripts/g2c-nanopay.ts` is the CLI boundary. Four Bun test files cover pure policy,
runtime/filesystem, owning subprocess deadline and actual viem/HTTP behavior.
The root declares exact Effect 3.22.0, already locked elsewhere in this workspace;
no existing dependency version was upgraded.

The funded gate remains OWNER-PENDING. No Gateway key, approval, deposit,
authorization, verify or settle was executed. One keyless public supported GET
returned the required Arc v2 kind, with `fullGate: UNPROVEN` and `spending: false`.
See [evidence](../../../evidence/m6-gateway.md). F2–12 and F13 remain held under
their respective real-evidence prerequisites.

## TDD chronology

- The first run encountered undeclared root Effect: a setup failure, not the
  product Red. After the exact already-locked dependency declaration/install,
  the real missing `gateway-gate.ts` module failed collection. Seventeen policy,
  protocol and orchestration tests subsequently passed with 109 assertions.
- Runtime tests exposed the legacy entry point's import-time action/exit. The
  actual entry point was made import-safe, producing 24 combined passing tests
  with 136 assertions and strict TypeScript exit zero.
- CLI tests genuinely failed on missing `runGateCli`; implementing its owning
  hard deadline and cleared completion fuse made all four CLI tests pass.
- The independent actual-wire suite's initial zero-value RLP expectation was
  corrected as a fixture issue, not claimed as a product failure. At 09:45:12 UTC,
  15 cases passed and one genuine failure showed the key-consuming adapter
  accepted altered payment data. At 09:46:15 UTC, 16 passed and three failed:
  that mutation plus repeat-deposit calls after success and uncertain broadcast.
- The runtime now reconstructs and validates exact domain, fields, time, value
  and payee before one signature; it latches deposit before any read and retains
  the latch on failure. The signature regression was strengthened to claim a
  real journal, use fresh time, recover a valid signature and reject a second
  signature, avoiding a vacuous precondition failure.
- At 09:50:27 UTC the independent wire suite passed 21 tests / 1873 assertions,
  including actual owned-loopback redirect refusal and unfinished-body abort;
  strict TypeScript and diff checks also passed. The parent repeated all four
  focused files after that final freeze: **49 tests, 2021 assertions, zero
  failures**, plus `bun run typecheck` and diff check, all exit zero.

## Review and safeguards

The independent reviewer read the production runtime, authored tests through its
actual viem adapter, and found the signing/repeat-mutation issues above. After
the fixes and stronger tests the source review was CLEAN. The parent independently
read the entire final wire suite and all production source. Tests use only known
public dummy scalar material, per-test owned temporary directories and finite
injected/loopback responses, not real credentials or external paid endpoints.

The journal is exclusive, owned, private, fsynced and never automatically resumed
or removed. Each known transaction hash is written before a single broadcast;
the nonce is retained before signing and settle intent before submission. The
adapter has no operation retry or receipt-wait helper. Fixed bounded fetch uses
no redirects/ambient authentication; headers and body share a deadline and byte
limits. Gas is capped separately from token amounts. No raw response errors,
signatures, raw transactions or keys enter the journal or public diagnostics.

Whole-repository precommit test and strict-type gates are still pending at this
report checkpoint; their observed result belongs in the progress ledger. This
report does not claim compilation or simulated IO is funded live evidence.

## Documented deviations

Current Circle API evidence contradicts the historical self-payment fallback
and distinguishes transfer UUIDs from batch transaction metadata. The owner's
request was therefore amended, not silently reused. Deposit retries were
replaced with single mutation plus bounded read-only reconciliation because the
installed SDK's deposit includes receipt waiting. The 604900-second signature
window is retained as an installed SDK/core compatibility constant, not a claim
about a universal current minimum. Full source references and future command
shape are in the evidence document. No session product code or fee distribution
claim was introduced, and no push or history rewrite occurred.
