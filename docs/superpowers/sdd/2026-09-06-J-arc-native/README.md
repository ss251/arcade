# Plan J — Arc-native execution records

Owner-approved extension after the merged H code checkpoint and before Plan I.
H10 durable-session choice, H14 owner visual/live-wallet acceptance and G15 live
evidence remain separate open work; this index does not mark them accepted.

- [Approved design](../../specs/2026-09-06-arc-native-settlement-design.md).
- [Twelve-task plan](../../plans/2026-09-06-J-arc-native.md).
- [Task 1 brief](task-1-brief.md), [manifest checkpoint](task-1a-report.md),
  [challenge/dispatch checkpoint](task-1b-report.md).
- [Progress ledger](progress.md).

Tasks execute root-only with four-worker limits, one sequential full gate per
commit and prompt fast-forward merges without squash or push. Testnet sends
remain bounded by the specific approved proofs; raw journals/keys stay private.
The [Circle plugin fixture](../../../evidence/B13-agent-plugins.md) is already
merged but does not claim Task12's full checkout or live paid listings.
