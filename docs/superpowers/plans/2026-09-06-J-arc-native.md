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

- [ ] `erc8183.ts`: `Erc8183Live({escrow, hook, evaluatorKey, rpc})` implementing `Rail` with `name: "erc8183"`. `challenge` → requirements `{scheme: "erc8183", network, asset: USDC, amount, payTo: seller, maxTimeoutSeconds, extra: {escrow, hook, evaluator, expiresInSeconds, providerAgentId, description}}`. `verify(payload, requirements)` → `getJob(payload.jobId)` must be Funded with `budget == amount`, `paymentToken == USDC`, `provider == payTo`, `evaluator == ours`, `hook == ours`, `expiredAt - now ≥ timeout + 600`; returns `VerifiedPayment{payer: job.client, …}`. `settle(verified, tree)` → `complete(jobId, "arcade-settled", abi.encode(treeHash|0, childCount|0, childTotal|0, receiptHash))` with the existing receipt backoff; returns `{txHash}`. New `reject(jobId, reason)` (not on `Rail`; exported for the pipeline).
- [ ] `erc8183-auth.ts`: typed-data builders for `SetBudgetAuthorization(signer, jobId, token, amount, optParamsHash, nonce, deadline)` and `SubmitAuthorization(signer, jobId, deliverable, optParamsHash, nonce, deadline)` matching `ERC8183WithAuthorization.sol` lines 20-26; nonce = `uint72` random; deadline = now + 10 min. `relaySetBudget`/`relaySubmit` send the `*WithAuthorization` calls from the facilitator key.
- [ ] Tests with a mocked `readContract`/`writeContract`: every verify refusal; settle encodes optParams exactly; reject path.
- [ ] Commit: `feat(payments): ERC-8183 escrow rail with relayed provider authorizations`.

### Task 8: Hub escrow route, runner signing, pipeline branch (J5)

- [ ] Socket messages `EscrowBudgetRequest{jobId, token, amount, escrow, chainId}` → runner replies `EscrowBudgetSigned{jobId, signature, nonce, deadline}`; `EscrowSubmitRequest{jobId, deliverable}` → `EscrowSubmitSigned{…}`. Runner signs with the seller key only; refuses if `amount` ≠ its listing price or `escrow` ≠ chain config. Runner never broadcasts.
- [ ] `POST /x/:seller/:skill/escrow {jobId}`: validations from spec §7.3 step 3, relay `setBudgetWithAuthorization`, respond `{jobId, budget, token, escrow, fundBy}`; 409 when the job is not Open/ours; rate-limited per payer.
- [ ] `pipeline.ts`: when `args.verified.rail === "erc8183"`: before `rail.settle`, request `EscrowSubmitSigned` and relay `submitWithAuthorization` (deliverable = keccak256 of canonical output); on decline / runner lost / timeout call `reject(jobId, reason)` and record `refundTx` in the receipt; on settle success record `settleTx` = complete tx. `putReceipt` and attestation unchanged (attester uses `settleTx`).
- [ ] Tests: escrow route refusals; pipeline settle and reject branches with a fake rail; the existing pipelines untouched (assert no escrow call on gateway/eip3009).
- [ ] Commit: `feat(hub,runner): ERC-8183 escrow route, provider signing over the socket, evaluator complete/reject in the pipeline`.

### Task 9: Buyer escrow path (J5)

- [ ] `fetch-with-payment.ts` `erc8183` branch: `createJob(payTo, evaluator, now+expiresInSeconds, description, hook, providerAgentId)` with the buyer key → `jobId` from `JobCreated`; `POST …/escrow {jobId}`; `approve(escrow, amount)`; `fund(jobId, USDC, amount, "0x")`; retry the call with `PAYMENT-SIGNATURE = {accepted, payload:{jobId}}`. Each on-chain step uses the existing backoff; `--max-amount` still gates. Journal the three tx hashes into the SDK result.
- [ ] MCP and CLI expose `rail: "erc8183"`; hire-by-name unchanged (payTo lock still applies).
- [ ] Tests with a fake chain client; refusal when `extra.evaluator` ≠ the hub's advertised evaluator (`/healthz` gains `erc8183.evaluator`).
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
