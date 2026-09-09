# Grok 4.6 — Round 3 final build brief

Partners: **Arc + Graph + ENS**. Not World. Spine: failed-job-first, hub-enforced hop lineage with a reservation ledger, Graph as Base x402 cost-of-goods, ENSv2 payTo-lock. **Opinion:** coherence beats World's $3,500 (`prizes-page-2026-09-04.txt:570` vs `:763`); Mars already spent World ID on a skills marketplace (https://ethglobal.com/showcase/mars-ua1qc).

Honest claim (video, once): the hub refuses cycles and depth overflow and bounds **descendant ARCADE call value** against the root listing's `maxSubSpendUsd`. Each hop is an independent EIP-3009 from the hiring seller's `ARCADE_SUBBUY_KEY` (`hire-broker.ts:191-198`; `docs/architecture.md:84`). The buyer's USDC never funds hop 2. Receipts are **hub-attested, chain-auditable edges**, not a trustless tree (`Receipt` is flat today, `packages/core/src/receipt.ts:16-58`; `FeeSplitter.Settled` has no parent, `contracts/FeeSplitter.sol:101-103`). The facilitator **does not broadcast** unless output validates (`pipeline.ts:136-138`); it is not an on-chain lock (`eip3009.ts:235-239` holds a valid auth until `validBefore`).

---

## 1. Day-by-day plan (Sep 5–12; submit before Sep 13 12:00pm EDT)

Check-ins Sep 8 and 11. Frequent commits required (https://ethglobal.com/events/ethonline2026/info/details). Cut order if behind: World / Marketplace form / 8004 *score* gating / Agent0 / Gateway-or-CLI / 8004 writes / ENS compressed to 4h. **Never cut:** lineage MAC + hub-derived ancestors + reservation ledger; failed-job demo; Graph COGS; continuity README; video.

### P0 — Arc product (days 1–2)

**Day 1 (Fri Sep 5) — lineage + input gate**

| Item | Files | Acceptance | Fallback |
|---|---|---|---|
| Hub-issued hire grant + cycle/depth refuse | `apps/hub/src/server.ts` (~:301-312, :770-828); `packages/core/src/protocol.ts:113-120`; `packages/core/src/job.ts:58-68`; `packages/runner/src/hire-broker.ts`; `packages/buyer/src/hire.ts:88-102`; `packages/payments/src/types.ts` (header const only) | `bun test` new `apps/hub/test/lineage.test.ts`: missing header = root; forged MAC = 403; `listing.id ∈ ancestors` = 409 `cycle`; `hop >= 2` = 409 `max_hop` | If SQLite reservation slips, ship MAC+cycle+depth today and add the ledger tomorrow — do **not** claim a tree ceiling until the ledger exists |
| Input schema before `rail.verify` | `apps/hub/src/validate.ts` (export a `validateJson` alias of `validateOutput`); `server.ts:802-808` | Paid POST with `{}` against `usdc-flow-check` (`skills/usdc-flow-check/arcade.json:12-20`) returns **400**, no job row, buyer `balanceOf` unchanged | If Effect Schema wiring fights, duplicate the 20-line check inline; never skip |
| Failed-job fixture | `apps/hub/src/pipeline.ts:132-138`; `packages/core/src/job.ts:106-135` | Force `outputSchema` miss; receipt `settled:false`, `reason: "output failed the listing's outputSchema"`; Arcscan shows no new tx from buyer | Already wired — if the fixture flakes, film `usdc-flow-check` with a truncated script output |

**Day 2 (Sat Sep 6) — reservation, receipts, chain config; garnish last**

| Item | Files | Acceptance | Fallback |
|---|---|---|---|
| Tree ledger | `apps/hub/src/store-sqlite.ts:42-61` new `tree_ledgers`; `apps/hub/src/store.ts`; `pipeline.ts` commit/release | Two parallel child POSTs against one root: second that would exceed `maxSubSpendUsd` gets 402; failed child releases reservation (re-try succeeds) | Drop the “tree ceiling” sentence; keep cycle/depth |
| Receipt tree | `packages/core/src/receipt.ts:16-58`; `GET /jobs/:id/result` (`server.ts:852-865`) | Root result JSON lists `childSettleTxs[]`; each `settleTx` opens on https://testnet.arcscan.app and matches `FeeSplitter.Settled` nonce (`FeeSplitter.sol:183`) | Omit `hubReceiptSignature` (optional, ≤1h) |
| Live A→B | `skills/wallet-risk-note/run.ts:94` already hires `usdc-flow-check`; two hiring listings already exist (`wallet-risk-note/arcade.json:92`, `counterparty-brief/arcade.json:144`) | Buyer pays `wallet-risk-note` ($0.05); receipt shows two Arc txs; hop-2 POST refused | Unit test is enough for cycle; film the existing two-settle loop (`README.md:119` pattern) |
| ChainConfig | `packages/core/src/chain.ts:10-47` → injected config; `packages/payments/src/eip3009.ts:12` stop importing frozen `arcTestnet`; `docs/mainnet-runbook.md` | Hub boot with `ARCADE_NETWORK=arc-mainnet` and `pending:true` **exits non-zero** | Keep testnet literals; runbook still names the flip |
| Garnish (≤3h, after 18:00 only) | `packages/payments/src/gateway.ts`; or `@circle-fin/cli` `services pay` (`arc-circle.md:108-126`) | One live Gateway settle **or** one CLI pay against `/x/...` | Cut both. EIP-3009 is the judged rail (`README.md` txs `0xc9b77c1e…`, `0x5eb961c0…`) |

### P1 — Graph (days 3–5)

**Day 3 (Sun Sep 7).** Scaffold `skills/subgraph-brief/` (`arcade.json`, `run.ts`, `SKILL.md`). Pin Base Agent0 id `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb` (`thegraph.md:121`). Re-probe `POST https://gateway.thegraph.com/api/x402/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb` still 402 / `amount:10000` / `eip155:8453` / USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (`thegraph.md:226-229`). Graph payer from Keychain, never `.env`. **Fallback:** if the gateway 402 dies, stop and re-probe daily; do not invent a Studio-key paid path and call it x402.

**Day 4 (Mon Sep 8) — check-in.** Synthesis + parent non-settle. **Acceptance:** `arcade call subgraph-brief` with a live Agent0 query returns a structured verdict (not raw GraphQL); `X402_PRIVATE_KEY` unset or gateway killed → Arc receipt `settled:false`, buyer ERC-20 `balanceOf` unchanged, seller may have spent $0.01 on Base. **Agent0-on-Arc smoke (hard 4h):** `graph deploy --network arc-testnet` of https://github.com/agent0lab/subgraph at Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e` / Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713` / Validation `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` (https://docs.arc.io/arc/tutorials/register-your-first-ai-agent). Studio URL that syncs → video flourish. Else cut. Not P1. Not `GET /listings`.

**Day 5 (Tue Sep 9).** Point `wallet-risk-note/run.ts:94` at `subgraph-brief` (keep `usdc-flow-check` as fallback hire). **8004 writes (cuttable):** one featured skill only. **Acceptance:** IdentityRegistry `register` tx + ReputationRegistry `giveFeedback` tx on Arcscan after a settled job; settlement still succeeds if 8004 write reverts.

### P2 — ENS (day 6, Wed Sep 10)

`scripts/ens-bootstrap.ts`, `packages/buyer/src/ens.ts`, `apps/web` one panel. **Acceptance:** `getEnsText` on Sepolia for `arcade.payTo` matches hub 402; daemon `setText('arcade.price')` works; after `authorizeTextRoles(..., false)` the next `setText` reverts; tampered 402 `payTo` → buyer refuse. **Fallback:** one parent + one subname still qualifies if two names slip; cosmetic-only names do not (`prizes-page-2026-09-04.txt:770`).

### Packaging (days 7–8, Thu–Fri)

README split, `docs/ethonline-2026.md` spec, architecture diagram already at `docs/architecture.excalidraw`, video, submission. Day 8 is buffer + capture, not new features. Submit Fri night or Sat morning — not Sunday noon.

---

## 2. Lineage wire (one design)

**Header name:** `x-arcade-hire` (separate from `payment-signature` / `x-payment`, `types.ts:115-119`). Probe and paid retry both carry it.

**Token:** base64(JSON):

```json
{ "v": 1, "parentJobId": "job_…", "mac": "<32 hex>" }
```

`mac = HMAC-SHA256(ARCADE_HUB_SECRET, "arcade-hire:v1:" || parentJobId).digest("hex").slice(0,32)` — same primitive as `jobToken` (`server.ts:303-305`) with a **different domain prefix**, so a result-read token cannot spend.

**JobAssignment** (`protocol.ts:113-120`) gains one optional field, only when the listing has `hire-skills`:

```
hireGrant: { jobId: string, mac: string }   // grant for THIS job, used on children
```

The 202 goes to the *payer*. Hop 0 payer is the buyer; hop ≥1 payer is the seller daemon. The grant must ride `JobAssignment` over WSS, not the buyer's 202 (`JobAssignment` today is only `{jobId, skillId, skillVersion, input, timeoutSec}`).

**Broker:** `hire-broker.ts` already reads `x-job-id` / `x-job-token` (runner-local HMAC, `:107-142`). On `/hire` it attaches `x-arcade-hire` from the in-memory grant opened in `openJob` (`daemon.ts:217-226`). `packages/buyer/src/hire.ts:88-92` still sends `{skillId,input,maxAmountUsd}` on the Unix socket; the **hub** header is the broker's job.

**Hub at `POST /x/:seller/:skill` (`server.ts:770`):**
1. No header → root (`hop=0`, `rootJobId=new`, `ancestors=[]`). Honest: a hostile runner speaking raw `POST /x/` is a new customer (`docs/architecture.md:84`). T-SPEND-003 is the *automatic* loop (`docs/threat-model.md:181-188`).
2. Header present → verify MAC; `store.getJob(parentJobId)`; derive `rootJobId`, `hop = parent.hop+1`, `ancestors = parent.ancestors ∪ {parent.skillId}`. **Do not trust client `ancestors[]`.**
3. Refuse cycle if `listing.id ∈ ancestors` (409). Refuse if `hop >= 2` (default `ARCADE_MAX_HOP=2` exclusive; hops 0 and 1 only — today's real chain is depth 1).
4. On paid retry, reserve `parsePrice(listing.price)` against `rootJobId`: `reserved + committed + childPrice ≤ ceiling`, where `ceiling` is the **root listing's** `bounds.maxSubSpendUsd` (`counterparty-brief/arcade.json:18`, `wallet-risk-note/arcade.json:16`). Commit on settle; release on failure/expiry. A MAC'd remaining-cap scalar is racy (`hire-broker.ts:162-202` increments after await).
5. `putJob` persists derived lineage. Issue a child `hireGrant` if the child listing also has `hire-skills`.

**402 `accepts[].extra`:** advertise `{ settlement: "on-validated-output", hop, rootJobId }` next to OpenAPI (`openapi.ts:348-358`). Never put remaining cap in `PaymentRequirements.amount` (`types.ts:17`).

**Job** (`job.ts:58-68`) gains `parentJobId?`, `rootJobId`, `hop`, `ancestors: string[]`.

**Receipt** (`receipt.ts:16-58`) gains:

```
parentJobId?: string
rootJobId?: string     // = jobId on roots
hop: number            // 0 on roots
ancestors: string[]    // skillIds
childSettleTxs: { jobId, skillId, priceAtomic, settleTx?, settled }[]
authorizationNonce?: string   // echo EIP-3009 nonce for Settled matching; NOT keccak(lineage)
```

**Out of P0:** `nonce = keccak256(lineage || salt)` (`eip3009.ts:400-415` mints an unrelated nonce; EIP-3009 signs six fields, `types.ts:46-54`). A custom nonce is a dialect Circle CLI will not speak (`types.ts:60-64`). Completeness via a new `FeeSplitter` event is a contract project (seller is immutable, `packages/payments/src/rail.ts:19-26`).

---

## 3. ERC-8004 plan

Registries on Arc testnet (https://docs.arc.io/arc/tutorials/register-your-first-ai-agent): Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`, Validation `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`. **Do not call ValidationRegistry.**

**When / from which key**

| Call | Key | When |
|---|---|---|
| `IdentityRegistry.register(string agentURI)` | **Seller Hello key** (listing owner) | Once, on `arcade start` for **one** featured skill (`subgraph-brief`). `agentURI = ${HUB}/listings/subgraph-brief`. Persist `skillId → agentId` (ERC-721 `Transfer` tokenId). |
| `ReputationRegistry.giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)` | Distinct funded **`ARCADE_8004_ATTESTER`** (not owner/operator — EIP-8004 self-review ban; https://eips.ethereum.org/EIPS/eip-8004). Do not reuse the facilitator if it is ever an operator. | Best-effort **after** `receipt.settled` (`server.ts:728-730`). Failure must not undo settlement. |

Args: `agentId`, value=`1`, valueDecimals=`0`, tag1=`"arcade-settled"`, tag2=`skillId`, endpoint=`${HUB}/x/${seller}/${skillId}`, feedbackURI=`${HUB}/receipts/${jobId}` (JSON includes proof-of-payment `{fromAddress,toAddress,chainId,txHash:settleTx}`), feedbackHash=`keccak256(bytes(receiptJSON))`. Arc tutorial ABI names those string slots `tag/metadataURI/evidenceURI/comment`; the **signature** is `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)`.

**Display:** listing + `arcade_describe_skill` shows `agentId` and attester-filtered count, labeled **“ARCADE settlement evidence (`clientAddress == ARCADE_8004_ATTESTER`)”**. Optional ENSIP-25 `agent-registration[<ERC-7930 Arc IdentityRegistry>][<agentId>] = "1"` (https://docs.ens.domains/ensip/25/) only if this register shipped.

**It is NOT:** a score, a `getSummary` gate, a first-call cap, Sybil-resistant reputation (arXiv 2606.26028; EIP-8004 Security Considerations require trusted `clientAddresses`), or a substitute for never-broadcast. 0xdevair: a badge is not a receipt (https://x.com/0xdevair/status/2095411572663283938).

---

## 4. Graph plan + Agent0 stretch

**Prize path:** Base-mainnet x402 COGS. Graph x402 is Base-only (https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/); `testnet.gateway.thegraph.com` did not resolve on 2026-09-04 (`thegraph.md:229`). Continuity bar: load-bearing, live provider data, meaningful work, SKILL.md (`prizes-page-2026-09-04.txt:171-175`). Studio is an allowed provider (`:173`) — that does **not** make an unpublished Arc subgraph a replacement for “pay per query autonomously with x402” (`:120-121,161`).

**Pinned id (Base, 8453):** `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb` (Agent0, `thegraph.md:121`). Endpoint: `https://gateway.thegraph.com/api/x402/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`. SDK: `@graphprotocol/client-x402` `createGraphQuery({ endpoint, chain: 'base' })`.

**Pinned query** (schema from `thegraph.md:137-143`; do not discover this at paid-path runtime):

```graphql
query ArcadeCogs($first: Int = 25) {
  agentRegistrationFiles(where: { x402Support: true, active: true }, first: $first) {
    agentId name description mcpEndpoint x402Support ens supportedTrusts
  }
  feedbacks(first: 25, orderBy: createdAt, orderDirection: desc) {
    id clientAddress score tag1 tag2
    feedbackFile { proofOfPayment { txHash chainId fromAddress toAddress } }
  }
}
```

**Synthesis (script engine, like `wallet-risk-note`):** input `{ name?: string, agentId?: string }` → output `{ queriedAt, subgraphId, x402AgentCount, matchingAgents[], recentProofTxs[], verdict: "x402-present"|"no-x402-agents"|"unqueryable", notes[] }`. Not a GraphQL proxy.

**Failure → Arc non-settlement:** any of gateway 402 unpaid, timeout, empty/error GraphQL, or output missing required fields → `JobOutcome` `invalid`/`failed` → `shouldSettle` false (`job.ts:106-135`) → `pipeline.ts:136-138` never broadcasts. Seller may eat the Base $0.01. That is the load-bearing sentence.

**SKILL.md must contain:** name `subgraph-brief`; trigger; pinned subgraph id + the GraphQL document above; Keychain entry name for the Graph payer; “Graph hop fail ⇒ this Arc job does not settle”; “not a GraphQL proxy”; Base USDC `0x8335…2913`; “Graph x402 does not run on Arc.” Subgraph MCP (`search_subgraphs_by_keyword` → `get_schema_by_subgraph_id` at `https://subgraphs.mcp.thegraph.com/sse`) is **dev-time only**, mentioned in SKILL.md, not a paid-path dependency.

**Agent0 stretch gate:** 4 hours, after COGS is green. Success = Studio `arc-testnet` deploy syncs and a query returns `Registered`/`NewFeedback` for the featured agent. Then film one hub-filtered feedback read. Failure = cut with no Graph-prize damage. Do not wire `GET /listings` to it.

---

## 5. ENS plan

ENSv2 Sepolia only (`prizes-page-2026-09-04.txt:770`). Two parallel deployment sets — resolve `RootRegistry.getSubregistry("eth")` at runtime (`ens.md` §1.2). Prefer docs Set A so the ENS app shows the name (`ens.md:45-62`). `ETHRegistrar.available("arcade")` first; fallback label `arcade-hub`.

**Layout:** parent `arcade.eth` (or fallback) → seller UserRegistry → two skill subnames `subgraph-brief.<seller>.arcade.eth` and `wallet-risk-note.<seller>.arcade.eth`.

**Records (multicall):** `arcade.price`, `arcade.chain = eip155:5042002`, `arcade.payTo`, `agent-endpoint[web] = ${HUB}/x/<seller>/<skill>` (ENSIP-26, https://docs.ens.domains/ensip/26/). Optional `agent-context`. ENSIP-25 only if 8004 register shipped.

**Roles:** hub holds registrar. Daemon key gets `authorizeTextRoles(dnsName, "arcade.price", daemon, true)` **only** (`ens.md:654-664`; https://docs.ens.domains/ensv2/permissioned-resolver). Daemon cannot `setText` `arcade.payTo`.

**Two demo beats (not one):**
1. Grant → daemon updates price → revoke (`grant=false`) → next daemon `setText('arcade.price')` **reverts**. Existing `arcade.payTo` is unchanged; next Arc call still pays.
2. Tamper hub 402 `payTo` → buyer SDK `getEnsText` mismatch → refuse to sign.

**Delisting:** `unregister(labelhash(skill))` (`ens.md:668-670`), not role revoke. `unregister` is the “purchasing disabled” beat if you need one; it is not required for the prize if (1)+(2) are filmed.

---

## 6. Arc mainnet-readiness + Circle CLI / Gateway

Public mainnet Sep 16, **after** the Sunday deadline (https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026). Docs: mainnet addresses not yet published (https://docs.arc.io/arc/references/contract-addresses). Continuity Launch requires deployed or deployment-ready by Sep 30 (`prizes-page-2026-09-04.txt:517-543`).

**Config shape** (replace `as const` in `chain.ts:10-47`):

```
ARCADE_NETWORK=arc-testnet|arc-mainnet
{ chainId, caip2, rpcUrls[], explorer, usdc, usdcErc20Decimals: 6, usdcNativeDecimals: 18,
  eip712Name, eip712Version, gatewayWallet, gatewayDomain, gatewayFacilitatorUrl,
  pending: boolean }
```

Accept both `https://rpc.testnet.arc.network` (`chain.ts:15`) and `https://rpc.testnet.arc.io/` (https://docs.arc.io/arc/tutorials/deploy-node-as-service). Mainnet row ships with `pending: true` until Circle publishes.

**Boot checks:** `eth_chainId` matches; USDC `name()=="USDC"`, `version()=="2"`, `decimals()==6`; EIP-3009 probe; facilitator funded; `pending` → refuse start; `ARCADE_RAIL=gateway` + mainnet → refuse (Gateway is Arc-testnet-only, `arc-circle.md:181-190`).

**Runbook (`docs/mainnet-runbook.md`):** env table; faucet vs mainnet USDC (`native:true` rejected); dual-decimal warning (`chain.ts:19-26`); FeeSplitter redeploy per seller; `ARCADE_RAIL=eip3009|gateway`; **never** `waitForTransactionReceipt` (CLAUDE.md / `chain.ts:61-67`); Sep 16–30 checklist + smoke commands; “demo on testnet, push in the 17-day window.”

**Circle CLI vs Gateway — neither is P0.** **Opinion:** 3h box on day 2 after lineage is green: try `GatewayLive` first because the Arc rubric names Nanopayments (`prizes-page-2026-09-04.txt:440`) and the rail is code-complete (`gateway.ts`). If the facilitator refuses in 90 minutes, `circle services pay` as a third-party buyer (canonical payload already matched CLI, `types.ts:60-64`). If both fail, README one-liner: judged rail is EIP-3009; GatewayLive unproven; CLI is the wire-shape test. Agent Wallets are Arc-testnet-only (https://developers.circle.com/agent-stack/agent-wallets/supported-blockchains) — do not claim a mainnet Agent Wallet path.

---

## 7. Video (~3:35, ≥720p, human voice, no phone)

ETHGlobal rejects TTS, phone, <720p, >4 min (https://ethglobal.com/events/ethonline2026/info/details).

| t | Beat |
|---|---|
| 0:00–0:12 | “The only way to sell a skill today is to hand over your prompt and API key.” `arcade publish`; hub log has no `engine`/`secrets` (`packages/core/src/manifest.ts` `toPublicListing`). |
| 0:12–0:48 | **Failed job first.** Schema miss; unsettled receipt; Arcscan no tx; `balanceOf` identical. “We did not send money back. The charge never landed.” Orthogonal refunds after (https://x.com/casaisdev/status/2095591323269001474); Mars locks then releases (https://ethglobal.com/showcase/mars-ua1qc). |
| 0:48–1:10 | Success. EIP-3009 `0xc9b77c1e…` pattern; `x-arcade-payment.settlement: on-validated-output`. |
| 1:10–2:00 | Hire tree. Buyer pays `wallet-risk-note` ($0.05). Child Arc settle from **sub-buy wallet**, not the buyer. Receipt `childSettleTxs[]`. Open both txs. `A→B→A` 409. One sentence: hop 2 is seller working capital. |
| 2:00–2:40 | Graph COGS. `subgraph-brief` pays Agent0 on Base at $0.01 (`amount:10000`). Structured verdict. Kill Graph key → **no Arc settlement**. |
| 2:40–3:05 | ENS two beats: `setText` revert after revoke; buyer refuses tampered `payTo`. |
| 3:05–3:25 | Continuity + runbook. 112 commits 2026-07-25→08-07 vs this week. Flip after Sep 16, deployed by Sep 30. If 8004/Agent0 shipped: 5s of attester feedback, labeled evidence not score. |
| 3:25–3:35 | Diagram: verify → sandbox → validate → settle. |

**README structure**

```
## What existed before ETHOnline 2026
Encode × Circle Arc; 112 commits 2026-07-25 → 2026-08-07; live hub;
settle-on-success; toPublicListing secrecy; pull-model runner; hire broker
+ maxSubSpendUsd (per job, not per tree); EIP-3009 txs 0xc9b77c1e / 0x5eb961c0 / 0xf45de149;
FeeSplitter 0xf95c8afe…; ObjectiveStats; EIP-191 ratings.

## What is new (event-judged)
T-SPEND-003 hop grant + hub-derived lineage + tree_ledgers;
failed-job filmed evidence; subgraph-brief + Base x402 COGS + SKILL.md;
ENS payTo-lock + two-beat demo; ChainConfig + docs/mainnet-runbook.md;
[optional] Identity register + hub giveFeedback; [optional] Gateway or circle CLI.

## AI use
Attributed. Spec/plan artifacts in docs/ethonline-2026/.
```

---

## 8. Remaining disagreements

1. **vs Claude:** I still reject feeding Agent0/settled-feedback counts into `GET /listings` or a first-call cap (`r2-claude.md` Resolutions) — that is score-gating with extra steps; EIP-8004 itself tells callers not to use unfiltered `getSummary` (https://eips.ethereum.org/EIPS/eip-8004). Confidence **0.88**.
2. **vs Claude:** Gateway is leftover garnish, not the committed day-2 pillar (`r2-claude.md` C5) — Nanopayments is “where relevant” (`prizes-page-2026-09-04.txt:438-440`), and Gateway cannot be the Sep 30 mainnet rail (`arc-circle.md:181-190`). Confidence **0.82**.
3. **vs Codex:** I will not commit the Circle CLI buyer as a must-ship (`r2-codex.md` “Commit the Circle CLI buyer”) — `types.ts:60-64` already is the interop test; a second client is a 90-minute checkbox after lineage. Confidence **0.80**.
4. **vs Codex:** EIP-191 `hubReceiptSignature` is optional polish, not part of the two-day enforcement set (`r2-codex.md` “Add an EIP-191 hub signature over the canonical receipt tree”) — `GET /jobs/:id/result` is already token-gated (`server.ts:852-865`); enforcement is the MAC + store + ledger. Confidence **0.78**.

Converged with both: hub-derived ancestors; reservation ledger; no nonce-binding; no signed `quoteId`; ENS two-beat demo; ENS over World; 8004 write-not-read; Agent0 as 4h stretch; Graph prize = Base x402 COGS.
