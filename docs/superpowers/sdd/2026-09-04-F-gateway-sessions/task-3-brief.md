# F3 brief — bound Gateway verification and honest transfer references

September 5, 2026. Source, tests and focused evidence are frozen. Parent source
review is CLEAN within the process-local rail scope. Whole-repository gates,
public-copy approval and the atomic F3 commit remain pending; F3 commits after F2.

## Intent and scope

[Plan F Task 3](../../plans/2026-09-04-F-gateway-sessions.md#task-3-harden-gatewaylive-against-the-real-facilitator)
requires the facilitator's two-field POST body, a trusted configured Gateway
wallet, honest settlement references and boot refusal when Gateway is unavailable.
The [work order](../2026-09-04-A-settlement-core/work-order.md) requires genuine
failure-first tests, independent review, full gates and an atomic commit.

The implementation changes the [Gateway rail](../../../../packages/payments/src/gateway.ts),
an additive `SettledPayment` field in [payment types](../../../../packages/payments/src/types.ts),
the new [bounded HTTP helper](../../../../packages/payments/src/gateway-http.ts),
two new focused test files and only the existing Gateway success/tree conformance
fixture. F2 signer/buyer, shared core, hub, dependencies and F1 runtime are outside
this task's source changes. Gateway continues accepting and ignoring `SettleTree`;
this rail does not commit a settlement tree or distribute its fees.

## Local authority before any facilitator decision

Only the selected ready `loadChainConfig` supplies network, USDC and Gateway
coordinates. Missing, pending or invalid Gateway configuration refuses at
construction. Optional wallet, chain ID and validity inputs assert equality,
not a custom deployment. An explicit facilitator override must be a valid HTTPS
origin or permitted loopback HTTP origin, without a path, userinfo, query or
fragment. Malformed trusted challenge input produces a fixed `Effect.sync`
defect because the existing `Rail.challenge` interface has no typed error channel.

Verification copies own data fields into canonical allowlisted structures and
binds accepted requirements, required terms, resource, domain, payee, exact
positive uint256 amount, payer, nonce and signature. Actual viem recovery over
the [F2 pinned Gateway domain](task-2-brief.md) must match the payer; neither a
USDC-domain signature nor a provider boolean alone establishes authorization.
Only after full local binding does the rail project the F1-compatible wire body:
exactly `paymentPayload` and `paymentRequirements`, with ARCADE resource metadata
only in `paymentPayload.resource`.

Authorization time must be currently open and ordered, span at most 605500
seconds, and expire no later than local now plus 604900 seconds. Openness is
checked again after verification and before settlement; settlement does not
demand a newly issued full-length window. This is local acceptance policy, not
proof that a delayed live authorization is accepted by Circle.

Canonical snapshots and issued `VerifiedPayment` handles are deeply frozen.
A per-rail WeakMap records handle provenance. Fabricated, copied or cross-rail
handles cannot settle. A successful support response is also projected and
checked against the selected v2 exact kind, pinned domain/wallet and configured
six-decimal USDC; other advertised networks cannot select signing authority.

## Duplicate protection and the remaining durable-accounting boundary

Before the settlement POST, a per-rail map claims the selected chain/domain,
payer and nonce. It refuses repeated, concurrent or conflicting attempts,
including repeats after success; it does not return a cached success. The map
caps retained entries at 10,000 and fails closed at capacity. Only expired,
nonactive entries can be pruned; a backwards clock fails closed.

Transport failure, timeout or malformed response after dispatch retains the
attempt claim and returns a fixed uncertain outcome. No automatic retry or
provider diagnostic is exposed. These claims are process-local, not durable
session reservations. The approved F5–8 accounting adaptation remains future
implementation here: settlement intent must be durable before invoking a rail,
and an ambiguous dispatched outcome must keep its money reservation held until
reconciliation. Timeout, restart or authorization expiry must not falsely release
that durable hold or claim "not charged." F3's expiry pruning is not that ledger
and does not provide crash-safe accounting or authorization to run live sessions.

## Transfer reference is not mined proof

The historical plan inferred an on-chain transaction from a 32-byte-shaped value
and called other references batches. That inference is superseded by the
[observed F1 transfer and pending-credit evidence](task-1-live-report.md).
Gateway now accepts only a canonical nonzero UUID with exact success and matching
payer/network, returning `settlementKind: "gateway-transfer"`. A hash-shaped value
is rejected, not promoted to mined proof.

The additive optional union includes `onchain`, `gateway-transfer` and
`gateway-batch` for downstream compatibility. This Gateway implementation emits
only `gateway-transfer`; future explicit batch-proof integration is separate.
The existing `txHash` field carries the transfer reference for compatibility,
not evidence of a mined transaction, closed batch or withdrawable recipient
credit. Downstream F6/H consumers must retain that distinction and must not create
an explorer transaction link for the Gateway transfer.

## Transport evidence and completion limits

Transport makes one attempt with a shared 15-second headers/body deadline,
16 KiB request and 64 KiB response limits, framing and fatal UTF-8/JSON checks,
no redirects, cookies, compression or retries, and fixed errors. Cancellation
cleanup has a separate 250 ms bound, including Effect interruption and bodies
arriving after a noncooperative fetch. Cancellation cannot undo dispatched money.

The [worker report](task-3-report.md) preserves the initial Bun `node:http`
socket-close observer timeouts and the first native drain-assertion race.
Final fixtures observed native Bun `Request.signal` abort and bounded request
drain, then closed owned listeners. This is actual local transport cleanup,
not proof of that legacy compatibility event or cancellation of downstream work.

The worker recorded nine genuine unchanged-source Reds followed by 58 Vitest
tests (24 Gateway, 30 conformance, four configured-chain), six Bun cases /
20 assertions and exact-root-options strict TypeScript with zero diagnostics.
The [parent review](task-3-parent-review.md) independently passed 54 rail/conformance
tests, then the correct four-test chain file separately after the first command
named a nonexistent test. It also passed six Bun cases / 20 assertions and exact
strict TypeScript. The mistaken filename is retained, not counted as a test pass.

This publication pass did not rerun tests or make live requests. No additional
F1 spend, delayed facilitator acceptance, F13 action, batch proof or completed
session product is claimed. Further gates and the commit belong in the additive
[progress ledger](progress.md); the historical reports and their source checksums
remain unchanged. No private handoff, journal, signature or credential is exported.
