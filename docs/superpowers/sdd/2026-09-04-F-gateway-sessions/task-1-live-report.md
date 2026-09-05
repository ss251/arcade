# F1 live follow-up — September 5, 2026

## Decision and limits

The owner approved one dedicated-buyer Arc-testnet Gateway deposit of 0.5 USDC
plus bounded gas and one 0.001 USDC payment to a distinct owner-controlled recipient.
The one supervised invocation exited zero and closed its retained private journal
before printing PASS. This is the approved F1 gate: deposit, canonical authorization,
verification, accepted transfer correlation and exact buyer debit. F2–12 code work is
unblocked. F13 and any further live spending retain their separate requirements.

The recipient has **0 available / 0.001 USDC pending batch**, not an available
withdrawable credit. Transfer status remains `received` with `txHash: null`. Neither
the facilitator transfer UUID nor this PASS is independently mined batch evidence.
No session product, seller withdrawal, split fee or repeated purchase was exercised.

## Preconditions and consuming process

At 11:48:56.417 UTC, keyless public checks confirmed chain 5042002, six-decimal
USDC, the pinned Gateway deployment, buyer wallet balance 20 USDC, zero allowance,
zero on-chain/API buyer Gateway balance and zero recipient available balance.
At 11:52:44.097 UTC, the buyer's native balance was 20 USDC at 18-decimal precision,
sufficient for the 0.5 deposit and the separately bounded maximum gas authorization.
Independent pre-live source audit was CLEAN and matched the committed F1 source.

The actual parser requires the buyer's public address, not a Keychain item name;
that correction to the handoff's illustrative command did not change its authority.
The consuming command used an empty allowlisted environment, disabled tracing and
dotenv, read only the approved buyer's Keychain item inline, and executed the existing
reviewed CLI. A fresh persistent ignored directory was created mode 0700; the runtime
exclusively created its journal mode 0600. No key, raw transaction or signature was
saved in the journal or public output. No recipient or other role key was read.

The source allowed at most one exact 500000-atomic approval, one 500000-atomic
deposit, and one 1000-atomic Gateway authorization/settle. Each chain transaction
had 120000 gas and maximum authorized gas cost 0.1 native USDC. Journal checkpoints
were fsynced before sends; only read-only polls could retry. The process retained
its 315-second operation signal, 330-second owning fuse and external 360-second
TERM/10-second KILL guard. It completed normally, so no forced stop was needed.

## Observed references

Buyer: `0x67bE3fd6f4D5ea3B4928E636Def9C2c87BC3e51b`.
Recipient: `0x2890ccF322155641545c6B4482Ea896B479aa937`.

| Stage | Exact observation |
| --- | --- |
| Approval | [Transaction](https://testnet.arcscan.app/tx/0xbeeecd21162ba650fc252311065ba06aba108b28b879b381bf620fdbe54cb204), block 60574047, exact 500000 atomic allowance |
| Deposit | [Transaction](https://testnet.arcscan.app/tx/0x56460c316d9c16bc87b59dd778e66c283f7b6addcae3d14a30eea39e898ee6f2), block 60574055, exact 500000 atomic deposit |
| Verify | Exact payer accepted; the journal records `verify-confirmed` |
| Settle | Transfer `77070673-1a3d-4835-91f7-93d19c878d50`, created 11:53:45.570 UTC, exact 1000 atomic USDC |
| Authorization nonce | `0x0d21364f392dc6b7509fa23f99b7439cc4e8844b25144ee5e6008b77d79abe7e` |
| Buyer after | 499000 atomic available; zero pending batch |
| Recipient after | Zero available; 1000 atomic pending batch at 12:00:28.494 UTC |

The journal contains exactly one event for each started/deposit/authorization/verify/
settle/completed stage, plus the one required approval. Approval/deposit hashes were
retained before broadcast. The private journal remains in place and must never be
deleted or replaced to retry this consumed authorization.

## Exact CLI output

```text
{"decision":"PASS","depositTxHash":"0x56460c316d9c16bc87b59dd778e66c283f7b6addcae3d14a30eea39e898ee6f2","transferId":"77070673-1a3d-4835-91f7-93d19c878d50","status":"received","batchTxHash":null,"settlementKind":"gateway-transfer","gatewayAfterAtomic":"499000","network":"eip155:5042002"}
G-2c: PASS — deposit confirmed; exact authorization verified and accepted; transfer and Gateway balance correlated. Batch mining is not independently proven.
```

## Independent read-only reconciliation

A separate post-run verifier checked the public transactions, successful receipts,
calldata, canonical block inclusion, amounts and transfer binding. A stronger extra
assertion initially expected the recipient's available balance to equal 1000 and
failed. Reading the complete public balance response resolved the discrepancy:
the amount is `pendingBatch: "0.001000"`, with `balance: "0"`. That read-only check
was corrected as an evidence interpretation, not by changing or repeating the probe.
The buyer's `balance: "0.499000"` matches the original full gate's exact debit.

Independent reconciliation completed at 12:02:07.320 UTC with zero mutations.
Both approval/deposit matched successful receipts, canonical block inclusion,
calldata, token events and sequential buyer nonces 0 then 1. The deposit-block
Gateway balance was exactly 500000 atomic. Actual gas was 0.00138565 native USDC
for approval and 0.002188475 for deposit, totaling **0.003574125 USDC**; these
18-decimal gas costs are distinct from ERC-20 payment receipt amounts. The fresh
buyer/recipient available and pending balances corroborated the table above.
The exact eleven-event private journal remained unchanged during verification.

No transaction, signature, verify/settle request or deposit was retried. The initial
local report and earlier owner-pending evidence remain historical checkpoints, not
rewritten into a live success. Full publication review and the separate documentation
test/type gate follow; this report does not claim them before they run.
