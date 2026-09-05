> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F2 Gateway authorization — implementation checkpoint

September 5, 2026, 12:53 UTC. Source and focused tests frozen for independent
review; no commit or full-repository gate was performed by this implementer.
The original task2-readiness.md is unchanged. F1 live approval was already consumed;
this task used only offline fixture accounts and temporary owned loopback HTTP.
No Keychain, live RPC, external gateway, deposit, settlement, dependency update,
owner configuration, or Git mutation occurred.

## Scope and interfaces

Owned seven files: payments/src/gateway-sign.ts, payments/src/index.ts,
payments/test/gateway-sign.test.ts, buyer/src/fetch-with-payment.ts,
buyer/test/fetch-with-payment.test.ts, buyer/test/ens-hire-by-name.test.ts and
buyer/test/gateway-fetch.bun.test.ts (all below packages/).

Preserved isGatewayRequirements, gatewayDomain and signGatewayAuthorization with
the existing seven-field authorization result. GatewaySignInput extends the actual
SignInput; its optional chainId is an equality assertion, not a network selector.
Added paymentRequirementsKind to give the buyer an explicit no-fallback authority
check. Its fixed throw is mapped into the existing typed RpcFailure by the buyer.
The Gateway signing Effect uses fixed InvalidSignature errors.

The selected ready loadChainConfig alone supplies the network, USDC and Gateway.
Explicit custom deployments are not supported. GatewayWalletBatched/version1,
the pinned verifying contract, exact604900-second requirement, positive canonical
uint256 amount, nonzero payee and exact to/value are checked before signing.
Optional chain/chainId/window assertions must agree. Accessors, inherited domain
metadata, coercible amounts, unsafe clocks and pending mainnet fail closed.
The nonce uses crypto.getRandomValues, and bigint time arithmetic gives now-600
through now+604900 (span605500), matching the reviewed installed Circle3.2.0 path.

The signer gets a separate deeply frozen domain/message/types request, never the
shared TRANSFER_TYPES object. After exactly one signing attempt, offline recovery
must match the canonical account, domain and message before authorization returns.
Malformed, unrelated, mutated or rejected signatures have only fixed diagnostics.

## Deliberate compatibility and safety corrections

- The plan's challenge-selected contract example was unsafe and is refused.
  Named but malformed Gateway metadata cannot become ordinary USDC; unknown or
  contradictory explicit domain metadata also refuses. Missing/empty or agreeing
  ordinary USDC metadata remains supported. eip3009.ts itself is unchanged.
- Canonical amount validation precedes BigInt and the cap. The existing ENS
  beforeSign callback then sees a frozen requirements/extra snapshot and preserves
  its original typed refusal. Full signing-domain validation follows that gate,
  always before a signature. Existing ENS assertions were not weakened.
- Runtime malformed caps now refuse before any probe. A valid zero cap remains
  meaningful; signed amounts are positive and must not exceed the captured cap.
- Original URL string, method/options, headers and replayable body are captured
  before the probe. The paid request cannot follow callback mutation to another
  target or body. Both requests retain redirect:error and credentials:omit;
  lineage and the modern/legacy double-payment guards remain in place.
- A new explicitly approved local replay-copy policy caps body bytes at1MiB.
  Strings, URLSearchParams (including native content type), ArrayBuffer/views
  (including offsets) and immutable Blob are supported. Mutable bodies are copied
  independently for each attempt. FormData and streams are refused with a fixed
  typed pre-probe error, not unboundedly buffered or reserialized multipart data.
  This is a new policy, not a claimed pre-existing hub limit. Current production
  callSkill JSON requests stay on the string path.
- No SDK upgrade was needed. Installed Circle3.2.0 dist/client/index.js:49–79,
  203–229 and281–307 establishes the domain/window/field compatibility. Its loose
  parseInt, Math.max lifetime and untrusted contract selection were not copied.

## Genuine failure-first evidence (UTC)

- 12:27:59: collected new gateway-sign test failed because the module did not exist.
- 12:29:05: seventeen buyer failures reproduced wrong-domain signing, unsupported
  metadata fallback, malformed amounts and mutable pre-sign requirements.
- 12:33:20: five malformed cap failures reproduced NaN/Infinity/string/overflow
  bypasses and a negative cap checked only after network I/O.
- 12:44:32: seven additional failures reproduced signer message/domain mutation,
  mutation of shared TRANSFER_TYPES, three valid but unrelated signatures, and a
  callback moving the paid retry to another URL.
- 12:47:28: nine body regressions reproduced view/buffer/URLSearchParams mutation
  and six oversized or nonreplayable bodies reaching the probe. Three exact1MiB
  boundary cases passed immediately; they are coverage, not manufactured Reds.

An intermediate run exposed the unchanged ENS refusal-method assertion, which was
preserved by fixing validation ordering. Strict checks found ordinary literal and
optional-body fixture typing issues, corrected without casts that suppress them.
One final strict attempt encountered only the concurrently authored F3 supported
discriminator errors; its author corrected those independently before the final
exact-target check returned zero diagnostics.

## Final focused verification

At12:51:57: 128/128 Vitest pass across gateway-sign (55), fetch-with-payment (47),
ens-hire-by-name (22) and unchanged configured-EIP3009 tests (4).

At12:52:52: actual owned-loopback Bun group 3/3 pass,24 assertions. It independently
recovers the real HTTP Gateway signature, preserves original input/lineage, makes
only one signed retry even after another402, blocks a paid307 from forwarding to
the second owned origin, and proves signer failure makes no paid request. Both
listeners are stopped in finally, including partial startup, then connection
refusal is asserted. These are offline transport observations, not settlement.

The exact root tsconfig options compiled all seven owned files, explicitly including
both nested Vitest and Bun tests: zero diagnostics. git diff --check passed.
Focused commands were bun --no-env-file x vitest run with the four named files,
and bun --no-env-file test packages/buyer/test/gateway-fetch.bun.test.ts.
The ts-testing skill guided genuine regressions, public-API/real-boundary assertions,
and finite owned-listener cleanup; no new test framework was introduced.

## Limits and deferred work

This is authorization and local request-boundary proof, not a successful Gateway
payment or live by-name purchase. F3 independently owns verification/settlement.
Generic existing buyer fetch/decode/paid-fetch exception reflection and deliberate
hub policy error/detail propagation remain unchanged and are separately flagged;
the new Gateway signer does not copy them. No broad transport deadline/body-read
redesign or custom-contract support is claimed. Parent owns independent review,
full gates, publication and the eventual atomic commit.

## Frozen fingerprints (SHA256)

- gateway-sign.ts: 6b8621b0ea5aa793441d877f07877523f377e0274de9c2feeda998e438a28893
- payments index.ts: d414623ec8c041150399ba41f2dd546f411c7bf39453f4893e9cbf579392cb7c
- gateway-sign.test.ts: 010ce4fed8765847782c14595f7b29aadb9655bf20f618029ec36c92f2d12463
- fetch-with-payment.ts: c359b2720fca4103d9c378b9f205a83e91218416cbdf762f37efe216fe751589
- fetch-with-payment.test.ts: 4a9bd82689e493b469ac5d6bcba4219ac3ac71b7a77687a42a9144a5e96a6e6f
- ens-hire-by-name.test.ts: 2c8929a6120f1f8aeb2f09e6dc8955f1caf95ef338ad9ef6c1f83e7c8d52275d
- gateway-fetch.bun.test.ts: 3099eb3b3bdf4a16efed23ecfe9b490073fa5268de459d1d1fdea2fe2da35748
- unchanged eip3009.ts: 6a9336cea116841f4d1a1262775bb29c8e652619f955a65a54cfe5232635420d
- unchanged readiness: 7579f6f150747dd6e9005e405acbccb526eb12e9c06ef4c6f175569876fc2bc8
