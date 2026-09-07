# J11B2 — inactive full-receipt paid projection

Implements the [terminal correlation brief](task-11b2-brief.md), after
[J11B1 observations](task-11b1-report.md). This is indexed event correlation,
not independent RPC/current administrative-state/execution verification.

## Implemented

- ArcadeSettled requests its whole transaction receipt through the installed
  Graph CLI0.98.1 manifest contract and graph-ts0.38.2 receipt/log API. Other
  handlers do not request receipts. Both escrow templates remain inactive,
  and the two active splitter sources and their pins are unchanged.
- Observed matching creation, USDC budget, single exact client funding and
  provider submission establish sequence eligibility. Repeated funding,
  unsupported sequence changes, partial settlement, evaluator fee or refund
  invalidate it without discarding immutable raw events. Funding time and
  transaction remain observations, not an independently verified deposit.
- Paid correlation additionally requires an explicit local treasury context.
  No address defaults or owner key reads. Missing receipt/context/facts retain
  the raw hook observation with nullable closure evidence and no Settlement.
- The successful receipt must have matching nonzero block/transaction hashes,
  numeric receipt block/index, canonical ordered unique log coordinates and
  no removed logs. The graph-ts Log.blockNumber field is Bytes; this reader
  pins each log's block hash and the receipt/event numeric block, without
  inventing an endian interpretation of that separate log field.
- Scan the complete receipt, including logs after the hook: at most128 logs
  and65,536 aggregate data/topic bytes. These are new read-only reader limits;
  existing payment validity, cap and replay protections are unchanged.
  Require exactly one actual fee, direct-provider payout, evaluator completion
  and bound hook event for this job, in contract order, plus exactly two
  outgoing USDC transfers from the proxy with matching recipients and amounts.
  The actual seller plus fee must equal observed funding. Seller and treasury
  may coincide but still require two separately ordered transfers.
- Duplicate categories, contradictory later events, extra outgoing transfers,
  other proxy/hook jobs, partial/disburser/evaluator-fee flows and missing
  explicit fees remain unclassified. An absent fee is never guessed as zero
  or recomputed from a percentage.
- Only this qualified footprint creates an immutable rail=erc8183 Settlement
  and attaches completedAt/completeTx plus supplied treeHash/receiptHash to
  the job. No fake splitter, nonce, Tree, Listing or Marketplace relation.
  Hook hashes are not verified receipt trees; Refunded remains its separate
  observed occurrence, never a refund amount inferred from status or refusal.
  Exact replay remains a no-op before any new projection.

## Verification

The actual pinned AssemblyScript mappings compiled and ran in the SHA256-pinned
Matchstick0.6.0 runtime. Final isolated new suite:37PASS2.347s. The subsequent
sequential regression selector `escrow` includes both escrow files:
64PASS4.464s, then27splitter1.632s,16identity1.812s,11reputation1.759s and
7validation1.643s. Thus125 distinct mapping cases passed; the separately
repeated37 new cases are not counted twice. Processes were bounded, owned
and reaped; no Graph runtime/toolchain download or replacement.

Runtime tests cover successful closure/replay, null legacy fields, same-address
roles with separate transfers, funding client/token/amount/sequence, missing
treasury/receipt/fee/transfers, wrong block/transaction/log/job/evaluator/hook
metadata, malformed address padding, failed/removed/oversized receipts and
contradictions anywhere after the hook. Existing raw lifecycle, unknown-history,
full-width, registry and exact settlement regressions remain covered.

Final188focusedBun5/436assertPASS731ms, five-root strict0 and Graph codegen/
WASM PASS. The initial focused command named a nonexistent optional hygiene
file, which Bun ignored; the final verified checks directory run above covers
all five actual files. Seventeen-path scope freeze:150 local links, no privacy
matches, empty index. Sole full gate87306 PASS:5,258Vitest240/70.52s;
1,362Bun92/11,713assert192.57s; root/web strict and client/SSR342ms/175ms.
All stages sequential and four-worker/concurrency bounded. Eleven frozen
source/test pins are rechecked before atomic commit and exact-one main
fast-forward; no full gate replay, squash or push.

## Remaining

J11C existing-design web rail labels/filter and read-only evidence, then live
source activation/Studio v0.0.2 only after the blocked approved deployment and
independently verified pins/start blocks. No new CID, indexed escrow query,
current fee/hook/admin assertion or live escrow settlement/refund is claimed.
J4/J5 live, J6 treasury/contract-size and Task10 deployment pauses remain.
No owner keys, real RPC, sends, spending, grants/deposits, replayed approvals,
payment validity/cap/replay changes or push.
