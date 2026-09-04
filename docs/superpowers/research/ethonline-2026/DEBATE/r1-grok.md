# Grok 4.6 — Round 1 independent position

The conductor’s stripped-A plan is pointed at the right product. It is wrong about what hop lineage can prove on Arcscan, wrong to treat client-supplied 402 metadata as enforcement, and a day too fat on P0. Keep Arc + Graph + ENS. Do not swap ENS for World.

---

## Attack on §4 (stripped A)

**Right, and why.** Failed-job-first is already the product (`packages/core/src/job.ts:96-136` `shouldSettle`; `apps/hub/src/pipeline.ts:136-138` never broadcasts on failure). Closing T-SPEND-003 is the only High residual that becomes reachable the moment a second `hire-skills` listing exists (`docs/threat-model.md:181-189`; `README.md:131`). Graph as cost-of-goods, with the Arc parent refusing to settle if the Graph hop fails, is the only reading of “load-bearing” the Continuity AI prize cannot wave off (`prizes-page-2026-09-04.txt:147-177`; Graph x402 is Base-only, https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/). Cutting 8004 *score gating* is correct. ENS as a one-day `authorizeTextRoles` payTo-lock is the prize-text feature, not a vanity name (`prizes-page-2026-09-04.txt:763-770`). Chain params out of `packages/core/src/chain.ts` is required for the Sept 30 “deployment-ready” clause (`prizes-page-2026-09-04.txt:517-543`).

**Wrong.**

1. **“Caps only shrink” is not a property of the buyer’s EIP-3009.** Hop 2 is signed by the seller’s `ARCADE_SUBBUY_KEY` (`packages/runner/src/hire-broker.ts:191-198`), a separate wallet from the original buyer. Architecture is explicit: “each hop is an independent x402 call… there is no nested-payment concept” (`docs/architecture.md:84`). A stranger opening the parent `settleTx` on Arcscan sees buyer → parent `payTo`. The child tx is sub-buy wallet → hired seller. You cannot prove “tree spent ≤ the buyer’s root cap” from the buyer’s USDC. The honest claim is a **hub policy over seller working capital**, attested on the receipt, with child hashes a stranger can open. It is not a nested authorization.

2. **Client-supplied `ancestors[]` in 402 metadata is forgeable.** T-SPEND-003’s stated fix is “a hop count and an ancestor set as x402 request metadata… refused at the paid endpoint” (`docs/threat-model.md:188`; `apps/hub/src/server.ts:771`). A colluding pair omits the header and the hub treats the call as a root buy — which is the bug today (`packages/buyer/src/hire.ts:88-92` sends `{skillId,input,maxAmountUsd}` and nothing else). Enforcement has to be a **hub-issued HMAC token**, the same object the hub already uses for job tokens (`apps/hub/src/server.ts:711`) and the runner already uses for hire (`packages/runner/src/hire-broker.ts:107-114`). Display lineage on the 402 `extra` and the receipt; do not trust the client to report its own ancestors.

3. **P0 is sized as three days of Arc ceremony.** Hop tokens reuse existing HMAC machinery. Failed-job is already wired. The `circle` CLI buyer is a half-day checkbox, not a P0 pillar. Spend the recovered day on proving `GatewayLive` (`packages/payments/src/gateway.ts` — code-complete, never live) because the Arc prize names Nanopayments (`prizes-page-2026-09-04.txt:440`).

4. **“Cut 8004 reputation gating” is not “do not touch 8004.”** Circle’s own blog says the registries are live and the **signal is missing** (https://www.circle.com/blog/building-the-open-agentic-economy). Arc already deployed the three CREATE2 registries (`IdentityRegistry 0x8004A818…`, `ReputationRegistry 0x8004B663…`, `ValidationRegistry 0x8004Cb1B…` — https://docs.arc.io/arc/tutorials/register-your-first-ai-agent). Writing `giveFeedback` with the Arc `settleTx` in `evidenceURI` is a half-day and is the opposite of reading Sybil scores. Do not deploy an Agent0 subgraph on Arc as P1.

---

## §5 answers

### 1. Builder — hop lineage and the honest claim

**Yes, hop lineage + tree budget is the right P0**, because T-SPEND-003 is High once a second hiring skill lists, and `counterparty-brief` already hires `usdc-flow-check` (`skills/counterparty-brief/arcade.json:14-18,142-145`; `README.md:119`). Agent Rails stated the market hole: under x402 the EIP-3009 signature is the authority, so subcontracting means sharing key material or underwriting the sub; “nobody has shipped a handoff that only narrows” (https://x.com/AgentRails/status/2093496041119363283). ARCADE already does the no-key-share half (`hire-broker.ts`). The missing half is the tree.

**Wire format (opinion on names, facts on existing headers):**

- Request header `x-arcade-lineage` (separate from `payment-signature` / `x-payment` in `packages/payments/src/types.ts:115-119`). Body: `{ rootJobId, hop, ancestors: skillId[], remainingCapAtomic, mac }`. `mac = HMAC(ARCADE_HUB_SECRET, canonical(fields))`. Root calls have no header; hub issues the token on `store.putJob` (`server.ts:817-828`) and returns it with the 202. The broker must present it on `/hire`.
- Hub at `POST /x/<seller>/<skill>` (`server.ts:770-788`): verify MAC; refuse if `listing.id ∈ ancestors` (cycle); refuse if `hop ≥ MAX_HOP` (ship 3); refuse if `parsePrice(listing.price) > remainingCapAtomic`. Issue a child token with `remainingCapAtomic' = remaining − price`, `ancestors' = ancestors ∪ {parentSkillId}`, `hop' = hop+1`. Caps only shrink because the MAC binds the number the hub wrote.
- 402 `accepts[].extra` may *advertise* `{ settlement: "on-validated-output", hop, rootJobId }` next to the existing OpenAPI block (`apps/hub/src/openapi.ts:348-358`). Do not put remaining cap in `PaymentRequirements.amount` — that field is the listing price (`types.ts:17`).
- Receipt (`packages/core/src/receipt.ts:16-58`) gains `hop`, `ancestors[]`, `rootJobId`, `remainingCapAtomic`, `childSettleTxs[]`. `/receipts` already emits `explorer` from `settleTx` (`server.ts:703`). Child hashes are the Arcscan tree.

Within one job, “caps only shrink” is already true: sandbox `maxAmountUsd` may only narrow remaining (`hire-broker.ts:175-180`); absent `maxSubSpendUsd` is zero (`README.md:126`). Across jobs it is not: `daemon.ts:224` opens a fresh ledger from the *hired* skill’s own bound.

**Honest claim for the video:** “The protocol refuses cycles and refuses a hire priced above remaining tree budget. Each hop is still an independent EIP-3009 from the hiring seller’s working capital. The original buyer’s USDC never funds hop 2. The receipt lists both settle hashes. A stranger can open them on Arcscan. The composition is a hub-attested policy, not a nested authorization.”

### 2. Builder — ERC-8004 and The Graph

**(a) Register + settlement-tied `giveFeedback`: yes, as P1.5 stretch, not a gate.** Arc tutorial: `register(string)` on IdentityRegistry; `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)` from a wallet that is **not** the agent owner (https://docs.arc.io/arc/tutorials/register-your-first-ai-agent). Hub facilitator is neither owner nor operator, so it can write. Put `settleTx` in `evidenceURI`. Mirror the existing rating gate: only settled receipts (`server.ts:728-730`). Do not call `getSummary()` in the buyer path. The arXiv Sybil finding (https://arxiv.org/abs/2606.26028) is decisive against **reading** scores; it is not decisive against **writing a receipt**. 0xdevair: “I refuse to pretend a badge is escrow, or that a score is a receipt” (https://x.com/0xdevair/status/2095411572663283938). ARCADE already has the better primitive: EIP-191 `ratingDigest(jobId, stars)` recovering to the receipt buyer (`server.ts:737-750`).

**(b) Agent0 subgraph on arc-testnet Studio: no as P1.** Studio can deploy (`thegraph.md` §0, networks registry `arc-testnet` / `eip155:5042002`, services: subgraphs only). It cannot be network-published, has no x402 endpoint, and has no Substreams. A marketplace-events subgraph also has almost nothing ARCADE-specific to index — settlement is `transferWithAuthorization` on USDC `0x3600…0000` (`packages/core/src/chain.ts:28`), not an ARCADE contract. `FeeSplitter` exists (`0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206`) but `feeSweepTx` has no production caller (`receipt.ts:9-10,46`). Day-1 smoke only if hours remain after the COGS skill.

**Which is stronger for Graph judges: Base x402 COGS.** Prize text names “let your agent pay per query autonomously with x402” and Subgraph MCP (`prizes-page-2026-09-04.txt:120-121,138-139`). That is two Graph products composed (MCP discovery + x402 execution), which also aims at the composable/standardized $5k sibling — Graph is one partner slot either way (`ethglobal.com/events/ethonline2026/info/details`: “If a partner has multiple tracks, you can be eligible for all of them while only counting as 1 Partner Prize”). Conductor probe that `testnet.gateway.thegraph.com` does not resolve is load-bearing: use **Base mainnet** `https://gateway.thegraph.com/api/x402/subgraphs/id/{id}` with `@graphprotocol/client-x402`, USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/). Dune’s Graph x402 tracker averages $0.01 (https://dune.com/paulieb/x402-payments-to-the-graph-e7ab). Both (COGS + Arc 8004 subgraph) is nicer; 8 days says COGS first.

**Opinion:** do not claim Graph x402 runs on Arc. Frame it as COGS: labor on Arc, facts bought where indexers live.

### 3. User — what a buyer/seller needs

**Buyer agent, in order:** (1) never-capture — already shipped as `x-arcade-payment.settlement: on-validated-output` (`openapi.ts:348-358`); (2) a pre-pay probe that is not another 402 — `ObjectiveStats` already computes success rate / p50 / p95 / availability from receipts (`receipt.ts:71-82`); surface those on `arcade_describe_skill` and in the 402 `extra`; (3) ENS-locked `payTo` so the listing cannot silently retarget; (4) fenced results (`packages/core` `fenceResult`, T-EXEC-003). Not 8004 scores. Not World on every call — AgentKit’s ZK proof is once at AgentBook registration, per-request is SIWE (`world.md`; https://docs.world.org/agents/agent-kit/integrate). Headless daemons already work without it.

**Single addition that most reduces “paid, got 400”:** it is already in the repo. Sean Geng: “There are no refunds in x402. Pay an endpoint, get back garbage that fails schema validation, and that money is gone” (https://x.com/seangeng/status/2080284961664327713). Revettr: paid calls answered with 400 (https://x.com/revettr_x402/status/2093339762786447506). Sen: 93% of 19,180 endpoints never verified by a paid purchase (https://x.com/sen_buidl/status/2093549214878048730). Orthogonal refunds *after* capture (https://x.com/casaisdev/status/2095591323269001474). ARCADE never broadcasts (`pipeline.ts:136-138`). The video must show this *first*, or judges file you under “another x402 wrapper.”

**Seller vs Bazaar / Circle Marketplace / Mars:** `toPublicListing` is a schema transformation with nowhere to put `engine.*`, `secrets`, `entry`, `systemPrompt`, `egress` (`packages/core/src/manifest.ts:17-20,248-261`). Runner is pull-model WSS, no open ports (`docs/architecture.md:37-38`). Circle Marketplace is a Google Form (https://developers.circle.com/agent-stack/agent-marketplace/get-listed). Mars *installs* audited skills (https://ethglobal.com/showcase/mars-ua1qc). Bazaar hosts URLs. The seller-trust sentence is: you sell labor without shipping the prompt, and you never work unpaid because verify precedes dispatch (`docs/architecture.md:10-16`).

### 4. Market — one sentence and the trust family

**One sentence:** ARCADE sells labor without shipping the prompt, and never broadcasts the USDC authorization unless the output validates — Mars audits and installs skills; AgentForge hosts a SkillRegistry and pays x402 inside the request; Orthogonal refunds after capture.

Evidence: Mars won Arc Best Agentic Economy at ETHGlobal NYC 2026 with escrow on Arc + x402 for use + Hedera audit trail + World-ID auditors (https://ethglobal.com/showcase/mars-ua1qc; https://x.com/arc/status/2070582871186907508). AgentForge (lablab.ai, April 2026) is “AI agents autonomously discover, pay for, and rate other agents' skills via Circle Nanopayments (x402)” with `gateway.pay(url)` wrapping handlers (https://github.com/0xE1337/agentforge) — that is Circle’s Express-middleware shape, which ARCADE rejected because jobs return 202 and settle minutes later (`packages/payments/src/rail.ts:49-51`; `docs/architecture.md:18-22`).

**Trust family that wins: never-capture.** Three families: off-chain refund (Orthogonal), escrow (Mars, x402r, Agentripe), never-broadcast (ARCADE). x402-foundation still arguing verify/settle (#2294) and facilitator timeout (#1062) (https://github.com/x402-foundation/x402/issues/2294). Video line, once: “Orthogonal refunds after. Mars locks then releases. We never captured. Nothing to refund because nothing was taken.”

### 5. Prizes — Arc + Graph + ENS, not World

Max 3 partners; multiple tracks under one partner count as one (https://ethglobal.com/events/ethonline2026/info/details). Continuity Arc is $1,666 + $1,500, not the $3,500 open “Launch” pot (`prizes-page-2026-09-04.txt:452-543`). Graph Continuity AI is $2,500/$1,500/$1,000. ENS continuity is **$500** (`prizes-page-2026-09-04.txt:763`). World AgentKit Continuity is $3,500 (`prizes-page-2026-09-04.txt:570`).

Paper EV: World is +$3,000. **Opinion: coherence beats EV.** World requires AgentBook, Sandbox App (phone, TestFlight/Play, Developer Portal — https://docs.world.org/world-id/sandbox/sandbox-access.md), and a feedback document. AgentBook docs conflict on Base vs World Chain (`world.md` §1). Mars already used World ID to Sybil-resist *auditors* of a skills marketplace. Doing World here is “Mars, but later.” ENS at $500 is the security punchline the bounty asked for: hierarchical registry, EAC, `PermissionedResolver.authorizeTextRoles` (https://docs.ens.domains/ensv2/permissioned-resolver). ENSIP-25 `agent-registration[<erc7930 registry>][<agentId>]` pointing at the Arc IdentityRegistry id (https://docs.ens.domains/ensip/25/) is a two-hour add *if* you already registered 8004 — not a reason to start 8004, and not a reason to drop ENS.

### 6. Risk — deployment-ready by Sept 30

Public mainnet is 16 Sep 2026, after the Sunday 13 Sep 12:00pm EDT deadline (https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026; https://ethglobal.com/events/ethonline2026/info/details). Docs still say “Mainnet addresses are not yet available” (https://docs.arc.io/arc/references/contract-addresses). Agent Wallets: Arc is “testnet only” (https://developers.circle.com/agent-stack/agent-wallets/supported-blockchains). Nanopayments on Arc is testnet-only (`arc-circle.md` §2).

**What must be true in the repo for a judge to believe the runbook:**

- `ARC_CHAIN_ID`, `ARC_RPC_URL`, `ARC_EXPLORER`, `ARC_CAIP2`, `USDC_ADDRESS`, `GATEWAY_WALLET`, `GATEWAY_DOMAIN`, `GATEWAY_FACILITATOR_URL` leave `packages/core/src/chain.ts:10-47` and become config. Today they are `as const`.
- RPC hostname is already drifting: repo `https://rpc.testnet.arc.network` (`chain.ts:15`; `skills/usdc-flow-check/arcade.json:42`); Arc node tutorial forwards to `https://rpc.testnet.arc.io/` (https://docs.arc.io/arc/tutorials/deploy-node-as-service). Both must be accepted.
- USDC dual-nature (native 18 / ERC-20 6 at `0x3600…0000`) is called out as the #1 bug source (`chain.ts:19-26`). Mainnet may keep the precompile; the runbook must say “re-probe `eth_chainId` + `decimals()` before flip,” not “paste 5042002.”
- FeeSplitter redeploy per seller (`FeeSplitter.seller` is immutable — `packages/payments/src/rail.ts:19-26`).
- `ARCADE_RAIL=eip3009|gateway` already exists (`README.md:58`). Prove GatewayLive on testnet or do not claim Nanopayments.
- `docs/mainnet-runbook.md`: env vars, faucet vs mainnet USDC, one-command rail swap, “do not `waitForTransactionReceipt`” (`CLAUDE.md` / `chain.ts:61-67`).
- Continuity README split + commit history. Frequent commits required (https://ethglobal.com/events/ethonline2026/info/details).

Demo on testnet during the hack. Push mainnet in the 17-day window. Say that in the video.

### 7. Scope — cut first, minima

**Cut first if behind:** World; Circle Marketplace Google Form; 8004 score gating; Agent0 subgraph on Arc; Substreams (Arc has none); App Kit unified-balance; container sandbox; `circle` CLI if it slips past 3 hours.

**Never cut:** hub-issued hop tokens; failed-job demo; Graph COGS skill; README pre-existing/new split.

---

## Ranked 8-day plan (solo)

**P0 — days 1–2 (Arc, the product).** Hub-issued `x-arcade-lineage` HMAC tokens; cycle + depth + remaining-cap refuse at `server.ts:771`; broker pass-through; receipt fields + `childSettleTxs[]`; a second hiring skill so `A→B→A` is demoable (today acyclic only because `usdc-flow-check` has no capabilities — `skills/usdc-flow-check/arcade.json:37-40`). Failed-job fixture that leaves buyer ERC-20 `balanceOf` unchanged. Extract `chain.ts` to config; draft the Sept 16–30 runbook. **Day 2 afternoon, one of:** live `GatewayLive` round-trip on Arc testnet *or* `circle services pay` as an alternate buyer (`@circle-fin/cli` 1.0.0). Not both.

**P1 — days 3–5 (Graph, the prize).** New skill (or extend `counterparty-brief`) whose work is a synthesized subgraph answer: Subgraph MCP `search_subgraphs_by_keyword` → `get_schema_by_subgraph_id` → `@graphprotocol/client-x402` on Base mainnet. Keychain-held Graph payer, never `.env`. If the Graph hop fails, `shouldSettle` is false — seller eats the Base $0.01, buyer pays 0 on Arc. `SKILL.md` required. Do not proxy raw GraphQL. **Optional +0.5d:** `register` sellers on Arc IdentityRegistry; hub `giveFeedback` on settle with `settleTx` as evidence. No `getSummary` gate.

**P2 — days 6–6.5 (ENS, $500 that earns the day).** One parent, two skill subnames on ENSv2 Sepolia. Resolve deployment set at runtime (`RootRegistry.getSubregistry("eth")` — two live sets, `ens.md`). `PermissionedResolver.authorizeTextRoles` grants the daemon key **price-only**. Buyer SDK refuses when hub `payTo` ≠ ENS `payTo`. Live revoke, next Arc call 402s. ENSIP-25 pointer only if 8004 register shipped.

**Days 6.5–8.** Continuity README (pre-existing 112 commits 2026-07-25→08-07 vs event work). Spec/plan artifacts. Architecture diagram (already `docs/architecture.excalidraw`). Video. Submission. Check-ins Sept 8 and 11.

If slipping on day 5: drop 8004 write, then Gateway prove, then compress ENS to four hours. Graph COGS and hop tokens stay.

---

## Video (2–4 min, ≥720p, human voice, no phone)

ETHGlobal rejects TTS, phone, <720p, >4 min (https://ethglobal.com/events/ethonline2026/info/details).

| t | Beat |
|---|---|
| 0:00–0:15 | Thesis: “the only way to sell a skill today is to hand over your prompt and API key.” Show `arcade publish` and `toPublicListing` — hub log has no `engine`/`secrets`. |
| 0:15–0:50 | **Failed job first.** Force schema miss on `usdc-flow-check`. Unsettled receipt, `reason: output failed the listing's outputSchema`. Arcscan: no new tx. Buyer `balanceOf` identical. “Nothing to refund because nothing was taken.” |
| 0:50–1:15 | Success. EIP-3009 `transferWithAuthorization` (cite live `0xc9b77c1e…` pattern, https://testnet.arcscan.app). `x-arcade-payment.settlement: on-validated-output`. |
| 1:15–2:20 | Hire tree. Buyer pays `counterparty-brief` ($0.25). It hires the Graph skill. Two Arc settles + one Base Graph x402 at $0.01. Receipt `childSettleTxs[]`. Then `A→B→A` refused. One sentence: hop 2 is the seller’s sub-buy wallet, not nested buyer funds. |
| 2:20–3:00 | ENS revoke. Daemon cannot change `payTo`. Buyer SDK refuses mismatch. |
| 3:00–3:40 | Continuity + mainnet: what existed (Encode×Circle Arc, 112 commits) vs event work. Runbook: flip config after Sept 16, deployed by Sept 30. |
| 3:40–4:00 | Diagram: verify → sandbox → validate → settle. Three families: refund / escrow / never-capture. |

---

## Minimum that still wins each partner prize

**Arc ($1,666 + $1,500).** Functional hub + web + runner; architecture diagram; hop-tree + failed-job on Arc testnet; continuity README; mainnet runbook with config-extracted chain params. Nanopayments named on the rubric — either a live Gateway settle or an honest “EIP-3009 is the judged rail, GatewayLive is code-complete.” That is enough. Circle CLI buyer is garnish.

**Graph (Continuity AI $2,500/$1,500/$1,000).** One open-source skill with `SKILL.md`, live Studio/gateway data, meaningful synthesis, x402 pay-per-query on Base mainnet, Arc parent does not settle if Graph fails. MCP discovery is the composition bonus, not the floor. An Arc Agent0 subgraph without the paid query is decorative and loses.

**ENS ($500).** ENSv2 Sepolia, not hardcoded addresses, EAC `authorizeTextRoles` on one text key, functional payTo-lock that changes a payment decision, live revoke in the video. A subdomain that only displays is cosmetic and is disqualified by the prize text.
