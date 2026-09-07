# Plan J — Arc-native settlement: Circle dialect, agent-wallet buyer, delegate funding, ERC-8183 escrow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Single-threaded while the machine is shared (owner rule 2026-09-06 13:28 IST): no subagent fan-out, one full gate per commit.

**Goal:** Make every ARCADE listing payable and inspectable by Circle's own Agent Stack unchanged (dual-accept 402, registry-shaped discovery, Circle CLI agent wallet as buyer), let a buyer agent spend its owner's cross-chain USDC onto Arc through Unified Balance delegation, and add an ERC-8183 escrow rail on ARCADE's own Arc testnet deployment with the hub as on-chain evaluator and a hook that commits the receipt tree. Spec: `docs/superpowers/specs/2026-09-06-arc-native-settlement-design.md` (read it first; every design decision and its evidence lives there).

**Architecture:** Three seams already exist and are reused: `Rail`/`Rails` (`packages/payments/src/rail.ts:73-95`, `apps/hub/src/rails.ts`), the pipeline's single settle point (`apps/hub/src/pipeline.ts:243-275`), and the runner socket. J1 changes what a 402 advertises; J5 adds a third `Rail` whose `verify` reads escrow state and whose `settle` is `complete`. Nothing touches `shouldSettle`, the secrecy boundary, the tree ledger, ENS or the canary.

**Tech Stack:** Bun 1.3, TypeScript, Effect 3.22, viem 2.x, Foundry (solc 0.8.28, `foundry.toml` at repo root), `@circle-fin/x402-batching` 3.4.0, `@circle-fin/unified-balance-kit` 1.6.0, `@circle-fin/adapter-viem-v2` 1.17.1, `erc-8183/base-contracts` (pin: see Task 6), Circle CLI 1.0.0 (logged in on testnet, Keychain-backed), graph-cli.

**Depends on:** Plans A–H merged (main ≥ `9bd99f3`). Runs **after H, before I**; the vendor-neutrality tasks (09:00 IST queue) may interleave, they touch different files except `arcade publish` (J4 = their task 3 with the fixture named here).

---

## Global Constraints

- Never commit `internal/`. Secrets only via Keychain/env: `ARCADE_FACILITATOR_KEY` (evaluator + relayer), `ARCADE_BUYER_KEY`, `ARCADE_SELLER_KEY`, `arcade-gateway-buyer-key`, `arcade-deployer-key`. Read inside the consuming command only.
- **Settle only on success** is unchanged: the escrow rail's `settle` is the only place that sends `complete`; `reject` is sent from the same `finish` branch that today declines settlement.
- Never `waitForTransactionReceipt` against Arc's public RPC; use the existing one-receipt-per-tick backoff (`packages/payments/src/eip3009.ts` pattern).
- Money is 6-decimal atomic `bigint`; gas is 18-decimal and never enters receipts. USDC `0x3600…0000` is both.
- Effect idioms only; no zod. Conventional small commits, one full gate per commit: `bun run test`, `bunx tsc --noEmit`, `bun run web:build` when web changes, `forge test` when contracts change.
- Third-party x402 clients must keep working on root calls: the **first** accept for a Gateway-enabled hub is the Gateway entry and the **second** is vanilla `exact`; the `erc8183` accept is always last and only present when the listing declares it. No new required headers on the default path.
- Money-moving live steps are approved in advance (owner, 2026-09-06): testnet USDC from the funded buyer/canary/gateway-buyer keys, hub relay gas from the facilitator key, one escrow deployment from the deployer key. Journal every live send under `docs/evidence/J/`. No mainnet.
- Owner-only items stop the executor and go to `handoff/OWNER-NEEDED.md`: treasury choice (default `0xcf821769ED3c0E55e152745377bb833d7155A78a`), Circle marketplace intake (post-mainnet), anything requiring an OTP.

---

## Verified facts this plan is built on

See spec §1 (table with evidence). Re-verify only what a task names; do not re-derive from memory. Two facts that shape the code the most:

- On the reference contract **only the provider may `setBudget`**, **only the client may `fund`** (and `fund` pulls `safeTransferFrom(client)`), **only the evaluator may `complete`/`reject`** once Submitted. `createJob` requires `expiredAt > now + 5 min` and a whitelisted hook (even `address(0)`). (`contracts/ERC8183.sol` 512-860.)
- Circle's deployed instance on Arc testnet has an older ABI, zero fees and a whitelist we cannot change (spec §1, probes). ARCADE deploys its own `ERC8183WithAuthorization` proxy.

---

## File structure

| path | purpose |
|---|---|
| `packages/core/src/manifest.ts` (edit) | `category?`, `tags?`, `rails?` on the public manifest; `rails` validated against `["gateway","eip3009","erc8183"]` |
| `packages/payments/src/rail.ts` (edit) | `Rail.name` union gains `"erc8183"`; `ChallengeInput` gains `escrow?` |
| `packages/payments/src/erc8183.ts` (new) | `Erc8183Live`: challenge/verify/settle for the escrow rail; `reject` helper; ABI slice |
| `packages/payments/src/erc8183-auth.ts` (new) | EIP-712 typed data for `SetBudgetAuthorization` and `SubmitAuthorization` (domain `ERC8183`/`1`); signer helper for the runner |
| `apps/hub/src/challenge.ts` (new) | builds the ordered `accepts[]` from `Rails` + listing `rails` |
| `apps/hub/src/server.ts` (edit) | 402 uses `challenge.ts`; `verify` dispatches by `accepted`; `POST /x/:seller/:skill/escrow`; discovery metadata |
| `apps/hub/src/openapi.ts` (edit) | registry-shaped `metadata` in `/.well-known/x402` and `/openapi.json` |
| `apps/hub/src/pipeline.ts` (edit) | escrow branch: `submit` relay before `settle`; `reject` on decline/runner-lost |
| `apps/hub/src/escrow.ts` (new) | `EscrowBudgetRequest`/`EscrowSubmitRequest` socket messages, relay with backoff, `getJob` reads |
| `packages/runner/src/…` (edit) | answer `EscrowBudgetRequest`/`EscrowSubmitRequest` by signing with the seller key; never broadcasts |
| `packages/buyer/src/fetch-with-payment.ts` (edit) | accept selection by `preferRail`; `erc8183` path (create → escrow route → approve → fund → retry) |
| `packages/buyer/src/unified-balance-funding.ts` (new), `cli.ts` (edit) | `arcade fund --from-unified-balance` |
| `contracts/ArcadeJobHook.sol` (new), `contracts/test/ArcadeJobHook.t.sol` (new) | hook: evaluator gate on `fund`, tree/receipt events on `complete`/`reject` |
| `contracts/vendor/erc8183/` (new, pinned copy or git submodule under `lib/`) | `ERC8183.sol`, `ERC8183WithAuthorization.sol`, interfaces |
| `scripts/deploy-erc8183.ts` (new) | proxy deploy + `initialize` + admin config; journals addresses |
| `config/chains/arc-testnet.json` (edit) | `erc8183: { escrow, hook, evaluator, reference }` |
| `subgraph/…` (edit) | data sources for the escrow proxy and the hook; `EscrowJob` entity |
| `apps/web/…` (edit) | rail badge, escrow job links, rails filter |
| `scripts/e2e-circle-cli.sh`, `scripts/e2e-escrow.sh`, `scripts/e2e-delegate-funding.sh` (new) | live proofs, journaled |
| `docs/runbook.md`, `docs/CONTINUITY.md`, `README.md` (edit) | rails table, Circle dialect section, escrow section, claims |

---

### Task 1: Dual-accept challenge and rail dispatch (J1 core)

- [x] `packages/core`: add optional `rails` (default `["gateway","eip3009"]` when unset; validated), `category` (enum of the six registry values), `tags` (≤10 lowercase slugs) to the public manifest; tests for validation.
- [x] `apps/hub/src/challenge.ts`: `buildAccepts(rails, listing, input)` → ordered `PaymentRequirements[]`: Gateway first when `rails.get("gateway")` exists, then `eip3009`, then `erc8183` when the listing declares it and `rails.get("erc8183")` exists. Unit tests for every combination, including a hub booted without Gateway.
- [x] `server.ts`: the 402 body is `{x402Version: 2, error: "payment required", accepts: buildAccepts(...)}`; `verify` picks the rail whose `name` matches `payload.accepted` (`extra.name === "GatewayWalletBatched"` → gateway; `scheme === "erc8183"` → erc8183; else eip3009). Refuse with `402 unsupported_rail` when no built rail matches.
- [x] Regression: the existing single-rail tests keep passing with `accepts.length === 1` when only one rail is built.
- [x] Commit: `feat(hub,payments): advertise every built rail in one 402 and dispatch verification by the accepted requirements`. Landed as98d6e64 +c760062.

Execution note: split into metadata98d6e64 and challenge/dispatch checkpoints.
Unknown schemes never fall through to exact; echoed terms are bound before
verification, and the chosen rail persists through settlement. Test mode remains
offline, children retain their default and sessions exclude escrow. The reserved
escrow type is not a built implementation. [Task1B report](../sdd/2026-09-06-J-arc-native/task-1b-report.md)
records the sole full gate's old-fixture failures, targeted correction and
unreached-stage results; no full gate replay or live proof is claimed.

### Task 2: Registry-shaped discovery (J1)

- [x] `openapi.ts`: registry-shaped metadata/type, observed seller ENS/address fallback and listing-page links, with the source-backed clarifications below.
- [x] Snapshot test against a fixture item copied from a real `circle services search` result (`docs/evidence/J/registry-item-sample.json`, scrubbed) to prove field parity.
- [x] Commit checkpoint: `feat(hub): registry-shaped x402 discovery metadata`; split verification and Graph consumer compatibility correction are recorded in the [Task2 report](../sdd/2026-09-06-J-arc-native/task-2-report.md), not claimed as a green first full run.

Execution clarification from the current primary reference and retained CLI
sample: upstream metadata uses input/output/siwx. Emit those fields plus explicit
inputSchema/outputSchema aliases. Canonical items retain the resources alias;
OpenAPI uses valid x-circle extensions. Capability flags must follow the actual
per-listing accepts, not promise vanilla on a Gateway-only/unavailable hub.
Test mode advertises neither production capability. Add current documented
SOCIAL_INTELLIGENCE while retaining the earlier DATA_ENRICHMENT input unchanged.
See [Task2 brief](../sdd/2026-09-06-J-arc-native/task-2-brief.md).

### Task 3: Buyer SDK accept selection (J1)

Execution checkpoints:3A adds bounded selection/balance leaf modules;3B wires
SDK/MCP/canary behavior. See [Task3 brief](../sdd/2026-09-06-J-arc-native/task-3-brief.md).
Escrow remains unselectable until its Task9 lifecycle exists; an explicit rail
preference is an ordered allow-list, not authority to silently broaden it.

Task3A merged519a244. Task3B is complete with recorded split verification;
its atomic commit/merge follows the final audit. Receipt-side provenance
is a local SDK/MCP field and CLI line, with an explicit caller-controlled private
journal example, not an automatic durable file or hub-derived settlement proof.
See the [Task3B report](../sdd/2026-09-06-J-arc-native/task-3b-report.md).

- [x] `fetch-with-payment.ts`: replace `accepts[0]` with bounded selection; default preference `["gateway","eip3009","erc8183"]`; Gateway requires observed available balance. Local receipt-side provenance and caller journal example, MCP `rail?`, fixed-session and canary policies.
- [x] Tests: multiple accepts → funded Gateway or exact before signing; unknown scheme skipped; empty/refused choices never sign. Original ENS authority, caps and no post-signature fallback are retained.
- [x] Commit checkpoints: `feat(buyer): add bounded rail selection and balance observation` then `feat(buyer): choose funded rails across SDK and MCP calls`; split results documented above.

### Task 4: Live proof — Circle CLI inspects and pays (J1 + J2)

Execution checkpoints:4A bounded observation/journal contracts, then4B owned
runtime and live proof. See the [brief](../sdd/2026-09-06-J-arc-native/task-4-brief.md)
and [4A record](../sdd/2026-09-06-J-arc-native/task-4a-report.md). Installed CLI1.0.0
uses a backing EOA for Gateway and returns ARCADE's queued202 without polling.
Verify those actual identities/statuses instead of the original SCA-payer/
immediate200 assertion below. Raw journals stay private; only scrubbed summaries
belong in docs/evidence. Local discovery overrides never imply public listing.
Task4A passed its sole full gate. Before funding, source inspection found the
CLI's forced30-day validity incompatible with ARCADE's604900-second pin.
J4 live is PAUSED by the Sep7 conductor decision; no expiry/cap/replay change.
No paid attempt occurred, so no exact sent validBefore exists. Root Gateway
first predicts requirements_mismatch on echoed timeout; vanilla root EIP-3009
has no maximum lifetime. See the precise source-only trace in the preflight.

- [ ] `scripts/e2e-circle-cli.sh`: start hub (both rails) + runner locally, then: `curl -i` the unpaid 402 (all accepts), `circle services inspect <url> --output json` (assert scheme `GatewayWalletBatched`, price, method), `circle gateway balance --address <agent> --chain ARC-TESTNET`, `circle services pay <url> -X POST --address <agent> --chain ARC-TESTNET --max-amount 0.01 --data '<canaryInput>' --output json`; assert HTTP 200 body and a receipt whose payer is the Circle SCA. Journal to `docs/evidence/J/circle-cli.jsonl`. Agent wallet from Plan I Task 1; if the CLI refuses the chain, capture the exact error and fall back to `--estimate` evidence plus the header replay from Plan I Task 2. Do not guess at CLI behaviour; record it.
- [ ] Commit: `test(e2e): Circle CLI agent wallet inspects and pays an ARCADE listing on Arc testnet`.

### Task 5: Unified Balance delegate funding (J3)

Execution checkpoints:5A policy/typed bindings,5B durable guarded CLI runtime,
5C separate approved live proof. [Task5 brief](../sdd/2026-09-06-J-arc-native/task-5-brief.md)
records SDK shape, polling and fee-bound corrections. The shorthand `to` below
needs the guarded destination adapter; an SDK result is not independent proof.

- [ ] Add `@circle-fin/unified-balance-kit` + `@circle-fin/adapter-viem-v2` to `packages/buyer`. `unified-balance-funding.ts`: `delegateStatus(owner, delegate, sourceChain)`, `spendFromOwner({owner, sourceChain, amount, recipient: delegate})` with `to: {chain: "Arc_Testnet", recipientAddress}`; all amounts strings with 6-dp validation; journal reuse from `gateway-funding-journal.ts`.
- [ ] CLI `arcade fund --from-unified-balance --owner 0x… --source Base_Sepolia|Arc_Testnet --amount 0.50`: prints the owner's `addDelegate` command verbatim when status is `none`/`pending` and exits 2; spends only when `ready`; `--dry-run` prints the plan.
- [ ] Tests with a fake kit (no network): status gating, amount validation, journal shape.
- [ ] Live proof `scripts/e2e-delegate-funding.sh`: owner key (`arcade-buyer-key` acts as owner for the proof) `addDelegate(gateway-buyer)` on Arc testnet, `depositFor` 0.50 USDC, delegate `spend` 0.25 onto Arc testnet into the gateway buyer, then one paid call. Explorer links journaled. If `Arc_Testnet` as a source chain is refused by the kit, use `Base_Sepolia` (faucet) as source and say so.
- [ ] Commit: `feat(buyer): fund an agent from its owner's Unified Balance by delegation` (+ evidence commit).

### Task 6: ERC-8183 contracts — vendor, hook, deploy script (J5)

Execution checkpoint6A vendors the exact pin and implements/tests the hook.
The unchanged authorization runtime exceeds EIP-170 under the tested legacy and
via-IR compiler settings; deployment remains blocked, not a passing build-size
gate. The zero-hook setter below is also impossible on this pin: initialization
already enables it, so verify its getter instead. Hook callback data wraps
optParams with actor/reason. See the [source brief](../sdd/2026-09-06-J-arc-native/task-6a-brief.md)
and [verification record](../sdd/2026-09-06-J-arc-native/task-6a-report.md).
Treasury confirmation remains a separate OWNER checkpoint. Continue6B's bounded
deployer and7–9 offline without attempting an oversized deployment.

Checkpoint6B1 now implements read-only artifact checks and the exact unsigned
seven-call plan. The CLI has no live executor, credentials, RPC or config/journal
writes; that remaining6B2 work stays behind deployability and treasury checkpoints.
See the [preflight record](../sdd/2026-09-06-J-arc-native/task-6b-report.md).

- [ ] Vendor `erc-8183/base-contracts` at the pinned commit `142e669c1fd3` (2026-06-30, "Merge pull request #24 … meta-transactions-and-claims"; re-pin only if `forge build` fails and record the new sha here) into `lib/erc8183` (submodule) plus OZ upgradeable if missing; `foundry.toml` remappings per their `foundry.toml`; `forge build` clean.
- [ ] `contracts/ArcadeJobHook.sol`: `IERC8183Hook` + ERC-165; `immutable escrow`, `immutable evaluator`; `beforeAction(jobId, selector, data)`: if `selector == fund` require `IERC8183(escrow).getJob(jobId).evaluator == evaluator`; `afterAction`: on `complete` decode `optParams` → `(bytes32 treeHash, uint32 childCount, uint256 childTotalAtomic, bytes32 receiptHash)` and emit `ArcadeSettled(jobId, treeHash, childCount, childTotalAtomic, receiptHash)`; on `reject` emit `ArcadeRefused(jobId, reason)`; `onlyEscrow` on both. Foundry tests: gate reverts for a foreign evaluator; events on complete/reject; ERC-165.
- [ ] `scripts/deploy-erc8183.ts` (viem, deployer key inline): deploy implementation, `ERC1967Proxy` with `initialize(treasury, deployer)`, `setPlatformFee(500, treasury)`, `setEvaluatorFee(0)`, `setPaymentTokenAllowed(USDC, true)`, `setHookWhitelist(address(0), true)`, deploy `ArcadeJobHook(escrow, evaluator)`, `setHookWhitelist(hook, true)`; verify every getter; write `config/chains/arc-testnet.json.erc8183 = {escrow, hook, evaluator, reference: "0x0747EEf0706327138c69792bF28Cd525089e4583", pin}` and journal to `docs/evidence/J/erc8183-deploy.json`. Treasury = OWNER value (default `0xcf82…A78a`).
- [ ] OWNER checkpoint: confirm treasury; then run the deploy once (testnet USDC gas).
- [ ] Commits: `feat(contracts): ArcadeJobHook for ERC-8183 escrow`; `chore(chain): ARCADE ERC-8183 escrow deployed on Arc testnet`.

### Task 7: Escrow rail in `packages/payments` (J5)

Execution7A adds offline ABI/job/receipt and provider-signature helpers only;
7B adds the guarded rail/relay. Neither may be advertised live without a verified
deployment. The [brief](../sdd/2026-09-06-J-arc-native/task-7-brief.md) records
request-ownership/durable-admission, pre-settlement receipt-hash and upstream
claim/payout/fee obligations omitted by the shorthand. Public jobId alone is not
caller authority. See [7A verification](../sdd/2026-09-06-J-arc-native/task-7a-report.md).
The [7B1 wire decision](../sdd/2026-09-06-J-arc-native/task-7b1-report.md)
adds a buyer-held capability committed to the exact request in the description;
budget and funded payloads require both jobId and capability. Pure verification
and the finalized reader are implemented; guarded sends/admission remain pending.
The [7B2 checkpoint](../sdd/2026-09-06-J-arc-native/task-7b2-report.md)
adds offline action/receipt proof contracts and historical finalized read-back.
[7B3a](../sdd/2026-09-06-J-arc-native/task-7b3a-report.md) adds the guarded
coordinator and private SQLite action lifecycle.
[7B3b](../sdd/2026-09-06-J-arc-native/task-7b3b-report.md) adds concrete bounded
RPC/signing ports.[7B4a](../sdd/2026-09-06-J-arc-native/task-7b4a-report.md)
adds separate capability payload and generic request/settlement contracts.
[7B4b](../sdd/2026-09-06-J-arc-native/task-7b4b-report.md) now implements the
guarded Effect rail on a dedicated typed tag; sole full gate56222 passed.
The original API sketch below is superseded by the brief's capability-bound
payload, independently pinned identity, durable action journal, lazy signing
callback and explicit actual hub-job/output completion context. No raw-key/RPC
discovery shortcut, public-jobId-only action, or dummy receipt hash is used.
Hub activation and atomic inference admission remain Task8, not this factory.
Existing exact-only payloads and tree-only settle arguments must not be
populated with dummy escrow values or silently widened for sessions.

- [ ] `erc8183.ts`: `Erc8183Live({escrow, hook, evaluatorKey, rpc})` implementing `Rail` with `name: "erc8183"`. `challenge` → requirements `{scheme: "erc8183", network, asset: USDC, amount, payTo: seller, maxTimeoutSeconds, extra: {escrow, hook, evaluator, expiresInSeconds, providerAgentId, description}}`. `verify(payload, requirements)` → `getJob(payload.jobId)` must be Funded with `budget == amount`, `paymentToken == USDC`, `provider == payTo`, `evaluator == ours`, `hook == ours`, `expiredAt - now ≥ timeout + 600`; returns `VerifiedPayment{payer: job.client, …}`. `settle(verified, tree)` → `complete(jobId, "arcade-settled", abi.encode(treeHash|0, childCount|0, childTotal|0, receiptHash))` with the existing receipt backoff; returns `{txHash}`. New `reject(jobId, reason)` (not on `Rail`; exported for the pipeline).
- [ ] `erc8183-auth.ts`: typed-data builders for `SetBudgetAuthorization(signer, jobId, token, amount, optParamsHash, nonce, deadline)` and `SubmitAuthorization(signer, jobId, deliverable, optParamsHash, nonce, deadline)` matching `ERC8183WithAuthorization.sol` lines 20-26; nonce = `uint72` random; deadline = now + 10 min. `relaySetBudget`/`relaySubmit` send the `*WithAuthorization` calls from the facilitator key.
- [ ] Tests with a mocked `readContract`/`writeContract`: every verify refusal; settle encodes optParams exactly; reject path.
- [ ] Commit: `feat(payments): ERC-8183 escrow rail with relayed provider authorizations`.

### Task 8: Hub escrow route, runner signing, pipeline branch (J5)

Execution is split into atomic checkpoints in the
[Task8 brief](../sdd/2026-09-06-J-arc-native/task-8-brief.md).
[8A contracts](../sdd/2026-09-06-J-arc-native/task-8a-report.md) implement closed
capability-free messages and lossless public context conversion only. Public
jobId alone is not caller authority, and a claimed output hash is not runner
authorization; the brief explicitly corrects those abbreviated sketches below.
[8B1 local completion data](../sdd/2026-09-06-J-arc-native/task-8b1-report.md)
shares the unchanged hub validator with the runner and binds actual validated
output/input/listing. A completion data object alone is not permission to sign;
the subsequent checkpoints below add durable claims and socket/chain authority.
[8B2 preflight](../sdd/2026-09-06-J-arc-native/task-8b2-report.md) adds the
concrete read-only canonical provider/job/nonce checks before signing. It exposes
no signer or broadcast method. The [8B3a private signing journal](../sdd/2026-09-06-J-arc-native/task-8b3a-report.md)
now reserves complete public intents and retains signature/uncertainty state.
The [8B3b sign-only session runtime](../sdd/2026-09-06-J-arc-native/task-8b3b-report.md)
now composes local completion closures, canonical preflight and durable claims.
The [8B3c1 daemon integration](../sdd/2026-09-06-J-arc-native/task-8b3c1-report.md)
connects this to explicit CLI configuration, actual socket messages and local
execution. The [8B3c2 hub correlator](../sdd/2026-09-06-J-arc-native/task-8b3c2-report.md)
binds authenticated original socket ownership and independently checks replies
after result cleanup. Durable admission/pipeline remain8C/8D; no deployed escrow
or end-to-end hub settlement is claimed by the loopback tests.
The [8C1 Store checkpoint](../sdd/2026-09-06-J-arc-native/task-8c1-report.md)
adds actual atomic admission and one-shot inference ownership, reciprocal
restart/stale-writer guards and exact input preservation. Budget HTTP and
atomic terminal/pipeline activation remain C2/D; see the
[8C brief](../sdd/2026-09-06-J-arc-native/task-8c-brief.md).
The [8D1 terminal checkpoint](../sdd/2026-09-06-J-arc-native/task-8d1-report.md)
adds explicit confirmed movement/uncertainty metadata and atomic current-disk
job/receipt/proof/reference persistence. Receipt-reader/result compatibility,
budget HTTP, pipeline/boot and post-durable attestation still remain. See the
[terminal brief](../sdd/2026-09-06-J-arc-native/task-8d-terminal-brief.md).
The [8D2 reader/result checkpoint](../sdd/2026-09-06-J-arc-native/task-8d2-report.md)
adds coherent escrow summaries/references/public evidence, actual legacy child
provenance in mixed-rail trees, and token-gated output/refund/uncertainty handling.
Budget HTTP, root pipeline/boot and post-durable attestation still remain.
The [8D3 tree closure](../sdd/2026-09-06-J-arc-native/task-8d3-report.md) and
[8D4 typed pipeline](../sdd/2026-09-06-J-arc-native/task-8d4-report.md) now provide
durable execution/tree accounting, guarded actions and post-durable attestation.
Budget/root HTTP and explicit pinned boot are still unwired; Task8 remains open.
The subsequent [8C2 HTTP checkpoint](../sdd/2026-09-06-J-arc-native/task-8c2-report.md)
wires dedicated registry selection, request-bound budget/root routes and hub-owned
execution scope. Budget takes `{input,payment}` with the J7 capability envelope;
bare-jobId requests are not ownership proof. Explicit pinned boot/journal remains
unarmed before Task9, so Task8 is still open. No existing validity change or live run.
The subsequent [8D5 boot checkpoint](../sdd/2026-09-06-J-arc-native/task-8d5-report.md)
adds explicit full-pin/private-journal activation and verified real process
shutdown ordering. No live deployment/configuration exists. Its passing gate
completes Task8's offline code composition; Task9 buyer lifecycle follows.

- [x] Full-context budget/submit socket requests and fixed signed/refused replies; current listing/output/deployment checks, original socket correlation, durable once-only provider signing, no runner broadcast or capability disclosure.
- [x] `POST /x/:seller/:skill/escrow {input,payment}` with J7 jobId/capability envelope, independently derived terms, guarded budget relay, budget/token/escrow/hash/fundBy response and verified-payer abuse bounds. Bare jobId is not authority.
- [x] Dedicated `escrow-pipeline.ts`: durable admission/tree closure, original verified rail object, output-bound submit/complete or proven reject, no opposite action after uncertainty, atomic terminal receipt/proof persistence before attestation. Exact/session pipelines stay separate.
- [x] Explicit pinned Arc boot with original Store/broker, private action journal and matching evaluator signer; actual process shutdown awaits request/job uncertainty cleanup before journal release.
- [x] Owned SQLite/loopback, synthetic rail/proof and actual process tests cover refusal, success/refund, uncertainty, duplicate ownership, limits and unchanged legacy rails. No live proof claimed.
- [x] Implemented as the linked atomic J8 checkpoint commits, each with its recorded gate; no squash or push.

### Task 9: Buyer escrow path (J5)

Offline checkpoints and safety-specific implementation are tracked in the
[J9 brief](../sdd/2026-09-06-J-arc-native/task-9-brief.md). J9A adds pre-create
deployment facts, locally pinned bounded intent and exact calldata, not an
executable buyer. Transaction proofs/private journal/runtime and SDK/MCP/CLI
remain. Use J8's closed input+capability budget/root envelopes, not bare jobId;
backoff is read-only, never an ambiguous write retry. No validity-policy changes.
[J9B1](../sdd/2026-09-06-J-arc-native/task-9b1-report.md) adds offline signed/mined/
event/full-job proofs; private durable journal/runtime and actual SDK remain.
[J9B2](../sdd/2026-09-06-J-arc-native/task-9b2-report.md) supplies one-purchase
private storage with no automatic reopen/resume. Bounded driver/Arc ports and
actual SDK/MCP/CLI remain; no live buyer proof is claimed.
[J9B3](../sdd/2026-09-06-J-arc-native/task-9b3-report.md) composes durable
once-only purchase ordering and bounded actual HTTP envelopes with synthetic
chain ports. J9B4 concrete buyer Arc/signing ports and J9C SDK/MCP/CLI remain.
[J9B4](../sdd/2026-09-06-J-arc-native/task-9b4-report.md) adds concrete buyer
Arc ports and owned-loopback/SQLite composition over synthetic RPC. Only J9C
actual SDK/MCP/CLI and local-pinned armed health remain in this offline task.

[J9C1](../sdd/2026-09-06-J-arc-native/task-9c1-report.md) wires actual SDK
selection with explicit independent local pins/bounds/private journal, current
listing/input capture, pre-gas ENS authority and full armed health identity.
Its local funding/queued evidence contains all four transaction proofs and
cannot be forged by remote result fields. No live deployment was activated;
private CLI/MCP configuration and gas-inclusive accounting remain J9C2.

- [x] `fetch-with-payment.ts` opt-in `erc8183` branch uses the durable create/budget/approve/fund/root driver, closed input+capability envelopes and exact local principal/gas limits. Independently verify all four transaction proofs, save the private202 before returning and expose local funding/queued evidence. Backoff is read-only, never a repeated write.
- [ ] MCP and CLI expose `rail: "erc8183"`; hire-by-name unchanged (payTo lock still applies).
- [x] Actual SDK/Arc-port/owned-loopback/private-SQLite composition against synthetic RPC; pre-gas ENS/current-listing refusals and full local-versus-health identity mismatch. Armed `/healthz` exposes full public pins, not just evaluator.
- [ ] Commit: `feat(buyer): pay a listing through ERC-8183 escrow`.

### Task 10: Live escrow proof (J5)

- [ ] `scripts/e2e-escrow.sh`: listing with `rails:["gateway","eip3009","erc8183"]`, price $0.30; run once via the SDK (`rail: "erc8183"`): assert `JobCreated`, `BudgetSet`, `JobFunded`, `JobSubmitted`, `JobCompleted`, `PaymentReleased(seller, 285000)`, `PlatformFeePaid(treasury, 15000)`, `ArcadeSettled(treeHash…)`; then a forced-failure run (canary input that fails schema) asserting `JobRejected` + `Refunded(client, 300000)` and no `PaymentReleased`. Then the same happy path with the **Circle agent wallet** as client via `circle wallet execute` for `createJob`/`approve`/`fund` (Task 4's wallet; USDC from faucet). Journal to `docs/evidence/J/escrow.jsonl` with explorer links; independent read-back with `cast call getJob`.
- [ ] Commit: `test(e2e): ERC-8183 escrow settles on success and refunds on failure, with the Circle agent wallet as client`.

### Task 11: Subgraph and web (J5 surface)

- [ ] Subgraph: data sources for the escrow proxy and hook; `EscrowJob` entity; `Settlement.rail`; mapping tests (matchstick); redeploy `v0.0.2` to Studio (deploy key inline).
- [ ] Web: receipt page rail badge and job links; listing page "accepts: gateway · exact · escrow"; marketplace filter. `bun run web:build` + snapshot.
- [ ] Commit: `feat(subgraph,web): escrow jobs indexed and shown`.

### Task 12: Circle plugin fixture (J4) and docs/claims

- [ ] Point the queued Agent Plugins ingest at a pinned checkout of `circlefin/skills` (`plugins/circle`); publish `pay-via-agent-wallet` and `use-gateway` live on the default rail; evidence next to B13.
- [ ] `docs/runbook.md` "Rails" table (gateway · eip3009 · erc8183: when, cost, who pays gas, what is committed on chain); "Circle dialect" section (inspect/pay commands); "Why our own ERC-8183 instance" paragraph (spec §7.1) with Circle's reference address; `README.md` and `docs/CONTINUITY.md` rows; claims exactly as spec §9.
- [ ] `docs/architecture.md` diagram gains the escrow path and the delegate funding path (Plan I Task 6 will render it).
- [ ] Commit: `docs: rails, Circle dialect, escrow and delegate funding`.

---

## Self-review

- Every 402 that carries Gateway lists it first; the Circle CLI path (Task 4) is exercised before the escrow rail lands, so J1/J2 evidence exists even if J5 slips.
- The escrow rail cannot settle without a Submitted job and cannot refuse without sending `reject`; both branches are journaled; `claimRefund` protects the buyer if the hub disappears.
- No task reads a private key outside the consuming process; the runner signs but never broadcasts.
- Claims are limited to spec §9 wording.
