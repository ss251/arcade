> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# SDD ledger — plan: docs/superpowers/plans/2026-09-04-B-publish-adapters.md
Worktree: .claude/worktrees/b-publish-adapters · branch feat/b-publish-adapters · started 2026-09-05 01:03 IST · base d03f0d1
Baseline: vitest 480/480 after installing dependencies inside the worktree; initial pre-install run was invalid because packages were unavailable.
Task 1: complete (commits d03f0d1..67f7761)
2026-09-05: rebased completed Task1 onto main f2b6700 (Plan A merged, 604 Vitest + 29 Bun + tsc + web build + 16 Forge passed). Task1 replayed as 24be298. Mainnet remains pending; A9 live lineage is OWNER-blocked. Existing main .gitignore handoff addition is present in merge and retained in scoped stash backup.
Task 2: started (base 24be298); addressing Task1 review gaps with exact credential arrays and inclusion of all adapters in the total-function property test.
Task 2: complete (commits 24be298..2fa46e9)
Task 2 deviation: moved Task3's entryless command sentinel handling forward to keep the newly optional entry type safe; two spawn regressions reproduced undefined-path errors then passed. Hardened unusable required fields and auth names with TDD; secrecy property proves fields survive decode before asserting absence from wire. Gates: 624 Vitest + 29 Bun, tsc, diff check; independent review clean.
Task 3: started (base 2fa46e9); root captured three local stdin forwarding failures and implementer captured four missing projection failures. Real harness subprocess tests added to cover entryless dispatch without importing a sentinel path.
Task 3: complete (commits 2fa46e9..940064a)
Task 3 gates: 631 Vitest + 29 Bun, tsc, diff check; independent review clean. Four helper tests, three argv/stdin/secret exclusion paths, two real harness dispatch tests; all red→green. Plan's one-character fixture id corrected to valid test-skill. Skill branch deliberately remains unsupported until Task4, MCP/OpenAPI implementations follow in Tasks5/6.
Task 4: complete (commits 940064a..26434f1)
Task 4 gates: 660 Vitest + 29 Bun, tsc, diff check; independent review clean. Loader/parser/reference tests plus real harness tests with mocked SDK verify nested cwd, permission authority, private diagnostics and containment. No provider call. Uses fs/promises for Node/Bun parity and refuses symlinked reference roots.
Task 5: started (base 26434f1); MCP engine implementation and unit tests delegated, root owns dependency/registry and integration checks.
Task 5 TDD: 41 unit cases green after missing-module red; real stdio success/error/empty routes pass after registry red. Actual execSkill timeout produced timeout outcome but orphaned owned MCP child; regression test reaped its own child and cleanup implementation is underway.
Task 6: independent helper/test work started while Task5 lifecycle review finishes; registry and commits remain ordered after Task5.
Task 7 preparation: 2026-09-05 02:22 IST read-only POST https://docs.arc.io/mcp tools/list returned three tools (search_arc_docs, query_docs_filesystem_arc_docs, submit_feedback), only first two readOnlyHint:true. Exact metadata fixture saved with apply_patch for upcoming introspection tests; no tools/call or feedback submission.
Task 5: complete (commits 26434f1..821b276)
Task 5 gates: 756 Vitest + 29 Bun and tsc passed (full working-tree suite includes 41 pending independent Task6 unit tests; Task5 itself adds 55 cases). Root independently reviewed MCP code and verified actual call/close cancellation. Private errors/stderr suppressed, redirect and inline-URL credentials rejected, SDK calls bounded. No live tool calls or payments.
Task 6: complete (commits 821b276..b9f5f2a)
Task 6 gates: 762 Vitest + 29 Bun, tsc, diff check; 42 helper tests + 5 real harness/registry tests, all green. Root reviewed code and injected-fetch subprocesses. Unsupported OpenAPI forms fail closed; read/fetch/JSON errors remain private; required auth-bound parameters are supplied only by seller environment.
Task 7: started (base b9f5f2a); implementer owns MCP introspector/unit tests, root owns captured fixture and real stdio roundtrip integration, separate reviewer audits filesystem/privacy boundaries. No additional live request needed.
Task 7: complete (commits b9f5f2a..53619b5)
Task 7 gates: 826 Vitest + 29 Bun, tsc, diff check; 63 helper cases and one real SDK stdio discovery→generate→load→execute roundtrip. Independent filesystem/privacy review clean. Bounded paginated discovery, private config projection and atomic per-file safe writes verified, including nested symlink-parent refusal. Live metadata fixture only; no live tool calls/payments.
Task 8: started (base 53619b5); fresh implementer owns OpenAPI generator/helper tests, root owns exact Frankfurter fixture and independent harness roundtrip. Runtime compatibility constraints recorded in task-8-compatibility.md.
Task 8 TDD: 45 focused helper assertions failed on missing exports; at 02:53:26 IST root's two real-harness OpenAPI roundtrips failed on missing operationsOf/parseAuthFlag while existing MCP roundtrip remained green. Generator implementation underway; root independently checks fixture and authenticated JSON POST behavior.
Task 8: complete (commits 53619b5..0c9b2bf)
Task 8 gates: 908 Vitest + 29 Bun, tsc, diff check; generator suite143 (80 new) plus roundtrip suite3 (2 new). Root independent review and real-harness FX/authenticated POST checks clean. Added red→green normalization-collision, null-schema/null-only-output and contained spec-path guards. No network, keys, web/contracts changes or push.
Task 9: started (base 0c9b2bf); prepared implementer owns CLI/helper tests, root owns real subprocess CLI integration. All application flags/help stop before --; directory --json preserves Plan H contract.
Task 9: complete (commits 0c9b2bf..c15e5a6)
Task 9 gates: 977 Vitest + 29 Bun, tsc, diff check; 56 unit + 13 actual CLI subprocess cases. Root/in-dependent review clean; live Arc Docs preview found3/chose2, skipped submit_feedback, wrote nothing. H singular arbitrary-target JSON assumption is recorded separately; B9 exact directory shape preserved. Existing prose marker retained for future consumers.
Task 10: started (base c15e5a6); delegate owns prompt/manifest/doc snippet migration and four demo tests, root owns public/prompt preservation and CLI review.
Task 10: complete (commits c15e5a6..71f5447)
Task 10 gates: 981 Vitest +29 Bun, tsc, diff check. All four new demo tests red→green. Root compared complete decoded public projections and exact old/new system prompts, both identical; actual CLI --json loads skill/SKILL.md with private model and no capabilities. Deleted only superseded agent.ts, recoverable from git.
Task 11: started (base 71f5447); delegate writes absent-listing regression tests, root will generate read-only Arc Docs demos with live CLI after Red.
Task 11: complete (commits 71f5447..622ea1c)
Task 11 gates: 987 Vitest +29 Bun, tsc, diff check; six new demo cases, exact live-generated manifests equal captured fixture outputs. Read-only tool discovery only; submit_feedback excluded. Query tool's intended public display-name fallback is asserted explicitly, distinct from excluded private engine/transport fields.
Task 12: started (base 622ea1c); root adds offline fixture-equality/privacy tests, verifies free upstream, and generates/runs the FX listing through the real CLI/harness.
Task 12: complete (commits 622ea1c..f98cab8)
Task 12 gates: 990 Vitest +29 Bun, tsc, diff check; three new demo tests red→green. Free upstream GET and real execSkill/harness succeeded/end_turn with USD/EUR0.86044,date2026-09-04,cost0. Exact manifest generation and semantic fixture/spec identity verified; no paid call yet.
Task 13: started (base f98cab8); delegate owns testable evidence module/root wrapper/shell and offline tests, root owns guide/live checks and isolated Arc-testnet paid settlement.
Task 13: complete (commits f98cab8..a4be9f5)
Task 13 gates: 1,021 Vitest +29 Bun, tsc, shell syntax and diff check; independent review clean and 31 new evidence cases passed again. Live partial two-adapter run passed; separate paid FX purchase settled $0.01 on Arc testnet (tx0xb0cbe2a50de1c4daa1f56d2a33acadfb9ac32649bc33e2f99b7ec6e3c1aca613), independently verified receipt. Full three-adapter live run OWNER-pending Anthropic API key; exact action in main handoff. Temporary services stopped, evidence DB retained; no mainnet, keys changed or push.
2026-09-05 03:36 IST: B rebase onto main was a no-op; fast-forward merged as a4be9f5. All main merge gates green: 1,021 Vitest +29 Bun, root/web TypeScript, web build,16 Forge. Locked offline install refreshed stale main MCP dependency links; identical escalated Forge rerun fixed macOS sandbox proxy panic. No code changes, no push. Continued C in its own worktree.
