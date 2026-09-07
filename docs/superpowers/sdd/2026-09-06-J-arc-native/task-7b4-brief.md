# J7B4 — explicit escrow wire and Effect rail

Continue from the merged [durable coordinator](task-7b3a-report.md) and
[bounded RPC/signing ports](task-7b3b-report.md). Task7 is not finished merely
because these lower-level pieces exist. No activation or live send while J6
deployment identity/size/treasury prerequisites remain open.

Atomic checkpoints:7B4a lands the separate wire decoder and generic type
contracts with exact-payment compatibility tests;7B4b implements and tests
the actual guarded rail adapter. Neither enables the hub before Task8.

## Additive contracts

Keep the existing exact PaymentPayload schema and VerifiedPayment shape
unchanged for EIP3009, Gateway, sessions and their tests. Parameterize Rail with
default exact payload/verified/context types so an escrow implementation can
satisfy the same challenge/verify/settle contract without dummy authorization.
The escrow implementation exposes explicit budget, submit and reject methods
in addition to settle; it is not installed into the current exact-only hub
registry by this checkpoint.

The new closed capability payload is x402Version2, accepted requirements, and
payload:{jobId,capability}, plus only the existing optional resource descriptor.
Decode/capture without evaluating getters. No raw capability in the verified
result, durable hub record, receipt or public evidence. The buyer's committed
job description is reconstructed by the existing J7B1 helper, not a human
listing description copied onto the chain.

ChallengeInput receives optional trusted escrow request context: listing ID,
version, input hash, provider agent ID and execution timeout. Factory identity
supplies escrow/hook/evaluator/token, while price/payTo/resource remain current
listing/request fields. Requirements publish that binding protocol and request
metadata, plus an explicitly configured new-job lifetime. The lifetime must
leave the existing listing-timeout-plus600-seconds floor; the factory has no
implicit lifetime default. maxTimeoutSeconds represents the listing execution
timeout, not an EIP3009 authorization. No existing validity/cap/replay rule or
the fixed ten-minute provider-authorization deadline changes.

Verified escrow data has an explicit rail discriminator, capability-derived
request context, payer/payTo/amount/network and captured requirements. Verification
is read-only and is not once-only inference admission. Task8 must bind it
atomically to one hub job before invoking a runner.

Settlement requires explicit hub job ID and validated output hash plus the
actual tree fields, or the legitimate empty-tree shape when there are no
children. The versioned projection is the one already implemented; no zero
receipt hash or fake exact signature is permitted. Submit must have an
independently confirmed output before complete, and the journal checks both
output and submittedAt. Reject operates only on verified job context and
cannot cross an uncertain prior action. A settlement/refund failure is never
automatically converted into an opposite send.

## Composition and verification

The production-facing factory takes independently verified identity, explicit
gas/lifetime policy, a shared durable journal, bounded signer acquisition and
provider authorization callback. Each action creates fresh operation-scoped
executor/RPC ports; it cannot reuse a poisoned send instance. Cancellation
from Effect must abort the operation, and resulting uncertainty stays durable.
No wallet key lookup on import or challenge/verify.

Test real capability commitments, closed payload/requirements capture, changed
input/listing/amount/identity rejection, capability omission from verified data,
missing completion context, submit→complete ordering, reject/refund proof and
uncertainty, plus generic type compatibility with all exact rails unchanged.
Use injected fake chain tests with the existing concrete composition retained;
then one sequential full gate per atomic checkpoint, four-worker limits,
scope/privacy audit and exact fast-forward. No subagents or push.

Next Task8 must adapt the registry/root dispatcher and pipeline explicitly,
add runner authorization messages and atomic SQLite escrow admission, exclude
escrow-owned jobs from legacy boot reaping, and represent confirmed refunds
versus uncertain outcomes honestly. Task9 follows with the bounded journaled
buyer lifecycle. Children and sessions continue using existing rails.
