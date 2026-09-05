> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# C4 — Durable pay-test history

Added pay_tests table/index, boot history load, normalized seller keys, stable at_ms/rowid ordering and retention of100 operator rows on disk versus20 public working rows. Listings/runners remain ephemeral. Insert and pruning share a sqlite transaction; only a successful commit is followed by the synchronous in-memory Ref update, in one uninterruptible boundary. Other persistence paths and A tree reservations are unchanged.

TDD: eight initial failures reproduced lost restart history, absent table and false success after database closure. After implementation, seven passed and one test incorrectly assumed SELECT order; explicit ORDER BY corrected that test. Final03:52:36–03:52:40 IST:17 Bun sqlite/tree tests,21 Vitest store tests, TypeScript and diffcheckpassed. Root independently reviewed all production changes and the eight new regressions. Full gates/commit recorded on completion.

Tests prove persisted delist after restart/reconnect, passing-row relist, no restored listings/runners, seller/skill isolation, casing across old/new rows, same-time and out-of-order chronology,100/20 retention, failed inserts/closed database leave memory unchanged, prune failure rolls back insert, retry after database recovery. Tests use unique temporary directories and close owned handles before cleanup. No real database, network, payment or key used.

Deviations: literal plan used memory-first write-through and non-transactional prune, which could publish undurable evidence. Disk-first atomic operation fixes that. NOCASE pruning also groups historical mixed-case rows. Exact public interfaces/table fields retained; no dependencies or push.

Completion:826c0d3, exact plan subject and Codex trailer; only2 intended files staged. Full precommit gate at04:00:26 IST passed1,149 Vitest +37 Bun, TypeScript and diffcheck. Ignored reports remain uncommitted.
