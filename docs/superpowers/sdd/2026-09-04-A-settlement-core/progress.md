> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# SDD ledger — plan: docs/superpowers/plans/2026-09-04-A-settlement-core.md
Worktree: .claude/worktrees/a-settlement-core · branch feat/a-settlement-core · started 2026-09-04 22:10 IST · base d03f0d1
Baseline: vitest 475/480 (5 pre-existing preflight spawn timeouts on this host), bun install ok.
Task 1: dispatched (implementer sonnet), BASE d03f0d1
Task 1: minor (deferred): InputInvalid declared but not constructed yet (errors.ts:13-16) — wire or drop by final review
Task 1: minor (deferred): any non-JSON body now 400s before the 402 challenge (server.ts:780-784); Task 8 buyer probe must send the real body
Task 1: complete (commits d03f0d1..ed9832c, review clean)
Task 2: dispatched (implementer sonnet), BASE ed9832c
Task 2: minor (deferred): no tests for empty/malformed/extra-segment tokens or clock-at-expiry (verified by reviewer by execution)
Task 2: minor (deferred): base64UrlDecode strips out-of-alphabet chars (lenient, harmless)
Task 2: minor (deferred): @noble/hashes pinned exact while siblings use caret
Task 2: fix round 1/5 dispatched (hex MAC encoding; errors join ArcadeError), FIX_BASE 1cba937
Task 2: fix round 1/5 (2 addressed, 0 open — hex MAC encoding; errors join ArcadeError; commits 1cba937..d77977d)
Task 2: minor (deferred): errors.ts imports lineage classes as value imports, could be import type
Task 2: complete (commits ed9832c..d77977d, review clean)
Task 3: dispatched (implementer sonnet), BASE d77977d
Task 3: minor (deferred): hop/ancestors have no schema defaults — hub must populate explicitly (Task 5 does)
Task 3: minor (deferred): treeHashOf canonical order relies on literal key order — add a comment
Task 3: complete (commits d77977d..56c187d, review clean)
Task 4: dispatched (implementer sonnet), BASE 56c187d
Task 4: ruling: duplicate-childJobId finding is Important and inherited from the brief; plan text omitted the check rather than mandating duplicates, so fixed as a normal finding (refuse duplicates)
Task 4: minor (deferred): setTreeState has no transition guard (released→committed possible)
Task 4: minor (deferred): amountAtomic not validated positive; 0 amount vs 0 ceiling passes
Task 4: minor (deferred): commit/release of unknown child are silent no-ops
Task 4: fix round 1/5 dispatched (refuse duplicate childJobId), FIX_BASE c7f422e
Task 4: fix round 1/5 (1 addressed, 0 open — refuse duplicate childJobId + non-positive amounts; commits c7f422e..9b51bc6)
Task 4: complete (commits 56c187d..9b51bc6, review clean)
Task 5: dispatched (implementer sonnet), BASE 9b51bc6
Note: owner-initiated resume of the Task 4 agent added a global SessionStart hook (kept). Its worktree side effects (.gitignore line, .claude/handoff/RESUME.md) were reverted/moved to keep task commits clean; RESUME content saved as unrequested-handoff-RESUME.md here.
Task 5: minor (deferred): reservation taken before putJob; failure between reserve and terminal receipt leaks budget — Task 6 must release on every terminal path and the boot reaper should sweep
Task 5: minor (deferred): infra failures (root job/listing missing) report as tree_budget_exceeded with $0 ceiling — misleading message
Task 5: minor (deferred): empty-string capability header refused instead of treated as absent
Task 5: minor (deferred): lineage.test.ts unused Layer import; root case does not pin rootJobId===""; depth case uses maxHop 0 not a real chain
Task 5: minor (deferred): refusal detail leaks parent status vs unknown (needs a valid MAC; negligible)
Task 5: fix round 1/5 dispatched (guard ceiling parse; MAX_HOP env; HTTP ordering test), FIX_BASE ba768e4
Task 5: fix round 1/5 (3 addressed, 0 open — ceilingAtomicFor, maxHopFromEnv, lineage-http.test.ts; commits ba768e4..7cf9876)
Task 5: minor (deferred): lineage-http.test.ts spawns a real process (same flake class as preflight)
Task 5: complete (commits 9b51bc6..7cf9876, review clean)
Task 6: dispatched (implementer sonnet), BASE 7cf9876
Task 6: minor (deferred): every root carries children:[] + empty-set treeHash + ceiling 0 — Task 7 must guard settleWithTree on children.length>0 (dispatch note)
Task 6: minor (deferred): child receipts render twice in the feed (own row + indented under root)
Task 6: minor (deferred): finish() closes over a let tree declared later (TDZ trap on early return)
Task 6: fix round 1/5 dispatched (crash-path release; release tests; public feed strips child jobId + nonce), FIX_BASE b2fbd08
Task 6: fix round 1/5 (3 addressed, 0 open — crash-net release via onError; release-path tests; receipts-feed.ts publicReceipt strips ids/nonce; commits b2fbd08..be413a0)
Task 6: complete (commits 7cf9876..be413a0, review clean)
Note: lib/forge-std copied from the main checkout into the worktree (gitignored /lib/); forge test baseline 13/13
Task 7: dispatched (implementer sonnet), BASE be413a0
Balances 2026-09-05: buyer 0xdaAC…5e1 19.94 USDC; seller/deployer 0xcf82…A78a 20.26 USDC; splitter v1 0.001. Existing demo keys need no faucet drip; new keys (canary/operator/validator/attester/subbuy) will.
OWNER (before Task 9): no arcade-subbuy-key in Keychain; the hire demo needs a funded ARCADE_SUBBUY_KEY distinct from the payout key. Mint + drip one and store as Keychain item arcade-subbuy-key.
HANDOFF 2026-09-05 01:01 IST: execution moved to the Codex desktop app (Daybreak Blue, xhigh, full access) via work order .superpowers/sdd/codex-work-order.md. Codex: Plan B in .claude/worktrees/b-publish-adapters now; Plan A Tasks 8-12 in this worktree once the Task 7 commit lands; then merges and Plans C..I. Claude conductor stops dispatching implementers/reviewers to save budget; Task 7 (Claude subagent) finishes on its own and is NOT separately reviewed. Owner-blocked steps land in [private owner-action ledger omitted]; heartbeat in [private heartbeat omitted].
Task 7: complete-unreviewed (commit 31a6cf5; forge 16/16; Step 8 live deploy skipped — needs the deployer key from Keychain; splitterVersion detection lives in server.ts splitterFacts; MockUSDC.transferDigest added; walletClient? override in Eip3009Config). Codex takes over from Task 8.
Task 8: complete (commits 31a6cf5..b55ff5a)
Task 7 Step 8: complete (commit 2ab6374; FeeSplitterV2 0x9e304ec13dd862c81ee8caa8fd262dac426fbedf; deploy tx 0x34f657969d408d4d5d00848c5d0933d40ae7914859a4d6aeb976cd765d2d88f4)
Task 9: complete (commits 2ab6374..42d4795)
Task 9 live Step 4: OWNER-blocked; distinct funded arcade-subbuy-key still required. Code, shell verifier and regression gates complete; no live lineage evidence claimed. See main [private owner-action ledger omitted].
Task 9 deviation: public tree uses root's flat descendant list, joined by settlement tx; child ancestry/hop proves the grandchild. Buyer CLI already polls the private URL and does not expose it. Preserved pre-payment 402 refusal text after a real broker/SDK/socket regression reproduced its loss.
Task 8 review gap: broker -> callSkill -> fetchWithPayment now exercised in Task 9; daemon assignment -> openJob remains a nonblocking direct forwarding test gap.
Task 10: complete (commits 42d4795..bd5bd2e)
Task 10 review: fixed pending browser signing bypass (unknown wallet chain returned no blocker). Added build-time public network selector and deployment --network/RPC guard because literal plan consumers otherwise mixed default and selected chains. Gates: 579 Vitest + 29 Bun, root/web tsc, web build all pass.
Task 11: complete (commits bd5bd2e..89e0930)
Task 11 review: fixed Gateway boot requiring an irrelevant local gas wallet and sanitized malformed RPC diagnostics. Pending networks refuse before credentials/RPC even with boot checks disabled. Gates: 604 Vitest + 29 Bun, tsc, diff check passed; read-only live Arc testnet chain/domain/decimals/facilitator check passed.
Task 12: complete (commits 89e0930..f2b6700)
Task 12 review: mainnet runbook includes isolated no-network refusal/success fixture, public receipt snapshots (no private job IDs), separate network stores/keys, browser rebuild and required pending-test fixture migration before ready activation. Gates: 604 Vitest + 29 Bun, tsc and 16 Forge tests pass; example schema/envelopes, shell syntax, links, verbatim warning and redaction checked. Mainnet remains pending; no mainnet command executed.
OWNER ITEMS RESOLVED 2026-09-05 05:20: arcade-subbuy-key and arcade-canary-key minted (conductor, owner-approved) and faucet-funded 20 USDC each.

## September 5 — historical test-input compatibility checkpoint

The actual approved A9 live run already passed and its authority is consumed;
this checkpoint does not replay it. G14's upcoming skill changes would otherwise
alter A9's existing offline test inputs. All six pre-G14 manifests/programs are
now versioned inert fixtures, with fixed byte fingerprints and a test-only loader.
The live loader still reads current sources and the exact original guards refuse
price/topology drift. No selector, key, role, price, verifier or live send changed.

Parent independently read the complete change/report and compared the retained
live prefix/suffix, protected shell wrapper and all six fixtures to base `381093e`:
byte-identical PASS. The implementation's real missing-export Red preceded its
19/19 offline tests / 206 assertions and strict TypeScript PASS. Parent repeat,
public-copy validation and the separate full precommit gate follow. No new
four-job proof, funded run, production change or Git push is claimed.

Parent separately repeated all19Bun/206assertions and root/web strict TypeScript:
PASS. Independent source/public review is CLEAN: retained live prefix/suffix and
CLI hashes recomputed equal base, all six fixture bytes equal base, public report
equals original plus banner, and37 local Markdown targets resolve. No privacy
matches were found in the new public fixture/docs. The reviewer performed only
read-only inspection and did not claim another test run. Scope is frozen for the
separate full precommit test/type gate.

Historical fixture checkpoint ec5cf74 committed and fast-forwarded main; its own
full gate and all-four main gates passed2145Vitest/108,301Bun/3386assertions/26,
root/web TypeScript, web build and16Forge. A post-merge file-mode audit found one
inherited executable bit on a .txt snapshot. A genuine failing mode assertion
now passes after changing only that file to100644; all six source hashes and live
guards remain unchanged. The separately reviewed mode/test follow-up gate follows.
