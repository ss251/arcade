# Plan J — Arc-native execution records

Owner-approved extension after the merged H code checkpoint and before Plan I.
H10 durable-session choice, H14 owner visual/live-wallet acceptance and G15 live
evidence remain separate open work; this index does not mark them accepted.

- [Approved design](../../specs/2026-09-06-arc-native-settlement-design.md).
- [Twelve-task plan](../../plans/2026-09-06-J-arc-native.md).
- [Task 1 brief](task-1-brief.md), [manifest checkpoint](task-1a-report.md),
  [challenge/dispatch checkpoint](task-1b-report.md).
- [Task 2 brief](task-2-brief.md), [discovery record](task-2-report.md),
  [discovery contract](../../../circle-discovery.md).
- [Task 3 brief](task-3-brief.md), [selection/balance foundations](task-3a-report.md),
  [SDK/MCP/canary integration](task-3b-report.md).
- [Task 4 brief](task-4-brief.md), [proof contracts](task-4a-report.md),
  [read-only CLI preflight](../../../evidence/J/circle-cli-preflight.md).
- [Progress ledger](progress.md).
- [Task5 brief](task-5-brief.md), [policy/binding checkpoint](task-5a-report.md).
  [Durable journal checkpoint](task-5b1-report.md).
  [Signing guards and command policy](task-5b2-report.md).
  [Guarded runtime and CLI](task-5b3-report.md), [funding guide](../../../unified-balance-funding.md).
- [Task5C brief](task-5c-brief.md), [canonical URL correction/preflight](task-5c-url-report.md).
  [Reproduced Minter source identity](task-5c1-report.md).
  [Pending-batch response compatibility](task-5c2-report.md).
  [Owned proof evidence/safety contracts](task-5c3a-report.md).

Tasks execute root-only with four-worker limits, one sequential full gate per
commit and prompt fast-forward merges without squash or push. Testnet sends
remain bounded by the specific approved proofs; raw journals/keys stay private.
The [Circle plugin fixture](../../../evidence/B13-agent-plugins.md) is already
merged but does not claim Task12's full checkout or live paid listings.
