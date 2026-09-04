# ARCADE at ETHOnline 2026 — continuity design ("Charizard")

Status: approved scope, 2026-09-04 (supersedes the first, narrower draft of the same date). Derived from `docs/superpowers/research/ethonline-2026/` (sponsor research, X sweeps, three-model debate, `DEBATE/SYNTHESIS.md`) and the owner's decisions: partners **Arc + The Graph + ENS**; full scope including Gateway sessions; all three publish adapters; Circle CLI interop before Gateway; the Graph payment hop on Base mainnet with a funded payer; research artifacts committed once hacking opens (Sept 4, 09:30pm IST).

Build window Fri Sept 5 → Fri Sept 12 with parallel executor agents; submission before Sat Sept 13, 12:00pm EDT; check-ins Sept 8 and 11.

## 1. Thesis and evolution

ARCADE today: four hand-written skills, one hire hop, per-call settlement, hub-only trust, a one-page chat. The market gap (from the research): dead catalogs nobody pay-tests, x402 with no failure semantics, no narrowing subcontract handoff, ERC-8004 as badges with an unused ValidationRegistry, loop agents choking on settle-per-call, and supply that is a fraction of demand.

ARCADE after this week: **the agent labor protocol**. Anyone publishes any skill, MCP server or API as a paid, named, pay-tested endpoint; agents hire by name; job trees settle with the tree committed on chain; every listing carries on-chain identity, settlement evidence and validation on Arc; sessions batch through Gateway; the marketplace's own ledger is queryable on The Graph; and the whole economy is visible in a real web app. The two existing guarantees are untouched: seller code never leaves the seller's machine, and a buyer's authorization is broadcast only after schema-valid output.

| move | partner story | judging axis |
|---|---|---|
| M1 Publish anything (skill, mcp, openapi adapters) | Arc (supply for the agentic economy) | Practicality, Usability |
| M2 Settlement core: input gate, lineage, tree ledger, FeeSplitter v2 with on-chain tree commitment | Arc | Technicality, Originality |
| M3 Pay-tested listings with auto-delist | Arc | Practicality, WOW |
| M4 ERC-8004 on Arc: identity + attested feedback + validation | Arc, ENS (ENSIP-25) | Originality |
| M5 ENSv2 namespaces: hire by name, liveness as expiry, payTo lock | ENS | Originality |
| M6 Gateway Nanopayments sessions, live on Arc testnet | Arc (Nanopayments) | Technicality |
| M7 The Graph: ARCADE ledger subgraph on arc-testnet + cost-of-goods skill on Base | The Graph | Technicality |
| M8 Web app: marketplace, receipt trees, dashboards, publish wizard | all | Usability, WOW |
| M9 Chain config, boot checks, mainnet runbook, Circle CLI interop, mainnet flip Sept 16 | Arc (Push to Mainnet) | Practicality |

## 2. Architecture

```
publisher ── arcade publish <dir | mcp://… | openapi.json>  → PublicListing (secrecy boundary unchanged)
   │
buyer (SDK / MCP / web / circle CLI / hire-by-name)
   │ POST /x/:seller/:skill  [+ x-arcade-hire-capability]   or   session via Gateway rail
   ▼
hub ── input gate → lineage → tree reservation → rail.verify → job
    ── receipt tree; FeeSplitter v2 settleWithTree(auth, treeHash, childTotal)
    ── canary buyer (pay-tests every listing daily; auto-delist)
    ── ERC-8004: operator key requests validation, validator key responds; attester writes feedback
    ── ENS: reads names; runner renews liveness
    ── ChainConfig; pending mainnet refuses to boot
   │ JobAssignment {…, parentJobId?, hireCapability?}
   ▼
runner ── adapters: script | claude-api | claude-agent | skill | mcp | openapi
       ── hire broker forwards capability; renews ENS subname while alive
   ▼
skill ── counterparty-graph pays The Graph on Base; failure → no schema-valid output
subgraph (arc-testnet, Studio) ── indexes FeeSplitter v2 trees + the three ERC-8004 registries
web ── marketplace · listing/receipt tree · seller & buyer dashboards · publish wizard
```

## 3. M1 — Publish anything

Three new `EngineAdapter` values and engines registered in `packages/runner/src/engines/harness.ts` (`ENGINES`), each implementing `{run, envGrants, doctor}` from `engines/types.ts`. `packages/core/src/engine.ts` gains the literals, `termsFor` rules (all three sellable with `api-key` or `none`), and manifest validation.

- **`skill`**: `engine: {adapter: "skill", entry: "SKILL.md", credential: "api-key"}`. Loads the Claude Code skill directory (SKILL.md frontmatter + body + `references/`), runs it through the existing `claude-agent` engine with the SKILL.md body as the system prompt, workdir pinned to the directory, capabilities from the manifest, `submit` tool built from `outputSchema`. Any Claude Code skill becomes a listing without a rewrite.
- **`mcp`**: `engine: {adapter: "mcp", command: ["bunx", "some-mcp-server"], tool: "get_weather"}` or `url` for streamable HTTP. The runner starts the server (stdio) with the scrubbed env plus declared secrets, calls one tool per listing with the buyer input as arguments, validates against `outputSchema`, reports `stopReason: end_turn` on success and `error` on `isError`. `arcade publish mcp://` introspects `tools/list` and writes one manifest per tool (input schema copied from the tool's `inputSchema`). Uses `@modelcontextprotocol/sdk` already in the workspace.
- **`openapi`**: `engine: {adapter: "openapi", spec: "openapi.json", operationId: "…"}`. `arcade publish openapi.json` writes one manifest per operation; the runner calls the operation with declared secrets as headers/query, never exposing the upstream URL or keys (they stay in the private half of the manifest).
- Publish wizard in the web app (M8) drives the same CLI code path.
- Demo listings: one real SKILL.md (e.g. `diff-triage` refactored to a skill dir), one MCP server (a public read-only server), one OpenAPI (a free public API).

## 4. M2 — Settlement core

### 4.1 Input gate
Validate the body against `listing.inputSchema` before any payment work (`validateJson` generalised from `apps/hub/src/validate.ts`); `400 input_invalid`, no job. Also enforced by the canary (M3).

### 4.2 Lineage capability
`x-arcade-hire-capability: base64url(payload).base64url(HMAC-SHA256(ARCADE_HUB_SECRET, "arcade-hire-v1:" + canonicalJSON(payload)))`, `payload = {v:1, aud:"arcade-hire", parentJobId, expiresAtMs}`. Issued on `JobAssignment.hireCapability` with `parentJobId` for listings declaring `hire-skills`; the daemon passes it into `openJob`; the broker adds it to the child probe and paid retry via `PurchaseArgs.lineage`, forwarded by `fetchWithPayment`. The hub verifies MAC and expiry, loads the parent, requires it `running`, and **derives** `rootJobId`, `hop`, `ancestors` from the store. Refusals: `lineage_invalid`, `lineage_cycle`, `lineage_depth` (`ARCADE_MAX_HOP` default 3 to allow a three-level demo), `tree_budget_exceeded`. No header = root call.

### 4.3 Tree reservation ledger
SQLite `tree_reservations(root_job_id, child_job_id, amount_atomic, state)`, `state ∈ {reserved, committed, released}`; ceiling = root listing's `bounds.maxSubSpendUsd`; reserve in one `BEGIN IMMEDIATE` at the child's paid retry; commit on settle; release on any other terminal outcome or root termination.

### 4.4 FeeSplitter v2 and the on-chain tree
`contracts/FeeSplitterV2.sol` keeps the immutable `seller`, `treasury`, `feeBps`, `withdrawFees()`, `quote()` and adds:

```solidity
function settleWithTree(AuthParams calldata auth, bytes32 treeHash, uint32 childCount, uint256 childTotalAtomic) external;
event SettledTree(address indexed from, uint256 value, uint256 sellerAmount, uint256 feeAmount, bytes32 nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic);
```

`treeHash = keccak256(canonicalJSON({rootJobId, children:[{jobId, skillId, priceAtomic, settleTx}]}))`, computed by the hub after all children are terminal and before the root settles. Child hops keep settling immediately from the hiring seller's working capital (per-hop settle-on-success survives; a parent cannot free-ride on a child by failing). The root transaction commits the tree, so a later receipt cannot omit a child without contradicting the chain. Foundry tests extend `contracts/test/FeeSplitter.t.sol`; deploy script parametrised by network; `EIP3009Live.settle` calls `settleWithTree` when a v2 splitter is announced and `settle` otherwise.

### 4.5 Job and receipt fields
`Job`: `rootJobId`, `parentJobId?`, `hop`, `ancestors[]`. `Receipt`: the same plus `children[{jobId, skillId, priceAtomic, settled, settleTx?}]`, `treeHash?`, `authorizationNonce`, `treeCeilingAtomic`, `treeCommittedAtomic`, `receiptSignature` (EIP-191, `ARCADE_ATTESTER_KEY`). `GET /jobs/:id/result` returns the tree; `/receipts` still omits `jobId` and `buyer`.

### 4.6 Claims
"Hub-committed receipt tree: the root settlement carries the tree hash on chain." "Hop two is the hiring seller's working-capital wallet; the buyer pays exactly the root price." "We never broadcast on failure." Never "cannot capture", never "your budget composes".

## 5. M3 — Pay-tested listings

`apps/hub/src/canary.ts`: a hub-owned buyer key (`ARCADE_CANARY_KEY`, faucet-funded) buys every listing once per `ARCADE_CANARY_INTERVAL` (default 24h, 10 min in the demo) with the listing's declared `canaryInput` (new optional public manifest field; falls back to a schema-derived example), at the listed price, through the normal paid path. Outcome per listing: `payTested: {at, jobId, settleTx?, ok}`. Three consecutive failures (unsettled or runner offline) → `delisted: true`, hidden from `/listings`, `/openapi.json`, `/.well-known/x402` and `/skill.md` until a runner reconnects and passes. Canary receipts are real receipts and appear in the feed marked `canary`. The listing page shows "pay-tested N hours ago · tx" or "delisted: failed pay-test".

## 6. M4 — ERC-8004 on Arc, all three registries

Arc testnet registries (docs.arc.io): Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`, Validation `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`. Keys: seller key (owner), `ARCADE_OPERATOR_KEY` (hub, approved once by the seller with `setApprovalForAll`), `ARCADE_VALIDATOR_KEY` (hub), `ARCADE_ATTESTER_KEY` (hub, neither owner nor operator). The seller address has gas after its first settlement because USDC is gas on Arc; `arcade identity register` refuses with a clear message if unfunded.

- **Identity**: `arcade identity register <skill>` calls `IdentityRegistry.register(agentURI)` from the seller key, `agentURI = <hub>/listings/<id>/agent-registration.json` (public JSON: `active`, `x402Support: true`, endpoints, ENS name, `supportedTrusts: ["arcade-validation"]`); persists `agentId`; then `setApprovalForAll(ARCADE_OPERATOR, true)`. Runs for every listing the seller publishes (explicit command, idempotent).
- **Validation**: after each job reaches a terminal state, the hub operator key calls `validationRequest(ARCADE_VALIDATOR, agentId, requestURI, requestHash)` where the request JSON holds the input hash, output hash, schema hash and outcome; the validator key answers `validationResponse(requestHash, settled ? 100 : 0, responseURI, responseHash, "arcade-settle")`. Best-effort, queued, never blocks settlement. ARCADE is the first marketplace exercising the ValidationRegistry per job.
- **Reputation**: attester calls `giveFeedback(agentId, 1, 0, "arcade-settled", skillId, endpoint, receiptURI, keccak256(feedbackJSON))` only on settled receipts, feedback JSON with `proofOfPayment{…txHash: settleTx}`.
- Display: agent id, registration tx, validation pass count, attester-filtered feedback count, labelled "settlement evidence". Never `getSummary`, never a gate, never a score.

## 7. M5 — ENSv2 namespaces

Sepolia ENSv2, deployment set resolved at runtime via `RootRegistry.getSubregistry("eth")`.

- **Layout**: parent `<label>.eth` (owner-registered, MockUSDC); per-seller UserRegistry via `VerifiableFactory.deployProxy`, wired with `setSubregistry`/`setParent`; per-skill subnames `<skill>.<seller>.<parent>.eth`, non-transferable (no `ROLE_CAN_TRANSFER_ADMIN`), **expiry = now + `ARCADE_ENS_TTL`** (default 6h; 15 min in the demo).
- **Liveness as expiry**: the runner holds `ROLE_RENEW` on its own subnames and calls `renew(anyId, now + TTL)` on every heartbeat cycle while a skill is served. A runner that dies stops renewing; the name expires; `getEnsText` returns nothing; the hub marks the listing `expired` and buyers resolving by name get nothing. Reconnecting renews (revival semantics restore owner and roles).
- **Records** (PermissionedResolver per seller): `arcade.payTo`, `arcade.chain = eip155:5042002`, `arcade.priceAtomic`, `arcade.endpoint`, `agent-endpoint[web]`, `agent-endpoint[mcp]` (the hub's MCP URL), `agent-context`, `agent-registration[<erc7930 Arc IdentityRegistry>][<agentId>] = "1"` (ENSIP-25). Daemon key: `authorizeTextRoles` for `arcade.priceAtomic` only.
- **Hire by name**: `hire("counterparty-graph.ss251.<parent>.eth")` and `arcade_call_skill({name})` resolve `arcade.endpoint`, `arcade.payTo`, `arcade.chain` from ENS and refuse `ens_payto_mismatch` if the 402 disagrees; the web confirm card shows the name.
- **Demo beats**: price update → revoke → `setText` reverts; tampered 402 → buyer refuses; kill a runner → its name expires → listing gone. Delist = `unregister`.

## 8. M6 — Gateway Nanopayments sessions

Prove `GatewayLive` on Arc testnet end to end (`scripts/g2c-nanopay.ts` is the existing gate): buyer deposits into the Gateway wallet, signs `GatewayWalletBatched` authorizations per call, hub verifies via `POST /v1/x402/verify` and settles via `/v1/x402/settle` after validation, batched by Circle's facilitator. Product surface: a **session** in the buyer SDK/MCP (`arcade_open_session({budgetUsd})`) that runs N calls against one deposit with one batched settlement, and a session receipt listing the calls. Loop agents stop paying 0.00218 USDC gas per call. If the facilitator refuses Arc in the first 4 hours of the workstream, the session surface ships over EIP-3009 with per-call settlement and the README states Gateway as code-complete, unproven.

## 9. M7 — The Graph

- **ARCADE ledger subgraph** on `arc-testnet` in Subgraph Studio: data sources FeeSplitter v2 (all announced splitters via templates) and the three ERC-8004 registries; entities `Settlement`, `Tree`, `Agent`, `Validation`, `Feedback`, `Listing`. The hub reads settlement counts, tree stats and per-agent evidence from the Studio query URL (Studio API key) for `/listings`, the MCP `describe`, and the dashboards; SQLite stays authoritative for job state. If Studio rejects `arc-testnet` in the first 4 hours, fall back to hub-computed stats and keep the cost-of-goods skill as the Graph entry.
- **Cost-of-goods skill** `skills/counterparty-graph/` (engine `script`, $0.05): pinned Base Agent0 subgraph `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb` via `https://gateway.thegraph.com/api/x402/subgraphs/id/<id>` with `@graphprotocol/client-x402`, $0.01 per query, payer key in the OS keychain; synthesises `{verdict, identities[], attesterSettledCount, contradictions[], sources[]}`; any failure → no schema-valid output → Arc never settles. `SKILL.md` documents the split (buyer pays on Arc, seller buys facts on Base). Subgraph MCP used at dev time, cited.

## 10. M8 — Web app

`apps/web` grows from one page to: `/` marketplace (names, prices, pay-test status, live stats from the subgraph), `/skill/:name` listing page (schemas, bounds, pay-test history, ERC-8004 evidence, receipt trees rendered as a graph with Arcscan links), `/seller` dashboard (revenue, inference cost, sub-spend, margin per call, ENS liveness, identity status), `/buyer` dashboard (budget, sessions, receipts, trees), `/publish` wizard (skill dir / MCP / OpenAPI → manifest preview showing exactly what leaves the machine → `arcade start` instructions), and the existing chat with hire-by-name. Design follows the repo's `design-sauce` conventions; every number comes from receipts or the subgraph, never the seller.

## 11. M9 — Chain config, mainnet, interop

`ChainConfig` (`packages/core/src/chain-config.ts`, manifests `config/chains/arc-testnet.json` ready and `arc-mainnet.json` pending) selected by `ARCADE_NETWORK`; boot checks (`eth_chainId`, USDC `name/version/decimals`, `authorizationState`, facilitator balance, splitter bytecode, `pending` refuses, Gateway refused where `gateway: null`); both testnet RPC hosts accepted; `docs/mainnet-runbook.md` with the Sept 16 to 30 checklist; **the flip is executed on Sept 16** and evidence appended to the README after submission (allowed by the Arc prize's Sept 30 window). Circle CLI interop: `circle services pay` against an unchanged endpoint, filmed.

## 12. Errors, tests, gates

Stable error codes: `input_invalid`, `lineage_invalid`, `lineage_cycle`, `lineage_depth`, `tree_budget_exceeded`, `ens_payto_mismatch`, `ens_name_expired`, `listing_delisted`, `session_budget_exceeded`. ERC-8004, ENS and subgraph writes are best-effort side effects that never change settlement outcomes; the pending mainnet manifest fails closed.

Tests per move: input gate (400 before verify); lineage (forged/expired capability, cycle, depth, two concurrent children vs a ceiling that fits one); ledger restart; FeeSplitterV2 Foundry (tree event, nonce reuse, fee math); adapters (skill dir runs, MCP tool call with `isError`, OpenAPI operation with secret header; secrecy property test extended to the new private fields); canary (three failures delist, reconnect relists); ERC-8004 (request/response/feedback keys and idempotency, unfunded seller refusal); ENS (expiry, renew, mismatch); Gateway (verify/settle round-trip, session receipt); Graph skill fixtures; web component tests. Live evidence scripts: `e2e-lineage.sh`, `e2e-tree-settle.sh`, `e2e-canary.sh`, `e2e-graph-cogs.sh`, `e2e-gateway-session.sh`, `ens-demo.ts`, `chain-check.ts`. Gates before every merge: `bun run test`, `bunx tsc --noEmit`, `bun run web:build`, `forge test`.

## 13. Execution model and schedule

Conductor plus parallel executor agents, each on its own branch and worktree, merged through the gates above. Settlement core lands first because every other stream depends on the receipt and lineage shapes.

| when | stream(s) |
|---|---|
| Fri 5 | M2 input gate, lineage, ledger, receipt tree (single stream; contract v2 started in parallel) |
| Sat 6 | M2 FeeSplitterV2 + settleWithTree wired; M9 ChainConfig; Studio and Gateway 4-hour smoke tests |
| Sun 7 | parallel: M1 adapters · M3 canary · M4 identity+validation · M5 names+expiry · M7 skill |
| Mon 8 (check-in) | parallel continues: M1 wizard CLI · M4 feedback · M5 payTo lock + hire by name · M6 sessions · M7 subgraph · M8 marketplace + listing page |
| Tue 9 | parallel: M6 finish · M7 hub reads subgraph · M8 dashboards · M9 Circle CLI |
| Wed 10 | M8 publish wizard + receipt-tree graph · integration on main · three-hop demo economy stood up |
| Thu 11 (check-in) | integration, e2e evidence scripts, README split, diagram, mainnet dry run |
| Fri 12 | freeze at noon; capture; owner narrates; submission draft |
| Sat 13 AM | buffer; submit before 12:00pm EDT |
| Sept 16 | mainnet flip, evidence appended |

Cut order if behind: `openapi` adapter → App Kit funding (not in scope unless free) → Gateway sessions (fallback to EIP-3009 sessions) → ARCADE subgraph (fallback hub stats) → buyer dashboard → ENS liveness-expiry (keep names + payTo lock) → validation registry (keep identity + feedback). Never cut: input gate, lineage + ledger, FeeSplitterV2 tree commitment, `skill` + `mcp` adapters, canary pay-tests, Graph skill, ChainConfig + runbook, marketplace + listing page, README split, video.

## 14. Demo (finalist 4 min + Q&A; async video 3:45)

1. Publish an MCP server as paid tools live; show the manifest preview: what leaves the machine, what stays.
2. Failed job first: bad output → unsettled receipt → no tx → unchanged balance.
3. A buyer agent hires by ENS name; three hops settle; the root tx carries the tree hash; the tree renders with Arcscan links; `A→B→A` refused.
4. Graph: facts bought on Base at one cent; key removed → no Arc settlement.
5. Trust: a listing fails its pay-test and vanishes; a runner is killed and its ENS name expires; ERC-8004 identity, validation and settlement feedback for the skill on Arc.
6. Sessions: twenty calls, one Gateway settlement, one session receipt.
7. The economy queried from the subgraph; the seller dashboard's margin per call.
8. Continuity and mainnet: what existed through `57183db`, what is new, the Sept 16 flip.
