# Execution index — ARCADE at ETHOnline 2026

Spec: `../specs/2026-09-04-ethonline-continuity-design.md`. Nine plans, one per workstream, in this directory. Execution is subagent-driven (`superpowers:subagent-driven-development`): one fresh executor per task, conductor reviews between tasks, gates run before every commit. Owner-performed steps are collected in `2026-09-04-01-owner-actions.md`.

## Order and parallelism

| wave | when | plans | branch / worktree | rebases onto |
|---|---|---|---|---|
| 0 | Sept 4, 21:30 IST | commit research + spec + plans to `main` | `main` | — |
| 1 | Sept 5–6 | **A** settlement core + ChainConfig (critical path) | `feat/a-settlement-core` | `main` |
| 2 | from Sept 7, after A merges | **B** adapters · **C** canary · **D** ERC-8004 · **E** ENS · **G** Graph (skill + Studio smoke) | `feat/b-*`, `feat/c-*`, `feat/d-*`, `feat/e-*`, `feat/g-*` | `main` (post-A) |
| 3 | from Sept 8 | **F** Gateway sessions · **G** subgraph + hub reads · **H** web | `feat/f-*`, `feat/g-*` (cont.), `feat/h-*` | `main` after **E** lands — H needs C's and D's fields *and* rebases onto E's `apps/web` edits (E Task 13) before its own Task 5 `git mv` of the chat page |
| 4 | Sept 10–11 | integration merges in the canonical order **A → B → C → D → E → F → G → H → J → I**, e2e evidence scripts, **I** README/diagram/interop | `main` | — |
| 4b | after H merges (added 2026-09-06) | **J** Arc-native settlement: dual-accept 402 + registry-shaped discovery, Circle CLI agent-wallet buyer, Unified Balance delegate funding, ERC-8183 escrow rail (`2026-09-06-J-arc-native.md`, spec `../specs/2026-09-06-arc-native-settlement-design.md`) | `feat/j-arc-native` | `main` after **H** |
| 5 | Sept 12–13 AM | **I** capture, narration, submission | `main` | — |
| 6 | Sept 16 | **I** mainnet flip, evidence appended | `main` | — |

## Merge order for shared files (from the cross-plan review, 2026-09-04)

The canonical order is **A → B → C → D → E → F → G → H → J → I** (J added 2026-09-06; it rebases onto H and lands before I) — later letters rebase onto
earlier ones — with **two recorded exceptions**, each written into the affected tasks' *Merge
notes*:

1. **H before G** on `GET /stats`. Plan H Task 1 creates the route and the `store.statsSource`
   seam with a constant `"hub"`; Plan G Task 8 replaces that one line with its subgraph probe
   and adds `GET /graph/stats` plus the per-listing `graph` key.
2. **E before H** in `apps/web`. Plan E Task 13 adds the `ensName` prop to `Confirm`, uses it
   in `chat.tsx`, and adds the `.ens-name` rule; Plan H Task 5 then `git mv`s the chat page.
   Moving a file that already carries E's changes is a rename; the reverse is a three-way
   merge of a moved file.

**`apps/hub/src/server.ts`** — land order **A → C → D → E → F → H → G**. The paid branch's
check sequence is canonical in **Plan A Task 5**: input gate (A) → delisted check (C) →
session header (F) → lineage (A) → 402 challenge / verify → reservation (A's tree ceiling and
F's session budget) → job. Plan C's delist refusal reads the *claimed* payer from the payment
header, before verification, purely to let the hub's own canary through; a forged claim buys
nothing but a 402 one step later.

**`apps/hub/src/pipeline.ts`** — **A → C → D → F**. Inside `finish`: build the tree →
`shouldSettle` → `rail.settle(verified, tree)` → `store.putReceipt` → *then* the best-effort
side effects (D's attest hand-off, F's session commit). Nothing after `putReceipt` may change
a settlement outcome.

**`apps/hub/src/store.ts` / `store-sqlite.ts`** — **A (`tree_reservations`) → C (`pay_tests`)
→ D (`erc8004_docs`) → F (`sessions`) → H (`statsSource`) → G (rewires it)**. Four disjoint
tables; append to `StoreState`, `empty()`/`emptyState()`, `initial` and `SCHEMA` rather than
rewriting them.

**`apps/hub/src/ui.ts`** — **A (child rows) → C (pay-test line, `canary` mark) → D (identity
evidence) → F (session refs)**. Four separate render helpers.

**`packages/core/src/receipt.ts`** — **A → C → F**. Every field is `Schema.optional` and every
name unique: A `rootJobId, parentJobId, hop, ancestors, children, treeHash,
authorizationNonce, treeCeilingAtomic, treeCommittedAtomic, receiptSignature`; C `canary`;
F `sessionId, settleRefKind`. D, E, G and H add none.

**`packages/core/src/protocol.ts`** — **A (`JobAssignment.parentJobId`, `hireCapability`) → D
(`Hello.agents` / `AgentAnnouncement`, deliberately outside the signed `helloDigest`)**.

**`packages/core/src/manifest.ts`** — **B (private `Engine` fields, `PRIVATE_FIELDS`) → C
(public `canaryInput` on `PublicListing` + `SkillManifest` + `toPublicListing`)**. Disjoint
halves of the same file, either side of the private/public boundary.

**`packages/core/src/index.ts`** — one `export * from` line per plan (A, D, E, F); keep every
line on conflict.

**`packages/payments/src/{rail,eip3009,gateway,types}.ts`** — **A (widens `Rail.settle` to
`(verified, tree?)`, adds `FEE_SPLITTER_V2_ABI`) → F (hardens `GatewayLive`, adds
`SettledPayment.settlementKind`)**. `gateway.ts` accepts and ignores `tree`.

**`packages/buyer/src/{fetch-with-payment,index}.ts`** — **A (`lineage`) → E (`beforeSign`) →
F (session header)**. Inside `fetchWithPayment`, E's refusal is last: it is the final gate
before a signature exists.

**`packages/buyer/src/hire.ts` / `packages/runner/src/hire-broker.ts`** — **A
(`PurchaseArgs.lineage`) → E (`PurchaseArgs.name`)**.

**`packages/buyer/src/mcp.ts`** — **A → D (8004 evidence) → E (`arcade_call_skill({name})`) →
F (`arcade_open_session`/`arcade_close_session`) → G (`graphEvidenceLine`)**.

**`packages/runner/src/daemon.ts`** — **A (forward `hireCapability`) → D (`Hello.agents`) → E
(ENS liveness ticker)**.

**`packages/runner/src/cli.ts`** — **B (rewrites `publish`, adds `import.meta.main`,
`flagAll`, `--json`) → D (`arcade identity register|status`) → F**. B first, always.

**`vitest.config.ts`** — **G only** (adds `skills/*/test/**/*.test.ts` to `include`).

**`docs/runbook.md`** — append-only, one `##` section per plan (A, B, C, D, E, F, G, H).
**`README.md`** — A corrects the test count, then **I owns the restructure** (Task 5) and the
mainnet evidence (Task 15); I's re-derived test count wins.
**`docs/mainnet-runbook.md`** — written by A Task 12, *executed* by I Task 15, never rewritten.

## Field ownership

- `Receipt` — see above. All optional, all uniquely named.
- `ListingRecord` — **C** `payTested`, `delisted`; **D** `agentId`, `registrationTx`,
  `agentVerified`, and `ensName` (declared by D, **written by E**). Nothing else. Per-agent
  ERC-8004 counts are *not* on the record: `GET /listings/:id` serves them under D's
  `erc8004` key, read at request time.
- Wire keys on `GET /listings/:id` — C `delisted`, `payTested`, `payTestHistory`; D
  `erc8004`; E `ensName`, `ensExpired`; G `graph`. Four independent optional keys.
- Two different `validationPassCount`s exist and must not be merged: **G**'s counts what the
  subgraph indexed (`graph.validationPassCount`), **D**'s counts what the registries answer
  now (`erc8004.validationPasses`). Different sources, different values, different keys.
- Error codes by owner — A `input_invalid`, `lineage_invalid`, `lineage_cycle`,
  `lineage_depth`, `tree_budget_exceeded`; C `listing_delisted`; E `ens_payto_mismatch`,
  `ens_name_expired`; F `session_not_found`, `session_closed`, `session_rail_unavailable`,
  `session_buyer_mismatch`, `session_budget_exceeded`.
- Headers by owner — A `x-arcade-hire-capability`; F `x-arcade-session`. Neither is required
  on a root call, so third-party x402 clients keep working.

## The one cross-plan number

`loop-probe` is priced `$0.30` with `bounds.maxSubSpendUsd: 0.25` and
`scripts/e2e-lineage.sh --max-amount 0.35`, decided once in **Plan A Task 9**. The tree under
it is `wallet-risk-note $0.15` + `counterparty-graph $0.05` + `usdc-flow-check $0.02` =
`$0.22`, and the ledger charges every descendant against the *root's* ceiling. Plan G Task 14
asserts these numbers and never edits them.

## Gates

Every task: `bun run test`, `bunx tsc --noEmit`; web tasks add `bun run web:build`; contract tasks add `forge test`. Every merge to `main`: all four plus the plan's e2e evidence script where one exists.

## Cut order (spec §13)

`openapi` adapter → Gateway sessions (fallback EIP-3009 sessions, Plan F Task 13) → ARCADE subgraph (fallback hub stats, Plan G Task 1) → buyer dashboard → ENS liveness-expiry (keep names + payTo lock) → ValidationRegistry (keep identity + feedback). Never cut: input gate, lineage + ledger, FeeSplitterV2 tree commitment, `skill` + `mcp` adapters, canary, Graph skill, ChainConfig + runbook, marketplace + listing page, README split, video.

## Check-ins

Sept 8 09:29 IST and Sept 11 09:29 IST (Plan I Tasks 11–12).
