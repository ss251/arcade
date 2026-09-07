# J8D5 — explicit pinned hub boot and process lifetime

Finish actual production composition after [HTTP routes](task-8c2-report.md),
without deploying or activating any live owner configuration. J4/J5 live and
J6 treasury/size pauses remain. Single thread, four workers, one sequential
full gate per commit and exact fast-forward; no push or existing policy changes.

- Only paired explicit config/journal variables opt in. Require selected Arc,
  a real root rail, stable configured origin/secret, explicit durable DB and a
  matching evaluator key in the consuming process. No guessed Circle/reference
  address, RPC, treasury, ephemeral signer or environment validity override.
- Read closed public identity/config before private journal creation. Check
  full deployment pins, canonical paths, ownership, permissions, size/UTF8,
  hardlinks/symlinks, distinct DB/config/journal and SQLite auxiliary paths.
  Never repair retained action sidecars. No owner key in config/diagnostics.
- Build one concrete action journal with the original durable Store and broker.
  Preserve legacy RailTag/default, share layer instances and keep construction
  offline. The action rail still performs fresh identity/job checks before send.
- Wire real SIGINT/SIGTERM when armed. Stop requests, await request/action
  cancellation and accepted-job uncertainty cleanup, then release the journal.
  Place the application scope inside layer provision; no outer-scope lifetime
  inversion. Repeated graceful signals must not skip cleanup. Disabled startup
  retains the existing behavior. Do not alter legacy Store migrations/lifecycle.

Test owned file/SQLite fixtures and actual subprocess boot/termination with
ephemeral fixture keys, forbidden external fetch and clearly synthetic ports.
Prove one Store/journal/rail instance, no IO on disabled/invalid startup, exact
cleanup markers/order and independently read durable uncertainty/tree closure
after shutdown. This is not live chain proof or Task10 evidence. Then Task9.
