# J7B4b — guarded escrow Effect rail

The [wire/rail brief](task-7b4-brief.md) now has its actual explicit factory,
makeErc8183Rail, and Erc8183Live layer on a dedicated Erc8183Tag. It does not
replace the exact-only RailTag or install/advertise anything in the hub. Task8
atomic inference admission and runner/dispatcher wiring, then Task9 buyer
lifecycle, remain necessary. No deployment identity or live proof is invented.

## Boundaries

The caller supplies independently verified runtime identities, gas ceiling,
explicit job lifetime and operation IO deadline, one shared durable journal,
bounded signer acquisition, and provider authorization callback. There are no
keys or network calls on import/challenge. Existing authorization validity,
caps, session behavior and replay protections are unchanged.

verify and verifyBudget capture the closed payload plus independently supplied
CURRENT requirements and compare all canonical terms. Deployment and lifetime
must match factory configuration. The actual fixed-Arc reader checks the fresh
canonical job/identity; provider code is independently read at that same block
and must be empty. Pure verification reconstructs the capability commitment
from actual listing/input/client/expiry. The frozen result retains only the
derived context, payer/amount and requirements, not capability/header payload.
A factory-private WeakMap brands that result; clones and cross-factory values
cannot request budget/submit/complete/reject, even when their fields match.
Verification remains read-only and is NOT once-only inference admission.

Each action creates fresh bounded RPC/executor ports and uses the shared durable
claim before provider authorization or transaction signing. A budget result
cannot stand in for a funded result. Completion requires valid actual hub job
ID/output hash and coherent actual tree fields (or legitimate empty tree),
then the existing journal's independently confirmed submission/output/timestamp
match. There is no fake exact authorization, zero receipt hash, or automatic
reject after ambiguity. Proven settlement retains the full decoded fee/seller/
refund/gas/block proof; a refund is returned separately by reject, not mislabeled
as a successful purchase. Refused-before-dispatch and uncertain outcomes use
fixed distinct error reasons, never private upstream diagnostics.

Effect interruption aborts operation authority and awaits bounded cleanup,
including the journal's uncertainty transition. Late callbacks cannot resume
signing/sending. Persistent recovery remains fail-closed; no resend API is added.

## Verification and limits

TDD started with the missing module. Mechanical syntax and test Effect-error/
mixed-result typing mistakes were corrected. An added provider-contract test
then exposed a genuine missing early verification check; canonical EOA code
verification now refuses before inference or any signer acquisition.

Focused72Vitest across4files passed (18newrail tests), including changed actual
input/listing/agent/version/timeout, wrong capability/current price, omission of
secrets, frozen/private brands, separate budget stage, decoded budget/submit/
refund proofs, uncertain send and interruption cleanup, and receipt/tree errors.
Seven-root strict checks passed with zero diagnostics. Existing action/RPC
fixtures retain their default behavior; optional capability and consistent
block/time/transaction nonce inputs enable honest fake-chain lifecycle evidence.

One real Bun SQLite integration passed8assertions/444ms: verify funded job,
submit at block51/time1001, complete at block53/time1003 with matching recorded
submittedAt, then reopen and refuse an opposite action despite stale funded
RPC facts. Both transactions use real local signing/ABI/event/projection codecs
but ephemeral fixture accounts and FAKE chain responses. This is not live RPC,
real money, network deployment, or a physical power-loss test.

Sole full gate56222 passed:4,983Vitest/224files/68.76s,
973Bun/72files/7,643assertions/175.03s,root/web strict and client566ms/SSR192ms.
Seven code/test pins unchanged; final13-path scope/privacy audit and80local
links passed. Atomic commit/exact fast-forward follows, without gate replay.
Next Task8 and Task9 continue offline. J4/J5 live and J6 treasury/size pauses
remain unchanged; no owner key read, live send, spending, approval replay or push.
