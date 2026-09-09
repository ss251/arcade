# DEBATE SYNTHESIS — ARCADE at ETHOnline 2026 (2026-09-04)

Three debaters, three rounds, all files in this directory: `00-dossier.md`, `r1-*.md`, `r2-*.md`, `r3-*.md` (claude = Claude Fable 5.1 conductor, grok = Grok 4.6 high with X/web search, codex = GPT via Codex xhigh with web search). Every claim below traces to a round file, which traces to a repo path, docs URL, or post URL.

## 1. Converged (all three agree)

| decision | detail | primary refs |
|---|---|---|
| Partners | **Arc + The Graph + ENS.** World's $3,500 loses to coherence and to the fact that Mars already used World ID on a skills marketplace. | r3-grok §0, r3-codex §0, r2-claude table |
| Headline claim | "We verify before work, broadcast only after schema-valid output; on failure there is no settlement transaction." Never say "cannot capture": the hub holds a valid authorization until `validBefore`; it *does not broadcast*. Three families: off-chain refund (Orthogonal), escrow (Mars), never-broadcast (ARCADE). | r1-codex §4, r2-grok concessions |
| P0 bug fix | **Validate input against `inputSchema` before `rail.verify`.** Today the hub verifies payment, then `req.json().catch(() => ({}))`, with no input check (`apps/hub/src/server.ts:797-808`). Codex found it; all three adopt it. | r1-codex §3, r2-claude concession 4, r3-codex §8 |
| Lineage mechanism | **Hub-issued HMAC hire capability on `JobAssignment`** (domain-separated from the buyer's result token), broker forwards it on the child probe + paid retry, hub verifies and **derives** `rootJobId`, `hop`, `ancestors[]` from the persisted parent job. Never trust client-supplied ancestors. Refuse cycles and depth. No header = ordinary root call (honest scope: one hub, compliant runners). | r2-codex §Resolved, r2-grok §Resolved, r3-claude §2 |
| Tree budget | **Transactional reservation ledger in SQLite keyed by `rootJobId`**: `reserved + committed + childPrice ≤ root listing's maxSubSpendUsd`; reserve at child paid retry, commit on settle, release on non-settle/expiry. A decreasing scalar in a token is racy. | r2-codex §Claude-2, r3-grok §2 step 4 |
| Nonce commitment into EIP-3009 | **Not built.** Would break third-party x402 clients (Circle CLI). Echo the nonce on the receipt for `FeeSplitter.Settled` matching instead. | r2-grok Codex-1, r2-codex retraction |
| Arcscan claim | "**Hub-attested receipt tree with chain-auditable edges.**" A stranger verifies each disclosed settle tx and the hub signature; completeness is attested, not proven. Never "verify the tree on Arcscan". | r2-codex §Claude-3, r3-grok §0 |
| Honest hop sentence | "Hop 2 is the hiring seller's working-capital wallet, not the buyer's funds. The buyer pays exactly the root price." | all R1s |
| Graph primary | **Base-mainnet x402 cost-of-goods skill**: pinned Agent0 Base subgraph `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`, pinned GraphQL document, `@graphprotocol/client-x402`, $0.01 per query (live 402 probed 2026-09-04; testnet host does not resolve). Synthesis, not passthrough. Graph failure → no schema-valid output → `shouldSettle` false → Arc never broadcasts. Subgraph MCP is dev-time, cited in SKILL.md, not a paid-path dependency. | r3-grok §4, r3-codex §4, thegraph.md §7 |
| ERC-8004 on Arc | **In, write-not-read.** `IdentityRegistry.register(agentURI)` from the seller key for **one featured skill, explicitly** (not on every `arcade start`); a distinct funded attester key calls `giveFeedback(agentId, 1, 0, "arcade-settled", skillId, endpoint, receiptURI, hash)` best-effort **after** settlement, receipt JSON carrying `proofOfPayment{…txHash: settleTx}`. Display as "ARCADE settlement evidence (attester-filtered)", never a score, never a gate, never `getSummary`. | r3-grok §3, r3-codex §3, r1-claude addendum (ERC text verified) |
| Arc Agent0 subgraph | **Stretch, hard 4-hour cap, after the Base Graph path is green.** Studio-indexable but not network-publishable, no x402. Success = video flourish; failure = delete and don't mention. Not wired into `GET /listings`. | r3-codex §8, r3-grok §4 |
| ENS | One parent on ENSv2 Sepolia (label picked at registration, MockUSDC free), one UserRegistry, two skill subnames (non-transferable), PermissionedResolver records `arcade.payTo`, `arcade.chain`, `arcade.price`, `agent-endpoint[web]`, `agent-context`, ENSIP-25 `agent-registration[…][agentId]`. Daemon key gets `authorizeTextRoles` for the price key only. Buyer refuses when 402 `payTo` ≠ ENS `arcade.payTo`. **Two demo beats:** revoke → daemon `setText` reverts; tamper 402 payTo → buyer refuses. Delist = `unregister`. Addresses resolved at runtime (two live Sepolia sets). | r2-codex Grok-4, r3-claude §5 |
| Mainnet readiness | `ChainConfig` selected by `ARCADE_NETWORK`, mainnet manifest checked in with `status: pending`, boot refuses `pending`; probes chain id, USDC name/version/decimals, facilitator balance; Gateway refused on mainnet; `docs/mainnet-runbook.md` with the Sept 16–30 checklist; accept both testnet RPC hosts. Say in the video that the flip happens in the Sept 16–30 window. | r3-codex §6, r3-grok §6 |
| Cuts | Never cut: input-schema gate, lineage refusals + ledger, failed-job demo, Graph cost-of-goods, chain config + runbook, README split, video. Cut order: Agent0-on-Arc → Gateway/CLI garnish → 8004 feedback write (keep registration) → ENS compressed to payTo-lock → receipt signature. | all R3s |
| Video | Failed job **first** (0:15–0:45), then success, then hire tree with `A→B→A` refusal, then Graph with the Base payment and the kill-the-key beat, then ENS two beats, then continuity + mainnet runbook. ≤3:40. Human voice. | all R3 §7 |

## 2. Residual disagreements and the conductor's verdict

| topic | Claude | Grok | Codex | verdict (conductor) |
|---|---|---|---|---|
| Gateway live-proof vs Circle CLI buyer | Gateway 2h then CLI 3h on Thu 11 | neither P0; Gateway first if hours remain | **CLI wins, Gateway cut** | **Owner decides.** Facts: the Arc rubric lists Nanopayments "where relevant"; Gateway is testnet-only on Arc and cannot be the Sept 30 mainnet rail; the CLI proves third-party interop against the judged rail. Default if no answer: CLI first (3h), Gateway only if CLI finishes early. |
| When the Agent0 smoke test runs | day 1 (4h) | after cost-of-goods | **after cost-of-goods** (0.86) | **After the Base path is green (day 4 afternoon).** Two-to-one, and a speculative deploy must not delay the only load-bearing Graph work. |
| Attester-filtered feedback count shown in `/listings` and MCP describe | yes, display only | no (score-gating with extra steps) | yes, labeled "settlement evidence" | **Display only, labeled, never affects price or routing.** Grok's objection was to gating; display with the label satisfies it. |
| 8004 registration trigger | on `arcade start` | one featured skill | explicit script, one skill (0.88) | **Explicit `scripts/erc8004-register.ts`, one featured skill.** ERC-721 mints are durable; runner starts are routine. |
| MAX_HOP | 2 | 2 (exclusive) | 2 | 2 (hops 0 and 1). |
| Hub receipt signature | in day 2 | optional polish | in day 2 | In if ≤1h on day 2, else cut; it is not enforcement. |

## 3. What changed versus the conductor's pre-debate plan ("stripped A", dossier §4)

1. Added the input-schema-before-verify fix (a real latent "paid, got 400" path).
2. Replaced "caps only shrink / verify the tree on Arcscan" with the reservation ledger + hub-attested receipt tree, and the honest hop sentence.
3. ERC-8004 identity + attested settlement feedback on Arc moved from "cut" to "in" (write-not-read), because the registries are live and documented on Arc and the ERC lets a non-owner attester write feedback with proof-of-payment.
4. Arc Agent0 subgraph demoted from P1 to a gated stretch after the Base path.
5. ENS demo corrected to two beats; ENSIP-25 pointer added to close the identity loop across Sepolia and Arc.
6. The Graph payment hop runs on Base **mainnet** in cents (testnet gateway host is dead).
7. Day plan reordered: P0 Sept 5–7 (lineage, ledger, chain config), P1 Sept 8–9 (Graph + interop), P2 Sept 10–11 (8004, ENS), packaging Sept 12, buffer Sept 13 morning.

## 4. Open items only the owner can settle

- Gateway vs CLI ordering (above).
- The ENS parent label (checked for availability at registration time).
- Whether a few dollars of real Base USDC for the Graph hop is acceptable (it is the only real-money leg of the demo).
- Narration is recorded by the owner on Sept 12.
