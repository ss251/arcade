# F2 brief — Gateway authorization and stable paid requests

September 5, 2026. Implementation and focused correction tests are frozen.
Parent source review and independent rerun are underway; whole-repository gates
and the atomic F2 commit remain pending at this publication checkpoint.

## Intent and authority

The [original work order](../2026-09-04-A-settlement-core/work-order.md) requires
failure-first implementation, preserved interfaces, independently reviewed
evidence, full gates and small conventional commits with Codex attribution.
[Plan F Task 2](../../plans/2026-09-04-F-gateway-sessions.md#task-2-signgatewayauthorization--the-buyer-signs-the-right-domain)
adds the buyer's Gateway signing path without replacing ordinary USDC signing.
The two domains authorize different contracts; a Gateway challenge must not
silently produce an ordinary USDC authorization.

F1's [approved single live gate](task-1-live-report.md) unlocked F2–12 code work.
That spend approval is consumed. F2 uses dummy accounts, injected requests and
temporary owned loopback HTTP only. This task does not authorize another deposit,
payment, withdrawal, key read or live purchase. F3 owns Gateway verification and
settlement; later session work and evidence retain their separate requirements.

## Signing contract and necessary plan corrections

The exported `isGatewayRequirements`, `gatewayDomain` and
`signGatewayAuthorization` interfaces remain available. The signer returns the
existing seven fields: `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`
and `signature`. An added `paymentRequirementsKind` check lets the buyer reject
malformed or contradictory explicit domain metadata before choosing a signer.
The [Gateway signer](../../../../packages/payments/src/gateway-sign.ts) and
[buyer integration](../../../../packages/buyer/src/fetch-with-payment.ts) implement
these local checks; `eip3009.ts` itself is unchanged.

The plan's literal challenge-selected contract example is superseded: only the
selected ready `loadChainConfig` supplies the network, USDC and Gateway wallet.
Optional chain, chain ID and lifetime inputs assert equality; they cannot choose
a custom deployment. The exact Gateway name/version/contract, canonical positive
uint256 amount, payee/value and 604900-second requirement must agree before
signing. Unknown, incomplete or contradictory explicit domain metadata refuses
instead of falling back to ordinary USDC. Missing or agreeing ordinary USDC
metadata remains supported.

The installed Circle 3.2.0 compatibility path determines the bounded time window:
`validAfter = now - 600`, `validBefore = now + 604900`, a total span of 605500
seconds. This does not adopt the SDK's unbounded lifetime clamp or untrusted
contract selection, nor claim a universal future facilitator minimum. A fresh
cryptographic nonce and separate deeply frozen signing objects are used. After
one signing attempt, local signature recovery must match the canonical account,
domain and message. Signer failures have fixed diagnostics.

## Request-copy policy and independent follow-up

The buyer captures the original URL, options, headers, spend cap and body before
the initial unsigned probe. Canonical amounts and cap checks precede signing.
The existing ENS `beforeSign` authority gate receives a frozen requirements
snapshot and retains its typed refusal. Both requests use `redirect: "error"`
and `credentials: "omit"`; lineage and existing-payment-header guards remain.
There is at most one signed retry, including when the response is another 402.

The explicitly approved local replay-copy policy permits at most 1 MiB of body
bytes. Strings, URLSearchParams, ArrayBuffer/views and Blob are supported;
FormData and streams refuse before the probe. Mutable supported inputs are
copied, including view offsets and native content types. This is a new local
policy, not a pre-existing hub limit. Normal `callSkill` JSON remains on the
string path.

The [initial independent review](task-2-independent-review.md) reproduced two
defects after the original focused suite passed: a paid-fetch error could reflect
the issued Gateway authorization, and Bun's file-backed Blob could change between
requests despite `slice()`. The [correction follow-up](task-2-independent-followup.md)
supersedes those exercised behaviors without rewriting either historical report:

- Gateway-only paid transport failures retain `fetch(paid)` and return the fixed
  message: "Gateway authorization issued; payment outcome unknown. Reconcile
  before retrying." Ordinary USDC diagnostics and structured unsigned policy
  refusals remain unchanged. This is a signed, uncertain outcome, not proof that
  no payment occurred.
- Blob bytes are eagerly copied before either request, checking declared and
  actual size, exact final length and at most 4096 chunks. A five-second
  asynchronous bound covers reading and cleanup. Caller/Effect interruption
  requests cancellation; the owned reader lock is released even if underlying
  cancellation does not cooperate. No forced termination of arbitrary external
  work or preemption of synchronous runtime work is claimed.

## Evidence and completion boundary

The [implementation checkpoint](task-2-report.md) records genuine missing-module,
wrong-domain, malformed-cap and mutation Reds, then 128 Vitest tests and three
owned-loopback Bun cases / 24 assertions passing. It is historical: its original
Blob immutability and generic paid-error limits are superseded by the follow-up.

The follow-up records the two preserved independent Reds turning Green, 128
Vitest tests passing again, and 13 collected Bun cases / 75 assertions passing
(three HTTP cases plus ten replay cases). Exact root-tsconfig checks explicitly
targeted nested tests and returned zero diagnostics. The preserved private two-case
regression run is separate and is not counted again in the 13 collected cases.
This publication pass did not rerun those tests or make a live request.

Actual local HTTP tests recover the issued signature, preserve the request and
lineage, refuse cross-origin paid redirect forwarding and make no paid request
after signer failure. Owned listeners close and post-stop refusal is checked.
These observations do not prove payment settlement, a live ENS purchase, recipient
credit, a mined transaction, batch closure or a session product milestone.

Generic probe/402 decoding, legacy diagnostic behavior and whole-payment
response/transport deadlines are outside this narrow correction. Parent review,
rerun, full gates and commit results belong in the additive [progress ledger](progress.md).
The exported reports retain their original source checksums as historical
fingerprints, not transaction evidence. Private regressions, handoffs, journals,
credentials and runtime files are not published.
