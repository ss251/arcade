> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E14 — three independently asserted ENS demo beats

Completed in commit `2ba1d8c` with the exact plan subject and Codex trailer. Five task-owned files only: two buyer Promise API files, the demo runtime, behavioral Bun tests and actual CLI subprocess tests. Full implementation/TDD record: `internal/task-preparation/e14-implementation.md`.

Final staged full gate completed successfully (session4368): 2,041 Vitest tests across108 files,192 Bun tests, TypeScript and diff checks. Focused gate:34 Bun tests and4 buyer Promise tests. Independent source/runtime reviews clean; the suspected renewal-role scope issue was checked against the pinned official PermissionedRegistry source, which normalizes role resources itself, so no speculative fix was added.

Live evidence is separate and still pending. The trusted user subsequently approved funded Sepolia owner/daemon keys and exact label `arcade`, changing priority to E13 → A9/C10 → D13 → ENS → B13. A9/C10/D13 have passed live and main all-four gates. No ENS key has yet been retrieved and no ENS write sent. The persistent service endpoint choice remains unresolved; local demo URLs versus an existing production deployment materially affect the records written on-chain. E15 documentation remains an unstaged root-owned draft pending actual evidence.

Safety/plan corrections: strict receipt/log/transaction binding; exact decoded permission error; synthetic tampered challenges explicitly labeled; real chain time and passive resource transition required for expiry; scoped daemon cannot revive expired names; separate journals, bounded cancellation/cleanup and no uncertain automatic resend/recovery.

## Rebase and final readiness, 10:42 IST

Rebased completed E commits onto verified maincc5a683; E14 is now `ad4e022`. Range-diff verifies14/15 identical patches, with E2 differing only in runbook insertion context after D13 live evidence. No source/test changes during rebase. E15's exact two owned drafts were scoped-stashed, restored and conflicts resolved preserving A/C/D evidence. Temporary own stash3eb87b8d3217b69e9e383c4bf9d7b2692e034139 retained; unrelated original user stash is untouched.

First full rebase gate74527: one MCP publish-roundtrip timeout (2,046 other Vitest tests passed). Isolated unchanged test30540 passed all3 tests; repeated unchanged full gate58912 passed2,047 Vitest,213 Bun/1,128 assertions, TypeScript and web build. No assertions/timeouts weakened. Forge initially lacked the ignored worktree-local forge-std dependency; explicit main-library remapping compiled successfully, then sandboxed macOS SystemConfiguration crashed before tests. The same command with authorized unsandboxed execution passed all16 contracts tests; no dependency/config/source changed. Final diff check clean.

ENS live remains paused before key retrieval or transaction submission for the actual on-chain service endpoint choice, not missing label/funding. B13 stays frozen in the user-requested order. E15 docs clearly separate approvals/public preflight from still-unproved live evidence and fix stale A9 pending references.
