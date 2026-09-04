# Brief for plan writers (Plans B–I)

You are writing one implementation plan for one workstream of the ARCADE "Charizard" scope. Read, in order:

1. `docs/superpowers/specs/2026-09-04-ethonline-continuity-design.md` — the approved design. Your workstream is one of its "M" sections.
2. `docs/superpowers/plans/2026-09-04-A-settlement-core.md` — Plan A, already written. It defines the interfaces every other plan consumes (copy exact names; do not rename): `HIRE_CAPABILITY_HEADER`, `mintHireCapability`, `verifyHireCapability`, `Lineage`, `ROOT_LINEAGE`, `childLineage`, `DEFAULT_MAX_HOP`, errors `LineageInvalid|LineageCycle|LineageDepth|TreeBudgetExceeded|InputInvalid`; `Store.reserveTree/commitTree/releaseTree/treeState`; `ReceiptChild`, `treeHashOf`, `Receipt` tree fields (`rootJobId, parentJobId, hop, ancestors, children, treeHash, authorizationNonce, treeCeilingAtomic, treeCommittedAtomic, receiptSignature`); `JobAssignment.parentJobId/hireCapability`; `Rail.settle(verified, tree?)` with `SettleTree`; `FeeSplitterV2` with `settleWithTree` and `SettledTree` event; `ListingRecord.splitterVersion`; `ChainConfig`, `loadChainConfig(network)`, `toViemChain`, manifests in `config/chains/*.json` (including `erc8004` addresses); `chainCheck`; `validateJson`; HTTP error codes `input_invalid`, `lineage_*`, `tree_budget_exceeded`.
3. The writing-plans skill format: `/Users/thescoho/.claude/plugins/cache/superpowers-marketplace/superpowers/6.2.0/skills/writing-plans/SKILL.md`. Follow it exactly: header block, Global Constraints, File structure table, tasks with **Files / Interfaces / bite-sized steps** (failing test → run → implement → run → commit), no placeholders, real code in every code step, self-review at the end.
4. The repo. Read every file you will touch before writing a task; cite paths with line numbers. Conventions: Bun + Effect (Effect Schema, `Data.TaggedError`, `Effect.gen`), vitest for `*.test.ts`, `bun test` for `*.bun.test.ts`, viem 2.x, `bun:sqlite` write-through store (`apps/hub/src/store.ts`, `store-sqlite.ts`), server-rendered hub UI in `apps/hub/src/ui.ts`, TanStack Start web app in `apps/web`. Secrets via env/Keychain only. Never `waitForTransactionReceipt`. Money is 6-decimal atomic bigint. Settle only on success — no plan may broadcast on a failed job. Third-party x402 clients must keep working on root calls.
5. Research with the URLs you need: `docs/superpowers/research/ethonline-2026/*.md` (Arc/Circle, The Graph, ENS, World, Hedera, Ledger, secondary) and `DEBATE/SYNTHESIS.md`. Prefer facts from those files and from live docs (`WebFetch`, `gh`, MCPs `arc-docs`, `circle`, `context7`) over memory. Verify package names and versions with `npm view <pkg> version` before pinning them.

## Global constraints to copy into your plan's Global Constraints section

- Never commit `internal/`. No secrets in source or `.env`.
- Settle only on success; ERC-8004 / ENS / subgraph / canary side effects never change a settlement outcome and must be best-effort.
- Gates before every commit: `bun run test`, `bunx tsc --noEmit` (or `bun run typecheck`), `bun run web:build` for web changes, `forge test` for contract changes.
- Conventional, small commits; one per task.
- Everything demoable on Arc testnet (chain 5042002) with the live hub `https://arcade-hub-production.up.railway.app` or a local hub per `docs/runbook.md`.

## Output

Write to `docs/superpowers/plans/2026-09-04-<letter>-<stream>.md` (the letter and stream name are in your task). 8–16 tasks. Each task ends with a runnable acceptance command. Include a final "Live evidence" task that produces something a video can show (a tx hash, a screen, a script output). Include the fallback from the spec's cut order where the spec names one. Do not write code into the repo; write only the plan file. Return a 10-line summary: task list with one line each, plus any spec ambiguity you resolved and how.
