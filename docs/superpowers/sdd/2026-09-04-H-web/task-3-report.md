> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H3 — pure anonymized receipt tree

Implementation source/test frozen for independent review on 2026-09-05. Scope is ONLY `apps/hub/src/tree-view.ts`, `apps/hub/test/tree-view.test.ts`, and this ignored report. No server route, store, H1/H2, web, dependency, Git, network, key, or filesystem runtime behavior was changed.

## Source-verified compatibility correction

Read full H Task3 (lines758–1051) and actual `apps/hub/src/pipeline.ts` tree construction/finish plus `store.ts` tree ledger. The literal plan wrongly calls root `children` one level of direct edges. In production, only roots carry that field: the root ledger contains all descendant reservations, excludes `released` rows, includes `reserved` and `committed`, and projects the associated receipt's settled flag/transaction when available. `treeCommittedAtomic` counts only committed amounts. A failed call releases its reservation before persisting its receipt, so that failed descendant can be absent from the root commitment but still have valid same-root parent/hop lineage.

The implementation therefore:

- Derives edges exclusively from same-root `parentJobId`, exact parent-hop+1 and rail/network agreement, never the flat commitment array. Deterministic internal job-ID sort produces positional node IDs; neither those IDs nor parent positions are capabilities.
- Checks the canonical root digest using `treeHashOf`, unique root ledger entries, exact committed sum of settled entries, and committed≤ceiling. Missing/invalid commitment produces an explicitly incomplete root-only view, not a guessed hierarchy or a claimed valid digest.
- Correlates committed child skill/price/settled/transaction fields with actual receipts. Missing/mismatched/conflicting/foreign-root descendants are withheld and flagged. Settled descendants absent from the commitment are withheld. Failed released receipts may appear when their own same-root lineage is valid; they are not inserted into the commitment.
- Never promotes an authenticated child ID or a conflicting-root row into a root. Root parent must be absent, root hop0 (or legacy absent), and any declared root binding must equal the requested root. Unknown/invalid/ambiguous root returns `undefined`; the parent will mount the token-gated route later.
- Preserves the planned `TreeNode`, `TreeView`, and `buildTreeView` API, with additive `complete:boolean` and fixed bounded `evidenceFlags`: commitment-missing, commitment-mismatch, receipt-missing, receipt-conflict, lineage-invalid, evidence-malformed, limit-exceeded. No provider/input text appears in these flags.
- Reuses frozen H1 `scrubReceipt` for exact money, safe reasons/references/explorers. Only planned node fields are selected afterward. Canonical 2–64 character skill IDs are required; private job/buyer aliases and malformed labels become `unknown-skill` with incomplete evidence. The root ID occurs only at top-level `rootJobId`; nodes expose no buyer, child job ID, session, ancestry, nonce, signature or private diagnostic.
- Snapshots only consumed own data fields; malformed receipt getters are not invoked. Numeric bounds: uint256 nonnegative atomic values, exact seller+fee=price, feeBps0..10000, nonnegative safe-integer latency/time, hop0..16. Overall bounds: at most20,000 input receipts,256 output nodes and16 edges of depth. Oversized scan returns undefined; oversized tree returns an explicitly incomplete root-only view. No silent truncation is called complete.

`treeHash` is a matching canonical **recorded** digest, not independently RPC-verified on-chain proof. Likewise node settlement booleans are ledger facts. `complete` means the supplied bounded local evidence passes these consistency checks, not that every chain record has been independently indexed.

## Tests and validation

- 16:28:55IST (10:58:55Z): genuine failure-first missing-module Red before `tree-view.ts` existed, matching the plan's TDD mechanism.
- 16:32:12IST: initial18/18 pure tests Green. The large-scan fixture unnecessarily recomputed20,001 keccak fixtures and took4.6s; changed only fixture construction to reuse one immutable receipt, preserving the oversized input assertion. Product limits did not change.
- 16:33:36IST (11:03:36Z): added a concrete coercion regression; **1 failed/18 passed**, with two unexpected `toString()` calls on malformed rail/job-ID objects. Fixed explicit type guards before membership/lookups; no coercion.
- 16:33:57IST (11:03:57Z): **19/19 tree tests Green**, ~21ms; combined with current parent-reviewed H1 tests,48/48 Green. H1 test count had grown to29 from the parent's independent fixes; this worker did not edit H1 after its freeze.
- Strict compiler program uses exact root options and explicitly includes `tree-view.test.ts` (app tests are not included by root tsconfig): **0 diagnostics**. No full repository suite run by this worker.

Coverage includes reversed flat descendant order producing true grandchild edges, input permutation determinism, released failed descendant display, modern empty versus legacy unknown commitment, root-only authorization invariant, unknown/foreign roots, missing receipts, exact duplicate versus conflicting rows, cycles/orphans/wrong hops, conflicting hash/budget/child settlement evidence, reserved missing descendants, private skill aliases, exact above-safe-number money, malformed numeric ranges, traversal limits, getter/coercion refusal and source immutability.

Parent owns route/auth integration, independent review, broader gates and ordered commits. H1 files remain frozen from this worker's perspective.
