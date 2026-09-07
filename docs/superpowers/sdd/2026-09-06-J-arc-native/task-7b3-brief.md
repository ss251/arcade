# J7B3 — durable guarded escrow execution

Build on the merged [action/proof contracts](task-7b2-report.md). J4/J5 live
remain paused; J6 deployment size and treasury checkpoints remain open.
This work is offline and must not activate or advertise an escrow rail.

Small commit boundaries:7B3a implements the coordinator and real private SQLite
action journal;7B3b supplies the concrete bounded RPC/signing transport. The
following7B4 checkpoint must add explicit escrow payload/request/settlement
context contracts and the Effect rail. Current exact-only PaymentPayload and
tree-only settlement arguments cannot represent an escrow capability and
pre-settlement receipt projection; do not fill those gaps with dummy values.
Finishing7B3 does not finish Task7 or permit live activation.

## Execution contract

1. Capture trusted request-bound context and action input before asynchronous
   work. Require durable, once-only action reservation; a duplicate must not
   request another provider signature, run inference or broadcast again.
2. Read fresh canonical deployment/job facts and unused provider authorization
   nonce. Prepare only the exact source-shaped action. Signer is the configured
   evaluator/facilitator; provider authorization never makes the runner pay gas.
3. Persist the completion projection and exact action intent before asking
   for a transaction signature. Recover and compare the signed transaction,
   then persist its hash/terms before any network send.
4. Refresh current deployment/job/nonce facts after slow signing or storage.
   Fence cooperating sender operations and refuse nonce drift. Never claim
   this controls unrelated programs using the same account.
5. Mark the send attempt durably before one broadcast. No automatic send
   retry or replacement. Poll only read-only receipts with bounded backoff.
6. Confirm the separately fetched transaction and exact source-shaped logs,
   plus canonical finalized receipt-block identity/state. Complete must match
   the previously confirmed Submit output and the persisted receipt projection.
7. On ambiguity, retain a durable uncertainty record. No opposite reject,
   new signature or fresh send may bypass it. Recovery is read-only unless
   separately authorized; never infer non-settlement from a missing receipt.

## Integration obligations

The journal must validate records on read, survive reopening and compare
durable state atomically across handles. Claim/intent/attempt/confirmation
storage failures must fail closed. Raw signatures and serialized transactions
are private, never public receipt or evidence data. No existing payment
validity, cap or replay rule changes.

The Effect rail will consume this executor. Task8 must atomically reserve
funded execution with its hub Job and exclude escrow-owned jobs from legacy
boot reaping. Budget/Open and Funded stages remain distinct. Task9 follows the
same capability binding and never blindly replays a paid creation/funding step.

## Gates

TDD with fake RPC/signers plus real private temporary SQLite reopen tests;
four-worker limits, single-threaded, one full gate per commit. Preserve the
known relay cleanup concern honestly if it recurs; do not weaken its timeout
or claim a failing monolithic gate passed.
