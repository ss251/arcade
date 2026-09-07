# J7B2 — escrow action contracts and receipt proofs

Implemented offline preparation for budget, submit, complete and reject,
a versioned pre-settlement receipt projection, signed-transaction checks and
source-shaped receipt/log/poststate verification. The reader also supports
canonical historical receipt-block snapshots under a fresh finalized head.

This checkpoint does **not** implement a durable action journal, bounded
broadcast runtime, active Effect rail or hub integration. Preparation is not
broadcast authority. These are the contracts the J7B3 executor must satisfy.

## Action and commitment semantics

Context must originate from capability verification plus durable admission,
not HTTP metadata. Every action rechecks the request-bound job identity,
amount/token, full-job accounting, pending claims and payout restrictions.
Budget requires unbudgeted Open; submit requires Funded before expiry with a
real EOA provider signature. Completion requires Submitted and refuses once
permissionless Submitted refund is available. Rejection accepts Funded or
Submitted, including after expiry, but never Open or a terminal job.

Source review confirms completion itself has no expiry check, while Submitted
refund opens at expiry plus one hour. The new executor's completion guard is
conservative within that unchanged upstream rule. No existing Gateway,
EIP3009, session, authorization lifetime, cap or replay rule was changed.

The receipt projection is versioned arcade:erc8183:receipt:v1 and includes
request/deployment/listing identities, buyer/seller, amount and floor-rounded
fee, output hash and tree commitment. Exact JSON bytes and their hash must be
persisted before complete. It deliberately excludes settleTx, terminal clock
fields, later attestations, the capability and raw input/output. It is not the
hash of the eventual final receipt. The executor must bind this output hash to
the independently confirmed Submit action, not merely observe Submitted state.

## Evidence contract

A recovered local EIP1559 transaction must match chain, signer, destination,
calldata, zero value, nonce, gas and fee terms inside the trusted gas ceiling.
Raw signed transactions belong only in private durable journals. Restored
journal records must be recaptured and reverified, never trusted by type alone.

Confirmation requires the separately fetched transaction, successful receipt,
exact receipt block and independently identity-checked poststate. Every log
must belong to the receipt's transaction/block with ordered indices. Relevant
escrow/hook/token events must match the pinned source exactly, including
AuthorizationUsed, budget/submit events, actual USDC transfers, platform fee,
provider payment or client refund, completion/rejection and the hook commitment.
Missing, duplicated, changed or unexpected relevant events refuse. A returned
hash or status success alone is not payment evidence.

The source leaves settledAmount at zero on full complete/reject; only partial
claims change it. Tests preserve this distinction. Tiny prices can floor the
platform fee to zero, in which case no fee event may be invented. EOA-provider
code checks are still a runtime requirement: delegated/disburser code and its
additional callbacks are not supported by this evidence contract.

Historical readJobAt captures its target before asynchronous IO, proves the
height is finalized, pins all identity/state reads to that block and rechecks
its canonical hash. An old receipt block is not fresh sending/admission
authority; readJob retains the existing new-reader freshness checks.

## Verification

Action TDD began with a missing module. The first signed-intent tests exposed
viem's representation of zero priority fee as an absent field; normalization
now accepts precisely zero. Strict checks also caught the serialized-transaction
prefix and nonempty topic-tuple types. These were fixed before the full gate.

Focused 39 Vitest tests across three files passed in 84ms; seven-root strict
verification passed with zero diagnostics. Tests use generated local test accounts
and fake receipts/RPC clients only. No owner wallet/key, real RPC request,
signature using an owner key, send, deployment or spend occurred.

The sole full gate49378 is **not a clean monolithic pass**: 4,908 Vitest tests
across220files passed in68.99s, then963Bun passed and one unchanged Agent SDK
relay afterEach timed out (964tests/69files/7,317assertions/177.68s). Only that
case was rerun in isolation: one pass, two assertions,193ms process duration
(108.35ms test body). Previously unreached stages80503 then passed: root/web
strict, client348ms and SSR174ms. The full suite was not replayed.

Investigation status: DONE_WITH_CONCERNS. The same fixture cleanup timeout is
already recorded in the [vendor-neutrality ledger](../2026-09-06-vendor-neutrality/progress.md)
at01:31IST, before this checkpoint. The unchanged fixture awaits server.stop
after a permanently unresolved mock response; the production relay itself has
a bounded close. That is a plausible cleanup race, not a confirmed product
root cause. The isolated case did not reproduce it, so no speculative fix,
timeout widening or test weakening was applied. Both relay files remained
unchanged. Seven escrow code/test pins stayed frozen; final scope/privacy audit
and commit follow. Coverage completed with this explicit gate concern.

Next: J7B3 bounded transport and durable guarded action lifecycle, including
nonce-use and sender concurrency fences, persisted projection and uncertain
send reconciliation; then the Effect rail and Task8 hub/runner/SQLite/pipeline,
followed by Task9 buyer lifecycle. No escrow rail is installed or advertised.
J4/J5 live and J6 deployment size/treasury pauses remain in force.
