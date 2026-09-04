# ARCADE at ETHOnline 2026 — scoping brief (2026-09-04)

Continuity track (Extend Open Source). Solo. Prior work: 112 commits, 2026-07-25 to 2026-08-07, for the ncode-club Arc hackathon. Everything below is sourced; per-sponsor reports in this directory carry the URL for every claim.

## 1. Event facts

| fact | value | source |
|---|---|---|
| hacking window | Sept 4, 09:30pm IST to Sept 13 | https://ethglobal.com/events/ethonline2026 (schedule) |
| submission deadline | **Sunday Sept 13, 12:00pm EDT** | https://ethglobal.com/events/ethonline2026/info/details |
| check-ins | Sept 8 and Sept 11, 09:29 IST | overview schedule |
| partner prizes per submission | **max 3**; one partner with several tracks counts as one | info/details "Partner Prizes" |
| continuity rule | document pre-existing vs new; only event work judged; frequent commits | info/details "Important Rules" |
| AI use | must be attributed; spec/prompt/planning artifacts **must be in the repo** | info/details "Use of AI Tools" |
| video | 2 to 4 min, >=720p, real voice, no phone, no TTS | info/details "Demo Video" |
| judging | Technicality, Originality, Practicality, Usability, WOW; top 20% go to live judging | info/details |
| total prizes | $80,000 across 11 partners | `prizes-page-2026-09-04.txt` |

## 2. Where ARCADE stands (see `repo-scope.md`)

- Proven on Arc testnet: EIP-3009 settlement, full 402 to sandbox to settle loop, two-machine secrecy run, FeeSplitter at `0xf95c…9206`. Live hub at `https://arcade-hub-production.up.railway.app` (200 on `/healthz`, listings served, checked 2026-09-04).
- Tests: 475/480 vitest + 25/27 bun; the 7 failures are spawn timeouts on this host, not logic. README's "366 tests" is stale (507 real).
- Rail abstraction `packages/payments/src/rail.ts:56-68` is three methods; a new rail is one file, one Layer, one `case` in `apps/hub/src/server.ts:180`, one conformance row.
- Identity today: seller = EIP-191 signed Hello address, buyer = EIP-3009 payer. No names, no external reputation. Ratings endpoint exists but has no UI.
- Known gaps: T-SPEND-003 budgets do not compose across hire hops (no lineage); Gateway rail code-complete but unproven live; no container sandbox; fee-sweep backfill has no caller.

## 3. Sponsor fit matrix

Continuity-only prizes are marked (C). Effort is a solo estimate from the reports.

| partner | prize reachable | fit | effort | blocker / risk | report |
|---|---|---|---|---|---|
| **Arc / Circle** | (C) Best DeFi or Agentic $1,666 + (C) Push to Mainnet $1,500 | mandatory, it is our chain | 1 to 2 d | **Arc mainnet goes live Sept 16, after the deadline**; no mainnet chain id, RPC or USDC address published; Gateway, Agent Wallets, Contracts are testnet-only on Arc. "Deployment-ready" must be config-driven. Testnet RPC is now `rpc.testnet.arc.io` (CLAUDE.md is stale). | `arc-circle.md` |
| **The Graph** | (C) AI Tooling / Use Case $5,000 (2,500/1,500/1,000); open Composable $5,000 | strong | 2 to 3 d | Graph x402 gateway settles on **Base**, not Arc, so the seller-to-Graph hop is cross-chain. `arc-testnet` is in the networks registry (subgraphs only, no substreams). ERC-8004 Agent0 subgraph is not on Arc but its schema has `x402Support` and proof-of-payment feedback. | `thegraph.md` |
| **World** | (C) AgentKit Continuity $3,500 | strong | 1 to 2 d + sandbox buffer | AgentKit is an x402 extension; the World ID proof is consumed once at AgentBook registration, per-request is a plain signature, so headless daemons work. `@worldcoin/agentkit-core` ships an Arc testnet RPC. Needs a phone for the one-time sandbox registration; feedback doc required. | `world.md` |
| **Hedera** | open AI & Agentic Payments $6,000 (3 x $2,000); open Harness $2,000 | strong (their example is literally "agent marketplace") | 2 to 3 d | Hedera x402 is **not EIP-3009**: buyer partially signs a `TransferTransaction` with facilitator as fee payer. Blocky402 is a v2 facilitator with no key needed; its GitHub repo 404s. USDC testnet token `0.0.429274` needs association. Third decimals convention. | `hedera.md` |
| **ENS** | (C) Integration $500; open ENSv2 $4,500 (continuity eligibility unconfirmed) | strong thematically ("agents as namespaces") | 2 d | Two live ENSv2 deployment sets on Sepolia; writes have no library support (hand-roll `writeContract`). `PermissionedResolver.authorizeTextRoles` lets the daemon key edit exactly one text record. | `ens.md` |
| **Ledger** | (C) Continuity $1,500 (1,000/500) | strong for the secrecy thesis | 1 to 2 d | **Physical Ledger required** for `ring init` and the recorded tap; no Speculos for wallet-cli. Arc chain id 5042002 not in app-ethereum's network table (shows `???`). | `ledger.md` |
| **Privy** | open B2B $2,500, Financial flow $2,500 | strong | 6 to 10 h | Policies cover EIP-712 typed data (our EIP-3009 auth) but broadcast on 5042002 unverified; fallback is sign-only. Continuity eligibility not stated. | `secondary.md` |
| **Bazantic** | (C) $1,000 (2 x $500); open $2,000 | medium | 4 to 8 h | Beta waitlist; settles on **Base**; "Recipe" undocumented publicly; no GitHub. | `secondary.md` |
| **Chainlink** | (C) Upgrade $500; open Confidential $2,500 | medium | 8 to 16 h | Arc Testnet is a listed CRE network; Confidential Workflows is invite-only beta but simulator works. Weak thesis fit. | `secondary.md` |
| **Uniswap** | (C) $2,000 | weak | n/a | Not deployed on Arc; Trading API omits 5042002. Skip. | `secondary.md` |
| **1inch** | $7,000 | none | n/a | Aqua/SwapVM app; unrelated. Skip. | prizes page |

## 4. What X says (see `x-discourse.md`, every bullet carries a post URL)

- Arc mainnet Sept 16 is treated as locked by Circle, Allaire, and builders; ETHOnline is Arc's official Agent Stack on-ramp with a second $5K for mainnet pushes by Sept 30.
- The x402 conversation has moved past "it works" to channels/refunds/spend caps and dead catalogs (Revettr: of 1,641 indexed x402 domains only 565 answer, 6 run any pre-pay check). ARCADE's settle-on-success and objective stats speak directly to that.
- Hedera's own x402 bounty winners shipped with no contract: native HTS transfers + HCS receipts.
- Sponsor chatter for World AgentKit, ENSv2 and Ledger Key Ring is almost entirely official copy; very few builders have integrated them yet, so a real integration plus a good feedback doc stands out.

## 5. Recommended shape (decision pending)

Theme: **ARCADE round two: agents you can name, trust, and pay anywhere.** Same product, three new layers, each a separate sponsor and a separate demo beat.

Pick 3 partners. Arc is fixed. Candidates for the other two, ranked by expected value x thesis fit:

1. **The Graph** (largest continuity pool, and ERC-8004 reputation gating hires is a real product feature, not a badge).
2. **World AgentKit** (continuity-only, single prize, thin competition, headless-friendly, sub-2-day).
3. **Hedera** (biggest open pool, "agent marketplace" is their own example, and a second Rail is the "significant architectural change" continuity judges want, but competes with fresh-start teams).
4. **ENS** (best story, smallest guaranteed money unless continuity projects can win the open $4,500).
5. **Ledger** (only if a device is on hand).

Whatever the pick, three things ship regardless: fix T-SPEND-003 (hop lineage in the 402 metadata), a config-driven mainnet flip with a documented Sept 16 runbook, and the README "what existed before / what is new" split with the two-hackathon commit history.

## 6. Debate and final plan

The recommended shape above was then grilled by a crypto-Twitter persona run on Grok (`x-grill-0xgrill.md`), and put through a three-round, referenced debate between Claude Fable 5.1, Grok 4.6 and GPT/Codex (`DEBATE/`). **The converged build plan and the residual disagreements are in `DEBATE/SYNTHESIS.md`**; the day-by-day briefs are `DEBATE/r3-*.md`. The design spec in `docs/superpowers/specs/` is derived from the synthesis.
