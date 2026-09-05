> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# G14 implementation report — wallet-risk-note Graph gate

Date: 2026-09-05. Scope was restricted to `skills/wallet-risk-note/{arcade.json,run.ts,test/verdict.test.ts}` and this private report. No Plan A source, loop-probe manifest, lineage wrapper, G12 implementation, shared package, dependency, Git state, key, account, RPC, gateway, Graph endpoint or Arc payment was changed or used.

## Result

`wallet-risk-note` now performs exactly two sequential broker requests: `usdc-flow-check` capped at `$0.01`, then `counterparty-graph` capped at `$0.05`. The process receives only the per-job Unix-socket grant. It strictly correlates the complete broker envelope, settled child, current flow result, current G12 Assessment, subject address, chain, source coordinates, costs and parent-job ledger arithmetic before producing an output.

Missing Graph evidence never produces `ok`. A correlated, parsed HTTP 200 broker response with `settled:false`, `result:null`, zero cost and unchanged remaining budget is the only Graph no-settlement case that continues; it yields `counterparty:null`, no Graph payment claim and a caution floor. Socket/timeout/abort, non-200, malformed/truncated/oversized responses, bad accounting and settled-but-invalid evidence refuse the parent with fixed text and are never retried. The broker fence is bounded but never interpreted or emitted.

The source remains an object. It adds nullable `counterpartyGraph`; top-level `counterparty` is required and nullable. The module is import-safe, and owning CLI I/O is bounded to 64 KiB stdin, one JSON envelope, a 129-second operation deadline, one-second output/cancel cleanup and a 133-second hard stop inside the published 135-second bound. Child requests are sequential with 32- and 92-second total socket deadlines; no concurrency assumption was introduced.

## Deliberate plan deviations

- The literal plan's `$0.02` flow cap was stale. The actual published child price is `$0.01`; Graph is `$0.05`, so maximum child settlement cost is `$0.06`.
- The literal clean `allow`/missing-evidence rules were unsafe. Current G12 has no production settlement verifier, rejects `allow`, and emits zero verified attesters. This consumer also rejects `allow` and any nonzero count and never upgrades `ok`.
- The manifest bound is 135 seconds, not the literal 120. The children publish 30- and 90-second bounds; 135 permits safe sequential operation plus broker/output cleanup without assuming extra runner capacity.
- `counterparty` is a required nullable property, rather than an optional property. Absence and known no-evidence are not conflated.
- The actual existing `sourcedFrom` object is preserved and extended with a nullable nested Graph source; it was not changed to the plan's incompatible array sketch.
- Ambiguous transport is not treated as best effort. Only the definitive correlated no-settlement envelope continues.

At price `$0.15`, the fixed 5% fee leaves `$0.1425` seller share. Subtracting the two maximum child prices (`$0.0100 + $0.0500`) gives `$0.0825` pre-inference arithmetic margin. This is arithmetic only: it is not a paid-cost, provider-billing, live-settlement or profitability claim. G12 `sources[].costAtomic` is deliberately excluded because it is nullable query provenance, not another verified wallet child settlement.

## Genuine TDD chronology

1. At `2026-09-05T11:30:00Z`, the new focused test was run before production edits. Collection printed only the Vitest `RUN` banner and did not complete within the 30-second tool window because the old `run.ts` executed `main()` and consumed stdin at import. This established the required import-safety Red in addition to the missing exports.
2. After the guarded module and initial contracts were implemented, the focused owned-socket run at local `17:04:44` passed 9/9 tests (24 ms test time). The socket test required the test runner's normal local-listen permission; it used only a freshly-created `/tmp` Unix socket.
3. The adversarial flow/Graph mutation matrix and non-reflection test were added. At local `17:05:44`, the focused run passed 11/11 tests (31 ms test time), including a real `startHireBroker` instance with injected listing lookup and purchase functions. It used dummy addresses, token, private-key-shaped test data and results only; there was no external network or signature.
4. The first strict TypeScript run found one expected narrowing error: the validated runtime rejection of `allow` was not reflected in the static Assessment union. The return type was narrowed explicitly. The next `bunx tsc --noEmit --pretty false` exited 0.
5. `bun test scripts/e2e-lineage.bun.test.ts` passed 19/19 tests and 206 assertions in 9.24 seconds. It exercised the new frozen historical A9 inputs only; this is not a new live A9/G14 proof and did not modify the immutable live verifier/profile.

No full G gate or live Task 14/15/loop-probe run was attempted. Root retains independent review, full-gate, commit and any separately authorized live coordination.
