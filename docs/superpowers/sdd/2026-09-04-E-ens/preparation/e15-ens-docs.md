> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E15 documentation preparation (not live evidence)

Prepared 2026-09-05 from the full E15 plan, README, runbook, and implemented ENS setup, state, runner, buyer, and hub interfaces. This is an internal draft only. Do not stage it or treat it as Task15 live completion. Root owns the final tracked documentation after E14 freezes.

The `document-generate` skill informed the reference-first structure and source-verification pass. Its publishing/commit steps do not apply to this bounded internal preparation task. No key, network, service, payment, registration, revocation, or expiry operation was performed for this draft.

## Proposed README addition

Place outside “Proven on Arc testnet”, with a runbook link:

> **Optional ENSv2 names (Sepolia beta):** configured namespaces publish a skill endpoint, payment address and chain. By-name buyers refuse a conflicting payment challenge before signing. A root-enabled hub observes name availability for discovery; owner-assisted registration, revocation, expiry and by-name settlement evidence is still pending. See [ENS namespaces](../../../../runbook.md#ens-namespaces-sepolia).

Do not use the plan's “Every listing has an ENSv2 name” or “the listing removes itself” sentence. Setup registers only the selected `--skills`; the feature is not enabled by ordinary publishing. Enabling `ARCADE_ENS_ROOT` on a hub is a namespace-wide discovery policy: it derives candidate names for valid listings, including names that have not been registered, and can hide those with successfully observed missing required records. There is no separate per-listing opt-in flag in the current watcher.

## Proposed runbook section

Rename/extend the existing deployment-preflight heading to `## ENS namespaces (Sepolia)` and preserve its dated public preflight result. The text below is ready for final editing; the explicitly pending E14 commands must not be published as completed instructions.

### Status and trust boundary

ENSv2 naming runs on Sepolia (`11155111`); paid jobs still settle separately on Arc testnet (`5042002`). Public deployment checks selected set A on 2026-09-05; these checks did not register an ARCADE name. The parent label `arcade` was a read-only availability proposal, not owner consent, a reservation, or a promise that it remains available.

**Live evidence is OWNER-pending:** no ARCADE parent/subname registration, daemon renewal, price-permission revocation, passive expiry, or by-name Arc settlement has been performed or proved in this build. Offline tests and local HTTP fixtures do not satisfy this gate. The owner must approve an exact label and supply the separate funded Sepolia owner/daemon accounts before setup; the payer and Arc facilitator also need separate authorization for a real paid demo.

Addresses are pinned in `config/ens/sepolia.json`. Runtime checks verify the actual Sepolia chain, root-to-`.eth` link, UniversalResolver bytecode and its `ROOT_REGISTRY` route. The configuration permits only a manifest-pinned UniversalResolver, not an arbitrary resolver address. ENSv2 remains beta; update the manifest and verify source/runtime compatibility if deployments change. Parent pointers/root administration are deliberately not irreversibly locked, so the namespace owner retains migration and grant authority. A scoped daemon is not a trustless substitute for the namespace administrator.

### Configuration reference

| Setting | Consumer and actual behavior |
| --- | --- |
| `ARCADE_ENS_ROOT` | Hub and stock buyer reader: normalized `.eth` second-level parent; unset/blank disables resolution and the hub observer. Runner: optional consistency check against its state, not its enable switch. |
| `ARCADE_ENS_STATE` | Setup/runner: absolute, normalized `.json` path. Default is `$HOME/.arcade/ens.json`. Contains validated public namespace addresses, selected skill names/prices and `ttlSeconds`, not wallet keys. Missing file is inert; unreadable/malformed state is a fixed diagnostic, never inferred expiry. Runtime IO is `packages/runner/src/ens-state.ts`. |
| `ARCADE_ENS_OWNER_KEY` | Setup and explicit owner demo/recovery operations only. Must derive the exact approved `--owner`/state owner. Never place it in runner/hub environments or a file. |
| `ARCADE_ENS_DAEMON_KEY` | Setup validates it against the approved public daemon; runner uses it for narrowly scoped Sepolia operations. Owner, seller and daemon addresses must be distinct. A missing key disables this runner's ENS writes. |
| `ARCADE_ENS_RPC` | HTTPS Sepolia JSON-RPC, without credentials/query/fragment. Setup/runner default to `https://ethereum-sepolia-rpc.publicnode.com`; stock buyer defaults to viem's Sepolia default URL. Set it explicitly for a reproducible demo. Chain is rechecked, not trusted from the URL. |
| `ARCADE_ENS_UNIVERSAL_RESOLVER` | Stock buyer/hub reader only: optional manifest-pinned resolver override. Default is the first pinned manifest resolver; routing must still match the selected deployment. Setup/runner use verified state/deployment addresses. |
| `ARCADE_ENS_CHECK_MS` | Hub observer interval after each completed bounded cycle; default `300000` (5min). Server requires an integer from `1000` through `2147483647` when ENS is enabled. `60000` is a useful demo interval, not an exact removal-time guarantee. |
| `ARCADE_ENS_SELLER_LABELS` | Hub only: optional JSON map from lowercase public seller address to lowercase DNS-safe seller label. Supply it when setup's `--seller-label` differs from the default `s` + first ten address hex digits. A label is not ownership proof. |
| `ARCADE_ENS_CCIP_ORIGINS` | Stock reader: optional comma-separated allowlist of up to four trusted HTTPS gateway origins. Default empty refuses unknown offchain gateways as unavailable. Redirects, literal IP/local hostnames and arbitrary cross-origin fallback are refused. DNS ownership of an allowlisted hostname remains operator trust. Do not claim generic unrestricted CCIP support. |
| `ARCADE_ENS_SETUP_JOURNAL` | Setup journal; default `<state path>.setup.json`. Private, request-bound and restart-aware. Includes the registration commitment secret, stable expiries and transaction checkpoints; do not publish this journal even though it contains no wallet key. |
| `ARCADE_ENS_JOURNAL` | Runner renewal/price journal; default `ens-pending.json` in the state file's directory. Must not equal the state path. Retains intent, exact known hash and confirmed state across restart. Never delete it or its crash-held lock merely to make a retry proceed. |

**TTL is a CLI/state setting, not a runtime environment override.** Use setup `--ttl 6h` (default) or an owner-approved `--ttl 15m` for a short demo; the resulting `ttlSeconds` is consumed by the runner. `ARCADE_ENS_TTL` is not read by the implemented runtime despite the parser's legacy diagnostic name. State accepts 60 seconds through one year. Setup `--seller-ttl` defaults to `90d` and must cover the skill TTL; parent registration duration is fixed at one year.

The runner checks liveness on its 15-second heartbeat but normally renews a served name once per quarter-TTL after its initial renewal. Six hours gives a 90-minute cadence: approximately **16 renewals/day/skill**, plus startup/restart and changed-price transactions, not four. Fifteen minutes gives roughly 3.75 minutes between renewals. Timing is best effort, not a gas-cost ceiling or guarantee of reaching the chain before expiry. Missing/unserved manifests are not renewed.

### How to prepare an owner-approved namespace

1. Confirm the exact parent label, public namespace-owner address, existing public Arc seller address, separate public Sepolia-daemon address, selected skill IDs, actual hub origin, and optional real web/MCP URLs. The three role addresses must differ. Do not invent an MCP endpoint or substitute an Arc wallet for a Sepolia role.
2. The owner provisions/funds the two Sepolia accounts. Canonical Keychain service names are **`arcade-ens-owner`** and **`arcade-ens-daemon`**, not the superseded `*-key` spelling. No new account/key/faucet/terms action is delegated by this runbook.
3. Run the keyless availability proposal with public placeholders replaced:

   Historical command (not current operator instructions):
   ```text
   ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com \
   bun --no-env-file run scripts/ens-setup.ts \
     --seller '<seller-public-address>' \
     --skills usdc-flow-check,counterparty-graph \
     --root-label '<proposed-label>' --dry-run
   ```

   This can propose one of the fallback labels and prints `ownerApprovalRequired: true`. It does not reserve/register a name or validate all later live setup prerequisites. Recheck and approve the exact result before a live command.
4. Ensure the seller is serving the selected public listings. Setup probes the listing's real `canaryInput`, demands a matching unsigned Arc-USDC 402 and independently verifies FeeSplitterV2 version2, seller, canonical USDC and fee500bps. `payTo` is the verified splitter, not necessarily the seller EOA. Optional `--agent-id` is published only after current Arc IdentityRegistry ownership is independently verified.
5. Owner-only completed setup template, **not executed and not authorized by this document**:

   Historical command (not current operator instructions):
   ```text
   env -i PATH="$PATH" /bin/bash --noprofile --norc -c '
     set +x
     set -euo pipefail
     cd <REPOSITORY_ROOT>
     ARCADE_ENS_OWNER_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-owner -w)"
     ARCADE_ENS_DAEMON_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-daemon -w)"
     export ARCADE_ENS_OWNER_KEY ARCADE_ENS_DAEMON_KEY
     export ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com
     export ARCADE_ENS_STATE="<owner-chosen-absolute-state-path>.json"
     exec bun --no-env-file run scripts/ens-setup.ts \
       --seller "<seller-public-address>" \
       --owner "<owner-public-address>" --daemon "<daemon-public-address>" \
       --skills usdc-flow-check,counterparty-graph \
       --root-label "<approved-label>" --confirm-root-label "<approved-label>" \
       --hub "<actual-hub-origin>" --web "<actual-web-origin>" --ttl 15m
   '
   ```

   Replace public placeholders only. The owner must approve this mutating sequence and gas separately before execution. It deploys/verifies registry/resolver proxies, registers the parent and selected subnames, sets records and grants. Parent pricing uses the beta MockUSDC token: setup can mint a shortfall, grants exactly the quoted allowance, and refuses a quote above its fixed `100000000` atomic ceiling. This is separate from real Arc job payments. It can perform multiple confirmed Sepolia transactions; do not describe it as a single transaction or zero-cost operation.
6. Start only the intended runner with the exact state and **daemon key only**, preserving its normal seller/config environment through the owner-approved launcher. Start the intended hub with the same `ARCADE_ENS_ROOT`, RPC, optional seller-label map and `ARCADE_ENS_CHECK_MS=60000`. Do not pass the namespace-owner key to either process. Expect a confirmed log of the form `[ens] confirmed renewal of <name> (<hash>)`, then verify the receipt and new expiry independently.

The setup journal fixes the original request, deployment, records, roles and chain-derived expiries. An existing namespace is not silently adopted. Changed arguments/records, expired names, conflicting grants, ambiguous prior broadcasts, or crash-held locks require reconciliation rather than a fresh journal or blind rerun. Confirmed transaction hashes are re-proved against exact transaction/receipt and resulting state; a broadcast response alone is not completion.

### How to read and buy by name

`GET /names/<name>` is an unsigned projection of the hardened ENS reader. Its success object contains `name`, `skillId`, `seller`, `endpoint`, `payTo`, `chain`, advisory `priceAtomic` (or null) and `expired:false`. Missing required records returns404 `ens_name_expired`; unavailable RPC/configuration returns503 `ens_resolution_unavailable`. The legacy missing-record error code is deliberately broader than proven expiry: the name may be expired, unregistered or misconfigured.

The reader first verifies onchain-only `UniversalResolver.findOwner(dnsName)` for the exact live name/hierarchy. Raw `getEnsText` is insufficient: ENSv2 may still route an expired leaf through an ancestor resolver containing old records. Successful exact ownership is followed by bounded text/optional trusted CCIP reads. Missing chain/payee/endpoint and malformed records are not accepted for signing.

The SDK accepts **either** `{name, input, account, ...}` **or** `{hubUrl, seller, skillId, input, account, ...}`, not both. An expected hub origin is required for a by-name lineage purchase. The resolved endpoint/payee/chain are bound to the actual-input payment challenge at the last pre-sign check; ENS price is advisory and does not replace the caller's cap. `arcade_call_skill` accepts exactly one of `name` or `skillId`, plus actual `input`; its session budget reserves uncertain signed calls instead of trusting a remote “not settled” response to refund the budget.

The existing `arcade-buy` CLI is **still ID-only**. Do not publish a fictional `arcade-buy <name>` command. The E14 owner by-name proof command will use the forthcoming public `callSkillPromise` wrapper, `ARCADE_DEMO_NAME`/`ARCADE_DEMO_HUB`, bounded fixed input/cap and the owner's approved buyer account. **Final runnable command and wrapper source anchor pending E14 freeze.** Do not use the plan's root `bun -e` import of undeclared `effect`.

The web confirmation card shows an ENS name only after its shared actual-input quote checks `/names/<name>` against the exact endpoint/seller/skill/payee/chain. A listing's advertised name alone is not proof. Relay payee/value checks occur before forwarding; result polling is bounded and cannot follow a foreign URL. A signed, unconfirmed outcome may remain redeemable: inspect settlement evidence before retrying, rather than claiming every timeout leaves funds untouched.

### How to run the three evidence beats and recover

**E14 final command/API block pending implementation freeze.** Require an explicit beat plus exact `--name`; mutating price-lock/all requires a separately matching `--confirm-name`. Never default to a mutating `all` command. Verify its final help and bounds before publishing commands.

- **Price-lock:** owner deliberately quiesces competing price writers; one exact daemon price write is confirmed, then owner revokes only that name's `arcade.priceAtomic` permission. The denial proof must decode the exact pinned authorization error for the intended resolver, daemon and resource. A timeout, transport error or arbitrary revert is not permission-denial proof. Do not claim a revert transaction was mined when the assertion is a public simulation.
- **Recovery after price-lock:** the demo intentionally leaves the price grant revoked and the public record changed. An owner must first restore the intended exact price and confirm readback, then explicitly regrant only `authorizeTextRoles(dnsNameOf(name), "arcade.priceAtomic", daemon, true)` on the configured resolver and verify the effective key-specific role. Never grant root/wildcard/text/payee authority. This is not a ready-to-run recovery command until the owner verifies address/name and the E14 interface. Rerunning setup is **not** general recovery: setup refuses a populated differing record, and its request binding includes the original price. A running runner may race the demo with its manifest price; do not hide the race or mutate its manifest automatically. Price revocation does not revoke renewal permission.
- **Tampered 402:** uses the real SDK against synthetic conflicting challenges and proves zero signatures/paid retries. Public ENS resolution may be real, but these synthetic refusals are not a live Arc paid-job or settlement proof.
- **Passive expiry:** capture a live baseline before the owner stops renewal; the script must not kill arbitrary runners. Prove the exact leaf's onchain expiry against actual Sepolia block time, retained registration lineage and absent current exact-name owner. A zero owner alone does not distinguish passive expiry from unregister/replacement. Capture first required-record absence and a successful catalogue response, not just a failed fetch. If disconnect removed the listing row, report “registration expired and catalogue absent; removal cause unproven.” Stronger watcher proof needs a still-matching detail200 with `ensExpired:true` and catalogue absence.
- **Revival:** the limited daemon's per-name `RENEW` can maintain an unexpired name but cannot revive an expired one. Only an explicitly authorized owner/root-RENEW operation can do that. Do not broaden the daemon or silently register a new identity. Record the owner revival transaction and fresh hierarchy/resolution checks before claiming service is restored. Final explicit owner command pending E14/owner recovery interface.
- **Unregister:** `skillRegistry.unregister(labelId(skillId))` is a separate authorized onchain operation that invalidates the registration immediately, not passive expiry or the hub's canary `delisted` flag. Do not perform it merely to manufacture an expiry result. Deliberate unregister/re-registration changes registration state; preserve this distinction in evidence. No unregister/re-register convenience CLI is currently provided.

### Public evidence ledger (all live fields pending)

| Evidence | What must be recorded; do not substitute an offline assertion |
| --- | --- |
| Deployment | Observed UTC time/block, actual chain11155111, selected manifest set and verified live root/UR links. Preserve the existing dated keyless preflight separately. |
| Parent | Exact owner-approved name, owner address, successful registration hash and checked Sepolia explorer link; only then add a name-specific ENS app link. No placeholder presented as a registered name. |
| Namespace | SellerRegistry, SkillRegistry and resolver addresses with factory/proxy provenance; seller and selected skill registration transactions; owner/expiry/pointers/records/grants readbacks. |
| Renewal | Confirmed hash, exact daemon/registry/name, previous/new expiry and observed chain block. A heartbeat log without transaction/state proof is not sufficient. |
| By-name paid call | Exact name and resolved authority, real correlated job ID/receipt, successful Arc transaction with independently checked USDC/splitter events and amounts. Link the real Arc explorer transaction. Do not call a mere signature or HTTP response settlement. |
| Revocation | Price before/after, daemon-write hash, owner-revocation hash, exact decoded public-simulation denial and unchanged non-price records. Recovery status remains explicit. |
| Expiry | Initially live token/owner/resource/expiry; owner stop time; final chain time/state; first guarded required-record absence; first successful catalogue absence; detail200/404 distinction and bounded causal conclusion. Passive expiry advances the derived resource's low32-bit version by one while retaining token/latestOwner; E14 must validate this, not require resource equality. |
| Recovery/cleanup | Any owner price restoration/regrant or revival hashes/readbacks; still-pending journal operations; all owned processes stopped or intentionally retained. Publish only the public evidence subset, never private journals, raw keys, headers, job-store payloads or RPC credentials. |

## Exact implementation anchors for root's final edit

Paths below are relative to this worktree; line numbers were checked during preparation and may move after E14.

- Scope/defaults/records/roles: `packages/core/src/ens.ts:7` (keys), `:60` (seller-label default), `:78` (role bitmaps), `:108` (pure TTL parser only), `:282` (record projection), `:288` (state interfaces), `:305` (strict state/TTL1year/skills1–64 validation).
- Setup CLI and consent: `scripts/ens-setup.ts:32` (flag parser), `:61` (keyless fallback proposal), `:92` (parent commit/register), `:255` (proxy entrypoints), `:273` (parent wiring), `:296` (seller registration), `:338` (help/main). `scripts/ens-setup-runtime.ts:15` (distinct explicit roles), `:20` (duration/fee ceiling), `:37` (complete verified stages), `:57` (public preparation before key access), `:67` (private journal), `:74` (exact request/price binding).
- Actual unpaid V2 preparation and exact grants: `scripts/ens-setup-skills.ts:18` (bounded public JSON), `:47` (splitter reads), `:64` (actual listing/canaryInput402), `:93` (resolver resource), `:106` (registration), `:156` (narrow grants), `:180` (refuse populated differing records), `:186` (renew grant), `:191` (price grant). `scripts/ens-setup-grants.bun.test.ts:41` tests real role/key bytes and refusals; `scripts/ens-setup-runtime.bun.test.ts:25` tests publication only after all verified stages.
- State/journal safety: `packages/runner/src/ens-state.ts:13` (path), `:19` (missing vs malformed), `:36` (private atomic/fsynced state). `packages/runner/src/ens-journal.ts:21` (separate journal path). `scripts/ens-setup-driver.ts:33` (private commitment secret), `:74` (binding), `:133` (session); `scripts/ens-setup-driver.bun.test.ts:53`, `:91`, `:113` (private durable restart proof/no resend).
- Runner lifecycle/cadence/expiry: `packages/runner/src/daemon.ts:45` (ticker factory), `:60` (bounded state), `:69` (root/key provenance), `:178` (one connected timer); `packages/runner/src/ens.ts:15` (fraction4), `:22` (owner revival/error honesty), `:40` (singleflight cadence), `:180` (pending reconciliation), `:197` (expiry/roles). `packages/runner/test/ens.test.ts:107` verifies no expired-name send; `packages/runner/test/ens-daemon.test.ts` covers absence, invalid state, real socket lifecycle and close guards.
- Buyer authority and offchain bounds: `packages/buyer/src/ens-policy.ts:18` (missing record not proof), `:26` (typed unavailable), `:67` (root gate), `:75` (endpoint parser), `:104` (required records), `:128` (payee+chain refusal), `:150` (gateway origins), `:197` (stock reader), `:256` (actual chain/root/proxy), `:267` (exact onchain owner gate). SDK union/pre-sign: `packages/buyer/src/index.ts:20`, `:63`, `:105`; MCP XOR/budget: `packages/buyer/src/mcp.ts:362`, `:654`, `:666`. CLI remains ID-only: `packages/buyer/src/cli.ts:23`, `:58`.
- Hub root-wide candidate names and observational filtering: `apps/hub/src/ens.ts:51` (label map), `:92` (root), `:104` (candidate name), `:147` (missing vs unavailable), `:181` (bounded scheduler), `:211` (public projection). `apps/hub/src/server.ts:380` (env/interval), `:884` (catalogue filter), `:891` (names route), `:940` (detail), `:1297` (all-listing observer). Actual HTTP behavior: `apps/hub/test/ens-http.test.ts:43` onwards.
- E13 quote/card/relay: `apps/web/src/lib/hub.ts`, `apps/web/src/routes/api.quote.ts`, `apps/web/src/routes/api.settle.ts`, `apps/web/src/components/confirm.tsx`, `apps/web/test/quote-ens.test.ts`, `apps/web/test/quote-routes.test.ts`, `apps/web/test/confirm-ens.test.tsx` (final root-owned commit may move lines; no new edits here).
- Existing dated public evidence: `docs/runbook.md:637` onwards; manifest `config/ens/sepolia.json:1`. OWNER prerequisites/corrected key names/revival/liveness: **main** `<REPOSITORY_ROOT>[private owner-action ledger omitted]:15` through `:18` (handoff is not present in this worktree).
- Primary-source proof details already checked by root: `internal/task-preparation/e14-ens-demo.md` “Pinned authorization source verification” and “Root independent source correction” link the exact `contracts-v2@97a57293f3b4279d94b571e678edb53ce62638f4` PermissionedRegistry, PermissionedResolver, LibLabel and access-control sources. No new web claims were fetched for this preparation.

## Final integration checklist (root)

- [ ] Wait for E14 source/API freeze. Replace pending by-name/beat/recovery command paragraphs using its actual exports/flags; verify imports through the real root subprocess, never undeclared `effect`.
- [ ] Preserve explicit OWNER-pending status and absence of live transaction IDs. Do not mark the E15 live gate complete on offline tests/builds.
- [ ] Review the owner consuming-command template against final setup args and approved public role/label/path values. Keep keys out of flags, files, stdout, tracing and child services; no automatic provisioning.
- [ ] Clarify whether the chosen demo hub may gate all listings under its root; do not enable it on unrelated production listings to stage the demo.
- [ ] Include intentional price/grant side effects and explicit owner recovery, no blind setup rerun or daemon root-role escalation.
- [ ] Keep passive expiry, unregister, unavailable RPC and runner-disconnect catalogue removal distinct.
- [ ] Keep six-hour cadence arithmetic and actual CLI/state TTL. Do not document `ARCADE_ENS_TTL` as implemented.
- [ ] Add only verified live links after the owner-assisted sequence. Do not upload setup journals or raw job stores.
- [ ] Root performs tracked README/runbook edits and final docs/source consistency gates; this ignored preparation file is not staged.
