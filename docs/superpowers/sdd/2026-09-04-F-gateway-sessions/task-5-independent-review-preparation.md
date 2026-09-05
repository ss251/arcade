> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F5 independent review preparation — no verdict

September 5, 2026. Retained verbatim from the parent-shared adversarial checklist.
This is planning against the approved decisions and authored draft tests, not an
executed test result or final review of the still-evolving G14-owned source.
No source/test edit, implementation execution, key, network, live action or Git
mutation occurred during this preparation.

1. Semantic retry: same authorization/input with fresh proposed job ID + queue time must return the original ID and preserve original job bytes/counts; an already-conflicting proposed ID must reject. Mutate each immutable coordinate individually, especially explicit skillVersion and recomputed request digest. Repeat after release, settlement, restart and close; distinguish existing-handle lookup from new admission. Canonical object-key ordering must not hide array/order/type changes.
2. Ownership bypass: second already-open handle attempts legacy putJob, putReceipt (including invented sessionId), fee-sweep backfill and stale terminal overwrite after the first handle admits/finishes. Assert CURRENT disk ownership prevents both memory and SQL changes; ordinary sessionless writes remain compatible.
3. Atomicity: failure at reservation/job insert, terminal job/receipt/spent/call update, plus an actual COMMIT-time failure if practical (not only statement-trigger abort). Compare both handles' snapshots, queued/terminal Job and Receipt rows, and reopen state. Failed finish after simulated acceptance must retain settling/held with no new begin permit. Failed uncertain-marker persistence must leave settling held.
4. Restart/handle races: two 60-of-100 admissions admit one; two distinct 30 completions total 60; only one concurrent begin has claimed:true; close/reserve race; newly opened handle never reaps session jobs. Trigger rollback, orderly reopen and killed-child checkpoint are distinct evidence categories.
5. Corruption: malformed JSON/decimal/uint256, column-vs-JSON mismatch, dangling session/call/job/receipt, counter-vs-call sum, settled-without-receipt or released-with-paid-receipt, foreign root, invalid terminal status/outcome/version/input. Corruption must be fixed failure, never absent/empty/zero-spend; catch before boot reaper mutates session evidence.
6. Bounds/data: exact 16 KiB / 1 MiB UTF-8 boundaries, depth64 and 65,536 nodes, 100/101 calls, 10,000/10,001 sessions; released/uncertain tombstones count and are not pruned. Reject raw __bigint at any depth, cycles, holes/undefined/nonfinite/coercible values/accessors/toJSON without invoking them; return deep independent snapshots. Avoid scanning all 1M possible call rows merely to update one indexed session.
7. Terminal evidence: full nonzero onchain hashes only on supported semantics; canonical Gateway transfer UUIDs, matching payer/amount/reference/kind/session/job/receipt and exact fee arithmetic; malformed/unknown kind, wrong reference, conflicting duplicate terminal payload, or transfer UUID reused across different bindings reject. Gateway acceptance is not a mined batch; F5 does not independently verify a rail result cryptographically.

The current six drafted Bun cases cover useful initial rollback/restart/one-shot/tombstone paths, but I did not execute them or certify source. No files changed. Awaiting your freeze/review release.

The preceding sentence records the original preparation event. This file was
subsequently created only on the parent's explicit request to retain that exact
checklist. Reference-reuse means a Gateway transfer UUID replayed for a different
authorization/job, not a blanket assertion about future shared batch evidence.
Current F3 proves transfer acceptance only; a future batch needs its own contract.
