> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# C1 — Public canary input

Commit2cc31aa, basea4be9f5. Final full-suite and TypeScript rerun passed after C2 reached57 cases and froze; independent fixture/store review also clean.

Added optional Schema.Unknown public canaryInput to SkillManifest and PublicListing and their exact projection. Null, false, zero, strings, arrays and objects survive encode/decode; omission remains omission. Added realistic public samples to all eight shipped listings, preserving every other manifest field (especially loop-probe $0.30 and tree budgets).

TDD: seven expected missing-input failures at 03:37:04 IST; 65 focused and148 core tests then passed. Root independently reviewed both schema fields, wire projection and all eight manifest-only additions. B fixture comparisons first reproduced two expected extra-field failures at03:39:33, then were adapted to require exact generated fields PLUS each explicitly asserted canaryInput, not a broad partial match. Runbook identifies this subsequent enrichment.

Full test gate at03:43:52 passed1,092 Vitest in67 files plus29 Bun. This working-tree gate includes independently completed but separately committed C2(49 cases), C3(9 cases) and C5(5 cases); C1 itself adds8 cases. TypeScript initially exposed C2 helper narrowing, corrected in its own implementation. No web/contracts change, live request, payment or secret read.

Deviation: the plan's four-listing inventory was stale after A/B; all eight current manifests need samples. No generator code was changed to invent seller-owned examples. Public input may legitimately use a property called command; only the private engine binding remains excluded. No push.
