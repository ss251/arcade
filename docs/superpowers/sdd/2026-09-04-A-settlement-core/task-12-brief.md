> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 12: Mainnet runbook and doc corrections

**Merge notes.** `docs/runbook.md` is appended to by every plan (A, B, C, D, E, F, G, H) and `README.md` by A, E, F, G and I. Both are append-only by convention: add a new `##` section with your plan's name, never re-flow another plan's section. **Plan I owns the README's ETHOnline restructure** (its Task 5) and **executes** `docs/mainnet-runbook.md` (its Task 15) — this task *writes* the runbook and Plan I never rewrites it. The stale `"366 tests"` line is corrected here; Plan I Task 5 replaces the figure again with the count its own run prints, and that later number wins.

**Files:**
- Create: `docs/mainnet-runbook.md`
- Modify: `CLAUDE.md` (RPC line), `docs/runbook.md` (link), `README.md` (test count line and `ARCADE_NETWORK` mention)

- [ ] **Step 1: Write `docs/mainnet-runbook.md`** with these sections, each with the exact commands: (1) Parameters: where to read chain id, RPC, USDC address, explorer (`https://docs.arc.io/arc/references/contract-addresses`, `/arc/references/rpc-endpoints`); (2) Fill `config/chains/arc-mainnet.json`, set `status: "ready"`; (3) `bun run scripts/chain-check.ts --network arc-mainnet`; (4) Deploy `FeeSplitterV2` per seller with `bun run scripts/deploy-splitter.ts --v2 --network arc-mainnet` (seller is immutable); (5) Fund the facilitator with mainnet USDC (gas is USDC); (6) `ARCADE_NETWORK=arc-mainnet ARCADE_RAIL=eip3009 bun run hub` (Gateway refused on mainnet until Circle lists Arc); (7) Canary: one deliberately failing call (no tx), one succeeding call (tx); (8) Rollback: `ARCADE_NETWORK=arc-testnet`; (9) Evidence: append tx hashes to `README.md` "Proven on Arc mainnet"; (10) Dates: Sept 16 public mainnet, Sept 30 prize deadline. Include the dual-decimal warning verbatim from `packages/core/src/chain.ts`.

- [ ] **Step 2: Correct docs.** In `CLAUDE.md` change the RPC line to list both hosts with `rpc.testnet.arc.io` first. In `README.md` replace "366 tests" with the current count from `bun run test`. Link the runbook from `docs/runbook.md`.

- [ ] **Step 3: Run the full gates**

Run: `bun run test && bunx tsc --noEmit && forge test`
Expected: PASS.

- [ ] **Step 4: Commit**

Historical command (not current operator instructions):
```text
git add docs/mainnet-runbook.md CLAUDE.md README.md docs/runbook.md
git commit -m "docs: mainnet runbook for the Sept 16–30 flip; correct RPC host and test count"
```

---

## Self-review

- **Spec coverage (M2, M9 part 1):** input gate (T1), lineage capability + derivation + refusals (T2, T5), tree ledger (T4, T6), receipt tree fields and endpoint (T3, T6), FeeSplitter v2 with on-chain commitment (T7), runner/buyer forwarding (T8), live evidence (T9), ChainConfig + manifests (T10), boot checks (T11), runbook (T12). Circle CLI interop and the Sept 16 flip itself live in Plan I.
- **Placeholders:** none; every step has code or an exact command. The one deliberate reader instruction is in T7 step 1 (reuse the v1 test's mock token names).
- **Type consistency:** `mintHireCapability/verifyHireCapability/HIRE_CAPABILITY_HEADER/ROOT_LINEAGE/childLineage/DEFAULT_MAX_HOP` (T2) are used in T5, T8; `reserveTree/commitTree/releaseTree/treeState` (T4) in T5, T6; `ReceiptChild/treeHashOf` (T3) in T6; `SettleTree` and `Rail.settle(verified, tree?)` (T7) in T6's pipeline hand-off; `loadChainConfig/ChainConfig` (T10) in T11.
