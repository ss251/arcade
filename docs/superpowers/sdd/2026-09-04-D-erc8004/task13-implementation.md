> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D13 evidence harness implementation (offline checkpoint)

2026-09-05 06:03 IST. Owned files: scripts/e2e-erc8004.ts, scripts/e2e-erc8004.sh, scripts/e2e-erc8004.bun.test.ts. No commits, staging, keychain access, real keys, provisioning, live RPC or payments performed by this agent. OWNER six funded-role dependency remains blocked; this report is not live proof.

Read full Task13, parent work order, CLAUDE.md, compatibility notes, and ts-testing skill. The requested Arc/Context7/EVM skills are unavailable in this session; used previously verified official ERC/Arc ABI sources pinned in core and current local viem/Bun/contracts source. TDD used genuine absent-module failure before implementation. Parent temporarily parked the Red test while gating earlier tasks; implementation was authored as ignored .pending files and restored only after explicit release.

## Checkpoint

- `bun test scripts/e2e-erc8004.bun.test.ts`: 36/36 passing, 175 assertions (post-merge childless settlement correction and strict root/event follow-up).
- `bunx tsc --noEmit`: passing.
- `git diff --check -- scripts/e2e-erc8004.ts scripts/e2e-erc8004.sh scripts/e2e-erc8004.bun.test.ts`: passing.
- Real offline shell help and missing-key refusal tested without supplied role keys or setup.
- Real child launch/reap, refusal to signal another manager's process, explicit no-dotenv flag, bounded response body timeout tested.
- Additional true regressions demonstrated automatic dotenv loading and invalid-network diagnostic reflection; fixed with explicit no-env-file execution and a fixed shell pre-import network refusal.

## Proof requirements

Fixed Arc testnet, canonical RPC, eip3009 rail, six pairwise-distinct supplied role keys/addresses, explicit matching `--approve-operator ADDRESS`, seller-specific 5% splitter and fixed usdc-flow-check $0.01 purchase. No arbitrary SKILL/INPUT override. Native role balances and buyer ERC-20 balance are independently read before setup. No identity initialization, owner HOME override, fallback key, or owner config write.

Metadata matches the current standard/aliases and actual current online listing, including known agentId, with no invented /mcp route. Independent Registered plus zero-from Transfer, current ownerOf/tokenURI/isApprovedForAll and optional approval receipt/event are checked BEFORE buying and again in final evidence. Exactly one durable buyer receipt/job must match payment identities/amounts/nonce and the locally recorded empty tree. Independent real transaction receipt and exact USDC transfers/ordinary Settled event are required. This childless call does not commit a tree hash on chain.

Discover ValidationRequest/ValidationResponse/NewFeedback by pinned registry, validator/attester/agent and request hash, within the fresh-run block range (<2048 blocks), not hub logs. Verify exact successful sender/contract receipts, event payload/URI/hash, current validation status and exact filtered non-revoked feedback. Public HTTP bytes must equal durable bytes, rebuilt from the actual job's input/output/schema hashes and immutable receipt timestamp, and match chain commitments. No raw input/output/provider diagnostics enter exported public evidence.

## Orchestration and deviations

One bounded owned hub, runner, identity CLI and buyer CLI. No simulated payment/registry component in the live entry point, no live-test fallback, no resend of uncertain writes. Six-role environment is reduced per child, with no canary key, injection options, or automatic dotenv loading. Actual ephemeral loopback port discovered from a bounded marker. Parent/deadline guards cover children and the original skill entry (only private entry wrapper changes). Stop owned handles only, TERM then bounded KILL/reap; cleanup failure prevents PASS. Five-minute run deadline, bounded read bodies/timeouts/event ranges/receipt polling. Isolated config/checkpoints/database/public bytes retained, never uploaded; raw child output is drained rather than printed or saved.

Literal shell plan replaced unsafe kill-PID-zero, HOME replacement/init, unrestricted CLI inputs, raw log parsing, and unverified printed links. D6's broad ERC-721 transfer approval requires explicit harness consent, not an inferred option from keys. Minted URI is intentionally local ephemeral evidence, as in plan; help and output explicitly state it stops serving after cleanup, with committed bytes retained. No claim of durable public discovery is made.

Root owns package.json/runbook integration and task commit. Remaining live command is OWNER-only: supply six funded role variables plus seller FeeSplitterV2 and run `bash scripts/e2e-erc8004.sh --approve-operator <published-operator-address>` after reviewing blanket transfer authority. On any uncertain failure, reconcile retained registration journal and transactions before running again; do not automatically mint another identity.

After parent D10/D11 gates released, captured a further missing-export Red for assertSplitterEvidence and implemented exact pre-mint FeeSplitterV2 version()==2, feeBps()==500, seller match and usdc()==canonical Arc asset checks. ABI return widths match contracts/FeeSplitterV2.sol (uint8 version, uint16 feeBps). All 29 tests and global typecheck pass. Source/tests frozen for parent D12 gate; independent D13 reviewer in progress. No live execution occurred.

Independent reviewer found one gap: the RPC receipt reader accepted any non-null response without matching its transactionHash to the requested eth_getLogs discovery hash. Extracted the existing passthrough reader behavior and captured concrete Red (29 pass, 2 fail): mismatched requested hash and removed/cross-transaction logs were accepted. Fixed the shared reader so EVERY non-null receipt goes through assertReceiptCorrelation before return. It requires the exact requested transaction hash; rejects removed logs and mismatched present log transactionHash/blockNumber/blockHash/transactionIndex; full evidence assertion also reuses it. No retry or new send added. Final 31/31 tests and global typecheck pass. Source/tests frozen again for root review and ordered task commit.

## Post-merge childless settlement correction

Read-only A9 preparation exposed a defect in my D13 proof fixture: it synthesized a zero-child SettledTree, but pipeline.ts only supplies tree data when children.length > 0; eip3009.ts otherwise calls settle(); FeeSplitterV2.sol emits ordinary Settled. No D13 live run occurred. The previous positive fixture was not live evidence and would have produced a false negative for a successful real childless payment.

Captured genuine behavioral Red after replacing the positive fixture with actual ABI-encoded Settled: 30 pass / 3 fail. The valid childless payment was rejected, the synthetic tree-only negative was accepted, and a downstream validation-hash test failed prematurely at the wrong settlement event. Corrected only scripts/e2e-erc8004.ts and its Bun test: exact Settled payer/nonce/total/sellerAmount/feeAmount; retained exact transaction hash, successful sender/contract, transfer, local receipt-tree, registration, approval and document commitment requirements. Added specific wrong transaction hash and removed/cross-transaction/block/index/wrong-emitter settlement tests. Final focused result: 34/34, 163 assertions. Global typecheck and diff whitespace check passed. No keys, live RPC, transactions, git mutations, or shared production edits.

Root review requested strict actual childless root shape and refusal of a contradictory tree event alongside ordinary settlement. Captured a second genuine Red, 34 pass / 2 fail: missing rootJobId and both event types were accepted. Fixture now has actual rootJobId==jobId, hop 0, explicit empty ancestors/children and treeCommittedAtomic 0. Helper requires those exact values and rejects any decoded SettledTree from the expected splitter, even with a correct Settled. Final 36/36 Bun tests, 175 assertions; global typecheck and targeted diff-check green. Both owned source/test files are frozen for root integration.
