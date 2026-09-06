# Task 2 — Chat Completions engine implementation

Base 9bd99f3. Implementation checkpoint only: approved free-route live evidence
has not run, no credential has been read, and no paid API/wallet call was made.

Added API-key-only openai-api registration, native bounded Chat Completions
transport, exact provider/model pricing, mandatory usage accounting, complete
submit/refusal handling, explicit fenced hiring, contained SKILL.md dispatch and
offline doctor using the runner's scrubbed environment. No default paid model,
redirects, automatic retries or unsupported capability approximation. Existing
skill/Claude engines, public listing projection, payment code and lockfiles stay
unchanged. Module entries retain the existing private model-override mechanism.

Read [the brief](task-2-brief.md) and [operator guide](../../../openai-api.md) for
pricing provenance, promotional limits, object-output and schema-validation
boundaries. Provider tool enforcement is not settlement: a test passes an invalid
boolean output through the new engine to the real hub validator and core
shouldSettle predicate, which refuses it. No monetary test asserts a fabricated
balance change or treats a local output as a receipt.

Verification before the single full gate:

- Three genuine failing registration/schema/secrecy tests before implementation.
- Focused transport/broker fixtures cover refusals, truncated/unknown finish
  reasons, malformed/mixed/duplicate calls, usage/cost/token/tool/turn limits,
  undeclared credentials/capabilities, stalled bodies, byte limits and no retries.
- Real Bun harness loads a contained SKILL.md plus reference inventory through a
  non-network fetch fixture. An escaping symlink fails without private path leakage.
  Real CLI doctor runs with and without manifest-granted dummy credentials.
- Final focused run: 147 tests in seven files, 9.04 seconds. Strict check exposed
  two source typing issues and incorrectly spread table-test rows during earlier
  iterations; those were corrected and the actual batch cases rerun. The final
  extra hire fixture needed one boolean placeholder type correction; seven-root
  strict check then passed with zero diagnostics. Full gate covers that exact file.
- Parent self-review only, as required by the machine-load restriction. No agents
  or concurrent independent review; workers capped at four and all checks sequential.

## Frozen source SHA-256

| File | SHA-256 |
| --- | --- |
| packages/core/src/engine.ts | d89a09124673831b26d2609f86201018603e01b04cc827f1147253b2c9e94cd7 |
| packages/runner/src/engines/openai-api.ts | a41fe621e0fe475b164cee684d4037b0f069cbfeacfc2d012425c435fec88884 |
| packages/runner/src/engines/harness.ts | 35e7fef6a3670e843be659e48aaa28a8fbedcf1a35c5dca49cc317e0e9de49ff |
| packages/runner/src/cli.ts | 78f56daca236f944b5708177646b8910bc3447eb0dc9eea43a6bcea9c6728679 |
| packages/runner/test/openai-api.test.ts | 645984998eb623e3cc3b4c4aa8e607b32208d48395eda0e15e3ac6d03bb91d74 |
| packages/runner/test/openai-api-registration.test.ts | c25ce62323c4b93ffcc43e12265d3cfc4514231d612329313fa8b4e70552f47d |
| packages/runner/test/openai-api-harness.test.ts | 36dd57ee128ef2c19518239589830eb6b425078bf81510fc0dc815091916171e |

## Sole full gate and publication audit

Gate35793 completed successfully on the frozen source: 4,368 Vitest tests in
196 files (75.53s), 839 Bun tests in 55 files with 6,114 assertions (170.53s),
root/web strict checks, client build (412ms) and SSR build (197ms). No full gate
was repeated. No contract code changed, so no new Forge run was required.

Publication audit: seven exact source pins, 13 scoped paths, 11 unchanged
contracts/lockfiles, 13 valid local links, privacy scan and diff-check all passed.
No private work order, owner approvals, credential values or runtime journals
are included. Task2 implementation is ready for its atomic commit; the separate
approved free-route live evidence is still NOT_RUN.
