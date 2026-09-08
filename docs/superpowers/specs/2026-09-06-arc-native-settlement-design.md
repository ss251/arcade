# ARCADE at ETHOnline 2026 — Arc-native settlement design (Plan J)

Status: approved scope, 2026-09-06 (owner: "lets more completely integrate these capabilities offered by Arc, we should not just slap something on"; "Go"). Extends `2026-09-04-ethonline-continuity-design.md`; does not replace any move in it. Executes after Plan H, before Plan I.

## 0. Why this exists

The Arc "Agentic Economy" prize text (scraped 2026-09-04, `docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:428-450`) scores four things: agents with decision logic tied to real signals; autonomous USDC spending and settlement; **use of Agent Stack to connect agents to wallets, payments and onchain actions**; use of Nanopayments, Paymaster or App Kits. Circle's own Arc guide (`https://docs.arc.io/build/agentic-economy`) names two standards for the job lifecycle: **ERC-8004** (identity, reputation) and **ERC-8183** (programmable job contracts). ARCADE already ships 8004, Gateway nanopayments and x402. It does not yet speak the two protocols a Circle agent actually uses to *find and pay*, and it does not offer the escrow primitive Circle documents.

Everything below was verified against live systems on 2026-09-06 (section 1). Each move maps onto a seam ARCADE already has; none adds a parallel payment path.

## 1. Verified facts this design is built on

| fact | evidence |
|---|---|
| Circle's buyer skill reads `accepts[]`, prefers the Gateway entry (`extra.name == "GatewayWalletBatched"`), falls back to vanilla `exact`, never assumes a chain; `circle services inspect` reports only the CLI's auto-selected accept | `circlefin/skills` `pay-via-agent-wallet/SKILL.md` steps 1–3 (fetched 2026-09-06) |
| Circle's seller skill: "Default to Circle Gateway Nanopayments"; `GatewayEvmScheme extends ExactEvmScheme` so one 402 carries **both** accepts | `accept-agent-payments/SKILL.md`; https://developers.circle.com/gateway/nanopayments/howtos/x402-seller step 3 |
| `@circle-fin/x402-batching` documents `eip155:5042002` (Arc testnet) as a first-class Gateway network; Circle CLI 1.0.0 lists `ARC-TESTNET` and `gateway deposit --method direct` on it | `node_modules/@circle-fin/x402-batching/dist/server/index.d.ts` (installed with the CLI); `circle blockchain list`; `circle gateway deposit --help` |
| Circle's services registry is `GET https://api.circle.com/v2/x402/discovery/resources` (public): items `{resource, type, x402Version, accepts[], metadata{provider{name,website,docsUrl,description,category,tags}, path, method, description, mimeType, input/output schema, supportsVanillax402, supportsCircleGateway}}`; categories seen: CREATIVE, DATA_ENRICHMENT, FINANCIAL_ANALYSIS, INFRASTRUCTURE, PREDICTION_MARKETS, WEB_SEARCH_RESEARCH; 400 sampled items, **zero testnet accepts** | `circle services search --output json` 2026-09-06; https://developers.circle.com/agent-stack/agent-marketplace/discovery-api |
| Listing in that registry is an intake form (endpoint URL, payout wallet, description), sanctions screening, "stays listed only while it is reachable"; no self-serve publish API | https://developers.circle.com/agent-stack/agent-marketplace/get-listed; `accept-agent-payments/SKILL.md` "Marketplace Listing" |
| ARCADE's hub returns **one** accept per 402 (`accepts: [requirements]` from the booted rail) and its discovery doc carries no provider/category/schema metadata | `apps/hub/src/server.ts:1126`; `apps/hub/src/openapi.ts:448-473` |
| ARCADE's buyer SDK takes `accepts[0]` unconditionally | `packages/buyer/src/fetch-with-payment.ts:203` |
| Circle CLI agent wallets can call arbitrary contract functions (`circle wallet execute "<sig>" <args> --contract --address --chain`) and read them (`circle contract query`) | `circle wallet execute --help` |
| Circle spending caps (`circle wallet limit set`) are **mainnet-only** and OTP-gated; viewing is free | `agent-wallet-policy/SKILL.md` |
| Unified Balance delegate model: owner `addDelegate()` once per source chain, delegate `spend({from:{chain}, to:{chain:"Arc_Testnet", recipientAddress}, allocations})`; `getDelegateStatus()` → `none|pending|ready`; `depositFor()` credits another account; `Arc_Testnet` is a supported source and destination; `@circle-fin/app-kit` 1.14.0, `@circle-fin/unified-balance-kit` 1.6.0, `@circle-fin/adapter-viem-v2` 1.17.1 on npm | `unify-balance/references/delegate.md`; https://docs.arc.io/app-kit/quickstarts/unified-balance-delegate-deposit-and-spend; https://docs.arc.io/app-kit/references/supported-blockchains |
| `circlefin/skills` is an Agent Plugin: `plugins/circle/.codex-plugin/plugin.json` (`skills: "./skills/"`, `mcpServers: "./.mcp.json"`), `.claude-plugin/marketplace.json`, `.cursor-plugin`, 16 SKILL.md folders, Apache-2.0 | `gh api repos/circlefin/skills/contents/...` 2026-09-06 |
| ERC-8183 reference (`erc-8183/base-contracts`, Solidity 0.8.28, UUPS, OZ upgradeable): roles client/provider/evaluator; `createJob(provider, evaluator, uint48 expiredAt, description, hook, providerAgentId)`; **only the provider** may `setBudget(jobId, token, amount, optParams)`; **only the client** may `fund(jobId, expectedToken, expectedBudget, optParams)` (pulls `safeTransferFrom(client)`); only the provider `submit(jobId, deliverable, optParams)`; only the evaluator `complete`/`reject` once Submitted; `expiredAt > now + 5 min`; `claimRefund` after `expiredAt + 1h` grace; fees `platformFeeBP`/`evaluatorFeeBP` are contract-global, admin-set; hooks must be **admin-whitelisted** (even `address(0)`); payment tokens admin-allowlisted; `payoutReceiver` may be an `IDisburser`; claims allow cumulative partial settlement | `contracts/ERC8183.sol` lines 72-101, 512-580, 621-860, 889-912; `docs/02-hook-system.md` |
| `ERC8183WithAuthorization` adds EIP-712 relayed variants for every action (`createJobWithAuthorization`, `setBudgetWithAuthorization`, `fundWithAuthorization`, `submitWithAuthorization`, `completeWithAuthorization`, `rejectWithAuthorization`, claim variants), domain `ERC8183`/`1`, packed nonces, `cancelAuthorization` | `contracts/ERC8183WithAuthorization.sol` lines 11-47, 93-380 |
| Hook data encodings: `fund → abi.encode(caller, optParams)`; `submit → abi.encode(caller, deliverable, optParams)`; `complete`/`reject → abi.encode(caller, reason, optParams)`; `createJob` and `claimRefund` are never hooked; `afterAction` reverts roll back the whole transaction | `docs/02-hook-system.md` |
| Circle's Arc testnet deployment `0x0747EEf0706327138c69792bF28Cd525089e4583` is a proxy (impl `0xa316fd…351a`) of an **older ABI**: `createJob(address,address,uint256,string,address)` (no agent id), `setBudget(uint256,uint256,bytes)`, `fund(uint256,bytes)`, fixed `paymentToken() = USDC 0x3600…`, `platformFeeBP = 0`, `evaluatorFeeBP = 0`, treasury `0xcBe5B97a069be3E4B5398663790731fb76aB620D`, `whitelistedHooks(0x0) = true`; no `paused()`, no claims, no authorization variant, no `setPayoutReceiver` | ad-hoc `cast` probes against `https://rpc.testnet.arc.io` on 2026-09-06 (scratch scripts, not retained in this repo; reproduce with `cast call 0x0747EEf0706327138c69792bF28Cd525089e4583 "paymentToken()(address)" --rpc-url https://rpc.testnet.arc.io` and the sibling getters); https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job |
| ARCADE's settle-only-on-success decision is a pure function `shouldSettle(outcome, schemaValid)` evaluated once in `pipeline.ts`, after the receipt tree is computed and before `rail.settle` | `apps/hub/src/pipeline.ts:243-275` |
| ARCADE's `Rail` is `{name, challenge, verify, settle}` behind `RailTag`; `Rails` is an offline registry `{default, get(name), names}` | `packages/payments/src/rail.ts:73-95`; `apps/hub/src/rails.ts` |
| FeeSplitterV2 is `immutable seller/treasury/feeBps`, `settle`, `settleWithTree(auth, treeHash, childCount, childTotalAtomic)`, `withdrawFees` | `contracts/FeeSplitterV2.sol:82-233` |

## 2. Architecture (delta)

```
buyer ─ SDK / MCP / web / circle services pay / circle wallet execute
   │  402  accepts: [ Gateway(GatewayWalletBatched) , exact(EIP-3009 → FeeSplitterV2) , erc8183(escrow) ]
   ▼
hub ─ input gate → delist → session → lineage → verify ┐
    ─ J1 dual-accept challenge; registry-shaped /.well-known/x402 and /openapi.json
    ─ J5 escrow rail: create → budget → fund → run → submit → complete/reject   (hub = evaluator)
    ─ receipt tree → shouldSettle → rail.settle ┘  → putReceipt → attest (ERC-8004) → session commit
   ▼
ARCADE ERC-8183 (own proxy on Arc testnet) ── ArcadeJobHook (afterAction: tree + receipt events)
   subgraph indexes JobCreated/JobFunded/JobSubmitted/JobCompleted/JobRejected/PaymentReleased + hook events
buyer funding ── J3 Unified Balance delegate: owner keeps custody on any chain, agent spends onto Arc
supply ── J4 circlefin/skills plugin ingested as listings (Agent Plugins task, already queued)
```

Nothing above changes `shouldSettle`, the secrecy boundary, the tree ledger, ENS or the canary. The escrow rail is a third `Rail` with a different `verify` (funds are locked on chain before work) and a different `settle` (`complete` instead of a transfer).

## 3. J1 — Speak Circle's dialect: dual-accept 402, registry-shaped discovery

- `rail.challenge` for a root call returns `accepts` in this order: **Gateway** (when the Gateway rail is built), **exact** (EIP-3009, `payTo` = the listing's FeeSplitterV2), **erc8183** (when the listing declares it, §7). Order is the Circle preference order; the buyer SDK stops taking `accepts[0]` and selects by a `preferRail` option, defaulting to `["gateway","eip3009","erc8183"]`.
- `PaymentPayload.accepted` already carries the chosen requirements; `verify` dispatches on `accepted.scheme`/`extra.name` to the matching rail. No new header.
- `/.well-known/x402` and `/openapi.json` gain `metadata` per Circle's registry shape: `provider{name, website, docsUrl, description, category, tags}`, `path`, `method`, `mimeType`, `inputSchema`, `outputSchema`, `supportsVanillax402: true`, `supportsCircleGateway: <gateway rail built>`. Category comes from a new optional manifest field `category` (enum of the six registry values; default `INFRASTRUCTURE`); tags from manifest `tags`.
- Proof: `circle services inspect https://<hub>/x/<seller>/<skill> --output json` reports scheme `GatewayWalletBatched`, price, method and schema; a raw `curl` shows all accepts; `circle services pay … --chain ARC-TESTNET --max-amount 0.01` buys a listing. Recorded next to F1.
- Claim: "ARCADE listings are Circle-marketplace-shaped: inspect and pay with the Circle CLI unchanged." Never "listed in Circle's marketplace" (that registry is mainnet-only and form-gated; §9).

## 4. J2 — A Circle agent wallet as a first-class buyer

Plan I Tasks 1–3 already provision the CLI agent wallet on Arc testnet and replay its header. J2 adds the live beats once J1 lands:

- `circle gateway deposit --amount 0.5 --address <agent> --chain ARC-TESTNET --method direct`, then `circle services pay <listing> -X POST --address <agent> --chain ARC-TESTNET --max-amount 0.01 --data '…'`. The receipt shows the Circle SCA as payer; `circle gateway balance` shows the debit.
- The same agent wallet as an **ERC-8183 client** via `circle wallet execute "createJob(address,address,uint48,string,address,uint256)" …`, `approve`, `fund` on ARCADE's escrow (§7). This is the Agent Stack "onchain actions" beat with Circle's own wallet.
- Spending caps: view with `circle wallet limit`; state plainly they are mainnet-only, so on testnet ARCADE's `maxSubSpendUsd` and session budgets are the caps in force.

## 5. J3 — Owner-custody buyer funding (Unified Balance delegate)

- New buyer-side command `arcade fund --from-unified-balance --owner <addr> --amount <usdc>` (SDK: `packages/buyer/src/unified-balance-funding.ts`), on `@circle-fin/unified-balance-kit` + `@circle-fin/adapter-viem-v2`: checks `getDelegateStatus()`; if `none`, prints the exact `addDelegate()` command for the owner (owner-signed, per source chain); when `ready`, the agent key signs `spend({from:{chain:<source>}, to:{chain:"Arc_Testnet", recipientAddress:<agent>}, allocations:[…]})` and journals the result (reusing the Gateway funding journal from F Task 11).
- Why it is not bolt-on: ARCADE's buyer agents today need a pre-funded key. Delegation is the wallet model Circle designed for exactly this ("SCA depositors", "operational separation"). The owner keeps custody; the agent spends bounded amounts onto Arc; the receipt tree still shows the agent as payer.
- Proof: one delegate spend from Base Sepolia (faucet USDC) or Arc testnet into the buyer on Arc testnet, then a paid call. Recorded with explorer links.

## 6. J4 — Circle's plugin as supply

The already-queued Agent Plugins ingest uses `circlefin/skills` as its fixture: `arcade publish ./circlefin-skills/plugins/circle` expands `.codex-plugin/plugin.json` into one `skill` listing per SKILL.md (16) and one `mcp` listing per server in `.mcp.json`; unsupported connector types are reported, not silently dropped. Publish two (`pay-via-agent-wallet`, `use-gateway`) live. Licence note (Apache-2.0) in the listing description.

## 7. J5 — ERC-8183 escrow rail

### 7.1 Why our own deployment, not Circle's

Circle's Arc testnet instance is an older ABI with `platformFeeBP = 0`, no authorization variant, no claims, and a hook whitelist we cannot change. ARCADE needs (a) its 5% fee to route to its treasury, (b) a whitelisted hook to commit the receipt tree, (c) relayed authorizations so the seller's runner never spends gas. So ARCADE deploys `ERC8183WithAuthorization` from `erc-8183/base-contracts` (pinned commit recorded in the plan) behind an `ERC1967Proxy` on Arc testnet, `initialize(treasury, admin)`, then `setPlatformFee(500, treasury)`, `setPaymentTokenAllowed(USDC, true)`, `setHookWhitelist(address(0), true)`, `setHookWhitelist(ArcadeJobHook, true)`. Circle's instance is to be recorded in `config/chains/arc-testnet.json` as `erc8183.reference` when that rail lands — the field does not exist yet — and the runbook will explain the difference in one paragraph.

### 7.2 Roles

| ERC-8183 role | ARCADE party | key |
|---|---|---|
| client | buyer | buyer's key (SDK) or Circle agent wallet (`circle wallet execute`) |
| provider | seller | seller key on the runner; signs `SetBudgetAuthorization` and `SubmitAuthorization`, relayed by the hub |
| evaluator | hub | `ARCADE_FACILITATOR_KEY` (already funded for gas; signs `complete`/`reject`) |
| hook | `ArcadeJobHook` | none |
| providerAgentId | the seller's ERC-8004 agent id when registered (Plan D), else 0 | — |

The hub is the evaluator because it already is: `shouldSettle` is the evaluation. Making it an on-chain `complete`/`reject` turns a hub decision into an auditable transaction without changing the rule.

### 7.3 Choreography (root calls only; children keep their existing rails)

1. `POST /x/:seller/:skill` unpaid → 402 with the `erc8183` accept: `{scheme:"erc8183", network, asset: USDC, amount, payTo: seller, extra:{escrow, hook, evaluator, expiresInSeconds, providerAgentId, description}}`.
2. Buyer (client) sends `createJob(seller, evaluator, now+expiresInSeconds, description, hook, providerAgentId)` → `jobId` from `JobCreated`. The SDK does this with viem; the Circle CLI with `wallet execute`.
3. Buyer `POST /x/:seller/:skill/escrow {jobId}`. Hub reads `getJob(jobId)`: client == caller-claimed payer, provider == seller, evaluator == hub, hook == ArcadeJobHook, status Open, budget 0. Hub asks the runner over the existing socket (`EscrowBudgetRequest{jobId, token, amount}`); runner returns a `SetBudgetAuthorization` signature; hub relays `setBudgetWithAuthorization` (hub pays gas). Response `{jobId, budget, token, escrow}`.
4. Buyer `approve(escrow, amount)` then `fund(jobId, USDC, amount, "")`. Funds are now locked.
5. Buyer retries `POST /x/:seller/:skill` with `PAYMENT-SIGNATURE` carrying `{accepted: <the erc8183 requirements>, payload:{jobId}}`. Escrow rail `verify`: `getJob` → status Funded, budget == amount, token == USDC, provider/evaluator/hook as above, `expiredAt` leaves at least the listing timeout plus 10 minutes. That is the payment verification; nothing else moves.
6. Job runs as today (input gate, lineage, tree).
7. On `shouldSettle == true`: hub asks the runner for a `SubmitAuthorization(jobId, deliverable = keccak256(canonical output), optParams)` and relays `submitWithAuthorization`; then the evaluator sends `complete(jobId, "arcade-settled", abi.encode(treeHash, childCount, childTotalAtomic, receiptHash))`. `settle` returns the `complete` tx hash as `settleTx`. Platform fee (5%) goes to the treasury by the contract; the seller receives net.
8. On `shouldSettle == false`, or runner lost/timeout: evaluator sends `reject(jobId, reason, "")` → client refunded on chain. This is "we never take money on failure" made literal. If the hub itself is down past `expiredAt + 1h`, anyone can `claimRefund`.
9. `ArcadeJobHook.afterAction(complete)` decodes `optParams` and emits `ArcadeSettled(jobId, treeHash, childCount, childTotalAtomic, receiptHash)`; `afterAction(reject)` emits `ArcadeRefused(jobId, reason)`. `beforeAction(fund)` reverts unless `getJob(jobId).evaluator == ARCADE_EVALUATOR` (immutable in the hook) so a job pointed at another evaluator cannot masquerade as ARCADE's.

### 7.4 Pricing rule

Escrow costs the buyer two or three Arc transactions (create, approve, fund) plus the hub's relay gas; on Arc that is on the order of a cent. The manifest therefore declares `rails: ["gateway","eip3009"]` by default and adds `"erc8183"` only when `price >= $0.25` or `timeoutSeconds >= 60`. The publish command warns otherwise. Gateway sessions remain the rail for cent-level calls; this is not a replacement.

### 7.5 What stays unchanged

`shouldSettle`, receipts, the tree ledger, ENS payTo lock (`payTo` is the seller EOA; escrow pays the seller), canary (buys on the default rail), ERC-8004 attestation (uses `settleTx` = the `complete` hash), sessions (Gateway-only).

## 8. Subgraph and web

- Subgraph: add data sources `ArcadeErc8183` (proxy) and `ArcadeJobHook`; entities `EscrowJob{id, client, provider, evaluator, budget, status, createdAt, fundedAt, completedAt, treeHash, receiptHash, completeTx}`; `Settlement` gains `rail`.
- Web: receipt page shows rail, job id, Arcscan links for create/fund/complete; listing page shows accepted rails; marketplace filter "escrow".

## 9. Target claims — earned only when the gate below clears

These are the wordings this design aims at, **not** wording that is currently allowed. Each is
gated; `docs/runbook.md` is the authority on what has actually run, and it forbids promoting any
of these into product copy before its gate clears.

- "Every ARCADE listing is payable by Circle's own agent wallet and inspectable with Circle's CLI, unchanged." — *gate: J4. No Circle CLI pay call or signature has been made; the CLI clamps Gateway validity to 2,592,000s against ARCADE's 604,900s, so the first attempt is expected to return HTTP 402 `requirements_mismatch`.*
- "ARCADE settles cent-level calls with Circle Gateway nanopayments and larger jobs with ERC-8183 escrow on Arc, with the hub as the on-chain evaluator; failed jobs are refunded by the contract." — *gate: J5/J6. No ERC-8183 contract is deployed; the build is blocked on EIP-170 (`docs/evidence/J/erc8183-build-preflight.json`, runtime 26,167 bytes; Arc RPC returns `revert: CreateContractSizeLimit`).*
- "The receipt tree root is committed on chain either by FeeSplitterV2 or by the ERC-8183 hook, depending on rail." — *gate: J6. The FeeSplitterV2 half is live; the hook half does not exist yet.*
- Never: "listed on Circle's marketplace" (mainnet-only, form-gated, owner action after Sept 16); "spending caps enforced by Circle" (mainnet-only).

## 10. Owner-only items this creates

Treasury address for the escrow (defaults to the FeeSplitterV2 treasury `0xcf82…A78a` unless the owner names another); the deploy transaction (deployer key, testnet USDC gas); Circle marketplace intake after mainnet; nothing else.

## 11. Order and gates

Plan J executes after Plan H merges and before Plan I. Merge order for shared files: `packages/payments` (J5 rail) → `apps/hub/src/server.ts` (J1 challenge order, J5 escrow route) → `apps/hub/src/pipeline.ts` (J5 submit/complete) → `packages/buyer` (J1 selection, J3 funding) → `subgraph/` → `apps/web`. Gates as in every plan: `bun run test`, `bunx tsc --noEmit`, `bun run web:build`, `forge test` for the hook and deployment script, plus the live proofs named per task.
