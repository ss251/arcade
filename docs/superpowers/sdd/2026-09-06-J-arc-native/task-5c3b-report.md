# J5C3B — Bounded Arc owner-chain driver

Implements the actual owner-side chain operations for the owned Task5C harness.
Importing the module reads no key or environment and performs no IO. No live CLI
or Keychain acquisition is added; the funding/purchase orchestration is next.

- Captured original fetch, pinned Arc testnet URL/chain, read-only public transport,
  finite overall deadline and 800-call ceiling; no provider fallback or RPC retry.
- Recent finalized snapshot and canonical block recheck. Both reviewed deployment
  identities, domain, pause/token support, Minter authority and USDC mint permission
  are checked. Available credit and pendingBatch remain separate.
- Fixed grant→approval→depositFor sequence, fresh zero grant/allowance/custody
  before the first key callback, exact0.50USDC allowance/deposit, finite per-tx
  gas cap. Failed owner step poisons the capability; calls cannot be replayed.
- Local signature recovery checks every prepared transaction field. The caller's
  durable prepared-hash callback completes before any send. Deployment and nonce
  are rechecked after that callback, and each of at most three hashes gets exactly
  one broadcast attempt. A lost send response remains uncertain, not retried.
- Receipt polling is read-only, one request per tick, maximum60. Only an explicit
  missing-receipt result counts as pending; provider errors stop. Success requires
  finalized canonical block/transaction correlation, nonremoved correlated logs,
  exact grant/approval/deposit effects, allowance/custody readback and exact owner
  native balance delta including gas. Concurrent owner activity therefore refuses
  the proof rather than being attributed to it.

The [actual keyless driver preflight](../../../evidence/J/unified-chain-preflight.json)
passed at03:32:55.027UTC, block60851095:24RPC reads and one API balance query.
Owner19.61nativeUSDC, delegate19.496425875nativeUSDC; delegationfalse and owner
allowance/custody/APIavailable/pendingBatch all0. Zero Keychain reads, signatures
or broadcasts. Source and contract identities passed; this is not delivery evidence.

Focused21Bun/372assertions/1.335s and five-rootstrict0PASS. One initial native
fetch fixture type diagnostic was corrected; no production bypass added.
Sole frozen15793 full gate PASS:4,825Vitest/214files/67.05s;
938Bun/63files/6,951assertions/172.66s;root/webstrict;client369ms/SSR171ms.
Eight-path/29local-link scope/privacy audit passed. Four code/test pins remained
unchanged through the gate; final audit, atomic commit and exact FF follow.
All existing payment validity/cap/replay policies remain unchanged; J4 live PAUSED.
No mainnet, new spending, push, agents or parallel gate.

Next: compose the one-shot chain driver with the existing guarded Unified Balance
Kit runtime, journal the final normal BurnIntent metadata without its signature,
independently reconcile mint/source/API effects, and add the owned one-call
real-eip3009 purchase and cleanup. Gate those remaining components before using
any live owner/delegate key or consuming the Task5C approvals.
