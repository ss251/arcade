# J11B2 — indexed terminal-event correlation

Continue after [J11B1](task-11b1-report.md). This is an offline indexer
projection, never payment authority or independent RPC/receipt-tree validation.
Keep both escrow templates inactive and the existing active sources unchanged.

## Correlation policy

- Preserve every existing immutable observation. Request the complete transaction
  receipt for ArcadeSettled only: the pinned Graph manifest supports `receipt`,
  and graph-ts0.38.2 exposes receipt/log fields. Inspect bounded whole-transaction
  logs, not only a prefix already delivered to handlers. Duplicate categories,
  partial settlement, evaluator fees or contradictory terminal events anywhere
  in that receipt prevent classification, including after the hook log.
  Exact replays remain no-ops through the existing owner record.
- A separately explicit local treasury binding is needed for paid closure.
  Missing configuration is not permission to pick the default treasury or read
  a wallet. Existing three-role observation contexts remain valid for B1 only.
- Require an observed matching creation, USDC budget, single exact client
  funding and provider submission in order. Keep the observed funding time
  and transaction. Unsupported changes invalidate eligibility, not raw records.
- A settled projection requires same-transaction direct-provider PaymentReleased,
  actual PlatformFeePaid to the local treasury, evaluator JobCompleted and the
  bound ArcadeSettled. Also require their exact two outgoing USDC Transfer
  logs from the proxy, with distinct ordered identities and matching recipients
  and amounts. Receipt success, block/transaction coordinates, current hook
  log and all relevant emitters must match. Actual seller plus fee must equal
  observed funding. Other proxy/hook flows or multi-job batches stay unclassified.
  Do not infer an absent zero fee, recompute paid amounts from a percentage,
  classify partial/receiver-disburser flows or take status as money proof.
- Only a qualified paid footprint creates an escrow Settlement, without a fake
  splitter/nonce. Add nullable completedAt/completeTx/treeHash/receiptHash to
  the job. Hashes remain supplied hook metadata, not a verified receipt tree.
  Existing exact Tree, Listing and Marketplace relationships stay untouched.
- Refund evidence remains the independently indexed Refunded occurrence;
  never synthesize a refund amount from rejection/expiry/hook refusal. Public
  presentation must distinguish recorded events from independently verified
  current balances, administrative state or execution.

Test actual AssemblyScript store behavior for the successful full footprint
and missing/wrong-job/transaction/token/roles/amounts, duplicate/partial flows,
refund separation, immutable replay, unknown history and full-width values.
One sequential four-worker full gate precedes atomic commit/main FF.
J4/J5/J6/Task10 live pauses and all spending/authorization protections remain.
