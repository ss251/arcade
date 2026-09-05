> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F4 discovery outcome-honesty follow-up — 2026-09-05

Parent review of the first frozen F4 checkpoint found the retained blanket claim
that any failed call leaves the payer balance untouched. That is incompatible with
F3's post-dispatch unknown-settlement outcome. The original integration and pure
registry reports remain unchanged historical checkpoints.

At 13:35:00 UTC, the new actual production-router test genuinely failed because the
OpenAPI operation still contained `failed call leaves the payer's balance untouched`.
The same test requires both OpenAPI and skill Markdown to distinguish definite
pre-settlement refusals from uncertain settlement request failures. Source changed
only those two descriptions in openapi.ts; payment and boot behavior did not change.

The descriptions now require validated output before submission, state that definite
pre-settlement refusals are not submitted, and warn that a settlement request timeout
or failure can leave an unknown outcome requiring reconciliation. Such failure is not
proof of no charge. Earlier EIP no-deposit, Gateway pre-funding, UUID and simulated-rail
distinctions remain intact. No live support or financial outcome was inferred.

Final freeze by 13:35:56 UTC:

- All 9 actual-router Bun tests passed, 108 assertions, 3.59 seconds. The fixture is
  owned loopback only, with dummy configuration and blocked outbound fetch/preconnect.
- All 57 focused registry/pipeline/OpenAPI Vitest tests passed again. Earlier 21
  chain-check/actual-boot tests remain Green; those source paths did not change here.
- Explicit exact-root-options TypeScript compilation of all six owned source/test/
  fixture files passed with zero diagnostics, and git diff --check passed.
- No full suite, external network, key retrieval, payment, dependency or Git operation.

Updated SHA-256 pins (the other four owned files retain the original report's pins):

| File | SHA-256 |
| --- | --- |
| apps/hub/src/openapi.ts | 1ca5df6f5008d886d4008d02e5aaf9dc2c64ef9778f87773e138cec870c33240 |
| apps/hub/test/rails-boot.bun.test.ts | 036eec0a871d496fa3b856e11eaaaa2f028f34141d671bb158521ab3ed57adb1 |
| unchanged internal/task4-integration-report.md | b2b32adc36dc5ca583b2e9092d2c164bdb9c24a67df0df252def90fc1e8de73a |

All F4 source/tests are frozen for parent review and ordered full gates. No F5 work.
