# J11C2 — read-only public escrow receipts

Follow [J11C1](task-11c1-report.md) with the remaining offline web portion of
[J11](task-11-brief.md). Consume the existing hub public receipt projection;
do not expose private job IDs, capabilities, output, buyer or authorization.

- Preserve coherent settled/refunded/uncertain public escrow metadata through
  H4 and the independent skill-page serialization boundary. Missing or malformed
  evidence becomes explicitly unavailable, never inferred settled or refunded.
- Bound positive uint256 amounts/job IDs and exact lowercase addresses/hashes;
  require Arc testnet root context, no session/sweep, the current 500-bps quoted
  allocation, and matching reported terminal amounts. No getter/coercion calls.
- Display hub-reported state, numeric on-chain job ID and escrow contract;
  link only that coherent contract and matching Arc complete/refund references.
  These are navigational observations, not independently verified receipts,
  deployed implementation, balances, admin configuration or execution proofs.
- Separate quoted allocation from reported seller/fee/refund movement. Uncertain
  is neither zero charge nor confirmed refund. Compact descendants have no
  inherited escrow transaction authority. Keep generic exact-only link policy.
- Keep browser signer, recovery, budgets, sessions and all payment code untouched.
  Use existing layout/native disclosure and address wrapping; no new design or
  dependencies. Recheck receipt evidence in the display component.
- Test actual core Receipt → hub scrubReceipt → web decoder → loader → render,
  malformed/cross-rail metadata, private canaries, passive imports, and actual
  owned Start route/browser display. Fixtures are synthetic; no real RPC/keys.

One sequential four-worker full gate, one atomic commit and exact-one main FF.
J4/J5 live and J6 treasury/size plus Task10 live remain paused; no cap changes,
approval replay, spending, deployment or push. Task12 offline docs follow.
