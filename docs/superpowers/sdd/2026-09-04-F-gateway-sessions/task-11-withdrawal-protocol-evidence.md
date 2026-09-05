> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 withdrawal protocol evidence and bounded design

Accessed 2026-09-05, approximately 19:19–19:31 UTC (September 6 IST). Research only. Read the complete F11 funding readiness and parent decisions, installed Circle client code, and the official sources below. No Gateway API, RPC, wallet, key, signing, deposit, burn, mint, withdrawal, deployment, dependency change, repository Git mutation, or test suite was invoked. The only repository write is this ignored analysis.

## Outcome

The **wire format and validation design are now sufficiently specified for offline implementation**, without calling the unsafe SDK withdrawal convenience. A same-Arc-testnet, self-recipient, one-intent policy can use a finite burn height, an explicit fee cap, exact byte comparison, and the current Minter's authorized-attester check.

Recovery remains conditional: the documented normal-transfer GET recovers attestation bytes **if its server-issued UUID was retained**. A completely lost initial response leaves no documented way to derive that UUID or retrieve the attestation from the locally retained spec hash. Keep that operation unresolved and do not retry its POST. This is a scoped documentation finding, not a claim that Circle support can never recover it, or that funds are permanently lost.

No deployed-bytecode, current attester, live withdrawal delay, Arc burn fee, estimate response, live attestation, or mint was verified. Those remain future bounded read-only/runtime gates under separate authority. Source verification does not grant new spending permission or establish F11 live acceptance.

## Source and retrieval inventory

- Installed `@circle-fin/x402-batching` **3.2.0**, as declared by its installed package metadata and lock. Read `dist/client/index.js:1234–1372` and transfer-query methods at 1384 onward; coordinates at 522–545. SDK client SHA-256: `fb54dd40f1a3e2ecec6ef0233b73a1e96c90c8f3f2110c6b1d1bbb38c64e168e`. This is local installed-code evidence, not a deployed-contract fingerprint.
- Official [Circle EVM Gateway contracts](https://github.com/circlefin/evm-gateway-contracts/tree/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8), pinned commit **fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8**, committed **2026-09-02T19:49:31Z**, commit title identifies release **1.3.0**. Read relevant source and official codec tests at this exact commit; do not equate current repository release with Arc's deployed implementation.
- Official [Gateway OpenAPI](https://developers.circle.com/openapi/gateway.yaml), public document `info.version: 1.0.0`, embedded generation commit `e87dab6cd6f6e3e9142aef92fd3c34bd3f513080`. Retrieved SHA-256 **b697cb61f4389b91db872fb84aaf649f5432eca7308e29e8a6bc2a8dc8de98d9**. No access to its non-public generation repository occurred.
- Official [technical guide](https://developers.circle.com/gateway/references/technical-guide.md), direct Markdown SHA-256 **3743f5486306a186bd5a9231225bdad6f182172873490c6f85528a2bae00622b**.
- Other official pages are linked at each finding. No third-party financial/protocol source was relied upon.

Agent-reach main skill plus search/web/dev references were read in full. `mcporter` Exa failed with `Unknown MCP server 'exa'`; built-in web search was the authorized fallback. Initial restricted-shell DNS failed; approved public read-only requests then worked. Jina's HTML-guide attempt returned unrelated tracker content, which was discarded; the retained technical-guide evidence is official direct Markdown, with built-in page reading used for other pages. GitHub source reads used read-only `gh api`/official raw downloads. No auth/setup/install was attempted. Scratch is `[private temporary protocol-source directory]`, containing public source/docs only. Agent-reach's update check reported installed v1.5.0 but could not determine an update because DNS failed; no update claim or installation follows.

## 1. Minter authority and exact attestation binding

The [official contract-address table](https://developers.circle.com/gateway/references/contract-addresses) explicitly lists **Arc Testnet, domain 26**:

- Gateway Wallet: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`.
- Gateway Minter: `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`.

These match installed 3.2.0. Retain selected core Arc-testnet chain ID 5042002 and USDC `0x3600000000000000000000000000000000000000`; add no mainnet/custom coordinates. The Minter is a separate trusted deployment, not a URL or address supplied by a transfer response. Future preparation must verify chain ID, code/proxy identity and relevant supported-token/domain state using pinned reads; today's research did not establish deployed code equality to release 1.3.0.

The canonical binary representation is **packed, big-endian**, not ABI tuple encoding or JSON. See [TransferSpec.sol](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/lib/TransferSpec.sol#L21) and [TransferSpecLib.encodeTransferSpec](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/lib/TransferSpecLib.sol#L372). For the approved empty-hook policy, spec length is exactly **340 bytes**:

| Spec offset | Width | Field |
| --- | --- | --- |
| 0 | 4 | magic `ca85def7` |
| 4, 8, 12 | 4 each | version 1, source domain, destination domain |
| 16, 48 | 32 each | source Wallet, destination Minter |
| 80, 112 | 32 each | source token, destination token |
| 144, 176, 208, 240 | 32 each | depositor, recipient, signer, destination caller |
| 272, 304 | 32 each | value, salt |
| 336 | 4 | hook length, zero here |

All EVM address fields must have twelve zero high bytes and the exact captured low twenty bytes. The spec hash is `keccak256` of those complete packed bytes, including magic/version/length—not EIP-712's struct hash or a hash of JSON.

[Attestations.sol](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/lib/Attestations.sol) specifies single magic `ff6fb334`, then 32-byte **destination** max height, then 4-byte spec length, then spec bytes. Thus an empty-hook single attestation is **380 bytes**. A set uses `1e12db71`, a four-byte count, then concatenated attestations; a singleton set is **388 bytes**. The smallest interoperable scope accepts a single or exactly one set element, never zero, multiple, duplicate, truncated or trailing elements. [AttestationLib](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/lib/AttestationLib.sol#L80) validates outer and recursive lengths/magic/version. Locally compare the embedded spec **byte-for-byte** with the captured expected encoding.

[Mints.gatewayMint and signature validation](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/modules/minter/Mints.sol#L166) recover an ECDSA signer from the Ethereum signed-message digest of `keccak256(attestationPayload)`. They check `isAttestationSigner(recoveredSigner)`, expiry, destination caller/domain/contract, token support and replay state. Proposed local check: recover from the raw 32-byte payload hash with canonical signature validation; read that recovered signer's membership on the pinned Minter at a verified block, not from an API-supplied signer field. A key-free exact `gatewayMint` simulation can additionally verify current contract conditions before preparing a transaction. Neither preflight prevents later state changes; failure remains possible.

The attestation authenticates **TransferSpec plus destination expiry only**. It does not include the BurnIntent's fee cap or source expiry. Keep those in the immutable original intent and its recovered EIP-712 signature; do not require the two height values to be equal or claim attestation recovery proves a fee charge. API summaries must correlate to the retained intent but are not independent chain proof.

## 2. Finite authorization, debit and fees

The [technical guide](https://developers.circle.com/gateway/references/technical-guide#burn-intent) says transfer-request acceptance requires source expiry at least the current source height plus Wallet `withdrawalDelay`. It describes attestation expiry separately (nominally ten minutes). The guide also explains that issuing an attestation reduces API available balance, unused expiry restores it, and observed mint triggers the corresponding burn. These are service semantics, not a per-operation observation or a precise wall-clock promise.

[WithdrawalDelay.sol](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/modules/wallet/WithdrawalDelay.sol#L39) exposes an owner-changeable **block count**. [Burns._validateBurnIntentBlockHeightAndFee](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/modules/wallet/Burns.sol#L424) rejects when `maxBlockHeight < block.number` and when the proposed fee exceeds `maxFee`. The expiry boundary is inclusive. The source contract does not itself enforce the API's minimum future window. Minter expiry is likewise inclusive but on the destination chain.

Minimal policy proposal: obtain an unsigned [estimate](https://developers.circle.com/api-reference/gateway/all/estimate-transfer) for the exact single spec, forwarding disabled; capture a fresh source block and Wallet delay; require a finite estimate height satisfying the current minimum **and a separately approved maximum block delta**. Refuse `maxUint256`, overflow, stale/drifting coordinates, and estimates beyond either fee or height caps. Freeze the height once; recheck before signing/submission and refuse if no longer admissible instead of extending it. Do not convert an assumed Arc block time into authority or invent a short seconds-based burn lifetime. No estimate API was called here and no numerical production delta is proposed without policy approval.

The [fees page](https://developers.circle.com/gateway/references/fees) distinguishes source burn gas from the cross-chain percentage fee; same-chain withdrawals omit the latter. It does **not** provide an Arc-testnet rate in the retrieved table. Thus “same-chain” does not justify zero total fee or the SDK's default 2.01 USDC. The documented estimate response returns canonical-address specs, unlike submitted bytes32 fields: explicitly normalize then compare every field, never sign the returned object directly. Fee strings are decimal USDC while intent values/caps are atomic uint256; parse exactly.

[Burns._processSingleBurnIntent](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/modules/wallet/Burns.sol#L499) requests a debit of **value plus actual fee**. Fees are separately transferred; the mint value is not reduced by the fee. Its insufficient-balance path can deduct less, prioritizing burn value over fee and emitting `InsufficientBalance`. Therefore normal admission should conservatively require available >= value + approved maxFee and uint256-safe arithmetic; do not treat successful source receipt alone as exact debit proof. Reconcile `GatewayBurned` spec hash, value, fee, balance-source amounts and absence of the insufficiency condition. Destination `AttestationUsed` plus exact USDC mint/transfer effects establish destination delivery; burn and mint are separately observed phases, not one atomic cross-system success.

## 3. Lost-response recovery: exactly what is documented

The [create-transfer endpoint](https://developers.circle.com/api-reference/gateway/all/create-transfer-attestation) / official OpenAPI describes a single signed `POST /v1/transfer`, 201 response with `transferId` UUID, attestation, signature, fees and expirationBlock. Forwarding defaults false; do not enable it or import its fee/gas behavior. The schema has no client request ID or documented idempotency field for this call. Generic Circle idempotency documentation is not evidence for repeating this particular mutation.

[GET /v1/transfer/{id}](https://developers.circle.com/api-reference/gateway/all/get-transfer-by-id) accepts the server UUID and returns intent summaries and, when not forwarded, nested attestation payload/signature/expiration. [GET /v1/transferSpec/{transferSpecHash}](https://developers.circle.com/api-reference/gateway/all/get-transfer-spec) returns **only the full spec**. It does not return UUID, attestation, fee/expiry authority or a mint result. The inspected OpenAPI has no normal-transfer search/list-by-salt or spec-hash-to-transfer-ID endpoint; `/v1/x402/transfers` is a distinct nanopayment API and must not be substituted.

| Retained evidence | Safe read-only capability | Remaining limitation |
| --- | --- | --- |
| Transfer UUID durably retained | Fetch normal-transfer record; bind the sole intent hash, domain, original source height/cap, and decode/recover returned attestation | Does not authorize mint/retry or prove the service's status is mined |
| Only original intent/spec hash; complete response lost | Lookup exact spec; inspect pinned Wallet/Minter replay-state and correlated events | No documented retrieval of the missing UUID/attestation; absence/404 is not proof POST failed |
| Known locally computed mint transaction hash | Fetch exact transaction, receipt/canonical block/events | Pending or unavailable stays unknown; no rebroadcast/new nonce |

[TransferSpecHashes](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/src/modules/common/TransferSpecHashes.sol#L36) exposes `isTransferSpecHashUsed` on each contract. Its true value is a useful replay observation, not sufficient standalone recipient/amount/transaction evidence. A false value cannot prove the API never reserved funds, and expiry plus balance restoration is not by itself per-intent reconciliation. Bound event ranges and compare full correlated event fields.

The [API overview](https://developers.circle.com/api-reference) explicitly distinguishes permissionless Gateway from key-authenticated services. These inspected normal-transfer routes have no authentication scheme in the OpenAPI. Authenticate the returned capability cryptographically against pinned onchain signer authority and the original bytes; do not invent a new API-key requirement or treat HTTPS alone as mint proof.

The current OpenAPI itself has a schema inconsistency: `TransferDetailsResponse.required` lists `transferSpecHash`, `maxBlockHeight`, `maxFee` at top level, while its properties/examples place these inside `burnIntents`. Do not mechanically enforce that contradictory generated required list. Implement the reviewed semantic shape with a closed bounded projection and regression, and leave unexpected variants unavailable. No live wire response was obtained to resolve this beyond the documented nested shape.

## 4. Capability persistence and one-shot boundaries

An attestation with caller zero is relayable by anyone but pays only its fixed recipient; it is **not** permission to redirect funds. It can nevertheless trigger mint timing and consumption of its replay identifier. Its payload/signature, and a UUID which lets an unauthenticated GET retrieve them, must not be printed in logs/public evidence. Treat both as sensitive operation recovery material, not ordinary public transaction proof. A signed BurnIntent is more directly fund-authorizing and should never be logged or persisted in the existing facts-only journal.

Recommended smallest default remains a facts-only journal containing the public intent fields/digests and transaction checkpoints, with attestation bytes only in bounded memory. This means a crash before durable UUID/capability retention can make the pending operation unrecoverable through the documented API; state this limitation explicitly. If resumable manual redemption is required, approve a **separate private capability record**: account/chain-bound, no-follow/exclusive file in owned 0700 parent, 0600 file, bounded closed schema, fsynced before mint preparation, no backups/public export/diagnostic reflection. Persist either a validated UUID for bounded re-fetch, or validated payload+signature with digest and expiry. UUID-only recovery still depends on API availability and does not refresh an expired attestation. No such record was created here.

Persisted recovery data must never make startup auto-sign, repeat `/transfer`, or automatically mint. Retain poisoned/uncertain ownership after unknown dispatch. A separately authorized subsequent operation would still need fresh state/code/signature/expiry/replay validation and the exact one-send journal discipline. Parent's no-new-spending and no automatic phase continuation remain controlling. Trustless withdrawal is a distinct two-transaction delayed mechanism, not an implicit recovery fallback.

## Reproducible offline fixture and local validation plan

The following is a **new synthetic unsigned codec vector**, not Circle-issued evidence or a source-chain observation. Construct it with the pinned packed encoders above; all addresses are zero-left-padded to 32 bytes. Use version 1, both domains 26, the pinned Wallet/Minter/USDC above, and `0x` + twenty `11` bytes as depositor/recipient/signer. Caller is zero, value `123456`, salt `0x` + thirty-two `22` bytes, hook empty. Burn height `1120`, maxFee `50`; independent attestation height `1010`. These numbers are test data only, not approved funds/fee/height policy.

I evaluated only this in-memory encoding and Keccak calculation with the already installed viem via `bun --no-env-file -e`; no signature, key, request or test was executed:

| Encoding | Bytes | Keccak-256 |
| --- | --- | --- |
| TransferSpec | 340 | `0x9d6e6e7a00b22d847aa3e4ff5f82be38c71d91abb0e7e19a57953c66d478dd63` |
| Single attestation | 380 | `0x5a8b520f5d8098067e7ae3a385de7b9a8c6a1e6f97d3ee7d70c4d6620f0e4d16` |
| Singleton attestation set | 388 | `0x0bdb9e7b79bdbdc3b400677e8b068640e38a80ecc0eee67ca281ee8bbd2c5893` |
| Packed BurnIntent | 412 | `0xcff5ca655c547053771881b65a99f441c4fe589dab9a4f9940b8654ae22e91cf` |

These are **packed-byte hashes**, not the EIP-712 signing digest. Single attestation encoding is `ff6fb334 || uint256(1010) || uint32(340) || spec`. Set encoding adds `1e12db71 || uint32(1)`. Burn encoding is `070afbc2 || uint256(1120) || uint256(50) || uint32(340) || spec`. This fully defines every input byte and gives independent fixed expectations for later tests.

Future pure-module design: `encodeExpectedSpec(capturedIntent)`, `decodeBoundAttestation(bytes, expectedSpec, limits)`, and `validateAttester(recoveredAddress, pinnedReadEvidence)`, separating untrusted bytes, local structure proof and actual onchain authorization. Return immutable normalized data/digests with fixed errors; do not return a misleading `withdrawalSucceeded` from codec validation. Later signer tests can use an explicitly dummy local signer fixture and actual recovery, never a constant fake 65-byte signature accepted by shape alone.

Relevant upstream fixture authority is [Attestation.t.sol](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/test/lib/Attestation.t.sol#L75) and [TransferPayloadTestUtils](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/test/util/TransferPayloadTestUtils.sol#L49). The official tests encode valid structures and reject outer/inner truncation, wrong declared length, bad magic/version and trailing bytes. Proposed F11 additions:

- Preserve the fixed vector; change each spec field independently, including high address bytes, salt, source signer/caller, hook length, amount and both domains. Every change must fail exact binding.
- Accept both single and singleton-set wire forms; reject empty/multi-element sets, duplicate specs, bad count, wrong nested magic, odd/nonhex/oversized input and any extra byte. No general batch/hook feature.
- Correct EIP-191-over-payload-hash recovery; reject signing the raw payload, EIP-712 instead, unrelated signer, high-s/malformed signature, stale/false signer-membership evidence and mismatched chain/contract reads.
- Inclusive expiry equality at contract level; distinct burn/attestation heights; local minimum runway may be stricter. Reject maxUint256, overflow, minimum-delay failure, quote changed fields and cap breaches without silently extending authority.
- Exact value-plus-cap arithmetic, unknown/missing Arc fee, canonical atomic/decimal parsing, estimate canonical-address normalization, and exact post-burn event arithmetic. No fabricated zero fees or balance proof.
- UUID recovery validates nested attestation and all original intent summaries; raw hash lookup cannot be promoted into a recovered capability. Wrong UUID/hash, duplicate summaries, malformed record, missing/expired bytes, status contradiction and API outage stay unavailable/uncertain.
- Cancellation/unknown POST once-only latch, durable intent before dispatch, private capability nonreflection, fsync failure before mint, lost mint acknowledgement and no automatic retries or new salts. Test state transitions with bounded local fixtures only after source release.

## Minimal release choices

Proceed later with an offline codec/policy implementation and deposit/read-only work independently. For a mutating withdrawal runtime, first approve the explicit finite block-delta and fee/gas policy, choose facts-only non-resumability versus separately protected recovery capability, and verify the actual pinned deployment/attester/delay through bounded read-only preflight. Preserve two distinct results: destination mint independently confirmed, and source burn/fee independently reconciled; if only the former is observed, do not claim complete debit reconciliation.

No live acceptance is inferred from docs, the unsigned fixture, current source release, or installed SDK version. In particular, the initial-response-loss limitation remains visible rather than hidden behind a retry, synthetic success, or a different withdrawal protocol.
