> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F4 boot, discovery and per-job rail integration — 2026-09-05

Frozen at 13:32 UTC, pending parent independent review, ordered full gates and commit.
This is a local/offline implementation checkpoint, not live Gateway evidence or session support.
The original `internal/task4-registry-report.md` remains unchanged.

## Scope and implementation

Read the complete Plan F Task 4 and current server preflight/chain check/discovery,
pipeline, pure registry and frozen F3 implementation. Changed only server.ts,
pipeline.ts, openapi.ts, and three new focused fixture/test files listed below.
The parent-owned registry, F2/F3 payment source, store, core and dependencies were not edited.

- Boot retains the exact ARCADE_RAIL default instance in RailTag and RailsTag. Only
  when the selected ready configuration contains Gateway does a non-Gateway default
  gain one additional Gateway rail. Gateway defaults are not constructed twice.
- Gateway construction explicitly passes the captured configuration's facilitator URL,
  wallet, chain ID and minimum validity equality assertions. Construction makes no
  support, deposit, RPC or other provider request. A built rail is not proof of live support.
- The existing EIP configured RPC/facilitator and per-listing splitters remain unchanged.
  Existing static availability and live chain-check behavior remain intact. Invalid
  ARCADE_RAIL now refuses with a fixed diagnostic before rail construction/listening.
- RunJobArgs.rail optionally selects an internal caller's rail; omitted overrides retain
  the injected default. Settlement and receipt rail use the selected handle. No sessionId,
  session accounting, HTTP rail selector or new authorization authority was added.
- Health, OpenAPI, well-known x402 and skill Markdown expose the constructed inventory.
  Discovery wording distinguishes EIP root no-deposit payments, pre-funded Gateway,
  Gateway UUID references (not mined transactions), and simulated test-rail settlements.
- Actual unsigned Gateway challenge comparison exposed an existing discovery mismatch:
  Gateway pays the seller EOA but well-known x402 advertised the EIP splitter. The builder
  now uses the seller for Gateway and preserves per-listing splitters on the EIP path.

## Genuine Red and Green observations

At 13:21:49 UTC, the new pipeline suite had two genuine failures and one passing default
case: explicit override was ignored for both successful and unsuccessful receipts.
The latter incorrectly recorded the default rail even though neither rail settled.

At 13:22 UTC, the actual production boot suite had five genuine failures and two existing
availability refusals passing: health/discovery lacked the inventory, and an invalid rail
silently started EIP. An earlier fixture cleanup assertion mistakenly treated Bun's normal
signal termination (`exitCode: null`, populated `signalCode`) as a leak; that observation
was corrected while preserving awaited TERM-to-KILL reap and connection-refusal checks.
It was not counted as a production bug or used to weaken the expected behavior.

Before source correction, the separate actual Gateway discovery test failed with expected
seller address versus advertised splitter. It used an unsigned local 402, not a payment.
No source was temporarily weakened to produce a Red. During implementation an inventory
field was initially placed in page data rather than discovery; the still-failing actual
HTTP assertions caught it and it was moved. A new test broker omitted runnerForJob;
the exact strict check caught that fixture type error and the harmless stub was added.

Final focused checks completed by 13:32:41 UTC:

- 78 Vitest tests, six files: new rail-pipeline (3), original registry (10), original
  pipeline (15), OpenAPI (29), chain-check (16), and actual chain-boot (5). All passed.
- 8 actual-router Bun tests, 95 assertions, 4.14 seconds. All passed. They assert all
  three defaults, exact built inventories, no-Gateway config, invalid/null/pending
  refusals, captured pinned construction arguments, per-listing EIP challenge targets,
  Gateway discovery/challenge agreement, public wording, and zero outbound requests.
- An explicit TypeScript createProgram using the exact root tsconfig options and all
  six owned source/test/fixture files passed with zero diagnostics. Root defaults do
  not collect all nested hub tests, so this was an explicit targeted check.
- git diff --check passed. No full suite, Git mutation or dependency operation was run.

The new HTTP fixture invokes the actual server using Bun --no-env-file, a bounded
allowlisted environment, fixed public dummy account, seeded raw Store, and actual rail
constructors. Outbound fetch/preconnect throws. Only the test preload adds its diagnostic
route. Each child uses an ephemeral owned loopback listener; output is drained into a
bounded buffer. Cleanup awaits exit with TERM/500ms then KILL/1000ms bounds and verifies
the listener is no longer reachable. Pipeline settlement balances are actual in-memory
TestRail balances; its second handle is merely named gateway and is not provider proof.

## Frozen SHA-256

| File | SHA-256 |
| --- | --- |
| apps/hub/src/server.ts | 81c2083f79537afd0c6ff75b2eb082e21cf8572c45e74aff353bce07f29229aa |
| apps/hub/src/pipeline.ts | 37897842bfac306bfd2ab6f19ec35d04f96f05192acfca59c161350ba4783762 |
| apps/hub/src/openapi.ts | 897066791c8057d11ac1ac03c12f097fbd6694f8c618dd520b6909fc71d79936 |
| apps/hub/test/rail-pipeline.test.ts | 930609c7aa17e109c9b3756ed2944e8a4d4e1a34b9009ac579023ea71c117d76 |
| apps/hub/test/rails-boot.bun.test.ts | d22ef8bd350c116278afa423d293b516c33d3cc9961c49b4dd657c15766b2388 |
| apps/hub/test/fixtures/rails-boot-preload.ts | 174ab52e5442ed2429343e05839431994a34c9ddea9f81e381c3522f7d3bd9f0 |
| unchanged internal/task4-registry-report.md | 4c470e858fce8e03e54cce4011dd5b3a042653242be8d6fec30fa47967e045a0 |

No real key retrieval, external endpoint, SDK/provider query, authorization broadcast,
wallet operation or live settlement occurred. F5 and other follow-on work remain held.
