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
  [Bounded owner-chain driver](task-5c3b-report.md).
  [Owned delivery/purchase composition and live timing pause](task-5c3c-report.md).
- [Task6 pinned source and hook brief](task-6a-brief.md),
  [hook verification and size blocker](task-6a-report.md),
  [escrow build guide](../../../erc8183-escrow.md).
- [Task6B read-only deploy preflight brief](task-6b-brief.md),
  [preflight/unsigned plan record](task-6b-report.md).
- [Task7 escrow runtime brief](task-7-brief.md),
  [offline ABI/facts/provider-signature checkpoint](task-7a-report.md).
  [Request ownership and finalized reader](task-7b1-report.md).
  [Action contracts and receipt proofs](task-7b2-report.md).
  [Guarded execution brief](task-7b3-brief.md),
  [coordinator and private durable journal](task-7b3a-report.md).
  [Bounded Arc RPC and signing ports](task-7b3b-report.md).
  [Escrow wire/rail brief](task-7b4-brief.md),
  [separate payload and generic contracts](task-7b4a-report.md).
  [Guarded Effect rail composition](task-7b4b-report.md).
- [Task8 integration brief](task-8-brief.md),
  [strict socket contracts checkpoint](task-8a-report.md).
  [Runner-local completion binding](task-8b1-report.md).
  [Read-only provider preflight](task-8b2-report.md).
  [Private provider signing journal](task-8b3a-report.md).
  [Sign-only provider session runtime](task-8b3b-report.md).
  [Explicit daemon/socket integration](task-8b3c1-report.md).
  [Authenticated hub broker correlation](task-8b3c2-report.md).
  [Durable admission brief](task-8c-brief.md), [atomic Store checkpoint](task-8c1-report.md).
  [Terminal evidence brief](task-8d-terminal-brief.md), [atomic terminal checkpoint](task-8d1-report.md).
  [Reader/result brief](task-8d2-brief.md), [explicit compatibility checkpoint](task-8d2-report.md).
  [Tree closure brief](task-8d3-brief.md), [durable closure checkpoint](task-8d3-report.md).
  [Pipeline brief](task-8d4-brief.md), [typed execution checkpoint](task-8d4-report.md).
  [HTTP brief](task-8c2-brief.md), [request-bound budget/root routes](task-8c2-report.md).
  [Boot brief](task-8d5-brief.md), [explicit configuration and shutdown](task-8d5-report.md).

Tasks execute root-only with four-worker limits, one sequential full gate per
commit and prompt fast-forward merges without squash or push. Testnet sends
remain bounded by the specific approved proofs; raw journals/keys stay private.
The [Circle plugin fixture](../../../evidence/B13-agent-plugins.md) is already
merged but does not claim Task12's full checkout or live paid listings.
