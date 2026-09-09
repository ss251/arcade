> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# ENS live public prerequisite check — 2026-09-05

Read-only check for exactly the user-approved label `arcade`, owner and daemon below. No fallback label was queried or selected. No wallet key/config/journal was opened, no nonce/gas preparation was requested, and no setup command or transaction was sent. B13 remains frozen.

## Fresh public observations

Observed 2026-09-05 **04:59:10.153–04:59:12.520 UTC** using the existing `setupPublicClient("https://ethereum-sepolia-rpc.publicnode.com")`, core `loadEnsDeployments()` set A and pinned core ABIs. The client has retry count 0, 5-second RPC timeout/body deadline, 262144-byte maximum response, redirect refusal, omitted credentials and disabled CCIP reads. The process environment was explicitly empty apart from executable PATH; Bun used `--no-env-file`.

All five registry/balance reads used one block, then the same block hash/timestamp was re-read and the chain ID checked again. No broad history scan was used.

| Public fact | Observed value |
|---|---|
| Chain ID, before and after | `11155111` (Sepolia) |
| Block | `11638194` |
| Block hash | `0x0610122d94ebb8dd99e59f0cbe1bcb401b85c15889e828fc02e79cf9a8e22a73` |
| Block timestamp | `1788584340`, 2026-09-05 04:59:00 UTC |
| Block re-read | Same hash and timestamp |
| Universal Resolver | `0x6d80f2172cfdec5730fe683860c33d26fc42e6f1` |
| Its actual `ROOT_REGISTRY()` | `0x8115186E8f2E0B0281e86ab91f0f48Ba90364354` — matches set A |
| A root `getSubregistry("eth")` | `0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2` — matches set A |
| A registrar | `0xa88553f454b77203b0d036a05c894d555eaaa2cc` |
| Registrar `isAvailable("arcade")` | `true` |
| Owner | `0x8260C32f90593f1B3B3bcba0Ec1D40ff8C189469` |
| Owner balance | `699977751775519000` wei = `0.699977751775519` ETH |
| Daemon | `0x88797d820C111205eCd993BE850D4f35687909e3` |
| Daemon balance | `300000000000000000` wei = `0.3` ETH |

These are public state observations at one block, not a guarantee of future availability, fee sufficiency, setup success, or permission to broaden the approved workflow. Availability and authority must be rechecked by the production write path immediately before its actions. The first sandboxed attempt at 04:58:34 returned the generic unavailable/inconsistent result; after approved network access, the bounded actual RPC query succeeded. No readiness was inferred from the failed attempt.

## Optional E14 role lookup concern: cleared by pinned source

Read the complete official [PermissionedRegistry.sol](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/registry/PermissionedRegistry.sol) and directly imported [EnhancedAccessControl.sol](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/access-control/EnhancedAccessControl.sol) through GitHub's read-only API via the agent-reach GitHub route.

`PermissionedRegistry.roles(uint256 anyId,address account)` explicitly returns `super.roles(getResource(anyId),account)`. `getResource` uses `_entry(anyId)`, whose storage lookup zeroes the version bits, and `_constructResource`, which restores the entry's current permission version. `hasRoles`, `grantRoles` and `revokeRoles` also normalize through `getResource`.

Therefore the current E14 `roles(labelId(skill.label),daemon)` reads the current resource even after re-registration; using a label ID is not a stale permission scope. The snapshot's `getState.resource` is not required solely to correct this lookup. Root resource 0 is explicitly preserved. Passive expiry selects the next resource version; owner root-RENEW revival is still required, as already documented in the frozen demo.

The access-control base `roles` returns `_getRoles` rather than the OR-with-root `_effectiveRoles`. The registry `_getRoles` additionally includes a currently approved token owner's role bitmap; this is conservative for the demo's exact narrow-role check. The demo separately rejects daemon root roles. No source edit is required for this suspected issue.

Only this ignored report was written. No source files or git state were changed.

## Independent rebase audit — original E14 `2ba1d8c` → `ad4e022`

Read-only verification after E was rebased onto main `cc5a683`; no competing tests were run during root gate session 74527.

`git range-diff ce599d8..2ba1d8c cc5a683..ad4e022` reports 14 of 15 E patches identical. The sole changed patch is E2 (`f1214ba` → `c384ab2`), exclusively its runbook insertion context and one separating blank line: the ENS deployment-preflight paragraph now follows the newly merged D13 live evidence. Its ENS source and configuration content is unchanged. E14 maps `2ba1d8c` → `ad4e022` with an identical patch. No E source/test loss or altered behavior was found.

Compared the current runbook and rebased committed runbook against the complete `cc5a683:docs/runbook.md` byte prefix (trimmed only at EOF): **both preserve all 44,061 bytes exactly**. This independently confirms that A9's 04:38:07 live lineage evidence, C10's 04:40:08 delisting/recovery evidence and D13's 04:42:24 six-role proof—including exact hashes, amounts, caveats, cleanup and retained-approval disclosure—were not lost. The rebased commit merely appends ENS's dated public preflight; the working E15 draft extends that append.

Read the entire unstaged README/runbook E15 delta. It continues to distinguish unproved live registration/renewal/revocation/expiry/by-name settlement from offline or synthetic SDK tests, warns that simulated denial is not a mined revert, and treats catalog absence after runner disconnection as causally unproven. No draft ENS live proof is fabricated. The actual label/funding approvals now exist, but execution evidence remains pending; the generic `OWNER-pending` wording should be refined when recording the authorized live result.

Nonblocking pre-existing documentation staleness was reported to root (not introduced by this rebase and not edited here): README line 190 still says live lineage proof is pending, and runbook line 109 still calls A9 owner-blocked, despite the retained earlier A9 Live PASS. README line 131 also retains its older no-lineage implementation description before the later correction. These do not undermine the exact retained proof paragraphs, but should be reconciled by the documentation owner.

Verdict: **CLEAN for source preservation and honest E15 evidence scope**. Only this ignored report was updated; no source, keys, live services, B13 files or git state were changed.
