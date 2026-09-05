> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E14 preparation — no live authority or collected implementation yet

Read the complete E Task14/15 and self-review, current setup public client, durable owner session, runner writer/state IO, buyer policy/SDK, and hub integration. `ts-testing` directs behavioral Reds first, real codecs/SDK with offline transport, and no live chain in tests. Context7 was unavailable in the enabled tool catalog; prefer pinned source and installed codecs. No keys, RPC calls, wallet creation, source edits, or transactions occurred during preparation.

E12 helper is frozen (38 tests); root's final four HTTP tests reviewed clean. Root coordinates its gate/commit before E14 collection is allowed.

## Approved scope and compatibility

- Planned source `scripts/ens-demo.ts`, import-safe until `import.meta.main`, plus focused `.bun.test.ts` coverage. No side-effectful default `all`: require a valid explicit beat, exact selected name, and a separate exact-name write consent for price-lock/all.
- Root approved additive typed `callSkillPromise` and `resolveEnsListingPromise` buyer public wrappers plus wrapper tests. Use `Effect.either` within the buyer package and throw the original typed Left, never a FiberFailure string. Scripts have no direct `effect` dependency; no undeclared resolution/node_modules reach-through.
- Read state through runner `ens-state.ts`, not the obsolete core IO export. Validate selected name against one exact state skill before public reads or key access. Never silently choose a new name/first skill for a destructive demo.
- Help and argument refusals are key-free and network-free. Tampered-402 and expiry never read owner/daemon/buyer keys. Price-lock retrieves only explicitly supplied owner/daemon env values after public validation, never keychain or owner HOME/config mutation.
- Use bounded `setupPublicClient` (actual Sepolia chain checks; CCIP disabled), hardened `sepoliaEnsReader` with explicit state root/UR/RPC, `viemEnsWriter` for the one daemon price write, and `openSetupSession` with a separate exact-request-bound demo owner journal for the one revoke call. Never modify setup/daemon journals silently or retry an uncertain send.

## Price-lock evidence, not blanket rejection

1. Validate complete decoded state, exact name, separate public owner/seller/daemon, deployment manifest, actual RPC chain11155111, factory/proxy implementation, current seller ownership, leaf expiry > current chain timestamp, and exact resolver routing. Resolve complete live records and compare endpoint seller/skill, chain and stored baseline price. Check no daemon root/wildcard/payTo authority.
2. Consent binds exact name/resolver/daemon and deterministic price change (`state.priceAtomic + 1000`, canonical uint256 with overflow refusal), plus irreversible-for-this-run loss of the price grant. Preflight current direct text and effective price role; do not mutate state/manifests or silently grant anything.
3. Execute exactly one price write through the existing daemon writer and its separately selected durable journal. Returned hash requires independent receipt/transaction correlation (hash/from/to/calldata/status/block) and exact direct + hardened name readback. Re-prove payTo/chain/endpoint unchanged.
4. Prove the daemon cannot set payTo using bounded direct public simulation with the exact target/account/calldata. Accept only the pinned contract's decoded authorization error and matching arguments. RPC timeout, wrong chain, malformed body, generic error, empty revert, unrelated contract revert, or a string containing “revert” are NOT proof. Exact verified ABI: `EACUnauthorizedAccountRoles(uint256 resource,uint256 roleBitmap,address account)`, selector `0x4b27a133`; see source note below.
5. Owner revokes only this name/key/daemon grant with exact checkpoint metadata and call bytes before send. Driver account must match state.owner; no attempts to reuse it as a daemon sender. Receipt/transaction re-proved, effective scoped role absent afterward, root/name wildcard roles remain absent. Simulate denied price after revoke; prove payTo still denied and all non-price records unchanged.
6. Print only public name, addresses, exact before/after price, hashes, decoded fixed denial identifier, explorer links and restoration warning. No private JSON/cause/provider URL. Failure after broadcast says reconcile retained journal/hash; NEVER auto-resend or auto-restore.

Recovery is explicit owner work: restore intended price, confirm readback, then separately regrant only that daemon/name/price permission. Rerunning current setup is NOT an automatic fix: its exact records check rejects the deliberately bumped record. A running daemon may race and restore its manifest price between demo reads; fail honestly rather than killing it or mutating configuration. Owner should quiesce relevant renewal/price writers intentionally. A revoked price grant does not imply revoked renewal rights.

## Tampered-402 beat is actual SDK, synthetic challenge, zero signing

- Resolve real current public name (or injected offline reader in tests), exact seller/skill/Arc-USDC authority; no wallet key.
- Use a sentinel account with signing methods that increment and immediately throw; it cannot produce a signature. Call real `callSkillPromise` with fully injected HTTP returning one synthetic malformed-payee or wrong-chain402 for the resolved endpoint. Do not forward requests to a hub. Input is bounded fixed demo data; no private seller inputs.
- Each case must return the original typed `RpcFailure` method `beforeSign` carrying `ens_payto_mismatch`, exactly one unsigned probe and zero signature attempts/paid retries/polls. No success if SDK throws elsewhere or hangs. Include honest `ensRefusal` pass as a separate pure policy check, not a fabricated successful paid purchase.
- Output explicitly calls these synthetic challenge assertions against real resolved authority. There is no transaction or Arc settlement evidence to link for these refusals.

## Expiry observation, with causal honesty

- Never kill/restart any runner; do not revoke renewal permission as a workaround. Print that owner may deliberately stop renewal. Capture an initially registered leaf with current owner==state.seller, valid resolver/proxy/current registration token/resource and expiry > successful actual chain timestamp, hardened full name resolution and exact seller/skill endpoint. Capture matching seller listing initially present; a foreign seller's same skill ID never counts.
- Finite validated timeout <=25min and bounded probe interval; tests use fake clock/injected finite samples. Poll successful actual block timestamp and exact leaf state/expiry/getOwner, hardened resolution, and bounded catalog + detail HTTP. Retry only these read-only observations. Capture safe timestamps/blocks, never infer from local clock alone.
- Expiry proof requires actual chain timestamp >= observed current expiry and owner zero with same registered lineage/latestOwner (not somebody else's replacement registration), plus hardened required-record absence. Explicitly reject unchanged RPC errors, malformed values, foreign chain, zero-name-before-start, unregister-before-expiry, owner replacement or missing baseline. An outage is unavailable, never expiry. Parent/seller expiry earlier than the leaf must not be mislabeled leaf expiry.
- Catalog absence requires exact skill ID + seller comparison and successful bounded catalog response. Detail404 is compatible with runner disconnect removing its row independently. In that case report **registration expired + catalog absent; cause of catalog removal unproven**, not “ENS watcher removed it.” Stronger watcher evidence requires detail200 matching seller/name with `ensExpired:true` and catalog absence. Do not claim stronger causality than observed.
- Scoped daemon RENEW cannot revive an expired name. Revival is explicit owner root-RENEW work; no silent re-registration or automatic broadening. E15 live remains OWNER-blocked.

## High-value true Reds planned

- Help/import/invalid beat/duplicate flags/wrong consent/unknown name perform zero state/network/key reads as appropriate; price overflow and role collisions refuse prewrite.
- Promise wrappers preserve typed Left identity (including EnsNameExpired/RpcFailure) and success shape using actual buyer SDK with loopback-free HTTP seam.
- Real SDK synthetic payee/network refusals prove signer count0, probe1, retry0; wrong failure tag and unexpected success fail evidence.
- Price proof rejects generic simulation outage/unknown revert/wrong decoded resource/account, successful simulation, receipt hash/status/from/to/calldata mismatch, failed direct/hardened readback, altered payTo/chain/endpoint, uncertain send and duplicate rerun.
- Owner checkpoint exact-name revoke precedes one send; daemon write precedes owner revoke; no implicit recovery broadens grants or writes owner state.
- Expiry rejects initial already-missing name, RPC outage->null, local-time-only expiry, premature unregister, changed registration/owner, foreign-seller catalog rows masquerading as selected identity, malformed/redirected/oversized HTTP, timeout and cancellation. Separate truthful detail404 outcome from strongest detail200 `ensExpired:true`.
- Actual import/CLI subprocess assertions catch root dependency failures; raw provider credential markers never appear in errors/evidence. No test obtains a real key or broadcasts to a live network.

## Pinned authorization source verification

Read via agent-reach's GitHub CLI backend; initial sandbox network refusal was followed by approved read-only `gh api`. Fully read the four official files at `97a57293f3b4279d94b571e678edb53ce62638f4`:

- [PermissionedResolver](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/resolver/PermissionedResolver.sol): `setText` uses `onlyPartRoles`. When specific-node/key and wildcard-node/key roles are absent, it calls `_checkRoles` with the **widest name resource**, `resource(node,0)`. Thus the denial's resource is NOT the price/payTo key resource.
- [EnhancedAccessControl](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/access-control/EnhancedAccessControl.sol): `_checkRoles` emits `EACUnauthorizedAccountRoles(resource,roleBitmap,account)` only when effective name/root roles fail.
- [IEnhancedAccessControl](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/access-control/interfaces/IEnhancedAccessControl.sol): canonical error signature and selector `0x4b27a133`.
- [PermissionedResolverLib](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/resolver/libraries/PermissionedResolverLib.sol): SET_TEXT=16, resource=`uint256(keccak256(abi.encode(node,part)))` except both zero maps to0, and text key part=`keccak256(bytes(key))`.

Expected successful denial evidence is exactly selector+decoded error with resource=`resolverResource(namehash(selected.name),undefined)`, roleBitmap=`16n`, account=the selected daemon, from a bounded `simulateContract` of that exact resolver/node/key/value/account on freshly verified Sepolia. Independent local viem selector+encode/decode read-only check returned `0x4b27a133` and the original three fields. No live chain was contacted.
## Root independent source correction — passive expiry resource (09:35 IST)

Pinned PermissionedRegistry `_constructResource` lines585–595 returns the NEXT EAC version when expired, even without a storage write. Therefore `getState.resource` must NOT remain equal across passive expiry. Expected expired value replaces low32bits of baseline resource with baseline version+1 (refuse uint32 overflow); `tokenId` and `latestOwner` remain unchanged. LibLabel.withVersion is `anyId ^ uint32(anyId) ^ versionId`. Unregister burns/increments token/eac and sets expiry; re-registration also regenerates identity, unlike passive expiry. Root read complete official [PermissionedRegistry](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/registry/PermissionedRegistry.sol) and [LibLabel](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/utils/LibLabel.sol); sent correction before implementation. No live RPC/writes.
