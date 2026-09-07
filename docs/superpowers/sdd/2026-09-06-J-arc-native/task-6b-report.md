# J6B1 — read-only deployment preflight

Added `scripts/deploy-erc8183.ts` and pure artifact/transaction-plan helpers.
The live executor is **not implemented**, so there is no credential or RPC path
to accidentally exercise while build size and the treasury checkpoint are open.
This checkpoint is not Task6 live completion.

TDD first failed because the planned module was absent. Nine focused Bun tests
then passed (47assertions/126ms), with genuine ABI decoding of constructor and
admin calldata. Four-root strict validation passed after correcting one fixture
string-array literal type; no runtime behavior was loosened.

The actual read-only `--check-build` invocation exits2 with
`build_blocked / artifact_oversized`: implementation26167runtime/26398creation,
proxy130/674, hook1632/1872. All metadata/source checks run locally against the
approved clean vendor pin. No keys, RPC, signatures, sends or file writes.
Help/dry-run pass without artifact/source reads.

One extra bounded compiler diagnostic reproduced26363runtime bytes from all
43verified implementation sources using installed Solidity0.8.36/viaIR200/
Cancun. It also exceeds EIP-170 and was not promoted to the saved build profile.
No further optimizer/compiler search, source replacement or code-size increase
was performed. [Machine-readable evidence](../../../evidence/J/erc8183-build-preflight.json)
records all four local size observations; none is live deployment evidence.

Sole frozen35853 fullgatePASS:4,825Vitest/214files/67.17s;
964Bun/69files/7,317assertions/172.25s;root/webstrict;client576ms/SSR186ms.
Eleven-path/51local-link scope/privacy audit passed; four code/test pins are
rechecked unchanged before the atomic commit. Existing J6A contract test evidence
remains separate; the deployment-size gate still fails. After commit/
exactFF, stop deployment at the explicit treasury checkpoint and continue7–9
offline. The [brief](task-6b-brief.md) lists6B2's remaining live/journal/config
implementation requirements. J4/J5 live separately paused; no spend or push.
