> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E4 implementation report

## Scope and status

Implemented and frozen for root review: `scripts/ens-setup.ts` and new `scripts/ens-setup-registry.bun.test.ts`. No core, runner, configuration, wallet, network, git/index, or live-chain changes. Existing E3 public dry-run and fail-closed live entry remain unchanged.

The explicit context/driver adaptation was approved by root. Exports are `deployUserRegistry`, `deployResolver`, `wireParent`, and `registerSeller`. `RegistryDriver` extends the existing parent driver with fresh-deploy simulation, code lookup, and exact-hash receipt lookup. The driver owns the configured signer and returns a transaction hash only after a successful verified receipt; there are no uncertain-write retries. Durable checkpoints retain optional public recovery metadata, with distinct reverse-mount step names for each child address.

## Safety and compatibility

- Deployment data must exactly equal a pinned manifest entry. Each stage checks actual Sepolia, and every broadcast checks it again. Reads, simulation, code lookup, receipt lookup, and checkpoints have five-second deadlines; sends have a ninety-second uncertainty deadline.
- UserRegistry and PermissionedResolver initializers use the configured owner and exact `ALL_ROLES`, with the resolver's explicit empty initial-controller list. Salts use existing canonical core helpers.
- Fresh proxies are simulated only before deployment and must not already have code. A known recovery proxy is never simulated or guessed from a failed send. Reuse checks bytecode, owner-bound outer salt, immutable factory/implementation provenance, the factory's current implementation verification, and exact initializer owner root roles.
- The exact requested factory receipt must be successful and have matching transaction hash, sender and destination. Present log provenance must agree; removed or malformed removal markers reject. Exactly one factory `ProxyDeployed` event must exist, and every sender/proxy/salt/implementation field must match. A second contradictory event is not ignored.
- Parent ownership is checked before mount writes. Forward and reverse pointers must either be empty or already exactly correct; conflicting existing mounts refuse. Every write has a direct readback. No root-role revocation exists.
- Seller setup requires an already owned and bidirectionally mounted parent. New names must be genuinely unused, not reserved or expired historical identities. Existing seller owner, latest owner, absolute expiry, roles and all pointers must exactly match. Seller expiry is an explicit stable value for the outer durable journal, not recomputed from a rerun clock.
- Expired identities are refused, including `getOwner == 0` with retained `latestOwner`. Official pinned semantics require root RENEW for expired revival; this implementation does not silently re-register or revive.
- The optional known skill-registry coordinate supports recovery after proxy deployment and before name registration. Exact reruns produce no additional writes.
- Driver failures are mapped to bounded, fixed messages, never embedded RPC/provider errors or credentials.

Official interface compatibility followed contracts-v2 commit `97a57293f3b4279d94b571e678edb53ce62638f4`: `getResolver(string)`, tuple `getParent()`, proxy provenance views, `getState` named tuple with status AVAILABLE=0 / RESERVED=1 / REGISTERED=2, and resource-translated role lookup. Local view ABI avoids overlapping E5 core changes.

## TDD evidence

1. Genuine initial Red: missing `registerSeller` export before implementation.
2. Initial Green: 12 new E4 tests plus 15 preserved E3 tests, 27/27 passing.
3. Genuine additional Red: malformed `removed` marker was accepted.
4. Root-review regressions captured together before fixes: malformed removal marker, contradictory second deployment event, and duplicate reverse-mount checkpoint step; all three failed for the intended reasons.
5. Final focused command: `bun test scripts/ens-setup-registry.bun.test.ts scripts/ens-setup.bun.test.ts` — **30 pass, 0 fail, 149 assertions** (15 E4 + 15 E3).
6. `git diff --check -- scripts/ens-setup.ts scripts/ens-setup-registry.bun.test.ts` — clean.
7. `bunx tsc --noEmit` — no errors in E4-owned files; currently blocked by parallel root E5 `scripts/ens-setup-skills.bun.test.ts` importing its not-yet-created module and its resulting implicit-any errors. Root will run the full gate when E5 is green.

All proof here is offline injected-driver test evidence, not a deployment, a transaction, an ownership claim on a live network, or evidence of funded wallets.
