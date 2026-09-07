# Task5A — Delegated funding policy and SDK binding

Implementation checkpoint only. Task5B durable guarded runtime/CLI and Task5C
live proof are not implemented. No funding key, owner grant, deposit, delegated
spend or payment was used for this checkpoint. J4 stays paused.

## Changes

- Exact package pins: Unified Balance Kit1.6.0, Viem adapter1.17.1; lockfile
  generated with lifecycle scripts disabled. Existing commander8.3.0 is
  relocated under its consumers as the new dependency graph is resolved.
- Immutable positive six-decimal USDC terms; two allowed testnet sources;
  Arc destination; explicit distinct owner/delegate; no automatic allocation,
  forwarder, custom fee, retry, mainnet or payment-window changes.
- Ready-only single-attempt coordinator records intent before invoking the
  trusted spend dependency. Unknown status and failed intent writes never spend.
  Ambiguous SDK/result-journal failure stays uncertain; errors are redacted.
- Real pinned SDK type binding checks owner reader and source/destination signer
  identities, and builds sourceAccount plus explicit allocation/destination
  adapter. Kit construction disables analytics and error reporting.
- SDK return fields are projected and matched to expected terms; raw traces,
  capabilities and error text are never retained. Returned hash is labelled
  `sdk_returned`, not independently confirmed. This is not settlement evidence.
- The [J4 preflight](../../../evidence/J/circle-cli-preflight.md) now records the
  exact source-only root Gateway refusal, including that no sent validBefore
  exists. It distinguishes root vanilla EIP-3009 from root Gateway and sessions.

## Verification record

Initial absent-module run collected zero tests: setup failure, not behavior Red.
First implemented run had27 passes/12 failures: missing Effect.fail wrappers
caused typed-error paths to defect; one assertion assumed a plain Either object.
Corrected those implementation/test issues. Then42 policy tests passed; adding
the actual SDK-binding boundary tests yielded47 passes across2 files (653ms).
The expanded strict check caught four test-only address-type annotations; these
were corrected without changing production behavior or assertions.

Final focused run:47 tests/2 files/652ms. Four-root strict check:0 diagnostics.
Sole frozen full gate8824 PASS:4,728 Vitest/210 files/66.59s;874 Bun/57 files/
6,374 assertions/167.68s; root/web strict checks; client365ms and SSR186ms.
No full-gate replay. Six code/test/package/lock pins remained unchanged across
the gate; the final audit checks12 scoped paths,33 local links and an empty
index before staging. No privacy-pattern matches were found.

## Remaining work

1. Durable evidence using shared Gateway journal IO, guarded owner/delegate
   adapters with final fee/gas validation and bounded Arc receipt reads.
2. Strict fund CLI, keyless dry-run and exact owner addDelegate command; then
   offline end-to-end refusal/cleanup/replay tests.
3. Separate approved testnet live proof with action intents and independent
   source/destination readbacks. No existing one-shot approval is replayed.

The in-process journal guard is not a cross-process account lock. The binding
requires trusted guarded adapters; it does not make default SDK transports safe
to use live. See [Task5 brief](task-5-brief.md) for the SDK-specific constraints.
