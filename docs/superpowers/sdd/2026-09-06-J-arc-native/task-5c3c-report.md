# J5C3C — Owned delivery and purchase composition

Implements the owned live-proof composition, with pure/runtime fixtures and an
explicit CLI. **J5 live remains NOT_RUN/PAUSED on the read-cost prerequisite
below. All owner/delegate live approvals remain unused.** These fixtures do not
claim that the money-moving or live child-process integration has run.

- Existing guarded Kit runtime, exact owner/delegate0.25USDC burn, public final
  spec hash/fee/height journaled before signing. No signed term is rewritten.
  Proof-only compiled deployment identities are rechecked before keys/signing.
- One final burn signature, one transfer dispatch and one prepared mint; correlate
  SDK hash with recovered transaction, canonical receipt/logs and exact delegate
  native balance delta. Separately check actual API fee, available owner credit
  and source GatewayBurned event/receipt/identity. Absent source batch stays
  pending, never fabricated as a confirmed debit.
- Durable stage sequencing and fresh owner grant/allowance/custody gates. Wait
  read-only for both indexed delegation and owner credit. Failure stops later
  spending and retires that attempt; retained journals are not a replay license.
- One owned loopback first-party usdc-flow-check listing at0.01USDC, explicit
  eip3009-only declared rails and buyer allow-list. Seller/facilitator Keychain
  reads occur in their consuming children; owner/delegate reads are lazy inside
  the main consuming process. No key appears in argv, generated files or output.
- One facilitator raw-transaction broadcast, exact ordinary settle/from/value/
  splitter/testnet/gas checks, fsynced public hash before send. Owned processes
  have parent-PID/deadline guards and are reaped in cleanup. Private DB/journals
  survive cleanup; URLs serve only while the owned processes run.
- Source-backed correction: no-hire calls use ordinary settle, not an on-chain
  empty tree. The empty tree remains receipt metadata.9500atomic goes to seller;
 500atomic accrues in the splitter. Independent before/after accruedFees and
  balances are checked. No fee withdrawal or automatic grant revocation.
- Help/dry-run have no key/network/file actions. Live requires a finite explicit
  normal BurnIntent block bound, fresh keyless deployment/balance preflight and
  a cost probe that reaches only a non-network stub inside the unchanged request
  boundary. No passing probe is a promise that later network calls cannot fail.

## Why live is paused

The [keyless timing evidence](../../../evidence/J/unified-signing-preflight-timing.json)
retains two real observations. At04:11:09UTC, the limits IO inventory took6410ms
(16publicRPC reads plus one balance query), while the existing boundary ended at
5003ms and never reached the non-network transfer stub. At04:18:21UTC the actual
new pre-key helper stopped remaining reads after that boundary:5002ms boundary,
5272ms callback,14RPC, no stub dispatch.

The unchanged timer is at unified-balance-network.ts:62, beforeTransfer runs
inside it at:67 and HTTP dispatch follows at:68. The runtime's limits IO is at
unified-balance-runtime.ts:179–202. Its source-defined refusal is
unified_network_refused; raw probe errors were deliberately not recorded.
This is **not a live SDK spend/refusal**, and no validBefore, signature, grant,
deposit or transfer was sent. It is a concrete reason not to consume the
one-shot live approvals on this observed request budget. J4's separate paused
GatewayWalletBatched interop problem is not modified.

No existing timeout, validity, fee/gas cap, replay protection or F11 acceptance
was changed. Continue J6 offline under the approved Task5C brief; deployment
still stops at the explicit treasury owner checkpoint. Future J5 work must fit
the unchanged bounds or obtain explicit authority for a safety-relevant change;
never replay an uncertain spend to collect timing data.

## Verification

Focused28Bun/414assertions/723ms and fourteen-rootstrict0 passed. Earlier
fee-array decoder Red, precise local-account generic types, test tuple types and
callback-boolean return inference were corrected without relaxing shared codecs.
Help/dry-run and shell syntax passed. Sole frozen22011 full gate PASS:
4,825Vitest/214files/67.16s;955Bun/67files/7,272assertions/173.13s;
root/webstrict;client354ms/SSR186ms. Eighteen-path/32local-link scope/privacy
audit passed; thirteen code/script/test pins were unchanged through the gate.

After final scope/privacy audit and the sole sequential four-worker gate, commit
and FF main. No push, subagent, parallel review/gate or live money action.
