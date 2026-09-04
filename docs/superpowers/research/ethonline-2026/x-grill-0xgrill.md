
Blunt version: Approach A is three sponsor checklists taped to a product that already has a better story than any of them. The thing CT would actually quote-tweet is already in the repo. You are about to bury it under ENSIP text records and a reputation registry the empirical literature says is Sybil sludge.

Opinion, then receipts.

---

## (a) Saturation check

The catalog layer is **done**. You are not inventing “agents pay agents.” You are late to the directory war.

**The big indexes**

- Circle’s own Agent Marketplace is the curated catalog: **900+ paid services**, public Discovery API, listings still go through a **Google Form** and a human review. Circle said this out loud on Aug 12: today’s catalogs “inherit the limits of early web directories.” ([circle.com/blog/building-the-open-agentic-economy](https://www.circle.com/blog/building-the-open-agentic-economy), [developers.circle.com/.../get-listed](https://developers.circle.com/agent-stack/agent-marketplace/get-listed))
- Coinbase’s Bazaar / Agentic.Market is the “app store for agents.” April launch copy: **165M+ txs, ~$50M+ volume, 480K+ agents.** ([Nick Prince, May 13](https://x.com/Nickprince/status/2054658023314825376), [theblock.co](https://www.theblock.co/post/398123/coinbase-incubated-x402-protocol-unveils-app-store-for-ai-bots))
- Live crawls are larger and uglier: x402.new lists **14,760 services**; agent402.tools indexes **2,709 distinct payees / 3,461 endpoints**. ([x402.new](https://x402.new/), [agent402.tools/marketplace](https://agent402.tools/marketplace))

**The people already doing “skills as paid endpoints”**

- **Mars** won Arc’s *Best Agentic Economy* at ETHGlobal NYC 2026: “on-chain audited marketplace where AI agents safely buy verified skills,” escrow on Arc, x402 for use, Hedera for the audit trail. ([ethglobal.com/showcase/mars-ua1qc](https://ethglobal.com/showcase/mars-ua1qc), [Arc recap](https://x.com/arc/status/2070582871186907508))
- **AgentForge** (lablab.ai, April 2026): SkillRegistry on Arc, orchestrator hires skills, pays each via x402, rates on-chain. Same sentence as ARCADE, six months earlier. ([github.com/0xE1337/agentforge](https://github.com/0xE1337/agentforge))
- **Orthogonal**: **700+ endpoints, 50+ providers**, Coinbase x402 partner. They didn’t add identity. They added **refunds**. ([casaisdev, Sep 3](https://x.com/casaisdev/status/2095591323269001474), [Pickett article](https://x.com/chrisspickett/status/2095219421669118003))
- Solana/Base copies: SkillMarket, Agentripe (escrow + AI review + refund), Leash, AgentX.Market, WhoDoes. Graveyard is real: [awesome-molt-ecosystem](https://github.com/eltociear/awesome-molt-ecosystem) is a page of 404s.

**Names you listed that are not competitors**

- **MasterKey** is Agent Master Key: a local kill-switch for API keys. Not a marketplace. ([agentmasterkey.com](https://agentmasterkey.com/))
- **Bluepages** is address ↔ Twitter/Farcaster lookup, x402-paid. Identity oracle, not a catalog. ([github.com/bluepagesdoteth/agent-plugins](https://github.com/bluepagesdoteth/agent-plugins))
- **Bazantic** is an ETHOnline prize partner wrapping other people’s APIs in MCP/x402/MPP. They are a **sponsor**, not a rival. ([ETHGlobal, Sep 3](https://x.com/ETHGlobal/status/2095598710306877504), [bazantic.com](https://bazantic.com/become-a-provider))

**ARCADE’s actually-defensible angle, per what CT is already yelling about**

Not “another x402 bazaar.” Three properties the catalogs do not have:

1. **Seller code/prompts/keys never leave the seller machine** — structural, not a ToS. Hub is pull-model websocket. Mars *installs* skills after an audit. Bazaar *hosts URLs*. You sell labor without shipping the prompt. That is the only sentence Circle’s “publish an agent as easily as a website” post does not already own. ([ARCADE README](https://github.com/ss251/arcade), [Circle blog](https://www.circle.com/blog/building-the-open-agentic-economy))
2. **Settle only after schema-valid output.** The 402 advertises `x-arcade-payment.settlement: on-validated-output`. Failed job = authorization never broadcast. That *is* the refund x402 refused to spec. Cite below.
3. **Agents hiring agents with a fenced `hire_skill` and a hard `maxSubSpendUsd` that fails closed.** Catalogs sell APIs to agents. You sell agents that buy other listings mid-run. Nick Prince (Coinbase) still has to clarify he wants “hiring a specialized agent,” not “purchase a service via an x402 API.” You are on the side of that sentence. ([Nick Prince, Sep 3](https://x.com/Nickprince/status/2095517277731045771))

Opinion: if the demo is “we listed a skill and an agent paid $0.01,” you are indistinguishable from AgentForge, SkillMarket, and every Arc nanopayments tutorial. If the demo is “seller laptop never uploaded the prompt, buyer didn’t pay for garbage, sub-hire couldn’t blow the budget,” you have a wedge.

---

## (b) Does CT care about ENS-for-agents / ENSIP-25/26? Is ERC-8004 real?

**ENS: the spec exists. The timeline does not.**

ENSIP-25 and ENSIP-26 are both **Draft**. ENSIP-26 is `agent-context` + `agent-endpoint[<protocol>]`. ENS’s own ETHOnline copy is literally “agents as namespaces… identity and permissions.” You did not invent this; the bounty text did. ([docs.ens.domains/ensip](https://docs.ens.domains/ensip), [docs.ens.domains/ensip/26](https://docs.ens.domains/ensip/26/), [ETHOnline ENS prizes](https://ethglobal.com/events/ethonline2026/prizes/ens))

What CT actually posted:

- [Sendor.eth, Aug 30](https://x.com/Sendor_eth1/status/2094181444297933137) — 15 views — “identity doesn’t need another closed database,” subnames as `agent.project.eth`.
- Same thread, [Sendor again](https://x.com/Sendor_eth1/status/2094030197121044498) — 29 views — “the username is almost the least interesting part… Trust becomes the bigger problem once real money starts moving.”
- [ENSDomain8888 quoting Brian Armstrong](https://x.com/ENSDomain8888/status/2089291953414529219) — 277 views — ENSIP-25/26 as a reply to Coinbase’s AiFi post.

That is not a conversation. That is ENS stans talking to Grok. Compare to Orthogonal’s refund post the same week: [1.4k views in hours](https://x.com/casaisdev/status/2095591323269001474). **Opinion:** “we put payTo in a text record” is not a QT. “daemon key is cryptographically forbidden from changing payTo, and we prove it by revoking the role live” *might* be, because that’s a **permission**, not a name.

**ERC-8004: the NFT mint is real. The reputation is vapor.**

Numbers, not vibes:

| Claim | Source |
|---|---|
| **548,621** 8004 identities across 24 chains (testnets excluded), Sep 2 | [agenteconomy.to](https://agenteconomy.to/stats/erc-8004-agents) |
| Only **3% / 4% / 15%** of registrations on ETH/BSC/Base expose a valid file with a live endpoint | [arxiv.org/abs/2606.26028](https://arxiv.org/abs/2606.26028) |
| **73.6% / 59.2% / 90.6%** of reviewers flagged Sybil; after stripping, **15.8% / 77.9% / 86.8%** of rated agents have no valid feedback | same paper |
| July 8004scan: **385,998** agents, **89.2%** no callable interface, **8,631** with a working service = **2.24%** | [Token Dispatch](https://www.thetokendispatch.com/p/who-checks-the-agents) |
| Week 34: **71,574** of the new crop flagged Sybil-farm | [ChainAware, Aug 31](https://x.com/ChainAware/status/2094529114904416367) — 11.9k views |

Circle, the people whose chain you are on, already wrote the epitaph: ERC-8004 registries are live, **“signal missing.”** ([Circle blog](https://www.circle.com/blog/building-the-open-agentic-economy))

CT that isn’t shilling:

- [0xdevair, Sep 3](https://x.com/0xdevair/status/2095411572663283938): “Most of those IDs are empty badges… I refuse to pretend a badge is escrow, or that a score is a receipt.”
- Graph themselves still pitch Agent0 as “find and score a counterparty in a single query.” ([graphprotocol, Aug 19](https://x.com/graphprotocol/status/2089889585866432789), [Aug 21](https://x.com/graphprotocol/status/2090795614770491428)) That is the sponsor line. It is not usage.

**Opinion:** gating `hire_skill` on an Agent0 reputation score is how you ship a demo that refuses the only honest sellers (new, unrated) and accepts the Sybil cluster with a 100. If you touch 8004 at all, use it as a **handle**, not a credit score. Your own README already has the better primitive: ratings signed over **settled receipts**.

---

## (c) Arc → Base Sepolia payment chain

**Red flag if you hide it. Feature if you name it.**

Facts:

- Graph’s x402 Subgraph Gateway takes USDC on **Base and Base Sepolia**. Not Arc. ([thegraph.com/docs/.../x402-payments](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/))
- Agent0 subgraphs are on ETH/Base/BSC/Polygon/Monad + Sepolias. Arc is not in that table. ([Agent0 docs](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/))
- Arc public mainnet is **September 16**. Testnet chain id **5042002**. ([arc.io blog](https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026))
- x402 volume still lives on Base/Solana, not Arc. DefiLlama 30d: Base **$683k**, Solana **$392k**. Cumulative txs ~181M / $41.6M settled. ([defillama.com/protocol/x402](https://defillama.com/protocol/x402), [agenteconomy.to/stats/x402-transactions](https://agenteconomy.to/stats/x402-transactions))
- Solana flipped Base on **daily tx count** in late August; Base still wins **value**. ([Solana Compass](https://solanacompass.com/news/solana-flips-base-in-daily-x402-transactions-for-the-first-time-in-six-months), [AlphaWire](https://alphawire.xyz/news/solana/solana-overtakes-base-ai-agent-payments-1-5m/))
- Mars already did the two-chain thing (Hedera audit + Arc money) and won the Arc bounty by owning the split. ([Mars showcase](https://ethglobal.com/showcase/mars-ua1qc))

How CT frames two-testnet hops: **faucet in, faucet out, screenshot in the middle.** Artemis already called the whole x402 boom “mostly a mirage” when daily txs crashed from ~731k to ~57k. ([Artemis, Feb 9](https://x.com/artemis/status/2020929124416606632)) They posted a new ATH of 2.23M “real” txs on Sep 2 — the tape is noisy, and they will treat Arc testnet volume as zero. ([Artemis, Sep 2](https://x.com/artemis/status/2095196120808849916))

**Opinion, the only frame that doesn’t get dunked:** “Labor settles on Arc (USDC-gas, EIP-3009, Circle’s house). Facts are bought on Base, where the indexers actually live.” That is a **cost-of-goods** story: buyer pays seller 1¢ on Arc; seller pays Graph 1¢ on Base Sepolia; both receipts exist. Do **not** call it ‘multichain agent mesh.’ Call it COGS. If the Graph payment fails, the Arc job must fail **before settle** — otherwise you just recreated the Bazaar “paid, got 400” bug on a second chain.

---

## (d) Settle-only-on-success — is that the wedge?

**Yes. This is the only thing in the repo that is both true and currently on CT’s mind.**

The protocol, as shipped, has no refund:

- [casaisdev, Sep 3](https://x.com/casaisdev/status/2095591323269001474): “CT spent a year celebrating no recourse. The people processing the payments are quietly rebuilding it.” Orthogonal refunds **offchain**, per-request, after the fact. Facilitators never shipped void/capture. ([follow-up](https://x.com/casaisdev/status/2095630834476691885))
- [Sean Geng (ex-Coinbase), Jul 23](https://x.com/seangeng/status/2080284961664327713): “There are no refunds in x402. Pay an endpoint, get back garbage that fails schema validation, and that money is gone.”
- x402-foundation #2294 still arguing the verify/settle two-phase gap; #1062 is the facilitator timeout race. ([github.com/x402-foundation/x402/issues/2294](https://github.com/x402-foundation/x402/issues/2294))
- Cottage industry: x402r (escrow on Base), x402refunds.com (email the merchant), AgentKee (10s escrow + GenLayer), OpenFacilitator dashboard refunds. All **after** the USDC moved.

The catalog is a dumpster:

- ForgeMesh census, Aug 19: **1,225 Bazaar sellers probed. 206 dead (17%). 40 serving the paid product for free.** [kirothebot](https://x.com/kirothebot/status/2090208815874551851) / [forgemesh.io](https://forgemesh.io/blog/x402-bazaar-health-census-august-2026)
- [Sen, Aug 29](https://x.com/sen_buidl/status/2093549214878048730): **19,180 endpoints tracked, 1,321 with a published pass from an actual paid purchase. 93% of the catalog has never been verified by anyone buying from it.**
- [Revettr, Aug 28](https://x.com/revettr_x402/status/2093339762786447506): paid calls across listings nobody had bought from; **99 endpoints answered the payment with a 400.**
- Coinbase’s own Bazaar now health-probes and auto-delists — they shipped the bandage because the wound was public. ([docs.cdp.coinbase.com/x402/seller/get-discovered](https://docs.cdp.coinbase.com/x402/seller/get-discovered), updated Sep 3)

What ARCADE already does, from the repo, not a slide:

1. Verify the EIP-3009 auth **before work**.
2. Dispatch to the seller machine.
3. Validate output against the listing schema.
4. **Broadcast settle only then.** Failure = never-sent. Buyer balance untouched.
5. They even **declared** it: `x-arcade-payment.settlement = on-validated-output`, because “x402 defines no failure semantics at all.” ([github.com/ss251/arcade](https://github.com/ss251/arcade))

That is not Orthogonal’s offchain refund. That is **not capturing**. Different object. CT can understand “the tx never happened.” They cannot understand “we decided to send it back.”

Is anyone else shipping it as the default rail? **Not in the catalogs.** Escrow (Agentripe, x402r, MarsEscrow) is the other honest family — funds lock, then release. You are the third family: **authorize, work, then maybe settle.** Keep that trichotomy in the demo. Do not let a judge file you under “another x402 wrapper.”

---

## (e) Which approach would I QT, and the missing mechanism

**I would not QT Approach A.** It is a prize-bingo board. ENS subnames + Agent0 score + Circle marketplace listing + hop metadata + `circle` CLI + mainnet config. That is how hackathon repos smell.

**I would not QT B.** “ENS resolution + Graph badge” is the dunk. Graph’s own rules say mocked/static doesn’t qualify and “printing a raw query result” doesn’t qualify. ([ETHOnline Graph prizes](https://ethglobal.com/events/ethonline2026/prizes/the-graph))

**I would not QT C as written.** Writing ARCADE outcomes back as 8004 feedback on Base Sepolia is how you add more Sybil sludge to the pile the arxiv paper already measured.

**I would QT a stripped A:**

> Seller laptop never uploaded the prompt.  
> Buyer paid 0 for a failed job — the auth was never broadcast.  
> Seller’s agent hired another listing; the hop is in the 402; the budget composed; both settles are on Arcscan.  
> Then we revoked the daemon’s ENS text-role on Sepolia and the next Arc call refused because hub `payTo` ≠ ENS `payTo`.

Three txs. One revoke. No badges.

**The single missing mechanism that makes it a banger (chain-provable, not UI):**

**Hop lineage that composes budgets, with a settlement tree on the receipt.**

Your README already names T-SPEND-003: a hire carries no lineage, `A → B → A` can wash USDC, `maxSubSpendUsd` is per-job not per-tree. Put in the 402 metadata, and **on the receipt**:

- `hop` / `ancestors[]` / `rootJobId`
- remaining budget at this hop
- **child settlement tx hashes**

A stranger can open Arcscan, see parent settle, click into child settle, and verify the tree spent ≤ the root cap. That is PageRank-for-labor, which is exactly the “trusted discovery” hole Circle said is still missing. ([Circle blog](https://www.circle.com/blog/building-the-open-agentic-economy))

ENS payTo-lock is the **second** QT if you have time: PermissionedResolver.authorizeTextRoles on PRICE only, daemon cannot change payTo, buyer SDK refuses mismatch, revoke-live demo. That uses ENSv2 the way the bounty actually asked (EAC + Permissioned Resolver), not as a vanity subdomain. ([ENS prize text](https://ethglobal.com/events/ethonline2026/prizes/ens))

Do **not** make 8004 scores load-bearing. If Graph must sit in the payment path, the load-bearing query is **the skill’s work** (live subgraph answer, paid via `@graphprotocol/client-x402` on Base Sepolia), and the Arc job **does not settle** if that query fails. That is Graph as COGS, which is the only reading of “load-bearing” a continuity judge cannot wave off.

---

## (f) Dunks CT will line up

**Prize math you got wrong.** Read the pages.

| Prize | What you said | What the page says |
|---|---|---|
| ENS continuity | one of 3 “prize partners” | **$500**. The $4,500 is *Best Use of ENSv2*, from-scratch. Continuity is “Best Integration of ENSv2 into an Existing Project — $500.” ([ens prizes](https://ethglobal.com/events/ethonline2026/prizes/ens)) |
| Arc “Launch… Push to Mainnet” | implied the $3,500 pot | **$3,500 is the open track.** Continuity clone is **$1,500**. Both require **deployed or deployment-ready on Arc mainnet by Sept 30.** ([arc prizes](https://ethglobal.com/events/ethonline2026/prizes/arc)) |
| Arc continuity product prize | “Best DeFi or Agentic Application” | **$1,666**, continuity-only. |
| Graph continuity | $5k pool, correct | 1st $2,500 / 2nd $1,500 / 3rd $1,000. Live Graph data, meaningful work, load-bearing. x402 pay-per-query and Subgraph MCP are named. |

You are a solo builder. **ENS at $500 is a four-day tax** unless the payTo-lock is the demo’s security punchline, not a name.

**Testnet / faucet.** Your own README funds from faucet.circle.com, 20 USDC / 2h. Every Arcscan link is testnet. CT’s prior on this exact genre: AgentForge, AgentMarket, hermes-arc-x402, nanopayment-x402 — all faucet theater. The only antidote is **mainnet-ready config + a Sept 16–30 runbook**, which the Launch prize literally requires, and which lands **after** the Sunday 13 Sep submit. You demo on testnet during the hack. You push mainnet in the 17-day window. Say that in the video or they will say it for you.

**Sept 16 timing.** Public mainnet that day. CT that week is **NFTs and TGE cope**, not agent marketplaces. [Arclings WL farming](https://x.com/Web3_Jarin/status/2095707280637665311), [“TGE date still unknown”](https://x.com/morteza_yousefy/status/2095685190152573327), Circle events VP [pushing the livestream](https://x.com/entrylevelvp/status/2095685145953026392). You will not win the timeline. You can win a judge who has to check “deployment-ready by Sept 30.”

**AI slop smell.** “Named, reputed, paid” is three adjectives. Mars already shipped “audited, reputable skills” and **won this exact Arc bounty**. If your video says “agents as namespaces” you are reading the ENS about-text on camera. If it shows a failed job and an unchanged buyer balance, you are not.

**Listing on Circle Agent Marketplace** is a Google Form and a curator. Circle called their own marketplace a temporary directory. Do not make “we submitted the form” a feature.

**Facilitator / MPP split.** 15% of Bazaar sellers already answer **both** x402 and MPP on the same 402. ([ForgeMesh census](https://forgemesh.io/blog/x402-bazaar-health-census-august-2026)) A v2/v1 client split already made a seller unpayable for months. ([kirothebot, Aug 20](https://x.com/kirothebot/status/2092188148178225) — wait, [2090302198148178225](https://x.com/kirothebot/status/2090302198148178225)) If your buyer SDK only speaks your hub’s 402, say so. Don’t claim “any x402 client.”

---

## (g) Refined rec — one builder, 8 days

Priority order. Cut hard.

### P0 — days 1–3. The product. No new sponsors.

1. **Hop lineage in the 402 + receipt.** `hop`, `ancestors`, `rootJobId`, remaining cap, child tx hashes. Close T-SPEND-003. Demo: A hires B, both settle, buyer’s root cap respected, `A→B→A` refused. Arcscan of the tree is the whole video beat.
2. **Keep settle-on-validated-output as the headline.** Make the *failed* path the first 30 seconds: schema miss / timeout / runner death → no tx → buyer balance identical. Then the success tx. Orthogonal refunds after. You never captured. Say the difference once.
3. **Arc mainnet runbook.** Chain params to config. One-line flip. `circle` CLI as a buyer if it takes < half a day — it is literally on the Agent Stack prize rubric. Do not wait until the 16th to discover Gateway URLs changed.

This is what the **$1,666 + $1,500 Arc continuity** prizes actually grade: agentic payments, settlement logic, mainnet-ready. You already have live testnet txs. Don’t re-litigate the marketplace.

### P1 — days 3–6. Graph, load-bearing, not a badge. **This is the $5k pool.**

4. **One seller skill whose work *is* a live Graph query**, paid per query with `@graphprotocol/client-x402` on Base Sepolia. Natural fit: extend `usdc-flow-check` / `counterparty-brief` so the facts come from a real subgraph (Agent0 is fine as *data*, not as a score; or any Standard Subgraph if you want the composable track too — don’t, you don’t have time).
5. **Failure composition:** if the Graph x402 payment fails or the query is empty, ARCADE does **not** settle the parent on Arc. Two receipts or zero. That is “Graph in the payment path” without lying.
6. **Cut:** Agent0 reputation price-cap. **Cut:** FeeSplitter subgraph on arc-testnet unless Studio indexing Arc is already a solved afternoon — Graph Network does not list Arc, and a Studio playground URL is how continuity entries get a polite zero.

### P2 — days 6–8. ENS only if the lock is the demo.

7. **PermissionedResolver: daemon can write PRICE, cannot write payTo.** Buyer SDK: hub payTo ≠ ENS payTo ⇒ refuse. Demo: revoke role on Sepolia, next Arc call dies. Unregister = delist.
8. **Cut:** full `skill.seller.parent.eth` hierarchy, ENSIP-26 kitchen sink, UserRegistry ceremony. One parent, two subnames, two records, one role. Continuity ENS is **$500**. Spend a day, not four.
9. **Cut:** Circle Agent Marketplace listing, 8004 feedback writes, “named, reputed, paid” as a slogan.

### Explicitly do not build

- Approach B (badge).
- Approach C (write 8004 feedback). Your ratings-over-receipts are the honest 8004, and they are already local.
- A new discovery UI. `GET /openapi.json` + `/.well-known/x402` is the client. Bazaar already lost this war on quality; don’t join it on surface area.
- MPP dual-stack. Orthogonal/Tempo can have it. You have 8 days.

### Demo script (judges + the one CT post)

1. Failed job. Buyer balance unchanged. Arcscan: no settle tx.  
2. Success. $0.01 → seller + fee. Tx.  
3. Hire hop. Two settles, one root cap, lineage on the receipt.  
4. Graph COGS: Base Sepolia x402 query visible, parent settle withheld if it fails.  
5. Optional: ENS role revoke → payTo mismatch → refuse.

If you only ship 1–3, you still have an Arc story. If you ship 1–5, you have Graph without a badge. If you ship 1–5+7, you have all three partners and a QT. If you ship Approach A as written, you have a README that reads like the prize page and a timeline that will call it slop.

The repo already picked the right fight. Stop adding identity to a settlement primitive. Make the hop tree visible on Arcscan and make Graph a cost of goods. Everything else is a sticker.

---

## Conductor verification of the grill's load-bearing claims (2026-09-04)

| claim | check | result |
|---|---|---|
| Mars won Arc's agentic prize at ETHGlobal NYC 2026 | `curl https://ethglobal.com/showcase/mars-ua1qc` | page JSON lists 1st place "Best Agentic Economy with Circle Agent Stack", plus "AI & Agentic Payments on Hedera" and 2nd place "Track A (AgentKit)", event `newyork2026` |
| AgentForge: skill marketplace on Arc, April 2026 | `gh repo view 0xE1337/agentforge` | description "Agent Skill Marketplace on Arc … Circle Nanopayments (x402). Hackathon: Agentic Economy on Arc, lablab.ai April 2026", created 2026-04-23, 0 stars |
| arXiv 2606.26028 ERC-8004 Sybil study | `curl https://arxiv.org/abs/2606.26028` | title "Can Trustless Agents Be Trusted? An Empirical Study of the ERC-8004 Decentralized AI Agent Ecosystem" |
| Circle blog calls ERC-8004 "signal missing" and catalogs "web directories" | `curl https://www.circle.com/blog/building-the-open-agentic-economy` | both phrases present |
| Graph x402 gateway price / testnet host | see `thegraph.md` §7 | mainnet 402 = $0.01 USDC on Base; testnet host does not resolve |

One malformed URL in the grill (kirothebot, self-corrected inline) — use the corrected id `2090302198148178225`.
