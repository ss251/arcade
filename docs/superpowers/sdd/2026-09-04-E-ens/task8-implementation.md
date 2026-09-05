> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task E8 — buyer ENS policy

Status: implemented and frozen for independent review; no commits or staging. No keys, live RPC, payments, or account creation used.

Owned files: `packages/buyer/src/ens-policy.ts`, `packages/buyer/test/ens-policy.test.ts` only. Core/setup files are root-owned and were not edited.

## TDD and checks

- 06:53:16: genuine initial Red, policy module absent.
- 06:57:09: 70/71 passed; remaining failure was a test comparing Effect's non-enumerable Either tag with a plain object. Assertion corrected to inspect tag plus exact listing, retaining the missing-price assertion.
- 06:58:51: 90/91 passed after stock-viem CCIP tests; canonical POST sender was checksum-cased. Request now consistently lowercases the public sender for both GET and POST. Typecheck then caught three required `override` modifiers and a fixture index signature, all corrected.
- 06:59:40: 91/91 focused Green plus root `tsc --noEmit` and diff check.
- 07:00:43: three additional genuine protocol Reds: wrong JSON-RPC ID, wrong version, and simultaneous result/error all incorrectly produced successful listings through stock viem. Wrapper now rejects these before accepting an RPC result.
- 07:01:00: final 104/104 focused Green (94 ENS-policy + 10 existing payment tests), then `bunx tsc --noEmit` and `git diff --check` exited 0.

The ts-testing skill supplied TDD and behavior-first testing. Context7 discovery returned no available tool; installed viem `getEnsText`, HTTP transport/response reader, CCIP request, and ABI sources were read as the primary-source fallback. Real viem RPC encoding, ENS decoding, sender validation, and on-chain callback requests are exercised with isolated fetch responses rather than mocked policy internals.

## Necessary plan adaptations

- Required exports are retained. `EnsResolutionUnavailable` extends the resolver's error union with `ens_resolution_unavailable`; RPC outages, unsafe configuration, malformed values and denied offchain origins are not falsely reported as expired names. Existing `EnsNameExpired` code is retained only for successfully empty required records, with explicitly non-conclusive wording.
- Required `arcade.chain` is never replaced with a fail-open empty string. Both ENS and 402 payee/chain must be valid and equal; payees are nonzero 20-byte addresses and chain IDs are canonical safe positive eip155 references.
- Atomic price is optional but, when present, must be canonical decimal uint256. Parsing uses bigint directly and preserves amounts beyond the safe Number range.
- Paid endpoints are exact HTTPS paid paths (explicit HTTP loopback permitted), without credentials, queries/fragments, escaped or normalized-away path segments. Route seller is deliberately independent of the FeeSplitter payee.
- Name/root validation reuses core helpers. No default root is invented; unset `ARCADE_ENS_ROOT` makes the factory inert. Optional env/fetch/deadline seams do not change default call signatures or access keys.
- Stock viem runs with `strict:true`, actual Sepolia chain and pinned root-to-eth deployment discovery, pinned universal resolver plus code-presence check, no resolver override, read-only RPC methods, no transport retries, correlated JSON-RPC response envelopes, and an overall 10-second session deadline covering headers and body. Concurrent record reads share one preflight; later sessions recheck it. Responses are capped at 128 KiB; published text at 4 KiB. Raw provider diagnostics are discarded.
- CCIP is supported only for explicit comma-separated HTTPS origins in `ARCADE_ENS_CCIP_ORIGINS` (empty by default; max four). Literal IP/local origins and credentialled URLs are refused. Resolver URL lists are capped at three, gateway calls at four and RPC calls at 24 per session. One trusted URL is selected; no failure fallback crosses origins. Redirects are refused, full bodies share the deadline/size bounds, hex replies are validated, and stock viem performs sender and on-chain callback validation. DNS control of explicitly allowlisted hostnames remains an operator trust assumption; this is not generic permission to contact every resolver-provided gateway. Unknown origins produce unavailable, not expiry.

## Integration handoff

Future E9/E12 consumers must handle `EnsNameExpired | EnsResolutionUnavailable`, and must apply `ensRefusal` immediately before any signature. This task does not yet modify `callSkill`, `fetchWithPayment`, MCP, hub routes or setup scripts. Offline tests establish policy behavior, not live ENS availability or DNS ownership.
## Root independent review followup

Root reviewed implementation and real RPC/CCIP fixtures, then checked official pinned UniversalResolverV2.sol through GitHub API (web raw cache miss). It exposes ROOT_REGISTRY(); both candidate manifests share an upgradable UR proxy, so root→eth pluscodealonewasinsufficientroutingproof. Genuine1Red07:15:38 accepted a valid record served by a mismatchedroot; added onchain-only ROOT_REGISTRY readback before anytext/CCIP,95policyGreen07:15:39. Per-callccipRead isnot a readContract option ininstalledviem; sessionroutingVerified gate insteadrejectsCCIPduringallpreflight. CurrentpublickeylessRPC01:43:49.695ZservedRoot0x8115186E8f2E0B0281e86ab91f0f48Ba90364354 matchesA. No keys/writes. This readerfailsunavailableifsharedURmigratestoadifferentroot whilefirstconfiguredrootstilllive; doesnotaccept ambiguouscrossdeploymentdata orcallitexpired. FurtherfinalfullgatesprecedeorderedE8commit.
### Root review — exact registration gate (2026-09-05 07:57 IST)

Official pinned UniversalResolverV2/LibRegistry proves ancestor wildcard resolution survives expired leaves. Added two genuine Reds (stale text accepted, failed owner lookup accepted) at07:56:57; 97Green +tsc at07:57:33. Per-session shared UR.findOwner(dnsName) exact-live-name guard runs on a separate ccipRead:false client before any text resolution/CCIP. Zero owner returns missing-record refusal; failed lookup is unavailable, not proof of expiry. Existing text CCIP bounds and callback verification remain intact. Future hub/demo must consume guarded reader, not infer liveness from raw stock getEnsText.
