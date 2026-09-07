# J7B4a — separate escrow wire and generic rail contracts

Implemented the first boundary in the [J7B4 brief](task-7b4-brief.md): a closed
escrow capability payload/requirements codec and generic Rail types whose
defaults remain exact PaymentPayload/VerifiedPayment. The actual escrow rail
adapter, branded verified values, hub registry/dispatcher/admission and buyer
lifecycle are **not implemented by this checkpoint**. No rail is advertised.

## Wire decisions

Escrow payloads carry x402Version2, accepted requirements and exactly
payload:{jobId,capability}; only the existing optional resource descriptor is
also allowed. A claimed payer, exact authorization/signature, missing capability,
unknown field or noncanonical job ID refuses. The optional resource URL must
match the accepted resource. Encoding uses the existing base64-JSON header
convention with a16KiB raw-payload ceiling. This transient header necessarily
contains the secret; the future verified result must discard it.

Requirement metadata records the J7B1 request-binding protocol, deployment
addresses, provider agent ID, explicit new-job lifetime and request method,
listing ID/version, actual input hash and listing execution timeout. These
fields reconstruct the buyer's capability-committed description; they are not
a placeholder description to copy into createJob. No fake exact signature or
receipt hash is introduced. Capturing echoed terms is not proving them: the
hub must build trusted requirements from its current listing and parsed input.

The factory has no implicit job-lifetime default. The caller supplies a safe
integer leaving at least listing-timeout+600 seconds. maxTimeoutSeconds is the
execution timeout; expiresInSeconds is the new escrow job lifetime. Neither is
an alteration of existing EIP3009, Gateway, session or provider-authorization
validity. Future buyer creation must separately check absolute expiry overflow
and enough remaining setup time before spending.

All outer/nested records are closed and getter-free, with string/quantity/byte
bounds and canonical addresses. Known PaymentRequirements instances are accepted
without accepting arbitrary prototypes. Schema construction copies extra into
a fresh record, so that resulting record and its request child are explicitly
frozen along with the requirements. Source mutation cannot change captured terms.

## Compatibility and remaining wiring

Rail now accepts optional payload/verified/completion type parameters, defaulting
to the original exact types and no completion context. Existing exact methods
remain callable without changes; their schema and verification implementations
are untouched. A new optional ChallengeInput.escrow carries trusted request
context, and an escrow-specific completion context names hubJobId/outputHash.
There is no synthetic exact nonce or output hash to satisfy the legacy types.

Task8 must pass the new context only to escrow: the existing Gateway challenge
deliberately rejects unknown input fields. Do not pass the enriched object to
every legacy candidate or relax Gateway's closed-input check. The hub's current
registry, decoder, receipt authorizationNonce access and session handling remain
exact-only until that explicit integration. Children/sessions retain old rails.

## Verification

TDD began with a missing module. The deep-mutation test then caught the schema
record-copy behavior; the implementation now freezes the constructed metadata.
The missing-context fixture was corrected to omit the optional property under
strict exactOptionalPropertyTypes rather than assign undefined. Focused12Vitest
tests passed in42ms, including compile-time generic defaults, exact-schema
rejection of escrow payloads, nested getter/mutation/overflow cases and metadata
roundtrips. No owner key, RPC, transaction, spending or push occurred.

Four-root strict checks passed with zero diagnostics. Sole full gate68847
passed:4,965Vitest/223files/69.18s,972Bun/71files/7,635assertions/172.31s,
root/web strict and client/SSR builds. Four code/test pins remained frozen;
11-path scope/privacy and local-link audit passed. No gate replay. Next
7B4b supplies the actual guarded Effect adapter with private verified-value
branding, capability omission, action ordering and interruption cleanup; then
Task8 and Task9. J4/J5 live and J6 size/treasury pauses remain unchanged.
