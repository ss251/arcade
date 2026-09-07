# J9C — actual SDK, health and private command surfaces

Continue after [concrete buyer ports](task-9b4-report.md). This completes the
offline Task9 integration; no live buyer/deployment or approval replay.

1. Capture closed escrow accepts without ever passing one to an exact signer.
   Actual selection requires explicit local deployment identity, principal/gas/
   expiry/operation bounds and a durable one-purchase private journal. Preserve
   preference allow-lists, funded Gateway behavior, exact/session paths and all
   existing authorization windows. No implicit newly enabled gas spend.
2. Derive the actual expected call independently of the402 echo: root target,
   canonical input hash and current public listing price/version/timeout/rail
   opt-in/verified positive ERC8004 agent identity. Compare seller/chain/registry
   and full local deployment pins. Existing ENS endpoint/payee/asset/network
   authority must run before any gas and remain the driver's beforeSign gate.
3. Branch before exact signing into the actual durable driver/Arc ports. It
   owns budget/root POSTs and returns its captured202; do not retry again via
   the generic exact path. Persist private result capability first. Cancellation
   must join bounded driver cleanup before a caller closes its private journal.
4. Armed hub health exposes full public deployment pins from explicit verified
   boot only; disabled/unconfigured behavior stays unchanged. A same-hub health
   response is checked against local trust, never learned as the local pinset.
5. SDK result adds only locally verified funding/queued proof, never a remote
   JSON field with that name. Preserve current32hex poll-token rules. Funding is
   not settlement; failures after possible signing use an uncertainty category,
   never the MCP category that releases an unsigned reservation.
6. CLI and MCP take secrets only from their existing private process context.
   Identity/gas/journal authority is explicit owner configuration, not seller
   copy or a model-supplied key. One private file owns one logical purchase;
   no automatic new file/capability after uncertainty. Preserve MCP serialized
   per-call/cumulative limits and count Arc native gas as USDC spending too.
   Unknown outcomes retain principal plus gas reservations. Do not infer a
   refund or prove settlement from an untrusted hub receipt alone.

Use coherent atomic checkpoints if needed: SDK+health, then private command
surfaces. Test defaults/refusals and actual composed paths with ephemeral keys,
owned private SQLite/loopback and synthetic RPC only. No full test gates overlap;
one four-worker full gate per commit and exact main FF, no push. Keep browser
imports free of runtime Bun SQLite/filesystem dependencies. Document public
proof versus private reconciliation data and remaining live blockers. No
validity/cap/replay change; J4/J5 live and J6 treasury/code-size pauses remain.
