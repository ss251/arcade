# R1 — Claude Fable 5.1 (conductor's independent position)

Written before reading the other two positions. References are repo paths, docs URLs, or report files in `..` that carry post URLs.

## Q1 — Hop lineage: what is actually enforceable

The plan in §4 overstates one thing and I am correcting my own claim. At hop 2 the money that moves is the **seller's** sub-purchase wallet (`ARCADE_SUBBUY_KEY`, `packages/runner/src/hire-broker.ts`), not the buyer's. The buyer pays exactly `price(A)` and nothing else, by construction of EIP-3009 (`packages/payments/src/eip3009.ts`). So "the buyer's cap composes down the tree" is false and must not be said in the video.

What lineage **does** make enforceable, because every hop's 402 passes through the same hub (`apps/hub/src/server.ts:771`):

1. **Termination.** Refuse a call whose `ancestors[]` already contains the listing id (`A→B→A`), and refuse beyond `maxDepth` (default 2). This closes T-SPEND-003 as stated in `docs/threat-model.md` ("a header, one check at the paid endpoint, and pass-through in the hire broker").
2. **A tree-wide ceiling the hub can hold.** The root listing declares `bounds.maxSubSpendUsd` today (`skills/counterparty-brief/arcade.json`). With `rootJobId` on every descendant, the hub can sum descendant `priceAtomic` and refuse the hop that would exceed the root's declared ceiling. That is a real invariant: *total money moved by descendants of one buyer action ≤ the ceiling the root seller published*. It is enforceable because the hub sees every hop. It is not enforceable across two hubs; say so.
3. **A receipt tree.** `Receipt` (`packages/core/src/receipt.ts`) gains `parentJobId?`, `rootJobId?`, `hop`, and the parent receipt gains `children: [{jobId, skillId, settleTx?, priceAtomic}]`. `GET /jobs/:id/result` returns the tree. A stranger opens the root settle tx on Arcscan, follows the child tx hashes, and checks the sum. That is the demo beat.

Wire format (opinion, but concrete): a request header `x-arcade-lineage: <base64 JSON {rootJobId, parentJobId, ancestors:[skillId...], hop}>` signed into nothing — it does not need to be trusted, because the hub **assigns** lineage from the parent job it already knows: the broker passes the parent `jobId` + job token, the hub looks the parent up in `store.getJob` and derives `ancestors` itself. A forged header buys nothing. That keeps "no nested-payment concept" (`docs/architecture.md`, "The chain").

Honest claim for the video: "A skill can hire a skill. The hub refuses cycles, bounds depth, and caps what the whole tree can pass on at the ceiling the root seller published. Every child settlement is linked from the parent receipt." Not: "your budget composes".

## Q2 — ERC-8004 on Arc + The Graph on Arc

This is the finding that changes my plan. The three ERC-8004 registries have code on Arc testnet at the canonical addresses and are documented by Arc itself (https://docs.arc.io/arc/tutorials/register-your-first-ai-agent#erc-8004-contracts-on-arc-testnet). The Graph's registry lists `arc-testnet` as Studio-indexable (`../thegraph.md` §0). The prize text accepts "querying Subgraphs with an API key from Subgraph Studio" as live data (`../prizes-page-2026-09-04.txt`, Graph continuity requirements).

Position: **do both, with the Arc subgraph as the load-bearing Graph integration and the Base x402 hop as the cost-of-goods beat**, and treat ERC-8004 as a *ledger the marketplace writes*, not a score the marketplace trusts.

- **Identity:** on `arcade start`, the runner registers each listing once in the Arc IdentityRegistry (agent URI = the hub's `/listings/:id`, which is already the public projection). This is one `register()` per listing per the EIP (https://eips.ethereum.org/EIPS/eip-8004). Cheap, and it turns every ARCADE seller into a discoverable 8004 agent on the chain it settles on.
- **Reputation, receipt-shaped:** feedback is written **only on settlement**, with the settle tx hash in the feedback file. ARCADE's existing rating already requires a settled receipt and the buyer's signature (`apps/hub/src/server.ts:719-760`, `ratingDigest`). Mirroring that on-chain is exactly the "settlement-tied 8004 receipt" the landscape sweep says nobody ships (`../x-landscape.md`, Agent Rails / SmartSentinels bullets). The arXiv Sybil finding (https://arxiv.org/abs/2606.26028) is about *unpriced* feedback; feedback that costs a settled USDC payment is the sybil-resistance-by-economics that `internal/ARCHITECTURE-C6.md` §5 designed in 2026-07. **Open verification:** who may call `giveFeedback` and whether it needs the agent's `feedbackAuth` signature — read the EIP and the deployed ABI before committing; if the client must be the buyer, the buyer SDK signs it alongside the rating; if the hub can, the hub does.
- **The Graph, load-bearing on Arc:** deploy the Agent0 schema (`https://github.com/agent0lab/subgraph`) to `arc-testnet` in Subgraph Studio pointing at the three Arc registries. ARCADE's discovery surfaces — `GET /listings`, the MCP `arcade_list_skills`, the web catalog — read **settled-feedback counts and identity** from that subgraph with a Studio API key. The buyer-side ceiling logic (`packages/buyer/src/mcp.ts`, `ARCADE_MAX_CALL_USD`) gets one new rule: a listing with zero settled 8004 feedback is capped at a first-call amount (say $0.05) unless the buyer raises it explicitly. That is "meaningful work with the data" that gates a payment decision, and it is honest: it does not trust a score, it trusts *whether anyone has ever been paid for this listing on chain*.
- **The Base x402 hop** stays as P1b: a `subgraph-brief`-style skill (or `counterparty-brief` extended) whose facts come from a live Graph query paid at $0.01 USDC on Base mainnet via `@graphprotocol/client-x402` (`../thegraph.md` §7 probe). Failure of the Graph payment → parent does not settle. This is the only path that exercises the prize's "pay per query autonomously with x402" line.

Risk: Studio rejecting `arc-testnet` despite the registry entry. Smoke test on day 1 with a trivial manifest; if it fails, the 8004 writes still stand on their own (Arc prize) and Graph falls back to P1b only.

## Q3 — What a buyer agent needs before paying a stranger

The X complaint is "paid, got a 400" and "93% never verified by a paid purchase" (`../x-grill-0xgrill.md` §d). ARCADE already removes the first by construction: the authorization is never broadcast on failure (`apps/hub/src/pipeline.ts`, `docs/architecture.md` "Trust order"). What it does not give a buyer today:

1. **Proof the payTo is the seller.** The handshake signature proves it to the *hub*, not to the buyer. ENS payTo-lock (Q5) or the 8004 identity record gives the buyer a second, independent binding to check before signing. This is the single addition that most reduces "payTo ≠ the site you think" (`../x-landscape.md`, Revettr payTo-mismatch bullet).
2. **Evidence anyone has ever been paid.** Objective stats exist (`ObjectiveStats`, `packages/core/src/receipt.ts`) but live only in the hub's SQLite. On-chain settled feedback makes them checkable without trusting ARCADE.
3. A pre-pay probe is unnecessary here: listing, describing and quoting are free and sign nothing (`docs/narration/beat-3a.txt`), and the price comes from the endpoint's own 402.

Seller side: vs Bazaar and the Circle Marketplace, ARCADE needs no server, no port, no form, and the prompt and keys stay home (`docs/seller-guide.md` "What you keep"). That is the pitch already; what a seller lacks is a name (ENS) and portable reputation (8004) that survives if ARCADE disappears.

## Q4 — One sentence, and the trust family

"ARCADE sells agent labor, not API access: the seller's code never leaves their machine, the buyer's money never moves unless the output validates, and every sub-hire is on the receipt." Mars (https://ethglobal.com/showcase/mars-ua1qc) audits and *installs* skills; AgentForge (https://github.com/0xE1337/agentforge) is a registry with ratings; neither claims the secrecy boundary or never-capture.

Trust family: **never-capture**. Video line, once: "Orthogonal refunds after the fact. Escrow locks first. We never capture: a failed job's authorization is never broadcast."

## Q5 — ENS vs World

Expected value says World ($3,500 vs $500). Coherence says ENS **only if** Q2 is adopted, because then ENS closes the loop: `ENSIP-25 agent-registration[<erc7930 Arc IdentityRegistry>][<agentId>]` on the seller's subname points at the Arc 8004 id (`../ens.md` §4.2), and `authorizeTextRoles` lets the daemon rotate price but never payTo. One day of work that makes the identity story cross-chain and standards-based. If Q2 is dropped, ENS is a $500 tax and World is the better third partner. Opinion.

## Q6 — Mainnet-ready by Sept 30

What must be true in the repo for a judge to believe it: a single `packages/core/src/chain.ts` (new) holding `{chainId, rpc, usdc, explorer, feeSplitter}` per network, selected by `ARCADE_NETWORK=arc-testnet|arc-mainnet`, with the mainnet entry present but explicitly `pending: true` until Circle publishes parameters (`../arc-circle.md` §5); a test that refuses to boot the hub on `pending` params; `scripts/deploy-splitter.ts` parametrized by network; `docs/runbook.md` gaining a "Sept 16 flip" section with the exact commands; and the CLAUDE.md RPC hostname corrected. The mainnet rail is EIP-3009, because Gateway is testnet-only on Arc (`../arc-circle.md`). Say in the video that the flip happens in the Sept 16–30 window.

## Q7 — Scope and cuts

Cut order if behind: ENS → Base x402 hop → 8004 feedback writes (keep identity registration) → `circle` CLI buyer. Never cut: lineage + receipt tree, failed-job demo, mainnet config.

## My ranked 8-day plan

- **Day 1:** lineage + receipt tree (hub, broker, buyer SDK), tests. Studio `arc-testnet` smoke test. Chain config + mainnet placeholder + runbook.
- **Day 2:** finish lineage; `A→B→A` refusal test live; tree visible on hub UI and `/jobs/:id/result`.
- **Day 3:** ERC-8004 identity registration on `arcade start`; settlement-tied feedback (after ABI check); Arcscan evidence.
- **Day 4:** Agent0 subgraph on arc-testnet; hub/MCP read identity + settled-feedback counts from Studio; first-call cap rule.
- **Day 5:** Graph cost-of-goods skill via `@graphprotocol/client-x402` on Base; parent-does-not-settle-on-supplier-failure test.
- **Day 6:** ENS payTo-lock + ENSIP-25 record (or World AgentKit if swapped).
- **Day 7:** README pre-existing/new split, SKILL.md for the Graph skill, spec docs, `circle` CLI buyer if time.
- **Day 8:** video capture, narration recording by the owner, submission form, Circle Marketplace intake form (not a feature).

## Video, beat by beat

1. Failed job: schema miss → no tx → buyer balance identical (Arcscan side by side).
2. Success: $0.01 in, seller share + fee, tx.
3. Hire hop: parent receipt lists child settle tx; `A→B→A` attempt refused with the reason; tree sum ≤ root ceiling.
4. Graph: the skill's answer comes from a live subgraph; the $0.01 Base payment is on screen; kill the Graph key → parent does not settle.
5. Identity: the seller's Arc 8004 id and settled feedback appear in the catalog via the Arc subgraph; ENS subname resolves to the same payTo; revoke the role → next call refuses.
6. Mainnet: the one-line flip and the runbook date.

## Minimum that wins each prize

- **Arc continuity:** lineage + receipt tree + mainnet config, with Arcscan evidence.
- **Graph continuity:** the Arc subgraph read gating the first-call cap **or** the Base x402 skill; both is the 1st-place bid.
- **ENS continuity:** payTo-lock with live revoke; ENSIP-25 record is the flourish.

## Addendum (verified after writing, before reading the others)

ERC-8004 text at https://github.com/ethereum/ERCs/blob/master/ERCS/erc-8004.md: "New feedback can be added by any *clientAddress* calling `giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)`"; "The feedback submitter MUST NOT be the agent owner or an approved operator for *agentId*"; the off-chain feedback file schema includes a proof-of-payment block `{fromAddress, toAddress, chainId, txHash}`; `appendResponse` lets anyone (e.g. the agent showing a refund) annotate feedback. So the **hub's facilitator address may write settlement-tied feedback itself** (it is neither owner nor operator of the seller's agent), with the Arc settle tx in the proof-of-payment block, and no buyer signature is required on-chain. Registration is `register(agentURI)` returning `agentId` (ERC-721 mint) and emits `Registered(agentId, agentURI, owner)`.
