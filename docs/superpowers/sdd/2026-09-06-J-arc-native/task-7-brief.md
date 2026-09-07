# Task 7 — escrow payment foundations and guarded runtime

Continue offline after [J6 preflight](task-6b-report.md). The approved upstream
pin is unchanged; its deployment-size blocker and treasury checkpoint remain
open. No escrow address is configured, no rail is advertised and no live proof
or monetary approval is consumed in this task's offline checkpoints.

## Checkpoints

7A: source-shaped ABI, strict job/tree codecs and EIP-712 SetBudget/Submit
authorization builders. Match the pinned contract exactly: ERC8183/1 domain;
uint72 nonce packed beneath signer with24zero padding bits; optParams hashed;
provider signs locally, hub later relays. New provider authorization deadline
is the plan's fixed ten minutes. Do not touch existing Gateway/EIP3009/session
validity, caps or replay protections.

7B: guarded Effect rail and relays, no activation before verified deployment
configuration. Verify finalized chain facts, exact funded budget/token/provider/
evaluator/hook/agent identity, enough remaining lifetime, supported full-job
state and payout receiver. Before any relay/complete/reject, journal and recover
the exact transaction; never retry an uncertain send. Independent receipt/code/
getter evidence, not an RPC-returned hash alone, establishes settlement/refund.

7B1 implements the request capability commitment and finalized identity/state
reader; see the [wire decision and verification record](task-7b1-report.md).
It does not activate a rail or replace durable budget/execution reservations.
7B2 adds offline action contracts, pre-settlement receipt projection and
signed-intent/log/poststate proofs; see [verification](task-7b2-report.md).
7B3a adds the [durable coordinator/journal](task-7b3a-report.md);7B3b adds the
[bounded RPC/signing ports](task-7b3b-report.md), both verified offline.7B4 still
adds [separate wire/type contracts](task-7b4a-report.md); the active Effect
adapter remains7B4b work before Task8 wiring. No live send or rail activation
has occurred, and no exact schema/window is changed by the generic contract.

7C/Task8 integration: typed wire dispatch, durable one-job/one-request reservation,
provider socket authorization, pipeline submit then complete or reject, and
honest refund/uncertainty receipts. Task9 adds buyer lifecycle only after these
contracts are in place. Children/sessions retain existing rails.

## Source-backed obligations before activation

- Public on-chain jobId is not secret and cannot by itself prove HTTP caller
  authority. Bind the exact request to a capability or client proof committed
  by the buyer, and durably prevent duplicate execution across restarts. This
  is a security correction to the shorthand jobId-only choreography, not a
  license to trust a caller-supplied payer address. Final wire design/tests must
  be recorded before Task8/9 activation; none is implemented by this brief.
- The final receipt contains settleTx, terminal timestamps and optional later
  fields. Its full hash cannot be sent in the transaction it would hash.
  Define a versioned pre-settlement receipt projection and persist its exact
  inputs before commitment. Never label a zero placeholder or circular hash
  as the hash of the final receipt.
- Reject partial-settlement/pending-claim states and redirected payouts. The
  hook does not remove these upstream features. Platform fees use integer
  floor division, unlike FeeSplitter's round-up behavior; receipts must match
  actual escrow transfers, including tiny-price rounding.
- Evaluator rejects Funded or Submitted. Permissionless expiry refunds differ:
  Funded/no pending claim at expiry; Submitted at expiry plus1h. No upstream
  rule is changed. Complete is legal only after Submitted.
- Global admin can upgrade, change fees, detach hooks and withdraw while paused.
  Recheck relevant configuration and supported job state before sending; do not
  call this immutable or independent validation of off-chain work.

## Verification

Use the existing Vitest/Bun and Foundry stacks with four workers, root-only.
Pure codecs get ABI round-trip and negative boundary tests; provider signatures
get actual local ECDSA recovery and domain/message mutation tests. Mock RPC
tests are explicitly offline, never live evidence. One sequential full gate
per atomic commit, scope/privacy audit and prompt exact fast-forward, no push.
