# G15M — bind retained balance observations to one query

Release only Graph harness/test and plan-owned brief/report/index/progress.
Bind supplied admission, pre-forward and post-query balance observations to a
current-source correlated cached query and its retained capture times/receipt
block. Reuse the existing balance reader unchanged. No actual RPC, key, payment,
operational state, reservation reconciliation or live mode is released.

Preserve the existing0.91 USDC admission,0.90 floor and0.01 cost. Require unchanged
admission/pre-forward balance and an exact one-query post delta. Validate closed
snapshot shapes, fixed chain/payer/token, canonical quantities, bounded hashes,
timestamps, query-event ordering and block identities. Same-height observations
must agree; height ordering is not independent chain-ancestry or consensus proof.
Receipt block and Graph index block must remain separate.

This is retained supplied-data consistency, not authenticated acquisition or
proof that historical observations were actually made at declared times. Use
actual balance-reader calls with injected synthetic responses and declared
fixture times, clearly labeled. Check exact-floor success and meaningful delta/
freshness/order/identity/corruption failures without changing any existing policy.
Return frozen evidence/digests only; do not clear a reservation because a cache
or balance tuple exists. One sequential four-worker gate and atomic mainFF, no push.
