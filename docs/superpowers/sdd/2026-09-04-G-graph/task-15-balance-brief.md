# G15C — bounded balance observation, offline tested

Extend the existing G15 script/test plus this brief, report, index and ledger.
Do not modify the production Graph client, signing policy, ledger format or CLI.
No real network request or operational owner state is part of this checkpoint.

Implement a reader requiring an explicit transport dependency, with no ambient
fetch fallback. Pin the existing Base RPC, chain8453, policy payer and native
USDC. At most four sequential read-only RPC requests: chain ID, latest block,
balanceOf at that exact block number, then a read-back of that block identity.
No retries or endpoint/payer overrides. Require exact envelope IDs, a32-byte
uint256 balance, bounded bytes/chunks, valid block identity/time, and a bounded
total deadline with cancellation and no late next request.

Return a frozen observation including block/time and response digests. This is
consistency evidence from one RPC, not an independent consensus proof or a
guarantee against unrelated spending/reorgs after observation. Return a valid
low balance so the future journal can retain it; keep the existing separate
910000 admission arithmetic unchanged. The operational consumer must freshly
read before admission, immediately before paid forwarding and after dispatch,
persist evidence, and stop on uncertainty/below-floor outcomes.

Tests use injected Response fixtures only. Cover exact request routing and
block-number binding, reordered object keys, wrong chain/ID/status/length,
malformed quantities, stale/changed blocks, low balances, abort/deadline and
late response cleanup. Preserve failure-first evidence, then exact strict and
one sequential full four-worker gate. Commit locally and fast-forward main;
no live wallet/RPC/query, paid authorization replay or push.
