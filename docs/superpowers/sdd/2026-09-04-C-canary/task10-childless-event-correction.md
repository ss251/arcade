> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# C10 childless settlement evidence correction — 2026-09-05

Base: d-erc8004 worktree at `ce599d8`, tracked-clean before edits; only `.superpowers` untracked. Scope: `scripts/e2e-canary.ts` and `apps/hub/test/canary-evidence.test.ts`. No commits, network, keys, live services, payments or production payment changes.

Cause confirmed in real code: `apps/hub/src/pipeline.ts` passes `SettleTree` only when a root has children. `packages/payments/src/eip3009.ts` selects `settleWithTree` only when tree input exists and the signed challenge identifies V2. `contracts/FeeSplitterV2.sol` emits `Settled` from ordinary `settle` and `SettledTree` only from `settleWithTree`. The fixed `usdc-flow-check` C10 purchases are childless roots, so the old childless-tree fixture was a false model of the live pipeline.

TDD: full ts-testing skill read. Genuine Red at **2026-09-05T00:55:23Z**: 2 failed / 23 passed. The real childless ABI event was rejected; a synthetic empty-tree event was wrongly accepted. Green at **00:56:27Z**: all **25 Vitest tests** pass. Existing **6 lifecycle Bun tests** remain green. `bunx tsc --noEmit` exits 0; `git diff --check` clean.

Correction requires exactly one matching ordinary `Settled` event from the configured splitter with this buyer, authorization nonce and 10000/9500/500 atomic split, plus both independent exact ERC-20 transfer legs. The durable marked receipt must be this root (`rootJobId === jobId`, hop 0, no parent, empty ancestors/children), with the canonical empty-tree hash and zero committed child spend. That local hash is not represented as an on-chain tree commitment. A splitter `SettledTree` cannot substitute or coexist in this childless proof; actual lineage-parent evidence belongs to the separate lineage harness.

Regressions retain wrong transaction/status/chain/identity/amount checks and add mismatched root/parent/children/hash/nonce, wrong payer/payee/split/emitter, removed or cross-transaction logs and duplicate settlement events. Public evidence claim text now says childless Settled events. Root owns matching runbook wording and full gates/commit.

Live remains on HOLD pending root GO. No outcome is claimed from fixtures.
