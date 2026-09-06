# Vendor-neutrality execution records

Owner-approved additions after G/H, before Plan I packaging. Base d57a7e3;
single-threaded, no new spending or push.

- Task1: [wording brief](task-1-brief.md), [parent report](task-1-report.md).
- [Progress ledger](progress.md).
- Task2: [API engine brief](task-2-brief.md), [implementation report](task-2-report.md).
  Approved free-route live evidence remains separate and pending.
- Task3: Agent Plugins ingestion remains next; unsupported types must be reported.

The [public SDD index](../README.md) and [seller guide](../../../seller-guide.md)
remain the entry points. Historical terminology updates are explicitly dated;
no private original, approval ledger, runtime journal or credentials are copied.

Task1's initial full invocation passed Vitest but missed two Bun suites because
the new worktree lacked its separate pinned subgraph dependencies. After setup,
only those suites and the unreached strict/build stages were run; all passed.
The report preserves this split coverage, not a fictional clean first invocation.
