> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10 purchase-authority correction — parent preflight

2026-09-06. Read-only source-composition review during H9 implementation. No new
behavioral test, wallet request, network call or source change is claimed here.
Read actual purchase derivation, quote/settle routes, relevant complete chat slices,
history, wallet/approval modules, Task9–10, T-EXEC-005/005a/T-PRIV-003, H4 quote and
transport, F signing helpers and their wire types. H10 source remains held.

## Observed mismatch

`Settlement` starts `eth_requestAccounts` and signing from a mount effect, using
only an instance ref as its run-once guard. `Thread` creates it for a tool output
with `awaitingSignature`; `Chat` saves that output to history, while Home restores
history by remounting Chat. No local fresh-approval permit is carried to Settlement.
This is a source-composed re-signing risk, not an executed remount regression yet.

`handleSettle` validates a supplied skill/input/signature, re-quotes and compares
payee/amount, but does not receive a live AI approval or tool-call binding. It then
receives and follows the 202 query-token polling URL. It holds the capability and
returns only terminal data; it does not supply the H9 store. The actual hub's token
can instead authorize header-only ordinary result/tree reads. The web application's
proposed GET tree relay would still receive that capability and is not acceptable.

The current wallet signer always uses USDC typed data. F's actual Gateway authority
uses GatewayWalletBatched with the selected pinned wallet, and exposes reviewed
`paymentRequirementsKind`, `gatewayDomain` and `signGatewayAuthorization` helpers.
Current settled-result display accepts hashes without qualified rail context and
the legacy Purchase branch still makes an unconditional no-charge statement.

## Proposed bounded implementation slices, for corrected H10 brief

1. Preserve AI SDK HMAC approval and server derivation. Add a browser-local,
   nonserializable attempt registry bound to the Chat instance and actual confirm
   event. Bind conversation/tool call, original skill, canonical bounded input,
   approved ceiling and captured canonical hub origin. Denial creates no authority.
   A tool output/model message cannot create a permit. Exact matched permit is
   synchronously consumed before any wallet call and never rearmed on retry/error.
   StrictMode, repeated effects, history restore and remount cannot produce a fresh
   permit. Capture terminal promise ownership so late completions do not attach to
   another conversation. No durable signing authority in history or H9 storage.
2. Make original signing-request/input binding explicit in the browser. Match its
   tool call, skill/input, amount ceiling, resource and issuing hub. Use fresh
   keyless server quote metadata for actual-input/ENS checks; never replace the
   approved input with an arbitrary model-provided body. Browser origin must be
   literal loopback or exact HTTPS; do not silently map H4's localhost default.
3. Extend only the keyless quote response with the public metadata the browser
   needs (captured hub origin, resource, seller and bounded original requirements).
   Preserve existing canonical challenge, network/asset and ENS owner/endpoint/
   payee checks; do not put job/session tokens or signed authorizations there.
   Before signing and before paid forwarding, compare the fresh derived terms
   against the captured approval/signature. Terms movement is refusal, not a new
   confirmation or a payment retry. The signature remains potentially usable after
   a post-sign refusal, so do not say it was cancelled or nothing can be charged.
4. Use the reviewed rail discriminator and pinned domains before wallet prompting.
   Malformed/unknown Gateway metadata cannot fall through to USDC. Prefer existing
   Gateway signing/recovery helper through a narrow EIP-1193 account adapter, with
   exact typed-data serialization and no RPC spend. Ordinary signing must validate
   selected chain/account/amount/payee and recover the signature against its exact
   immutable request too. No new deposit/session creation or different network.
5. Browser sends the paid request exactly once directly to the captured hub's fixed
   canonical resource, echoing the original validated requirement object. No
   redirect, cookie, ambient credential, URL capability, diagnostic payload or
   web-server relay. Distinguish pre-sign refusal, signed-unsubmitted, submitted-
   uncertain and accepted states. An abort after submission does not revoke the
   authorization or undo work. No paid retry, even when acceptance is lost.
6. Validate a 202 acceptance against the submitted context before H9 `remember`:
   canonical job/token, fixed result path, quoted amount, captured issuer, ordinary
   realm. Ignore no mismatches and never synthesize a token. Persist the accepted
   record once before result polling, reusing its captured timestamp. Surface H9
   storage failure/recovery/capacity/conflict honestly while retaining only an
   in-memory capability for this attempt. Never put the receipt/output/capability
   into AI SDK message parts, model history, server-function props or DOM attributes.
7. Header-only result and tree retrieval uses a browser-safe bounded transport and
   H4's decoder contract, not `hub.tree` or a server function. Reconstruct the exact
   result path instead of following a legacy poll URL. If the legacy URL is present,
   validate it without navigating to it. Hub proxy/public-origin inconsistency must
   be resolved or explicitly accommodated without trusting its URL as authority.
   Binding terminal job/skill/seller/buyer/amount/network/kind to acceptance remains
   required. An unqualified settled field is not proof of finality or a mined batch.
8. Remove the active browser call to `/api/settle`; retire its old relay with a
   fixed refusal once its safeguards are covered by the new path. Keeping a working
   fallback relay would preserve the custody problem and cannot be called browser-
   only. Existing E13 tests must be migrated to the actual equivalent boundaries,
   not deleted merely because they exercise the retired handler.
9. CORS is explicit operator configuration on the hub, default closed. Allow only
   exact owned web origins and necessary ordinary paths/methods/headers, never `*`,
   credentials, reflected arbitrary headers or F session routes. Preflight must be
   answered before business/Store IO. Actual request checks matter too; CORS is a
   browser read boundary, not authentication. Abort-aware ordinary polling and exact
   owned-fixture teardown need real tests before claiming backend cleanup.
10. Buyer UI receives token-free row projections after hydration. The accepted
    amount is not spent/balance/budget. Display fresh correlated settled evidence
    separately, plus pending/unavailable states and incomplete tree flags. Select by
    issuer/realm/job, clear stale view immediately, cancel transport and ignore late
    owners after selection/forget/unmount. No background paid request or auto-retry.
11. F currently hides non-exportable capabilities. Do not fake session grouping or
    claim recovered session budgets from H9 records. The buyer page must state that
    session recovery is unavailable here; adding a durable F export/import/realm
    adapter would be a separate reviewed implementation, not a Task9 optional field.
12. Keep full bounded seller output selectable in the current result surface, but
    fixed diagnostics and qualified receipt links. No onchain link for Gateway UUID,
    test marker or invalid present kind. Hub-reported settlement is not an independent
    fresh blockchain verification. Fix legacy no-charge copy without changing E13's
    conservative uncertainty behavior.

## Required evidence before acceptance

- Genuine deny-first tests for missing/denied/mutated/consumed approval, stale
  transcript/remount/StrictMode, repeated effect, signature mutation and no retry.
- Exact 202 acceptance-before-timeout persistence, lost acceptance, mismatched
  terminal fields, storage failures, token-free model/history/render surfaces.
- Real owned hub plus distinct web origin: preflight and paid/header-only reads,
  blocked foreign origin/path/header, redirects, body/deadline/abort and cleanup.
- Both pinned USDC/Gateway signing domains tested with synthetic offline wallets;
  F session realm refuses ordinary fallback. No real keys, funds or session writes.
- Separate full gates for coherent atomic correction slices, after all slice files
  freeze, plus focused independent review and actual native buyer-page acceptance.

This preflight authorizes no production origin configuration, deployment, live
signature or spending. H10a transport/authority and H10b dashboard remain proposed
local slices until their corrected brief and exact file ownership are released.

## Parent refinement after independent transport review

2026-09-06 12:45 IST. The original proposal above is retained unchanged; G3's
210-line transport note is frozen at 87a6fbad228df1c9d8ff88f5bf4b0595c63f9bbb50d8b12b138701d8d378679e.
Its two composition findings are accepted. These are design decisions, not tests.

- Extend the actual Thread/Confirm callback context to capture both approval.id
  and toolCallId/tool name, original input and ceiling at the human event. The
  present callback only passes id/boolean. Never mint the permit later from an
  awaitingSignature output. Existing AI HMAC verification remains in the server
  tool path; the local one-use permit is an additional browser execution boundary,
  not a claim of cryptographic security against an owner-modified client or XSS.
- USDC typed data does not distinguish an EIP3009 operational rail from Test.
  Add narrow additive rail context to the ordinary 402 body from the actual selected
  Rail.name, without changing the original accepts requirement object. The public
  quote projection can capture that exact reported rail with the checked challenge.
  Require it for the new browser purchase path; missing/test/unknown operational
  rail is unsupported, not an implicit EIP3009 fallback. Retain old public quote
  behavior for old/mock sources without inventing a rail, and label the new browser
  path unavailable until the upgraded hub supplies it. Compare reported rail to the
  canonical signing-domain discriminator; this is hub-reported context, not chain
  verification or proof that a particular backend did broadcast.
- Native wallet fixtures may use a clearly documented synthetic ordinary rail
  implementing the EIP3009-shaped interface, with an offline unfunded test account
  and network fencing. No real wallet/key or operational Test signature is allowed.
  Such evidence proves browser/HTTP/approval composition, not a real paid rail.
- Prefer three coherent H10 local commits: (a) passive ordinary protocol/CORS/
  browser transport and bounded quote context; (b) fresh browser approval + verified
  rail signing + direct one-shot purchase + relay retirement; (c) buyer dashboard
  and native visual acceptance. Each slice freezes before its own single full
  gate. Passive support must not activate a second purchase path or expose F session
  capabilities. Native cross-origin acceptance belongs in (b)/(c), not merely a
  mocked successful fetch in (a). Parent must publish the corrected brief and
  precise file ownership before each source release, after H9 commits.
