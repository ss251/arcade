# G15C bounded balance observation

The [released offline scope](task-15-balance-brief.md) is implemented in the
existing harness library. **No actual Base RPC, wallet, signer, paid query,
operational ledger or live approval was exercised.** CLI stays read-only;
production Graph client, reservation format and authorization policy are unchanged.

The reader requires an explicit transport and pins the existing Base RPC,
chain8453, policy payer and native USDC. It makes at most four sequential requests:
chain ID; latest block; exact32-byte balanceOf at that block's number; and that
same block's identity again. Wrong chain/ID/status, malformed fields, stale or
changed blocks, changed URL/redirect, encoding/MIME/length violations and
uncertainty refuse without retry. Each response is bounded to131072 bytes and
256 chunks, with an overall deadline of at most5000ms. Empty chunks cannot
starve cancellation indefinitely.

The frozen result retains balance, public payer/token, block number/hash/time,
acquisition time and four exact response-byte hashes. Low balances are returned
for future journaling; the separate unchanged admission helper refuses below
910000 atomic before a possible10000 debit. This reader does not itself reserve,
persist an RPC observation, authorize signing or implement the post-dispatch
900000 floor response.

Block-number pinning plus repeated identity is a consistency check against one
RPC. It is not an independent canonical-chain proof, hash-bound EIP1898 call,
guarantee against an intervening/reverted reorg or protection from unrelated
wallet activity. Acquisition freshness is not future spending permission. The
eventual consumer must freshly observe/journal before admission, immediately
before paid forwarding and after every dispatch, including errors.

## Executed checks

Initial Red was the missing reader export. Initial implementation passed33
focused tests/215 assertions and exact two-root strict. Review then reproduced
a deadline bug: the final timestamp used a second unchecked clock read, so a
late clock jump could produce an out-of-window successful observation. The new
regression failed; returning the timestamp from the final validated deadline
check fixed it. Pending reads also install rejection handling before a possible
pre-race abort.

Final focused selection: **35 tests,219 assertions,327ms**; exact two-root
strict reported zero diagnostics. These use only injected Response/stream
fixtures. They verify exact method/target/payer/token/block routing, reordered
RPC fields, low balances, malformed responses, abort with zero/one request,
late-response body cancellation, the final timestamp regression and bounded
empty chunks. No real chain response or observed payer balance is claimed.

The sole sequential four-worker full gate13090 passed:5327Vitest/242files
in69.34s;1457Bun/98files with12181assertions in197.59s;root/webstrict and
client/SSR builds352/162ms. Final scope review covers six paths/three added
local links with no privacy-heuristic matches; two scripts and the brief remain
hash-identical after these three result annotations. No repeated full suite
and no G15 live-evidence claim.

## Next three steps

1. Bind the eventual consumer to one non-disposable owner state root and
   validated request/source/intent, persisting the fresh balance evidence.
2. Add transparent bounded challenge/paid-response recording, per-query receipt
   and result cache, and reconciliation without reclaim/retry. If client hooks
   are needed, release narrowly awaited seams preserving original validation.
3. Prove no-key full artifact replay/partial-cache handling offline, then review
   live authority before any real paid sequence. Latest testnet-only wording
   versus retained Base approval, and any new Arc purchase, remain separate.
