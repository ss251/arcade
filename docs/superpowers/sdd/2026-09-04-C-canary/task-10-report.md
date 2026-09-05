> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# C10 — isolated live canary evidence harness

Code and offline verification complete; live proof remains OWNER-pending. No C10 live transaction is claimed.

Implemented the exact plan entry point plus a testable TypeScript controller and root `e2e:canary` command. The controller proves offline history separately from reconnect delisting, releases the real skill only after observing hidden state, then independently verifies two distinct settled purchases through durable receipts and actual ERC-20/FeeSplitterV2 events. Child processes use allowlisted environments and bounded, awaited owned-process cleanup. It never initializes a runner, substitutes a canary key, or writes secret/config files.

TDD: missing-module Red at04:15:48; two further genuine regressions at04:23:10 (restored identity and gated-child readiness); 19/19 green at04:23:34. Root missing-package-command Red at04:25 followed by wiring, actual help and Bash syntax passing. Independent read-only review CLEAN, 19 tests rerun04:31:35. Root full04:26:37 gate:1,247 Vitest +37 Bun, TypeScript and diff check passed; final repeat after append-only documentation placement recorded in ledger.

Literal-plan corrections and detailed test evidence: `task-10-implementation.md`. The script treats disconnected detail404 as offline only, verifies durable3-failure history, and requires reconnect-hidden state before release. It preserves current runner configuration through fresh in-memory config rather than init/HOME replacement, rejects non-testnet/simulated inputs, and checks confirmed receipt contents rather than printing unverified hashes.

Runbook is explicit about live status and dedicated-key OWNER prerequisite. Exact owner steps in main ignored `[private owner-action ledger omitted]`. No keys generated/accessed/funded, no live calls, no deploy, no push. The required commit subject describes the test harness; its body explicitly states the real-chain run is pending.

## Live milestone — 2026-09-05

The earlier OWNER-pending status is superseded by the explicitly approved live run, independently verified at `2026-09-05T04:40:08.403Z` on `eip155:5042002`. Root executed the harness with the owner-provided dedicated canary `0x2890ccF322155641545c6B4482Ea896B479aa937`, existing testnet seller/facilitator and FeeSplitterV2 `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf`. Exactly two $0.01 purchases settled: initial `0xab8cd630b7e187eef9f788ae43d3fe08f6203a6789205e3940d2510d465eea03`, recovery `0x98a30e9aa65f4a237696755fc81c3e34ce020bbc65d9139d16ae5dc3b178dd5c` ($0.02 total plus facilitator gas).

Public proof `<LIVE_RUN_ARTIFACT>` records three durable offline failures with empty job IDs, both detail routes returning 404, four discovery omissions, reconnect preserving delisting, and distinct paid recovery restoring discovery. Offline failures are not paid jobs or on-chain evidence. The two successful marked receipts matched independently read ERC-20 transfers and childless `Settled` events. Owned services were confirmed stopped before PASS. Private SQLite history remains local, separate from publishable proof; no database dump is public. This documentation update read only public evidence and did not access keys, run services, or send transactions.

Runbook C10 evidence now records the live timestamp, exact transaction links and amounts, off-chain versus on-chain distinction, and cleanup/privacy outcome. JSON-to-document verification and `git diff --check` are the documentation gates; root owns final full gates and commit. Historical code/offline TDD results above remain unchanged.

Final integration: the C10 live-evidence documentation follow-up was rebased after A6eb44c5 and committed as `6eed333`; this is the final C follow-up hash, now merged into main. Root completed the required all-four main gates, including the subsequent D live-doc commitcc5a683: 1,656 Vitest +113 Bun, TypeScript checks, web production build and16 Forge tests GREEN. The earlier pending integration sentence above is historical and superseded. Private reports/progress remain untracked and unstaged; this reconciliation changed no tracked source/document and performed no new live action or gate rerun.
